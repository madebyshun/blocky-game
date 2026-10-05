// The claim page: connect the wallet that bought $BLOCKY, see its Blockies, claim them as NFTs.
// The API signs what the ledger says the wallet owns; the wallet sends the claim and pays the gas.
import { encodeFunctionData, getAddress, isAddress } from 'viem';
import { CONFIG } from './config.js';
import { CLAIM_ABI } from '../api/_sig.js';
import { makeBlocky, TRAIT_LABEL } from './sim.js';
import { lazyPortrait } from './portraits.js';
import { browserWallets, onWallets, smartWallet, connect, sendTx, waitTx, rejected } from './wallet.js';
import { mountSite, fmt, basescan, opensea, esc, nftInfo } from './site.js';
import { fetchColony } from './data.js';

mountSite('claim');
const $ = (id) => document.getElementById(id);
for (const el of document.querySelectorAll('.tk')) el.textContent = CONFIG.ticker;
for (const el of document.querySelectorAll('.supply')) el.textContent = fmt(CONFIG.supply);

let info = { open: false, contract: null, live: false, unlocked: false };
let provider = null; // the connected wallet
let account = null; // its address
let viewing = null; // the address on screen (connected or looked up)
let busy = false;

function status() {
  const s = $('status');
  if (!info.live) {
    s.className = 'note';
    s.textContent = 'Live data is not reachable here, so wallets can\'t be checked yet. Claims work on the live BaseCity site.';
  } else if (info.open) {
    s.className = 'note ok';
    s.innerHTML = `${info.unlocked ? 'The collection is unlocked: Blockies trade freely now. ' : 'Claims are open. '}You pay the gas, a few cents on Base. ${info.contract ? `<a href="${opensea(info.contract)}" target="_blank" rel="noopener">BaseCity Blockies on OpenSea ↗</a>` : ''}`;
  } else {
    s.className = 'note';
    s.textContent = `Claims open soon. Every Blocky your wallet brings is saved in the ledger: keep holding ${CONFIG.ticker} and claim here when the contract goes live.`;
  }
}

// ---------- wallets ----------

function renderWallets() {
  const box = $('wallets');
  box.innerHTML = '';
  const add = (label, sub, icon, pick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wallet';
    b.innerHTML = `${icon}<span>${esc(label)}${sub ? `<br><small>${esc(sub)}</small>` : ''}</span>`;
    b.onclick = pick;
    box.appendChild(b);
  };
  for (const w of browserWallets()) {
    const icon = w.icon && /^data:image\/|^https:\/\//.test(w.icon) ? `<img src="${esc(w.icon)}" alt="" />` : '<span class="ic plain"></span>';
    add(w.name, null, icon, () => use(w.provider));
  }
  add('Coinbase Smart Wallet', 'Base App, passkeys', '<span class="ic"></span>', async () => {
    try { use(await smartWallet(CONFIG.cityName, `${location.origin}/favicon.svg`)); } catch (e) { say(`Couldn't open Coinbase Wallet: ${e.message}`, 'bad'); }
  });
}

async function use(p) {
  try {
    const a = await connect(p);
    provider = p;
    account = getAddress(a);
    p.on?.('accountsChanged', (accs) => {
      if (accs?.[0]) { account = getAddress(accs[0]); show(account); } else { provider = account = null; render(null); }
    });
    await show(account);
  } catch (e) {
    if (!rejected(e)) say(`Couldn't connect: ${e.shortMessage || e.message}`, 'bad');
  }
}

$('lookup').onsubmit = (e) => {
  e.preventDefault();
  const a = $('addr').value.trim();
  if (!isAddress(a, { strict: false })) { $('addr').setCustomValidity('Enter a 0x address'); $('addr').reportValidity(); return; }
  $('addr').setCustomValidity('');
  show(getAddress(a));
};
$('addr').oninput = () => $('addr').setCustomValidity('');
$('switch').onclick = () => {
  provider = account = viewing = null;
  $('mine').hidden = true;
  $('connect').hidden = false;
  $('addr').value = '';
};

// ---------- the wallet's Blockies ----------

let mine = null;
function say(html, tone = '') {
  const m = $('claim-msg');
  m.className = `claim-msg ${tone}`;
  m.innerHTML = html;
}

async function show(address) {
  viewing = address;
  $('mine').hidden = false;
  $('connect').hidden = Boolean(account);
  $('who').textContent = address;
  $('who').href = basescan(`address/${address}`);
  $('claim').disabled = true;
  $('claim').textContent = 'Claim';
  say('Loading…');
  try {
    if (!info.live) throw new Error('Live data is not reachable here');
    const res = await fetch(`/api/claim?address=${address}`, { cache: 'no-store' });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    if (viewing !== address) return;
    mine = j;
    render(j);
  } catch (e) {
    mine = null;
    render(null);
    say(esc(e.message), 'bad');
  }
}

