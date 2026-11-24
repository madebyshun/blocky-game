// BaseCity Native TaskMarket API (Vercel serverless + local dev):
// Zero fake seed tasks — stores only real user & Blocky Agent posted BaseCity tasks.
// Supports paying rewards in Base USDC OR any Coinbase Tokenized Stock (ERC-20 on Base, 8 decimals).
// Modes: Bounty (open competition) & Claim (exclusive worker lock) + flexible expiryTime (15m to 30d) + Citizen / Blocky Agent (A2A) tagging.
import { getAddress, isAddress, parseUnits } from 'viem';
import { checkSigned } from './_sigauth.js';
import { taskMessage, taskWallet } from '../src/signed.js';
import { stockList } from './_stocks.js';
import { kv, useKv, KEY_BASE, client } from './_store.js';
import { read as readWorker, writeIf as writeWorkerIf, lock as lockWorker } from './_worker-store.js';
import { assertOwners, log as logWorker } from './_worker-engine.js';
import { researchExit } from './_worker-research.js';
import { researchStock } from './_worker-stock.js';
import { linksOf } from './agent-link.js';
import { recordWork } from './_workfeed.js';
import { bumpJobsPaid } from './_profile.js';

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TASKS_KEY = `${KEY_BASE}:city-tasks:v3`;
const LEGACY_KEY = `${KEY_BASE}:city-tasks:v2`;
let memTasks = [];

async function loadTasks() {
  if (useKv()) {
    for (const k of [TASKS_KEY, LEGACY_KEY]) {
      try {
        const raw = await kv('GET', k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) return parsed;
        }
      } catch { /* ignore */ }
    }
    return [];
  }
  return memTasks;
}

async function saveTasks(tasks) {
  const trimmed = tasks.slice(0, 200);
  if (useKv()) {
    await kv('SET', TASKS_KEY, JSON.stringify(trimmed));
  } else {
    memTasks = trimmed;
  }
}

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

const clean = (s, max = 500) => String(s || '').trim().slice(0, max);

function normalizeTask(t) {
  const now = Date.now();
  const createdAt = Number(t.createdAt) || now;
  const expiryTime = Number(t.expiryTime) || (createdAt + 72 * 3600e3);
  const expired = t.status === 'open' && now > expiryTime;
  const rewardToken = String(t.rewardToken || 'USDC').toUpperCase();
  const isUsdc = rewardToken === 'USDC';
  const rewardAmount = Number(t.rewardAmount ?? t.rewardUsdc ?? 0);
  return {
    ...t,
    source: 'basecity',
    mode: t.mode === 'claim' ? 'claim' : 'bounty',
    audience: ['all', 'citizen', 'agent'].includes(t.audience) ? t.audience : 'all',
    rewardToken,
    rewardTokenAddress: t.rewardTokenAddress || BASE_USDC,
    rewardDecimals: Number.isInteger(Number(t.rewardDecimals)) ? Number(t.rewardDecimals) : (isUsdc ? 6 : 8),
    rewardAmount,
    rewardUsdc: Number(t.rewardUsdc ?? (isUsdc ? rewardAmount : 0)),
    expiryTime,
    status: expired ? 'expired' : (t.status || 'open'),
    claimedBy: t.claimedBy || null,
    claimedName: t.claimedName || null,
    claimedAt: t.claimedAt || null,
    claimActorType: t.claimActorType || null,
    submissions: Array.isArray(t.submissions) ? t.submissions : [],
  };
}

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topicAddr = (t) => `0x${String(t || '').slice(26)}`.toLowerCase();

