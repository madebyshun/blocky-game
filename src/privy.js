// Privy Embedded Wallet & Social Auth (X / Twitter, Google, Gmail / Email OTP) for BaseCity.
// Lazy-loads @privy-io/js-sdk-core so initial bundle stays lean until Privy is configured/used.
const RETURN_PLAY_KEY = 'basecity:privy:return_play';

let privyClient = null;
let privySdk = null;
let initPromise = null;
let iframeEl = null;
let msgListener = null;
let oauthCallbackPromise = null;
let lastPrivyError = '';

function getPrivyConfig() {
  const appId = (import.meta.env?.VITE_PRIVY_APP_ID || '').trim();
  const clientId = (import.meta.env?.VITE_PRIVY_CLIENT_ID || '').trim();
  return { appId, clientId };
}

export function privyConfigured() {
  return Boolean(getPrivyConfig().appId);
}

export function consumeLastPrivyError() {
  const e = lastPrivyError;
  lastPrivyError = '';
  return e;
}

export function shouldResumePlayAfterPrivy() {
  try {
    if (sessionStorage.getItem(RETURN_PLAY_KEY) === '1') {
      sessionStorage.removeItem(RETURN_PLAY_KEY);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

async function ensurePrivy() {
  const { appId, clientId } = getPrivyConfig();
  if (!appId) {
    throw new Error('Privy is not configured yet. Add VITE_PRIVY_APP_ID to .env and restart Vite.');
  }
  if (privyClient) return privyClient;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const mod = await import('@privy-io/js-sdk-core');
    privySdk = mod;
    const Privy = mod.default;
    const { LocalStorage } = mod;
    const opts = { appId, storage: new LocalStorage() };
    if (clientId) opts.clientId = clientId;
    if (mod.base) opts.supportedChains = [mod.base];
    const client = new Privy(opts);
    await client.initialize();

    if (typeof document !== 'undefined' && !iframeEl) {
      iframeEl = document.createElement('iframe');
      iframeEl.style.display = 'none';
      iframeEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframeEl);

      // Wire up message poster & listener BEFORE setting iframe.src so privy:iframe:ready is never missed.
      let readyResolve = null;
      const readyPromise = new Promise((resolve) => {
        readyResolve = resolve;
        setTimeout(resolve, 3500);
      });

      if (iframeEl.contentWindow) {
        client.setMessagePoster(iframeEl.contentWindow);
        msgListener = (e) => {
          if (!iframeEl || e.source !== iframeEl.contentWindow) return;
          try {
            const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            if (data?.event === 'privy:iframe:ready' && readyResolve) {
              readyResolve();
              readyResolve = null;
            }
            client.embeddedWallet.onMessage(data);
          } catch { /* ignore non-JSON messages */ }
        };
        window.addEventListener('message', msgListener);
      }

      iframeEl.src = client.embeddedWallet.getURL();
      await readyPromise;
    }

    privyClient = client;
    return client;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

function userLabel(user) {
  const accs = Array.isArray(user?.linked_accounts) ? user.linked_accounts : [];
  const tw = accs.find((a) => a.type === 'twitter_oauth');
  if (tw?.username) return `X @${tw.username}`;
  const go = accs.find((a) => a.type === 'google_oauth');
  if (go?.email) return `Google (${go.email})`;
  const em = accs.find((a) => a.type === 'email');
  if (em?.address) return em.address;
  return 'Privy Wallet';
}

function wrapEmbeddedProvider(rawProvider, address) {
  return {
    isPrivy: true,
    async request(args) {
      const method = args?.method;
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
        return [address];
      }
      return rawProvider.request(args);
    },
    on: rawProvider.on?.bind(rawProvider),
    removeListener: rawProvider.removeListener?.bind(rawProvider),
  };
}

async function sessionToWallet(client, user) {
  if (!user) return null;
  const { getUserEmbeddedEthereumWallet, getEntropyDetailsFromUser } = privySdk;
  let u = user;
  let wallet = getUserEmbeddedEthereumWallet(u);
  if (!wallet) {
    const created = await client.embeddedWallet.create({});
    u = created?.user || (await client.user.get())?.user || u;
    wallet = getUserEmbeddedEthereumWallet(u);
  }
  if (!wallet?.address) throw new Error('Could not provision Privy embedded wallet.');
  const entropy = getEntropyDetailsFromUser(u, wallet) || getEntropyDetailsFromUser(u);
  if (!entropy?.entropyId) throw new Error('Missing Privy wallet entropy details.');
  const rawProvider = await client.embeddedWallet.getEthereumProvider({
    wallet,
    entropyId: entropy.entropyId,
    entropyIdVerifier: entropy.entropyIdVerifier,
  });
  const provider = wrapEmbeddedProvider(rawProvider, wallet.address);
  return {
    address: wallet.address,
    provider,
    user: u,
    name: userLabel(u),
  };
}

export async function handlePrivyOAuthCallback() {
  if (typeof window === 'undefined' || !privyConfigured()) return null;
  if (oauthCallbackPromise) return oauthCallbackPromise;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('privy_oauth_code');
  const state = params.get('privy_oauth_state');
  const provider = params.get('privy_oauth_provider') || undefined;
  if (!code || !state) return null;

  // Strip OAuth params immediately so a second call or refresh cannot reuse the single-use code.
  params.delete('privy_oauth_code');
  params.delete('privy_oauth_state');
  params.delete('privy_oauth_provider');
  const nextQuery = params.toString();
  const cleanUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', cleanUrl);

  oauthCallbackPromise = (async () => {
    try {
      const client = await ensurePrivy();
      const session = await client.auth.oauth.loginWithCode(code, state, provider);
      return await sessionToWallet(client, session?.user);
    } catch (err) {
      lastPrivyError = err?.message || String(err);
      console.warn('[Privy OAuth callback failed]', err);
      throw err;
    }
  })();

  return oauthCallbackPromise;
}

export async function restorePrivySession() {
  if (typeof window === 'undefined' || !privyConfigured()) return null;
  try {
    const client = await ensurePrivy();
    const { user } = await client.user.get();
    if (!user) return null;
    return await sessionToWallet(client, user);
  } catch (err) {
    console.warn('[Privy session restore failed]', err);
    return null;
  }
}

export async function loginWithPrivyOAuth(providerName, { returnToPlay = true } = {}) {
  const client = await ensurePrivy();
  if (returnToPlay) {
    try { sessionStorage.setItem(RETURN_PLAY_KEY, '1'); } catch { /* ignore */ }
  }
  const redirectURI = `${window.location.origin}${window.location.pathname}`;
  const res = await client.auth.oauth.generateURL(providerName, redirectURI);
  const oauthURL = typeof res === 'string' ? res : res?.url;
  if (!oauthURL) throw new Error('Privy did not return an OAuth redirect URL.');
  window.location.assign(oauthURL);
}

export async function sendPrivyEmailCode(email) {
  const clean = String(email || '').trim();
  if (!clean || !clean.includes('@')) throw new Error('Enter a valid email address.');
  const client = await ensurePrivy();
  await client.auth.email.sendCode(clean);
}

export async function verifyPrivyEmailCode(email, code) {
  const cleanEmail = String(email || '').trim();
  const cleanCode = String(code || '').trim();
  if (!cleanEmail || !cleanCode) throw new Error('Enter both your email and 6-digit code.');
  const client = await ensurePrivy();
  const session = await client.auth.email.loginWithCode(cleanEmail, cleanCode);
  return sessionToWallet(client, session?.user);
}

export async function logoutPrivy() {
  oauthCallbackPromise = null;
  if (!privyClient) return;
  try {
    const { user } = await privyClient.user.get();
    if (user?.id) await privyClient.auth.logout({ userId: user.id });
  } catch { /* ignore */ }
  if (msgListener) {
    window.removeEventListener('message', msgListener);
    msgListener = null;
  }
  if (iframeEl) {
    iframeEl.remove();
    iframeEl = null;
  }
  privyClient = null;
  initPromise = null;
}