function tile(entry, gone) {
  const b = makeBlocky(entry.n, entry.at, viewing, entry.seed);
  const el = document.createElement('a');
  el.className = `tile${gone ? ' gone' : ''}`;
  el.href = `/collection.html#${b.id}`;
  el.innerHTML = `<div class="pic"><img alt="${esc(b.name)}" width="256" height="256" /></div>
    <div class="info"><div class="name">${esc(b.name)}</div>
    <div class="sub"><span class="rarity ${b.rarity.id}">${b.rarity.label}</span><span>${b.trait ? esc(TRAIT_LABEL[b.trait]) : ''}</span></div></div>
    <span class="flag ${gone ? 'gone' : entry.claimed ? 'ok' : ''}">${gone ? 'Left' : entry.claimed ? 'Claimed ✓' : 'To claim'}</span>`;
  lazyPortrait(el.querySelector('img'), b);
  return el;
}

function render(j) {
  const list = j?.blockies || [], left = j?.left || [];
  const claimed = list.filter((x) => x.claimed).length, unclaimed = list.length - claimed;
  const per = j?.usdPerBlocky || CONFIG.usdPerBlocky, usd = j?.boughtUsd || 0;
  const toNext = per - (usd % per);
  $('mystats').innerHTML = !j ? '' : [
    [`${CONFIG.citizenPlural} in the city`, fmt(list.length)],
    ['Claimed', fmt(claimed)],
    ['To claim', fmt(unclaimed)],
    ...(j.waiting ? [['Waiting for a place', fmt(j.waiting)]] : []),
    ...(left.length ? [['Left the city', fmt(left.length)]] : []),
    ['Bought', `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small class="line">next ${CONFIG.citizen} in $${toNext.toFixed(2)}</small>`],
  ].map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');

  const tiles = $('tiles'), gone = $('gone');
  tiles.innerHTML = '';
  gone.innerHTML = '';
  for (const x of list) tiles.appendChild(tile(x, false));
  for (const x of left) gone.appendChild(tile(x, true));
  $('gone-title').hidden = !left.length;
  if (j && !list.length) tiles.innerHTML = `<p class="empty-mine">No ${CONFIG.citizenPlural} for this wallet yet. Every $${per} of ${CONFIG.ticker} it buys brings one${CONFIG.buyUrl ? `: <a href="${CONFIG.buyUrl}" target="_blank" rel="noopener">buy ${CONFIG.ticker}</a>` : ''}.</p>`;

  const btn = $('claim');
  const mineNow = account && viewing && account.toLowerCase() === viewing.toLowerCase();
  const n = Math.min(50, unclaimed);
  btn.textContent = n ? `Claim ${n} ${n > 1 ? CONFIG.citizenPlural : CONFIG.citizen}` : 'Claim';
  btn.disabled = busy || !j || !info.open || !mineNow || !n;
  if (!j) return;
  if (!info.open) say('Claims open soon: these Blockies stay saved for this wallet while it holds.');
  else if (!n) say(list.length ? `All claimed ✓ ${info.contract ? `<a href="${opensea(info.contract)}" target="_blank" rel="noopener">See the collection ↗</a>` : ''}` : '', list.length ? 'ok' : '');
  else if (!mineNow) say('Connect this wallet to claim. Only the wallet that brought a Blocky can claim it.');
  else say(unclaimed > 50 ? `Claims go 50 at a time: ${fmt(unclaimed)} to claim.` : 'Ready. You pay the gas.');
}

async function claim() {
  if (busy || !account || !provider) return;
  busy = true;
  $('claim').disabled = true;
  try {
    say('Signing your claim…');
    const res = await fetch('/api/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: account }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    const data = encodeFunctionData({ abi: CLAIM_ABI, functionName: 'claim', args: [j.ids.map(BigInt), j.evict.map(BigInt), BigInt(j.deadline), j.signature] });
    say('Confirm in your wallet…');
    const hash = await sendTx(provider, { from: account, to: j.contract, data });
    say(`Claiming ${j.ids.length} ${j.ids.length > 1 ? CONFIG.citizenPlural : CONFIG.citizen}… <a href="${basescan(`tx/${hash}`)}" target="_blank" rel="noopener">View on Basescan ↗</a>`);
    const done = await waitTx(hash, provider);
    busy = false;
    await show(account);
    if (done.ok) say(`Claimed ${j.ids.length} ${j.ids.length > 1 ? CONFIG.citizenPlural : CONFIG.citizen}! <a href="${opensea(j.contract)}" target="_blank" rel="noopener">See them on OpenSea ↗</a>${j.more ? ` · ${fmt(j.more)} more to claim` : ''}`, 'ok');
    else if (done.ok === false) say(`The transaction failed. <a href="${basescan(`tx/${hash}`)}" target="_blank" rel="noopener">Details ↗</a>`, 'bad');
    else say(`Still confirming. <a href="${basescan(`tx/${hash}`)}" target="_blank" rel="noopener">Check Basescan ↗</a>`);
  } catch (e) {
    busy = false;
    if (rejected(e)) { say('Cancelled.'); render(mine); return; }
    say(esc(e.shortMessage || e.message || String(e)), 'bad');
    $('claim').disabled = false;
  }
}
$('claim').onclick = claim;

(async () => {
  onWallets(renderWallets);
  renderWallets();
  fetchColony().catch(() => null); // also brings the ledger up to date with the latest buys
  info = await nftInfo();
  status();
  const q = new URLSearchParams(location.search).get('address');
  if (q && isAddress(q, { strict: false })) show(getAddress(q));
})();
