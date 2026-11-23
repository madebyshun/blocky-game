// x402 HQ: Compact, wide 2-column Obsidian dark dashboard for BaseCity's x402 agent economy.
// Every settled event from /api/work-feed flies a drone from Blocky Street to x402 HQ.
import * as THREE from 'three';
import { makeDrone } from './fleet.js';
import { esc } from './names.js';
import { GUILDS } from './skills.js';
import { restoreWallet } from './wallet.js';
import { mountWorkerConsole } from './worker-console.js';
import { itemSprite } from './items.js';

const POLL_MS = 60000;
const BASESCAN_TX = ['https', '://basescan.org/tx/'].join('');
const usd = (v) => `$${(Number(v) || 0).toFixed(v >= 1 ? 2 : 3).replace(/0$/, '')}`;
const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
const key = (e) => `${e.at}:${e.kind}:${e.blocky}:${e.tx || ''}`;

export function eventLine(e) {
  const who = `Blocky #${e.blocky}`;
  if (e.kind === 'x402-sale') return `${who} sold ${esc(e.tool || 'research')}${e.ticker ? ` on ${esc(e.ticker)}` : ''} over x402 · ${usd(e.usd)}`;
  if (e.kind === 'job-paid') return `${who} got paid for a Blue Agent job · ${usd(e.usd)}`;
  if (e.kind === 'job-delivered') return `${who} delivered a report to Blue Agent`;
  return `${who} finished research${e.title ? `: ${esc(e.title)}` : ''}`;
}

