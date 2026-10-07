// The claim page: connect the wallet that bought $BLOCKY, see its Blockies, claim its citizens as NFTs
// (a Blocky is a newcomer for its first `citizenDays` days in the city). The API signs what the ledger
// says the wallet owns; the wallet sends the claim and pays the gas.
import { encodeFunctionData, getAddress, isAddress } from 'viem';
import { CONFIG, holdText } from './config.js';
import { CLAIM_ABI } from '../api/_sig.js';
import { makeBlocky, TRAIT_LABEL } from './sim.js';
import { lazyPortrait } from './portraits.js';
import { browserWallets, onWallets, smartWallet, connect, sendTx, waitTx, rejected } from './wallet.js';
import { PRICING } from './pricing.js';
import { mountSite, fmt, basescan, opensea, esc, nftInfo } from './site.js';
import { fetchColony } from './data.js';

mountSite('claim');
const $ = (id) => document.getElementById(id);
for (const el of document.querySelectorAll('.tk')) el.textContent = CONFIG.ticker;
for (const el of document.querySelectorAll('.supply')) el.textContent = fmt(CONFIG.supply);

let info = { open: false, contract: null, live: false, unlockUsd: CONFIG.unlockUsd, bought: null, openedAt: null, citizenDays: CONFIG.citizenDays, claimed: null, max: CONFIG.supply };
const when = (ms) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const until = (ms) => { const h = (ms - Date.now()) / 3600e3; return h > 48 ? `${Math.ceil(h / 24)}d` : h >= 1 ? `${Math.ceil(h)}h` : `${Math.max(1, Math.ceil(h * 60))}m`; };
const dollars = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const held = () => holdText(info.citizenDays);
let provider = null; // the connected wallet
let account = null; // its address
let viewing = null; // the address on screen (connected or looked up)
let market = null; // { floor, ethUsd, live, days, lowWarn } (OpenSea, from the API)
let busy = false;

// "1,234 / 10,000 claimed · 8,766 left" (the contract's totalSupply), when the chain could be read
const count = () => (info.claimed == null ? '' : `<span class="count"><b>${fmt(info.claimed)}</b> / ${fmt(info.max)} claimed · <b>${fmt(Math.max(0, info.max - info.claimed))}</b> left</span> `);

// earning a Blocky next to what one sells for: real numbers only (no floor yet says so)
function deal() {
  const el = $('deal'), m = info.market;
  el.hidden = !(info.live && info.open);
  if (el.hidden) return;
  const usd = (v) => (m?.ethUsd ? `~$${Math.round(v * m.ethUsd)}` : '');
  el.innerHTML = [
    `<div class="d"><span class="k">Earn a Blocky</span><b>$${m?.perUsd ?? CONFIG.usdPerBlocky} of ${CONFIG.ticker}</b><small>hold it ${held()}, claim for a few cents of gas. You keep the tokens.</small></div>`,
    m?.floor ? `<div class="d"><span class="k">Floor on OpenSea</span><b>${eth(m.floor)}</b><small>${usd(m.floor)} for the cheapest Blocky listed</small></div>`
      : `<div class="d"><span class="k">Floor on OpenSea</span><b>No floor yet</b><small>the first listings set the price</small></div>`,
    m?.topOffer ? `<div class="d"><span class="k">Sell instantly</span><b>${eth(m.topOffer)}</b><small>${usd(m.topOffer)}, the best offer for any Blocky</small></div>` : '',
  ].join('');
}

