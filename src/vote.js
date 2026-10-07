// The citizens' vote page: the round's choices with the live count, and a vote signed in the wallet
// (1 BaseCity Blockies NFT = 1 vote; api/vote.js checks the signature and who holds what).
import { getAddress, toHex } from 'viem';
import { CONFIG } from './config.js';
import { ROUND, voteMessage } from './votes.js';
import { browserWallets, onWallets, smartWallet, connect, rejected } from './wallet.js';
import { mountSite, fmt, esc } from './site.js';

mountSite('vote');
const $ = (id) => document.getElementById(id);
let state = null, mine = null, provider = null, account = null, busy = false;

const say = (html, cls = '') => { $('msg').className = `vote-msg ${cls}`; $('msg').innerHTML = html; };
function left(ends) {
  const ms = Date.parse(ends) - Date.now();
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3600e3), d = Math.floor(h / 24);
  return d >= 1 ? `${d}d ${h % 24}h left` : h >= 1 ? `${h}h left` : `${Math.max(1, Math.ceil(ms / 60e3))}m left`;
}

function render() {
  const r = state?.round || ROUND;
  if (!r) { $('question').textContent = 'No vote is running right now'; return; }
  $('title').textContent = r.title || 'Citizens vote';
  $('question').textContent = r.question;
  const total = state?.total ?? 0, open = state ? state.round.open : Date.now() < Date.parse(r.ends);
  $('meta').innerHTML = `<span><b>${fmt(total)}</b> ${total === 1 ? 'vote' : 'votes'}</span><span>${open ? left(r.ends) : 'Ended'}</span>${mine ? `<span>Your wallet: <b>${fmt(mine.ids.length)}</b> ${mine.ids.length === 1 ? 'vote' : 'votes'}</span>` : ''}`;
  const myChoice = mine?.ids.length ? Object.values(mine.votes).find(Boolean) : null;
  $('choices').innerHTML = r.choices.map((c) => {
    const n = state?.tally?.[c.id] ?? 0, pct = total ? Math.round((n / total) * 100) : 0;
    const lead = state?.leader === c.id && total > 0;
    const can = open && account && mine?.ids.length && !busy;
    return `<div class="choice${lead ? ' lead' : ''}${myChoice === c.id ? ' mine' : ''}" style="--c:${esc(c.color || '#0052ff')}">
      <div class="bar" style="width:${pct}%"></div>
      <div class="row"><div><div class="name">${esc(c.label)}${lead ? ' <span class="tag">Leading</span>' : ''}${myChoice === c.id ? ' <span class="tag you">Your vote</span>' : ''}</div><div class="tl">${esc(c.tagline || '')}</div></div>
      <div class="num"><b>${pct}%</b><small>${fmt(n)}</small></div>
      ${open ? `<button class="btn${can ? ' primary' : ''}" data-choice="${esc(c.id)}" type="button" ${can ? '' : 'disabled'}>Vote</button>` : ''}</div>
    </div>`;
  }).join('');
  if (!open && state?.leader) $('status').innerHTML = `<b>The round has ended.</b> ${esc(r.choices.find((c) => c.id === state.leader)?.label || '')} won with ${fmt(state.tally[state.leader])} votes: it's next in the city plan.`;
  else $('status').innerHTML = `<b>${esc(r.title)}:</b> 1 BaseCity Blockies NFT = 1 vote. ${open ? `Voting closes ${new Date(r.ends).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.` : ''}`;
  $('status').className = 'note ok';
}

async function load() {
  const q = account ? `?address=${account}` : '';
  const res = await fetch(`/api/vote${q}`, { cache: 'no-store' });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  state = j;
  mine = j.mine || null;
  render();
}

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
    try { use(await smartWallet(CONFIG.cityName, `${location.origin}/favicon.svg`)); } catch (e) { say(`Couldn't open Coinbase Wallet: ${esc(e.message)}`, 'bad'); }
  });
}

async function use(p) {
  try {
    account = getAddress(await connect(p));
    provider = p;
    p.on?.('accountsChanged', (accs) => { account = accs?.[0] ? getAddress(accs[0]) : null; load().catch(() => {}); });
    await load();
    say(mine?.ids.length
      ? `Connected: <b>${fmt(mine.ids.length)}</b> BaseCity Blockies ${mine.ids.length === 1 ? 'NFT' : 'NFTs'} = ${fmt(mine.ids.length)} ${mine.ids.length === 1 ? 'vote' : 'votes'}. Pick one above.`
      : `This wallet holds no BaseCity Blockies NFTs yet. <a href="/claim.html">Claim yours</a> to vote.`, mine?.ids.length ? 'ok' : '');
  } catch (e) {
    if (!rejected(e)) say(`Couldn't connect: ${esc(e.shortMessage || e.message)}`, 'bad');
  }
}

async function vote(choice) {
  if (busy || !account || !provider) return;
  busy = true;
  render();
  try {
    const time = new Date().toISOString();
    const message = voteMessage({ choice, address: account, time });
    say('Sign your vote in your wallet (free, no transaction)…');
    const signature = await provider.request({ method: 'personal_sign', params: [toHex(message), account] });
    say('Counting…');
    const res = await fetch('/api/vote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: account, choice, time, signature }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    busy = false;
    await load();
    const label = state.round.choices.find((c) => c.id === choice)?.label || choice;
    say(`Voted ✓ ${fmt(j.counted)} ${j.counted === 1 ? 'vote' : 'votes'} for <b>${esc(label)}</b>. ${CONFIG.xHandle ? `<a href="https://x.com/intent/tweet?text=${encodeURIComponent(`I voted for ${label} as the next build in ${CONFIG.cityName} 🏙 Holders of BaseCity Blockies pick what the city builds next. @${CONFIG.xHandle}\n${CONFIG.siteUrl || location.origin}/vote.html`)}" target="_blank" rel="noopener">Share on 𝕏 ↗</a>` : ''}`, 'ok');
  } catch (e) {
    busy = false;
    render();
    say(rejected(e) ? 'Cancelled.' : esc(e.shortMessage || e.message || String(e)), rejected(e) ? '' : 'bad');
  }
}

$('choices').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-choice]');
  if (b && !b.disabled) vote(b.dataset.choice);
});
onWallets(renderWallets);
renderWallets();
render();
load().catch((e) => { $('status').className = 'note'; $('status').textContent = `Live votes are not reachable here (${e.message}).`; });
setInterval(() => { if (!busy) load().catch(() => {}); }, 30e3);
