// /agents: My Blockies at work. One page for an owner's whole fleet: what it earned, the one-time setup
// (an agent per Blocky, all on duty, the worker running), reports waiting for review, every Blocky with
// its agent and earnings, and the services they sell. Claiming and listing stay on /claim.
import { getAddress } from 'viem';
import { CONFIG } from './config.js';
import { mountSite, esc, fmt } from './site.js';
import { browserWallets, onWallets, smartWallet, connect, rejected } from './wallet.js';
import { mountAgentLink } from './agent-link-ui.js';
import { mountWorkerConsole } from './worker-console.js';
import { mountWorkBoard } from './work-board.js';
import { makeBlocky, TRAIT_LABEL } from './sim.js';
import { profileOf, GUILDS, SKILLS, priceUnits } from './skills.js';
import { setPrice, setPayout } from './blockyagent.js';
import { toHex } from 'viem';

mountSite('agents');
const $ = (id) => document.getElementById(id);
const usd = (v) => `$${(Number(v) || 0).toFixed(2)}`;
let provider = null, account = null, blockies = [], links = {}, agents = {}, linkPanel = null, worker = null, board = null, profiles = {}, rows = [];

function say(t, tone = '') { $('ag-msg').textContent = t; $('ag-msg').className = `ag-msg ${tone}`; }

function renderWallets() {
  const box = $('ag-wallets'); box.innerHTML = '';
  const add = (label, sub, icon, pick) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'wallet'; b.innerHTML = `${icon}<span>${esc(label)}${sub ? `<br><small>${esc(sub)}</small>` : ''}</span>`; b.onclick = pick; box.appendChild(b); };
  for (const w of browserWallets()) add(w.name, null, w.icon && /^data:image\/|^https:\/\//.test(w.icon) ? `<img src="${esc(w.icon)}" alt="" />` : '<span class="ic plain"></span>', () => use(w.provider));
  add('Coinbase Smart Wallet', 'Base App, passkeys', '<span class="ic"></span>', async () => { try { use(await smartWallet(CONFIG.cityName, `${location.origin}/favicon.svg`)); } catch (e) { say(e.message, 'bad'); } });
}

async function use(p) {
  try {
    account = getAddress(await connect(p)); provider = p;
    p.on?.('accountsChanged', (a) => { if (a?.[0]) { account = getAddress(a[0]); load(); } });
    await load();
  } catch (e) { if (!rejected(e)) say(`Couldn't connect: ${e.shortMessage || e.message}`, 'bad'); }
}

const json = (u) => fetch(u, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));

async function load() {
  say('Loading your Blockies…');
  const [claim, link, ag] = await Promise.all([json(`/api/claim?address=${account}`), json(`/api/agent-link?owner=${account}`), json(`/api/agent?address=${account}`)]);
  rows = (claim.blockies || []).filter((b) => b.claimed);
  blockies = rows.map((b) => b.n).sort((a, b) => a - b);
  links = Object.fromEntries((link.links || []).map((l) => [l.blocky, l]));
  agents = ag.agents || {};
  const po = Object.values(agents).find((x) => x.payout)?.payout; if (po) $('ag-payout').value = po;
  // each Blocky's specialization, from the same NFT traits the server reads (src/skills.js)
  profiles = Object.fromEntries(rows.map((b) => { const k = makeBlocky(b.n, b.at, null, b.seed); const e = agents[b.n] || {}; return [b.n, { ...profileOf(b.n, { Role: k.role.label, Rarity: k.rarity.label, Trait: k.trait ? TRAIT_LABEL[k.trait] : 'None' }, (e.soldCalls || 0) + (e.jobsPaid || 0)), mult: e.priceMult || 1 }]; }));
  $('ag-connect').hidden = true; $('ag-main').hidden = false; say('');
  if (!blockies.length) { $('ag-sum').innerHTML = `<p class="ag-note">This wallet has no claimed Blockies yet. <a href="/claim">Claim them first →</a></p>`; return; }
  render();
}

