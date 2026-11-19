// x402 HQ: where the Blockies' paid work shows up in the city. Every real event from /api/work-feed (an
// x402 call that settled, a job delivered, a job payment verified on chain) sends a drone from Blocky
// Street to the x402 HQ on Base Avenue with the amount above it, and writes a line in the city log. The
// HQ popup (city menu → x402 HQ) shows today's earnings, the hardest-working Blockies, the latest
// receipts and the services any agent can call. Real numbers only.
import * as THREE from 'three';
import { makeDrone } from './fleet.js';
import { esc } from './names.js';
import { GUILDS } from './skills.js';

const POLL_MS = 60000;
const usd = (v) => `$${(Number(v) || 0).toFixed(v >= 1 ? 2 : 3).replace(/0$/, '')}`;
const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
const key = (e) => `${e.at}:${e.kind}:${e.blocky}:${e.tx || ''}`;

export function eventLine(e) {
  const who = `${GUILDS[e.guild]?.icon ? GUILDS[e.guild].icon + ' ' : ''}Blocky #${e.blocky}`;
  if (e.kind === 'x402-sale') return `💸 ${who} sold ${esc(e.tool || 'research')}${e.ticker ? ` on ${esc(e.ticker)}` : ''} over x402 · ${usd(e.usd)}`;
  if (e.kind === 'job-paid') return `✅ ${who} got paid for a Blue Agent job · ${usd(e.usd)}`;
  if (e.kind === 'job-delivered') return `📨 ${who} delivered a report to Blue Agent`;
  return `🔎 ${who} finished research${e.title ? `: ${esc(e.title)}` : ''}`;
}

export function createWorkHQ(city, { log = () => {}, from = () => null, feed = '/api' } = {}) {
  const seen = new Set();
  let data = null, first = true;
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
    const tag = label(e.usd ? `${gd ? gd.icon + ' ' : ''}+${usd(e.usd)} · #${e.blocky}` : `#${e.blocky} delivered`, gd?.color); tag.position.y = 1.2; d.add(tag);
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
        if (first) continue; // what happened before the visit is in the popup, not replayed
        log(eventLine(e));
        fly(e);
      }
      first = false;
      if (!panel.hidden) draw();
    } catch { /* offline: try again next poll */ }
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

  // the popup, in the city's own style (same frame as Blocky 10)
  const panel = document.createElement('div');
  panel.className = 'td-wrap'; panel.hidden = true;
  document.body.appendChild(panel);
  panel.addEventListener('click', (e) => { if (e.target === panel || e.target.closest('.td-x')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });

  function draw() {
    const d = data || { today: {}, leaders: [], events: [], services: [] };
    const t = d.today || {};
    panel.innerHTML = `<div class="td whq" role="dialog" aria-label="x402 HQ">
      <div class="td-head"><div class="td-icon">💸</div><div class="td-title"><b>x402 HQ</b><span>where the Blockies get paid</span></div><button class="td-x" title="Close (Esc)">✕</button></div>
      <p class="td-blurb">Blockies do research for agents and people, and get paid in USDC on Base, straight to their owner's wallet. Every number here is a settled payment or a verified delivery.</p>
      <div class="whq-stats"><div><b>${usd(t.earnedUsd)}</b><span>earned today</span></div><div><b>${t.calls || 0}</b><span>x402 calls</span></div><div><b>${t.jobsPaid || 0}</b><span>jobs paid</span></div><div><b>${t.delivered || 0}</b><span>delivered</span></div></div>
      <h4>Guilds <small>7 days</small></h4>
      <div class="whq-guilds">${Object.entries(GUILDS).map(([id, g]) => { const r = (d.guilds || []).find((x) => x.guild === id); return `<div style="border-color:${g.color}"><b>${g.icon} ${g.label}</b><span>${r ? `${usd(r.earnedUsd)} · ${r.calls} paid` : 'no paid work yet'}</span></div>`; }).join('')}</div>
      <h4>Hardest-working Blockies <small>7 days</small></h4>
      ${(d.leaders || []).length ? `<ol class="whq-lead">${d.leaders.map((l) => `<li><b>Blocky #${l.blocky}</b><span>${usd(l.earnedUsd)} · ${l.calls} call${l.calls === 1 ? '' : 's'} · ${l.jobs} job${l.jobs === 1 ? '' : 's'}</span></li>`).join('')}</ol>` : '<p class="td-soon">No paid work yet this week. The first Blocky to get paid tops the board.</p>'}
      <h4>Latest</h4>
      <ul class="whq-ev">${(d.events || []).slice(0, 8).map((e) => `<li><span>${eventLine(e)}</span><em>${ago(e.at)}${e.tx ? ` · <a href="https://basescan.org/tx/${esc(e.tx)}" target="_blank" rel="noopener">tx ↗</a>` : ''}</em></li>`).join('') || '<li><span>Waiting for the first paid call.</span></li>'}</ul>
      <h4>Call a Blocky</h4>
      <ul class="whq-svc">${(d.services || []).map((s) => `<li><b>${esc(s.id)}</b> <span>${esc(s.task)}</span><em>$${s.priceUsd.toFixed(2)}</em></li>`).join('')}</ul>
      <div class="td-actions"><a class="btn" href="/api/x402" target="_blank" rel="noopener">x402 catalog</a><a class="btn" href="https://app.blueagent.dev/agents" target="_blank" rel="noopener">Hire on Blue Agent ↗</a><a class="btn" href="/metrics">All the numbers</a><a class="btn" href="/agents">Put my Blocky to work</a></div>
      ${d.bazaar?.listed ? '<p class="whq-bz">✓ Listed on the x402 Bazaar</p>' : ''}<div class="td-foot">x402 calls settle through Coinbase's CDP facilitator. Research only, not financial advice; Coinbase's tokenized stocks aren't offered in the U.S.</div>
    </div>`;
  }
  function open() { draw(); panel.hidden = false; load(); }
  function close() { panel.hidden = true; }

  load();
  setInterval(load, POLL_MS);
  return { update, open, close, load, get data() { return data; } };
}