// The payment that settles a task: a successful Base transaction holding an ERC-20 Transfer of the task's
// reward token, from the requester to the winning worker, of at least the reward. Returns the amount sent.
// (The requester paying on chain IS the approval: nobody else can produce this transaction.)
export const deps = { getReceipt: (hash) => client.getTransactionReceipt({ hash }), retryMs: 1500 }; // tests swap these
export async function verifyPayout(task, sub, tx, allTasks, getReceipt = (hash) => deps.getReceipt(hash)) {
  if (allTasks.some((t) => t.id !== task.id && String(t.payTxHash || '').toLowerCase() === tx.toLowerCase())) throw new Error('This transaction already paid another task.');
  let r = null;
  for (let i = 0; i < 4 && !r; i++) { r = await getReceipt(tx).catch(() => null); if (!r && i < 3) await new Promise((ok) => setTimeout(ok, deps.retryMs)); }
  if (!r) throw new Error('Base has not confirmed that transaction yet: try again in a few seconds.');
  if (r.status !== 'success') throw new Error('That payment transaction failed on Base.');
  const token = String(task.rewardTokenAddress || '').toLowerCase();
  const dec = Number.isInteger(Number(task.rewardDecimals)) ? Number(task.rewardDecimals) : 6;
  let need;
  try { need = parseUnits(String(task.rewardAmount), dec); } catch { need = BigInt(Math.floor(Number(task.rewardAmount) * 10 ** dec)); }
  const hit = r.logs.find((l) => l.address.toLowerCase() === token && l.topics?.[0] === TRANSFER && l.topics.length === 3
    && topicAddr(l.topics[1]) === task.requester && topicAddr(l.topics[2]) === sub.worker && BigInt(l.data) >= need);
  if (!hit) throw new Error(`That transaction does not show ${task.rewardAmount} ${task.rewardToken} sent from the requester to the winning worker.`);
  return { units: BigInt(hit.data), decimals: dec };
}

// what a verified payout was worth in USD: USDC exactly; a tokenized stock at its Chainlink NAV; else unknown (0)
export async function payoutUsd(task, paid, stocks = null) {
  const tokens = Number(paid.units) / 10 ** paid.decimals;
  if (String(task.rewardTokenAddress).toLowerCase() === BASE_USDC.toLowerCase()) return Math.round(tokens * 1e6) / 1e6;
  try {
    const list = stocks || await stockList();
    const st = list.find((x) => x.address.toLowerCase() === String(task.rewardTokenAddress).toLowerCase());
    return st?.nav ? Math.round(tokens * (st.multiplier || 1) * st.nav * 100) / 100 : 0;
  } catch { return 0; }
}

export async function loadCityTasks() {
  const raw = await loadTasks();
  return raw.map(normalizeTask);
}

