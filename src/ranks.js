// BaseCity Hall of Fame & Live Game Metrics (Ranks L):
// Game-style Obsidian arcade leaderboard combining Top Earners (x402 + Tasks), Stock Whales (Blocky Street), and Top Builders (City).
import { esc } from './names.js';
import { now } from './time.js';
import { builtCount } from './sim.js';
import { CONFIG } from './config.js';
import { fetchCityTasks } from './city-tasks.js';
import { itemSprite, itemIcon } from './items.js';

const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('en-US');
const usd = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(n >= 10 ? 0 : 2)}`;
};
const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

export function createRanksModal({ sim, crew }) {
  const wrap = document.createElement('div');
  wrap.className = 'gm-modal-wrap';
  wrap.hidden = true;
  document.body.appendChild(wrap);

  let tab = 'citizens'; // 'citizens' | 'earners' | 'stock_earned' | 'employers' | 'stocks' | 'builders' | 'flywheel' | 'work_metrics' | 'all_blockies'
  let prevRankTab = 'citizens';
  let workData = null;
  let stockData = null;
  let taskData = [];
  let citizensData = [];
  let fwData = null;
  let blockyQuery = '';
  let loading = false;

  async function refresh() {
    loading = true;
    draw();
    const [wf, st, ts, cz, fw] = await Promise.all([
      fetch('/api/work-feed', { cache: 'no-store', signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/stocks?crew', { cache: 'no-store', signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetchCityTasks().catch(() => []),
      fetch('/api/rpg-state?leaderboard=1', { cache: 'no-store', signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/flywheel', { cache: 'no-store', signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    workData = wf;
    stockData = st;
    taskData = Array.isArray(ts) ? ts : [];
    citizensData = Array.isArray(cz?.leaders) ? cz.leaders : [];
    fwData = fw;
    loading = false;
    if (!wrap.hidden) draw();
  }

  function buildEarnersList() {
    const byKey = new Map();
    for (const l of workData?.leaders || []) {
      const k = `blocky:${l.blocky}`;
      byKey.set(k, {
        name: `Blocky #${l.blocky}`,
        sub: `${l.calls || 0} x402 calls · ${l.jobs || 0} jobs`,
        earnedUsd: Number(l.earnedUsd || 0),
        extra: 'x402 HQ',
      });
    }
    for (const t of taskData) {
      if (t.status !== 'paid' || !t.winner) continue;
      const k = `w:${t.winner.toLowerCase()}`;
      const cur = byKey.get(k) || { name: shortAddr(t.winner), sub: 'BaseCity Task Winner', earnedUsd: 0, extra: 'Tasks' };
      cur.earnedUsd += Number(t.rewardUsdc || 0);
      byKey.set(k, cur);
    }
    return [...byKey.values()].sort((a, b) => b.earnedUsd - a.earnedUsd).slice(0, 15);
  }

  function buildStocksEarnedList() {
    const byWallet = new Map();
    for (const t of taskData) {
      const tok = String(t.rewardToken || 'USDC').toUpperCase();
      if (t.status !== 'paid' || !t.winner || tok === 'USDC') continue;
      const w = t.winner.toLowerCase();
      const cur = byWallet.get(w) || { name: shortAddr(t.winner), tokens: new Map(), tasks: 0, estUsd: 0 };
      const amt = Number(t.rewardAmount || 0);
      cur.tokens.set(tok, (cur.tokens.get(tok) || 0) + amt);
      cur.tasks += 1;
      cur.estUsd += Number(t.rewardUsdc || 0);
      byWallet.set(w, cur);
    }
    return [...byWallet.values()].map((r) => {
      const tokList = [...r.tokens.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([sym, amt]) => `${Number(amt.toFixed(4))} ${sym}`)
        .join(' · ');
      return {
        name: r.name,
        sub: tokList || 'Base Stocks',
        score: r.estUsd > 0 ? r.estUsd : r.tasks,
        valText: r.estUsd > 0 ? usd(r.estUsd) : `${r.tasks} task${r.tasks === 1 ? '' : 's'}`,
        valSub: `${r.tasks} stock payout${r.tasks === 1 ? '' : 's'}`,
      };
    }).sort((a, b) => b.score - a.score).slice(0, 15);
  }

  function buildEmployersList() {
    const byReq = new Map();
    for (const t of taskData) {
      if (!t.requester) continue;
      const r = t.requester.toLowerCase();
      const cur = byReq.get(r) || { name: shortAddr(t.requester), posted: 0, paid: 0, paidUsd: 0, stockPays: 0 };
      cur.posted += 1;
      if (t.status === 'paid') {
        cur.paid += 1;
        cur.paidUsd += Number(t.rewardUsdc || 0);
        if (String(t.rewardToken || 'USDC').toUpperCase() !== 'USDC') cur.stockPays += 1;
      }
      byReq.set(r, cur);
    }
    return [...byReq.values()].map((e) => ({
      name: e.name,
      sub: `Paid ${e.paid}/${e.posted} tasks${e.stockPays ? ` · ${e.stockPays} in Stocks` : ''}`,
      score: e.paidUsd > 0 ? e.paidUsd : (e.paid * 10 + e.posted),
      valText: e.paidUsd > 0 ? usd(e.paidUsd) : `${e.paid} paid`,
      valSub: `${e.posted} posted`,
    })).sort((a, b) => b.score - a.score).slice(0, 15);
  }

  function buildStocksList() {
    const list = Array.isArray(stockData?.crew) ? stockData.crew : [];
    return list.slice(0, 15).map((m) => ({
      name: m.label || shortAddr(m.a),
      sub: `${(m.tickers || []).slice(0, 5).join(' · ') || 'Base Stocks'}${m.citizen ? ' · CITIZEN' : ''}`,
      score: Number(m.blockies || 0),
      valText: `${m.blockies || 0} Blockies`,
      valSub: m.citizen ? 'Gold Hat' : 'Street Crew',
    }));
  }

  function buildBuildersList() {
    const s = sim?.();
    const list = crew?.() || [];
    if (!s || !list.length) return [];
    const ts = now();
    const active = list.filter((b) => b.kind === 'blocky' && !Number.isFinite(b.leftAt));
    const ranked = active.map((b) => ({
      name: b.name,
      sub: `${b.role?.label || 'Builder'}${b.from ? ` · ${shortAddr(b.from)}` : ''}`,
      blocks: s.blocksBy(b, ts),
    })).sort((a, b) => b.blocks - a.blocks).slice(0, 15);
    return ranked;
  }

  function draw() {
    const s = sim?.();
    const list = crew?.() || [];
    const minted = list.filter((b) => b.kind === 'blocky' && !Number.isFinite(b.leftAt)).length;
    const buildings = s ? builtCount(s) : 0;
    const stockTvl = Number(stockData?.totals?.usd || 0);
    const x402Today = Number(workData?.today?.earnedUsd || 0);
    const paidTasksUsd = taskData.filter((t) => t.status === 'paid').reduce((a, t) => a + Number(t.rewardUsdc || 0), 0);
    const totalEarned = x402Today + paidTasksUsd;

    const rankBadge = (i) => (i === 0 ? itemSprite('crown-gold', 28) : i === 1 ? itemSprite('medal-silver', 28) : i === 2 ? itemSprite('medal-bronze', 28) : `#${i + 1}`);
    let rowsHtml = '';
    if (tab === 'earners') {
      const earners = buildEarnersList();
      const top = earners[0]?.earnedUsd || 1;
      rowsHtml = earners.length ? earners.map((e, i) => `
        <div class="rk-row${i < 3 ? ` top${i + 1}` : ''}">
          <div class="rk-pos">${rankBadge(i)}</div>
          <div class="rk-main">
            <b>${esc(e.name)}</b>
            <small>${esc(e.sub)}</small>
            <div class="rk-bar"><i style="width:${Math.max(8, Math.round((e.earnedUsd / top) * 100))}%"></i></div>
          </div>
          <div class="rk-val">${usd(e.earnedUsd)}<small>${esc(e.extra)}</small></div>
        </div>`).join('')
        : `<p class="lp-desc">${loading ? 'Loading live x402 & task payouts...' : 'No settled x402 or task payouts yet. Complete a task in BASECITY TASKS to claim #1.'}</p>`;
    } else if (tab === 'stock_earned') {
      const earned = buildStocksEarnedList();
      const top = earned[0]?.score || 1;
      rowsHtml = earned.length ? earned.map((w, i) => `
        <div class="rk-row${i < 3 ? ` top${i + 1}` : ''}">
          <div class="rk-pos">${rankBadge(i)}</div>
          <div class="rk-main">
            <b>${esc(w.name)}</b>
            <small>${esc(w.sub)}</small>
            <div class="rk-bar"><i style="width:${Math.max(10, Math.round((w.score / top) * 100))}%"></i></div>
          </div>
          <div class="rk-val">${esc(w.valText)}<small>${esc(w.valSub)}</small></div>
        </div>`).join('')
        : `<p class="lp-desc">${loading ? 'Loading Stock-paid task winners...' : 'No Stock-paid tasks settled yet. Complete a Stock-reward task in BASECITY TASKS to rank here.'}</p>`;
    } else if (tab === 'employers') {
      const employers = buildEmployersList();
      const top = employers[0]?.score || 1;
      rowsHtml = employers.length ? employers.map((e, i) => `
        <div class="rk-row${i < 3 ? ` top${i + 1}` : ''}">
          <div class="rk-pos">${rankBadge(i)}</div>
          <div class="rk-main">
            <b>${esc(e.name)}</b>
            <small>${esc(e.sub)}</small>
            <div class="rk-bar"><i style="width:${Math.max(10, Math.round((e.score / top) * 100))}%"></i></div>
          </div>
          <div class="rk-val">${esc(e.valText)}<small>${esc(e.valSub)}</small></div>
        </div>`).join('')
        : `<p class="lp-desc">${loading ? 'Loading BaseCity task employers...' : 'No BaseCity task employers yet. Post and pay a task in BASECITY TASKS to top this board.'}</p>`;
    } else if (tab === 'stocks') {
      const whales = buildStocksList();
      const top = whales[0]?.score || 1;
      rowsHtml = whales.length ? whales.map((w, i) => `
        <div class="rk-row${i < 3 ? ` top${i + 1}` : ''}">
          <div class="rk-pos">${rankBadge(i)}</div>
          <div class="rk-main">
            <b>${esc(w.name)}</b>
            <small>${esc(w.sub)}</small>
            <div class="rk-bar"><i style="width:${Math.max(10, Math.round((w.score / top) * 100))}%"></i></div>
          </div>
          <div class="rk-val">${esc(w.valText)}<small>${esc(w.valSub)}</small></div>
        </div>`).join('')
        : `<p class="lp-desc">${loading ? 'Loading Blocky Street Crew rankings...' : 'No Street Crew wallets ranked yet. Hold $10+ of Base Stocks to join.'}</p>`;
    } else if (tab === 'citizens') {
      const top = citizensData[0]?.xp || 1;
      const multFor = (lv) => (lv >= 35 ? 2.0 : lv >= 20 ? 1.6 : lv >= 10 ? 1.35 : lv >= 5 ? 1.1 : 1.0);
      const perkBanner = `<div class="gmsx-rk-bar">${itemIcon('quest-medal', 16)}<span><b>CITIZEN RANKS</b> — Reach <b>Lv.10</b> for -15% Craft &amp; Plot Upgrade cost, and hold <b>Blocky 10 Stocks</b> on Base for live yield &amp; speed buffs.</span></div>`;
      rowsHtml = perkBanner + (citizensData.length ? citizensData.map((c, i) => {
        const lvNum = Number(c.level || 1);
        const mult = multFor(lvNum);
        return `
        <div class="rk-row${i < 3 ? ` top${i + 1}` : ''}">
          <div class="rk-pos">${rankBadge(i)}</div>
          <div class="rk-main">
            <b>${esc(c.name || shortAddr(c.address))} · LV.${lvNum}</b>
            <small>${esc(c.rankTitle || 'NEWCOMER')} · Passport ${c.passportCount || 0}/24 · Plot ${c.plotScore || 0}</small>
            <div class="rk-bar"><i style="width:${Math.max(8, Math.round((Number(c.xp || 0) / top) * 100))}%"></i></div>
          </div>
          <div class="rk-val">${fmt(c.xp)} XP<small>x${mult.toFixed(2)} Rank</small></div>
        </div>`;
      }).join('')
        : `<p class="lp-desc">${loading ? 'Loading Top Citizens...' : 'Connect your wallet, mine Silicon, build your Plot &amp; complete Daily Missions to claim #1 Top Citizen.'}</p>`);
    } else if (tab === 'flywheel') {
      const split = CONFIG.flywheel?.split || { holders: 45, buyback: 35, treasury: 20 };
      const contract = CONFIG.flywheel?.contract || '0x273c3c49106Dd52Ac9b20D4FDDfcB8C6104dfA3B';
      const ep = fwData?.summary?.latestEpoch || 0;
      const blk = fwData?.latestBlock || 0;
      const events = Array.isArray(fwData?.events) ? fwData.events.slice(0, 8) : [];
      rowsHtml = `
        <div class="gmu-box" style="margin-bottom:8px">
          <div class="gmu-box-h"><b>BASECITY FLYWHEEL · ONCHAIN REVENUE SPLIT</b><span>Epoch #${fmt(ep)} · Block #${fmt(blk)}</span></div>
          <div class="gmu-kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px">
            <div class="gmu-kpi"><span>BCB NFT Holders</span><b style="color:#2ee87a">${split.holders}% Auto-Push</b></div>
            <div class="gmu-kpi"><span>Buyback &amp; Burn</span><b style="color:#ffc83d">${split.buyback}% to 0x..dEaD</b></div>
            <div class="gmu-kpi"><span>City Treasury</span><b style="color:#60a5fa">${split.treasury}% Ops</b></div>
          </div>
          <p class="gmu-muted">Contract: <code>${esc(shortAddr(contract))}</code> on Base Mainnet. Onchain Supply Shop &amp; ecosystem revenue flows automatically through BaseCityFlywheel.</p>
        </div>
        ${events.length ? events.map((ev) => `
          <div class="rk-row">
            <div class="rk-pos">${itemIcon('news-flywheel', 18)}</div>
            <div class="rk-main"><b>${esc(ev.type || ev.event || 'Flywheel Event')}</b><small>${esc(ev.detail || ev.txHash || '')}</small></div>
            <div class="rk-val">${ev.amount ? esc(String(ev.amount)) : 'LIVE'}</div>
          </div>`).join('') : '<p class="lp-desc">Flywheel synced live to Base Mainnet. Distributions appear here each epoch.</p>'}`;
    } else if (tab === 'work_metrics') {
      const tot = workData?.totals || {};
      const today = workData?.today || {};
      const svcs = Array.isArray(workData?.services) ? workData.services.slice(0, 8) : [];
      rowsHtml = `
        <div class="gmu-box" style="margin-bottom:8px">
          <div class="gmu-box-h"><b>X402 &amp; WORK METRICS · LIVE ON BASE</b><span>Autonomous Blocky Economy</span></div>
          <div class="gmu-kpis" style="margin-bottom:0">
            <div class="gmu-kpi"><span>Earned Today</span><b style="color:#2ee87a">${usd(today.earnedUsd || 0)}</b></div>
            <div class="gmu-kpi"><span>Total Earned</span><b>${usd(tot.earnedUsd || totalEarned)}</b></div>
            <div class="gmu-kpi"><span>x402 Calls</span><b>${fmt(tot.calls || today.calls || 0)}</b></div>
            <div class="gmu-kpi"><span>Open Tasks</span><b>${taskData.filter((t) => t.status === 'open').length}</b></div>
          </div>
        </div>
        ${svcs.length ? svcs.map((sv) => `
          <div class="rk-row">
            <div class="rk-pos">${itemIcon('poi-agents', 18)}</div>
            <div class="rk-main"><b>${esc(sv.name || sv.title || 'x402 Service')}</b><small>${esc(sv.desc || sv.category || 'Base Mainnet x402')}</small></div>
            <div class="rk-val">${sv.priceUsd ? usd(sv.priceUsd) : 'x402'}<small>${fmt(sv.calls || 0)} calls</small></div>
          </div>`).join('') : '<p class="lp-desc">Live x402 agent jobs &amp; BaseCity Task metrics update automatically as Blockies settle USDC on Base.</p>'}`;
    } else if (tab === 'all_blockies') {
      const sNow = sim?.();
      const ts = now();
      const q = blockyQuery.trim().toLowerCase();
      const allActive = (crew?.() || []).filter((b) => b.kind === 'blocky' && !Number.isFinite(b.leftAt));
      const filtered = allActive.filter((b) => !q || String(b.name || '').toLowerCase().includes(q) || String(b.from || '').toLowerCase().includes(q) || String(b.role?.label || '').toLowerCase().includes(q)).slice(0, 30);
      rowsHtml = `
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input id="rk-blocky-q" class="rk-search" type="search" value="${esc(blockyQuery)}" placeholder="Search Blocky #, role, or wallet 0x..." />
          <a class="btn td-copy" style="flex:none" href="/collection.html?sort=blocks" target="_blank" rel="noopener">Full Archive</a>
        </div>
        ${filtered.length ? filtered.map((b, i) => {
          const blks = sNow ? sNow.blocksBy(b, ts) : 0;
          return `<div class="rk-row">
            <div class="rk-pos">#${b.n || i + 1}</div>
            <div class="rk-main"><b>${esc(b.name)}</b><small>${esc(b.role?.label || 'Builder')} · ${esc(b.rarity?.label || 'Common')}${b.from ? ` · ${shortAddr(b.from)}` : ''}</small></div>
            <div class="rk-val">${fmt(blks)}<small>blocks</small></div>
          </div>`;
        }).join('') : '<p class="lp-desc">No matching Blockies found.</p>'}`;
    } else {
      const builders = buildBuildersList();
      const top = builders[0]?.blocks || 1;
      rowsHtml = builders.length ? builders.map((b, i) => `
        <div class="rk-row${i < 3 ? ` top${i + 1}` : ''}">
          <div class="rk-pos">${rankBadge(i)}</div>
          <div class="rk-main">
            <b>${esc(b.name)}</b>
            <small>${esc(b.sub)}</small>
            <div class="rk-bar"><i style="width:${Math.max(8, Math.round((b.blocks / top) * 100))}%"></i></div>
          </div>
          <div class="rk-val">${fmt(b.blocks)}<small>blocks</small></div>
        </div>`).join('')
        : '<p class="lp-desc">Loading city builders...</p>';
    }

    wrap.innerHTML = `
      <div class="td gm-ranks-modal" role="dialog" aria-modal="true" aria-label="BaseCity Hall of Fame">
        <div class="td-head">
          ${itemSprite('poi-ranks', 38)}
          <div class="td-title"><b>HALL OF FAME</b><span>Live BaseCity rankings, Flywheel, Work Metrics &amp; Blockies directory</span></div>
          <div class="td-head-acts">
            ${['flywheel', 'work_metrics', 'all_blockies'].includes(tab) ? '<button type="button" class="td-back" id="rk-back">Back</button>' : ''}
            <button type="button" class="td-x" id="rk-close">Close</button>
          </div>
        </div>
        <div class="rk-kpis">
          <div class="rk-kpi mc-kpi">${itemSprite('user-avatar', 30)}<div><span>Blockies Live</span><b>${fmt(minted)}</b><small>/ ${fmt(CONFIG.supply || 10000)}</small></div></div>
          <div class="rk-kpi gold mc-kpi">${itemSprite('poi-stocks', 30)}<div><span>Stock Crew TVL</span><b>${stockTvl ? usd(stockTvl) : '—'}</b><small>${stockData?.totals?.wallets || 0} wallets</small></div></div>
          <div class="rk-kpi green mc-kpi">${itemSprite('coin-usdc', 30)}<div><span>x402 + Tasks</span><b>${usd(totalEarned)}</b><small>${taskData.filter((t) => t.status === 'open').length} open tasks</small></div></div>
          <div class="rk-kpi mc-kpi">${itemSprite('poi-plot', 30)}<div><span>Buildings</span><b>${fmt(buildings)}</b><small>24/7 on Base</small></div></div>
        </div>
        <div class="rk-tabs">
          <button type="button" class="lp-seg-btn${tab === 'citizens' ? ' on' : ''}" data-rktab="citizens">${itemIcon('user-avatar', 15)} Top Citizens</button>
          <button type="button" class="lp-seg-btn${tab === 'earners' ? ' on' : ''}" data-rktab="earners">${itemIcon('tab-earners', 15)} Top Earners</button>
          <button type="button" class="lp-seg-btn${tab === 'stock_earned' ? ' on' : ''}" data-rktab="stock_earned">${itemIcon('stock-cert', 15)} Stocks Earned</button>
          <button type="button" class="lp-seg-btn${tab === 'employers' ? ' on' : ''}" data-rktab="employers">${itemIcon('tab-employers', 15)} Top Employers</button>
          <button type="button" class="lp-seg-btn${tab === 'stocks' ? ' on' : ''}" data-rktab="stocks">${itemIcon('tab-whales', 15)} Stock Whales</button>
          <button type="button" class="lp-seg-btn${tab === 'builders' ? ' on' : ''}" data-rktab="builders">${itemIcon('tab-builders', 15)} Top Builders</button>
        </div>
        <div class="rk-list">${rowsHtml}</div>
        <div class="rk-foot-tabs">
          <button type="button" class="btn td-copy${tab === 'flywheel' ? ' on' : ''}" data-rktab="flywheel">${itemIcon('news-flywheel', 15)} Flywheel</button>
          <button type="button" class="btn td-copy${tab === 'work_metrics' ? ' on' : ''}" data-rktab="work_metrics">${itemIcon('poi-agents', 15)} Work Metrics</button>
          <button type="button" class="btn td-copy${tab === 'all_blockies' ? ' on' : ''}" data-rktab="all_blockies">${itemIcon('user-avatar', 15)} All Blockies</button>
        </div>
      </div>`;
    const qIn = wrap.querySelector('#rk-blocky-q');
    if (qIn) {
      qIn.oninput = () => { blockyQuery = qIn.value; draw(); wrap.querySelector('#rk-blocky-q')?.focus(); };
    }
  }

  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('#rk-close')) { close(); return; }
    if (e.target.closest('#rk-back')) { tab = prevRankTab || 'citizens'; draw(); return; }
    const next = e.target.closest('[data-rktab]')?.dataset.rktab;
    if (next && next !== tab) {
      if (!['flywheel', 'work_metrics', 'all_blockies'].includes(tab)) prevRankTab = tab;
      tab = next; draw();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !wrap.hidden) { e.preventDefault(); e.stopPropagation(); close(); } });

  function open(initialTab = '') {
    if (initialTab) tab = initialTab;
    wrap.hidden = false;
    refresh();
  }
  function close() { wrap.hidden = true; }

  return { open, close, get openState() { return !wrap.hidden; } };
}