function render() {
  const own = blockies.filter((n) => links[n]?.via === 'onchain-register').length;
  const on = blockies.filter((n) => agents[n]?.active !== false && agents[n]).length;
  const calls = blockies.reduce((s, n) => s + (agents[n]?.soldCalls || 0), 0), sold = blockies.reduce((s, n) => s + (agents[n]?.soldUsdc || 0), 0);
  $('ag-sum').innerHTML = `<div><b>${fmt(blockies.length)}</b><span>Blockies</span></div><div><b>${fmt(own)}</b><span>with their own agent</span></div><div><b>${fmt(on)}</b><span>on duty</span></div><div><b>${fmt(calls)}</b><span>x402 calls sold</span></div><div><b>${usd(sold)}</b><span>earned over x402</span></div>`;

  // setup: three steps, done ones ticked; the whole box folds away once all three are done
  const steps = [[own === blockies.length, `Give each Blocky its own ERC-8004 agent (${own}/${blockies.length})`], [on === blockies.length, `Put every Blocky on duty (${on}/${blockies.length})`], [null, 'Start the worker below, so your Blockies pick up Blue Agent jobs']];
  const doneAll = steps[0][0] && steps[1][0];
  $('ag-steps').textContent = doneAll ? 'done ✓' : `${steps.filter((s) => s[0]).length}/2 done`;
  $('ag-steplist').innerHTML = steps.map(([d, t]) => `<li class="${d ? 'done' : ''}">${d ? '✓ ' : ''}${esc(t)}</li>`).join('');
  $('ag-setup').classList.toggle('folded', doneAll);
  linkPanel ||= mountAgentLink($('ag-link'), () => ({ account, provider, blockies }));
  linkPanel.refresh();

  worker ||= mountWorkerConsole($('ag-worker'), () => ({ account, provider, tokenId: blockies[0] }), (item, settings) => { $('ag-adv-open')?.click(); document.querySelector('.ag-adv').open = true; return board.useDraft(item, settings); });
  worker.refresh();
  board ||= mountWorkBoard($('ag-board'), () => ({ account, provider, tokenId: blockies[0] }));
  board.refresh();

  const by = {}; for (const n of blockies) { const g = profiles[n]?.guild || 'market'; by[g] = (by[g] || 0) + 1; }
  $('ag-guilds').innerHTML = Object.entries(by).map(([g, c]) => `<span style="border-color:${GUILDS[g]?.color || '#0052ff'}">${GUILDS[g]?.icon || '👑'} ${esc(GUILDS[g]?.label || 'All')} · ${c}</span>`).join('');
  drawFleet();
}
$('ag-payout-set').addEventListener('click', async () => {
  const v = $('ag-payout').value.trim() || account;
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) { $('ag-payout-msg').textContent = 'Enter a 0x wallet address.'; return; }
  try { $('ag-payout-msg').textContent = 'Sign in your wallet…'; const j = await setPayout({ address: account, tokenIds: blockies, payout: v, sign: (m) => provider.request({ method: 'personal_sign', params: [toHex(m), account] }) }); $('ag-payout-msg').textContent = j.payout ? `x402 sales of ${j.set.length} Blockies now pay ${j.payout}.` : `x402 sales pay your own wallet again.`; }
  catch (e) { $('ag-payout-msg').textContent = e?.code === 4001 ? 'Cancelled.' : String(e.message).slice(0, 200); }
});
$('ag-price-set').addEventListener('click', async () => {
  const mult = Number($('ag-price').value);
  try { $('ag-price-msg').textContent = 'Sign in your wallet…'; const j = await setPrice({ address: account, tokenIds: blockies, mult, sign: (m) => provider.request({ method: 'personal_sign', params: [toHex(m), account] }) }); for (const n of j.priced) profiles[n].mult = mult; $('ag-price-msg').textContent = `Set ×${mult} on ${j.priced.length} Blockies (each capped by its level).`; drawFleet(); }
  catch (e) { $('ag-price-msg').textContent = e?.code === 4001 ? 'Cancelled.' : String(e.message).slice(0, 200); }
});

function drawFleet() {
  const q = $('ag-filter').value.trim().replace(/^#/, '');
  const list = blockies.filter((n) => !q || String(n).includes(q) || String(links[n]?.agentId || '').includes(q) || (profiles[n]?.guild || '').includes(q.toLowerCase()) || (profiles[n]?.skills || []).some((k) => k.includes(q.toLowerCase())));
  $('ag-fleet').innerHTML = list.map((n) => {
    const l = links[n], a = agents[n];
    const id = l?.agentId;
    const p = profiles[n], g = GUILDS[p?.guild] || { icon: '👑', label: 'All' };
    return `<tr><td><a href="/b/${n}">Blocky #${n}</a></td><td title="${esc(p?.role || '')} · ${esc(p?.rarity || '')}${p?.trait ? ` · ${esc(p.trait)}` : ''}">${g.icon} ${esc(g.label)}</td><td class="ag-skills">${(p?.skills || []).map((k) => `<span title="${esc(SKILLS[k].task)}">${esc(k)} $${(priceUnits(k, p, p.mult) / 1e6).toFixed(3).replace(/0$/, '')}</span>`).join('')}</td><td>${p?.level || 1}</td><td>${id ? `#${esc(id)}${l.via === 'owner-signature' ? ' <small>shared</small>' : ''}` : '<small>none</small>'}</td><td>${a ? '<span class="ag-on">● on duty</span>' : '<small>off</small>'}</td><td>${fmt(a?.soldCalls || 0)}</td><td>${usd(a?.soldUsdc || 0)}</td><td class="ag-acts">${id ? `<a href="/api/agent-card?blocky=${n}" target="_blank" rel="noopener">Card</a><a href="https://app.blueagent.dev/exchange/agent/${esc(id)}#hire" target="_blank" rel="noopener">Hire ↗</a>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="9">No Blocky matches.</td></tr>';
}
$('ag-filter').addEventListener('input', drawFleet);
document.addEventListener('basecity-agents-changed', () => account && load());

json('/api/x402').then((c) => { $('ag-svc').innerHTML = (c.tools || []).map((t) => `<li><b>${esc(t.id)}</b><span>${esc(t.task)}</span><em>${usd(t.priceUsd)}</em></li>`).join(''); });
renderWallets();
onWallets(renderWallets);