export async function submitAgentCityTask({ taskId, worker, blockyName, agentId, summary, proofUrl = '' }) {
  const rawTasks = await loadTasks();
  const tasks = rawTasks.map(normalizeTask);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error('City task not found.');
  if (task.status !== 'open') throw new Error('City task is no longer open.');
  if (task.audience === 'citizen') throw new Error('City task is restricted to Citizens.');
  if (!isAddress(worker || '', { strict: false })) throw new Error('Valid worker Base wallet address required.');
  const addr = getAddress(worker).toLowerCase();
  if (addr === task.requester) throw new Error('Worker cannot submit to own task.');
  if (task.mode === 'claim' && task.claimedBy && task.claimedBy.toLowerCase() !== addr) {
    throw new Error('City task is already claimed by another worker.');
  }
  if ((task.submissions || []).some((s) => s.worker?.toLowerCase() === addr)) {
    throw new Error('Worker already submitted to this task.');
  }
  const cleanSummary = clean(summary, 1500);
  if (!cleanSummary || cleanSummary.length < 8) throw new Error('Submission summary too short.');
  const cleanAgent = clean(agentId, 20).replace(/^#\s*/, '');
  const cleanName = clean(blockyName, 60) || 'Blocky Agent';

  if (task.mode === 'claim' && !task.claimedBy) {
    task.claimedBy = addr;
    task.claimedName = cleanName;
    task.claimedAt = Date.now();
    task.claimActorType = 'agent';
  }
  const sub = {
    id: `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    worker: addr,
    blockyName: cleanName,
    actorType: 'agent',
    agentId: /^\d{1,12}$/.test(cleanAgent) ? cleanAgent : '',
    summary: cleanSummary,
    proofUrl: clean(proofUrl, 300),
    createdAt: Date.now(),
    paid: false,
    payTxHash: null,
  };
  task.submissions = [sub, ...(task.submissions || [])].slice(0, 50);
  await saveTasks(tasks);
  return { ok: true, submission: sub, task };
}

const TICKER_RE = /\b\$?(NVDA|TSLA|AAPL|MSFT|AMZN|GOOGL|META|MSTR|COIN|SNDK|SPCX|PLTR|AMD|NFLX|CRCL|HOOD|SPY|QQQ|SLV|GLD)c?\b/i;

export function inferCityTaskSkill(task) {
  const text = `${task?.title || ''} ${task?.brief || ''}`;
  if (/exit\s*screen|trending\s+tokens\s+on\s+base/i.test(text)) {
    return { skill: 'base-token-exit-screen', ticker: null };
  }
  const explicit = (/ticker\s*:\s*\$?([A-Z]{2,6})c?\b/i.exec(text) || [])[1];
  const matched = explicit ? explicit.toUpperCase().replace(/C$/, '') : ((TICKER_RE.exec(text) || [])[1] || '').toUpperCase();
  if (!matched) return null;
  if (/weekend|friday\s+close|gap/i.test(text)) return { skill: 'stock-weekend-gap', ticker: matched };
  if (/after[\s-]?hours|volume|transfers?/i.test(text)) return { skill: 'stock-after-hours-volume', ticker: matched };
  return { skill: 'stock-nav-premium', ticker: matched };
}

export function eligibleCityTask(task, s) {
  if (!task || task.status !== 'open') return false;
  if (task.audience === 'citizen') return false;
  if (task.requester?.toLowerCase() === s.owner) return false;
  if (task.claimedBy && task.claimedBy.toLowerCase() !== s.owner) return false;
  if ((task.submissions || []).some((sub) => sub.worker?.toLowerCase() === s.owner)) return false;
  if ((s.items || []).some((d) => d.jobId === task.id && d.status !== 'Skipped')) return false;
  return !!inferCityTaskSkill(task);
}

async function syncCityItems(s, cityTasks) {
  let changed = false;
  for (const item of (s.items || []).filter((i) => i.source === 'basecity' && !i.receipt && i.status !== 'Skipped')) {
    const ct = cityTasks.find((t) => t.id === item.jobId);
    if (ct && ct.status === 'paid' && ct.paidVerified && ct.winner?.toLowerCase() === s.owner && ct.payTxHash) {
      item.receipt = {
        tx: ct.payTxHash,
        amountUnits: Math.round((Number(ct.verifiedUsdc) || 0) * 1e6),
        verifiedAt: new Date().toISOString(),
      };
      item.status = 'Paid';
      changed = true;
      logWorker(s, 'Paid', `BaseCity ${ct.id}: ${ct.rewardAmount} ${ct.rewardToken}`);
      await bumpJobsPaid(item.tokenId || s.settings.tokenId).catch(() => {});
      if (Number(ct.verifiedUsdc) > 0) await recordWork({
        kind: 'job-paid',
        blocky: item.tokenId || s.settings.tokenId,
        agentId: item.agentId || s.settings.agentId,
        usd: Number(ct.verifiedUsdc),
        tx: ct.payTxHash,
        title: item.title,
      }).catch(() => {});
    }
  }
  return changed;
}

export async function tickCityTasks(owner) {
  const release = await lockWorker(owner);
  if (!release) return null;
  try {
    const s = await readWorker(owner);
    if (!s) return null;
    const version = s.version;
    const cityTasks = await loadCityTasks().catch(() => []);
    const synced = await syncCityItems(s, cityTasks);
    if (!s.enabled || Date.now() > Date.parse(s.expiresAt)) {
      if (synced) await writeWorkerIf(s, version);
      return await readWorker(owner);
    }

    const pending = (s.items || []).filter((i) => !['Paid', 'Failed', 'Skipped'].includes(i.status));
    const day = new Date().toISOString().slice(0, 10);
    const today = (s.items || []).filter((i) => i.createdAt?.startsWith(day));
    if (pending.length >= s.settings.maxPending || today.length >= s.settings.maxJobsDaily) {
      if (synced) await writeWorkerIf(s, version);
      return await readWorker(owner);
    }

    const cityTask = cityTasks.find((t) => eligibleCityTask(t, s));
    if (!cityTask) {
      if (synced) await writeWorkerIf(s, version);
      return await readWorker(owner);
    }

    const fleet = s.settings.fleet === false
      ? [{ blocky: s.settings.tokenId, agentId: String(s.settings.agentId) }]
      : await linksOf(owner)
          .then((l) => (l.length ? l : [{ blocky: s.settings.tokenId, agentId: String(s.settings.agentId) }]))
          .catch(() => [{ blocky: s.settings.tokenId, agentId: String(s.settings.agentId) }]);
    const per = s.settings.perBlockyDaily || 2;
    const load = (p) => today.filter((i) => String(i.agentId || s.settings.agentId) === p.agentId).length;
    const pair = fleet.filter((p) => load(p) < per).sort((a, b) => load(a) - load(b))[0];
    if (!pair) {
      if (synced) await writeWorkerIf(s, version);
      return await readWorker(owner);
    }

    const before = await readWorker(owner);
    if (!before || before.version !== version || !before.enabled) return before;

    const inferred = inferCityTaskSkill(cityTask);
    const item = {
      jobId: cityTask.id,
      source: 'basecity',
      title: cityTask.title,
      createdAt: new Date().toISOString(),
      status: 'Researching',
      costUnits: 0,
      tokenId: Number(pair.blocky),
      agentId: pair.agentId,
    };
    s.items.push(item);
    logWorker(s, 'Researching', `BaseCity A2A Blocky #${pair.blocky}: ${cityTask.title}`);
    if (!(await writeWorkerIf(s, version))) return await readWorker(owner);

    try {
      await assertOwners(s.owner, pair.blocky, pair.agentId);
      const pseudoJob = {
        id: cityTask.id,
        title: cityTask.title,
        brief: cityTask.brief,
        contract: {
          skill: inferred.skill,
          chainId: 8453,
          inputs: { ticker: inferred.ticker, chainId: 8453 },
        },
      };
      const report = inferred.skill === 'base-token-exit-screen'
        ? await researchExit(client)
        : await researchStock(pseudoJob, { client });

      Object.assign(item, { ...report, status: 'Needs review' });
      delete item.evidence;

      const current = await readWorker(owner);
      if (!current || current.version !== version || !current.enabled) return current;

      const summaryText = `${report.preview}\n\n${report.result}`.slice(0, 1500);
      const submitted = await submitAgentCityTask({
        taskId: cityTask.id,
        worker: s.owner,
        blockyName: `Blocky #${pair.blocky}`,
        agentId: pair.agentId,
        summary: summaryText,
        proofUrl: '/api/stocks',
      });
      item.deliveryId = submitted.submission.id;
      item.status = 'Submitted';
      await recordWork({
        kind: 'job-delivered',
        blocky: item.tokenId,
        agentId: item.agentId,
        title: cityTask.title,
      }).catch(() => {});
      logWorker(s, 'Submitted', `BaseCity A2A: ${cityTask.title}`);
    } catch (e) {
      item.status = 'Failed';
      item.error = String(e.shortMessage || e.message).slice(0, 500);
      logWorker(s, 'Failed', `BaseCity A2A: ${item.error}`);
    }

    const latest = await readWorker(owner);
    if (latest && latest.version === version && latest.enabled) await writeWorkerIf(s, version);
    return await readWorker(owner);
  } finally {
    await release();
  }
}

function buildRequesterTrust(tasks) {
  const map = {};
  for (const t of tasks) {
    const r = (t.requester || '').toLowerCase();
    if (!r) continue;
    if (!map[r]) map[r] = { posted: 0, paid: 0, cancelled: 0 };
    map[r].posted += 1;
    if (t.status === 'paid' && t.paidVerified) map[r].paid += 1;
    if (t.status === 'cancelled') map[r].cancelled += 1;
  }
  return map;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    const rawTasks = await loadTasks();
    const tasks = rawTasks.map(normalizeTask);

    if (req.method === 'GET') {
      const openCount = tasks.filter((t) => t.status === 'open').length;
      const paidTasks = tasks.filter((t) => t.status === 'paid' && t.paidVerified);
      const totalUsdcPaid = paidTasks.reduce((a, t) => a + Number(t.verifiedUsdc || 0), 0);
      return res.status(200).json({
        tasks,
        requesterTrust: buildRequesterTrust(tasks),
        stats: { total: tasks.length, open: openCount, paid: paidTasks.length, totalUsdcPaid },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = parseBody(req);
    const action = String(b.action || '');

    // every action that speaks for a wallet carries that wallet's signature over exactly what it does
    if (['create', 'claim', 'unclaim', 'submit', 'cancel'].includes(action)) {
      let message = '';
      try { message = taskMessage(action, b, String(b.issuedAt || '')); } catch { /* unknown action */ }
      const auth = await checkSigned({ wallet: taskWallet(action, b), message, signature: b.signature, issuedAt: String(b.issuedAt || '') });
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    }

    if (action === 'create') {
      const title = clean(b.title, 120);
      const brief = clean(b.brief, 1200);
      const category = ['Research', 'Builder', 'Content', 'Onchain', 'Design'].includes(b.category) ? b.category : 'Builder';
      const mode = b.mode === 'claim' ? 'claim' : 'bounty';
      const audience = ['all', 'citizen', 'agent'].includes(b.audience) ? b.audience : 'all';
      const expiryHours = Math.max(0.25, Math.min(720, Number(b.expiryHours) || 24));
      const rewardToken = clean(b.rewardToken || 'USDC', 16).toUpperCase() || 'USDC';
      const isUsdc = rewardToken === 'USDC';
      const rewardTokenAddress = isUsdc ? BASE_USDC : clean(b.rewardTokenAddress, 60);
      const rewardDecimals = Number.isInteger(Number(b.rewardDecimals)) ? Number(b.rewardDecimals) : (isUsdc ? 6 : 8);
      const rewardAmount = Number(b.rewardAmount ?? b.rewardUsdc);
      const rewardUsdc = Number(b.rewardUsdc ?? (isUsdc ? rewardAmount : 0));

      if (!title || title.length < 4) return res.status(400).json({ error: 'Task title must be at least 4 characters.' });
      if (!brief || brief.length < 10) return res.status(400).json({ error: 'Task brief must be at least 10 characters.' });
      if (!isAddress(rewardTokenAddress, { strict: false })) return res.status(400).json({ error: 'Valid Base token address required for reward.' });
      const minAmt = isUsdc ? 0.1 : 0.00001;
      if (!Number.isFinite(rewardAmount) || rewardAmount < minAmt || rewardAmount > 100000) {
        return res.status(400).json({ error: `Reward amount must be at least ${minAmt} ${rewardToken}.` });
      }
      if (!isAddress(b.requester || '', { strict: false })) return res.status(400).json({ error: 'Valid requester Base wallet address required.' });

      const now = Date.now();
      const task = normalizeTask({
        id: `bc-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        source: 'basecity',
        title,
        brief,
        category,
        mode,
        audience,
        rewardToken,
        rewardTokenAddress: getAddress(rewardTokenAddress),
        rewardDecimals,
        rewardAmount: isUsdc ? Math.round(rewardAmount * 100) / 100 : Number(rewardAmount.toFixed(6)),
        rewardUsdc: isUsdc ? Math.round(rewardAmount * 100) / 100 : 0, // a stock reward's USD value is read from its NAV once paid, never from the poster
        requester: getAddress(b.requester).toLowerCase(),
        status: 'open',
        createdAt: now,
        expiryTime: now + Math.round(expiryHours * 3600e3),
        submissions: [],
      });
      tasks.unshift(task);
      await saveTasks(tasks);
      return res.status(200).json({ ok: true, task });
    }

    if (action === 'claim') {
      const task = tasks.find((t) => t.id === b.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found.' });
      if (task.status !== 'open') return res.status(409).json({ error: 'Task is no longer open.' });
      if (task.mode !== 'claim') return res.status(400).json({ error: 'Only Claim-mode tasks require claiming.' });
      if (!isAddress(b.worker || '', { strict: false })) return res.status(400).json({ error: 'Valid worker Base wallet address required.' });
      const worker = getAddress(b.worker).toLowerCase();
      if (worker === task.requester) return res.status(400).json({ error: 'Requester cannot claim their own task.' });
      if (task.claimedBy && task.claimedBy !== worker) {
        return res.status(409).json({ error: 'Task is already claimed by another worker.' });
      }
      task.claimedBy = worker;
      task.claimedName = clean(b.blockyName, 60) || 'Blocky Citizen';
      task.claimedAt = Date.now();
      task.claimActorType = b.actorType === 'agent' ? 'agent' : 'citizen';
      await saveTasks(tasks);
      return res.status(200).json({ ok: true, task });
    }

    if (action === 'unclaim') {
      const task = tasks.find((t) => t.id === b.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found.' });
      if (!isAddress(b.worker || '', { strict: false })) return res.status(400).json({ error: 'Valid worker address required.' });
      const worker = getAddress(b.worker).toLowerCase();
      if (task.claimedBy !== worker && task.requester !== worker) {
        return res.status(403).json({ error: 'Only the claiming worker or requester can release this claim.' });
      }
      task.claimedBy = null;
      task.claimedName = null;
      task.claimedAt = null;
      task.claimActorType = null;
      await saveTasks(tasks);
      return res.status(200).json({ ok: true, task });
    }

    if (action === 'submit') {
      const task = tasks.find((t) => t.id === b.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found.' });
      if (task.status !== 'open') return res.status(409).json({ error: 'Task is no longer open.' });
      if (!isAddress(b.worker || '', { strict: false })) return res.status(400).json({ error: 'Valid worker Base wallet address required.' });
      const worker = getAddress(b.worker).toLowerCase();
      if (task.mode === 'claim' && task.claimedBy && task.claimedBy !== worker) {
        return res.status(409).json({ error: 'This Claim-mode task is locked by another worker.' });
      }
      const actorType = b.actorType === 'agent' ? 'agent' : 'citizen';
      if (task.audience === 'citizen' && actorType !== 'citizen') {
        return res.status(403).json({ error: 'This task is restricted to Citizens.' });
      }
      if (task.audience === 'agent' && actorType !== 'agent') {
        return res.status(403).json({ error: 'This task is restricted to Blocky Agents (A2A).' });
      }
      const summary = clean(b.summary, 1500);
      const proofUrl = clean(b.proofUrl, 300);
      const agentId = clean(b.agentId, 20).replace(/^#\s*/, '');
      if (!summary || summary.length < 8) return res.status(400).json({ error: 'Submission summary must be at least 8 characters.' });

      if (task.mode === 'claim' && !task.claimedBy) {
        task.claimedBy = worker;
        task.claimedName = clean(b.blockyName, 60) || 'Blocky Citizen';
        task.claimedAt = Date.now();
        task.claimActorType = actorType;
      }

      const sub = {
        id: `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        worker,
        blockyName: clean(b.blockyName, 60) || (actorType === 'agent' ? 'Blocky Agent' : 'Blocky Citizen'),
        actorType,
        agentId: /^\d{1,12}$/.test(agentId) ? agentId : '',
        summary,
        proofUrl,
        createdAt: Date.now(),
        paid: false,
        payTxHash: null,
      };
      task.submissions = [sub, ...(task.submissions || [])].slice(0, 50);
      await saveTasks(tasks);
      return res.status(200).json({ ok: true, submission: sub, task });
    }

    if (action === 'approve') {
      const task = tasks.find((t) => t.id === b.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found.' });
      if (!isAddress(b.requester || '', { strict: false }) || getAddress(b.requester).toLowerCase() !== task.requester) {
        return res.status(403).json({ error: 'Only the task requester can approve and pay.' });
      }
      const sub = (task.submissions || []).find((s) => s.id === b.submissionId);
      if (!sub) return res.status(404).json({ error: 'Submission not found.' });
      const tx = clean(b.payTxHash, 80);
      if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return res.status(400).json({ error: 'Valid Base payment transaction hash required.' });

      if (task.status === 'paid') return res.status(409).json({ error: 'This task is already paid.' });
      if (task.status === 'cancelled') return res.status(409).json({ error: 'This task was cancelled.' });
      let paid;
      try { paid = await verifyPayout(task, sub, tx, tasks); } catch (e) { return res.status(409).json({ error: e.message }); }
      sub.paid = true;
      sub.payTxHash = tx;
      task.status = 'paid';
      task.paidAt = Date.now();
      task.payTxHash = tx;
      task.winner = sub.worker;
      task.paidVerified = true;
      task.paidUnits = String(paid.units);
      task.verifiedUsdc = await payoutUsd(task, paid);
      await saveTasks(tasks);
      return res.status(200).json({ ok: true, task });
    }

    if (action === 'cancel') {
      const task = tasks.find((t) => t.id === b.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found.' });
      if (!isAddress(b.requester || '', { strict: false }) || getAddress(b.requester).toLowerCase() !== task.requester) {
        return res.status(403).json({ error: 'Only the task requester can cancel this task.' });
      }
      if (task.status === 'paid') return res.status(409).json({ error: 'Paid tasks cannot be cancelled.' });
      task.status = 'cancelled';
      await saveTasks(tasks);
      return res.status(200).json({ ok: true, task });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Task board error' });
  }
}
