import { createStreetAudio } from './street-audio.js';
// BaseCity Game Mode (GTA / Minecraft-inspired third-person voxel explorer):
// - Over-the-shoulder smooth camera with dynamic sprint/drive FOV
// - Walk & tuned Drive modes (Boat removed due to small river network)
// - Strict Ownership-Gated Character Locker (C): requires owning a Blocky on Base (checks colony, /api/claim & onchain BCB/BLOCKY)
// - Citizen Tasks & Live USDC Jobs Board (T): 1:1 Base society missions + live paid Base USDC agent jobs
// - Glowing 3D interaction pads in front of onchain DeFi/Launchpad/Stocks/Agents buildings
// - Emotes (1: GM wave, 2: Celebration jump, 3: Snapshot photo)
// - GTA Minimap Radar + Fullscreen Interactive City Map (M) with click-to-travel / GPS route
import * as THREE from 'three';
import { createPublicClient, fallback, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { buildBlocky } from './citizens.js';
import { CONFIG } from './config.js';
import { makeBlocky, PITCH, GPU_FRONTAGE, STREET_LOT_HALF, STREET_LOT_SCALE, isWater, BASELIVE_LOTS, STOCKS_LOTS, TRAIT_LABEL } from './sim.js';
import { renderPfp } from './pfp.js';
import { browserWallets, smartWallet, connect, restoreWallet, forgetWallet, rejected } from './wallet.js';
import { privyConfigured, loginWithPrivyOAuth, sendPrivyEmailCode, verifyPrivyEmailCode } from './privy.js';
import { esc, who } from './names.js';
import { now } from './time.js';
import { fetchCityTasks, createCityTask, claimCityTask, unclaimCityTask, cancelCityTask, submitCityTask, submitBlueAgentJob, approveAndPayCityTask, formatTaskReward, renderTaskBoardHtml, renderPostTaskHtml } from './city-tasks.js';
import { fetchStockIntel, publishStockIntel, unlockStockIntel, removeStockIntel, renderStockIntelHtml } from './stock-intel.js';
import { fetchBaseStocks, getWalletStockBalances } from './swap-base.js';
import { openBlocky10 } from './tradedock.js';
import { PROJECTS } from './projects.js';
import { createGameWorld, GAME_NODES, OG_MEME_ITEMS } from './game-world.js';
import { itemSprite, itemIcon, poiSpriteId, rarityGemId } from './items.js';

const v3 = () => new THREE.Vector3();
const BCB_NFT = CONFIG.nft?.contract || '0xD1C1655860eDdb6cCeC9AC986539B3b0E195d5a9';
const BLOCKY_TOKEN = CONFIG.tokenAddress || '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885';
const BAL_ABI = parseAbi(['function balanceOf(address owner) view returns (uint256)']);
const baseRpc = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://base-rpc.publicnode.com'),
    http('https://mainnet.base.org'),
    http('https://base.publicnode.com'),
  ]),
});

const OPEN_LOTS = new Set([
  'park', 'lakepark', 'flowergarden', 'playground', 'court',
  'soccer', 'garden', 'farm', 'square', 'reserve', 'solarfarm',
]);

const POIS = [
  { id: 'stocks', cat: 'trade', label: 'STOCKS', full: 'Blocky Street · Stock Towers', desc: 'Trade Coinbase Tokenized Stocks (NVDA, TSLA, MSTR, SPCX...) & 1-tx Sector Baskets on Base', action: 'trade', actionLbl: 'Trade Stocks', lot: [-5, 0], enter: [-36, 0], color: '#2ee87a', dy: -6, pad: true },
  { id: 'exchange', cat: 'trade', label: 'EXCHANGE', full: 'Base Stock Exchange', desc: 'Buy & Sell $BLOCKY and $BASECITY directly on Base via Relay', action: 'blocky', actionLbl: 'Buy $BLOCKY', lot: [1, -1], enter: [8, -4], color: '#ffc83d', dy: -6, pad: true },
  { id: 'agents', cat: 'work', label: 'X402 HQ', full: 'AI Agent Hub · x402 HQ', desc: 'Run Blocky Worker (Auto), check x402 Agent guilds & autonomous jobs', action: 'hq', actionLbl: 'Open x402 HQ', lot: [-1, 1], enter: [-8, 12], color: '#a855f7', dy: -6, pad: true },
  { id: 'tasks', cat: 'work', label: 'TASKS', full: 'BaseCity Task Board & Analyst', desc: 'Post or complete tasks paid in Base USDC or Tokenized Stocks + x402 Intel', action: 'tasks', actionLbl: 'Open Tasks', lot: [-1, 1], enter: [-4, 12], color: '#60a5fa', dy: 11 },
  { id: 'usdc', cat: 'defi', label: 'USDC', full: 'Circle USDC Bank', desc: 'Send & receive USDC on Base Mainnet directly from your wallet', action: 'usdc', actionLbl: 'Open Bank', lot: [-2, 3], enter: [-16, 28], color: '#2775ca', dy: -6, pad: true },
  { id: 'morpho', cat: 'defi', label: 'MORPHO', full: 'Morpho Vault HQ', desc: 'Deposit & withdraw USDC in Steakhouse Morpho Vault for onchain yield', action: 'morpho', actionLbl: 'Open Vault', lot: [1, 3], enter: [8, 28], color: '#2470ff', dy: -6, pad: true },
  { id: 'launch', cat: 'defi', label: 'LAUNCH', full: 'Launchpad Tower', desc: 'Launch a new Base token paired with $BLOCKY or ETH and spawn a tower', action: 'launch', actionLbl: 'Launch Token', lot: [-1, 3], enter: [-8, 28], color: '#ff5c5c', dy: 11, pad: true },
  { id: 'core', cat: 'city', label: 'RANKS', full: 'Town Square · Hall of Fame', desc: 'View Top Earners, Stocks Earned, Top Employers & Top Builders', action: 'ranks', actionLbl: 'Open Ranks', lot: [0, 0], enter: [0, 4], color: '#fbbf24', dy: -6, pad: true },
  { id: 'live', cat: 'city', label: 'BASE LIVE', full: 'Base Live District', desc: 'Watch real-time Base Mainnet blocks & live transaction streams', action: 'live', actionLbl: 'Open Live', lot: [-5, 3.5], enter: [-36, 28], color: '#38bdf8', dy: -6 },
  { id: 'cinema', cat: 'city', label: 'CINEMA', full: 'BaseCity Cinema', desc: 'Watch community clips, drop live reactions & save souvenir tickets', action: 'cinema', actionLbl: 'Enter Cinema', lot: [0, 2], enter: [0, 12], color: '#f472b6', dy: -6 },
];

const ALL_POIS = [...POIS, ...GAME_NODES];

const MAP_CATS = [
  ['all', 'All'],
  ['trade', 'Trade & Stocks'],
  ['build', 'Mine & Build'],
  ['work', 'Work & Agents'],
  ['defi', 'DeFi'],
  ['city', 'City & Live'],
];

const CITIZEN_TASKS = [
  { id: 'civic_gm', title: 'Civic Check-In', desc: 'Visit Town Square & press 1 to wave GM to the city', poi: 'core', reward: '+100 REP' },
  { id: 'defi_bank', title: 'Base DeFi Citizen', desc: 'Visit USDC Bank or Morpho Vault HQ on DeFi Strip', poi: 'usdc', reward: '+150 REP' },
  { id: 'blocky10', title: 'Wall Street on Base', desc: 'Visit Blocky Street & inspect Blocky 10 tokenized stocks', poi: 'stocks', reward: '+200 REP' },
  { id: 'agent_hq', title: 'AI Economy Worker', desc: 'Visit x402 HQ to check paid USDC agent tasks', poi: 'agents', reward: '+200 REP' },
  { id: 'launchpad', title: 'Base Builder Launch', desc: 'Visit Launchpad Tower & explore live Base launches', poi: 'launch', reward: '+150 REP' },
];

function makeCarMesh() {
  const g = new THREE.Group();
  const box = (w, h, d, c, x, y, z) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: c }),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  box(1.22, 0.36, 2.25, 0x0052ff, 0, 0.34, 0);
  box(0.98, 0.38, 1.1, 0xdceeff, 0, 0.68, -0.1);
  box(1.24, 0.1, 0.12, 0xffd23f, 0, 0.36, 1.13);
  box(1.24, 0.1, 0.1, 0xff3b5c, 0, 0.38, -1.13);
  for (const [x, z] of [[-0.6, 0.7], [0.6, 0.7], [-0.6, -0.7], [0.6, -0.7]]) {
    box(0.2, 0.34, 0.34, 0x1b1f27, x, 0.17, z);
  }
  return g;
}

function makeInteractionPads() {
  const group = new THREE.Group();
  const pads = [];
  for (const poi of POIS) {
    if (!poi.pad) continue;
    const col = parseInt(poi.color.replace('#', ''), 16);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.35, 24),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(poi.enter[0], 0.14, poi.enter[1]);
    group.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.55, 2.8, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(poi.enter[0], 1.5, poi.enter[1]);
    group.add(beam);
    pads.push({ ring, beam });
  }
  return { group, pads };
}

function makeGmBubble() {
  const cv = document.createElement('canvas');
  cv.width = 160; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#0d0e11';
  g.beginPath(); g.roundRect(4, 4, 152, 56, 10); g.fill();
  g.strokeStyle = '#ffc83d'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#ffc83d'; g.font = '800 32px Inter, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('GM', 80, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sp.scale.set(1.6, 0.64, 1);
  sp.visible = false;
  return sp;
}

function modalOpen() {
  return Boolean(document.querySelector('.td-wrap:not([hidden]), .cinema-room:not([hidden]), .gm-modal-wrap:not([hidden])'));
}

