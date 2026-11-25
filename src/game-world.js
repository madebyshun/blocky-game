// BaseCity Game Mode RPG Systems (Complete Loop & Balance):
// - Core Economy Rules: Quarry (3.5s) & Solar (5m) Cooldowns, Plot Building Caps & Build Costs, Lv.1->Lv.3 Building Upgrades, Infinite Prestige XP Sink
// - Real Plot Buffs: Every 3D Plot structure grants real gameplay buffs (Chips/hr, Yield%, XP%, Max Energy, Passive Regen, 3D Custom Billboard)
// - Progression: Citizen XP & Level (Lv.1-50), Rank Titles (NEWCOMER -> CITY MAYOR), 3 Rotating Daily Missions (UTC), 5 Eco Quests, 24 Base Passport Stamps
// - Wallet Cloud Sync: Auto-syncs RPG state & Plot to /api/rpg-state with onchain USDC purchase receipt protection
import * as THREE from 'three';
import { parseUnits, encodeFunctionData, parseAbi, toHex } from 'viem';
import { rpgMessage } from './signed.js';
import { CONFIG } from './config.js';
import { PROJECTS } from './projects.js';
import { PITCH } from './sim.js';
import { esc } from './names.js';
import { BASE_USDC, fetchBaseStocks, getWalletStockBalances, getTokenBalanceRaw, getNativeEthBalance } from './swap-base.js';
import { fetchCityTasks } from './city-tasks.js';
import { toBase } from './wallet.js';
import { itemSprite, itemIcon } from './items.js';
import { renderPfp } from './pfp.js';

export const OG_MEME_ITEMS = [
  { id: 'none', name: 'None (Default)', token: 'Default', skill: 'Standard Builder', type: 'none', desc: 'Standard BaseCity Default Builder with no OG Meme skill equipped.', badge: 'DEFAULT', color: '#94a3b8' },
  { id: 'toshi', name: 'Toshi Hood', token: '$TOSHI', skill: 'Meow Yield', type: 'passive', desc: '+20% Silicon & AI Chips yield at River Quarry and Chip Fab.', badge: '+20% YIELD', color: '#1f6fff' },
  { id: 'degen', name: 'Degen Top Hat', token: '$DEGEN', skill: 'Tipping Aura', type: 'passive', desc: '+25% Citizen XP on all actions & rank progression.', badge: '+25% XP', color: '#8b5cf6' },
  { id: 'doginme', name: 'doginme Gear', token: '$DOGINME', skill: 'Got That Dog', type: 'active', cdMs: 90000, durMs: 20000, desc: 'Active (Key 7 / 20s · 90s CD): +35% Move Speed & -1.0s Quarry cooldown.', badge: 'ACTIVE · SPD', color: '#ef4444' },
  { id: 'ayb', name: 'AYB 8-Bit Visor', token: '$AYB', skill: 'All Your Silicon', type: 'active', cdMs: 120000, desc: 'Active (Key 7 / 120s CD): Next Quarry mine or Chip Fab craft costs 0 Energy & gives 2x yield.', badge: 'ACTIVE · 2X', color: '#f59e0b' },
  { id: 'baes', name: 'BAES Arcade Cap', token: '$BAES', skill: '8-Bit Overclock', type: 'passive', desc: '-2 Energy cost per Quarry mine & -20% Solar Grid cooldown (5m -> 4m).', badge: '-2 EN · -20% CD', color: '#e11d48' },
  { id: 'kibble', name: 'Kibble Cat Beanie', token: '$KIBBLE', skill: 'Cozy Regen', type: 'passive', desc: '+3 Energy/min passive regen & +15 Max Energy cap.', badge: '+3 EN/M · +15 CAP', color: '#6178a8' },
];

const BLOCKY_ADDR = CONFIG.tokenAddress || '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885';
const BASECITY_ADDR = CONFIG.flywheel?.basecityToken;
const FLYWHEEL_VAULT = CONFIG.flywheel?.contract || '0x273c3c49106Dd52Ac9b20D4FDDfcB8C6104dfA3B';
const ERC20_TRANSFER_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

const AI_STOCKS = new Set(['NVDA', 'AMD', 'SNDK', 'AVGO', 'TSM', 'PLTR']);
const SPEED_STOCKS = new Set(['TSLA', 'SPCX']);
const CAP_STOCKS = new Set(['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META']);

export const QUARRY_CD_MS = 3500;       // 3.5s mining cooldown
export const SOLAR_CD_MS = 5 * 60 * 1000; // 5m free solar recharge cooldown

export const GAME_NODES = [
  { id: 'quarry', cat: 'build', kind: 'mine-silicon', label: 'SILICON', full: 'River Silicon Quarry', desc: 'Mine raw Silicon along the river (3.5s CD · boosted by NVDA/AMD/SNDK & Plot)', action: 'node:quarry', actionLbl: 'Mine Silicon', lot: [2, 0], enter: [14, 0], color: '#38bdf8' },
  { id: 'solar', cat: 'build', kind: 'mine-energy', label: 'SOLAR', full: 'Solar Energy Grid', desc: 'Free +35 Energy recharge every 5m (or drink gm Espresso for instant boost)', action: 'node:solar', actionLbl: 'Recharge', lot: [3, -2], enter: [22, -16], color: '#facc15' },
  { id: 'fab', cat: 'build', kind: 'refine-chips', label: 'CHIP FAB', full: 'BaseCity Chip Fab', desc: 'Refine Silicon + Energy into AI Chips for tools, Plot Buildings & Upgrades', action: 'node:fab', actionLbl: 'Refine Chips', lot: [4, 2], enter: [28, 16], color: '#2ee87a' },
  { id: 'myplot', cat: 'build', kind: 'personal-plot', label: 'MY PLOT', full: 'Personal Land Plot', desc: 'Claim land, place buffed 3D buildings & upgrade Lv.1-Lv.3 structures', action: 'node:myplot', actionLbl: 'Build Plot', lot: [3, 1], enter: [24, 12], color: '#ffc83d' },
  { id: 'shop', cat: 'build', kind: 'city-shop', label: 'SHOP', full: 'BaseCity Supply Shop', desc: 'Buy mining tools, Consumables, Plot Blueprints & Voxel Decor', action: 'node:shop', actionLbl: 'Open Shop', lot: [0, -1], enter: [4, -4], color: '#fb923c' },
  { id: 'news', cat: 'city', kind: 'newsstand', label: 'NEWS', full: 'Base Daily Newsstand', desc: 'Read live Base Ecosystem news, Onchain Pulse & Daily Check-In (+5 Si)', action: 'node:news', actionLbl: 'Read News', lot: [-1, 0], enter: [-4, 4], color: '#60a5fa' },
];

export const SHOP_CATALOG = [
  { id: 'pickaxe-2', cat: 'tools', name: 'Obsidian Pickaxe Lv.2', desc: '+4 Silicon per mine at River Quarry', costSilicon: 30, costChips: 8, usdcPrice: 0, toolKey: 'pickaxeLv', toolVal: 2 },
  { id: 'pickaxe-3', cat: 'tools', name: 'Quantum Drill Lv.3', desc: '+9 Silicon per mine & lower energy cost (8 EN)', costSilicon: 75, costChips: 24, usdcPrice: 2, toolKey: 'pickaxeLv', toolVal: 3 },
  { id: 'battery-2', cat: 'tools', name: 'Solar Battery Pack', desc: '+40 Max Energy cap for longer mining sessions', costSilicon: 25, costChips: 10, usdcPrice: 1, toolKey: 'batteryLv', toolVal: 2 },
  { id: 'chip-rig', cat: 'buildings', name: 'Mini Chip Rig', desc: 'Generates +4 / +7 / +11 AI Chips/hr on Plot (Max 3)', effect: '+4/7/11 Chips/hr', maxPlot: 3, buildSi: 12, buildChips: 4, costSilicon: 20, costChips: 12, usdcPrice: 2, color: 0x2ee87a, height: 2.2 },
  { id: 'stock-tower', cat: 'buildings', name: 'Personal Stock Tower', desc: '+10% / +18% / +28% Chip & Mining Yield on Plot (Max 1)', effect: '+10/18/28% Yield', maxPlot: 1, buildSi: 18, buildChips: 8, costSilicon: 30, costChips: 18, usdcPrice: 3, color: 0x0052ff, height: 4.4 },
  { id: 'x402-booth', cat: 'buildings', name: 'x402 Research Booth', desc: '+15% / +28% / +45% Citizen XP on all actions (Max 1)', effect: '+15/28/45% XP', maxPlot: 1, buildSi: 16, buildChips: 6, costSilicon: 25, costChips: 15, usdcPrice: 2, color: 0xa855f7, height: 2.0 },
  { id: 'billboard', cat: 'buildings', name: 'Custom Neon Billboard', desc: 'Displays your Plot Name in 3D & +5/10/16% Silicon mine (Max 1)', effect: '+5/10/16% Silicon', maxPlot: 1, buildSi: 8, buildChips: 3, costSilicon: 15, costChips: 8, usdcPrice: 1, color: 0xffc83d, height: 2.8 },
  { id: 'neon-lamp', cat: 'decor', name: 'Base Blue Neon Lamp', desc: '+10 / +18 / +28 Max Energy per lamp (Max 3)', effect: '+10/18/28 Max EN', maxPlot: 3, buildSi: 6, buildChips: 2, costSilicon: 10, costChips: 4, usdcPrice: 0.5, color: 0x38bdf8, height: 1.9 },
  { id: 'voxel-tree', cat: 'decor', name: 'Voxel Tree Grove', desc: '+1 / +2 / +3 Energy/min passive regen per grove (Max 3)', effect: '+1/2/3 EN/min', maxPlot: 3, buildSi: 5, buildChips: 1, costSilicon: 8, costChips: 2, usdcPrice: 0, color: 0x22c55e, height: 1.8 },
  { id: 'gold-statue', cat: 'decor', name: 'Golden Blocky Statue', desc: '+15/25/40% Silicon & +25/40/60% Citizen XP monument (Max 1)', effect: '+15-40% Si & XP', maxPlot: 1, buildSi: 30, buildChips: 14, costSilicon: 60, costChips: 30, usdcPrice: 5, color: 0xffc83d, height: 3.1 },
  { id: 'gm-espresso', cat: 'consumables', name: 'gm Espresso', desc: 'Drink for +50 Energy & +25% move speed buff for 5m (Key 4)', costSilicon: 6, costChips: 2, usdcPrice: 0, consumable: true },
  { id: 'overclock-core', cat: 'consumables', name: 'Overclock Core', desc: 'Primes Chip Fab for 2x AI Chips yield on next craft (Key 5)', costSilicon: 12, costChips: 4, usdcPrice: 0.5, consumable: true },
  { id: 'warp-beacon', cat: 'consumables', name: 'Base Warp Beacon', desc: 'Instantly teleports your Blocky straight to Personal Plot (Key 6)', costSilicon: 10, costChips: 3, usdcPrice: 0.5, consumable: true },
];

export { itemSprite, itemIcon };

const ECO_CHAPTERS = [
  { id: 'ch1_identity', num: '01', title: 'Identity on Base', desc: 'Visit Basenames City Hall or open your User Profile (U) to inspect Base identity.', rewardSilicon: 15, rewardChips: 6, rewardXp: 60, goto: 'basenames' },
  { id: 'ch2_defi', num: '02', title: 'Dollars & Yield on Base', desc: 'Enter Circle USDC Bank or Morpho Vault HQ on DeFi Strip to inspect Base DeFi.', rewardSilicon: 20, rewardChips: 8, rewardXp: 80, goto: 'usdc' },
  { id: 'ch3_stocks', num: '03', title: 'Wall Street 24/7 (Stocks)', desc: 'Walk Blocky Street and enter any Coinbase Tokenized Stock Tower (NVDA, TSLA...).', rewardSilicon: 25, rewardChips: 12, rewardXp: 90, goto: 'stocks' },
  { id: 'ch4_agents', num: '04', title: 'Agentic Economy (x402)', desc: 'Enter AI Agent Hub (x402 HQ) or Task Board to explore autonomous Blocky Agents.', rewardSilicon: 25, rewardChips: 12, rewardXp: 90, goto: 'agents' },
  { id: 'ch5_builder', num: '05', title: 'Own & Build Your Plot', desc: 'Claim your Personal Land Plot, open Plot Build Studio, and place your first structure.', rewardSilicon: 35, rewardChips: 18, rewardXp: 120, goto: 'myplot' },
];

const DAILY_POOL = [
  { id: 'mine', title: 'River Quarry Shift', desc: 'Mine Silicon 3 times at River Quarry', target: 3, rewardSi: 18, rewardChips: 6, rewardXp: 55 },
  { id: 'craft', title: 'Chip Fab Operator', desc: 'Refine AI Chips 2 times at Chip Fab', target: 2, rewardSi: 15, rewardChips: 8, rewardXp: 60 },
  { id: 'use_item', title: 'Hotbar Boost', desc: 'Use 1 Consumable from Quick Hotbar (4/5/6)', target: 1, rewardSi: 12, rewardChips: 5, rewardXp: 45 },
  { id: 'passport', title: 'Base Avenue Tour', desc: 'Inspect & stamp 1 Base Avenue HQ', target: 1, rewardSi: 20, rewardChips: 6, rewardXp: 55 },
  { id: 'plot_act', title: 'Plot Architect', desc: 'Build, Upgrade, or Harvest on Personal Plot', target: 1, rewardSi: 16, rewardChips: 8, rewardXp: 65 },
  { id: 'news', title: 'Base Daily Reader', desc: 'Check Base Daily Newsstand (N)', target: 1, rewardSi: 10, rewardChips: 4, rewardXp: 40 },
];