function status() {
  deal();
  const s = $('status');
  const sea = info.contract ? `<a href="${opensea(info.contract)}" target="_blank" rel="noopener">BaseCity Blockies on OpenSea ↗</a>` : '';
  if (!info.live) {
    s.className = 'note';
    s.textContent = 'Live data is not reachable here, so wallets can\'t be checked yet. Claims work on the live BaseCity site.';
  } else if (info.open) {
    s.className = 'note ok';
    s.innerHTML = info.openedAt
      ? `${count()}<b>Claims are open.</b> Every Blocky held ${held()} is a citizen: claim it here as an NFT, free to trade at once. You pay the gas, a few cents on Base. ${sea}`
      : info.bought != null && info.bought < info.unlockUsd
        ? `<b>Trading opens at ${dollars(info.unlockUsd)} of ${CONFIG.ticker} bought: ${dollars(info.bought)} so far.</b> Then every Blocky held ${held()} becomes an NFT you claim here, free to trade at once. Until then, hold: sellers' Blockies leave the city.`
        : `<b>Claims open in a minute or so</b>, at the ledger's next update. Every Blocky held ${held()} becomes an NFT you claim here, free to trade at once.`;
  } else {
    s.className = 'note';
    s.textContent = `Claims open soon. Every Blocky your wallet brings is saved in the ledger: keep holding ${CONFIG.ticker} while they're newcomers, and claim your citizens here when the contract goes live.`;
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

const BASENAME = /^[^\s/?#]{1,64}\.base\.eth$/i;
$('lookup').onsubmit = (e) => {
  e.preventDefault();
  const a = $('addr').value.trim();
  if (!isAddress(a, { strict: false }) && !BASENAME.test(a)) { $('addr').setCustomValidity('Enter a 0x address or a name.base.eth'); $('addr').reportValidity(); return; }
  $('addr').setCustomValidity('');
  show(isAddress(a, { strict: false }) ? getAddress(a) : a.toLowerCase());
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
    const res = await fetch(`/api/claim?address=${encodeURIComponent(address)}`, { cache: 'no-store' });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    if (viewing !== address) return;
    viewing = j.address; // a Basename looked up: the wallet it points to
    $('who').textContent = j.name ? `${j.name} · ${j.address.slice(0, 6)}…${j.address.slice(-4)}` : j.address;
    $('who').href = basescan(`address/${j.address}`);
    mine = j;
    render(j);
  } catch (e) {
    mine = null;
    render(null);
    say(esc(e.message), 'bad');
  }
}

const citizenNow = (entry) => entry.citizenAt != null && entry.citizenAt <= Date.now();
const mineNow = () => Boolean(account && viewing && account.toLowerCase() === viewing.toLowerCase());
// ETH with as many decimals as it needs (0.0055, 0.033, 1.2), and roughly in USD
const eth = (v) => `${Number(v.toPrecision(2))} ETH`;
const usdOf = (v) => (market?.ethUsd ? ` <small>~$${Math.round(v * market.ethUsd)}</small>` : '');
// the market line under a Blocky: its listing (with a warning when the price is well under what it's
// worth now), or a suggested price and a link to list it on OpenSea
function priceLine(entry) {
  if (!info.contract || (entry.suggested == null && entry.listed == null)) return '';
  const link = (text) => `<a class="mk-act" href="${opensea(info.contract, entry.n)}" target="_blank" rel="noopener">${text}</a>`;
  if (entry.listed != null) {
    const low = entry.suggested != null && entry.listed < entry.suggested * (market?.lowWarn ?? 0.75);
    return low
      ? `<div class="mk warn">⚠ Listed ${eth(entry.listed)}, worth ~${eth(entry.suggested)} now ${mineNow() ? `<button class="mk-act mk-list" type="button" data-n="${entry.n}">Relist</button>` : link('Update ↗')}</div>`
      : `<div class="mk ok">Listed ${eth(entry.listed)}${usdOf(entry.listed)} ${link('View ↗')}</div>`;
  }
  if (entry.claimed) return `<div class="mk">Suggested ${eth(entry.suggested)}${usdOf(entry.suggested)} ${mineNow() ? `<button class="mk-act mk-list" type="button" data-n="${entry.n}">List</button>` : link('List ↗')}</div>`;
  return citizenNow(entry) ? `<div class="mk dim">Worth ~${eth(entry.suggested)} once claimed</div>` : '';
}

function tile(entry, gone) {
  const b = makeBlocky(entry.n, entry.at, viewing, entry.seed);
  const el = document.createElement('div');
  el.className = `tile${gone ? ' gone' : ''}`;
  el.innerHTML = `<a class="tile-link" href="/collection.html#${b.id}"><div class="pic"><img alt="${esc(b.name)}" width="256" height="256" /></div>
    <div class="info"><div class="name">${esc(b.name)}</div>
    <div class="sub"><span class="rarity ${b.rarity.id}">${b.rarity.label}</span><span>${b.trait ? esc(TRAIT_LABEL[b.trait]) : ''}</span></div></div>
    <span class="flag ${gone ? 'gone' : entry.claimed ? 'ok' : citizenNow(entry) ? 'claim' : ''}">${gone ? 'Left' : entry.claimed ? 'Claimed ✓' : citizenNow(entry) ? 'To claim' : entry.citizenAt == null ? 'Newcomer' : `Citizen in ${until(entry.citizenAt)}`}</span></a>${gone ? '' : priceLine(entry)}`;
  lazyPortrait(el.querySelector('img'), b);
  return el;
}

function render(j) {
  market = j?.market || null;
  const list = j?.blockies || [], left = j?.left || [];
  const claimed = list.filter((x) => x.claimed).length;
  const claimable = list.filter((x) => !x.claimed && citizenNow(x)).length;
  const lowListed = list.filter((x) => x.listed != null && x.suggested != null && x.listed < x.suggested * (market?.lowWarn ?? 0.75)).length;
  const newcomers = list.filter((x) => !citizenNow(x));
  const nextCitizen = Math.min(...newcomers.map((x) => x.citizenAt ?? Infinity)); // Infinity: on opening day
  const price = j?.price || CONFIG.usdPerBlocky, usd = j?.boughtUsd || 0;
  const toNext = j?.toNext ?? price;
  $('mystats').innerHTML = !j ? '' : [
    [`${CONFIG.citizenPlural} in the city`, fmt(list.length)],
    ['Newcomers', newcomers.length ? `${fmt(newcomers.length)} <small class="line">${Number.isFinite(nextCitizen) ? `next citizen ${when(nextCitizen)}` : (j.openedAt ? 'next citizen soon' : 'NFTs when claims open')}</small>` : '0'],
    ['Claimed', fmt(claimed)],
    ['To claim', fmt(claimable)],
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
  if (j && !list.length) tiles.innerHTML = `<p class="empty-mine">No ${CONFIG.citizenPlural} for this wallet yet. Every $${price} of ${CONFIG.ticker} it buys brings one${CONFIG.buyUrl ? `: <a href="${CONFIG.buyUrl}" target="_blank" rel="noopener">buy ${CONFIG.ticker}</a>` : ''}.</p>`;

  const toList = list.filter((x) => x.claimed && x.listed == null && x.suggested != null);
  const all = $('list-all');
  all.hidden = !(mineNow() && toList.length && info.contract);
  all.textContent = toList.length > 1 ? `List ${fmt(Math.min(toList.length, MAX_LIST))} on OpenSea` : 'List on OpenSea';
  all.disabled = busy;

  const btn = $('claim');
  const isMine = mineNow();
  const n = Math.min(50, claimable);
  btn.textContent = n ? `Claim ${n} ${n > 1 ? CONFIG.citizenPlural : CONFIG.citizen}` : 'Claim';
  btn.disabled = busy || !j || !info.open || !isMine || !n;
  if (!j) return;
  if (!info.open) say('Claims open soon: these Blockies stay saved for this wallet while it holds.');
  else if (!n && newcomers.length) say(Number.isFinite(nextCitizen)
    ? `${claimed ? 'Every citizen claimed ✓ ' : ''}Next citizen ${when(nextCitizen)}: keep holding ${CONFIG.ticker} until then, or newcomers leave the city.`
    : `Your Blockies become NFTs when claims open, in a minute or so. Keep holding ${CONFIG.ticker}: sellers' Blockies leave the city.`);
  else if (!n && lowListed) say(`⚠ ${fmt(lowListed)} of your listings ${lowListed > 1 ? 'are' : 'is'} well under what ${lowListed > 1 ? 'they are' : 'it is'} worth at today's floor. Raise the price on OpenSea before someone buys cheap.`, 'bad');
  else if (!n) say(list.length ? `All claimed ✓ Suggested prices follow the OpenSea floor and each Blocky's rarity. List for ${market?.days ?? 7} days: an old price expires instead of getting sniped. ${info.contract ? `<a href="${opensea(info.contract)}" target="_blank" rel="noopener">See the collection ↗</a>` : ''}` : '', list.length ? 'ok' : '');
  else if (!isMine) say('Connect this wallet to claim. Only the wallet that brought a Blocky can claim it.');
  else say(claimable > 50 ? `Claims go 50 at a time: ${fmt(claimable)} to claim.` : 'Ready. You pay the gas.');
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
    const data = encodeFunctionData({ abi: CLAIM_ABI, functionName: 'claim', args: [j.ids.map(BigInt), BigInt(j.deadline), j.signature] });
    say('Confirm in your wallet…');
    const hash = await sendTx(provider, { from: account, to: j.contract, data });
    say(`Claiming ${j.ids.length} ${j.ids.length > 1 ? CONFIG.citizenPlural : CONFIG.citizen}… <a href="${basescan(`tx/${hash}`)}" target="_blank" rel="noopener">View on Basescan ↗</a>`);
    const done = await waitTx(hash, provider);
    busy = false;
    await show(account);
    if (done.ok) say(`Claimed ${j.ids.length} ${j.ids.length > 1 ? CONFIG.citizenPlural : CONFIG.citizen}! ${j.more ? `${fmt(j.more)} more to claim. ` : ''}Hold them, or list them at the suggested prices: <b>List on OpenSea</b>.`, 'ok');
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
  else if (q && BASENAME.test(q)) show(q.toLowerCase()); // ?address=name.base.eth
})();

// ---------- listing on OpenSea, from here ----------

const MAX_LIST = 50; // per signature
let listing = []; // what the dialog is about to list: [{ n, name, eth }]
const fixed = (v) => Number(v).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');

function openList(entries) {
  listing = entries.slice(0, MAX_LIST).map((x) => ({ n: x.n, name: makeBlocky(x.n, x.at, viewing, x.seed).name, eth: x.suggested }));
  $('ld-title').textContent = listing.length > 1 ? `List ${listing.length} Blockies on OpenSea` : `List ${listing[0].name} on OpenSea`;
  $('ld-rows').innerHTML = listing.map((x, i) => `<label class="ld-row"><span>${esc(x.name)}</span><input type="number" min="0.0001" step="0.0001" value="${fixed(x.eth)}" data-i="${i}" /> ETH</label>`).join('');
  $('ld-days').value = String(market?.days ?? PRICING.days);
  $('list-dlg').showModal();
}

async function doList() {
  const prices = [...$('ld-rows').querySelectorAll('input')].map((el) => Number(el.value));
  if (prices.some((p) => !(p > 0))) return say('Every price must be above 0.', 'bad');
  const floorish = market?.floor || null;
  if (floorish && prices.some((p) => p < floorish * 0.5) && !confirm('Some prices are under half the floor. List anyway?')) return;
  const items = listing.map((x, i) => ({ n: x.n, eth: fixed(prices[i]) }));
  busy = true;
  render(mine);
  try {
    say('Loading OpenSea… then approve the collection if asked (once), and sign the listing.');
    const { listOnOpenSea } = await import('./listing.js');
    const r = await listOnOpenSea({ provider, account, contract: info.contract, items, days: Number($('ld-days').value) || 7, onProgress: (d, t) => say(`Listing on OpenSea… ${d}/${t}`) });
    for (const x of mine?.blockies || []) { const it = items.find((i) => i.n === x.n); if (it && r.listed.includes(x.n)) x.listed = Number(it.eth); }
    busy = false;
    render(mine);
    say(`Listed ${fmt(r.listed.length)} on OpenSea ✓ <a href="${opensea(info.contract)}" target="_blank" rel="noopener">See the collection ↗</a>${r.failed.length ? ` · ${fmt(r.failed.length)} failed: ${esc(r.failed[0].error)}` : ''}`, r.failed.length ? 'bad' : 'ok');
  } catch (e) {
    busy = false;
    render(mine);
    say(rejected(e) ? 'Cancelled.' : esc(e.shortMessage || e.message || String(e)), rejected(e) ? '' : 'bad');
  }
}

$('list-dlg').addEventListener('close', () => { if ($('list-dlg').returnValue === 'go') doList(); });
$('list-all').onclick = () => {
  const list = (mine?.blockies || []).filter((x) => x.claimed && x.listed == null && x.suggested != null);
  if (list.length) openList(list);
};
$('tiles').addEventListener('click', (e) => {
  const b = e.target.closest('.mk-list');
  if (!b || busy) return;
  e.preventDefault();
  const x = (mine?.blockies || []).find((y) => y.n === Number(b.dataset.n));
  if (x) openList([x]);
});
