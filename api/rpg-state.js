// BaseCity Game Mode RPG State Sync & Top Citizens Leaderboard API (Vercel serverless + local dev):
// - GET /api/rpg-state?address=0x...     -> Load wallet's saved RPG state & verified USDC shop receipts
// - GET /api/rpg-state?leaderboard=1     -> Top 20 Citizens ranked by XP, Level, Passport Stamps & Plot Score
// - POST /api/rpg-state                  -> Save/merge wallet RPG state (preserves all USDC receipts & unlocks)
import { getAddress, isAddress } from 'viem';
import { kv, useKv, KEY_BASE } from './_store.js';

const STATE_PREFIX = `${KEY_BASE}:rpg-state:v1:`;
const LEADERS_KEY = `${KEY_BASE}:rpg-leaders:v1`;

// In-memory fallback for local dev without KV env vars
const memStates = new Map();
let memLeaders = [];

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

const clean = (s, max = 80) => String(s || '').trim().slice(0, max);

async function loadState(addr) {
  const key = `${STATE_PREFIX}${addr}`;
  if (useKv()) {
    try {
      const raw = await kv('GET', key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  return memStates.get(addr) || null;
}

async function saveState(addr, state) {
  const key = `${STATE_PREFIX}${addr}`;
  if (useKv()) {
    await kv('SET', key, JSON.stringify(state));
  } else {
    memStates.set(addr, state);
  }
}

async function loadLeaders() {
  if (useKv()) {
    try {
      const raw = await kv('GET', LEADERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return memLeaders;
}

async function saveLeaders(list) {
  const trimmed = list
    .sort((a, b) => (Number(b.xp || 0) - Number(a.xp || 0)) || (Number(b.plotScore || 0) - Number(a.plotScore || 0)))
    .slice(0, 50);
  if (useKv()) {
    await kv('SET', LEADERS_KEY, JSON.stringify(trimmed));
  } else {
    memLeaders = trimmed;
  }
}

function mergeReceipts(prev = [], next = []) {
  const byKey = new Map();
  for (const r of [...(Array.isArray(prev) ? prev : []), ...(Array.isArray(next) ? next : [])]) {
    if (!r || !r.itemId) continue;
    const k = `${String(r.txHash || '').toLowerCase()}:${r.itemId}`;
    byKey.set(k, {
      itemId: clean(r.itemId, 40),
      txHash: clean(r.txHash, 80),
      usdcPrice: Number(r.usdcPrice || 0),
      at: Number(r.at || Date.now()),
    });
  }
  return [...byKey.values()].slice(0, 100);
}

function sanitizeState(raw, prev = null) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const receipts = mergeReceipts(prev?.usdcReceipts, s.usdcReceipts);
  const bpSet = new Set([
    ...(Array.isArray(prev?.blueprints) ? prev.blueprints : []),
    ...(Array.isArray(s.blueprints) ? s.blueprints : []),
  ].map((x) => clean(x, 40)).filter(Boolean));
  // Guarantee every non-tool, non-consumable USDC receipt stays unlocked
  for (const r of receipts) {
    if (r.itemId && !r.itemId.startsWith('pickaxe-') && !r.itemId.startsWith('battery-') && !['gm-espresso', 'overclock-core', 'warp-beacon'].includes(r.itemId)) {
      bpSet.add(r.itemId);
    }
  }
  const prevTools = prev?.tools || {};
  const nextTools = s.tools || {};
  const tools = {
    pickaxeLv: Math.min(3, Math.max(1, Number(nextTools.pickaxeLv || 1), Number(prevTools.pickaxeLv || 1))),
    batteryLv: Math.min(2, Math.max(1, Number(nextTools.batteryLv || 1), Number(prevTools.batteryLv || 1))),
  };
  for (const r of receipts) {
    if (r.itemId === 'pickaxe-3') tools.pickaxeLv = Math.max(tools.pickaxeLv, 3);
    if (r.itemId === 'pickaxe-2') tools.pickaxeLv = Math.max(tools.pickaxeLv, 2);
    if (r.itemId === 'battery-2') tools.batteryLv = Math.max(tools.batteryLv, 2);
  }

  const passport = [...new Set([
    ...(Array.isArray(prev?.passport) ? prev.passport : []),
    ...(Array.isArray(s.passport) ? s.passport : []),
  ].map((x) => clean(x, 40)).filter(Boolean))];

  const questsDone = [...new Set([
    ...(Array.isArray(prev?.questsDone) ? prev.questsDone : []),
    ...(Array.isArray(s.questsDone) ? s.questsDone : []),
  ].map((x) => clean(x, 40)).filter(Boolean))];

  const placements = {};
  const rawPl = s.plot?.placements && typeof s.plot.placements === 'object' ? s.plot.placements : {};
  for (const [slot, val] of Object.entries(rawPl)) {
    const idx = Number(slot);
    if (!Number.isInteger(idx) || idx < 0 || idx > 8) continue;
    if (typeof val === 'string') {
      placements[idx] = { id: clean(val, 40), lv: 1 };
    } else if (val && typeof val === 'object' && val.id) {
      placements[idx] = { id: clean(val.id, 40), lv: Math.min(3, Math.max(1, Number(val.lv || 1))) };
    }
  }

  const consumables = {
    'gm-espresso': Math.max(0, Math.min(99, Math.floor(Number(s.consumables?.['gm-espresso'] ?? 0)))),
    'overclock-core': Math.max(0, Math.min(99, Math.floor(Number(s.consumables?.['overclock-core'] ?? 0)))),
    'warp-beacon': Math.max(0, Math.min(99, Math.floor(Number(s.consumables?.['warp-beacon'] ?? 0)))),
  };

  return {
    silicon: Math.max(0, Math.min(999999, Math.floor(Number(s.silicon ?? 20)))),
    chips: Math.max(0, Math.min(999999, Math.floor(Number(s.chips ?? 8)))),
    energy: Math.max(0, Math.min(500, Math.floor(Number(s.energy ?? 100)))),
    maxEnergy: Math.max(100, Math.min(500, Math.floor(Number(s.maxEnergy ?? 100)))),
    lastEnergyAt: Number(s.lastEnergyAt || Date.now()),
    lastMineAt: Number(s.lastMineAt || 0),
    lastSolarAt: Number(s.lastSolarAt || 0),
    xp: Math.max(Number(prev?.xp || 0), Math.floor(Number(s.xp || 0))),
    tools,
    blueprints: [...bpSet],
    consumables,
    espressoUntil: Number(s.espressoUntil || 0),
    overclockReady: Boolean(s.overclockReady),
    plot: {
      claimed: Boolean(s.plot?.claimed || prev?.plot?.claimed),
      name: clean(s.plot?.name || prev?.plot?.name || 'My BaseCity HQ', 40),
      bio: clean(s.plot?.bio || prev?.plot?.bio || 'Building & stacking stocks on Base', 100),
      lastHarvestAt: Number(s.plot?.lastHarvestAt || Date.now()),
      placements,
    },
    passport,
    questsDone,
    dailyReadNews: clean(s.dailyReadNews || '', 20),
    daily: s.daily && typeof s.daily === 'object' ? {
      date: clean(s.daily.date, 20),
      progress: s.daily.progress && typeof s.daily.progress === 'object' ? s.daily.progress : {},
      claimed: Array.isArray(s.daily.claimed) ? s.daily.claimed.slice(0, 10).map((x) => clean(x, 30)) : [],
    } : null,
    usdcReceipts: receipts,
    updatedAt: Date.now(),
  };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (req.query?.leaderboard) {
        const leaders = await loadLeaders();
        return res.status(200).json({ leaders: leaders.slice(0, 20) });
      }
      const rawAddr = String(req.query?.address || '').trim();
      if (!isAddress(rawAddr, { strict: false })) {
        return res.status(400).json({ error: 'Valid Base wallet address required.' });
      }
      const addr = getAddress(rawAddr).toLowerCase();
      const state = await loadState(addr);
      return res.status(200).json({ address: addr, state });
    }

    if (req.method === 'POST') {
      const b = parseBody(req);
      const rawAddr = String(b.address || '').trim();
      if (!isAddress(rawAddr, { strict: false })) {
        return res.status(400).json({ error: 'Valid Base wallet address required.' });
      }
      const addr = getAddress(rawAddr).toLowerCase();
      const prev = await loadState(addr);
      const merged = sanitizeState(b.state, prev);
      await saveState(addr, merged);

      // Update Top Citizens leaderboard entry
      const plotScore = Object.values(merged.plot.placements || {}).reduce((acc, p) => acc + (Number(p?.lv || 1) * 10), 0);
      const level = Number(b.meta?.level || 1);
      const rankTitle = clean(b.meta?.rankTitle || 'NEWCOMER', 28);
      const name = clean(b.meta?.name || `${addr.slice(0, 6)}…${addr.slice(-4)}`, 40);

      const leaders = await loadLeaders();
      const idx = leaders.findIndex((x) => x.address === addr);
      const entry = {
        address: addr,
        name,
        level,
        rankTitle,
        xp: merged.xp,
        passportCount: merged.passport.length,
        plotScore,
        updatedAt: Date.now(),
      };
      if (idx >= 0) leaders[idx] = entry;
      else leaders.push(entry);
      await saveLeaders(leaders);

      return res.status(200).json({ ok: true, state: merged });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'RPG state sync error' });
  }
}