const BASE_ECO_BRIEFS = [
  { id: 'b1', tag: 'STOCKS 24/7', title: 'Coinbase Tokenized Stocks trade 24/7 on Base while NYSE sleeps', body: 'Tokenized equities like NVDAc, TSLAc, MSTRc and SPCXc settle in 200ms blocks via Aerodrome Slipstream and Uniswap V3 — even on weekends. Holding these stocks in your Base wallet automatically boosts your mining and plot yields.', poi: 'stocks', cta: 'Trade on Blocky Street' },
  { id: 'b2', tag: 'AI AGENTS', title: 'x402 + ERC-8004 turn Blocky NFTs into autonomous Base workers', body: 'Every claimed BaseCity Blocky can link an ERC-8004 Agent ID and earn USDC autonomously on BaseCity Tasks and Blue Agent stock-research jobs using x402 micropayments.', poi: 'agents', cta: 'Open x402 HQ' },
  { id: 'b3', tag: 'BASE DEFI', title: 'Native USDC & Morpho Vaults power self-custody finance on Base', body: 'BaseCity connects directly to Base Mainnet USDC and Steakhouse Morpho Vaults so players can send digital dollars or earn onchain yield directly inside city buildings without leaving the 3D world.', poi: 'morpho', cta: 'Open Morpho Vault' },
  { id: 'b4', tag: 'FLYWHEEL', title: '$BASECITY & $BLOCKY Flywheel routes ecosystem fees back to holders', body: 'BaseCityFlywheel (0x273c...fA3B) splits verified onchain revenue 45% Auto-Push to BCB NFT holders, 35% Buyback & Burn to 0x...dEaD, and 20% City Treasury. Onchain Shop purchases feed directly into this vault.', poi: 'exchange', cta: 'Open Stock Exchange' },
];

const PLOT_SLOTS = [
  [-2.0, -2.0], [0, -2.0], [2.0, -2.0],
  [-2.0, 0], [0, 0], [2.0, 0],
  [-2.0, 2.0], [0, 2.0], [2.0, 2.0],
];

export function levelFromXp(totalXp = 0) {
  let lv = 1;
  let rem = Math.max(0, Math.floor(Number(totalXp) || 0));
  while (lv < 50) {
    const need = 100 + (lv - 1) * 40;
    if (rem < need) return { level: lv, xpInLevel: rem, xpForNext: need, pct: Math.round((rem / need) * 100) };
    rem -= need;
    lv += 1;
  }
  return { level: 50, xpInLevel: 1, xpForNext: 1, pct: 100 };
}

export function rankTitleForLevel(lv = 1) {
  if (lv >= 35) return 'CITY MAYOR';
  if (lv >= 20) return 'BLOCKY TYCOON';
  if (lv >= 10) return 'BASE CITIZEN';
  if (lv >= 5) return 'STOCK BUILDER';
  if (lv >= 3) return 'PLOT ARCHITECT';
  return 'NEWCOMER';
}

export function stockMultiplierForLevel(lv = 1) {
  if (lv >= 35) return 2.0;
  if (lv >= 20) return 1.6;
  if (lv >= 10) return 1.35;
  if (lv >= 5) return 1.1;
  return 1.0;
}

export const CITIZEN_PERKS = [
  { lv: 3, sprite: 'poi-plot', title: 'Plot Architect', perk: 'Free 3x3 Personal Plot + Custom 3D Neon Billboard branding', mult: '1.0x' },
  { lv: 5, sprite: 'stock-cert', title: 'Stock Builder · Tier I', perk: 'Priority Task Board badge + 1.1x Citizen Score multiplier on Hall of Fame', mult: '1.1x' },
  { lv: 10, sprite: 'chips', title: 'Master Crafter (-15% Cost)', perk: 'Active -15% Silicon & Chip discount on Chip Fab crafting & Plot upgrades', mult: '1.35x' },
  { lv: 20, sprite: 'tab-whales', title: 'Blocky 10 Tycoon', perk: 'Verified Analyst badge on x402 Stock Intel + 1.6x Citizen Score weight', mult: '1.6x' },
  { lv: 35, sprite: 'crown-gold', title: 'City Mayor · Max Rank', perk: 'Max 2.0x Citizen Score weight + top City Mayor status across BaseCity', mult: '2.0x' },
];

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function dailyMissionsForDate(dateStr) {
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) seed = (seed * 31 + dateStr.charCodeAt(i)) % 9973;
  const picks = [];
  const used = new Set();
  for (let i = 0; i < 3; i++) {
    let idx = (seed + i * 2) % DAILY_POOL.length;
    while (used.has(idx)) idx = (idx + 1) % DAILY_POOL.length;
    used.add(idx);
    picks.push(DAILY_POOL[idx]);
  }
  return picks;
}

function normPlacement(val) {
  if (!val) return null;
  if (typeof val === 'string') return { id: val, lv: 1 };
  if (typeof val === 'object' && val.id) return { id: String(val.id), lv: Math.min(3, Math.max(1, Number(val.lv || 1))) };
  return null;
}

function upgradeCost(item, nextLv, citizenLv = 1) {
  const mult = nextLv === 2 ? 1.5 : 3.0;
  const disc = citizenLv >= 10 ? 0.85 : 1.0;
  return {
    si: Math.max(6, Math.round((item.buildSi || 10) * mult * disc)),
    chips: Math.max(2, Math.round((item.buildChips || 4) * mult * disc)),
  };
}

function defaultState() {
  return {
    silicon: 20,
    chips: 8,
    energy: 100,
    maxEnergy: 100,
    lastEnergyAt: Date.now(),
    lastMineAt: 0,
    lastSolarAt: 0,
    xp: 0,
    tools: { pickaxeLv: 1, batteryLv: 1 },
    blueprints: ['billboard', 'voxel-tree'],
    consumables: { 'gm-espresso': 2, 'overclock-core': 1, 'warp-beacon': 1 },
    espressoUntil: 0,
    overclockReady: false,
    memeSkillUntil: 0,
    memeSkillCdAt: 0,
    aybChargeReady: false,
    plot: {
      claimed: false,
      name: 'My BaseCity HQ',
      bio: 'Building & stacking stocks on Base',
      lastHarvestAt: Date.now(),
      placements: {},
    },
    passport: [],
    questsDone: [],
    dailyReadNews: '',
    daily: { date: utcDay(), progress: {}, claimed: [] },
    usdcReceipts: [],
  };
}

export function computeStockBuffs(walletStocks = []) {
  let aiCount = 0, speedCount = 0, capCount = 0;
  for (const s of walletStocks) {
    if (!s || Number(s.balance || 0) <= 0) continue;
    const t = String(s.ticker || '').toUpperCase();
    if (AI_STOCKS.has(t)) aiCount++;
    if (SPEED_STOCKS.has(t)) speedCount++;
    if (CAP_STOCKS.has(t)) capCount++;
  }
  const chipMult = 1 + Math.min(1, aiCount * 0.25);
  const speedMult = 1 + Math.min(0.45, speedCount * 0.22);
  const bonusEnergy = Math.min(60, capCount * 20);
  const labels = [];
  if (aiCount > 0) labels.push(`AI Stocks +${Math.round((chipMult - 1) * 100)}% Yield`);
  if (speedCount > 0) labels.push(`Mobility +${Math.round((speedMult - 1) * 100)}% Speed`);
  if (capCount > 0) labels.push(`Mega-Cap +${bonusEnergy} Energy`);
  return { aiCount, speedCount, capCount, chipMult, speedMult, bonusEnergy, labels };
}

export function computePlotBuffs(placements = {}) {
  let rigChipsHr = 0;
  let yieldBonus = 0;
  let siliconBonus = 0;
  let xpBonus = 0;
  let maxEnergyBonus = 0;
  let energyRegenBonus = 0;
  let plotScore = 0;

  for (const raw of Object.values(placements || {})) {
    const p = normPlacement(raw);
    if (!p) continue;
    const lv = p.lv;
    plotScore += lv * 10;
    if (p.id === 'chip-rig') rigChipsHr += lv === 3 ? 11 : lv === 2 ? 7 : 4;
    if (p.id === 'stock-tower') yieldBonus += lv === 3 ? 0.28 : lv === 2 ? 0.18 : 0.10;
    if (p.id === 'x402-booth') xpBonus += lv === 3 ? 0.45 : lv === 2 ? 0.28 : 0.15;
    if (p.id === 'billboard') siliconBonus += lv === 3 ? 0.16 : lv === 2 ? 0.10 : 0.05;
    if (p.id === 'neon-lamp') maxEnergyBonus += lv === 3 ? 28 : lv === 2 ? 18 : 10;
    if (p.id === 'voxel-tree') energyRegenBonus += lv;
    if (p.id === 'gold-statue') {
      siliconBonus += lv === 3 ? 0.40 : lv === 2 ? 0.25 : 0.15;
      xpBonus += lv === 3 ? 0.60 : lv === 2 ? 0.40 : 0.25;
    }
  }
  const labels = [];
  if (rigChipsHr > 0) labels.push(`Plot Rigs +${rigChipsHr} Chips/hr`);
  if (yieldBonus > 0) labels.push(`Stock Tower +${Math.round(yieldBonus * 100)}% Yield`);
  if (siliconBonus > 0) labels.push(`Plot +${Math.round(siliconBonus * 100)}% Silicon`);
  if (xpBonus > 0) labels.push(`Plot +${Math.round(xpBonus * 100)}% XP`);
  if (maxEnergyBonus > 0) labels.push(`Lamps +${maxEnergyBonus} Max EN`);
  if (energyRegenBonus > 0) labels.push(`Trees +${energyRegenBonus} EN/min`);
  return { rigChipsHr, yieldBonus, siliconBonus, xpBonus, maxEnergyBonus, energyRegenBonus, plotScore, labels };
}