export function createWorkHQ(city, { log = () => {}, from = () => null, crew = () => [], feed = '/api', onOpenTasks = null } = {}) {
  const seen = new Set();
  let data = null, first = true;
  let activeTab = 'overview'; // 'overview' | 'worker' | 'feed' | 'services'
  let wallet = null;
  let selectedBlockyId = null;
  let workerApi = null;
  const flights = [];

  function label(text, color = '#0052ff') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = color; g.beginPath(); g.roundRect(4, 8, 248, 48, 14); g.fill();
    g.fillStyle = '#fff'; g.font = '800 26px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 33);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    sp.scale.set(2.6, 0.65, 1); sp.renderOrder = 6;
    return sp;
  }
  const hq = () => city.built.find((b) => b.type === 'hq-x402');

  function fly(e) {
    const to = hq();
    if (!to) return;
    const start = from() || { x: to.x + 18, z: to.z + 18 };
    const d = makeDrone(); d.scale.setScalar(1.6);
    const gd = GUILDS[e.guild];
    const tag = label(e.usd ? `+${usd(e.usd)} · #${e.blocky}` : `#${e.blocky} delivered`, gd?.color); tag.position.y = 1.2; d.add(tag);
    const top = (to.h || 6) + 3;
    d.position.set(start.x, top, start.z);
    city.root.add(d);
    flights.push({ d, a: new THREE.Vector3(start.x, top, start.z), b: new THREE.Vector3(to.x, top, to.z), t: 0, dur: 6 });
  }

  async function load() {
    try {
      const r = await fetch(`${feed}/work-feed`, { cache: 'no-store' });
      if (!r.ok) return;
      data = await r.json();
      const fresh = (data.events || []).filter((e) => !seen.has(key(e))).reverse();
      for (const e of fresh) {
        seen.add(key(e));
        if (first) continue;
        log(eventLine(e));
        fly(e);
      }
      first = false;
      if (!panel.hidden && activeTab !== 'worker') draw();
    } catch { /* offline */ }
  }

  function update(_t, dt) {
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      f.t += dt / f.dur;
      const u = Math.min(1, f.t);
      f.d.position.lerpVectors(f.a, f.b, u * u * (3 - 2 * u));
      f.d.position.y += Math.sin(u * Math.PI) * 2;
      for (const r of f.d.children) if (r.scale?.x === 0.5) r.rotation.y += dt * 40;
      if (f.t >= 1.4) { city.root.remove(f.d); flights.splice(i, 1); }
    }
  }

  const panel = document.createElement('div');
  panel.className = 'td-wrap'; panel.hidden = true;
  document.body.appendChild(panel);
  panel.addEventListener('click', (e) => {
    if (e.target === panel || e.target.closest('.td-x')) { close(); return; }
    const tab = e.target.closest('[data-whqtab]')?.dataset.whqtab;
    if (tab && tab !== activeTab) { activeTab = tab; draw(); return; }
    const taskTarget = e.target.closest('[data-whq-task]')?.dataset.whqTask;
    if (taskTarget && onOpenTasks) { close(); onOpenTasks(taskTarget); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); e.stopPropagation(); close(); } });

  function ownedBlockies() {
    const addr = wallet?.address?.toLowerCase();
    if (!addr) return [];
    return (crew() || []).filter((b) => b.kind === 'blocky' && !Number.isFinite(b.leftAt) && b.from?.toLowerCase() === addr);
  }

  function mountWorkerTab() {
    const slot = panel.querySelector('#whq-worker-slot');
    if (!slot) return;
    if (!wallet?.address) {
      slot.innerHTML = `<p class="lp-desc">Connect your Base wallet in the top bar (<b>Connect Wallet</b>) to configure your autonomous Blocky Worker directly inside BaseCity.</p>`;
      return;
    }
    const mine = ownedBlockies();
    if (!selectedBlockyId && mine.length) selectedBlockyId = mine[0].id;
    slot.innerHTML = `
      <div class="whq-wk-pick">
        <label>Active Blocky NFT
          ${mine.length
            ? `<select id="whq-wk-sel">${mine.map((b) => `<option value="${b.id}"${b.id === selectedBlockyId ? ' selected' : ''}>${esc(b.name)} (#${b.id})</option>`).join('')}</select>`
            : `<input id="whq-wk-id" type="number" min="1" max="10000" value="${selectedBlockyId || ''}" placeholder="Enter claimed Blocky #ID" />`}
        </label>
        <a class="btn td-copy" href="/claim.html" target="_blank" rel="noopener">Claim / Link ERC-8004</a>
      </div>
      <div id="whq-wk-console" class="whq-wk-console"></div>`;
    const sel = slot.querySelector('#whq-wk-sel');
    if (sel) sel.onchange = () => { selectedBlockyId = Number(sel.value) || null; workerApi?.refresh?.(); };
    const idInp = slot.querySelector('#whq-wk-id');
    if (idInp) idInp.oninput = () => { selectedBlockyId = Number(idInp.value) || null; workerApi?.refresh?.(); };

    const consoleEl = slot.querySelector('#whq-wk-console');
    workerApi = mountWorkerConsole(
      consoleEl,
      () => ({ account: wallet?.address || null, provider: wallet?.provider || null, tokenId: selectedBlockyId }),
      () => { close(); onOpenTasks?.('board'); },
    );
  }

  function draw() {
    const d = data || { today: {}, leaders: [], events: [], services: [], guilds: [] };
    const t = d.today || {};

    const overviewHtml = `
      <div class="whq-2col">
        <div>
          <div class="gm-sec-title">GUILDS (7 DAYS)</div>
          <div class="whq-guilds-v2">${Object.entries(GUILDS).map(([id, g]) => {
            const r = (d.guilds || []).find((x) => x.guild === id);
            return `<div class="whq-gcard" style="border-left-color:${g.color}"><b>${esc(g.label)}</b><span>${r ? `${usd(r.earnedUsd)} · ${r.calls} paid` : 'No paid calls yet'}</span></div>`;
          }).join('')}</div>
        </div>
        <div>
          <div class="gm-sec-title">TOP EARNING BLOCKIES (7 DAYS)</div>
          ${(d.leaders || []).length
            ? `<div class="whq-lead-v2">${d.leaders.slice(0, 8).map((l, idx) => `<div class="whq-lrow"><span class="whq-rank">#${idx + 1}</span><b>Blocky #${l.blocky}</b><small>${l.calls} calls · ${l.jobs} jobs</small><em>${usd(l.earnedUsd)}</em></div>`).join('')}</div>`
            : '<p class="lp-desc">No paid x402 work recorded yet this week.</p>'}
        </div>
      </div>`;

    const workerHtml = `<div id="whq-worker-slot" class="whq-worker-slot"></div>`;

    const feedHtml = `
      <div class="whq-feed-v2">${(d.events || []).slice(0, 12).map((e) => `
        <div class="whq-erow">
          <span>${eventLine(e)}</span>
          <em>${ago(e.at)}${e.tx ? ` · <a href="${BASESCAN_TX}${esc(e.tx)}" target="_blank" rel="noopener">Basescan</a>` : ''}</em>
        </div>`).join('') || '<p class="lp-desc">Waiting for the next settled x402 call on Base.</p>'}</div>`;

    const servicesHtml = `
      <div class="whq-svc-grid">${(d.services || []).map((s) => `
        <div class="whq-scard">
          <div class="whq-scard-top"><b>${esc(s.id)}</b><span>$${Number(s.priceUsd || 0).toFixed(2)} USDC</span></div>
          <p>${esc(s.task)}</p>
        </div>`).join('') || '<p class="lp-desc">Loading callable x402 services...</p>'}</div>`;

    panel.innerHTML = `<div class="td whq-v2" role="dialog" aria-label="x402 HQ">
      <div class="td-head">
        ${itemSprite('poi-x402', 38)}
        <div class="td-title"><b>X402 HQ</b><span>BaseCity agent economy · Auto Worker &amp; settled USDC on Base</span></div>
        <button class="td-x" title="Close (Esc)">Close</button>
      </div>
      <div class="whq-stats-v2">
        <div><span>Earned Today</span><b>${usd(t.earnedUsd)}</b></div>
        <div><span>x402 Calls</span><b>${t.calls || 0}</b></div>
        <div><span>Jobs Paid</span><b>${t.jobsPaid || 0}</b></div>
        <div><span>Delivered</span><b>${t.delivered || 0}</b></div>
      </div>
      <div class="lp-seg" style="margin:12px 0;flex-wrap:wrap">
        <button type="button" class="lp-seg-btn${activeTab === 'overview' ? ' on' : ''}" data-whqtab="overview">Overview &amp; Leaders</button>
        <button type="button" class="lp-seg-btn${activeTab === 'worker' ? ' on' : ''}" data-whqtab="worker">Blocky Worker (Auto)</button>
        <button type="button" class="lp-seg-btn${activeTab === 'feed' ? ' on' : ''}" data-whqtab="feed">Live x402 Feed</button>
        <button type="button" class="lp-seg-btn${activeTab === 'services' ? ' on' : ''}" data-whqtab="services">x402 Services (${(d.services || []).length})</button>
      </div>
      <div class="whq-body">${activeTab === 'overview' ? overviewHtml : activeTab === 'worker' ? workerHtml : activeTab === 'feed' ? feedHtml : servicesHtml}</div>
      <div class="td-actions" style="margin-top:14px">
        <button type="button" class="btn td-go" data-whq-task="board">Open Task Board</button>
        <button type="button" class="btn td-copy" data-whq-task="analyst">Blocky Analyst (x402)</button>
        <a class="btn td-copy" href="/docs" target="_blank" rel="noopener">Docs</a>
        <a class="btn td-copy" href="/flywheel" target="_blank" rel="noopener">Flywheel</a>
      </div>
      <div class="td-foot">Settled on Base via Coinbase CDP x402 facilitator · 100% self-custody.</div>
    </div>`;
    if (activeTab === 'worker') mountWorkerTab();
  }
  function open(tab = '') {
    if (tab) activeTab = tab;
    restoreWallet().then((w) => {
      wallet = w || null;
      if (!panel.hidden && activeTab === 'worker') mountWorkerTab();
    });
    draw();
    panel.hidden = false;
    load();
  }
  function close() { panel.hidden = true; }

  load();
  setInterval(load, POLL_MS);
  return { update, open, close, load, get data() { return data; } };
}
