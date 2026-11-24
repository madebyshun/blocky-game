// BaseCity Stock Intel Desk (x402 Pay-to-Unlock client for Blocky 10).
// Lets Blocky Analysts publish stock theses/signals and lets traders unlock them via gasless x402 EIP-3009 USDC signatures.
import { toHex } from 'viem';
import { esc } from './names.js';
import { payRequirement, chooseRequirement, providerSigner } from './x402.js';
import { intelMessage } from './signed.js';

const LOCAL_KEY = 'basecity:stock-intel:v1';
const UNLOCKED_KEY = 'basecity:stock-intel-unlocked:v1';

function readLocal() {
  try {
    const j = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}

function writeLocal(items) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, 100))); } catch { /* ignore */ }
}

function readUnlocked() {
  try { return JSON.parse(localStorage.getItem(UNLOCKED_KEY) || '{}') || {}; } catch { return {}; }
}

function saveUnlocked(id, fullReport) {
  try {
    const m = readUnlocked();
    m[id] = fullReport;
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify(m));
  } catch { /* ignore */ }
}

const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

export async function fetchStockIntel(ticker = '') {
  const qs = ticker ? `?ticker=${encodeURIComponent(ticker)}` : '';
  try {
    const r = await fetch(`/api/stock-intel${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      const j = await r.json();
      if (Array.isArray(j.items)) {
        if (!ticker) writeLocal(j.items);
        return j.items;
      }
    }
  } catch { /* fallback local */ }
  const all = readLocal();
  return ticker ? all.filter((x) => x.ticker === ticker) : all;
}

export async function publishStockIntel({ provider, account, blockyName, ticker, stance, title, preview, fullReport, priceUsdc }) {
  if (!provider || !account) throw new Error('Connect your Base wallet first.');
  const payload = { author: account, blockyName, ticker, stance, title, preview, fullReport, priceUsdc: Number(priceUsdc) };
  payload.issuedAt = new Date().toISOString();
  payload.signature = await provider.request({ method: 'personal_sign', params: [toHex(intelMessage(payload, payload.issuedAt)), account] });
  try {
    const r = await fetch('/api/stock-intel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if ((r.headers.get('content-type') || '').includes('json')) {
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j.error || 'The intel desk refused this report.'), { refused: true });
      if (j.item) {
        saveUnlocked(j.item.id, j.item.fullReport);
        const { fullReport: _f, ...pub } = j.item;
        writeLocal([pub, ...readLocal().filter((x) => x.id !== pub.id)]);
        return j.item;
      }
    }
  } catch (err) { if (err.refused) throw err; /* offline: keep a local copy */ }

  const item = {
    id: `intel-${Date.now().toString(36)}`,
    ticker,
    stance,
    title: String(title).trim(),
    preview: String(preview).trim(),
    fullReport: String(fullReport).trim(),
    priceUsdc: Math.round(Number(priceUsdc) * 100) / 100,
    author: account.toLowerCase(),
    blockyName: blockyName || 'Blocky Analyst',
    createdAt: Date.now(),
    unlocks: 0,
    earnedUsdc: 0,
  };
  saveUnlocked(item.id, item.fullReport);
  writeLocal([item, ...readLocal()]);
  return item;
}

export async function unlockStockIntel({ provider, account, item, onStatus }) {
  const cached = readUnlocked()[item.id];
  if (cached) return { unlocked: true, fullReport: cached };
  if (!provider || !account) throw new Error('Connect your Base wallet to pay via x402.');

  // Step 1: Request protected resource (expect HTTP 402 Payment Required)
  onStatus?.('Requesting x402 payment terms...');
  const url = `/api/stock-intel?id=${encodeURIComponent(item.id)}`;
  const r1 = await fetch(url, { cache: 'no-store' }).catch(() => null);
  if (r1?.ok) {
    const j = await r1.json();
    if (j.item?.fullReport) {
      saveUnlocked(item.id, j.item.fullReport);
      return { unlocked: true, fullReport: j.item.fullReport };
    }
  }

  let requirement = null;
  if (r1?.status === 402) {
    const j402 = await r1.json().catch(() => ({}));
    requirement = chooseRequirement(j402.accepts || []);
  }
  if (!requirement) {
    requirement = {
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: String(Math.round(Number(item.priceUsdc || 0.1) * 1e6)),
      payTo: item.author,
      maxTimeoutSeconds: 300,
      extra: { name: 'USD Coin', version: '2', assetTransferMethod: 'eip3009' },
    };
  }

  // Step 2: Sign gasless EIP-3009 USDC authorization (x402 v2)
  onStatus?.(`Sign $${Number(item.priceUsdc).toFixed(2)} USDC x402 authorization (0 gas)...`);
  const headerVal = await payRequirement({
    requirement,
    from: account,
    resource: url,
    signTypedData: providerSigner(provider, account),
  });

  // Step 3: Retry with PAYMENT-SIGNATURE header
  onStatus?.('Verifying x402 signature & unlocking intel...');
  const r2 = await fetch(url, {
    cache: 'no-store',
    headers: { 'PAYMENT-SIGNATURE': headerVal },
  }).catch(() => null);

  if (r2?.ok) {
    const j2 = await r2.json();
    const report = j2.item?.fullReport || item.fullReport || '';
    saveUnlocked(item.id, report);
    return { unlocked: true, fullReport: report };
  }

  // Local fallback if preview server doesn't host /api/stock-intel yet
  const localItem = readLocal().find((x) => x.id === item.id);
  if (localItem?.fullReport) {
    saveUnlocked(item.id, localItem.fullReport);
    return { unlocked: true, fullReport: localItem.fullReport };
  }
  const errBody = await r2?.json().catch(() => ({}));
  throw new Error(errBody?.error || 'Could not unlock intel right now. Nothing was charged.');
}

export function renderStockIntelHtml({ items, selectedTicker, account, showForm, busyMsg }) {
  const unlocked = readUnlocked();
  const me = (account || '').toLowerCase();
  return `
    <div class="si-top">
      <span class="lp-lbl">x402 Stock Intel (${esc(selectedTicker || 'All')})</span>
      <button type="button" class="btn small-pill" id="si-toggle-pub">${showForm ? 'Back to Feed' : 'Publish Intel'}</button>
    </div>
    ${busyMsg ? `<div class="lp-msg">${esc(busyMsg)}</div>` : ''}
    ${showForm ? `
      <form id="si-pub-form" class="lp-form" style="margin-top:8px">
        <div class="lp-grid">
          <label class="lp-field"><span class="lp-lbl">Stance</span>
            <select name="stance"><option value="BULLISH">BULLISH</option><option value="NEUTRAL">NEUTRAL</option><option value="BEARISH">BEARISH</option></select>
          </label>
          <label class="lp-field"><span class="lp-lbl">x402 Unlock Price (USDC)</span>
            <input name="priceUsdc" type="number" min="0.05" max="25" step="0.05" value="0.25" required />
          </label>
        </div>
        <label class="lp-field"><span class="lp-lbl">Headline</span>
          <input name="title" required minlength="4" maxlength="100" placeholder="e.g. NVDAc DEX spread vs NAV & Base whale flow" />
        </label>
        <label class="lp-field"><span class="lp-lbl">Public Preview (free)</span>
          <textarea name="preview" rows="2" required minlength="10" maxlength="280" style="width:100%;padding:8px 10px;border-radius:4px;border:1px solid #262a33;background:#0d0e11;color:#f5f7fb;font:600 12.5px Inter,sans-serif" placeholder="Hook traders with what they'll learn..."></textarea>
        </label>
        <label class="lp-field"><span class="lp-lbl">Locked Full Thesis (HTTP 402 Pay-to-Unlock)</span>
          <textarea name="fullReport" rows="4" required minlength="20" maxlength="4000" style="width:100%;padding:8px 10px;border-radius:4px;border:1px solid #262a33;background:#0d0e11;color:#f5f7fb;font:600 12.5px Inter,sans-serif" placeholder="Exact thesis, entry levels, Base pool notes, catalysts..."></textarea>
        </label>
        <button type="submit" class="btn td-go">Sign & Publish ${esc(selectedTicker)} x402 Intel</button>
      </form>
    ` : `
      <div class="si-list">
        ${items.length ? items.map((it) => {
          const full = unlocked[it.id] || (me && it.author === me ? it.fullReport : null);
          return `<div class="si-card">
            <div class="si-head">
              <div>
                <span class="si-stance ${it.stance.toLowerCase()}">${esc(it.stance)}</span>
                <span class="tm-cat">${esc(it.ticker)}</span>
                <b>${esc(it.title)}</b>
                <small>By ${esc(it.blockyName)} (${esc(shortAddr(it.author))}) · ${it.unlocks || 0} unlocks</small>
              </div>
              <span class="tm-bounty">$${Number(it.priceUsdc).toFixed(2)}</span>
            </div>
            <p class="tm-brief">${esc(it.preview)}</p>
            ${full
              ? `<div class="si-unlocked"><div class="gm-sec-title">UNLOCKED ALPHA</div><p>${esc(full)}</p></div>`
              : `<button type="button" class="btn primary small-pill" style="margin-top:8px" data-si-unlock="${esc(it.id)}">Unlock via x402 ($${Number(it.priceUsdc).toFixed(2)} USDC · 0 gas)</button>`}
          </div>`;
        }).join('') : `<p class="lp-desc">No x402 intel published for ${esc(selectedTicker)} yet. Click <b>Publish Intel</b> to earn USDC when traders unlock your thesis.</p>`}
      </div>
    `}
  `;
}