export function createPlayMode({ scene, renderer, city, controls, street, sim, crew, views, toast, onInteract, onOpenRanks, onOpenAction, onExit }) {
  const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 450);
  const hud = document.getElementById('play-hud');
  const promptEl = document.getElementById('play-prompt');
  const exitBtn = document.getElementById('play-exit');
  const padEl = document.getElementById('play-pad');
  const charBtn = document.getElementById('play-char-btn');
  const mapBtn = document.getElementById('play-map-btn');
  const questBtn = document.getElementById('play-quest');
  const rankBtn = document.getElementById('play-rank-btn');
  const speedEl = document.getElementById('play-speed');
  const emoteBar = document.getElementById('play-emotes');
  const userBtn = document.getElementById('play-user-btn');
  const userPill = document.getElementById('play-user-pill');
  const newsBtn = document.getElementById('play-news-btn');
  const shopBtn = document.getElementById('play-shop-btn');
  const ctaBtn = document.getElementById('play-cta');
  const guideBtn = document.getElementById('play-guide-btn');
  const soundBtn = document.getElementById('play-sound');
  const streetAudio = createStreetAudio();
  let stride = 0;
  function syncSoundButton() {
    if (!soundBtn) return;
    soundBtn.textContent = streetAudio.enabled ? 'Sound on' : 'Sound off';
    soundBtn.setAttribute('aria-pressed', String(streetAudio.enabled));
  }
  if (soundBtn) soundBtn.onclick = () => { streetAudio.toggle(); syncSoundButton(); };
  syncSoundButton();
  const unlockStreetAudio = () => { if (active) streetAudio.unlock(); };
  document.addEventListener('pointerdown', unlockStreetAudio, { passive: true });
  document.addEventListener('keydown', unlockStreetAudio);
  document.addEventListener('visibilitychange', () => { if (document.hidden) streetAudio.drive(0, false); });


  // 3D Golden GPS Beacon Pillar (lights up destination when setting route on Map)
  const gpsBeacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.72, 16, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  gpsBeacon.visible = false;
  city.root.add(gpsBeacon);

  let hotbarEl = null;
  let trackerEl = null;
  let trackerCollapsed = false;

  const DEFAULT_AVATAR_KEY = 'basecity:default_avatar:v1';
  const BASE_CUSTOM = { name: 'Default Builder', skin: 0xf2cfa0, hatStyle: 'cap', hatColor: 0x0052ff, hairColor: 0x2b1d14, shirt: 0x2563eb, pants: 0x334155, memeItem: 'none' };
  function loadDefaultAvatar() {
    try {
      const saved = JSON.parse(localStorage.getItem(DEFAULT_AVATAR_KEY) || 'null');
      if (saved && typeof saved === 'object') return { ...BASE_CUSTOM, ...saved };
    } catch { /* ignore */ }
    return { ...BASE_CUSTOM };
  }
  let customAvatar = loadDefaultAvatar();
  let draftAvatar = { ...customAvatar };

  const world = createGameWorld({
    city,
    toast,
    getWallet: () => ({ account: walletAccount, provider: walletProvider }),
    getBlocky: () => activeBlocky,
    getCitizenTier: () => getCitizenTier(),
    getMemeItem: () => customAvatar.memeItem || 'none',
    getCustomAvatar: () => customAvatar,
    onEquipMemeItem: (id) => {
      const valid = OG_MEME_ITEMS.some((x) => x.id === id) ? id : 'none';
      saveDefaultAvatar({ ...customAvatar, memeItem: valid });
      draftAvatar = { ...customAvatar };
      spawnAvatar(makeDefaultBuilder());
      const def = OG_MEME_ITEMS.find((x) => x.id === valid) || OG_MEME_ITEMS[0];
      toast?.('OG SKILL EQUIPPED', `${def.name} (${def.token})`, `${def.skill} · ${def.badge}`);
    },
    onOpenAction: (act, arg) => {
      if (String(act).startsWith('node:')) {
        const nid = act.slice(5);
        const node = GAME_NODES.find((n) => n.id === nid);
        if (node) world.handleNodeInteract(node);
        return;
      }
      onOpenAction?.(act, arg);
    },
    onTravelTo: (x, z, label) => navigateTo(x, z, label),
    onTeleportTo: (x, z) => travelTo(x, z),
    onOpenLocker: (onBack) => openLocker(onBack),
    onStateChange: () => { syncUserPill(); renderHotbar(); renderQuestTracker(); },
  });

  function initDockSprites() {
    if (userBtn) userBtn.innerHTML = `${itemIcon('user-avatar', 18)}<span>User (U)</span>`;
    if (mapBtn) mapBtn.innerHTML = `${itemIcon('compass-gold', 18)}<span>Map (M)</span>`;
    if (questBtn) questBtn.innerHTML = `${itemIcon('poi-tasks', 18)}<span>Tasks (T)</span>`;
    if (newsBtn) newsBtn.innerHTML = `${itemIcon('newspaper', 18)}<span>News (N)</span>`;
    if (shopBtn) shopBtn.innerHTML = `${itemIcon('poi-shop', 18)}<span>Shop (B)</span>`;
    if (rankBtn) rankBtn.innerHTML = `${itemIcon('poi-ranks', 18)}<span>Ranks (L)</span>`;
  }
  initDockSprites();

  if (hud && !document.getElementById('play-hotbar')) {
    hotbarEl = document.createElement('div');
    hotbarEl.id = 'play-hotbar';
    hotbarEl.className = 'mc-hotbar';
    hotbarEl.setAttribute('aria-label', 'Quick Hotbar');
    hud.appendChild(hotbarEl);
    hotbarEl.addEventListener('click', (e) => {
      const slot = e.target.closest('[data-hslot]')?.dataset.hslot;
      if (!slot || modalOpen()) return;
      if (slot === 'pickaxe') { world.openUser('inventory'); return; }
      if (slot === 'espresso') { world.useConsumable('gm-espresso'); return; }
      if (slot === 'overclock') { world.useConsumable('overclock-core'); return; }
      if (slot === 'warp') { world.useConsumable('warp-beacon'); return; }
      if (slot === 'meme') { world.triggerMemeSkill(); return; }
      if (slot === 'shop') { world.openShop('consumables'); }
    });
  }

  function renderHotbar() {
    if (!hotbarEl) return;
    const hb = world.getHotbarState();
    const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    hotbarEl.innerHTML = `
      <button type="button" class="mc-hslot" data-hslot="pickaxe" title="Equipped Pickaxe Lv.${hb.pickaxeLv} · Click to open Inventory & Craft">
        <i class="mc-hkey">U</i>
        ${itemIcon(hb.pickaxeId, 28)}
        <b class="mc-hcnt">Lv.${hb.pickaxeLv}</b>
      </button>
      <button type="button" class="mc-hslot${hb.espressoSecs > 0 ? ' active' : ''}${hb.espresso <= 0 ? ' empty' : ''}" data-hslot="espresso" title="gm Espresso (Key 4): +50 Energy & +25% Speed for 5m">
        <i class="mc-hkey">4</i>
        ${itemIcon('gm-espresso', 28)}
        <b class="mc-hcnt">${hb.espressoSecs > 0 ? fmtTime(hb.espressoSecs) : `x${hb.espresso}`}</b>
      </button>
      <button type="button" class="mc-hslot${hb.overclockReady ? ' active' : ''}${hb.overclock <= 0 && !hb.overclockReady ? ' empty' : ''}" data-hslot="overclock" title="Overclock Core (Key 5): 2x next Chip Fab craft yield">
        <i class="mc-hkey">5</i>
        ${itemIcon('overclock-core', 28)}
        <b class="mc-hcnt">${hb.overclockReady ? '2X' : `x${hb.overclock}`}</b>
      </button>
      <button type="button" class="mc-hslot${hb.warp <= 0 ? ' empty' : ''}" data-hslot="warp" title="Base Warp Beacon (Key 6): Instant teleport to Personal Plot">
        <i class="mc-hkey">6</i>
        ${itemIcon('warp-beacon', 28)}
        <b class="mc-hcnt">x${hb.warp}</b>
      </button>
      <button type="button" class="mc-hslot${hb.memeActiveSecs > 0 || hb.aybReady ? ' active' : ''}${hb.meme?.id === 'none' ? ' empty' : ''}" data-hslot="meme" title="${esc(hb.meme?.name || 'OG Skill')} (Key 7): ${esc(hb.meme?.desc || '')}">
        <i class="mc-hkey">7</i>
        <span style="font-size:10px;font-weight:800;letter-spacing:0.3px;color:${esc(hb.meme?.color || '#94a3b8')}">${esc(hb.meme?.id === 'none' ? 'OG' : hb.meme?.token?.replace('$', '') || 'OG')}</span>
        <b class="mc-hcnt">${hb.meme?.type === 'active' ? (hb.memeActiveSecs > 0 ? `${hb.memeActiveSecs}s` : hb.aybReady ? '2X' : hb.memeCdSecs > 0 ? `${hb.memeCdSecs}s` : 'READY') : (hb.meme?.id === 'none' ? 'NONE' : 'PASSIVE')}</b>
      </button>
      <button type="button" class="mc-hslot" data-hslot="shop" title="BaseCity Supply Shop (Key B): Restock Consumables & Tools">
        <i class="mc-hkey">B</i>
        ${itemIcon('poi-shop', 28)}
        <b class="mc-hcnt">Shop</b>
      </button>`;
  }

  if (hud && !document.getElementById('play-qtracker')) {
    trackerEl = document.createElement('div');
    trackerEl.id = 'play-qtracker';
    trackerEl.className = 'gm-qtracker';
    hud.appendChild(trackerEl);
    trackerEl.addEventListener('click', (e) => {
      const claimId = e.target.closest('[data-qt-claim]')?.dataset.qtClaim;
      if (claimId) { world.claimDailyMission(claimId); return; }
      if (e.target.closest('[data-qt-open]')) { world.openUser('quests'); return; }
      if (e.target.closest('[data-qt-toggle]')) { trackerCollapsed = !trackerCollapsed; renderQuestTracker(); }
    });
  }

  function renderQuestTracker() {
    if (!trackerEl) return;
    const p = world.getProgressionSummary();
    const readyCount = p.dailies.filter((d) => d.ready).length;
    trackerEl.innerHTML = `
      <div class="qt-head" data-qt-toggle="1">
        ${itemIcon('quest-medal', 16)}
        <b>LV.${p.level} · ${esc(p.rankTitle)}</b>
        ${readyCount ? `<span class="qt-dot">${readyCount}</span>` : ''}
        <span class="qt-tog">${trackerCollapsed ? '+' : '-'}</span>
      </div>
      <div class="qt-xp"><i style="width:${p.pct}%"></i></div>
      ${trackerCollapsed ? '' : `<div class="qt-list">${p.dailies.map((m) => `
        <div class="qt-row${m.claimed ? ' done' : ''}">
          <span>${esc(m.title)}</span>
          ${m.ready ? `<button type="button" class="qt-claim" data-qt-claim="${esc(m.id)}">Claim</button>` : `<small>${m.claimed ? 'DONE' : `${m.cur}/${m.target}`}</small>`}
        </div>`).join('')}</div>
        <button type="button" class="qt-all" data-qt-open="1">All Quests &amp; Passport (${p.passportCount}/${p.passportTotal})</button>`}`;
  }

  let inspectEl = null;
  let inspectedView = null;
  if (hud && !document.getElementById('gm-inspect')) {
    inspectEl = document.createElement('aside');
    inspectEl.id = 'gm-inspect';
    inspectEl.className = 'gm-inspect';
    inspectEl.hidden = true;
    hud.appendChild(inspectEl);
  }

  function closeInspect() {
    if (inspectedView) { inspectedView.setSelected?.(false); inspectedView = null; }
    if (inspectEl) inspectEl.hidden = true;
  }

  function showInspect({ eyebrow, title, sub = '', pfp = '', rows = [], desc = '', gps = null, primaryLbl = '', onPrimary = null, link = null }) {
    if (!inspectEl) return;
    const rowsHtml = rows.length ? `<dl class="gmi-dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '';
    const descHtml = desc ? `<p class="gmi-desc">${esc(desc)}</p>` : '';
    inspectEl.innerHTML = `
      <div class="gmi-head">
        ${pfp ? `<img class="gmi-pfp" src="${pfp}" alt="${esc(title)}" />` : ''}
        <div class="gmi-title">
          <small>${esc(eyebrow)}</small>
          <b>${esc(title)}</b>
          ${sub ? `<span>${esc(sub)}</span>` : ''}
        </div>
        <button type="button" class="gmi-x" id="gmi-close" aria-label="Close">Close</button>
      </div>
      ${descHtml}
      ${rowsHtml}
      <div class="gmi-acts">
        ${primaryLbl && onPrimary ? `<button type="button" class="gm-poi-open" id="gmi-pri">${esc(primaryLbl)}</button>` : ''}
        ${gps ? `<button type="button" class="gm-poi-go" id="gmi-gps">Go Here (GPS)</button>` : ''}
        ${link ? `<a class="gm-poi-go" href="${esc(link.href)}"${link.ext ? ' target="_blank" rel="noopener"' : ''}>${esc(link.label)}</a>` : ''}
      </div>`;
    inspectEl.hidden = false;
    inspectEl.querySelector('#gmi-close').onclick = closeInspect;
    inspectEl.querySelector('#gmi-pri')?.addEventListener('click', () => { const fn = onPrimary; closeInspect(); fn?.(); });
    inspectEl.querySelector('#gmi-gps')?.addEventListener('click', () => { navigateTo(gps[0], gps[1], title); });
  }

  function inspectCharacter(v) {
    if (!v?.b) return;
    if (inspectedView && inspectedView !== v) inspectedView.setSelected?.(false);
    inspectedView = v;
    v.setSelected?.(true);
    const b = v.b;
    const s = sim?.();
    const placed = s ? s.blocksBy(b, now()) : 0;
    const rare = b.trait && TRAIT_LABEL?.[b.trait] ? ` · ${b.rarity?.label || ''} ${TRAIT_LABEL[b.trait]}` : (b.rarity?.label && b.rarity.id !== 'common' ? ` · ${b.rarity.label}` : '');
    const eyebrow = b.kind === 'founder' ? 'FOUNDER' : b.kind === 'legend' ? (b.office ? `${b.office.label.toUpperCase()} · CITY COUNCIL` : 'BASE BUILDER') : `BLOCKY #${b.id}${rare.toUpperCase()}`;
    const ownerLbl = b.kind === 'founder' ? 'Founder' : b.kind === 'legend' ? 'Base Builder' : b.from ? who(b.from, 22) : 'City Crew';
    showInspect({
      eyebrow,
      title: b.name,
      sub: `${b.role?.label || 'Builder'} · ${Number(b.skill || 1).toFixed(1)}x skill`,
      pfp: renderPfp(b, { size: 128, mark: false }),
      rows: [
        ['Status', v.status || 'Building'],
        ['Blocks placed', Number(placed || 0).toLocaleString('en-US')],
        ['Brought by', ownerLbl],
      ],
      gps: [v.group.position.x, v.group.position.z],
      link: b.kind === 'blocky' ? { href: `/collection.html#${b.id}`, label: 'View NFT' } : null,
    });
  }

  function inspectLotAt(wx, wz) {
    const li = Math.round(wx / PITCH);
    const lj = Math.round(wz / PITCH);
    const key = `${li},${lj}`;
    const node = GAME_NODES.find((n) => n.lot[0] === li && n.lot[1] === lj);
    if (node) {
      const cd = world.getCooldownRemaining(node.kind);
      showInspect({
        eyebrow: 'GAME NODE · INTERACTIVE',
        title: node.full,
        desc: node.desc,
        rows: cd > 0 ? [['Cooldown', world.fmtCooldown(cd)]] : [['Status', 'Ready (Press E nearby)']],
        gps: [node.enter[0], node.enter[1]],
        primaryLbl: node.actionLbl,
        onPrimary: () => world.handleNodeInteract(node),
      });
      return;
    }
    if (STOCKS_LOTS.has(key)) {
      showInspect({
        eyebrow: 'DISTRICT · BLOCKY STREET',
        title: 'Blocky Street · Tokenized Stocks',
        desc: 'Trade Coinbase Tokenized Stocks 24/7 & 1-tx Sector Baskets on Base.',
        gps: [-36, 0],
        primaryLbl: 'Trade Stocks',
        onPrimary: () => onOpenAction?.('trade'),
      });
      return;
    }
    if (BASELIVE_LOTS.has(key)) {
      showInspect({
        eyebrow: 'DISTRICT · BASE LIVE',
        title: 'Base Live District',
        desc: 'Real-time Base Mainnet blocks & live transaction streams.',
        gps: [-36, 28],
        primaryLbl: 'Open Base Live',
        onPrimary: () => onOpenAction?.('live'),
      });
      return;
    }
    const s = sim?.();
    const p = s?.standing?.get(key);
    if (p) {
      const gx = p.lot ? p.lot[0] * PITCH : li * PITCH;
      const gz = p.lot ? p.lot[1] * PITCH : lj * PITCH;
      const poi = ALL_POIS.find((x) => x.lot[0] === li && x.lot[1] === lj);
      if (p.brand) {
        const proj = PROJECTS.find((x) => x.id === p.brand.id);
        showInspect({
          eyebrow: 'BASE AVENUE HQ',
          title: p.brand.label || `${p.brand.name} HQ`,
          desc: proj?.tagline || p.brand.tagline || 'Base Ecosystem Project Headquarters.',
          rows: [['Grid', `(${li}, ${lj})`]],
          gps: [gx, gz + 4],
          primaryLbl: 'Open HQ & Stamp',
          onPrimary: () => (proj ? world.openProjectDossier(proj) : onInteract?.(p)),
          link: p.brand.url ? { href: p.brand.url, label: 'Website', ext: true } : null,
        });
        return;
      }
      if (p.whale) {
        showInspect({
          eyebrow: p.whale.tier ? p.whale.tier.toUpperCase() : 'WHALE LANDMARK',
          title: p.name || 'Whale Building',
          desc: p.whale.lostAt <= now() ? 'Went dark after whale sold — FOR SALE to the next whale.' : `Built for ${p.whale.name || who(p.whale.from, 22) || 'a Base whale'}.`,
          rows: [['Owner', p.whale.name || (p.whale.from ? who(p.whale.from, 22) : '—')], ['Grid', `(${li}, ${lj})`]],
          gps: [gx, gz + 4],
        });
        return;
      }
      const specialMap = {
        square: { eye: 'CIVIC CORE', act: 'Open Hall of Fame', fn: () => onOpenRanks?.() },
        exchange: { eye: 'TRADING FLOOR', act: 'Buy $BLOCKY', fn: () => onOpenAction?.('blocky') },
        agenthub: { eye: 'AGENT HUB', act: 'Open x402 HQ', fn: () => onOpenAction?.('hq') },
        launchpad: { eye: 'LAUNCHPAD', act: 'Launch Token', fn: () => onOpenAction?.('launch') },
        stage: { eye: 'ENTERTAINMENT', act: 'Enter Cinema', fn: () => onOpenAction?.('cinema') },
      };
      const sp = specialMap[p.type];
      showInspect({
        eyebrow: sp?.eye || (p.kind === 'landmark' ? 'CITY LANDMARK' : 'CITY BUILDING'),
        title: p.name || poi?.full || p.type,
        desc: poi?.desc || `Built 24/7 by BaseCity Blockies at grid (${li}, ${lj}).`,
        rows: [['Grid', `(${li}, ${lj})`], ...(p.h ? [['Height', `${Math.round(p.h)} blocks`]] : [])],
        gps: p.type === GPU_FRONTAGE.type ? [gx + GPU_FRONTAGE.entranceX, gz + GPU_FRONTAGE.roadZ] : poi?.enter || [gx, gz + 4],
        primaryLbl: sp?.act || '',
        onPrimary: sp?.fn || null,
      });
      return;
    }
    const site = s?.sites?.find((st) => st.p?.lot && st.p.lot[0] === li && st.p.lot[1] === lj);
    if (site) {
      showInspect({
        eyebrow: 'UNDER CONSTRUCTION',
        title: site.p.name || 'Construction Site',
        desc: 'Blockies are actively placing blocks on this lot.',
        rows: [['Grid', `(${li}, ${lj})`]],
        gps: [li * PITCH, lj * PITCH + 4],
      });
      return;
    }
    if (isWater(li, lj)) {
      showInspect({
        eyebrow: 'WATERWAY',
        title: 'Base River',
        desc: 'Flows past the River Silicon Quarry.',
        rows: [['Grid', `(${li}, ${lj})`]],
        gps: [14, 0],
      });
      return;
    }
    closeInspect();
  }

  function syncUserPill() {
    if (!userPill) return;
    const s = world.getHudSummary();
    userPill.innerHTML = `<span class="mc-pill-it">${itemIcon('coin-usdc', 15)}<b>$${s.usdc.toFixed(2)}</b></span><span class="mc-pill-it">${itemIcon('silicon', 15)}${s.silicon}</span><span class="mc-pill-it">${itemIcon('chips', 15)}${s.chips}</span><span class="mc-pill-it">${itemIcon('energy', 15)}${s.energy}/${s.maxEnergy}</span>${s.espressoOn ? `<span class="mc-pill-buff">${itemIcon('buff-speed', 14)}SPEED</span>` : ''}`;
  }

  // GTA Minimap Radar (bottom-left)
  let mapWrap = null, mapCanvas = null, mapCtx = null, mapLocEl = null;
  if (hud && !document.getElementById('play-minimap')) {
    mapWrap = document.createElement('div');
    mapWrap.id = 'play-minimap';
    mapWrap.className = 'play-minimap';
    mapWrap.innerHTML = `
      <div class="pm-head"><span id="pm-loc">CIVIC CORE</span><button type="button" id="pm-expand" class="pm-exp">MAP (M)</button></div>
      <canvas id="pm-canvas" width="184" height="184"></canvas>`;
    hud.appendChild(mapWrap);
    mapCanvas = mapWrap.querySelector('#pm-canvas');
    mapCtx = mapCanvas.getContext('2d');
    mapLocEl = mapWrap.querySelector('#pm-loc');
  }

  // Fullscreen Onchain City Atlas Modal (M) — game-native command menu + teleport map
  let mapCat = 'all';
  let hoverPoiId = null;
  const fullMapWrap = document.createElement('div');
  fullMapWrap.className = 'gm-modal-wrap';
  fullMapWrap.hidden = true;
  fullMapWrap.innerHTML = `
    <div class="td gm-map-modal wide" role="dialog" aria-modal="true" aria-label="BaseCity Onchain Map">
      <div class="td-head">
        ${itemSprite('compass-gold', 38)}
        <div class="td-title"><b>BASECITY ATLAS · ONCHAIN MAP</b><span>Auto-walk or auto-drive via GPS to any district, or open buildings directly</span></div>
        <button type="button" class="td-x" id="gm-map-close">Close</button>
      </div>
      <div class="gm-map-filters" id="gm-map-cats">${MAP_CATS.map(([id, lbl]) => `<button type="button" class="b10-sec-pill${id === 'all' ? ' on' : ''}" data-mcat="${id}">${lbl}</button>`).join('')}</div>
      <div class="gm-map-body">
        <div class="gm-map-left">
          <canvas id="gm-full-canvas" width="440" height="440"></canvas>
          <div class="gm-map-hint">Click any building pin or road to auto-walk / auto-drive via GPS</div>
        </div>
        <div class="gm-map-right">
          <div class="gm-stock-strip" id="gm-stock-strip"></div>
          <div class="gm-poi-list" id="gm-poi-list"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(fullMapWrap);
  const fullMapCanvas = fullMapWrap.querySelector('#gm-full-canvas');
  const fullMapCtx = fullMapCanvas.getContext('2d');
  const fullPoiList = fullMapWrap.querySelector('#gm-poi-list');
  const stockStripEl = fullMapWrap.querySelector('#gm-stock-strip');

  function renderFullMapDirectory() {
    fullMapWrap.querySelectorAll('[data-mcat]').forEach((b) => b.classList.toggle('on', b.dataset.mcat === mapCat));
    const list = mapCat === 'all' ? ALL_POIS : ALL_POIS.filter((p) => p.cat === mapCat);
    fullPoiList.innerHTML = list.map((p) => `
      <div class="gm-poi-card" data-hpoi="${p.id}">
        <div class="gm-poi-top">
          ${itemSprite(poiSpriteId(p.id), 36)}
          <div><b>${esc(p.full)}</b><small>${esc(p.desc)}</small></div>
        </div>
        <div class="gm-poi-acts">
          <button type="button" class="gm-poi-go" data-poi-go="${p.id}">Go Here (GPS)</button>
          <button type="button" class="gm-poi-open" data-poi-open="${p.id}">${esc(p.actionLbl)}</button>
        </div>
      </div>`).join('');

    const towers = street?.getTowers?.() || [];
    if (stockStripEl) {
      const showStocks = (mapCat === 'all' || mapCat === 'trade') && towers.length > 0;
      stockStripEl.hidden = !showStocks;
      if (showStocks) {
        stockStripEl.innerHTML = `<div class="gm-strip-lbl">BLOCKY STREET · STOCK TOWERS (CLICK TO TRADE)</div><div class="gm-strip-chips">${towers.map((tw) => `<button type="button" class="gm-stk-chip" data-stktrade="${esc(tw.ticker)}"><b>${esc(tw.ticker)}</b>${tw.price ? `<span>$${Number(tw.price).toFixed(0)}</span>` : ''}</button>`).join('')}</div>`;
      }
    }
  }

  function openFullMap() {
    fullMapWrap.hidden = false;
    renderFullMapDirectory();
    drawRadar(fullMapCtx, fullMapCanvas, true);
  }

  // Welcome / Onboarding Modal (opens immediately at 0ms on Game Mode entry, with Connect Wallet + Character Picker)
  const WELCOME_HIDE_KEY = 'basecity:gm:hide_welcome:v2';
  const welcomeWrap = document.createElement('div');
  welcomeWrap.className = 'gm-modal-wrap';
  welcomeWrap.hidden = true;
  welcomeWrap.innerHTML = `
    <div class="td gm-welcome-modal" role="dialog" aria-modal="true" aria-label="Welcome to BaseCity Game Mode">
      <div class="td-head">
        ${itemSprite('user-avatar', 40)}
        <div class="td-title">
          <b>WELCOME TO BASECITY · GAME MODE</b>
          <span>Connect wallet, choose your Builder or Blocky &amp; start exploring Base</span>
        </div>
        <button type="button" class="td-x" id="gm-wel-close">Close</button>
      </div>
      <div id="gm-wel-status" class="gmw-status"></div>
      <div id="gm-wel-wbox" class="lp-wallet-box" style="margin-top:10px" hidden>
        <div class="lp-wallet-head"><span>Connect Base Wallet</span><button type="button" id="gm-wel-wclose" class="lp-mini-x">Close</button></div>
        <div id="gm-wel-wlist" class="lp-wallet-list"></div>
      </div>
      <div class="gmw-steps">
        <div class="gmw-step">
          ${itemSprite('silicon', 36)}
          <div>
            <b>1. Mine &amp; Craft</b>
            <span>Walk (WASD) or Drive (V) to the River Silicon Quarry, press <b>E</b> to mine Silicon, then craft AI Chips in <b>User (U)</b>.</span>
          </div>
        </div>
        <div class="gmw-step">
          ${itemSprite('poi-plot', 36)}
          <div>
            <b>2. Claim &amp; Build Plot</b>
            <span>Press <b>P</b> to claim your 3x3 Personal Plot, place buffed buildings, and upgrade them from Lv.1 to Lv.3.</span>
          </div>
        </div>
        <div class="gmw-step">
          ${itemSprite('coin-usdc', 36)}
          <div>
            <b>3. Earn &amp; Trade Onchain</b>
            <span>Complete Base USDC Tasks (<b>T</b>), trade 24/7 Stocks via Atlas (<b>M</b>), and unlock Citizen Level perks (<b>U</b>).</span>
          </div>
        </div>
      </div>
      <div class="gmw-keys">
        <span><b>WASD</b> Move</span>
        <span><b>V</b> Drive</span>
        <span><b>E</b> Interact</span>
        <span><b>C</b> Character</span>
        <span><b>U</b> Profile</span>
        <span><b>P</b> Plot</span>
        <span><b>M</b> Map</span>
        <span><b>4/5/6</b> Hotbar</span>
      </div>
      <div class="gmw-acts" id="gm-wel-acts"></div>
      <label class="gmw-foot-opt"><input type="checkbox" id="gm-wel-mute" /> <span>Don't show automatically next time (always available via Guide)</span></label>
    </div>`;
  document.body.appendChild(welcomeWrap);

  // Character Locker Modal (C) — strictly requires owning a Blocky (or buying $BLOCKY)
  const lockerWrap = document.createElement('div');
  lockerWrap.className = 'gm-modal-wrap';
  lockerWrap.hidden = true;
  lockerWrap.innerHTML = `
    <div class="td gm-locker" role="dialog" aria-modal="true" aria-label="Character Locker">
      <div class="td-head">
        ${itemSprite('user-avatar', 38)}
        <div class="td-title"><b>CHARACTER LOCKER</b><span>Customize Default Builder or equip your Blocky NFT on Base</span></div>
        <div class="td-head-acts">
          <button type="button" class="td-back" id="gm-lock-back" hidden>Back</button>
          <button type="button" class="td-x" id="gm-lock-close">Close</button>
        </div>
      </div>
      <div id="gm-lock-wallet" class="gm-lock-wallet"></div>
      <div id="gm-lock-wbox" class="lp-wallet-box" hidden>
        <div class="lp-wallet-head"><span>Select Wallet</span><button type="button" id="gm-lock-wclose" class="lp-mini-x">Close</button></div>
        <div id="gm-lock-wlist" class="lp-wallet-list"></div>
      </div>
      <div id="gm-lock-body" class="gm-lock-body"></div>
    </div>`;
  document.body.appendChild(lockerWrap);

  // BaseCity Native TaskMarket & Citizen Missions Modal (T)
  const tasksWrap = document.createElement('div');
  tasksWrap.className = 'gm-modal-wrap';
  tasksWrap.hidden = true;
  tasksWrap.innerHTML = `
    <div class="td gm-tasks-modal" role="dialog" aria-modal="true" aria-label="BaseCity Tasks">
      <div class="td-head">
        ${itemSprite('poi-tasks', 38)}
        <div class="td-title"><b>BASECITY TASKS</b><span>Native Base USDC task board · Requester & Blocky Worker</span></div>
        <button type="button" class="td-x" id="gm-tasks-close">Close</button>
      </div>
      <div class="lp-seg" style="margin-top:12px" id="gm-task-tabs">
        <button type="button" class="lp-seg-btn on" data-ttab="board">Task Board</button>
        <button type="button" class="lp-seg-btn" data-ttab="post">Post Task</button>
        <button type="button" class="lp-seg-btn" data-ttab="analyst">Blocky Analyst (x402)</button>
      </div>
      <div id="gm-tasks-body"></div>
    </div>`;
  document.body.appendChild(tasksWrap);

  let active = false;
  let avatar = null;
  let activeBlocky = null;
  let carMesh = null;
  let gmBubble = null;
  let padsObj = null;
  let mode = 'walk';
  let yaw = 0;
  let pitch = 0.57;
  let vy = 0;
  let speedCur = 0;
  let grounded = true;
  let nearLot = null;
  let nearAcc = 0;
  let mapAcc = 0;
  let rayAcc = 0;
  let armScale = 1;
  let armScaleWant = 1;
  let cameraHeight = 1.45;
  const fadedMeshes = [];
  let fadedBuilding = null;

  function fadeBuilding(building) {
    if (building === fadedBuilding) return;
    for (const { mesh, original, faded, shadow } of fadedMeshes) {
      mesh.material = original;
      mesh.castShadow = shadow;
      for (const material of faded) material.dispose();
    }
    fadedMeshes.length = 0;
    fadedBuilding = building;
    building?.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.material) return;
      const original = mesh.material;
      const faded = (Array.isArray(original) ? original : [original]).map((material) => {
        const copy = material.clone();
        copy.transparent = true;
        copy.opacity *= 0.22;
        copy.depthWrite = false;
        return copy;
      });
      fadedMeshes.push({ mesh, original, faded, shadow: mesh.castShadow });
      mesh.material = Array.isArray(original) ? faded : faded[0];
      mesh.castShadow = false;
    });
  }
  let prevDpr = null;
  let navGoal = null;
  let navPath = [];
  let navStuckT = 0;
  let emoteWaveT = 0;
  let walletAccount = null;
  let walletProvider = null;
  let ownedBlockies = [];
  let hasBlockyNft = false;
  let lockerBack = null;
  let lockerTab = 'customize';

  const SKIN_SWATCHES = [0xf8d9c0, 0xf2cfa0, 0xdca574, 0xb97c52, 0x8d5524, 0x5c3822];
  const HAT_STYLES = [
    ['cap', 'Cap'],
    ['beanie', 'Beanie'],
    ['hardhat', 'Hard Hat'],
    ['short', 'Short Hair'],
    ['spiky', 'Spiky'],
    ['bob', 'Bob'],
    ['none', 'None'],
  ];
  const HAT_SWATCHES = [0x0052ff, 0x1e293b, 0xf4c542, 0xe74c3c, 0x2ecc71, 0xf1f5f9, 0x8b5cf6];
  const HAIR_SWATCHES = [0x1b1b1b, 0x2b1d14, 0x6b4423, 0xd9a441, 0xc0392b, 0x9aa3ad, 0x0052ff];
  const SHIRT_SWATCHES = [0x2563eb, 0x1e293b, 0xf1f5f9, 0x16a34a, 0xdc2626, 0xf59e0b, 0x7c3aed];
  const PANTS_SWATCHES = [0x334155, 0x1e293b, 0x1d4ed8, 0x57534e, 0x0f172a, 0x64748b];

  function saveDefaultAvatar(cfg) {
    customAvatar = { ...BASE_CUSTOM, ...cfg, name: String(cfg.name || 'Default Builder').trim().slice(0, 20) || 'Default Builder' };
    try { localStorage.setItem(DEFAULT_AVATAR_KEY, JSON.stringify(customAvatar)); } catch { /* ignore */ }
  }

  function makeDefaultBuilder(override = null) {
    const c = override ? { ...BASE_CUSTOM, ...override } : customAvatar;
    return {
      id: 'default-builder',
      n: 0,
      kind: 'default',
      name: c.name || 'Default Builder',
      from: walletAccount || '',
      role: { id: 'default', label: 'BaseCity Builder', hat: c.hatColor },
      skin: c.skin,
      shirt: c.shirt,
      custom: {
        skin: c.skin,
        shirt: c.shirt,
        pants: c.pants,
        hairColor: c.hairColor,
        hatStyle: c.hatStyle,
        hatColor: c.hatColor,
        memeItem: c.memeItem || 'none',
      },
    };
  }

  function getCitizenTier() {
    if (!walletAccount) return { id: 'visitor', label: 'VISITOR', short: 'Local Save · Connect wallet for Cloud Sync', eligible: false };
    if (hasBlockyNft) return { id: 'citizen', label: 'VERIFIED CITIZEN', short: 'ERC-721 NFT · Citizen Perks & Flywheel Active', eligible: true };
    if (ownedBlockies.length > 0) return { id: 'newcomer', label: 'NEWCOMER BLOCKY', short: '$BLOCKY Holder · Hold 1h to Claim ERC-721 NFT', eligible: false };
    return { id: 'builder', label: 'DEFAULT BUILDER', short: 'Wallet Connected · Cloud Synced', eligible: false };
  }
  let tasksDone = new Set();
  let allTasksAwarded = false;
  let cityTasks = [];
  let taskTab = 'board';
  let taskFilter = 'open';
  let taskAudience = 'all';
  let taskExpanded = null;
  let taskBusyMsg = '';
  let taskLoading = false;
  let walletStocks = [];
  let allBaseStocks = [];
  let linkedBlockyAgentId = '';
  let intelItems = [];
  let intelTicker = 'NVDA';
  let intelShowForm = false;
  let intelBusyMsg = '';

  const pos = v3();
  const keys = new Set();
  const touch = { f: false, b: false, l: false, r: false };
  const ray = new THREE.Raycaster();
  const clickRay = new THREE.Raycaster();
  const moveRay = new THREE.Raycaster();
  const rayOrg = v3();
  const rayDir = v3();
  const armDir = v3();
  const camTarget = v3();
  const camWant = v3();
  const lookAt = v3();

  let dragging = false;
  let downPtr = [0, 0];
  let lastPtr = [0, 0];

  function loadTasks() {
    try {
      const k = `basecity:tasks:${(walletAccount || 'anon').toLowerCase()}`;
      const saved = JSON.parse(localStorage.getItem(k) || '[]');
      tasksDone = new Set(Array.isArray(saved) ? saved : []);
    } catch { tasksDone = new Set(); }
    allTasksAwarded = tasksDone.size >= CITIZEN_TASKS.length;
    updateQuestHud();
  }

  function saveTasks() {
    try {
      const k = `basecity:tasks:${(walletAccount || 'anon').toLowerCase()}`;
      localStorage.setItem(k, JSON.stringify([...tasksDone]));
    } catch { /* ignore */ }
  }

  function citizenRank() {
    const n = tasksDone.size;
    if (n >= 5) return 'CITY MAYOR';
    if (n >= 3) return 'BASE CITIZEN';
    if (n >= 1) return 'BUILDER';
    return 'NEWCOMER';
  }

  function updateCharButton() {
    if (!charBtn) return;
    charBtn.textContent = activeBlocky ? `${activeBlocky.name} (C)` : 'Character (C)';
  }

  function updateQuestHud() {
    if (!questBtn) return;
    questBtn.innerHTML = `${itemIcon('poi-tasks', 18)}<span>Tasks (T)</span>`;
  }

  function markTask() { /* Citizen Missions removed — real USDC tasks only */ }

  function renderTasksModal() {
    tasksWrap.querySelectorAll('[data-ttab]').forEach((b) => b.classList.toggle('on', b.dataset.ttab === taskTab));
    const bodyEl = tasksWrap.querySelector('#gm-tasks-body');

    if (taskTab === 'missions') {
      const pct = Math.round((tasksDone.size / CITIZEN_TASKS.length) * 100);
      bodyEl.innerHTML = `
        <div class="gm-rank-bar">
          <div class="gm-rank-top"><span>RANK: <b>${citizenRank()}</b></span><span>${tasksDone.size}/${CITIZEN_TASKS.length} completed</span></div>
          <div class="gm-rank-track"><div class="gm-rank-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="gm-tasks-list">${CITIZEN_TASKS.map((t) => {
          const done = tasksDone.has(t.id);
          return `<div class="gm-task-row${done ? ' done' : ''}">
            <div class="gm-task-info">
              <b>${esc(t.title)} <small>${done ? 'DONE' : esc(t.reward)}</small></b>
              <span>${esc(t.desc)}</span>
            </div>
            <button type="button" class="btn small-pill" data-task-go="${t.poi}">${done ? 'Visit' : 'Go'}</button>
          </div>`;
        }).join('')}</div>`;
      bodyEl.querySelectorAll('[data-task-go]').forEach((btn) => {
        btn.onclick = () => {
          const poi = POIS.find((p) => p.id === btn.dataset.taskGo);
          if (!poi) return;
          travelTo(poi.enter[0], poi.enter[1]);
          tasksWrap.hidden = true;
        };
      });
      return;
    }

    if (taskTab === 'post') {
      bodyEl.innerHTML = renderPostTaskHtml(walletAccount, walletStocks, allBaseStocks);
      const form = bodyEl.querySelector('#tm-post-form');
      const msgEl = bodyEl.querySelector('#tm-post-msg');
      const assetSel = form.querySelector('#tm-reward-asset');
      const amtInput = form.querySelector('#tm-reward-amt');
      assetSel?.addEventListener('change', () => {
        const [sym] = String(assetSel.value || 'USDC').split('|');
        amtInput.value = sym === 'USDC' ? '1' : '0.005';
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const [rewardToken, rewardTokenAddress, decStr, navStr] = String(fd.get('rewardAsset') || 'USDC||6|1').split('|');
        const rewardAmount = Number(String(fd.get('rewardAmount') || '0').replace(',', '.'));
        const nav = Number(navStr || 0);
        const estUsdc = rewardToken === 'USDC' ? rewardAmount : (nav > 0 ? rewardAmount * nav : 0);
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        msgEl.hidden = false; msgEl.className = 'lp-msg'; msgEl.textContent = 'Sign task in your Base wallet...';
        try {
          const created = await createCityTask({
            provider: walletProvider,
            account: walletAccount,
            title: fd.get('title'),
            brief: fd.get('brief'),
            category: fd.get('category'),
            mode: fd.get('mode'),
            audience: fd.get('audience'),
            expiryHours: fd.get('expiryHours'),
            rewardToken,
            rewardTokenAddress,
            rewardDecimals: Number(decStr) || (rewardToken === 'USDC' ? 6 : 8),
            rewardAmount,
            rewardUsdc: estUsdc,
          });
          cityTasks = [created, ...cityTasks.filter((x) => x.id !== created.id)];
          taskTab = 'board';
          taskFilter = 'open';
          taskExpanded = created.id;
          taskBusyMsg = `Posted task "${created.title}" (${formatTaskReward(created)}).`;
          renderTasksModal();
        } catch (err) {
          msgEl.className = 'lp-msg err';
          msgEl.textContent = rejected(err) ? 'Cancelled.' : (err.shortMessage || err.message || 'Could not post task.');
        } finally {
          btn.disabled = false;
        }
      };
      return;
    }

    if (taskTab === 'analyst') {
      const tickers = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'MSTR', 'COIN', 'SNDK', 'SPCX'];
      bodyEl.innerHTML = `
        <div class="b10-sec-pills" style="margin:10px 0" id="gm-si-tickers">
          ${tickers.map((t) => `<button type="button" class="b10-sec-pill${t === intelTicker ? ' on' : ''}" data-sitick="${t}">${t}</button>`).join('')}
        </div>
        ${renderStockIntelHtml({ items: intelItems, selectedTicker: intelTicker, account: walletAccount, showForm: intelShowForm, busyMsg: intelBusyMsg })}`;
      bodyEl.querySelector('#gm-si-tickers').onclick = async (e) => {
        const tk = e.target.closest('[data-sitick]')?.dataset.sitick;
        if (!tk || tk === intelTicker) return;
        intelTicker = tk;
        intelBusyMsg = '';
        intelItems = await fetchStockIntel(intelTicker);
        renderTasksModal();
      };
      bodyEl.querySelector('#si-toggle-pub').onclick = () => {
        intelShowForm = !intelShowForm;
        intelBusyMsg = '';
        renderTasksModal();
      };
      const pubForm = bodyEl.querySelector('#si-pub-form');
      if (pubForm) {
        pubForm.onsubmit = async (e) => {
          e.preventDefault();
          const fd = new FormData(pubForm);
          intelBusyMsg = 'Sign x402 intel in your Base wallet...';
          renderTasksModal();
          try {
            await publishStockIntel({
              provider: walletProvider,
              account: walletAccount,
              blockyName: activeBlocky?.name || 'Blocky Analyst',
              ticker: intelTicker,
              stance: fd.get('stance'),
              title: fd.get('title'),
              preview: fd.get('preview'),
              fullReport: fd.get('fullReport'),
              priceUsdc: fd.get('priceUsdc'),
            });
            intelShowForm = false;
            intelBusyMsg = `Published ${intelTicker} x402 intel! Earn USDC on every unlock.`;
            intelItems = await fetchStockIntel(intelTicker);
          } catch (err) {
            intelBusyMsg = rejected(err) ? 'Cancelled.' : (err.shortMessage || err.message || 'Publish failed.');
          }
          renderTasksModal();
        };
      }
      bodyEl.querySelectorAll('[data-si-remove]').forEach((btn) => {
        btn.onclick = async () => {
          const it = intelItems.find((x) => x.id === btn.dataset.siRemove);
          if (!it || !window.confirm(`Take "${it.title}" off the Stock Intel desk? Sign with your wallet (no gas).`)) return;
          btn.disabled = true;
          try {
            await removeStockIntel({ provider: walletProvider, account: walletAccount, id: it.id });
            intelBusyMsg = 'Report taken down.';
            intelItems = await fetchStockIntel(intelTicker);
          } catch (err) {
            intelBusyMsg = rejected(err) ? 'Cancelled.' : (err.shortMessage || err.message || 'Could not take it down.');
          }
          renderTasksModal();
        };
      });
      bodyEl.querySelectorAll('[data-si-unlock]').forEach((btn) => {
        btn.onclick = async () => {
          const it = intelItems.find((x) => x.id === btn.dataset.siUnlock);
          if (!it) return;
          btn.disabled = true;
          try {
            await unlockStockIntel({
              provider: walletProvider,
              account: walletAccount,
              item: it,
              onStatus: (m) => { intelBusyMsg = m; renderTasksModal(); },
            });
            intelBusyMsg = `Unlocked ${it.title} via x402!`;
            intelItems = await fetchStockIntel(intelTicker);
          } catch (err) {
            intelBusyMsg = rejected(err) ? 'Cancelled.' : (err.shortMessage || err.message || 'Unlock failed.');
          }
          renderTasksModal();
        };
      });
      return;
    }

    bodyEl.innerHTML = renderTaskBoardHtml({
      tasks: cityTasks,
      filter: taskFilter,
      audienceFilter: taskAudience,
      account: walletAccount,
      activeBlocky,
      linkedBlockyAgentId,
      expandedId: taskExpanded,
      busyMsg: taskBusyMsg,
      loading: taskLoading,
    });
    bodyEl.querySelectorAll('[data-tm-filter]').forEach((b) => {
      b.onclick = () => { taskFilter = b.dataset.tmFilter; taskBusyMsg = ''; renderTasksModal(); };
    });
    bodyEl.querySelectorAll('[data-tm-aud]').forEach((b) => {
      b.onclick = () => { taskAudience = b.dataset.tmAud; taskBusyMsg = ''; renderTasksModal(); };
    });
    bodyEl.querySelectorAll('[data-tm-toggle]').forEach((b) => {
      b.onclick = () => { taskExpanded = taskExpanded === b.dataset.tmToggle ? null : b.dataset.tmToggle; taskBusyMsg = ''; renderTasksModal(); };
    });
    bodyEl.querySelectorAll('[data-tm-invest]').forEach((b) => {
      b.onclick = () => { tasksWrap.hidden = true; openBlocky10(); };
    });
    bodyEl.querySelectorAll('[data-tm-claim]').forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        taskBusyMsg = 'Sign claim in your Base wallet...';
        renderTasksModal();
        try {
          const updated = await claimCityTask({
            provider: walletProvider,
            account: walletAccount,
            taskId: btn.dataset.tmClaim,
            blockyName: activeBlocky?.name || 'Blocky Citizen',
            actorType: btn.dataset.tmActor || 'citizen',
          });
          cityTasks = cityTasks.map((t) => (t.id === updated.id ? updated : t));
          taskBusyMsg = 'Task claimed exclusively! Submit your work before the deadline.';
        } catch (err) {
          taskBusyMsg = rejected(err) ? 'Cancelled.' : (err.shortMessage || err.message || 'Claim failed.');
        }
        renderTasksModal();
      };
    });
    bodyEl.querySelectorAll('[data-tm-unclaim]').forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const updated = await unclaimCityTask({ provider: walletProvider, account: walletAccount, taskId: btn.dataset.tmUnclaim });
          if (updated) cityTasks = cityTasks.map((t) => (t.id === updated.id ? updated : t));
          taskBusyMsg = 'Claim released. Task is open again.';
        } catch (err) {
          taskBusyMsg = err.message || 'Could not release claim.';
        }
        renderTasksModal();
      };
    });
    bodyEl.querySelectorAll('[data-tm-cancel]').forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const updated = await cancelCityTask({ provider: walletProvider, account: walletAccount, taskId: btn.dataset.tmCancel });
          if (updated) cityTasks = cityTasks.map((t) => (t.id === updated.id ? updated : t));
          taskBusyMsg = 'Task cancelled.';
        } catch (err) {
          taskBusyMsg = rejected(err) ? 'Cancelled.' : (err.message || 'Could not cancel task.');
        }
        renderTasksModal();
      };
    });
    bodyEl.querySelectorAll('[data-tm-blueform]').forEach((form) => {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const task = cityTasks.find((x) => x.id === form.dataset.tmBlueform);
        if (!task) return;
        const fd = new FormData(form);
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        taskBusyMsg = 'Sign Blue Agent delivery in your Base wallet...';
        renderTasksModal();
        try {
          await submitBlueAgentJob({
            provider: walletProvider,
            account: walletAccount,
            task,
            tokenId: activeBlocky?.n || activeBlocky?.id,
            agentId: fd.get('agentId'),
            priceUsd: fd.get('priceUsd'),
            preview: fd.get('preview'),
            result: fd.get('result'),
          });
          cityTasks = await fetchCityTasks();
          taskBusyMsg = 'Delivered to Blue Agent Exchange! Paid in Base USDC once unlocked.';
          toast?.('JOB DELIVERED', task.title, 'Submitted via your Blocky');
        } catch (err) {
          taskBusyMsg = rejected(err) ? 'Cancelled.' : (err.shortMessage || err.message || 'Delivery failed.');
        }
        renderTasksModal();
      };
    });
    bodyEl.querySelectorAll('[data-tm-subform]').forEach((form) => {
      const actorSel = form.querySelector('[data-tm-actorsel]');
      const agentIn = form.querySelector('[data-tm-agentinput]');
      if (actorSel && agentIn) {
        actorSel.onchange = () => { agentIn.hidden = actorSel.value !== 'agent'; };
      }
      form.onsubmit = async (e) => {
        e.preventDefault();
        const taskId = form.dataset.tmSubform;
        const fd = new FormData(form);
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        taskBusyMsg = 'Sign delivery in your Base wallet...';
        renderTasksModal();
        try {
          const updated = await submitCityTask({
            provider: walletProvider,
            account: walletAccount,
            taskId,
            blockyName: activeBlocky?.name || 'Blocky Citizen',
            actorType: fd.get('actorType') || 'citizen',
            agentId: fd.get('agentId') || '',
            summary: fd.get('summary'),
            proofUrl: fd.get('proofUrl'),
          });
          cityTasks = cityTasks.map((t) => (t.id === updated.id ? updated : t));
          taskBusyMsg = 'Delivery submitted! Awaiting requester approval & Base USDC payout.';
        } catch (err) {
          taskBusyMsg = rejected(err) ? 'Cancelled.' : (err.shortMessage || err.message || 'Submission failed.');
        }
        renderTasksModal();
      };
    });
    bodyEl.querySelectorAll('[data-tm-pay]').forEach((btn) => {
      btn.onclick = async () => {
        const t = cityTasks.find((x) => x.id === btn.dataset.tmPay);
        const s = (t?.submissions || []).find((x) => x.id === btn.dataset.tmSub);
        if (!t || !s) return;
        btn.disabled = true;
        try {
          const txHash = await approveAndPayCityTask({
            provider: walletProvider,
            account: walletAccount,
            task: t,
            submission: s,
            onStatus: (m) => { taskBusyMsg = m; renderTasksModal(); },
          });
          cityTasks = await fetchCityTasks();
          const paidStr = formatTaskReward(t);
          taskBusyMsg = `Paid ${paidStr} on Base (${txHash.slice(0, 10)}...).`;
          toast?.('REWARD PAID ON BASE', t.title, `${paidStr} settled to ${s.blockyName}`);
        } catch (err) {
          taskBusyMsg = rejected(err) ? 'Payment cancelled.' : (err.shortMessage || err.message || 'Payment failed.');
        }
        renderTasksModal();
      };
    });
  }

  async function loadWalletStocksForTasks() {
    try {
      const all = await fetchBaseStocks();
      allBaseStocks = all || [];
      if (walletAccount) {
        walletStocks = await getWalletStockBalances(allBaseStocks, walletAccount);
      } else {
        walletStocks = [];
      }
    } catch { /* ignore */ }
  }

  async function loadBlockyAgentId() {
    const num = activeBlocky?.n || activeBlocky?.id;
    if (!num) { linkedBlockyAgentId = ''; return; }
    try {
      const r = await fetch(`/api/agent-link?blocky=${encodeURIComponent(num)}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const j = await r.json();
        linkedBlockyAgentId = j?.agentId ? String(j.agentId) : '';
        return;
      }
    } catch { /* ignore */ }
    linkedBlockyAgentId = '';
  }

  async function openTasks(initialTab = '') {
    if (initialTab) taskTab = initialTab;
    tasksWrap.hidden = false;
    taskBusyMsg = '';
    intelBusyMsg = '';
    taskLoading = true;
    if (!walletAccount || !walletProvider) {
      const saved = await restoreWallet();
      if (saved) { walletAccount = saved.address; walletProvider = saved.provider; }
    }
    renderTasksModal();
    const [tasks] = await Promise.all([
      fetchCityTasks(),
      loadWalletStocksForTasks(),
      loadBlockyAgentId(),
      taskTab === 'analyst' ? fetchStockIntel(intelTicker).then((x) => { intelItems = x; }) : Promise.resolve(),
    ]);
    cityTasks = tasks;
    taskLoading = false;
    if (!tasksWrap.hidden) renderTasksModal();
  }

  tasksWrap.querySelector('#gm-task-tabs').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-ttab]')?.dataset.ttab;
    if (!t) return;
    taskTab = t;
    taskBusyMsg = '';
    intelBusyMsg = '';
    renderTasksModal();
    if (taskTab === 'post') {
      await loadWalletStocksForTasks();
      if (!tasksWrap.hidden && taskTab === 'post') renderTasksModal();
    } else if (taskTab === 'analyst') {
      intelItems = await fetchStockIntel(intelTicker);
      if (!tasksWrap.hidden && taskTab === 'analyst') renderTasksModal();
    }
  });

  async function refreshOwnedCharacters() {
    if (!walletAccount || !walletProvider) {
      const saved = await restoreWallet();
      if (saved) { walletAccount = saved.address; walletProvider = saved.provider; }
    }
    hasBlockyNft = false;
    if (!walletAccount) {
      ownedBlockies = [];
      return [];
    }
    const addr = walletAccount.toLowerCase();
    const byId = new Map();

    // 1. Live colony crew already in memory
    for (const b of crew?.() || []) {
      if (b.kind === 'blocky' && !Number.isFinite(b.leftAt) && b.from?.toLowerCase() === addr) {
        byId.set(b.id, b);
      }
    }

    // 2. Claim API (all claimed + unclaimed Blockies for this wallet)
    try {
      const r = await fetch(`/api/claim?address=${encodeURIComponent(walletAccount)}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const j = await r.json();
        for (const x of j.blockies || []) {
          if (x.claimed) hasBlockyNft = true;
          const b = makeBlocky(x.n, x.at || now(), addr, x.seed);
          byId.set(b.id, b);
        }
      }
    } catch { /* fall through to direct Base RPC check */ }

    // 3. Direct onchain Base RPC check (ERC-721 BCB NFT & $BLOCKY balance)
    try {
      const [nftBal, tokenBal] = await Promise.all([
        baseRpc.readContract({ address: BCB_NFT, abi: BAL_ABI, functionName: 'balanceOf', args: [walletAccount] }).catch(() => 0n),
        !byId.size ? baseRpc.readContract({ address: BLOCKY_TOKEN, abi: BAL_ABI, functionName: 'balanceOf', args: [walletAccount] }).catch(() => 0n) : Promise.resolve(0n),
      ]);
      if (nftBal > 0n) hasBlockyNft = true;
      if (!byId.size) {
        const count = Number(nftBal > 0n ? (nftBal > 12n ? 12n : nftBal) : (tokenBal > 0n ? 1n : 0n));
        if (count > 0) {
          const baseSeed = parseInt(addr.slice(2, 10), 16) || 1;
          for (let i = 0; i < count; i++) {
            const num = ((baseSeed + i * 37) % 9999) + 1;
            const b = makeBlocky(num, now(), addr, baseSeed + i);
            byId.set(b.id, b);
          }
        }
      }
    } catch { /* ignore */ }

    ownedBlockies = [...byId.values()];
    loadTasks();
    return ownedBlockies;
  }

  async function disconnectWallet() {
    forgetWallet();
    walletAccount = null;
    walletProvider = null;
    ownedBlockies = [];
    hasBlockyNft = false;
    spawnAvatar(makeDefaultBuilder());
    loadTasks();
    await world.refreshPortfolio();
    syncUserPill();
    renderHotbar();
    renderQuestTracker();
    window.dispatchEvent(new CustomEvent('basecity:wallet-changed', { detail: { address: null } }));
    toast?.('WALLET DISCONNECTED', 'Visitor Mode', 'Switched back to Default Builder');
  }

  function closeLocker() {
    lockerBack = null;
    lockerWrap.hidden = true;
    if (!avatar) spawnAvatar(makeDefaultBuilder());
  }

  function hexCss(n) { return `#${Number(n || 0).toString(16).padStart(6, '0')}`; }

  function renderLocker() {
    const wEl = lockerWrap.querySelector('#gm-lock-wallet');
    const bodyEl = lockerWrap.querySelector('#gm-lock-body');
    const closeBtn = lockerWrap.querySelector('#gm-lock-close');
    const backBtn = lockerWrap.querySelector('#gm-lock-back');
    const tier = getCitizenTier();
    const defAvatar = makeDefaultBuilder();
    const isDefActive = !activeBlocky || activeBlocky.id === 'default-builder';

    closeBtn.textContent = 'Close';
    if (backBtn) backBtn.hidden = !lockerBack;

    wEl.innerHTML = walletAccount
      ? `<span><b>${esc(tier.label)}</b> · <code title="${esc(walletAccount)}">${esc(walletAccount.slice(0, 6))}…${esc(walletAccount.slice(-4))}</code> (${ownedBlockies.length} Blocky${hasBlockyNft ? ' · ERC-721 NFT' : ''})</span><div class="gm-lock-wacts"><button type="button" class="btn small-pill" id="gm-lock-copy">Copy</button><button type="button" class="btn small-pill" id="gm-lock-conn">Switch</button><button type="button" class="btn small-pill gm-disc-btn" id="gm-lock-disc">Disconnect</button></div>`
      : `<span><b>VISITOR</b> · Playing with Default Builder (Local Save)</span><button type="button" class="btn primary small-pill" id="gm-lock-conn">Connect Wallet</button>`;

    wEl.querySelector('#gm-lock-copy')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      try { await navigator.clipboard.writeText(walletAccount); btn.textContent = 'Copied'; } catch { btn.textContent = 'Failed'; }
      toast?.('ADDRESS COPIED', `${walletAccount.slice(0, 6)}…${walletAccount.slice(-4)}`, 'Base Mainnet wallet address');
      setTimeout(() => { if (btn.isConnected) btn.textContent = 'Copy'; }, 1500);
    });
    wEl.querySelector('#gm-lock-conn').onclick = () => {
      const wb = lockerWrap.querySelector('#gm-lock-wbox');
      wb.hidden = !wb.hidden;
      if (!wb.hidden) renderLockerWallets();
    };
    wEl.querySelector('#gm-lock-disc')?.addEventListener('click', async () => {
      lockerWrap.querySelector('#gm-lock-wbox').hidden = true;
      await disconnectWallet();
      renderLocker();
    });

    const tabsHtml = `<div class="lp-seg" style="margin-bottom:10px" id="gm-lock-tabs">
      <button type="button" class="lp-seg-btn${lockerTab === 'customize' ? ' on' : ''}" data-ltab="customize">Customize Default</button>
      <button type="button" class="lp-seg-btn${lockerTab === 'blockies' ? ' on' : ''}" data-ltab="blockies">My Blockies (${ownedBlockies.length})</button>
    </div>`;

    if (lockerTab === 'customize') {
      const previewBlocky = makeDefaultBuilder(draftAvatar);
      const isHairStyle = ['short', 'spiky', 'bob'].includes(draftAvatar.hatStyle);
      const headColorKey = isHairStyle ? 'hairColor' : 'hatColor';
      const headPalette = isHairStyle ? HAIR_SWATCHES : HAT_SWATCHES;
      const activeMeme = OG_MEME_ITEMS.find((m) => m.id === (draftAvatar.memeItem || 'none')) || OG_MEME_ITEMS[0];
      const swatchRow = (key, colors) => `<div class="gm-swatches">${colors.map((c) => `<button type="button" class="gm-swatch${Number(draftAvatar[key]) === c ? ' on' : ''}" data-ckey="${key}" data-cval="${c}" style="background:${hexCss(c)}" aria-label="${hexCss(c)}"></button>`).join('')}</div>`;
      bodyEl.innerHTML = `${tabsHtml}
        <div class="gm-cust-grid">
          <div class="gm-cust-left">
            <div class="gm-cust-prev">
              <img src="${renderPfp(previewBlocky, { size: 320, mark: false, full: true, fixed: true })}" alt="${esc(draftAvatar.name)}" />
              <b>${esc(draftAvatar.name || 'Default Builder')}</b>
              <span>Basic Voxel Builder · Free for all players</span>
            </div>
            <div class="gm-cust-skill-box">
              <div class="gm-cust-skill-head">
                <small style="color:${esc(activeMeme.color)}">${esc(activeMeme.token)}</small>
                <span class="og-badge">${esc(activeMeme.badge)}</span>
              </div>
              <b>${esc(activeMeme.skill)}</b>
              <p>${esc(activeMeme.desc)}</p>
            </div>
          </div>
          <div class="gm-cust-ctrl">
            <div class="gm-cust-row">
              <label for="gm-cust-name">Builder Name</label>
              <input id="gm-cust-name" class="gm-cust-name" type="text" maxlength="20" value="${esc(draftAvatar.name)}" placeholder="Default Builder" />
            </div>
            <div class="gm-cust-row">
              <label>Hat &amp; Hair Style</label>
              <div class="gm-pills">${HAT_STYLES.map(([id, lbl]) => `<button type="button" class="gm-pill${draftAvatar.hatStyle === id ? ' on' : ''}" data-hstyle="${id}">${lbl}</button>`).join('')}</div>
            </div>
            <div class="gm-cust-colors">
              <div class="gm-cust-row">
                <label>Skin Tone</label>
                ${swatchRow('skin', SKIN_SWATCHES)}
              </div>
              ${draftAvatar.hatStyle !== 'none' ? `<div class="gm-cust-row">
                <label>${isHairStyle ? 'Hair Color' : 'Hat Color'}</label>
                ${swatchRow(headColorKey, headPalette)}
              </div>` : '<div></div>'}
              <div class="gm-cust-row">
                <label>Shirt Color</label>
                ${swatchRow('shirt', SHIRT_SWATCHES)}
              </div>
              <div class="gm-cust-row">
                <label>Pants Color</label>
                ${swatchRow('pants', PANTS_SWATCHES)}
              </div>
            </div>
            <div class="gm-cust-row">
              <label>OG Base Meme Gear &amp; User Skill</label>
              <div class="gm-meme-grid">${OG_MEME_ITEMS.map((m) => {
                const on = (draftAvatar.memeItem || 'none') === m.id;
                return `<button type="button" class="gm-meme-opt${on ? ' on' : ''}" data-mstyle="${m.id}" style="${on ? `border-color:${esc(m.color)}` : ''}">
                  <span class="gm-meme-top"><b>${esc(m.id === 'none' ? 'None' : m.name)}</b><small style="color:${esc(m.color)}">${esc(m.token)}</small></span>
                  <span class="gm-meme-stat">${esc(m.badge)}</span>
                </button>`;
              }).join('')}</div>
            </div>
            <div class="gm-cust-acts">
              <button type="button" class="btn" id="gm-cust-rand">Randomize</button>
              <button type="button" class="btn primary" id="gm-cust-save">Save &amp; Equip</button>
            </div>
          </div>
        </div>`;
      bodyEl.querySelector('#gm-lock-tabs')?.addEventListener('click', (e) => {
        const t = e.target.closest('[data-ltab]')?.dataset.ltab;
        if (t && t !== lockerTab) { lockerTab = t; renderLocker(); }
      });
      bodyEl.querySelector('#gm-cust-name')?.addEventListener('input', (e) => {
        draftAvatar.name = e.target.value;
        const nameEl = bodyEl.querySelector('.gm-cust-prev b');
        if (nameEl) nameEl.textContent = draftAvatar.name.trim() || 'Default Builder';
      });
      bodyEl.querySelectorAll('[data-ckey]').forEach((btn) => {
        btn.onclick = () => { draftAvatar[btn.dataset.ckey] = Number(btn.dataset.cval); renderLocker(); };
      });
      bodyEl.querySelectorAll('[data-hstyle]').forEach((btn) => {
        btn.onclick = () => { draftAvatar.hatStyle = btn.dataset.hstyle; renderLocker(); };
      });
      bodyEl.querySelectorAll('[data-mstyle]').forEach((btn) => {
        btn.onclick = () => { draftAvatar.memeItem = btn.dataset.mstyle; renderLocker(); };
      });
      bodyEl.querySelector('#gm-cust-rand')?.addEventListener('click', () => {
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        draftAvatar = {
          ...draftAvatar,
          skin: pick(SKIN_SWATCHES),
          hatStyle: pick(HAT_STYLES)[0],
          hatColor: pick(HAT_SWATCHES),
          hairColor: pick(HAIR_SWATCHES),
          shirt: pick(SHIRT_SWATCHES),
          pants: pick(PANTS_SWATCHES),
        };
        renderLocker();
      });
      bodyEl.querySelector('#gm-cust-save')?.addEventListener('click', () => {
        saveDefaultAvatar(draftAvatar);
        const b = makeDefaultBuilder();
        spawnAvatar(b);
        lockerBack = null;
        lockerWrap.hidden = true;
        toast?.('BUILDER SAVED', b.name, 'Default Builder look updated & equipped');
      });
      return;
    }

    const tiers = [
      ['visitor', '1. Visitor', 'Default Avatar · Local'],
      ['builder', '2. Default Builder', 'Wallet · Cloud Sync'],
      ['newcomer', '3. Newcomer', '$BLOCKY · Play 0s Wait'],
      ['citizen', '4. Citizen NFT', 'ERC-721 · Earn Stocks'],
    ];
    const tierBar = `<div class="gm-tier-strip">${tiers.map(([id, tLbl, tSub]) => `<div class="gm-tier-step${tier.id === id ? ' on' : ''}"><b>${tLbl}</b><span>${tSub}</span></div>`).join('')}</div>`;

    const defaultCard = `<button type="button" class="gm-char-card${isDefActive ? ' on' : ''}" data-cidx="default">
      <span class="gm-char-rarity common">${itemIcon('user-avatar', 14)} Default</span>
      <img src="${renderPfp(defAvatar, { size: 160, mark: false })}" alt="${esc(defAvatar.name)}" />
      <b>${esc(defAvatar.name)}</b>
      <span>Custom Basic Avatar</span>
    </button>`;

    const ownedCards = ownedBlockies.slice(0, 23).map((b, i) => {
      const rarId = b.rarity?.id || 'common';
      const rarLbl = b.rarity?.label || rarId;
      return `<button type="button" class="gm-char-card${activeBlocky?.id === b.id ? ' on' : ''}" data-cidx="${i}">
        <span class="gm-char-rarity ${esc(rarId)}">${itemIcon(rarityGemId(rarId), 14)} ${esc(rarLbl)}</span>
        <img src="${renderPfp(b, { size: 160, mark: false })}" alt="${esc(b.name)}" />
        <b>${esc(b.name)}</b>
        <span>${esc(b.role?.label || 'Builder')}</span>
      </button>`;
    }).join('');

    const upgradeBox = tier.id !== 'citizen' ? `
      <div class="gm-gate" style="margin-top:10px;text-align:left;padding:12px 14px">
        <h3 style="font-size:13px;margin-bottom:4px">${tier.id === 'newcomer' ? 'CLAIM YOUR ERC-721 NFT TO BECOME A VERIFIED CITIZEN' : 'UPGRADE TO BLOCKY NFT · UNLOCK CITIZEN STATUS'}</h3>
        <p style="margin-bottom:10px;font-size:12px">Every user shares the same full Game Mode with <b>Default Builder</b>. Buy <b>$${CONFIG.usdPerBlocky || 10} ${esc(CONFIG.ticker || '$BLOCKY')}</b> to play your own Blocky immediately (0 wait), then hold 1h &amp; claim the ERC-721 NFT on <a href="/claim.html" style="color:#7db1ff;font-weight:700">/claim</a> for <b>Verified Citizen Perks</b> &amp; <b>45% Flywheel</b>.</p>
        <div class="gm-gate-acts" style="justify-content:flex-start">
          <button type="button" class="btn primary" id="gm-gate-buy">Buy $${CONFIG.usdPerBlocky || 10} ${esc(CONFIG.ticker || '$BLOCKY')}</button>
          <button type="button" class="btn" id="gm-gate-perks">View Stocks &amp; Perks</button>
          <a class="btn" href="/claim.html">Claim NFT (/claim)</a>
        </div>
      </div>` : '';

    bodyEl.innerHTML = `${tabsHtml}${tierBar}<div class="gm-char-grid">${defaultCard}${ownedCards}</div>${upgradeBox}`;

    bodyEl.querySelector('#gm-lock-tabs')?.addEventListener('click', (e) => {
      const t = e.target.closest('[data-ltab]')?.dataset.ltab;
      if (t && t !== lockerTab) { lockerTab = t; renderLocker(); }
    });
    bodyEl.querySelector('#gm-gate-buy')?.addEventListener('click', () => { lockerWrap.hidden = true; openBlocky10('blocky'); });
    bodyEl.querySelector('#gm-gate-perks')?.addEventListener('click', () => { const prev = lockerBack; lockerWrap.hidden = true; world.openUser('stocks_perks', () => openLocker(prev)); });
    bodyEl.querySelectorAll('[data-cidx]').forEach((btn) => {
      btn.onclick = () => {
        const idx = btn.dataset.cidx;
        const b = idx === 'default' ? makeDefaultBuilder() : ownedBlockies[Number(idx)];
        if (!b) return;
        spawnAvatar(b);
        lockerBack = null;
        lockerWrap.hidden = true;
        toast?.('CHARACTER EQUIPPED', b.name, idx === 'default' ? 'Custom BaseCity Builder' : (b.role?.label || 'BaseCity Citizen'));
      };
    });
  }

  function renderWalletPicker(wb, wl, onDone) {
    const list = browserWallets();
    wl.innerHTML = `
      <div class="wcard">
        <div class="wcard-email">
          <input data-gm-email-in type="email" placeholder="Continue with Gmail or Email..." />
          <button type="button" class="wcard-email-btn" data-gm-email-send>Continue</button>
        </div>
        <div class="wcard-email" data-gm-otp-row hidden>
          <input data-gm-otp-in type="text" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit code from inbox" />
          <button type="button" class="wcard-email-btn" data-gm-otp-verify>Verify</button>
        </div>
        <div class="wcard-socials">
          <button type="button" class="wcard-sbtn" data-gm-privy="google"><i class="wcard-mono">G</i><span>Google</span></button>
          <button type="button" class="wcard-sbtn" data-gm-privy="twitter"><i class="wcard-mono">X</i><span>X (Twitter)</span></button>
        </div>
        <div class="wcard-div">or connect wallet</div>
        <div class="wcard-wlist">
          <button type="button" class="wcard-wrow smart" data-gmws="1"><span>Base / Coinbase Smart Wallet</span><span class="wcard-tag">Passkey</span></button>
          ${list.map((w, i) => `<button type="button" class="wcard-wrow" data-gmwi="${i}"><span>${esc(w.name)}</span><span class="wcard-tag">Detected</span></button>`).join('')}
        </div>
        <div class="lp-msg" data-gm-wmsg hidden></div>
        <div class="wcard-foot">Instant Base wallet via Privy · Self-custody</div>
      </div>`;
    const msgEl = wl.querySelector('[data-gm-wmsg]');
    const showMsg = (text, err = false) => {
      if (!msgEl) return;
      msgEl.hidden = false;
      msgEl.className = err ? 'lp-msg err' : 'lp-msg';
      msgEl.textContent = text;
    };
    wl.querySelectorAll('[data-gm-privy]').forEach((b) => {
      b.onclick = async () => {
        if (!privyConfigured()) {
          showMsg('Add VITE_PRIVY_APP_ID to .env and restart Vite to enable social login.', true);
          return;
        }
        try {
          showMsg('Redirecting to Privy...');
          await loginWithPrivyOAuth(b.dataset.gmPrivy, { returnToPlay: true });
        } catch (e) { showMsg(e.message || 'Privy login failed', true); }
      };
    });
    wl.querySelector('[data-gm-email-send]')?.addEventListener('click', async () => {
      const email = wl.querySelector('[data-gm-email-in]')?.value || '';
      if (!privyConfigured()) {
        showMsg('Add VITE_PRIVY_APP_ID to .env and restart Vite to enable email login.', true);
        return;
      }
      try {
        showMsg('Sending 6-digit code...');
        await sendPrivyEmailCode(email);
        const row = wl.querySelector('[data-gm-otp-row]');
        if (row) { row.hidden = false; row.querySelector('input')?.focus(); }
        showMsg('Code sent! Check your Gmail/Email inbox.');
      } catch (e) { showMsg(e.message || 'Could not send code', true); }
    });
    wl.querySelector('[data-gm-otp-verify]')?.addEventListener('click', async () => {
      const email = wl.querySelector('[data-gm-email-in]')?.value || '';
      const otp = wl.querySelector('[data-gm-otp-in]')?.value || '';
      try {
        showMsg('Verifying code & creating Base wallet...');
        const res = await verifyPrivyEmailCode(email, otp);
        if (res?.address && res?.provider) {
          walletAccount = res.address;
          walletProvider = res.provider;
          window.dispatchEvent(new CustomEvent('basecity:wallet-changed', { detail: { address: walletAccount, name: res.name || 'Privy' } }));
          wb.hidden = true;
          await onDone();
        }
      } catch (e) { showMsg(e.message || 'Invalid code', true); }
    });
    wl.querySelectorAll('[data-gmwi]').forEach((b) => {
      b.onclick = async () => {
        const w = list[Number(b.dataset.gmwi)];
        if (!w) return;
        try {
          walletAccount = await connect(w.provider, w);
          walletProvider = w.provider;
          window.dispatchEvent(new CustomEvent('basecity:wallet-changed', { detail: { address: walletAccount, name: w.name } }));
          wb.hidden = true;
          await onDone();
        } catch (e) { if (!rejected(e)) showMsg(e.message || 'Connection failed', true); }
      };
    });
    wl.querySelector('[data-gmws]')?.addEventListener('click', async () => {
      try {
        const p = await smartWallet(CONFIG.cityName || 'BaseCity', `${location.origin}/favicon.svg`);
        walletAccount = await connect(p, { name: 'Smart Wallet' });
        walletProvider = p;
        window.dispatchEvent(new CustomEvent('basecity:wallet-changed', { detail: { address: walletAccount, name: 'Smart Wallet' } }));
        wb.hidden = true;
        await onDone();
      } catch (e) { if (!rejected(e)) showMsg(e.message || 'Connection failed', true); }
    });
  }

  function renderLockerWallets() {
    const wl = lockerWrap.querySelector('#gm-lock-wlist');
    const wb = lockerWrap.querySelector('#gm-lock-wbox');
    renderWalletPicker(wb, wl, async () => {
      await refreshOwnedCharacters();
      await world.refreshPortfolio();
      syncUserPill();
      renderHotbar();
      renderQuestTracker();
      if (ownedBlockies.length) {
        spawnAvatar(ownedBlockies[0]);
        lockerBack = null;
        lockerWrap.hidden = true;
        toast?.('CHARACTER EQUIPPED', ownedBlockies[0].name, 'Welcome to BaseCity');
      } else {
        renderLocker();
      }
    });
  }

  async function openLocker(onBack = null) {
    lockerBack = typeof onBack === 'function' ? onBack : null;
    draftAvatar = { ...customAvatar };
    const backBtn = lockerWrap.querySelector('#gm-lock-back');
    if (backBtn) backBtn.hidden = !lockerBack;
    lockerWrap.hidden = false;
    lockerWrap.querySelector('#gm-lock-body').innerHTML = '<p class="lp-desc">Checking your Blockies on Base...</p>';
    await refreshOwnedCharacters();
    lockerTab = (!activeBlocky || activeBlocky.id === 'default-builder') ? 'customize' : 'blockies';
    renderLocker();
  }

  function closeWelcome() {
    const muteEl = welcomeWrap.querySelector('#gm-wel-mute');
    if (muteEl) {
      try {
        if (muteEl.checked) localStorage.setItem(WELCOME_HIDE_KEY, '1');
        else localStorage.removeItem(WELCOME_HIDE_KEY);
      } catch { /* ignore */ }
    }
    welcomeWrap.hidden = true;
  }

  function renderWelcomeWallets() {
    const wl = welcomeWrap.querySelector('#gm-wel-wlist');
    const wb = welcomeWrap.querySelector('#gm-wel-wbox');
    renderWalletPicker(wb, wl, async () => {
      await refreshOwnedCharacters();
      if (ownedBlockies.length) spawnAvatar(ownedBlockies[0]);
      await world.refreshPortfolio();
      syncUserPill();
      renderHotbar();
      renderQuestTracker();
      openWelcome();
    });
  }

  function openWelcome() {
    const tier = getCitizenTier();
    const stEl = welcomeWrap.querySelector('#gm-wel-status');
    const actsEl = welcomeWrap.querySelector('#gm-wel-acts');
    const muteEl = welcomeWrap.querySelector('#gm-wel-mute');
    if (muteEl) {
      try { muteEl.checked = localStorage.getItem(WELCOME_HIDE_KEY) === '1'; } catch { /* ignore */ }
    }
    if (stEl) {
      stEl.className = `gmw-status${tier.id === 'citizen' ? ' owned' : ''}`;
      stEl.innerHTML = tier.id === 'citizen'
        ? `<b>VERIFIED CITIZEN · ${esc(activeBlocky?.name?.toUpperCase() || 'BLOCKY NFT')}</b><span>Your ERC-721 Blocky NFT is active. Level up your Citizen Rank for -15% craft/upgrade costs &amp; Blocky 10 Stock perks.</span>`
        : tier.id === 'newcomer'
          ? `<b>NEWCOMER BLOCKY · ${esc(activeBlocky?.name?.toUpperCase() || 'BLOCKY')}</b><span>Play immediately (0 wait)! Hold your $${CONFIG.usdPerBlocky || 10} ${esc(CONFIG.ticker || '$BLOCKY')} for 1h to claim your ERC-721 NFT on <a href="/claim.html">/claim</a>.</span>`
          : `<b>${esc(tier.label)} · ${walletAccount ? esc(`${walletAccount.slice(0, 6)}…${walletAccount.slice(-4)}`) : 'PLAYING AS DEFAULT BUILDER'}</b><span>Full Game Mode is unlocked immediately. Connect your Base wallet to cloud-sync progress, or buy <b>$${CONFIG.usdPerBlocky || 10} ${esc(CONFIG.ticker || '$BLOCKY')}</b> to play your own Blocky right away (0 wait).</span>`;
    }
    if (actsEl) {
      actsEl.innerHTML = `
        ${!walletAccount ? '<button type="button" class="btn primary" id="gm-wel-conn">Connect Wallet</button>' : '<button type="button" class="btn primary" id="gm-wel-start">Walk to Silicon Quarry</button>'}
        <button type="button" class="btn gmw-gold" id="gm-wel-char">Choose Character (C)</button>
        ${!walletAccount ? '<button type="button" class="btn" id="gm-wel-start">Start Exploring</button>' : '<button type="button" class="btn" id="gm-wel-perks">Citizen Perks (U)</button><button type="button" class="btn gm-disc-btn" id="gm-wel-disc">Disconnect Wallet</button>'}`;
      actsEl.querySelector('#gm-wel-conn')?.addEventListener('click', () => {
        const wb = welcomeWrap.querySelector('#gm-wel-wbox');
        wb.hidden = !wb.hidden;
        if (!wb.hidden) renderWelcomeWallets();
      });
      actsEl.querySelector('#gm-wel-char')?.addEventListener('click', () => {
        closeWelcome();
        openLocker(() => openWelcome());
      });
      actsEl.querySelector('#gm-wel-perks')?.addEventListener('click', () => {
        closeWelcome();
        world.openUser('stocks_perks', () => openWelcome());
      });
      actsEl.querySelector('#gm-wel-disc')?.addEventListener('click', async () => {
        welcomeWrap.querySelector('#gm-wel-wbox').hidden = true;
        await disconnectWallet();
        openWelcome();
      });
      actsEl.querySelector('#gm-wel-start')?.addEventListener('click', () => {
        closeWelcome();
        navigateTo(14, 0, 'River Silicon Quarry');
      });
    }
    welcomeWrap.hidden = false;
  }

  function syncModeButtons() {
    if (!hud) return;
    hud.querySelectorAll('[data-vmode]').forEach((b) => {
      b.classList.toggle('on', b.dataset.vmode === mode);
    });
    const badge = hud.querySelector('.play-badge');
    if (badge) badge.textContent = mode === 'car' ? 'DRIVE MODE' : 'GAME MODE';
    if (speedEl) speedEl.hidden = mode === 'walk';
  }

  function setMode(next) {
    if (next !== 'walk' && next !== 'car') return;
    if (next === mode) return;
    mode = next;
    speedCur = 0;
    if (mode === 'car') pushOutIfStuck(true);
    if (carMesh) carMesh.visible = mode === 'car';
    syncModeButtons();
  }

  function spawnAvatar(b) {
    if (avatar) city.root.remove(avatar.group);
    if (carMesh) city.root.remove(carMesh);
    activeBlocky = b;
    avatar = buildBlocky(activeBlocky);
    avatar.group.position.copy(pos);
    avatar.group.rotation.y = yaw + Math.PI;
    gmBubble = makeGmBubble();
    gmBubble.position.set(0, 2.35, 0);
    avatar.group.add(gmBubble);
    city.root.add(avatar.group);

    carMesh = makeCarMesh();
    carMesh.visible = mode === 'car';
    city.root.add(carMesh);
    updateCharButton();
  }

  function triggerEmote(kind) {
    if (!active || !avatar) return;
    if (kind === 'gm') {
      emoteWaveT = 2.2;
      if (gmBubble) gmBubble.visible = true;
      const li = Math.round(pos.x / PITCH), lj = Math.round(pos.z / PITCH);
      if (Math.abs(li) <= 1 && Math.abs(lj) <= 1) markTask('civic_gm');
    } else if (kind === 'jump') {
      if (grounded && mode === 'walk') { vy = 6.6; grounded = false; }
      emoteWaveT = 1.2;
    } else if (kind === 'photo') {
      renderer.render(scene, cam);
      const a = document.createElement('a');
      a.href = renderer.domElement.toDataURL('image/png');
      a.download = `basecity-${(activeBlocky?.name || 'blocky').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast?.('SNAPSHOT SAVED', activeBlocky?.name || 'BaseCity', 'Captured from Game Mode');
    }
  }

  async function enter() {
    if (active) return;
    active = true;
    mode = 'walk';
    stride = 0;
    streetAudio.unlock();
    speedCur = 0;
    navGoal = null;
    navPath = [];
    controls.enabled = false;
    document.body.classList.add('play');
    if (hud) hud.hidden = false;

    prevDpr = renderer.getPixelRatio();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));

    pos.set(0, 0, 4);
    vy = 0;
    grounded = true;
    yaw = 0;
    pitch = 0.57;
    nearAcc = 1;
    mapAcc = 1;
    rayAcc = 1;
    armScale = 1;
    armScaleWant = 1;
    cameraHeight = 1.45;

    if (!padsObj) {
      padsObj = makeInteractionPads();
      city.root.add(padsObj.group);
    }
    padsObj.group.visible = true;
    world.setVisible(true);

    // Spawn Default Builder & open Welcome Popup IMMEDIATELY (0ms) before async RPC checks
    spawnAvatar(makeDefaultBuilder());
    updateQuestHud();
    syncModeButtons();
    syncUserPill();
    renderHotbar();
    renderQuestTracker();
    resize();
    drawRadar(mapCtx, mapCanvas);

    let hideWelcome = false;
    try { hideWelcome = localStorage.getItem(WELCOME_HIDE_KEY) === '1'; } catch { /* ignore */ }
    if (!hideWelcome) openWelcome();

    // Refresh wallet, Blockies & portfolio in background without blocking the Welcome modal
    const mine = await refreshOwnedCharacters();
    if (!active) return;
    if (mine.length) {
      spawnAvatar(mine[0]);
      updateQuestHud();
    }
    await world.refreshPortfolio();
    if (!active) return;
    syncUserPill();
    renderHotbar();
    renderQuestTracker();
    if (!welcomeWrap.hidden) openWelcome();
  }

  function exit() {
    if (!active) return;
    active = false;
    streetAudio.drive(0, false);
    fadeBuilding(null);
    navGoal = null;
    navPath = [];
    gpsBeacon.visible = false;
    closeInspect();
    renderer.domElement.style.cursor = '';
    welcomeWrap.hidden = true;
    lockerWrap.hidden = true;
    fullMapWrap.hidden = true;
    tasksWrap.hidden = true;
    world.closeAll();
    world.setVisible(false);
    keys.clear();
    touch.f = touch.b = touch.l = touch.r = false;
    if (avatar) { city.root.remove(avatar.group); avatar = null; }
    if (carMesh) { city.root.remove(carMesh); carMesh = null; }
    if (padsObj) padsObj.group.visible = false;
    if (prevDpr !== null) {
      renderer.setPixelRatio(prevDpr);
      prevDpr = null;
    }
    document.body.classList.remove('play');
    if (hud) hud.hidden = true;
    if (promptEl) promptEl.hidden = true;
    controls.enabled = true;
    onExit?.();
  }

  function resize() {
    if (!active) return;
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  }

  const snapRoad = (v) => Math.round((v - PITCH / 2) / PITCH) * PITCH + PITCH / 2;

  // Rounded-corner box check: bevels sharp 90-deg lot corners so turning left/right glides smoothly onto cross-streets
  function inRoundedBox(dx, dz, hw, hd, r = 0.62) {
    if (dx >= hw || dz >= hd) return false;
    const cx = Math.max(0, dx - (hw - r));
    const cz = Math.max(0, dz - (hd - r));
    return (cx * cx + cz * cz) < (r * r);
  }

  function hitsSolidBox(x, z, checkMode = mode) {
    const s = sim?.();
    const ci = Math.round(x / PITCH);
    const cj = Math.round(z / PITCH);
    const isCar = checkMode === 'car';
    const pad = 0.36;
    const bevel = isCar ? 0.68 : 0.45;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const i = ci + di, j = cj + dj;
        const dx = Math.abs(x - i * PITCH), dz = Math.abs(z - j * PITCH);
        if (dx > 3.55 || dz > 3.55) continue;
        if (isWater(i, j) && inRoundedBox(dx, dz, STREET_LOT_HALF + 0.02, STREET_LOT_HALF + 0.02, bevel)) return true;
        const key = `${i},${j}`;
        if ((s?.blOpen && BASELIVE_LOTS.has(key)) || (s?.stOpen && STOCKS_LOTS.has(key))) {
          if (isCar && inRoundedBox(dx, dz, STREET_LOT_HALF + 0.04, STREET_LOT_HALF + 0.04, bevel)) return true;
          continue;
        }
        const p = s?.standing?.get(key);
        if (p) {
          if (isCar) {
            // Cars stay on asphalt. Rounded corners leave room to turn at junctions.
            const edge = STREET_LOT_HALF + 0.06;
            if (p.type !== 'square' && inRoundedBox(dx, dz, edge, edge, bevel)) return true;
          } else if (!OPEN_LOTS.has(p.type) && p.type !== GPU_FRONTAGE.type) {
            const hw = Math.min(STREET_LOT_HALF + 0.22, ((p.w || 5.4) / 2) * STREET_LOT_SCALE + pad);
            const hd = Math.min(STREET_LOT_HALF + 0.22, ((p.d || 5.4) / 2) * STREET_LOT_SCALE + pad);
            if (inRoundedBox(dx, dz, hw, hd, bevel)) return true;
          }
        }
        if (s?.sites?.some((st) => st.p?.lot && st.p.lot[0] === i && st.p.lot[1] === j)) {
          if (inRoundedBox(dx, dz, STREET_LOT_HALF + 0.16, STREET_LOT_HALF + 0.16, bevel)) return true;
        }
      }
    }
    return false;
  }

  function pushOutIfStuck(snapNow = false) {
    if (!hitsSolidBox(pos.x, pos.z)) return;
    const rx = snapRoad(pos.x);
    const rz = snapRoad(pos.z);
    const tx = Math.abs(rx - pos.x) <= Math.abs(rz - pos.z) ? rx : pos.x;
    const tz = Math.abs(rx - pos.x) <= Math.abs(rz - pos.z) ? pos.z : rz;
    if (snapNow) {
      pos.x = tx; pos.z = tz;
      if (hitsSolidBox(pos.x, pos.z)) { pos.x = rx; pos.z = rz; }
    } else {
      pos.x += (tx - pos.x) * 0.28;
      pos.z += (tz - pos.z) * 0.28;
    }
  }

  function hitsGeometry(x, z, dx, dz) {
    // In Drive mode, hitsSolidBox keeps cars strictly on roads — skip geometry raycasts so trees/poles never snag or vibrate the car
    if (mode === 'car') return false;
    const step = Math.hypot(dx, dz);
    if (step < 1e-5) return false;
    const dirX = dx / step, dirZ = dz / step;
    const nearby = [];
    for (const g of city.solids.children) {
      if (Math.abs(g.position.x - x) < 10 && Math.abs(g.position.z - z) < 10) nearby.push(g);
    }
    if (!nearby.length) return false;

    rayDir.set(dirX, 0, dirZ);
    const baseY = Math.max(0.15, pos.y);
    const sideOff = 0.24;
    const probeFar = 0.42;
    for (const y of [baseY + 0.35, baseY + 0.95]) {
      for (const side of [0, -sideOff, sideOff]) {
        rayOrg.set(x - dirZ * side, y, z + dirX * side);
        moveRay.set(rayOrg, rayDir);
        moveRay.far = step + probeFar;
        const hit = moveRay.intersectObjects(nearby, true)[0];
        // Ignore hits < 0.05m so if you touch a thin pole/trunk you can always back out cleanly
        if (hit && hit.distance > 0.05) return true;
      }
    }
    return false;
  }

  function canMoveTo(fromX, fromZ, toX, toZ) {
    // Always allow escaping outward if currently overlapping a solid box
    if (hitsSolidBox(toX, toZ)) return false;
    if (hitsGeometry(fromX, fromZ, toX - fromX, toZ - fromZ)) return false;
    return true;
  }

  function zoneNameAt(x, z) {
    const li = Math.round(x / PITCH), lj = Math.round(z / PITCH);
    if (li <= -4 && lj >= -2 && lj <= 1) { markTask('blocky10'); return 'BLOCKY STREET'; }
    if (li <= -4 && lj >= 2 && lj <= 5) return 'BASE LIVE';
    if (li === -1 && lj === 1) { markTask('agent_hq'); return 'X402 AGENT HQ'; }
    if (li === -1 && lj === 3) { markTask('launchpad'); return 'LAUNCHPAD TOWER'; }
    if (li >= -3 && li <= 2 && lj >= 2 && lj <= 3) { markTask('defi_bank'); return 'DEFI STRIP'; }
    if (Math.abs(li) <= 1 && Math.abs(lj) <= 1) return 'CIVIC CORE';
    return `GRID (${li}, ${lj})`;
  }

  function mapSpan() { return Math.max(7, city.land + 1); }
  function worldToMap(wx, wz, size) {
    const span = mapSpan() * PITCH;
    return [((wx / span) * 0.5 + 0.5) * size, ((wz / span) * 0.5 + 0.5) * size];
  }
  function mapToWorld(mx, my, size) {
    const span = mapSpan() * PITCH;
    return [((mx / size) - 0.5) * 2 * span, ((my / size) - 0.5) * 2 * span];
  }

  function drawRadar(g, cv, large = false) {
    if (!g || !cv) return;
    const W = cv.width, H = cv.height;
    const L = mapSpan();
    const cell = W / (2 * L);

    g.fillStyle = '#0d0e11';
    g.fillRect(0, 0, W, H);

    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    for (let i = -L; i <= L; i += 2) {
      const [px] = worldToMap(i * PITCH, 0, W);
      const [, py] = worldToMap(0, i * PITCH, H);
      g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke();
      g.beginPath(); g.moveTo(0, py); g.lineTo(W, py); g.stroke();
    }

    const s = sim?.();
    for (let i = -L; i <= L; i++) {
      for (let j = -L; j <= L; j++) {
        const [cx, cy] = worldToMap(i * PITCH, j * PITCH, W);
        if (isWater(i, j)) {
          g.fillStyle = 'rgba(56, 189, 248, 0.38)';
          g.fillRect(cx - cell * 0.5, cy - cell * 0.5, cell, cell);
        } else {
          const key = `${i},${j}`;
          if (STOCKS_LOTS.has(key)) {
            g.fillStyle = 'rgba(46, 232, 122, 0.25)';
            g.fillRect(cx - cell * 0.48, cy - cell * 0.48, cell * 0.96, cell * 0.96);
          } else if (BASELIVE_LOTS.has(key)) {
            g.fillStyle = 'rgba(56, 189, 248, 0.22)';
            g.fillRect(cx - cell * 0.48, cy - cell * 0.48, cell * 0.96, cell * 0.96);
          } else if (s?.standing?.has(key)) {
            g.fillStyle = 'rgba(148, 163, 184, 0.28)';
            g.fillRect(cx - cell * 0.38, cy - cell * 0.38, cell * 0.76, cell * 0.76);
          }
        }
      }
    }

    const [px, py] = worldToMap(pos.x, pos.z, W);
    if (navGoal) {
      const [gx, gy] = worldToMap(navGoal.x, navGoal.z, W);
      g.strokeStyle = '#ffc83d';
      g.lineWidth = large ? 3 : 2;
      g.setLineDash([5, 3]);
      g.beginPath(); g.moveTo(px, py); g.lineTo(gx, gy); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ffc83d';
      g.beginPath(); g.arc(gx, gy, large ? 5 : 3.5, 0, Math.PI * 2); g.fill();
    }

    g.font = `700 ${large ? 11 : 8.5}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center';
    for (const poi of ALL_POIS) {
      const [mx, my] = worldToMap(poi.lot[0] * PITCH, poi.lot[1] * PITCH, W);
      const isHover = large && hoverPoiId === poi.id;
      const r = large ? (isHover ? 7 : 5) : 3;
      if (isHover) {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        g.beginPath(); g.arc(mx, my, 13, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = poi.color;
      g.fillRect(mx - r, my - r, r * 2, r * 2);
      g.fillStyle = isHover ? '#ffc83d' : '#f5f7fb';
      const dy = large ? (poi.dy > 0 ? 16 : -9) : (poi.dy ?? -6);
      g.fillText(poi.label, mx, my + dy);
    }

    const ang = avatar ? avatar.group.rotation.y : 0;
    const sc = large ? 1.45 : 1;
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI - ang);
    g.fillStyle = '#ffc83d';
    g.strokeStyle = '#0d0e11';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -6.5 * sc);
    g.lineTo(4.5 * sc, 5 * sc);
    g.lineTo(0, 2.5 * sc);
    g.lineTo(-4.5 * sc, 5 * sc);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();

    if (!large && mapLocEl) mapLocEl.textContent = zoneNameAt(pos.x, pos.z);
  }

  function travelTo(tx, tz) {
    const lim = Math.max(2, city.land) * PITCH + 2;
    const cx = THREE.MathUtils.clamp(tx, -lim, lim);
    const cz = THREE.MathUtils.clamp(tz, -lim, lim);
    if (!hitsSolidBox(cx, cz)) {
      pos.set(cx, 0, cz);
    } else {
      let placed = false;
      for (const [ox, oz] of [[0, 4], [4, 0], [-4, 0], [0, -4], [4, 4], [-4, 4]]) {
        if (!hitsSolidBox(cx + ox, cz + oz)) { pos.set(cx + ox, 0, cz + oz); placed = true; break; }
      }
      if (!placed) pos.set(0, 0, 4);
    }
    vy = 0;
    speedCur = 0;
    grounded = true;
    navGoal = null;
    navPath = [];
    checkNearby();
    drawRadar(mapCtx, mapCanvas);
  }

  function navigateTo(tx, tz, label = '') {
    const lim = Math.max(2, city.land) * PITCH + 2;
    const cx = THREE.MathUtils.clamp(tx, -lim, lim);
    const cz = THREE.MathUtils.clamp(tz, -lim, lim);
    const dist = Math.hypot(cx - pos.x, cz - pos.z);
    if (dist < 1.6) {
      navGoal = null;
      navPath = [];
      navStuckT = 0;
      return;
    }
    // Route strictly along asphalt road centerlines (k*8 + 4) so GPS never cuts through parks or buildings
    const rx1 = snapRoad(pos.x), rz1 = snapRoad(pos.z);
    const rx2 = snapRoad(cx), rz2 = snapRoad(cz);
    const pts = [];
    const pushPt = (x, z) => {
      const prev = pts.length ? pts[pts.length - 1] : { x: pos.x, z: pos.z };
      if (Math.hypot(x - prev.x, z - prev.z) > 0.8) pts.push({ x, z });
    };
    if (Math.abs(rx1 - pos.x) <= Math.abs(rz1 - pos.z)) {
      pushPt(rx1, pos.z);
      pushPt(rx1, rz2);
      pushPt(rx2, rz2);
    } else {
      pushPt(pos.x, rz1);
      pushPt(rx2, rz1);
      pushPt(rx2, rz2);
    }
    pushPt(cx, cz);
    navPath = pts;
    navStuckT = 0;
    navGoal = { x: cx, z: cz, label: label || 'Waypoint' };
    if (dist > 24 && mode === 'walk') setMode('car');
    drawRadar(mapCtx, mapCanvas);
    toast?.(dist > 24 ? 'AUTO-DRIVING' : 'AUTO-WALKING', navGoal.label, 'Following GPS roads · Press WASD anytime to steer');
  }

  function handleMapClick(e, cv, closeFull = false) {
    if (!active) return;
    e.stopPropagation();
    const rect = cv.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * cv.width;
    const my = ((e.clientY - rect.top) / rect.height) * cv.height;
    const hitR = closeFull ? 20 : 14;
    for (const poi of ALL_POIS) {
      const [px, py] = worldToMap(poi.lot[0] * PITCH, poi.lot[1] * PITCH, cv.width);
      if (Math.hypot(mx - px, my - py) <= hitR) {
        navigateTo(poi.enter[0], poi.enter[1], poi.full);
        if (closeFull) fullMapWrap.hidden = true;
        return;
      }
    }
    const [wx, wz] = mapToWorld(mx, my, cv.width);
    navigateTo(wx, wz, 'GPS Pin');
    if (closeFull) fullMapWrap.hidden = true;
  }

  if (mapCanvas) mapCanvas.addEventListener('click', (e) => handleMapClick(e, mapCanvas, false));
  fullMapCanvas.addEventListener('click', (e) => handleMapClick(e, fullMapCanvas, true));
  fullMapWrap.querySelector('#gm-map-cats').addEventListener('click', (e) => {
    const cat = e.target.closest('[data-mcat]')?.dataset.mcat;
    if (!cat) return;
    mapCat = cat;
    renderFullMapDirectory();
  });
  fullMapWrap.addEventListener('click', (e) => {
    const goId = e.target.closest('[data-poi-go]')?.dataset.poiGo;
    if (goId) {
      const poi = ALL_POIS.find((p) => p.id === goId);
      if (poi) { navigateTo(poi.enter[0], poi.enter[1], poi.full); fullMapWrap.hidden = true; }
      return;
    }
    const openId = e.target.closest('[data-poi-open]')?.dataset.poiOpen;
    if (openId) {
      const poi = ALL_POIS.find((p) => p.id === openId);
      if (poi) {
        fullMapWrap.hidden = true;
        if (String(poi.action || '').startsWith('node:')) {
          world.handleNodeInteract(poi);
        } else {
          world.showInsideEffect(poi.full, poi.color || '#0052ff');
          onOpenAction?.(poi.action);
        }
      }
      return;
    }
    const stk = e.target.closest('[data-stktrade]')?.dataset.stktrade;
    if (stk) {
      fullMapWrap.hidden = true;
      world.showInsideEffect(`BLOCKY STREET · ${stk} TERMINAL`, '#2ee87a');
      onOpenAction?.('trade', stk);
    }
  });
  fullPoiList.addEventListener('mouseover', (e) => {
    const id = e.target.closest('[data-hpoi]')?.dataset.hpoi || null;
    if (id !== hoverPoiId) { hoverPoiId = id; drawRadar(fullMapCtx, fullMapCanvas, true); }
  });
  fullPoiList.addEventListener('mouseleave', () => {
    if (hoverPoiId) { hoverPoiId = null; drawRadar(fullMapCtx, fullMapCanvas, true); }
  });

  function checkNearby() {
    const s = sim?.();
    if (!s?.standing) { nearLot = null; return; }
    let best = null, bestD = 6.6;
    // 1. RPG Game Nodes (Mining, Solar, Chip Fab, Personal Plot, Shop, Newsstand)
    let bestNode = null, bestNodeD = 4.6;
    for (const n of GAME_NODES) {
      const d = Math.hypot(pos.x - n.enter[0], pos.z - n.enter[1]);
      if (d < bestNodeD) { bestNodeD = d; bestNode = n; }
    }
    if (bestNode) best = { type: 'game-node', node: bestNode, name: bestNode.full };
    // 2. Individual Stock Towers on Blocky Street
    if (!best && s.stOpen && street?.getTowers) {
      let bestTw = null, bestTwD = 4.9;
      for (const tw of street.getTowers()) {
        const d = Math.hypot(pos.x - tw.x, pos.z - tw.z);
        if (d < bestTwD) { bestTwD = d; bestTw = tw; }
      }
      if (bestTw) best = { type: 'stock-tower', ticker: bestTw.ticker, name: `${bestTw.ticker} Stock Tower` };
    }
    // 3. Standing City Landmarks & 24 Base Avenue HQs
    if (!best) {
      for (const p of s.standing.values()) {
        if (!p.lot) continue;
        const lx = p.lot[0] * PITCH, lz = p.lot[1] * PITCH;
        const d = Math.hypot(pos.x - lx, pos.z - lz);
        if (d < bestD) { bestD = d; best = p; }
      }
    }
    if (!best && s.stOpen) {
      const li = Math.round(pos.x / PITCH), lj = Math.round(pos.z / PITCH);
      if (li <= -3 && li >= -7 && lj >= -3 && lj <= 2) {
        best = { type: 'stocks-district', name: 'Blocky Street Stocks' };
      }
    }
    nearLot = best;
    let actionLabel = '';
    if (nearLot) {
      const nodeCd = nearLot.type === 'game-node' ? world.getCooldownRemaining(nearLot.node.kind) : 0;
      actionLabel = nearLot.type === 'game-node' ? (nodeCd > 0 ? `${nearLot.node.actionLbl} (Ready in ${world.fmtCooldown(nodeCd)})` : `${nearLot.node.actionLbl} · ${nearLot.node.full}`)
        : nearLot.type === 'stock-tower' ? `Trade ${nearLot.ticker} on Base`
        : nearLot.type === 'exchange' ? 'Enter Base Stock Exchange'
        : nearLot.type === 'square' ? 'Enter Hall of Fame'
        : nearLot.type === 'stage' ? 'Enter BaseCity Cinema'
        : nearLot.type === 'agenthub' ? 'Enter x402 HQ'
        : nearLot.type === 'launchpad' ? 'Enter Launchpad Tower'
        : nearLot.brand?.id === 'usdc' ? 'Enter USDC Bank'
        : nearLot.brand?.id === 'morpho' ? 'Enter Morpho Vault'
        : nearLot.type === GPU_FRONTAGE.type ? 'Enter Power Plant'
        : nearLot.brand ? `Enter ${nearLot.brand.name} HQ (Passport)`
        : nearLot.type === 'stocks-district' ? 'Enter Blocky Street Trade'
        : `Inspect ${nearLot.name || nearLot.type}`;
    }
    if (promptEl) {
      if (nearLot && !modalOpen()) {
        promptEl.textContent = `Press E · ${actionLabel}`;
        promptEl.hidden = false;
      } else {
        promptEl.hidden = true;
      }
    }
    if (ctaBtn) {
      ctaBtn.textContent = nearLot && !modalOpen() ? `E · ${actionLabel.split(' · ')[0].toUpperCase()}` : 'MY PLOT · BUILD';
    }
  }

  function interact() {
    if (!active || !nearLot || modalOpen()) return;
    if (nearLot.type === 'game-node') {
      world.handleNodeInteract(nearLot.node);
      syncUserPill();
      return;
    }
    if (nearLot.type === 'stock-tower') {
      world.completeChapter('ch3_stocks');
      world.showInsideEffect(`BLOCKY STREET · ${nearLot.ticker} TRADING FLOOR`, '#2ee87a');
      onInteract?.(nearLot);
      return;
    }
    if (nearLot.type === 'stocks-district') {
      world.completeChapter('ch3_stocks');
      world.showInsideEffect('BLOCKY STREET · TRADING FLOOR', '#2ee87a');
      onInteract?.(nearLot);
      return;
    }
    if (nearLot.type === 'exchange') {
      world.showInsideEffect('BASE STOCK EXCHANGE', '#ffc83d');
      onInteract?.(nearLot);
      return;
    }
    if (nearLot.type === 'agenthub') {
      world.completeChapter('ch4_agents');
      world.showInsideEffect('X402 AGENT HQ · OPERATIONS FLOOR', '#a855f7');
      onInteract?.(nearLot);
      return;
    }
    if (nearLot.type === 'launchpad') {
      world.showInsideEffect('LAUNCHPAD TOWER · CONTROL ROOM', '#ff5c5c');
      onInteract?.(nearLot);
      return;
    }
    if (nearLot.brand?.id === 'usdc' || nearLot.brand?.id === 'morpho') {
      world.completeChapter('ch2_defi');
      const proj = PROJECTS.find((x) => x.id === nearLot.brand.id);
      if (proj) world.openProjectDossier(proj);
      else onInteract?.(nearLot);
      return;
    }
    if (nearLot.brand?.id) {
      const proj = PROJECTS.find((x) => x.id === nearLot.brand.id);
      if (proj) { world.openProjectDossier(proj); syncUserPill(); return; }
    }
    if (nearLot.type === 'square') {
      world.showInsideEffect('TOWN SQUARE · HALL OF FAME', '#fbbf24');
    }
    onInteract?.(nearLot);
  }

  function update(t, dt) {
    if (!active) return;
    if (!avatar) {
      camTarget.set(pos.x, 1.45, pos.z);
      cam.position.set(pos.x, 4.2, pos.z + 7.2);
      cam.lookAt(camTarget);
      renderer.render(scene, cam);
      return;
    }

    const locked = modalOpen();
    let f = locked ? 0 : ((keys.has('KeyW') || keys.has('ArrowUp') || touch.f ? 1 : 0)
      - (keys.has('KeyS') || keys.has('ArrowDown') || touch.b ? 1 : 0));
    let r = locked ? 0 : ((keys.has('KeyD') || keys.has('ArrowRight') || touch.r ? 1 : 0)
      - (keys.has('KeyA') || keys.has('ArrowLeft') || touch.l ? 1 : 0));

    if (f !== 0 || r !== 0) { navGoal = null; navPath = []; }

    const sprint = !locked && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
    const speedBuff = world.getHudSummary().speedMult || 1;
    const maxSpeed = (mode === 'car' ? (sprint ? 9.4 : 6.6) : (sprint ? 6.8 : 4.5)) * speedBuff;

    let mx = 0, mz = 0, moving = false;
    if (f !== 0 || r !== 0) {
      const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
      mx = fwdX * f + rightX * r;
      mz = fwdZ * f + rightZ * r;
      moving = true;
    } else if (navGoal && !locked) {
      const wp = navPath[0] || navGoal;
      const dx = wp.x - pos.x, dz = wp.z - pos.z;
      const distWp = Math.hypot(dx, dz);
      if (distWp < 1.35) {
        if (navPath.length > 1) {
          navPath.shift();
        } else {
          const arrivedLbl = navGoal.label;
          navGoal = null;
          navPath = [];
          checkNearby();
          if (arrivedLbl && arrivedLbl !== 'GPS Pin') toast?.('ARRIVED', arrivedLbl, 'Press E to interact');
        }
      } else {
        mx = dx / distWp;
        mz = dz / distWp;
        moving = true;
      }
    }

    const targetSpeed = moving ? maxSpeed : 0;
    const accel = mode === 'walk' ? 14 : (moving ? 4.5 : 10);
    speedCur += (targetSpeed - speedCur) * Math.min(1, dt * accel);
    if (speedEl && mode === 'car') {
      speedEl.querySelector('b').textContent = String(Math.round(speedCur * 6.2));
    }

    const startX = pos.x, startZ = pos.z;
    if (moving && speedCur > 0.05) {
      const len = Math.hypot(mx, mz) || 1;
      mx /= len; mz /= len;

      const lim = Math.max(2, city.land) * PITCH + 3;
      const nx = THREE.MathUtils.clamp(pos.x + mx * speedCur * dt, -lim, lim);
      const nz = THREE.MathUtils.clamp(pos.z + mz * speedCur * dt, -lim, lim);

      let movedX = canMoveTo(pos.x, pos.z, nx, pos.z);
      if (movedX) pos.x = nx;
      let movedZ = canMoveTo(pos.x, pos.z, pos.x, nz);
      if (movedZ) pos.z = nz;
      // Smooth corner-slide assist: when turning left/right slightly early near a building corner, glide smoothly onto the cross-street
      const slideStep = speedCur * dt * 0.9;
      if (!movedX && Math.abs(mx) > 0.25) {
        const rz = snapRoad(pos.z);
        const dzRoad = rz - pos.z;
        if (Math.abs(dzRoad) > 0.04 && Math.abs(dzRoad) < 1.85) {
          const sz = pos.z + Math.sign(dzRoad) * Math.min(Math.abs(dzRoad), slideStep);
          if (canMoveTo(pos.x, pos.z, pos.x, sz)) { pos.z = sz; movedZ = true; }
        }
      }
      if (!movedZ && Math.abs(mz) > 0.25) {
        const rx = snapRoad(pos.x);
        const dxRoad = rx - pos.x;
        if (Math.abs(dxRoad) > 0.04 && Math.abs(dxRoad) < 1.85) {
          const sx = pos.x + Math.sign(dxRoad) * Math.min(Math.abs(dxRoad), slideStep);
          if (canMoveTo(pos.x, pos.z, sx, pos.z)) { pos.x = sx; movedX = true; }
        }
      }
      if (!movedX && !movedZ) {
        pushOutIfStuck(false);
        if (navGoal) {
          navStuckT += dt;
          if (navStuckT > 0.35) {
            navStuckT = 0;
            if (navPath.length > 1) navPath.shift();
            else { navGoal = null; navPath = []; }
          }
        }
      } else {
        navStuckT = 0;
      }

      const targetRot = Math.atan2(mx, mz);
      let diff = targetRot - avatar.group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      avatar.group.rotation.y += diff * Math.min(1, dt * (mode === 'walk' ? 12 : 6.2));
      if (carMesh && mode === 'car') carMesh.rotation.z = THREE.MathUtils.clamp(-diff * 0.1, -0.08, 0.08);
    } else if (carMesh && mode === 'car') {
      carMesh.rotation.z *= Math.max(0, 1 - dt * 8);
    }

    const wasGrounded = grounded;
    if (!locked && keys.has('Space') && grounded && mode === 'walk') {
      vy = 5.6;
      grounded = false;
    }
    if (!grounded) {
      vy -= 16 * dt;
      pos.y += vy * dt;
      if (pos.y <= 0) { pos.y = 0; vy = 0; grounded = true; }
    }

    const inLot = Math.abs(pos.x - Math.round(pos.x / PITCH) * PITCH) < STREET_LOT_HALF
      && Math.abs(pos.z - Math.round(pos.z / PITCH) * PITCH) < STREET_LOT_HALF;
    const groundY = inLot ? 0.15 : 0;
    const travel = Math.hypot(pos.x - startX, pos.z - startZ);
    const walking = mode === 'walk' && grounded && travel > 0.001;
    const surface = inLot ? 'pavement' : 'road';
    if (walking) {
      const lastStep = Math.floor(stride / Math.PI);
      stride = (stride + travel * (sprint ? 3.3 : 4.6));
      if (Math.floor(stride / Math.PI) !== lastStep) streetAudio.step(surface);
      stride %= Math.PI * 2;
    } else stride = 0;
    if (mode === 'walk' && grounded && !wasGrounded) streetAudio.step(surface, true);
    streetAudio.drive(travel / Math.max(dt, 0.001), mode === 'car' && !locked && !document.hidden);

    const seatY = mode === 'walk' ? Math.max(groundY, pos.y + groundY) : groundY + 0.32;
    avatar.group.position.set(pos.x, seatY + (walking ? Math.abs(Math.sin(stride)) * 0.065 : 0), pos.z);

    if (carMesh && mode === 'car') {
      carMesh.position.set(pos.x, groundY, pos.z);
      carMesh.rotation.y = avatar.group.rotation.y;
    }

    const sw = walking ? Math.sin(stride) * 0.65 : 0;
    avatar.legs[0].rotation.x = sw;
    avatar.legs[1].rotation.x = -sw;
    if (emoteWaveT > 0) {
      emoteWaveT = Math.max(0, emoteWaveT - dt);
      avatar.arms[0].rotation.x = -2.4 + Math.sin(t * 18) * 0.35;
      avatar.arms[1].rotation.x = mode === 'walk' ? sw : -0.9;
      if (emoteWaveT === 0 && gmBubble) gmBubble.visible = false;
    } else {
      avatar.arms[0].rotation.x = mode === 'walk' ? -sw : -0.9;
      avatar.arms[1].rotation.x = mode === 'walk' ? sw : -0.9;
    }

    if (padsObj?.pads) {
      const pulse = 0.88 + Math.sin(t * 3.5) * 0.12;
      for (const p of padsObj.pads) {
        p.ring.scale.setScalar(pulse);
        p.beam.material.opacity = 0.14 + Math.sin(t * 3.5) * 0.08;
      }
    }

    world.updatePads(t);
    if (navGoal) {
      gpsBeacon.visible = true;
      gpsBeacon.position.set(navGoal.x, 8, navGoal.z);
      gpsBeacon.material.opacity = 0.22 + Math.sin(t * 5) * 0.1;
    } else if (gpsBeacon.visible) {
      gpsBeacon.visible = false;
    }
    const wantFov = mode === 'car' ? 62 : 60;
    if (Math.abs(cam.fov - wantFov) > 0.05) {
      cam.fov += (wantFov - cam.fov) * (1 - Math.exp(-dt * 4));
      cam.updateProjectionMatrix();
    }
    const dist = mode === 'walk' ? 7.2 : 9.2;
    // Follow ground height gently without inheriting the model's stride or jump animation.
    const desiredHeight = groundY + (mode === 'car' ? 1.77 : 1.45);
    cameraHeight += (desiredHeight - cameraHeight) * (1 - Math.exp(-dt * 3.5));
    camTarget.set(pos.x, cameraHeight, pos.z);
    camWant.set(
      camTarget.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      camTarget.y + Math.sin(pitch) * dist + 0.6,
      camTarget.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );

    rayAcc += dt;
    if (rayAcc >= 0.08) {
      rayAcc = 0;
      armDir.subVectors(camWant, camTarget);
      const armLen = armDir.length() || 1;
      ray.set(camTarget, armDir.divideScalar(armLen));
      ray.far = armLen;
      const hits = ray.intersectObject(city.solids, true).filter((hit) => hit.distance > 0.6);
      const hit = hits[0];
      let occluder = hit?.object;
      while (occluder && occluder.parent !== city.solids) occluder = occluder.parent;
      const canFade = mode === 'walk' && occluder?.userData.streetBuilding;
      fadeBuilding(canFade ? occluder : null);
      armScaleWant = !canFade && hit && hit.distance < armLen ? Math.max(0.45, (hit.distance - 0.45) / armLen) : 1;
    }
    // Smoothly damp camera arm zoom so passing trees or poles never causes screen shake
    const armRate = armScaleWant < armScale ? 8 : 2.5;
    armScale += (armScaleWant - armScale) * Math.min(1, dt * armRate);
    if (armScale < 0.995) camWant.lerpVectors(camTarget, camWant, armScale);

    cam.position.lerp(camWant, 1 - Math.exp(-dt * 10));
    lookAt.set(pos.x, cameraHeight - 0.2, pos.z);
    cam.lookAt(lookAt);

    nearAcc += dt;
    if (nearAcc >= 0.15) {
      nearAcc = 0;
      checkNearby();
    }
    mapAcc += dt;
    if (mapAcc >= 0.1) {
      mapAcc = 0;
      drawRadar(mapCtx, mapCanvas, false);
      if (!fullMapWrap.hidden) drawRadar(fullMapCtx, fullMapCanvas, true);
      const hbNow = world.getHotbarState();
      if (Math.floor(t) !== Math.floor(t - 0.1) && (world.getHudSummary().espressoOn || hbNow.memeActiveSecs > 0 || hbNow.memeCdSecs > 0)) {
        syncUserPill();
        renderHotbar();
      }
    }
    renderer.render(scene, cam);
  }

  // Input listeners
  addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.code === 'Escape') {
      if (e.defaultPrevented) return;
      if (!welcomeWrap.hidden) { closeWelcome(true); return; }
      if (!lockerWrap.hidden) { closeLocker(); return; }
      if (!fullMapWrap.hidden) { fullMapWrap.hidden = true; return; }
      if (!tasksWrap.hidden) { tasksWrap.hidden = true; return; }
      if (document.querySelector('.gm-modal-wrap:not([hidden])')) { world.closeAll(); syncUserPill(); return; }
      if (inspectEl && !inspectEl.hidden) { closeInspect(); return; }
      if (modalOpen()) return;
      exit();
      return;
    }
    if (e.target.closest?.('input, textarea, select') || modalOpen()) return;
    keys.add(e.code);
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyC') openLocker();
    if (e.code === 'KeyU') world.openUser();
    if (e.code === 'KeyN') world.openNews();
    if (e.code === 'KeyB') world.openShop();
    if (e.code === 'KeyP') world.openPlotStudio();
    if (e.code === 'KeyT') openTasks();
    if (e.code === 'KeyL') onOpenRanks?.();
    if (e.code === 'KeyM') { if (fullMapWrap.hidden) openFullMap(); else fullMapWrap.hidden = true; }
    if (e.code === 'KeyV') setMode(mode === 'walk' ? 'car' : 'walk');
    if (e.code === 'Digit1') triggerEmote('gm');
    if (e.code === 'Digit2') triggerEmote('jump');
    if (e.code === 'Digit3') triggerEmote('photo');
    if (e.code === 'Digit4') world.useConsumable('gm-espresso');
    if (e.code === 'Digit5') world.useConsumable('overclock-core');
    if (e.code === 'Digit6') world.useConsumable('warp-beacon');
    if (e.code === 'Digit7') world.triggerMemeSkill();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));

  const canvas = renderer.domElement;
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundHit = v3();
  let hoverAt = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (!active || modalOpen()) return;
    dragging = true;
    downPtr = [e.clientX, e.clientY];
    lastPtr = [e.clientX, e.clientY];
  });
  addEventListener('pointermove', (e) => {
    if (!active) return;
    if (dragging) {
      const dx = e.clientX - lastPtr[0], dy = e.clientY - lastPtr[1];
      lastPtr = [e.clientX, e.clientY];
      yaw -= dx * 0.006;
      pitch = THREE.MathUtils.clamp(pitch + dy * 0.005, 0.12, 1.15);
      return;
    }
    if (modalOpen() || e.target !== canvas) { canvas.style.cursor = ''; return; }
    const nowMs = performance.now();
    if (nowMs - hoverAt < 110) return;
    hoverAt = nowMs;
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    clickRay.setFromCamera(ndc, cam);
    const vMap = views?.();
    const hitChar = vMap?.size && clickRay.intersectObjects([...vMap.values()].map((v) => v.hit), false)[0];
    const hitObj = hitChar || street?.pickTicker?.(clickRay) || clickRay.intersectObjects(city.launchpadHits || [], false)[0] || clickRay.intersectObjects(city.billboards || [], false)[0] || clickRay.intersectObjects(city.solids.children || [], true)[0];
    canvas.style.cursor = hitObj ? 'pointer' : '';
  });
  addEventListener('pointerup', (e) => {
    if (!active) return;
    const wasTap = dragging && Math.hypot(e.clientX - downPtr[0], e.clientY - downPtr[1]) <= 6;
    dragging = false;
    if (!wasTap || modalOpen() || e.target !== canvas) return;
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    clickRay.setFromCamera(ndc, cam);

    // 1. Clickable Characters (Founder, Base Builders, Blockies)
    const vMap = views?.();
    if (vMap?.size) {
      const charHit = clickRay.intersectObjects([...vMap.values()].map((v) => v.hit), false)[0];
      if (charHit?.object?.userData?.builder) {
        inspectCharacter(charHit.object.userData.builder);
        return;
      }
    }

    // 2. Stock Towers on Blocky Street
    const hitStock = street?.pickTicker?.(clickRay);
    if (hitStock) {
      const tw = street?.getTowers?.().find((t) => t.ticker === hitStock);
      showInspect({
        eyebrow: 'BLOCKY STREET · STOCK TOWER',
        title: `${hitStock} Stock Tower`,
        desc: 'Coinbase tokenized stock on Base.',
        rows: tw?.price ? [['Reference price', `$${Number(tw.price).toFixed(2)}`]] : [],
        gps: tw ? [tw.x, tw.z] : [-36, 0],
        primaryLbl: `Trade ${hitStock}`,
        onPrimary: () => onInteract?.({ type: 'stock-tower', ticker: hitStock }),
      });
      return;
    }

    // 3. Launchpad Tower
    if (clickRay.intersectObjects(city.launchpadHits || [], false)[0]) {
      markTask('launchpad');
      showInspect({
        eyebrow: 'LAUNCHPAD TOWER',
        title: 'BaseCity Launchpad · Quadra v3',
        desc: 'Launch a new Base token paired with $BLOCKY or ETH and spawn a tower.',
        gps: [-8, 28],
        primaryLbl: 'Launch Token',
        onPrimary: () => onInteract?.({ type: 'launchpad', id: 'launchpad' }),
      });
      return;
    }

    // 4. Billboards & Sponsors
    const board = clickRay.intersectObjects(city.billboards || [], false)[0]?.object.userData.sponsor;
    if (board?.cinema) {
      showInspect({
        eyebrow: 'ENTERTAINMENT',
        title: 'BaseCity Cinema',
        desc: 'Watch community clips, drop live reactions & save souvenir tickets.',
        gps: [0, 12],
        primaryLbl: 'Enter Cinema',
        onPrimary: () => onInteract?.({ type: 'stage' }),
      });
      return;
    }
    if (board?.id === 'usdc' || board?.id === 'morpho') {
      markTask('defi_bank');
      showInspect({
        eyebrow: 'BASE DEFI',
        title: board.name || board.id.toUpperCase(),
        desc: board.tagline || 'Base Mainnet DeFi terminal.',
        gps: board.id === 'usdc' ? [-16, 28] : [8, 28],
        primaryLbl: board.id === 'usdc' ? 'Open USDC Bank' : 'Open Morpho Vault',
        onPrimary: () => onInteract?.({ brand: board }),
      });
      return;
    }
    if (board?.name) {
      const proj = PROJECTS.find((x) => x.id === board.id);
      showInspect({
        eyebrow: 'BILLBOARD · BASE PROJECT',
        title: board.name,
        desc: proj?.tagline || board.tagline || 'Featured project on BaseCity.',
        gps: board.id === 'gpu' && city.powerPlant
          ? [city.powerPlant.x + GPU_FRONTAGE.entranceX, city.powerPlant.z + GPU_FRONTAGE.roadZ] : null,
        primaryLbl: proj ? 'Open HQ & Stamp' : '',
        onPrimary: proj ? () => world.openProjectDossier(proj) : null,
        link: board.url ? { href: board.url, label: 'Website', ext: true } : null,
      });
      return;
    }

    // 5. Any City Building, Game Node, Plot, Construction Site, or River
    const solidHit = clickRay.intersectObjects(city.solids.children || [], true)[0];
    if (solidHit) {
      inspectLotAt(solidHit.point.x, solidHit.point.z);
      return;
    }
    if (clickRay.ray.intersectPlane(groundPlane, groundHit)) {
      inspectLotAt(groundHit.x, groundHit.z);
      return;
    }
    closeInspect();
  });

  if (exitBtn) exitBtn.onclick = exit;
  if (promptEl) promptEl.onclick = interact;
  if (charBtn) charBtn.onclick = () => openLocker();
  if (guideBtn) guideBtn.onclick = openWelcome;
  if (userBtn) userBtn.onclick = () => world.openUser();
  if (userPill) userPill.onclick = () => world.openUser();
  if (newsBtn) newsBtn.onclick = () => world.openNews();
  if (shopBtn) shopBtn.onclick = () => world.openShop();
  if (ctaBtn) ctaBtn.onclick = () => { if (nearLot && !modalOpen()) interact(); else world.openPlotStudio(); };
  if (questBtn) questBtn.onclick = openTasks;
  if (rankBtn) rankBtn.onclick = () => onOpenRanks?.();
  if (mapBtn) mapBtn.onclick = openFullMap;
  mapWrap?.querySelector('#pm-expand')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openFullMap();
  });
  welcomeWrap.querySelector('#gm-wel-close').onclick = () => closeWelcome();
  welcomeWrap.querySelector('#gm-wel-wclose').onclick = () => { welcomeWrap.querySelector('#gm-wel-wbox').hidden = true; };
  welcomeWrap.addEventListener('click', (e) => { if (e.target === welcomeWrap) closeWelcome(); });
  fullMapWrap.querySelector('#gm-map-close').onclick = () => { fullMapWrap.hidden = true; };
  fullMapWrap.addEventListener('click', (e) => { if (e.target === fullMapWrap) fullMapWrap.hidden = true; });
  lockerWrap.querySelector('#gm-lock-back').onclick = () => { const cb = lockerBack; lockerBack = null; lockerWrap.hidden = true; cb?.(); };
  lockerWrap.querySelector('#gm-lock-close').onclick = closeLocker;

  // Instant playable Blocky auto-equip right after buying $BLOCKY in Trade Hub (0 wait)
  window.addEventListener('basecity:blocky-bought', async (ev) => {
    const d = ev.detail || {};
    if (d.account) walletAccount = d.account;
    if (d.provider) walletProvider = d.provider;
    await refreshOwnedCharacters();
    if (!ownedBlockies.length && walletAccount) {
      const addr = walletAccount.toLowerCase();
      const baseSeed = parseInt(addr.slice(2, 10), 16) || 1;
      const num = (baseSeed % 9999) + 1;
      ownedBlockies = [makeBlocky(num, now(), addr, baseSeed)];
    }
    if (active && ownedBlockies.length) {
      spawnAvatar(ownedBlockies[0]);
      closeWelcome(true);
      await world.refreshPortfolio();
      syncUserPill();
      renderHotbar();
      renderQuestTracker();
      toast?.('BLOCKY UNLOCKED', ownedBlockies[0].name, 'Equipped immediately! Hold 1h to claim tradable NFT on /claim');
    }
  });
  lockerWrap.querySelector('#gm-lock-wclose').onclick = () => { lockerWrap.querySelector('#gm-lock-wbox').hidden = true; };
  lockerWrap.addEventListener('click', (e) => { if (e.target === lockerWrap) closeLocker(); });
  tasksWrap.querySelector('#gm-tasks-close').onclick = () => { tasksWrap.hidden = true; };
  tasksWrap.addEventListener('click', (e) => { if (e.target === tasksWrap) tasksWrap.hidden = true; });

  if (emoteBar) {
    emoteBar.addEventListener('click', (e) => {
      const em = e.target.closest('[data-emote]')?.dataset.emote;
      if (em) triggerEmote(em);
    });
  }
  if (hud) {
    hud.addEventListener('click', (e) => {
      const vm = e.target.closest('[data-vmode]')?.dataset.vmode;
      if (vm && active) setMode(vm);
    });
  }
  if (padEl) {
    const setDir = (e, on) => {
      const btn = e.target.closest('[data-move]');
      if (!btn) return;
      e.preventDefault();
      touch[btn.dataset.move] = on;
    };
    padEl.addEventListener('pointerdown', (e) => setDir(e, true));
    padEl.addEventListener('pointerup', (e) => setDir(e, false));
    padEl.addEventListener('pointercancel', (e) => setDir(e, false));
    padEl.addEventListener('pointerleave', (e) => setDir(e, false));
  }

  return {
    enter, exit, update, resize, setMode, travelTo, openTasks,
    get active() { return active; },
    get mode() { return mode; },
  };
}