function makeBillboardLabel(text) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = '#0d0e11';
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#ffc83d';
  g.lineWidth = 6;
  g.strokeRect(4, 4, 248, 88);
  g.fillStyle = '#ffc83d';
  g.font = '800 24px Inter, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(text || 'My BaseCity HQ').slice(0, 18), 128, 48);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGameWorld({ city, toast, getWallet, getBlocky, getCitizenTier, getMemeItem, getCustomAvatar, onEquipMemeItem, onOpenAction, onTravelTo, onTeleportTo, onOpenLocker, onStateChange }) {
  let state = defaultState();
  let stateKey = 'basecity:rpg:visitor';
  let walletStocks = [];
  let balances = { usdc: 0, eth: 0, blocky: 0, basecity: 0 };
  let phoneWallet = null;
  let buffs = computeStockBuffs([]);
  let plotBuffs = computePlotBuffs({});
  let liveNewsCache = null;
  let syncTimer = null;
  let lastSyncedAt = 0;
  let rpgDeclined = ''; // the wallet that said no to the save signature this visit: don't ask again until reload

  // Cloud saves need a session: ONE wallet signature (no transaction, no gas) opens 24 hours of saving. Without it,
  // progress stays on this device exactly as before.
  async function rpgToken(account, provider) {
    const key = `basecity:rpg-sess:${account.toLowerCase()}`;
    try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c?.token && c.exp > Date.now() + 60000) return c.token; } catch { /* none */ }
    if (rpgDeclined === account || !provider) return null;
    try {
      const issuedAt = new Date().toISOString();
      const signature = await provider.request({ method: 'personal_sign', params: [toHex(rpgMessage(account, issuedAt)), account] });
      const r = await fetch('/api/rpg-state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'session', address: account, issuedAt, signature }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.token) throw new Error(j?.error || 'Could not open a save session.');
      try { localStorage.setItem(key, JSON.stringify({ token: j.token, exp: j.expiresAt })); } catch { /* ignore */ }
      return j.token;
    } catch { rpgDeclined = account; return null; }
  }

  // 3D Personal Plot Group at lot [3, 1]
  const plotGroup = new THREE.Group();
  plotGroup.position.set(3 * PITCH, 0, 1 * PITCH);
  city.root.add(plotGroup);

  // 3D Node Pads for Mining / Shop / News / My Plot
  const nodePadsGroup = new THREE.Group();
  const nodePads = [];
  for (const n of GAME_NODES) {
    const col = parseInt(n.color.replace('#', ''), 16);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.28, 24),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(n.enter[0], 0.14, n.enter[1]);
    nodePadsGroup.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.45, 2.4, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(n.enter[0], 1.3, n.enter[1]);
    nodePadsGroup.add(beam);
    nodePads.push({ ring, beam });
  }
  nodePadsGroup.visible = false;
  city.root.add(nodePadsGroup);

  // Direct Step-Inside Room Effect Banner
  const roomBanner = document.createElement('div');
  roomBanner.className = 'gm-inside-bar';
  roomBanner.hidden = true;
  document.body.appendChild(roomBanner);
  let roomTimer = null;

  function showInsideEffect(label, accent = '#0052ff') {
    roomBanner.style.borderColor = accent;
    roomBanner.innerHTML = `<span style="background:${accent}"></span><b>INSIDE · ${esc(label)}</b><small>ESC to step outside</small>`;
    roomBanner.hidden = false;
    roomBanner.classList.remove('in');
    void roomBanner.offsetWidth;
    roomBanner.classList.add('in');
    clearTimeout(roomTimer);
    roomTimer = setTimeout(() => { roomBanner.hidden = true; }, 3200);
  }

  function ensureDaily() {
    const today = utcDay();
    if (!state.daily || state.daily.date !== today) {
      state.daily = { date: today, progress: {}, claimed: [] };
    }
    if (!state.daily.progress) state.daily.progress = {};
    if (!Array.isArray(state.daily.claimed)) state.daily.claimed = [];
  }

  function normalizeAllPlacements(raw = {}) {
    const out = {};
    for (const [k, v] of Object.entries(raw || {})) {
      const p = normPlacement(v);
      if (p) out[k] = p;
    }
    return out;
  }

  function applyStateObject(saved) {
    if (saved && typeof saved === 'object') {
      state = {
        ...defaultState(),
        ...saved,
        tools: { ...defaultState().tools, ...(saved.tools || {}) },
        consumables: { ...defaultState().consumables, ...(saved.consumables || {}) },
        plot: {
          ...defaultState().plot,
          ...(saved.plot || {}),
          placements: normalizeAllPlacements(saved.plot?.placements || {}),
        },
        blueprints: Array.isArray(saved.blueprints) ? saved.blueprints : defaultState().blueprints,
        passport: Array.isArray(saved.passport) ? saved.passport : [],
        questsDone: Array.isArray(saved.questsDone) ? saved.questsDone : [],
        usdcReceipts: Array.isArray(saved.usdcReceipts) ? saved.usdcReceipts : [],
      };
    } else {
      state = defaultState();
    }
    ensureDaily();
    plotBuffs = computePlotBuffs(state.plot.placements);
    rechargeEnergy();
    rebuildPlot3D();
  }

  function loadState(addr) {
    stateKey = `basecity:rpg:${(addr || 'visitor').toLowerCase()}`;
    try {
      const saved = JSON.parse(localStorage.getItem(stateKey) || 'null');
      applyStateObject(saved);
    } catch {
      applyStateObject(null);
    }
  }

  function scheduleRemoteSync(immediate = false) {
    const { account, provider } = getWallet();
    if (!account) return;
    const run = async () => {
      try {
        const token = await rpgToken(account, provider);
        if (!token) return;
        const lv = levelFromXp(state.xp);
        const blocky = getBlocky();
        const mult = stockMultiplierForLevel(lv.level);
        const r = await fetch('/api/rpg-state', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-rpg-token': token },
          body: JSON.stringify({
            address: account,
            state,
            meta: {
              name: blocky?.name || `${account.slice(0, 6)}…${account.slice(-4)}`,
              level: lv.level,
              rankTitle: rankTitleForLevel(lv.level),
              stockMult: mult,
            },
          }),
        });
        if (r.ok) lastSyncedAt = Date.now();
        else if (r.status === 401) { try { localStorage.removeItem(`basecity:rpg-sess:${account.toLowerCase()}`); } catch { /* ignore */ } }
      } catch { /* offline or local without KV */ }
    };
    clearTimeout(syncTimer);
    if (immediate) run();
    else syncTimer = setTimeout(run, 2200);
  }

  function saveState(immediateSync = false) {
    plotBuffs = computePlotBuffs(state.plot.placements);
    try { localStorage.setItem(stateKey, JSON.stringify(state)); } catch { /* ignore */ }
    scheduleRemoteSync(immediateSync);
    onStateChange?.();
  }

  function currentMemeId() {
    return getMemeItem?.() || 'none';
  }

  function currentMemeDef() {
    const id = currentMemeId();
    return OG_MEME_ITEMS.find((x) => x.id === id) || OG_MEME_ITEMS[0];
  }

  function memeSkillActive() {
    return currentMemeId() === 'doginme' && (state.memeSkillUntil || 0) > Date.now();
  }

  function memeSkillCdRemaining() {
    const def = currentMemeDef();
    if (def.type !== 'active' || !def.cdMs) return 0;
    return Math.max(0, def.cdMs - (Date.now() - (state.memeSkillCdAt || 0)));
  }

  function addXp(baseAmt) {
    const prevLv = levelFromXp(state.xp).level;
    const degenMult = currentMemeId() === 'degen' ? 1.25 : 1;
    const gain = Math.max(1, Math.round(baseAmt * (1 + plotBuffs.xpBonus) * degenMult));
    state.xp = (Number(state.xp) || 0) + gain;
    const nextLv = levelFromXp(state.xp).level;
    if (nextLv > prevLv) {
      toast?.(`LEVEL UP · LV.${nextLv}`, rankTitleForLevel(nextLv), `Earned +${gain} XP · New Citizen Rank`);
    }
    return gain;
  }

  function bumpDaily(missionId, delta = 1) {
    ensureDaily();
    const active = dailyMissionsForDate(state.daily.date);
    const m = active.find((x) => x.id === missionId);
    if (!m || state.daily.claimed.includes(missionId)) return;
    const prev = Number(state.daily.progress[missionId] || 0);
    const next = Math.min(m.target, prev + delta);
    if (next !== prev) {
      state.daily.progress[missionId] = next;
      if (next >= m.target && prev < m.target) {
        toast?.('DAILY MISSION READY', m.title, 'Click Claim in Quest Tracker or Profile');
      }
    }
  }

  function claimDailyMission(missionId) {
    ensureDaily();
    const active = dailyMissionsForDate(state.daily.date);
    const m = active.find((x) => x.id === missionId);
    if (!m || state.daily.claimed.includes(missionId)) return false;
    const cur = Number(state.daily.progress[missionId] || 0);
    if (cur < m.target) return false;
    state.daily.claimed.push(missionId);
    state.silicon += m.rewardSi;
    state.chips += m.rewardChips;
    const xpGain = addXp(m.rewardXp);
    saveState(true);
    toast?.('DAILY CLAIMED', m.title, `+${m.rewardSi} Si · +${m.rewardChips} Chips · +${xpGain} XP`);
    if (!userWrap.hidden) renderUserModal();
    return true;
  }

  function maxEnergyCap() {
    const kibbleCap = currentMemeId() === 'kibble' ? 15 : 0;
    return 100 + ((state.tools.batteryLv - 1) * 40) + buffs.bonusEnergy + plotBuffs.maxEnergyBonus + kibbleCap;
  }

  function rechargeEnergy() {
    const cap = maxEnergyCap();
    state.maxEnergy = cap;
    const kibbleRegen = currentMemeId() === 'kibble' ? 3 : 0;
    const ratePerMin = 2 + plotBuffs.energyRegenBonus + kibbleRegen;
    const elapsedMin = Math.max(0, (Date.now() - (state.lastEnergyAt || Date.now())) / 60000);
    if (elapsedMin >= 1 && state.energy < cap) {
      const gain = Math.floor(elapsedMin * ratePerMin);
      if (gain > 0) {
        state.energy = Math.min(cap, state.energy + gain);
        state.lastEnergyAt = Date.now();
      }
    }
  }

  function rebuildPlot3D() {
    while (plotGroup.children.length) plotGroup.remove(plotGroup.children[0]);
    const basePad = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 0.16, 6.6),
      new THREE.MeshLambertMaterial({ color: state.plot.claimed ? 0x161922 : 0x1f2430 }),
    );
    basePad.position.set(0, 0.08, 0);
    basePad.receiveShadow = true;
    plotGroup.add(basePad);

    const border = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 0.12, 6.8),
      new THREE.MeshBasicMaterial({ color: state.plot.claimed ? 0xffc83d : 0x475569, wireframe: true }),
    );
    border.position.set(0, 0.16, 0);
    plotGroup.add(border);

    if (!state.plot.claimed) return;
    const addBox = (parent, w, h, d, color, x, y, z, emissive = 0x000000) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color, emissive }),
      );
      m.position.set(x, y + h / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
    };
    const placements = state.plot.placements || {};
    for (const [slotStr, rawVal] of Object.entries(placements)) {
      const p = normPlacement(rawVal);
      if (!p) continue;
      const idx = Number(slotStr);
      const xy = PLOT_SLOTS[idx];
      if (!xy) continue;
      const itemId = p.id;
      const lv = p.lv;
      const lvScaleY = lv === 3 ? 1.32 : lv === 2 ? 1.15 : 1.0;

      const g = new THREE.Group();
      g.position.set(xy[0], 0.16, xy[1]);
      if (itemId === 'chip-rig') {
        addBox(g, 1.35, 1.65 * lvScaleY, 1.25, 0x1e293b, 0, 0, 0);
        addBox(g, 1.1, 0.22, 1.3, 0x2ee87a, 0, 0.35, 0, 0x0d5c2b);
        addBox(g, 1.1, 0.22, 1.3, 0x38bdf8, 0, 0.95, 0, 0x0c4a6e);
        if (lv >= 2) addBox(g, 1.1, 0.22, 1.3, 0xffc83d, 0, 1.45, 0, 0x6b4f00);
        addBox(g, 0.45, 0.3, 0.45, lv === 3 ? 0x2ee87a : 0xffc83d, 0, 1.65 * lvScaleY, 0, lv === 3 ? 0x16a34a : 0x000000);
      } else if (itemId === 'stock-tower') {
        const h = 3.8 * lvScaleY;
        addBox(g, 1.3, h, 1.3, 0x0052ff, 0, 0, 0);
        addBox(g, 1.38, 0.28, 1.38, 0xffc83d, 0, h * 0.72, 0, 0x6b4f00);
        addBox(g, 0.95, 0.55, 0.95, lv === 3 ? 0x2ee87a : 0x60a5fa, 0, h, 0, lv >= 2 ? 0x0052ff : 0x000000);
      } else if (itemId === 'x402-booth') {
        addBox(g, 1.35, 1.35 * lvScaleY, 1.2, 0x581c87, 0, 0, 0);
        addBox(g, 1.5, 0.22, 1.4, 0xa855f7, 0, 1.35 * lvScaleY, 0);
        addBox(g, 0.16, 0.65, 0.16, 0xc084fc, 0, 1.57 * lvScaleY, 0);
        addBox(g, 0.55, 0.14, 0.55, lv === 3 ? 0x2ee87a : 0x38bdf8, 0, 2.15 * lvScaleY, 0, 0x0c4a6e);
      } else if (itemId === 'billboard') {
        addBox(g, 0.18, 1.4, 0.18, 0x64748b, -0.45, 0, 0);
        addBox(g, 0.18, 1.4, 0.18, 0x64748b, 0.45, 0, 0);
        const signMat = new THREE.MeshBasicMaterial({ map: makeBillboardLabel(state.plot.name) });
        const sign = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.95, 0.18), signMat);
        sign.position.set(0, 1.85, 0);
        g.add(sign);
      } else if (itemId === 'neon-lamp') {
        addBox(g, 0.5, 0.16, 0.5, 0x475569, 0, 0, 0);
        addBox(g, 0.16, 1.7 * lvScaleY, 0.16, 0x334155, 0, 0.16, 0);
        addBox(g, 0.55, 0.55, 0.55, lv === 3 ? 0x2ee87a : 0x38bdf8, 0, 1.86 * lvScaleY, 0, 0x0052ff);
      } else if (itemId === 'voxel-tree') {
        addBox(g, 0.34, 0.95, 0.34, 0x78350f, 0, 0, 0);
        addBox(g, 1.35, 0.75, 1.35, 0x15803d, 0, 0.85, 0);
        addBox(g, 0.95, 0.55, 0.95, 0x22c55e, 0, 1.55, 0);
        if (lv >= 2) addBox(g, 0.6, 0.45, 0.6, 0x4ade80, 0, 2.05, 0);
      } else if (itemId === 'gold-statue') {
        addBox(g, 1.2, 0.35, 1.2, 0x64748b, 0, 0, 0);
        addBox(g, 0.25, 0.65, 0.28, 0xd97706, -0.18, 0.35, 0);
        addBox(g, 0.25, 0.65, 0.28, 0xd97706, 0.18, 0.35, 0);
        addBox(g, 0.78, 0.85 * lvScaleY, 0.48, 0xf59e0b, 0, 1.0, 0, 0x6b4f00);
        addBox(g, 0.66, 0.66, 0.66, 0xffc83d, 0, 1.0 + 0.85 * lvScaleY, 0, 0x785000);
      } else {
        addBox(g, 1.3, 2.0, 1.3, 0x0052ff, 0, 0, 0);
      }
      if (lv >= 2) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.75, 0.88, 16),
          new THREE.MeshBasicMaterial({ color: lv === 3 ? 0xffc83d : 0x38bdf8, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(0, 0.04, 0);
        g.add(ring);
      }
      plotGroup.add(g);
    }
  }

  function completeChapter(id) {
    if (state.questsDone.includes(id)) return;
    const ch = ECO_CHAPTERS.find((c) => c.id === id);
    if (!ch) return;
    state.questsDone.push(id);
    state.silicon += ch.rewardSilicon;
    state.chips += ch.rewardChips;
    const xpGain = addXp(ch.rewardXp || 75);
    saveState();
    toast?.('QUEST COMPLETED', ch.title, `+${ch.rewardSilicon} Silicon · +${ch.rewardChips} AI Chips · +${xpGain} XP`);
  }

  async function refreshPortfolio() {
    const { account } = getWallet();
    loadState(account);
    if (!account) {
      phoneWallet = null;
      walletStocks = [];
      balances = { usdc: 0, eth: 0, blocky: 0, basecity: 0 };
      buffs = computeStockBuffs([]);
      return;
    }
    try {
      const [remoteRes, allStocks, usdc, eth, blocky, basecity] = await Promise.all([
        fetch(`/api/rpg-state?address=${encodeURIComponent(account)}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetchBaseStocks().catch(() => []),
        getTokenBalanceRaw(BASE_USDC, account, 6).catch(() => ({ unavailable: true })),
        getNativeEthBalance(account).catch(() => ({ unavailable: true })),
        getTokenBalanceRaw(BLOCKY_ADDR, account, 18).catch(() => ({ unavailable: true })),
        getTokenBalanceRaw(BASECITY_ADDR, account, 18).catch(() => ({ unavailable: true })),
      ]);

      if (getWallet().account !== account) return;

      // Merge remote cloud save (preserves USDC receipts & higher progression across devices)
      if (remoteRes?.state && typeof remoteRes.state === 'object') {
        const rem = remoteRes.state;
        const useRemoteCore = (Number(rem.xp || 0) > Number(state.xp || 0)) || (Number(rem.updatedAt || 0) > Number(state.updatedAt || 0) && Number(state.xp || 0) === 0);
        const mergedReceipts = [...(state.usdcReceipts || []), ...(rem.usdcReceipts || [])];
        const bpUnion = [...new Set([...(state.blueprints || []), ...(rem.blueprints || [])])];
        for (const rc of mergedReceipts) {
          if (rc?.itemId && !rc.itemId.startsWith('pickaxe-') && !rc.itemId.startsWith('battery-') && !['gm-espresso', 'overclock-core', 'warp-beacon'].includes(rc.itemId)) {
            if (!bpUnion.includes(rc.itemId)) bpUnion.push(rc.itemId);
          }
        }
        const merged = {
          ...(useRemoteCore ? rem : state),
          xp: Math.max(Number(state.xp || 0), Number(rem.xp || 0)),
          tools: {
            pickaxeLv: Math.max(Number(state.tools?.pickaxeLv || 1), Number(rem.tools?.pickaxeLv || 1)),
            batteryLv: Math.max(Number(state.tools?.batteryLv || 1), Number(rem.tools?.batteryLv || 1)),
          },
          blueprints: bpUnion,
          passport: [...new Set([...(state.passport || []), ...(rem.passport || [])])],
          questsDone: [...new Set([...(state.questsDone || []), ...(rem.questsDone || [])])],
          usdcReceipts: mergedReceipts,
        };
        applyStateObject(merged);
        lastSyncedAt = Date.now();
      }

      const holdings = allStocks.length ? await getWalletStockBalances(allStocks, account).catch(() => []) : [];
      if (getWallet().account !== account) return;
      walletStocks = holdings;
      phoneWallet = {
        account, stocks: holdings,
        ...Object.fromEntries(Object.entries({ usdc, eth, blocky, basecity }).map(([key, value]) =>
          [key, value?.unavailable ? null : value?.balance ?? null])),
      };
      balances = {
        usdc: Number(usdc?.balance || 0),
        eth: Number(eth?.balance || 0),
        blocky: Number(blocky?.balance || 0),
        basecity: Number(basecity?.balance || 0),
      };
      buffs = computeStockBuffs(walletStocks);
      rechargeEnergy();
      saveState();
    } catch { /* ignore */ }
  }

  // ---------- MODAL 1: USER PROFILE & PORTFOLIO (U) ----------
  let userTab = 'overview';
  let userBack = null;
  const userWrap = document.createElement('div');
  userWrap.className = 'gm-modal-wrap';
  userWrap.hidden = true;
  userWrap.innerHTML = `
    <div class="td gm-user-modal" role="dialog" aria-modal="true" aria-label="User Profile">
      <div class="td-head">
        ${itemSprite('user-avatar', 38)}
        <div class="td-title"><b id="gmu-title">CITIZEN PROFILE</b><span id="gmu-sub">BaseCity Identity, Portfolio, Stock Buffs &amp; Base Passport</span></div>
        <div class="td-head-acts">
          <button type="button" class="td-back" id="gmu-back" hidden>Back</button>
          <button type="button" class="td-x" id="gmu-close">Close</button>
        </div>
      </div>
      <div class="lp-seg" style="margin-top:12px" id="gmu-tabs">
        <button type="button" class="lp-seg-btn on" data-utab="overview">${itemIcon('coin-usdc', 15)} Portfolio</button>
        <button type="button" class="lp-seg-btn" data-utab="og_skills">OG Skills</button>
        <button type="button" class="lp-seg-btn" data-utab="stocks_perks">${itemIcon('stock-cert', 15)} Stocks &amp; Perks</button>
        <button type="button" class="lp-seg-btn" data-utab="inventory">${itemIcon('chips', 15)} Craft</button>
        <button type="button" class="lp-seg-btn" data-utab="passport">${itemIcon('stamp-lit', 15)} Passport</button>
        <button type="button" class="lp-seg-btn" data-utab="quests">${itemIcon('quest-medal', 15)} Quests</button>
      </div>
      <div id="gmu-body" style="margin-top:12px"></div>
    </div>`;
  document.body.appendChild(userWrap);

  function renderUserModal() {
    rechargeEnergy();
    ensureDaily();
    const { account } = getWallet();
    const blocky = getBlocky();
    const tier = getCitizenTier?.() || { id: account ? 'builder' : 'visitor', label: account ? 'DEFAULT BUILDER' : 'VISITOR', short: '', eligible: false };
    const lv = levelFromXp(state.xp);
    const rankTitle = rankTitleForLevel(lv.level);
    const stockMult = stockMultiplierForLevel(lv.level);
    userWrap.querySelectorAll('[data-utab]').forEach((b) => b.classList.toggle('on', b.dataset.utab === userTab));
    userWrap.querySelector('#gmu-title').textContent = blocky ? `${blocky.name.toUpperCase()} · LV.${lv.level}` : `CITIZEN PROFILE · LV.${lv.level}`;
    userWrap.querySelector('#gmu-sub').textContent = `${rankTitle} · ${tier.label} · ${state.xp.toLocaleString('en-US')} XP · Stocks x${stockMult.toFixed(2)}`;
    const body = userWrap.querySelector('#gmu-body');

    if (userTab === 'overview') {
      const stocksUsd = walletStocks.reduce((sum, s) => sum + (Number(s.balance || 0) * Number(s.nav || 0)), 0);
      const buffIcon = (lbl) => (lbl.includes('AI') || lbl.includes('Yield') || lbl.includes('Silicon') ? 'buff-ai' : lbl.includes('Speed') ? 'buff-speed' : 'buff-cap');
      const memeDef = currentMemeDef();
      const memeBuffLabel = memeDef.id !== 'none' ? [`OG ${memeDef.token}: ${memeDef.skill} (${memeDef.badge})`] : [];
      const allBuffLabels = [...memeBuffLabel, ...buffs.labels, ...plotBuffs.labels];
      const walletBarHtml = account
        ? `<div class="gmu-wallet-bar">
            <div class="gmu-w-info">
              <span>BASE WALLET ADDRESS</span>
              <code title="${esc(account)}">${esc(account)}</code>
            </div>
            <div class="gmu-w-acts">
              <button type="button" class="btn primary small-pill" id="gmu-copy-addr">Copy</button>
              <a class="btn small-pill" href="https://basescan.org/address/${esc(account)}" target="_blank" rel="noopener">BaseScan</a>
            </div>
          </div>`
        : `<div class="gmu-wallet-bar">
            <div class="gmu-w-info">
              <span>BASE WALLET</span>
              <small>Not connected · Playing locally as Visitor</small>
            </div>
            <button type="button" class="btn primary small-pill" id="gmu-conn-bar">Connect Wallet</button>
          </div>`;
      body.innerHTML = `
        ${walletBarHtml}
        <div class="gm-rank-bar" style="margin-top:0">
          <div class="gm-rank-top"><span>RANK: <b>${esc(rankTitle)} · LV.${lv.level}</b></span><span>${lv.xpInLevel} / ${lv.xpForNext} XP (${lv.pct}%)</span></div>
          <div class="gm-rank-track"><div class="gm-rank-fill" style="width:${lv.pct}%"></div></div>
        </div>
        <div class="gmu-kpis">
          <div class="gmu-kpi mc-kpi">${itemSprite('coin-usdc', 32)}<div><span>USDC (Base)</span><b>$${balances.usdc.toFixed(2)}</b></div></div>
          <div class="gmu-kpi mc-kpi">${itemSprite('coin-eth', 32)}<div><span>ETH (Base)</span><b>${balances.eth.toFixed(4)}</b></div></div>
          <div class="gmu-kpi mc-kpi">${itemSprite('coin-blocky', 32)}<div><span>$BLOCKY</span><b>${balances.blocky.toLocaleString('en-US', { maximumFractionDigits: 1 })}</b></div></div>
          <div class="gmu-kpi mc-kpi">${itemSprite('coin-basecity', 32)}<div><span>$BASECITY</span><b>${balances.basecity.toLocaleString('en-US', { maximumFractionDigits: 1 })}</b></div></div>
        </div>
        <div class="gmu-box">
          <div class="gmu-box-h"><b>ACTIVE STOCK &amp; PLOT BUFFS</b><span>${walletStocks.length} stocks (~$${stocksUsd.toFixed(2)}) · Plot Score ${plotBuffs.plotScore}</span></div>
          ${allBuffLabels.length
            ? `<div class="gmu-buffs">${allBuffLabels.map((l) => `<span class="gmu-buff-pill">${itemIcon(buffIcon(l), 15)}${esc(l)}</span>`).join('')}</div>`
            : '<p class="gmu-muted">Hold Base Tokenized Stocks (NVDA, TSLA, AAPL...) or build structures on your Personal Plot to unlock Yield, Speed, Energy &amp; XP buffs.</p>'}
          ${walletStocks.length ? `<div class="gmu-stk-list">${walletStocks.slice(0, 8).map((s) => `<div class="gmu-stk-row"><b>${itemIcon('stock-cert', 15)} ${esc(s.ticker)}</b><span>${Number(s.balance).toFixed(4)} shares</span><em>${s.nav ? `$${(Number(s.balance) * Number(s.nav)).toFixed(2)}` : ''}</em></div>`).join('')}</div>` : ''}
        </div>
        <div class="gmu-acts">
          <button type="button" class="btn primary" id="gmu-go-trade">Trade Stocks &amp; $BLOCKY</button>
          <button type="button" class="btn" id="gmu-go-char">${account ? 'Switch Blocky (C)' : 'Connect Wallet (C)'}</button>
          <button type="button" class="btn" id="gmu-go-plot">My Land Plot</button>
        </div>`;
      body.querySelector('#gmu-copy-addr')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        try { await navigator.clipboard.writeText(account); btn.textContent = 'Copied'; } catch { btn.textContent = 'Copy Failed'; }
        toast?.('ADDRESS COPIED', `${account.slice(0, 6)}…${account.slice(-4)}`, 'Base Mainnet wallet address');
        setTimeout(() => { if (btn.isConnected) btn.textContent = 'Copy'; }, 1500);
      });
      body.querySelector('#gmu-conn-bar')?.addEventListener('click', () => { const prev = userBack; userWrap.hidden = true; onOpenLocker?.(() => openUser('overview', prev)); });
      body.querySelector('#gmu-go-trade').onclick = () => { userWrap.hidden = true; onOpenAction?.('trade'); };
      body.querySelector('#gmu-go-char').onclick = () => { const prev = userBack; userWrap.hidden = true; onOpenLocker?.(() => openUser('overview', prev)); };
      body.querySelector('#gmu-go-plot').onclick = () => { const prev = userBack; userWrap.hidden = true; openPlotStudio(() => openUser('overview', prev)); };
      return;
    }

    if (userTab === 'og_skills') {
      const memeDef = currentMemeDef();
      const cdMs = memeSkillCdRemaining();
      const activeOn = memeSkillActive();
      const aybReady = currentMemeId() === 'ayb' && state.aybChargeReady;
      const avatarCfg = getCustomAvatar?.() || { name: 'Default Builder', skin: 0xf2cfa0, hatStyle: 'cap', hatColor: 0x0052ff, hairColor: 0x2b1d14, shirt: 0x2563eb, pants: 0x1e293b, memeItem: memeDef.id };
      const triggerLabel = memeDef.type !== 'active'
        ? 'PASSIVE SKILL ALWAYS ON'
        : activeOn
          ? `ACTIVE (${Math.ceil((state.memeSkillUntil - Date.now()) / 1000)}s)`
          : aybReady
            ? '2X CHARGE ARMED'
            : cdMs > 0
              ? `COOLDOWN ${fmtCooldown(cdMs)}`
              : 'Trigger Active Skill (Key 7)';
      body.innerHTML = `
        <div class="og-hero">
          <div class="og-hero-pfp"><img id="og-pfp-img" alt="${esc(memeDef.name)}" /></div>
          <div class="og-hero-meta">
            <div class="og-hero-top">
              <b>${esc(memeDef.name)}</b>
              <span class="og-pill" style="border-color:${esc(memeDef.color)};color:${esc(memeDef.color)}">${esc(memeDef.token)} · ${esc(memeDef.badge)}</span>
            </div>
            <div class="og-skill-line">Skill: <b>${esc(memeDef.skill)}</b> — ${esc(memeDef.desc)}</div>
            <div class="og-hero-acts">
              <button type="button" class="btn primary small-pill" id="og-trigger-btn" ${memeDef.type !== 'active' || activeOn || aybReady || cdMs > 0 ? 'disabled' : ''}>${esc(triggerLabel)}</button>
              <button type="button" class="btn small-pill" id="og-open-locker">Customize Gear (C)</button>
            </div>
          </div>
        </div>
        <div class="gm-sec-title">OG BASE MEME GEAR &amp; USER SKILLS (EQUIP LIVE ON DEFAULT BUILDER)</div>
        <div class="og-grid">${OG_MEME_ITEMS.map((item) => {
          const eq = item.id === memeDef.id;
          return `<div class="og-card${eq ? ' on' : ''}">
            <div class="og-card-top">
              <div>
                <b>${esc(item.name)}</b>
                <small style="color:${esc(item.color)}">${esc(item.token)} · ${esc(item.skill)}</small>
              </div>
              <span class="og-badge">${esc(item.badge)}</span>
            </div>
            <p>${esc(item.desc)}</p>
            <button type="button" class="gm-poi-open" data-equip-meme="${esc(item.id)}" ${eq ? 'disabled' : ''}>${eq ? 'Equipped' : 'Equip Gear & Skill'}</button>
          </div>`;
        }).join('')}</div>
        <p class="gm-meme-note">Equipping an OG Meme item updates your 3D Default Builder immediately in BaseCity and activates its skill in River Quarry, Chip Fab, Solar Grid, and movement.</p>`;
      const img = body.querySelector('#og-pfp-img');
      if (img) img.src = renderPfp({ id: 'default-builder', kind: 'default', name: avatarCfg.name || 'Default Builder', skin: avatarCfg.skin, shirt: avatarCfg.shirt, role: { id: 'default', hat: avatarCfg.hatColor }, custom: { ...avatarCfg, memeItem: memeDef.id } }, { size: 160, mark: false, full: true, fixed: true });
      body.querySelector('#og-trigger-btn')?.addEventListener('click', () => {
        if (triggerMemeSkill()) renderUserModal();
      });
      body.querySelector('#og-open-locker')?.addEventListener('click', () => {
        const prev = userBack; userWrap.hidden = true; onOpenLocker?.(() => openUser('og_skills', prev));
      });
      body.querySelectorAll('[data-equip-meme]').forEach((btn) => {
        btn.onclick = () => {
          onEquipMemeItem?.(btn.dataset.equipMeme);
          rechargeEnergy();
          saveState();
          renderUserModal();
        };
      });
      return;
    }

    if (userTab === 'stocks_perks') {
      const basePts = state.xp + (state.passport.length * 40) + (plotBuffs.plotScore * 6) + (walletStocks.length * 100);
      const citizenScore = Math.round(basePts * stockMult);
      const isVerified = tier.id === 'citizen';
      const tiers = [
        ['visitor', '1. Visitor', 'Default · Local'],
        ['builder', '2. Builder', 'Wallet · Cloud'],
        ['newcomer', '3. Newcomer', '$BLOCKY · 0s Wait'],
        ['citizen', '4. Citizen NFT', 'ERC-721 · Flywheel'],
      ];
      body.innerHTML = `
        <div class="gm-tier-strip">${tiers.map(([id, tLbl, tSub]) => `<div class="gm-tier-step${tier.id === id ? ' on' : ''}"><b>${tLbl}</b><span>${tSub}</span></div>`).join('')}</div>
        <div class="gmsx-hero">
          <div class="gmsx-hero-top">
            ${itemSprite('stock-cert', 40)}
            <div>
              <b>CITIZEN PERKS &amp; BLOCKY 10 STOCK BUFFS</b>
              <span>Holding Coinbase Tokenized Stocks on Base boosts your mining, crafting, speed &amp; energy in real time — and leveling up unlocks permanent city perks.</span>
            </div>
            <span class="gmsx-badge${isVerified ? ' ok' : ''}">${isVerified ? 'VERIFIED NFT' : esc(tier.label)}</span>
          </div>
          <div class="gmu-kpis" style="margin:10px 0 8px">
            <div class="gmu-kpi"><span>Citizen Score</span><b>${citizenScore.toLocaleString('en-US')}</b></div>
            <div class="gmu-kpi"><span>Rank Mult</span><b>x${stockMult.toFixed(2)}</b></div>
            <div class="gmu-kpi"><span>Stocks Held</span><b style="color:#2ee87a">${walletStocks.length} tickers</b></div>
            <div class="gmu-kpi"><span>Craft Cost</span><b>${lv.level >= 10 ? '-15% Lv.10' : 'Standard'}</b></div>
          </div>
          <p class="gmu-muted" style="margin-bottom:8px">${isVerified
            ? 'Your ERC-721 Blocky NFT is verified. You earn 45% Flywheel holder rewards and full Citizen Level perks.'
            : 'Hold any AI Stock (NVDA, AMD, SNDK) for +25% yield, Mobility (TSLA, SPCX) for +22% speed, or Mega-Cap (AAPL, MSFT...) for +20 Max Energy. Claim your ERC-721 NFT on <a href="/claim.html" style="color:#7db1ff">/claim</a> for Verified Citizen status.'}</p>
          <div class="gmu-acts" style="margin-top:0">
            <button type="button" class="btn primary" id="gmsx-trade">Trade Blocky 10 Stocks</button>
            <button type="button" class="btn" id="gmsx-buy">Buy $${CONFIG.usdPerBlocky || 10} $BLOCKY</button>
            <a class="btn" href="/claim.html">Claim NFT (/claim)</a>
          </div>
        </div>
        <div class="gm-sec-title">CITIZEN LEVEL PERKS ROADMAP (LV.3 -> LV.35)</div>
        <div class="gmsx-perks">${CITIZEN_PERKS.map((pk) => {
          const unlocked = lv.level >= pk.lv;
          return `<div class="gmsx-perk${unlocked ? ' ok' : ''}">
            ${itemSprite(pk.sprite, 34)}
            <div class="gmsx-perk-info">
              <b>LV.${pk.lv} · ${esc(pk.title)} <small>${esc(pk.mult)} Score</small></b>
              <span>${esc(pk.perk)}</span>
            </div>
            <span class="tm-cat" style="${unlocked ? 'background:rgba(46,232,122,0.16);border-color:rgba(46,232,122,0.4);color:#2ee87a' : ''}">${unlocked ? 'ACTIVE' : `LV.${pk.lv}`}</span>
          </div>`;
        }).join('')}</div>`;
      body.querySelector('#gmsx-trade').onclick = () => { userWrap.hidden = true; onOpenAction?.('trade'); };
      body.querySelector('#gmsx-buy').onclick = () => { userWrap.hidden = true; onOpenAction?.('blocky'); };
      return;
    }

    if (userTab === 'inventory') {
      const refineSi = lv.level >= 10 ? 8 : 10;
      const aybFree = currentMemeId() === 'ayb' && state.aybChargeReady;
      const refineEn = aybFree ? 0 : 10;
      const canRefine = state.silicon >= refineSi && state.energy >= refineEn;
      const ocMult = state.overclockReady ? 2 : 1;
      const toshiMult = currentMemeId() === 'toshi' ? 1.2 : 1;
      const aybMult = aybFree ? 2 : 1;
      const totalYieldMult = buffs.chipMult * (1 + plotBuffs.yieldBonus) * ocMult * toshiMult * aybMult;
      const chipOut = Math.max(1, Math.round(4 * totalYieldMult));
      const pickId = `pickaxe-${Math.min(3, Math.max(1, state.tools.pickaxeLv || 1))}`;
      const consumablesList = SHOP_CATALOG.filter((x) => x.consumable);
      const canPrestige = state.chips >= 25;
      body.innerHTML = `
        <div class="gmu-kpis">
          <div class="gmu-kpi mc-kpi">${itemSprite('silicon', 34)}<div><span>Silicon</span><b>${state.silicon}</b></div></div>
          <div class="gmu-kpi mc-kpi">${itemSprite('chips', 34)}<div><span>AI Chips</span><b>${state.chips}</b></div></div>
          <div class="gmu-kpi mc-kpi">${itemSprite('energy', 34)}<div><span>Energy</span><b>${state.energy}/${state.maxEnergy}</b></div></div>
          <div class="gmu-kpi mc-kpi">${itemSprite(pickId, 34)}<div><span>Pickaxe</span><b>Lv.${state.tools.pickaxeLv}</b></div></div>
        </div>
        <div class="gmu-box">
          <div class="gmu-box-h"><b>CHIP FAB REFINERY</b><span>Yield x${totalYieldMult.toFixed(2)}${lv.level >= 10 ? ' · LV.10 -15% COST' : ''}${state.overclockReady ? ' · OVERCLOCK 2X' : ''}${aybFree ? ' · AYB 2X (0 EN)' : ''}</span></div>
          <div class="mc-recipe">
            <div class="mc-ing">${itemSprite('silicon', 36)}<span>${refineSi} Silicon</span></div>
            <b class="mc-op">+</b>
            <div class="mc-ing">${itemSprite('energy', 36)}<span>${refineEn} Energy</span></div>
            <b class="mc-op">-></b>
            <div class="mc-ing out">${itemSprite('chips', 36)}<span>+${chipOut} AI Chips</span></div>
          </div>
          <div class="gmu-acts">
            <button type="button" class="btn primary" id="gmu-refine" ${canRefine ? '' : 'disabled'}>Craft +${chipOut} AI Chips</button>
            <button type="button" class="btn" id="gmu-prestige" ${canPrestige ? '' : 'disabled'} title="Convert 25 surplus AI Chips into +120 Citizen XP to climb Ranks">Donate 25 Chips -> +120 XP</button>
            <button type="button" class="btn" id="gmu-open-shop">Supply Shop</button>
          </div>
        </div>
        <div class="gmu-box">
          <div class="gmu-box-h"><b>CONSUMABLES BAG (HOTBAR 4 / 5 / 6)</b></div>
          <div class="mc-inv-grid">${consumablesList.map((it) => {
            const qty = Number(state.consumables?.[it.id] || 0);
            return `<div class="mc-inv-item">${itemSprite(it.id, 36)}<span>${esc(it.name)} <b>x${qty}</b></span><button type="button" class="gm-poi-open" style="width:100%;padding:4px 6px;font-size:10.5px" data-use-cons="${it.id}" ${qty > 0 ? '' : 'disabled'}>Use</button></div>`;
          }).join('')}</div>
        </div>
        <div class="gmu-box">
          <div class="gmu-box-h"><b>OWNED BLUEPRINTS (${state.blueprints.length})</b><span>${state.usdcReceipts?.length ? `${state.usdcReceipts.length} USDC verified` : ''}</span></div>
          <div class="mc-inv-grid">${state.blueprints.map((id) => {
            const it = SHOP_CATALOG.find((x) => x.id === id);
            return `<div class="mc-inv-item">${itemSprite(id, 36)}<span>${esc(it?.name || id)}</span></div>`;
          }).join('')}</div>
        </div>`;
      body.querySelector('#gmu-refine')?.addEventListener('click', () => {
        if (state.silicon < refineSi || state.energy < refineEn) return;
        state.silicon -= refineSi;
        state.energy -= refineEn;
        state.chips += chipOut;
        if (state.overclockReady) state.overclockReady = false;
        if (aybFree) state.aybChargeReady = false;
        const xpGain = addXp(14);
        bumpDaily('craft', 1);
        saveState();
        toast?.('CHIPS REFINED', `+${chipOut} AI Chips`, `+${xpGain} XP${ocMult > 1 ? ' · Overclock 2x!' : ''}`);
        renderUserModal();
      });
      body.querySelector('#gmu-prestige')?.addEventListener('click', () => {
        if (state.chips < 25) return;
        state.chips -= 25;
        const xpGain = addXp(120);
        saveState(true);
        toast?.('CITY CONTRIBUTION', `+${xpGain} Citizen XP`, 'Surplus AI Chips donated to BaseCity');
        renderUserModal();
      });
      body.querySelectorAll('[data-use-cons]').forEach((btn) => {
        btn.onclick = () => {
          const ok = useConsumable(btn.dataset.useCons);
          if (ok && btn.dataset.useCons === 'warp-beacon') { userWrap.hidden = true; return; }
          renderUserModal();
        };
      });
      body.querySelector('#gmu-open-shop').onclick = () => { const prev = userBack; userWrap.hidden = true; openShop('buildings', () => openUser('inventory', prev)); };
      return;
    }

    if (userTab === 'passport') {
      const total = PROJECTS.length;
      const got = state.passport.length;
      const pct = Math.round((got / Math.max(1, total)) * 100);
      body.innerHTML = `
        <div class="gm-rank-bar" style="margin-top:0">
          <div class="gm-rank-top"><span>BASE ECOSYSTEM PASSPORT</span><span>${got} / ${total} Stamps (${pct}%)</span></div>
          <div class="gm-rank-track"><div class="gm-rank-fill" style="width:${pct}%"></div></div>
        </div>
        <p class="gmu-muted">Walk up to Base Avenue HQs and press <b>E</b> to learn what each project builds on Base, stamp your Passport, and earn Silicon, Chips &amp; XP.</p>
        <div class="gmu-pass-grid">${PROJECTS.map((p) => {
          const ok = state.passport.includes(p.id);
          const plotIdx = (p.plot || 1) - 1;
          const allPlots = [...(CONFIG.avenue?.plots || []), ...(CONFIG.avenue?.woods || [])];
          const lot = allPlots[plotIdx] || [0, 2];
          return `<div class="gmu-pass-card${ok ? ' ok' : ''}">
            <div class="gmu-pass-top">${itemSprite(ok ? 'stamp-lit' : 'stamp-dim', 24)}<b>${esc(p.name)}</b><span>${ok ? 'STAMPED' : 'NEW'}</span></div>
            <small>${esc(p.tagline || '')}</small>
            <button type="button" class="gm-poi-go" data-pass-go="${lot[0]},${lot[1]}" data-pass-name="${esc(p.name)} HQ">Go to HQ</button>
          </div>`;
        }).join('')}</div>`;
      body.querySelectorAll('[data-pass-go]').forEach((btn) => {
        btn.onclick = () => {
          const [lx, lz] = btn.dataset.passGo.split(',').map(Number);
          userWrap.hidden = true;
          onTravelTo?.(lx * PITCH, lz * PITCH + 4, btn.dataset.passName || 'Base Avenue HQ');
        };
      });
      return;
    }

    // Tab 4: Daily Missions (3 rotating) + 5 Eco Story Chapters
    const dailies = dailyMissionsForDate(state.daily.date);
    body.innerHTML = `
      <div class="gm-sec-title" style="margin-top:0">DAILY MISSIONS (${esc(state.daily.date)} · UTC)</div>
      <div class="gm-tasks-list" style="margin-bottom:12px">${dailies.map((m) => {
        const cur = Number(state.daily.progress[m.id] || 0);
        const claimed = state.daily.claimed.includes(m.id);
        const ready = !claimed && cur >= m.target;
        return `<div class="gm-task-row${claimed ? ' done' : ''}">
          <div class="mc-row-lead">
            ${itemSprite(claimed ? 'quest-medal' : 'reward-chest', 34)}
            <div class="gm-task-info">
              <b>${esc(m.title)} <small>${claimed ? 'CLAIMED' : `${cur}/${m.target} · +${m.rewardSi} Si · +${m.rewardChips} Chips · +${m.rewardXp} XP`}</small></b>
              <span>${esc(m.desc)}</span>
            </div>
          </div>
          ${ready
            ? `<button type="button" class="btn primary small-pill" data-dclaim="${m.id}">Claim</button>`
            : `<span class="tm-cat">${claimed ? 'DONE' : `${cur}/${m.target}`}</span>`}
        </div>`;
      }).join('')}</div>
      <div class="gm-sec-title">BASE ECO STORY CHAPTERS (5)</div>
      <div class="gm-tasks-list">${ECO_CHAPTERS.map((c) => {
        const done = state.questsDone.includes(c.id);
        return `<div class="gm-task-row${done ? ' done' : ''}">
          <div class="mc-row-lead">
            ${itemSprite(done ? 'quest-medal' : 'reward-chest', 36)}
            <div class="gm-task-info">
              <b>CH.${c.num} · ${esc(c.title)} <small>${done ? 'COMPLETED' : `+${c.rewardSilicon} Si · +${c.rewardChips} Chips · +${c.rewardXp} XP`}</small></b>
              <span>${esc(c.desc)}</span>
            </div>
          </div>
          <button type="button" class="btn small-pill" data-qgo="${c.goto}">${done ? 'Revisit' : 'Go'}</button>
        </div>`;
      }).join('')}</div>`;
    body.querySelectorAll('[data-dclaim]').forEach((btn) => {
      btn.onclick = () => claimDailyMission(btn.dataset.dclaim);
    });
    body.querySelectorAll('[data-qgo]').forEach((btn) => {
      btn.onclick = () => {
        const g = btn.dataset.qgo;
        userWrap.hidden = true;
        if (g === 'myplot') { const prev = userBack; openPlotStudio(() => openUser('quests', prev)); return; }
        if (g === 'stocks') { onTravelTo?.(-36, 0, 'Blocky Street Stocks'); return; }
        if (g === 'usdc') { onTravelTo?.(-16, 28, 'Circle USDC Bank'); return; }
        if (g === 'agents') { onTravelTo?.(-8, 12, 'x402 Agent HQ'); return; }
        onTravelTo?.(-8, 16, 'Basenames City Hall');
      };
    });
  }

  userWrap.querySelector('#gmu-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-utab]')?.dataset.utab;
    if (!t) return;
    userTab = t;
    renderUserModal();
  });
  userWrap.querySelector('#gmu-back').onclick = () => { const cb = userBack; userBack = null; userWrap.hidden = true; cb?.(); };
  userWrap.querySelector('#gmu-close').onclick = () => { userBack = null; userWrap.hidden = true; };
  userWrap.addEventListener('click', (e) => { if (e.target === userWrap) { userBack = null; userWrap.hidden = true; } });

  async function openUser(tab = 'overview', onBack = null) {
    userTab = tab;
    userBack = typeof onBack === 'function' ? onBack : null;
    userWrap.querySelector('#gmu-back').hidden = !userBack;
    completeChapter('ch1_identity');
    userWrap.hidden = false;
    renderUserModal();
    await refreshPortfolio();
    if (!userWrap.hidden) renderUserModal();
  }

  // ---------- MODAL 2: BASECITY SUPPLY SHOP (B) ----------
  let shopCat = 'buildings';
  let shopBack = null;
  const shopWrap = document.createElement('div');
  shopWrap.className = 'gm-modal-wrap';
  shopWrap.hidden = true;
  shopWrap.innerHTML = `
    <div class="td gm-user-modal" role="dialog" aria-modal="true" aria-label="BaseCity Supply Shop">
      <div class="td-head">
        ${itemSprite('poi-shop', 38)}
        <div class="td-title"><b>BASECITY SUPPLY SHOP</b><span>Unlock mining tools, Consumables, Plot Blueprints &amp; Voxel Decor · Onchain sales feed BaseCityFlywheel</span></div>
        <div class="td-head-acts">
          <button type="button" class="td-back" id="gms-back" hidden>Back</button>
          <button type="button" class="td-x" id="gms-close">Step Outside</button>
        </div>
      </div>
      <div class="gm-map-filters" id="gms-cats">
        <button type="button" class="b10-sec-pill on" data-scat="buildings">${itemIcon('stock-tower', 15)} Plot Buildings</button>
        <button type="button" class="b10-sec-pill" data-scat="tools">${itemIcon('pickaxe-2', 15)} Mining Tools</button>
        <button type="button" class="b10-sec-pill" data-scat="consumables">${itemIcon('gm-espresso', 15)} Consumables</button>
        <button type="button" class="b10-sec-pill" data-scat="decor">${itemIcon('voxel-tree', 15)} Voxel Decor</button>
      </div>
      <div id="gms-bal" class="gmu-muted" style="margin-top:8px"></div>
      <div id="gms-list" class="gms-grid" style="margin-top:10px"></div>
      <div id="gms-msg" class="lp-msg" hidden></div>
    </div>`;
  document.body.appendChild(shopWrap);

  function ownsShopItem(it) {
    if (it.consumable) return false;
    if (it.toolKey) return (state.tools[it.toolKey] || 1) >= it.toolVal;
    return state.blueprints.includes(it.id);
  }

  function grantShopItem(it, txHash = '') {
    if (it.consumable) {
      if (!state.consumables) state.consumables = {};
      state.consumables[it.id] = Number(state.consumables[it.id] || 0) + 1;
    } else if (it.toolKey) {
      state.tools[it.toolKey] = Math.max(state.tools[it.toolKey] || 1, it.toolVal);
    } else if (!state.blueprints.includes(it.id)) {
      state.blueprints.push(it.id);
    }
    if (txHash) {
      if (!Array.isArray(state.usdcReceipts)) state.usdcReceipts = [];
      state.usdcReceipts.push({ itemId: it.id, txHash, usdcPrice: it.usdcPrice, at: Date.now() });
    }
  }

  function renderShop() {
    shopWrap.querySelectorAll('[data-scat]').forEach((b) => b.classList.toggle('on', b.dataset.scat === shopCat));
    shopWrap.querySelector('#gms-bal').innerHTML = `
      <div class="mc-bal-bar">
        <span class="mc-bal-chip">${itemSprite('silicon', 22)}<b>${state.silicon}</b> Silicon</span>
        <span class="mc-bal-chip">${itemSprite('chips', 22)}<b>${state.chips}</b> AI Chips</span>
        <span class="mc-bal-chip">${itemSprite('energy', 22)}<b>${state.energy}/${state.maxEnergy}</b> Energy</span>
        <span class="mc-bal-chip usdc">${itemSprite('coin-usdc', 22)}<b>$${balances.usdc.toFixed(2)}</b> Base USDC</span>
      </div>`;
    const list = SHOP_CATALOG.filter((x) => x.cat === shopCat);
    const host = shopWrap.querySelector('#gms-list');
    host.innerHTML = list.map((it) => {
      const owned = ownsShopItem(it);
      const qty = it.consumable ? Number(state.consumables?.[it.id] || 0) : 0;
      const canCraft = !owned && state.silicon >= it.costSilicon && state.chips >= it.costChips;
      return `<div class="gms-card${owned ? ' owned' : ''}">
        <div class="gms-top-row">
          ${itemSprite(it.id, 44)}
          <div class="gms-meta">
            <div class="gms-head"><b>${esc(it.name)}</b><span>${owned ? 'OWNED' : it.consumable ? `In Bag: x${qty} · ${it.costSilicon} Si · ${it.costChips} Chips` : `${it.costSilicon} Si · ${it.costChips} Chips`}</span></div>
            <p>${esc(it.desc)}</p>
          </div>
        </div>
        <div class="gm-poi-acts">
          <button type="button" class="gm-poi-open" data-buy-craft="${it.id}" ${owned || !canCraft ? 'disabled' : ''}>${owned ? 'Unlocked' : it.consumable ? 'Craft +1' : 'Unlock Blueprint'}</button>
          ${!owned && it.usdcPrice > 0 ? `<button type="button" class="gm-poi-go" data-buy-usdc="${it.id}">Buy $${it.usdcPrice} USDC</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  shopWrap.querySelector('#gms-cats').addEventListener('click', (e) => {
    const c = e.target.closest('[data-scat]')?.dataset.scat;
    if (!c) return;
    shopCat = c;
    renderShop();
  });
  shopWrap.querySelector('#gms-list').addEventListener('click', async (e) => {
    const msgEl = shopWrap.querySelector('#gms-msg');
    const craftId = e.target.closest('[data-buy-craft]')?.dataset.buyCraft;
    if (craftId) {
      const it = SHOP_CATALOG.find((x) => x.id === craftId);
      if (!it || ownsShopItem(it)) return;
      if (state.silicon < it.costSilicon || state.chips < it.costChips) return;
      state.silicon -= it.costSilicon;
      state.chips -= it.costChips;
      grantShopItem(it);
      addXp(it.consumable ? 8 : 25);
      rechargeEnergy();
      saveState(true);
      msgEl.hidden = false; msgEl.className = 'lp-msg ok'; msgEl.textContent = it.consumable ? `Crafted +1 ${it.name} (ready on Hotbar)!` : `Unlocked ${it.name}!`;
      toast?.(it.consumable ? 'CONSUMABLE CRAFTED' : 'SHOP UNLOCKED', it.name, it.consumable ? 'Added to Hotbar' : it.toolKey ? 'Equipped immediately' : 'Ready to build in Plot Studio');
      renderShop();
      return;
    }
    const usdcId = e.target.closest('[data-buy-usdc]')?.dataset.buyUsdc;
    if (usdcId) {
      const it = SHOP_CATALOG.find((x) => x.id === usdcId);
      const { account, provider } = getWallet();
      if (!it || !account || !provider) {
        msgEl.hidden = false; msgEl.className = 'lp-msg err'; msgEl.textContent = 'Connect a Base wallet (C) to purchase onchain with USDC.';
        return;
      }
      try {
        msgEl.hidden = false; msgEl.className = 'lp-msg'; msgEl.textContent = `Sending $${it.usdcPrice} USDC to BaseCityFlywheel Vault...`;
        await toBase(provider);
        const data = encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [FLYWHEEL_VAULT, parseUnits(String(it.usdcPrice), 6)] });
        const txHash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: account, to: BASE_USDC, data }] });
        grantShopItem(it, String(txHash || ''));
        addXp(40);
        saveState(true);
        msgEl.className = 'lp-msg ok'; msgEl.textContent = `Purchased ${it.name} on Base! Receipt saved to cloud.`;
        renderShop();
      } catch (err) {
        msgEl.className = 'lp-msg err'; msgEl.textContent = err?.shortMessage || err?.message || 'Transaction cancelled.';
      }
    }
  });
  shopWrap.querySelector('#gms-back').onclick = () => { const cb = shopBack; shopBack = null; shopWrap.hidden = true; cb?.(); };
  shopWrap.querySelector('#gms-close').onclick = () => { shopBack = null; shopWrap.hidden = true; };
  shopWrap.addEventListener('click', (e) => { if (e.target === shopWrap) { shopBack = null; shopWrap.hidden = true; } });

  function openShop(cat = 'buildings', onBack = null) {
    shopCat = cat;
    shopBack = typeof onBack === 'function' ? onBack : null;
    shopWrap.querySelector('#gms-back').hidden = !shopBack;
    shopWrap.querySelector('#gms-msg').hidden = true;
    shopWrap.hidden = false;
    showInsideEffect('BASECITY SUPPLY SHOP', '#fb923c');
    renderShop();
  }

  // ---------- MODAL 3: DEDICATED PERSONAL PLOT STUDIO (WITH CAPS, BUILD COSTS & LV.1-LV.3 UPGRADES) ----------
  let selectedSlot = 4;
  let plotBuildCat = 'buildings';
  let plotBack = null;
  const plotWrap = document.createElement('div');
  plotWrap.className = 'gm-modal-wrap';
  plotWrap.hidden = true;
  plotWrap.innerHTML = `
    <div class="td gm-map-modal wide" role="dialog" aria-modal="true" aria-label="Personal Land Plot Studio">
      <div class="td-head">
        ${itemSprite('poi-plot', 38)}
        <div class="td-title"><b>PERSONAL LAND PLOT · BUILD STUDIO</b><span>Place buffed 3D structures, upgrade Lv.1-Lv.3 &amp; harvest AI Chips</span></div>
        <div class="td-head-acts">
          <button type="button" class="td-back" id="gmp-back" hidden>Back</button>
          <button type="button" class="td-x" id="gmp-close">Exit Plot</button>
        </div>
      </div>
      <div id="gmp-body" style="margin-top:12px"></div>
    </div>`;
  document.body.appendChild(plotWrap);

  function countOnPlot(itemId) {
    return Object.values(state.plot.placements || {}).filter((v) => normPlacement(v)?.id === itemId).length;
  }

  function pendingRigChips() {
    if (plotBuffs.rigChipsHr <= 0) return 0;
    const hrs = Math.max(0, (Date.now() - (state.plot.lastHarvestAt || Date.now())) / 3600000);
    const totalMult = buffs.chipMult * (1 + plotBuffs.yieldBonus);
    return Math.min(120, Math.floor(hrs * plotBuffs.rigChipsHr * totalMult));
  }

  function renderPlotStudio() {
    plotBuffs = computePlotBuffs(state.plot.placements);
    const body = plotWrap.querySelector('#gmp-body');
    if (!state.plot.claimed) {
      body.innerHTML = `
        <div class="gm-gate">
          <h3>EMPTY LAND PLOT AVAILABLE · GRID (3, 1)</h3>
          <p>Claim your personal BaseCity parcel to enter Build Studio and construct <b>Mini Chip Rigs</b>, a <b>Personal Stock Tower</b>, an <b>x402 Research Booth</b>, and upgrade them up to <b>Lv.3</b>.</p>
          <div class="gm-gate-acts">
            <button type="button" class="btn primary" id="gmp-claim-btn">Claim Empty Land Plot (Free)</button>
            <button type="button" class="btn" id="gmp-open-shop">Browse Supply Shop</button>
          </div>
        </div>`;
      body.querySelector('#gmp-claim-btn').onclick = () => {
        state.plot.claimed = true;
        state.plot.lastHarvestAt = Date.now();
        addXp(30);
        saveState(true);
        rebuildPlot3D();
        toast?.('LAND CLAIMED', 'Personal Plot (3, 1)', 'Select a tile to place your first building');
        renderPlotStudio();
      };
      body.querySelector('#gmp-open-shop').onclick = () => { const prev = plotBack; plotWrap.hidden = true; openShop('buildings', () => openPlotStudio(prev)); };
      return;
    }

    const ready = pendingRigChips();
    const ownedItems = SHOP_CATALOG.filter((x) => x.cat === plotBuildCat && state.blueprints.includes(x.id));
    const citizenLv = levelFromXp(state.xp).level;
    const curPlacement = normPlacement(state.plot.placements[selectedSlot]);
    const currentItem = curPlacement ? SHOP_CATALOG.find((x) => x.id === curPlacement.id) : null;
    const nextLv = curPlacement && curPlacement.lv < 3 ? curPlacement.lv + 1 : null;
    const upgCost = currentItem && nextLv ? upgradeCost(currentItem, nextLv, citizenLv) : null;
    const canUpgrade = Boolean(upgCost && state.silicon >= upgCost.si && state.chips >= upgCost.chips);

    body.innerHTML = `
      <div class="mc-bal-bar" style="margin-bottom:10px">
        <span class="mc-bal-chip">${itemSprite('silicon', 20)}<b>${state.silicon}</b> Si</span>
        <span class="mc-bal-chip">${itemSprite('chips', 20)}<b>${state.chips}</b> Chips</span>
        <span class="mc-bal-chip">${itemSprite('poi-plot', 20)}<b>Plot Score ${plotBuffs.plotScore}</b></span>
        ${plotBuffs.labels.slice(0, 3).map((l) => `<span class="gmu-buff-pill">${esc(l)}</span>`).join('')}
      </div>
      <div class="gmp-grid-layout">
        <div class="gmp-left">
          <div class="gmu-box-h"><b>3x3 LAND PARCEL (CLICK A TILE)</b><span>${Object.keys(state.plot.placements).length}/9 built</span></div>
          <div class="gmp-tiles">${PLOT_SLOTS.map((_, idx) => {
            const pl = normPlacement(state.plot.placements[idx]);
            const item = pl ? SHOP_CATALOG.find((x) => x.id === pl.id) : null;
            return `<button type="button" class="gmp-tile${idx === selectedSlot ? ' on' : ''}${item ? ' filled' : ''}" data-pslot="${idx}">
              <small>#${idx + 1}${pl ? ` · Lv.${pl.lv}` : ''}</small>
              ${item ? itemSprite(item.id, 34) : '<span class="mc-empty-dot"></span>'}
              <b>${esc(item ? item.name.split(' ')[0] : 'Empty')}</b>
            </button>`;
          }).join('')}</div>
          <div class="gmp-harvest-bar">
            <span>Rig Output: <b>+${ready} Chips</b> (${plotBuffs.rigChipsHr}/hr)</span>
            <button type="button" class="gm-poi-open" id="gmp-harvest" ${ready > 0 ? '' : 'disabled'}>Harvest</button>
          </div>
          <div class="gmp-name-row">
            <input id="gmp-name-in" type="text" maxlength="24" value="${esc(state.plot.name || 'My BaseCity HQ')}" placeholder="Plot Billboard Name..." />
            <button type="button" class="gm-poi-go" id="gmp-name-save">Save Name</button>
          </div>
        </div>
        <div class="gmp-right">
          ${currentItem ? `<div class="gmu-box" style="margin-bottom:8px">
            <div class="gms-top-row">
              ${itemSprite(currentItem.id, 40)}
              <div class="gms-meta">
                <div class="gms-head"><b>Tile #${selectedSlot + 1}: ${esc(currentItem.name)}</b><span>Lv.${curPlacement.lv} / 3</span></div>
                <p style="margin:0;font-size:11.5px;color:#2ee87a">${esc(currentItem.effect || currentItem.desc)}</p>
              </div>
            </div>
            <div class="gm-poi-acts" style="margin-top:8px">
              ${nextLv ? `<button type="button" class="gm-poi-open" id="gmp-upgrade" ${canUpgrade ? '' : 'disabled'}>Upgrade Lv.${nextLv} (${upgCost.si} Si · ${upgCost.chips} Chips)</button>` : '<button type="button" class="gm-poi-open" disabled>MAX LEVEL (Lv.3)</button>'}
              <button type="button" class="gm-poi-go" id="gmp-clear-tile">Demolish</button>
            </div>
          </div>` : `<div class="gmu-muted" style="margin-bottom:8px">Tile #${selectedSlot + 1}: <b>Empty land</b> — select a blueprint below to construct.</div>`}
          <div class="gm-map-filters" style="margin-top:0">
            <button type="button" class="b10-sec-pill${plotBuildCat === 'buildings' ? ' on' : ''}" data-pcat="buildings">Buildings</button>
            <button type="button" class="b10-sec-pill${plotBuildCat === 'decor' ? ' on' : ''}" data-pcat="decor">Voxel Decor</button>
            <button type="button" class="b10-sec-pill" id="gmp-shop-jump">+ Supply Shop</button>
          </div>
          <div class="gm-poi-list" style="margin-top:8px">${ownedItems.length ? ownedItems.map((it) => {
            const placed = countOnPlot(it.id);
            const max = it.maxPlot || 3;
            const atCap = placed >= max;
            const bSi = it.buildSi || 8;
            const bCh = it.buildChips || 2;
            const canBuild = !atCap && state.silicon >= bSi && state.chips >= bCh;
            return `<div class="gm-poi-card">
              <div class="gm-poi-top">${itemSprite(it.id, 38)}<div><b>${esc(it.name)} <small style="color:#ffc83d;margin-left:4px">${placed}/${max}</small></b><small>${esc(it.desc)}</small></div></div>
              <div class="gm-poi-acts"><button type="button" class="gm-poi-open" data-place-item="${it.id}" ${canBuild ? '' : 'disabled'}>${atCap ? `Max ${max} Built` : `Build (${bSi} Si · ${bCh} Chips)`}</button></div>
            </div>`;
          }).join('') : '<p class="gmu-muted">No unlocked blueprints in this category yet. Visit BaseCity Supply Shop to craft or buy blueprints.</p>'}</div>
        </div>
      </div>`;

    body.querySelectorAll('[data-pslot]').forEach((b) => {
      b.onclick = () => { selectedSlot = Number(b.dataset.pslot); renderPlotStudio(); };
    });
    body.querySelectorAll('[data-pcat]').forEach((b) => {
      b.onclick = () => { plotBuildCat = b.dataset.pcat; renderPlotStudio(); };
    });
    body.querySelector('#gmp-shop-jump')?.addEventListener('click', () => { const prev = plotBack; plotWrap.hidden = true; openShop(plotBuildCat, () => openPlotStudio(prev)); });
    body.querySelector('#gmp-name-save')?.addEventListener('click', () => {
      const val = String(body.querySelector('#gmp-name-in')?.value || '').trim().slice(0, 24);
      if (!val) return;
      state.plot.name = val;
      saveState();
      rebuildPlot3D();
      toast?.('PLOT RENAMED', val, 'Updated on 3D Custom Neon Billboard');
    });
    body.querySelector('#gmp-clear-tile')?.addEventListener('click', () => {
      delete state.plot.placements[selectedSlot];
      saveState();
      rebuildPlot3D();
      renderPlotStudio();
    });
    body.querySelector('#gmp-upgrade')?.addEventListener('click', () => {
      if (!curPlacement || !currentItem || !nextLv || !upgCost) return;
      if (state.silicon < upgCost.si || state.chips < upgCost.chips) return;
      state.silicon -= upgCost.si;
      state.chips -= upgCost.chips;
      state.plot.placements[selectedSlot] = { id: curPlacement.id, lv: nextLv };
      const xpGain = addXp(nextLv === 3 ? 65 : 35);
      bumpDaily('plot_act', 1);
      saveState(true);
      rebuildPlot3D();
      toast?.(`UPGRADED TO LV.${nextLv}`, currentItem.name, `+${xpGain} XP · 3D structure & buff boosted`);
      renderPlotStudio();
    });
    body.querySelectorAll('[data-place-item]').forEach((b) => {
      b.onclick = () => {
        const it = SHOP_CATALOG.find((x) => x.id === b.dataset.placeItem);
        if (!it) return;
        const max = it.maxPlot || 3;
        if (countOnPlot(it.id) >= max) return;
        const bSi = it.buildSi || 8;
        const bCh = it.buildChips || 2;
        if (state.silicon < bSi || state.chips < bCh) return;
        state.silicon -= bSi;
        state.chips -= bCh;
        state.plot.placements[selectedSlot] = { id: it.id, lv: 1 };
        const xpGain = addXp(25);
        bumpDaily('plot_act', 1);
        saveState(true);
        rebuildPlot3D();
        completeChapter('ch5_builder');
        toast?.('STRUCTURE BUILT', `${it.name} (Lv.1)`, `+${xpGain} XP · Visible live on your 3D Plot`);
        renderPlotStudio();
      };
    });
    body.querySelector('#gmp-harvest')?.addEventListener('click', () => {
      const amt = pendingRigChips();
      if (amt <= 0) return;
      state.chips += amt;
      state.plot.lastHarvestAt = Date.now();
      const xpGain = addXp(15);
      bumpDaily('plot_act', 1);
      saveState();
      toast?.('HARVESTED', `+${amt} AI Chips`, `+${xpGain} XP collected from Mini Chip Rigs`);
      renderPlotStudio();
    });
  }

  plotWrap.querySelector('#gmp-back').onclick = () => { const cb = plotBack; plotBack = null; plotWrap.hidden = true; cb?.(); };
  plotWrap.querySelector('#gmp-close').onclick = () => { plotBack = null; plotWrap.hidden = true; };
  plotWrap.addEventListener('click', (e) => { if (e.target === plotWrap) { plotBack = null; plotWrap.hidden = true; } });

  function openPlotStudio(onBack = null) {
    plotBack = typeof onBack === 'function' ? onBack : null;
    plotWrap.querySelector('#gmp-back').hidden = !plotBack;
    plotWrap.hidden = false;
    showInsideEffect('PERSONAL LAND PLOT · BUILD STUDIO', '#ffc83d');
    renderPlotStudio();
  }

  // ---------- MODAL 4: BASE DAILY NEWSSTAND (N) ----------
  let newsTab = 'pulse';
  const newsWrap = document.createElement('div');
  newsWrap.className = 'gm-modal-wrap';
  newsWrap.hidden = true;
  newsWrap.innerHTML = `
    <div class="td gm-user-modal" role="dialog" aria-modal="true" aria-label="Base Daily Newsstand">
      <div class="td-head">
        ${itemSprite('newspaper', 38)}
        <div class="td-title"><b>BASE DAILY · ECOSYSTEM NEWSSTAND</b><span>Live Base Onchain Pulse, Stock Movers &amp; Ecosystem Briefs</span></div>
        <button type="button" class="td-x" id="gmn-close">Close</button>
      </div>
      <div class="lp-seg" style="margin-top:12px" id="gmn-tabs">
        <button type="button" class="lp-seg-btn on" data-ntab="pulse">${itemIcon('news-stocks', 15)} Onchain Pulse</button>
        <button type="button" class="lp-seg-btn" data-ntab="briefs">${itemIcon('news-defi', 15)} Base Eco Briefs</button>
      </div>
      <div id="gmn-body" style="margin-top:12px"></div>
    </div>`;
  document.body.appendChild(newsWrap);

  async function loadNewsPulse() {
    try {
      const [stocks, tasks, fw] = await Promise.all([
        fetch('/api/stocks').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetchCityTasks().catch(() => []),
        fetch('/api/flywheel').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const items = [];
      const topTickers = Object.entries(stocks?.week?.tickers || {})
        .sort((a, b) => Number(b[1]?.usd24 || 0) - Number(a[1]?.usd24 || 0))
        .slice(0, 3);
      for (const [tk, info] of topTickers) {
        items.push({
          tag: 'STOCKS 24/7',
          title: `${tk} moved $${Math.round(Number(info.usd24 || 0)).toLocaleString('en-US')} on Base in 24h`,
          body: `${Number(info.n24 || 0).toLocaleString('en-US')} real onchain transfers recorded on Blocky Street.`,
          action: 'trade',
          arg: tk,
          cta: `Trade ${tk}`,
        });
      }
      const openTasks = (tasks || []).filter((t) => t.status === 'open').slice(0, 2);
      for (const t of openTasks) {
        items.push({
          tag: 'OPEN TASK',
          title: t.title,
          body: `Reward: ${t.rewardAmount || t.rewardUsdc || 0} ${t.rewardToken || 'USDC'} on Base · Open for Citizens & Blocky Agents.`,
          action: 'tasks',
          arg: 'board',
          cta: 'Open Task Board',
        });
      }
      if (fw) {
        items.push({
          tag: 'FLYWHEEL LIVE',
          title: `BaseCityFlywheel synced to Base block #${Number(fw.latestBlock || 0).toLocaleString('en-US')}`,
          body: `Current Epoch: ${fw.summary?.latestEpoch || 0} · Fee Split 45% BCB Holders / 35% Buyback & Burn / 20% Treasury.`,
          action: 'blocky',
          arg: '',
          cta: 'Open Stock Exchange',
        });
      }
      liveNewsCache = items;
    } catch { liveNewsCache = []; }
  }

  function newsSpriteFor(tag) {
    const t = String(tag || '').toUpperCase();
    if (t.includes('STOCK')) return 'news-stocks';
    if (t.includes('TASK')) return 'news-task';
    if (t.includes('FLYWHEEL')) return 'news-flywheel';
    return 'news-defi';
  }

  function renderNewsModal() {
    newsWrap.querySelectorAll('[data-ntab]').forEach((b) => b.classList.toggle('on', b.dataset.ntab === newsTab));
    const body = newsWrap.querySelector('#gmn-body');
    const today = utcDay();
    const checkedIn = state.dailyReadNews === today;
    const items = newsTab === 'pulse' ? (liveNewsCache || []) : BASE_ECO_BRIEFS;
    const checkBar = `<div class="mc-bal-bar" style="margin-bottom:8px"><span class="mc-bal-chip">${itemSprite('newspaper', 22)}<b>Daily Check-In</b> ${checkedIn ? '+5 Si Claimed' : 'Active'}</span><span class="mc-bal-chip">${itemSprite('silicon', 22)}<b>${state.silicon}</b> Silicon</span></div>`;
    body.innerHTML = `${checkBar}${items.length ? `<div class="gm-poi-list">${items.map((it) => `
      <div class="gm-poi-card">
        <div class="gm-poi-top">
          ${itemSprite(newsSpriteFor(it.tag), 36)}
          <div>
            <div class="gmu-box-h" style="margin-bottom:4px"><span class="tm-cat">${esc(it.tag)}</span></div>
            <b style="font-size:13px;color:#f5f7fb">${esc(it.title)}</b>
            <p class="gmu-muted" style="margin:3px 0 0">${esc(it.body)}</p>
          </div>
        </div>
        <div class="gm-poi-acts">
          <button type="button" class="gm-poi-open" data-news-go="${esc(it.action || it.poi)}" data-news-arg="${esc(it.arg || '')}">${esc(it.cta || 'Open')}</button>
        </div>
      </div>`).join('')}</div>` : '<p class="gmu-muted">Loading live Base onchain pulse...</p>'}`;

    body.querySelectorAll('[data-news-go]').forEach((b) => {
      b.onclick = () => {
        newsWrap.hidden = true;
        const act = b.dataset.newsGo;
        const arg = b.dataset.newsArg;
        if (['trade', 'blocky', 'tasks', 'hq', 'usdc', 'morpho', 'launch', 'ranks'].includes(act)) onOpenAction?.(act, arg);
        else if (act === 'stocks') onOpenAction?.('trade');
        else if (act === 'exchange') onOpenAction?.('blocky');
        else if (act === 'agents') onOpenAction?.('hq');
      };
    });
  }

  newsWrap.querySelector('#gmn-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-ntab]')?.dataset.ntab;
    if (!t) return;
    newsTab = t;
    renderNewsModal();
  });
  newsWrap.querySelector('#gmn-close').onclick = () => { newsWrap.hidden = true; };
  newsWrap.addEventListener('click', (e) => { if (e.target === newsWrap) newsWrap.hidden = true; });

  async function openNews() {
    newsWrap.hidden = false;
    showInsideEffect('BASE DAILY · NEWSSTAND', '#60a5fa');
    const today = utcDay();
    bumpDaily('news', 1);
    if (state.dailyReadNews !== today) {
      state.dailyReadNews = today;
      state.silicon += 5;
      const xpGain = addXp(15);
      saveState();
      toast?.('BASE DAILY READ', `+5 Silicon · +${xpGain} XP`, 'Daily Base Eco News check-in');
    } else {
      saveState();
    }
    renderNewsModal();
    await loadNewsPulse();
    if (!newsWrap.hidden) renderNewsModal();
  }

  // ---------- MODAL 5: BASE AVENUE HQ PROJECT DOSSIER (24 STAMPS) ----------
  const dossierWrap = document.createElement('div');
  dossierWrap.className = 'gm-modal-wrap';
  dossierWrap.hidden = true;
  dossierWrap.innerHTML = `<div class="td gm-lobby-modal" role="dialog" aria-modal="true" aria-label="Base Avenue HQ"><div id="gmd-content"></div></div>`;
  document.body.appendChild(dossierWrap);
  dossierWrap.addEventListener('click', (e) => { if (e.target === dossierWrap) dossierWrap.hidden = true; });

  function openProjectDossier(project) {
    if (!project) return;
    const isNew = !state.passport.includes(project.id);
    bumpDaily('passport', 1);
    if (isNew) {
      state.passport.push(project.id);
      state.silicon += 10;
      state.chips += 5;
      const xpGain = addXp(35);
      saveState(true);
      toast?.('PASSPORT STAMPED', project.name, `+10 Silicon · +5 AI Chips · +${xpGain} XP`);
    } else {
      saveState();
    }
    if (project.id === 'basenames') completeChapter('ch1_identity');
    if (project.id === 'usdc' || project.id === 'morpho') completeChapter('ch2_defi');
    if (project.id === 'virtuals' || project.id === 'x402' || project.id === 'venice') completeChapter('ch4_agents');

    showInsideEffect(project.label || `${project.name} HQ`, project.color || '#0052ff');
    const c = dossierWrap.querySelector('#gmd-content');
    const hasNative = ['usdc', 'morpho', 'x402', 'uniswap', 'aero', 'gpu'].includes(project.id);
    c.innerHTML = `
      <div class="gml-banner">
        <small>BASE AVENUE HQ · ${isNew ? 'NEW STAMP UNLOCKED' : 'PASSPORT STAMPED'}</small>
        <b>${esc(project.label || `${project.name} HQ`)}</b>
        <button type="button" class="td-x" id="gmd-exit">Step Outside</button>
      </div>
      <div class="gml-npc">
        <div class="gml-npc-tag"><b>${esc(project.name)}</b><span>Base Ecosystem Project</span></div>
        <p>${esc(project.tagline || 'Building on Base Mainnet.')}</p>
      </div>
      <div class="gmu-acts">
        ${hasNative ? '<button type="button" class="btn primary" id="gmd-native">Open Onchain Terminal</button>' : ''}
        <button type="button" class="btn" id="gmd-pass">Base Passport (${state.passport.length}/${PROJECTS.length})</button>
      </div>`;
    dossierWrap.hidden = false;
    c.querySelector('#gmd-exit').onclick = () => { dossierWrap.hidden = true; };
    c.querySelector('#gmd-pass').onclick = () => { dossierWrap.hidden = true; openUser('passport', () => openProjectDossier(project)); };
    c.querySelector('#gmd-native')?.addEventListener('click', () => {
      dossierWrap.hidden = true;
      if (project.id === 'usdc' || project.id === 'morpho') onOpenAction?.(project.id);
      else if (project.id === 'x402') onOpenAction?.('hq');
      else if (project.id === 'gpu') onOpenAction?.('trade', 'NVDA');
      else onOpenAction?.('trade');
    });
  }

  function getCooldownRemaining(kind) {
    const nowMs = Date.now();
    if (kind === 'mine-silicon') {
      const cd = memeSkillActive() ? Math.max(1500, QUARRY_CD_MS - 1000) : QUARRY_CD_MS;
      return Math.max(0, cd - (nowMs - (state.lastMineAt || 0)));
    }
    if (kind === 'mine-energy') {
      const cd = currentMemeId() === 'baes' ? Math.round(SOLAR_CD_MS * 0.8) : SOLAR_CD_MS;
      return Math.max(0, cd - (nowMs - (state.lastSolarAt || 0)));
    }
    return 0;
  }

  function fmtCooldown(ms) {
    if (ms <= 0) return '';
    const secs = Math.ceil(ms / 1000);
    if (secs >= 60) return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    return `${secs}s`;
  }

  function handleNodeInteract(node) {
    rechargeEnergy();
    if (node.kind === 'mine-silicon') {
      const cd = getCooldownRemaining('mine-silicon');
      if (cd > 0) {
        toast?.('QUARRY COOLING', `Ready in ${(cd / 1000).toFixed(1)}s`, 'Mining drills recharging');
        return;
      }
      const aybFree = currentMemeId() === 'ayb' && state.aybChargeReady;
      const baesDiscount = currentMemeId() === 'baes' ? 2 : 0;
      const cost = aybFree ? 0 : Math.max(4, (state.tools.pickaxeLv >= 3 ? 8 : 10) - baesDiscount);
      if (state.energy < cost) {
        toast?.('LOW ENERGY', 'Drink gm Espresso (4) or Solar Grid', `Need ${cost} Energy (${state.energy}/${state.maxEnergy})`);
        return;
      }
      const baseYield = state.tools.pickaxeLv === 3 ? 14 : state.tools.pickaxeLv === 2 ? 9 : 5;
      const toshiMult = currentMemeId() === 'toshi' ? 1.2 : 1;
      const aybMult = aybFree ? 2 : 1;
      const mult = buffs.chipMult * (1 + plotBuffs.yieldBonus + plotBuffs.siliconBonus) * toshiMult * aybMult;
      const gain = Math.max(1, Math.round(baseYield * mult));
      state.energy -= cost;
      state.silicon += gain;
      state.lastMineAt = Date.now();
      if (aybFree) state.aybChargeReady = false;
      const xpGain = addXp(6);
      bumpDaily('mine', 1);
      saveState();
      toast?.('SILICON MINED', `+${gain} Silicon · +${xpGain} XP`, `Total: ${state.silicon} Si · Energy ${state.energy}/${state.maxEnergy}${aybFree ? ' · AYB 2x!' : ''}`);
      return;
    }
    if (node.kind === 'mine-energy') {
      const cd = getCooldownRemaining('mine-energy');
      if (cd > 0) {
        toast?.('SOLAR CHARGING', `Next free charge in ${fmtCooldown(cd)}`, 'Drink gm Espresso (Key 4) for instant +50 EN');
        return;
      }
      const gain = Math.min(state.maxEnergy - state.energy, 35);
      if (gain <= 0) {
        toast?.('ENERGY FULL', `${state.energy}/${state.maxEnergy}`, 'Ready for River Silicon Quarry');
        return;
      }
      state.energy += gain;
      state.lastEnergyAt = Date.now();
      state.lastSolarAt = Date.now();
      addXp(5);
      saveState();
      toast?.('ENERGY RECHARGED', `+${gain} Energy`, `${state.energy}/${state.maxEnergy} · Next free charge in 5m`);
      return;
    }
    if (node.kind === 'refine-chips') {
      showInsideEffect('BASECITY CHIP FAB', '#2ee87a');
      openUser('inventory');
      return;
    }
    if (node.kind === 'personal-plot') {
      openPlotStudio();
      return;
    }
    if (node.kind === 'city-shop') {
      openShop();
      return;
    }
    if (node.kind === 'newsstand') {
      openNews();
    }
  }

  function setVisible(on) {
    nodePadsGroup.visible = Boolean(on);
  }

  function updatePads(t) {
    if (!nodePadsGroup.visible) return;
    const pulse = 0.88 + Math.sin(t * 3.5) * 0.12;
    for (const p of nodePads) {
      p.ring.scale.setScalar(pulse);
      p.beam.material.opacity = 0.14 + Math.sin(t * 3.5) * 0.08;
    }
  }

  function closeAll() {
    userWrap.hidden = true;
    shopWrap.hidden = true;
    plotWrap.hidden = true;
    newsWrap.hidden = true;
    dossierWrap.hidden = true;
    roomBanner.hidden = true;
  }

  function useConsumable(id) {
    rechargeEnergy();
    const qty = Number(state.consumables?.[id] || 0);
    if (qty <= 0) {
      toast?.('OUT OF STOCK', 'Visit Supply Shop (B)', 'Craft or buy more consumables');
      return false;
    }
    if (id === 'gm-espresso') {
      state.consumables[id] = qty - 1;
      state.energy = Math.min(state.maxEnergy, state.energy + 50);
      state.espressoUntil = Date.now() + 5 * 60 * 1000;
      bumpDaily('use_item', 1);
      saveState();
      toast?.('GM ESPRESSO', '+50 Energy · +25% Speed', 'Turbo buff active for 5 minutes');
      return true;
    }
    if (id === 'overclock-core') {
      if (state.overclockReady) {
        toast?.('OVERCLOCK READY', 'Already primed (2x)', 'Visit Chip Fab or Profile Craft to refine');
        return false;
      }
      state.consumables[id] = qty - 1;
      state.overclockReady = true;
      bumpDaily('use_item', 1);
      saveState();
      toast?.('OVERCLOCK ARMED', '2x Next Chip Fab Craft', 'Refine in Profile (U) or Chip Fab');
      return true;
    }
    if (id === 'warp-beacon') {
      state.consumables[id] = qty - 1;
      bumpDaily('use_item', 1);
      saveState();
      (onTeleportTo || onTravelTo)?.(24, 12);
      toast?.('WARP BEACON', 'Teleported to Personal Plot', 'Press P to open Plot Build Studio');
      return true;
    }
    return false;
  }

  function triggerMemeSkill() {
    const def = currentMemeDef();
    if (def.type !== 'active') {
      toast?.(def.skill.toUpperCase(), `${def.name} (${def.token})`, def.type === 'passive' ? 'Passive skill is already active' : 'Equip an OG Meme gear item in OG Skills or Locker (C)');
      return false;
    }
    if (memeSkillActive()) {
      const secs = Math.ceil(((state.memeSkillUntil || 0) - Date.now()) / 1000);
      toast?.('SKILL ACTIVE', def.skill, `${secs}s remaining`);
      return false;
    }
    if (def.id === 'ayb' && state.aybChargeReady) {
      toast?.('2X CHARGE ARMED', def.skill, 'Next Quarry mine or Chip Fab craft is 0 EN & 2x');
      return false;
    }
    const cd = memeSkillCdRemaining();
    if (cd > 0) {
      toast?.('SKILL COOLING', def.skill, `Ready in ${fmtCooldown(cd)}`);
      return false;
    }
    state.memeSkillCdAt = Date.now();
    if (def.id === 'doginme') {
      state.memeSkillUntil = Date.now() + (def.durMs || 20000);
      saveState();
      toast?.('GOT THAT DOG!', '+35% Speed · -1.0s Quarry CD', 'Active for 20s');
      return true;
    }
    if (def.id === 'ayb') {
      state.aybChargeReady = true;
      saveState();
      toast?.('ALL YOUR SILICON', '0 EN & 2x Yield Armed', 'Next River Quarry mine or Chip Fab craft');
      return true;
    }
    return false;
  }

  function getHotbarState() {
    const pickLv = Math.min(3, Math.max(1, state.tools.pickaxeLv || 1));
    const espressoSecs = Math.max(0, Math.ceil(((state.espressoUntil || 0) - Date.now()) / 1000));
    const memeDef = currentMemeDef();
    return {
      pickaxeLv: pickLv,
      pickaxeId: `pickaxe-${pickLv}`,
      espresso: Number(state.consumables?.['gm-espresso'] || 0),
      overclock: Number(state.consumables?.['overclock-core'] || 0),
      warp: Number(state.consumables?.['warp-beacon'] || 0),
      espressoSecs,
      overclockReady: Boolean(state.overclockReady),
      meme: memeDef,
      memeActiveSecs: memeSkillActive() ? Math.max(0, Math.ceil(((state.memeSkillUntil || 0) - Date.now()) / 1000)) : 0,
      memeCdSecs: Math.ceil(memeSkillCdRemaining() / 1000),
      aybReady: currentMemeId() === 'ayb' && Boolean(state.aybChargeReady),
    };
  }

  function getProgressionSummary() {
    ensureDaily();
    const lv = levelFromXp(state.xp);
    const dailies = dailyMissionsForDate(state.daily.date).map((m) => {
      const cur = Number(state.daily.progress[m.id] || 0);
      const claimed = state.daily.claimed.includes(m.id);
      return { ...m, cur, claimed, ready: !claimed && cur >= m.target };
    });
    return {
      level: lv.level,
      xp: state.xp,
      xpInLevel: lv.xpInLevel,
      xpForNext: lv.xpForNext,
      pct: lv.pct,
      rankTitle: rankTitleForLevel(lv.level),
      dailies,
      plotScore: plotBuffs.plotScore,
      passportCount: state.passport.length,
      passportTotal: PROJECTS.length,
    };
  }

  function getHudSummary() {
    rechargeEnergy();
    const espressoOn = (state.espressoUntil || 0) > Date.now();
    const dogOn = memeSkillActive();
    const memeDef = currentMemeDef();
    const memeLabel = memeDef.id !== 'none' ? [`OG ${memeDef.token}: ${memeDef.skill}`] : [];
    return {
      usdc: balances.usdc,
      stocksCount: walletStocks.length,
      silicon: state.silicon,
      chips: state.chips,
      energy: state.energy,
      maxEnergy: state.maxEnergy,
      speedMult: buffs.speedMult * (espressoOn ? 1.25 : 1) * (dogOn ? 1.35 : 1),
      espressoOn,
      overclockReady: Boolean(state.overclockReady),
      buffLabels: [...memeLabel, ...buffs.labels, ...plotBuffs.labels],
      passportCount: state.passport.length,
      passportTotal: PROJECTS.length,
      quarryCd: getCooldownRemaining('mine-silicon'),
      solarCd: getCooldownRemaining('mine-energy'),
    };
  }

  loadState('');

  return {
    refreshPortfolio,
    openUser,
    openShop,
    openPlotStudio,
    openNews,
    openProjectDossier,
    handleNodeInteract,
    useConsumable,
    triggerMemeSkill,
    claimDailyMission,
    getHotbarState,
    getProgressionSummary,
    getCooldownRemaining,
    fmtCooldown,
    completeChapter,
    showInsideEffect,
    setVisible,
    updatePads,
    closeAll,
    getHudSummary,
    getPhoneWallet() { return phoneWallet?.account === getWallet().account ? phoneWallet : { stocks: [] }; },
    getPhoneMissions() {
      ensureDaily();
      return dailyMissionsForDate(state.daily.date).map((mission) => ({
        ...mission,
        progress: Number(state.daily.progress[mission.id] || 0),
        claimed: state.daily.claimed.includes(mission.id),
      }));
    },
  };
}
