// BaseCity Unified Task Board (TaskMarket-inspired Bounty & Claim modes):
// - Work in BaseCity, Get Paid in Stocks or USDC on Base (100% self-custody ERC-20 settlement)
// - Pulls REAL open jobs from Blue Agent (/api/work) + BaseCity native tasks (/api/city-tasks)
// - Supports Bounty (open competition) & Claim (exclusive worker lock) + flexible deadlines (15m to 14d)
// - Explicitly distinguishes Citizen (human player) vs Blocky Agent (automated A2A) tasks & submissions
import { encodeFunctionData, erc20Abi, parseUnits, toHex } from 'viem';
import { esc } from './names.js';
import { sendTx, waitTx, rejected, toBase } from './wallet.js';
import { withBuilderCode } from './attribution.js';
import { BASE_USDC } from './swap-base.js';
import { clean, deliveryMessage, validateDelivery } from './work-protocol.js';
import { linkedAgentId, linkAgentId } from './agent-id.js';
import { itemSprite, itemIcon, taskCategorySpriteId } from './items.js';
import { taskMessage } from './signed.js';
import { EVALUATOR_MODES, GATE_MODES, hashCriteria, escrowConfigured, lockTaskEscrow, completeEscrowOnchain, refundExpiredEscrowOnchain } from './task-escrow.js';

const LOCAL_KEY = 'basecity:city-tasks:v3';

function readLocal() {
  try {
    const j = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}

function writeLocal(tasks) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(tasks.slice(0, 100))); } catch { /* ignore */ }
}

// A request to the task board. No answer at all (offline): null, so the caller keeps a local copy as before.
// A refusal (bad signature, not the requester, payment not found...) throws: it must never look like it worked.
async function callTasks(body) {
  let r;
  try { r = await fetch('/api/city-tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); } catch { return null; }
  const j = await r.json().catch(() => null);
  if (!j) return null;
  if (!r.ok) throw new Error(j.error || `The task board answered ${r.status}.`);
  return j;
}
// the action signed by the wallet that takes it (src/signed.js): a personal_sign, no transaction, no gas
async function signedBody(provider, account, action, body) {
  const issuedAt = new Date().toISOString();
  const full = { ...body, action };
  const signature = await provider.request({ method: 'personal_sign', params: [toHex(taskMessage(action, full, issuedAt)), account] });
  return { ...full, issuedAt, signature };
}

const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

export function formatTaskReward(t) {
  const sym = String(t?.rewardToken || 'USDC').toUpperCase();
  const amt = Number(t?.rewardAmount ?? t?.rewardUsdc ?? 0);
  if (sym === 'USDC') return `$${amt.toFixed(2)} USDC`;
  const cleanAmt = amt >= 1 ? amt.toFixed(3) : amt.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
  return `${cleanAmt} ${sym}`;
}

function timeLeftLabel(expiryTime, status) {
  if (status === 'paid') return 'Settled on Base';
  if (status === 'cancelled') return 'Cancelled';
  if (!expiryTime) return '';
  const diff = expiryTime - Date.now();
  if (diff <= 0) return 'Expired';
  const hrs = Math.floor(diff / 3600e3);
  if (hrs >= 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h left`;
  const mins = Math.max(1, Math.floor(diff / 60e3));
  return hrs >= 1 ? `${hrs}h ${mins % 60}m left` : `${mins}m left`;
}

function computeTrust(tasks) {
  const map = {};
  for (const t of tasks || []) {
    const r = (t.requester || '').toLowerCase();
    if (!r) continue;
    if (!map[r]) map[r] = { posted: 0, paid: 0 };
    map[r].posted += 1;
    if (t.status === 'paid') map[r].paid += 1;
  }
  return map;
}

export async function fetchCityTasks() {
  const fetchBlue = async () => {
    for (const url of ['/api/work', '/blue-jobs']) {
      try {
        const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(7000) });
        if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
          const j = await r.json();
          if (Array.isArray(j?.jobs)) return j;
        }
      } catch { /* try next */ }
    }
    return null;
  };
  const [blueRes, cityRes] = await Promise.all([
    fetchBlue(),
    fetch('/api/city-tasks', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null))
      .catch(() => null),
  ]);

  const blueTasks = (blueRes?.jobs || []).map((j) => ({
    id: j.id,
    source: 'blueagent',
    mode: 'bounty',
    audience: 'agent',
    title: j.title,
    brief: j.brief,
    category: 'Blue Agent',
    rewardToken: 'USDC',
    rewardTokenAddress: BASE_USDC,
    rewardDecimals: 6,
    rewardAmount: Number(j.budgetUnits || 0) / 1e6,
    rewardUsdc: Number(j.budgetUnits || 0) / 1e6,
    budgetUnits: Number(j.budgetUnits || 0),
    requester: (j.poster || '').toLowerCase(),
    status: j.status === 'open' ? 'open' : 'paid',
    createdAt: Date.parse(j.createdAt || '') || Date.now(),
    expiryTime: null,
    claimedBy: null,
    submissions: (j.deliveries || []).map((d) => ({
      id: d.id,
      worker: (d.payTo || '').toLowerCase(),
      blockyName: d.agentId ? `Agent #${d.agentId}` : 'Blocky Agent',
      actorType: 'agent',
      agentId: d.agentId || '',
      summary: d.preview || '',
      proofUrl: '',
      paid: Boolean(d.unlocked),
      payTxHash: null,
    })),
    rawJob: j,
  }));

  const nativeTasks = Array.isArray(cityRes?.tasks)
    ? cityRes.tasks.map((t) => ({ ...t, source: 'basecity' }))
    : readLocal();
  if (Array.isArray(cityRes?.tasks)) writeLocal(nativeTasks);

  return [...nativeTasks, ...blueTasks];
}

export async function submitBlueAgentJob({ provider, account, task, tokenId, agentId, priceUsd, preview, result }) {
  if (!provider || !account) throw new Error('Connect your Base wallet first.');
  if (!tokenId) throw new Error('Equip a claimed Blocky NFT first.');
  const cleanAgent = String(agentId || '').trim().replace(/^#\s*/, '');
  if (!/^\d{1,12}$/.test(cleanAgent)) throw new Error('Enter your numeric ERC-8004 Agent ID (e.g. 1205445).');

  const body = {
    agentId: cleanAgent,
    tokenId: Number(tokenId),
    signer: account.toLowerCase(),
    payTo: account.toLowerCase(),
    priceUsd: String(priceUsd).replace(',', '.'),
    preview: clean(preview, 600),
    result: clean(result, 20000),
    issuedAt: new Date().toISOString(),
  };
  const why = validateDelivery(body, task.rawJob);
  if (why) throw new Error(why);

  const message = await deliveryMessage({ ...body, jobId: task.id, priceUnits: Math.round(Number(body.priceUsd) * 1e6) });
  body.signature = await provider.request({ method: 'personal_sign', params: [toHex(message), account] });

  const r = await fetch(`/api/work?id=${encodeURIComponent(task.id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Submission failed (HTTP ${r.status})`);
  linkAgentId(account.toLowerCase(), cleanAgent);
  return j;
}

export async function createCityTask({
  provider, account, title, brief, category,
  mode = 'bounty', audience = 'all', expiryHours = 24,
  evaluator = 'self', gate = 'open', criteria = '',
  useEscrow = false, escrowTaskId = null, escrowTxHash = null, onStatus,
  rewardToken = 'USDC', rewardTokenAddress = BASE_USDC, rewardDecimals = 6,
  rewardAmount, rewardUsdc,
}) {
  if (!provider || !account) throw new Error('Connect your Base wallet first.');
  const cleanAmt = Number(String(rewardAmount ?? rewardUsdc ?? 0).replace(',', '.'));
  const tokenSym = String(rewardToken || 'USDC').toUpperCase();
  const tokenAddr = rewardTokenAddress || BASE_USDC;
  const tokenDec = Number(rewardDecimals) || (tokenSym === 'USDC' ? 6 : 8);
  const cleanEval = EVALUATOR_MODES.some((e) => e.id === evaluator) ? evaluator : 'self';
  const cleanGate = GATE_MODES.some((g) => g.id === gate) ? gate : 'open';
  const cleanCriteria = String(criteria || '').trim();
  const cHash = hashCriteria({ title, brief, criteria: cleanCriteria, evaluator: cleanEval, gate: cleanGate });

  if (useEscrow && escrowConfigured() && !escrowTxHash) {
    const locked = await lockTaskEscrow({
      provider,
      account,
      tokenAddress: tokenAddr,
      amount: cleanAmt,
      decimals: tokenDec,
      evaluatorAddress: account,
      expiryHours: Number(expiryHours) || 24,
      mode,
      gate: cleanGate,
      criteriaHash: cHash,
      onStatus,
    });
    escrowTaskId = locked.escrowTaskId;
    escrowTxHash = locked.escrowTxHash;
    onStatus?.('Sign task listing in your Base wallet...');
  }

  const payload = {
    title,
    brief,
    category,
    mode,
    audience,
    expiryHours: Number(expiryHours) || 24,
    evaluator: cleanEval,
    gate: cleanGate,
    criteria: cleanCriteria,
    escrowTaskId,
    escrowTxHash,
    rewardToken: tokenSym,
    rewardTokenAddress: tokenAddr,
    rewardDecimals: tokenDec,
    rewardAmount: cleanAmt,
    rewardUsdc: Number(rewardUsdc ?? (tokenSym === 'USDC' ? cleanAmt : 0)),
    requester: account,
  };
  const j = await callTasks(await signedBody(provider, account, 'create', payload));
  if (j?.task) {
    writeLocal([j.task, ...readLocal().filter((t) => t.id !== j.task.id)]);
    return j.task;
  }

  const now = Date.now();
  const task = {
    id: `bc-${now.toString(36)}`,
    source: 'basecity',
    title: String(title).trim(),
    brief: String(brief).trim(),
    category,
    mode: mode === 'claim' ? 'claim' : 'bounty',
    audience: ['all', 'citizen', 'agent'].includes(audience) ? audience : 'all',
    evaluator: cleanEval,
    gate: cleanGate,
    criteria: cleanCriteria,
    criteriaHash: hashCriteria({ title, brief, criteria: cleanCriteria, evaluator: cleanEval, gate: cleanGate }),
    escrowTaskId,
    escrowTxHash,
    rewardToken: tokenSym,
    rewardTokenAddress: rewardTokenAddress || BASE_USDC,
    rewardDecimals: Number(rewardDecimals) || (tokenSym === 'USDC' ? 6 : 8),
    rewardAmount: cleanAmt,
    rewardUsdc: Number(rewardUsdc ?? (tokenSym === 'USDC' ? cleanAmt : 0)),
    requester: account.toLowerCase(),
    status: 'open',
    createdAt: now,
    expiryTime: now + Math.round((Number(expiryHours) || 24) * 3600e3),
    claimedBy: null,
    claimedName: null,
    submissions: [],
  };
  writeLocal([task, ...readLocal()]);
  return task;
}

export async function claimCityTask({ provider, account, taskId, blockyName, actorType = 'citizen' }) {
  if (!provider || !account) throw new Error('Connect your Base wallet first.');
  const j = await callTasks(await signedBody(provider, account, 'claim', { taskId, worker: account, blockyName, actorType }));
  if (j?.task) {
    writeLocal(readLocal().map((t) => (t.id === j.task.id ? j.task : t)));
    return j.task;
  }

  const all = readLocal();
  const task = all.find((t) => t.id === taskId);
  if (!task) throw new Error('Task not found.');
  task.claimedBy = account.toLowerCase();
  task.claimedName = blockyName || 'Blocky Citizen';
  task.claimedAt = Date.now();
  task.claimActorType = actorType;
  writeLocal(all);
  return task;
}

export async function unclaimCityTask({ provider, account, taskId }) {
  if (!provider || !account) throw new Error('Connect your Base wallet first.');
  const j = await callTasks(await signedBody(provider, account, 'unclaim', { taskId, worker: account }));
  if (j?.task) {
    writeLocal(readLocal().map((t) => (t.id === j.task.id ? j.task : t)));
    return j.task;
  }

  const all = readLocal();
  const task = all.find((t) => t.id === taskId);
  if (task) {
    task.claimedBy = null;
    task.claimedName = null;
    task.claimedAt = null;
    task.claimActorType = null;
    writeLocal(all);
  }
  return task;
}

export async function cancelCityTask({ provider, account, taskId }) {
  if (!provider || !account) throw new Error('Connect your Base wallet first.');
  const j = await callTasks(await signedBody(provider, account, 'cancel', { taskId, requester: account }));
  if (j?.task) {
    writeLocal(readLocal().map((t) => (t.id === j.task.id ? j.task : t)));
    return j.task;
  }

  const all = readLocal();
  const task = all.find((t) => t.id === taskId);
  if (task) {
    task.status = 'cancelled';
    writeLocal(all);
  }
  return task;
}

export async function submitCityTask({ provider, account, taskId, blockyName, actorType = 'citizen', agentId = '', summary, proofUrl }) {
  if (!provider || !account) throw new Error('Connect your Base wallet first.');
  const j = await callTasks(await signedBody(provider, account, 'submit', { taskId, worker: account, blockyName, actorType, agentId, summary, proofUrl }));
  if (j?.task) {
    writeLocal(readLocal().map((t) => (t.id === j.task.id ? j.task : t)));
    return j.task;
  }

  const all = readLocal();
  const task = all.find((t) => t.id === taskId);
  if (!task) throw new Error('Task not found.');
  task.submissions = [{
    id: `sub-${Date.now().toString(36)}`,
    worker: account.toLowerCase(),
    blockyName,
    actorType,
    agentId: String(agentId || '').trim(),
    summary: String(summary).trim(),
    proofUrl: String(proofUrl || '').trim(),
    createdAt: Date.now(),
    paid: false,
    payTxHash: null,
  }, ...(task.submissions || [])];
  writeLocal(all);
  return task;
}

export async function evaluateCityTaskSubmission({ provider, account, taskId, submissionId }) {
  if (!provider || !account) throw new Error('Connect your Base wallet first.');
  const j = await callTasks(await signedBody(provider, account, 'evaluate', { taskId, submissionId, actor: account }));
  if (j?.task) {
    writeLocal(readLocal().map((t) => (t.id === j.task.id ? j.task : t)));
    return j;
  }
  throw new Error('Evaluator service is offline. Try again when connected to the BaseCity server.');
}

// Pays the winning worker on Base via BaseCityTaskEscrow (if escrowed) or direct ERC-20 transfer (USDC 6-dec or Stock 8-dec).
export async function approveAndPayCityTask({ provider, account, task, submission, onStatus }) {
  if (!provider || !account) throw new Error('Connect your Base wallet first.');
  if (account.toLowerCase() !== task.requester.toLowerCase()) {
    throw new Error('Only the requester wallet can approve and pay this task.');
  }
  const tokenSym = String(task.rewardToken || 'USDC').toUpperCase();
  const tokenAddr = task.rewardTokenAddress || BASE_USDC;
  const decimals = Number.isInteger(Number(task.rewardDecimals)) ? Number(task.rewardDecimals) : (tokenSym === 'USDC' ? 6 : 8);
  const amt = String(task.rewardAmount ?? task.rewardUsdc ?? 0).replace(',', '.');
  const units = parseUnits(amt, decimals);
  if (units <= 0n) throw new Error('Invalid reward amount.');

  let txHash;
  if (task.escrowTaskId != null && escrowConfigured()) {
    txHash = await completeEscrowOnchain({
      provider,
      account,
      escrowTaskId: task.escrowTaskId,
      winner: submission.worker,
      attestationHash: submission.evaluation?.attestationHash,
      onStatus,
    });
  } else {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [submission.worker, units],
    });
    await toBase(provider);
    onStatus?.(`Confirm ${formatTaskReward(task)} payout on Base to ${shortAddr(submission.worker)}...`);
    txHash = await sendTx(provider, withBuilderCode({ from: account, to: tokenAddr, data }));
    onStatus?.(`Confirming ${tokenSym} settlement on Base...`);
    const res = await waitTx(txHash, provider);
    if (res.ok === false) throw new Error(`${tokenSym} payout transaction reverted.`);
  }

  onStatus?.('Checking the payment on Base...');
  let j = null;
  try { j = await callTasks({ action: 'approve', taskId: task.id, submissionId: submission.id, requester: account, payTxHash: txHash }); }
  catch (err) { throw new Error(`${err.message} Your payment went through (${txHash}); press Approve & Pay again to record it.`); }
  if (j?.task) { writeLocal(readLocal().map((x) => (x.id === j.task.id ? j.task : x))); return txHash; }

  const all = readLocal();
  const t = all.find((x) => x.id === task.id);
  if (t) {
    t.status = 'paid';
    t.payTxHash = txHash;
    t.winner = submission.worker;
    const s = (t.submissions || []).find((x) => x.id === submission.id);
    if (s) { s.paid = true; s.payTxHash = txHash; }
    writeLocal(all);
  }
  return txHash;
}

export async function refundExpiredCityTask({ provider, account, task, onStatus }) {
  if (!provider || !account) throw new Error('Connect your Base wallet first.');
  if (task.escrowTaskId == null) throw new Error('This task does not have an onchain escrow lock.');
  const txHash = await refundExpiredEscrowOnchain({ provider, account, escrowTaskId: task.escrowTaskId, onStatus });
  onStatus?.('Updating task status...');
  await cancelCityTask({ provider, account, taskId: task.id }).catch(() => {});
  return txHash;
}

export function renderTaskBoardHtml({ tasks, filter, audienceFilter = 'all', account, activeBlocky, linkedBlockyAgentId = '', expandedId, busyMsg, loading }) {
  const me = (account || '').toLowerCase();
  const savedAgent = String(linkedBlockyAgentId || (me ? (linkedAgentId(me) || '') : '')).trim();
  const trustMap = computeTrust(tasks);

  const byAud = tasks.filter((t) => {
    if (audienceFilter === 'all') return true;
    return t.audience === 'all' || t.audience === audienceFilter;
  });

  const filtered = byAud.filter((t) => {
    if (filter === 'open') return t.status === 'open';
    if (filter === 'mine') return me && (t.requester === me || t.claimedBy === me);
    if (filter === 'paid') return t.status === 'paid';
    return true;
  });

  const openCount = byAud.filter((t) => t.status === 'open').length;
  const paidCount = byAud.filter((t) => t.status === 'paid').length;
  const audLabel = (a) => (a === 'citizen' ? 'CITIZEN ONLY' : a === 'agent' ? 'BLOCKY AGENT · A2A' : 'CITIZEN + AGENT');

  return `
    <div class="tm-bar">
      <div class="lp-seg">
        <button type="button" class="lp-seg-btn${filter === 'open' ? ' on' : ''}" data-tm-filter="open">Open (${openCount})</button>
        <button type="button" class="lp-seg-btn${filter === 'mine' ? ' on' : ''}" data-tm-filter="mine">My Tasks</button>
        <button type="button" class="lp-seg-btn${filter === 'paid' ? ' on' : ''}" data-tm-filter="paid">Completed (${paidCount})</button>
      </div>
      <div class="b10-sec-pills" style="margin-top:8px">
        <button type="button" class="b10-sec-pill${audienceFilter === 'all' ? ' on' : ''}" data-tm-aud="all">All Workers</button>
        <button type="button" class="b10-sec-pill${audienceFilter === 'citizen' ? ' on' : ''}" data-tm-aud="citizen">Citizen (Human)</button>
        <button type="button" class="b10-sec-pill${audienceFilter === 'agent' ? ' on' : ''}" data-tm-aud="agent">Blocky Agent (A2A)</button>
      </div>
    </div>
    ${busyMsg ? `<div class="lp-msg">${esc(busyMsg)}</div>` : ''}
    <div class="tm-list">
      ${loading ? '<p class="lp-desc">Loading live BaseCity & Blue Agent tasks...</p>' : filtered.length ? filtered.map((t) => {
        const isBlue = t.source === 'blueagent';
        const isReq = !isBlue && me && t.requester === me;
        const isClaimMode = !isBlue && t.mode === 'claim';
        const isClaimedByMe = Boolean(me && t.claimedBy && t.claimedBy === me);
        const isLockedByOther = Boolean(isClaimMode && t.claimedBy && (!me || t.claimedBy !== me));
        const isOpen = expandedId === t.id;
        const subs = t.submissions || [];
        const trust = trustMap[t.requester] || { posted: 1, paid: 0 };
        const expText = timeLeftLabel(t.expiryTime, t.status);
        const rewardStr = formatTaskReward(t);
        const isStockReward = String(t.rewardToken || 'USDC').toUpperCase() !== 'USDC';

        const catSprite = taskCategorySpriteId(t.category);
        const rewardSprite = isStockReward ? 'stock-cert' : 'coin-usdc';
        const audIcon = t.audience === 'agent' ? 'badge-agent' : 'badge-citizen';
        const evalInfo = EVALUATOR_MODES.find((e) => e.id === t.evaluator) || EVALUATOR_MODES[0];
        const gateInfo = GATE_MODES.find((g) => g.id === t.gate) || GATE_MODES[0];
        const hasAutoEval = !isBlue && t.evaluator && t.evaluator !== 'self';
        return `<div class="tm-card${t.status === 'paid' ? ' paid' : ''}">
          <div class="tm-head">
            <div class="mc-row-lead">
              ${itemSprite(catSprite, 38)}
              <div class="tm-meta">
                <div class="tm-badges">
                  <span class="tm-mode ${isClaimMode ? 'claim' : 'bounty'}">${itemIcon('escrow-chest', 13)} ${isBlue ? 'BLUE AGENT' : isClaimMode ? 'CLAIM' : 'BOUNTY'}</span>
                  <span class="tm-aud">${itemIcon(audIcon, 13)} ${esc(audLabel(t.audience))}</span>
                  <span class="tm-cat">${esc(t.category)}</span>
                  ${isStockReward ? `<span class="tm-mode bounty">${itemIcon('stock-cert', 13)} STOCK PAYOUT</span>` : ''}
                  ${hasAutoEval ? `<span class="tm-eval-badge">${esc(evalInfo.short)}</span>` : ''}
                  ${t.gate && t.gate !== 'open' ? `<span class="tm-gate-badge">${esc(gateInfo.short)}</span>` : ''}
                  ${t.escrowTxHash ? `<a class="tm-escrow-badge" href="https://basescan.org/tx/${esc(t.escrowTxHash)}" target="_blank" rel="noopener">ESCROWED</a>` : ''}
                </div>
                <b>${esc(t.title)}</b>
                <small>By ${esc(shortAddr(t.requester))} · <span class="tm-trust">Paid ${trust.paid}/${trust.posted}</span> · ${subs.length} sub${subs.length === 1 ? '' : 's'}${expText ? ` · <span class="tm-expiry">${esc(expText)}</span>` : ''}</small>
              </div>
            </div>
            <div class="tm-right">
              <span class="tm-bounty mc-inline-val">${itemIcon(rewardSprite, 16)} ${isBlue ? 'Up to ' : ''}${esc(rewardStr)}</span>
              ${t.status === 'paid' && t.payTxHash
                ? `<a class="btn small-pill" href="https://basescan.org/tx/${esc(t.payTxHash)}" target="_blank" rel="noopener">Paid</a>`
                : `<button type="button" class="btn primary small-pill" data-tm-toggle="${esc(t.id)}">${isOpen ? 'Hide' : isReq ? 'Review' : isClaimedByMe ? 'Submit' : 'Work'}</button>`}
            </div>
          </div>
          <p class="tm-brief">${esc(t.brief)}</p>
          ${isClaimMode && t.claimedBy && t.status === 'open' ? `<div class="tm-claimed-bar">Claimed exclusively by <b>${esc(t.claimedName || shortAddr(t.claimedBy))}</b> (${t.claimActorType === 'agent' ? 'BLOCKY AGENT' : 'CITIZEN'})${isClaimedByMe || isReq ? ` <button type="button" class="lp-mini-x" data-tm-unclaim="${esc(t.id)}">Release</button>` : ''}</div>` : ''}
          ${t.status === 'paid' && me && t.winner === me ? `<div class="tm-claimed-bar paid">Received ${esc(rewardStr)} on Base. <button type="button" class="btn primary small-pill" data-tm-invest="1">${isStockReward ? 'Trade in Stock Baskets' : 'Invest in Stock Baskets'}</button></div>` : ''}
          ${isOpen ? `<div class="tm-expand">
            ${t.criteria ? `<div class="tm-criteria-box"><b>LOCKED ACCEPTANCE CRITERIA${t.criteriaHash ? ` · ${esc(t.criteriaHash.slice(0, 10))}...` : ''}</b><p>${esc(t.criteria)}</p></div>` : ''}
            ${t.status === 'open' && isBlue ? (savedAgent ? `<form class="tm-sub-form" data-tm-blueform="${esc(t.id)}">
              <div class="tm-sub-as">Delivering as <b>${esc(activeBlocky?.name || 'Your Blocky')}</b> · <span class="tm-actor agent">AGENT #${esc(savedAgent)}</span> · paid in Base USDC to ${esc(shortAddr(account))}</div>
              <input type="hidden" name="agentId" value="${esc(savedAgent)}" />
              <div class="lp-grid">
                <input value="Agent #${esc(savedAgent)}" disabled />
                <input name="priceUsd" type="number" min="0.01" max="${Number(t.rewardUsdc)}" step="0.01" required value="${Number(t.rewardUsdc).toFixed(2)}" placeholder="Price (USDC)" />
              </div>
              <textarea name="preview" rows="2" required minlength="10" maxlength="600" placeholder="Public preview (max 600 chars)..."></textarea>
              <textarea name="result" rows="4" required minlength="10" maxlength="20000" placeholder="Full deliverable report (unlocked by buyer for USDC on Base)..."></textarea>
              <button type="submit" class="btn primary small-pill">Sign & Deliver via Blocky</button>
            </form>` : `<div class="tm-claim-box">
              <div class="tm-sub-as" style="margin-bottom:6px"><b>${esc(activeBlocky?.name || 'Your Blocky')}</b> does not have an ERC-8004 Agent ID linked yet.</div>
              <p class="lp-desc" style="margin:0 0 10px">Blue Agent jobs require a verified ERC-8004 Agent ID linked to your Blocky NFT on Base.</p>
              <a class="btn primary" href="/claim.html" style="display:inline-flex">Register & Link Agent ID on /claim</a>
            </div>`) : ''}
            ${t.status === 'open' && !isBlue && !isReq && isClaimMode && !t.claimedBy ? `
              <div class="tm-claim-box">
                <p class="lp-desc" style="margin:0 0 8px">This is an exclusive <b>Claim</b> task. Claim it first to lock the slot while you work.</p>
                <div class="td-actions">
                  ${t.audience !== 'agent' ? `<button type="button" class="btn td-go" data-tm-claim="${esc(t.id)}" data-tm-actor="citizen">Claim as Citizen</button>` : ''}
                  ${t.audience !== 'citizen' ? `<button type="button" class="btn td-copy" data-tm-claim="${esc(t.id)}" data-tm-actor="agent">Claim as Blocky Agent</button>` : ''}
                </div>
              </div>
            ` : ''}
            ${t.status === 'open' && !isBlue && !isReq && (!isClaimMode || isClaimedByMe) ? `<form class="tm-sub-form" data-tm-subform="${esc(t.id)}">
              <div class="tm-sub-as">Submitting as <b>${esc(activeBlocky?.name || 'Your Blocky')}</b> (${esc(shortAddr(account))})</div>
              <div class="lp-grid">
                <select name="actorType" data-tm-actorsel="1">
                  ${t.audience !== 'agent' ? '<option value="citizen">Citizen (Human · No Agent ID)</option>' : ''}
                  ${t.audience !== 'citizen' ? '<option value="agent">Blocky Agent (AI · A2A)</option>' : ''}
                </select>
                <input name="agentId" data-tm-agentinput="1" placeholder="ERC-8004 Agent ID (optional)" value="${esc(savedAgent)}"${t.audience !== 'agent' ? ' hidden' : ''} />
              </div>
              <textarea name="summary" rows="3" required minlength="8" placeholder="Describe your completed work, findings, or deliverable..."></textarea>
              <input name="proofUrl" type="url" placeholder="Proof link (optional: Basescan tx, GitHub, X post...)" />
              <button type="submit" class="btn primary small-pill">Sign & Submit Delivery</button>
            </form>` : ''}
            ${isLockedByOther ? '<p class="lp-desc">Locked by the claiming worker until they deliver or release the slot.</p>' : ''}
            ${isReq && t.status === 'open' ? `<div style="margin-bottom:8px"><button type="button" class="lp-mini-x" data-tm-cancel="${esc(t.id)}">Cancel Task</button></div>` : ''}
            ${isReq && t.status === 'expired' && t.escrowTaskId != null && escrowConfigured() ? `<div style="margin-bottom:8px"><button type="button" class="btn small-pill" data-tm-refund="${esc(t.id)}">Refund Expired Escrow</button></div>` : ''}
            ${subs.length ? `<div class="tm-subs">
              <div class="gm-sec-title">SUBMISSIONS (${subs.length})</div>
              ${subs.map((s) => {
                const ev = s.evaluation;
                const verdictHtml = ev ? `<div class="tm-verdict ${ev.verdict === 'PASS' ? 'pass' : 'fail'}">
                  <div class="tm-verdict-top">
                    <b>${esc(ev.verdict)} · ${esc(evalInfo.short)}</b>
                    <span>Score ${Number(ev.score || 0)}/100</span>
                  </div>
                  ${Array.isArray(ev.judges) && ev.judges.length ? `<div class="tm-verdict-list">${ev.judges.map((j) => `<div><span>${esc(j.judge)}: ${esc(j.vote)}</span> — ${esc(j.reason)}</div>`).join('')}</div>` : ''}
                  ${Array.isArray(ev.checks) && ev.checks.length ? `<div class="tm-verdict-list">${ev.checks.map((c) => `<div><span>${esc(c.name)}: ${c.pass ? 'OK' : 'MISS'}</span> (${Number(c.points || 0)}/${Number(c.max || 0)}) — ${esc(c.detail)}</div>`).join('')}</div>` : ''}
                  ${ev.attestationHash ? `<div class="tm-attest">Attestation: <code>${esc(ev.attestationHash.slice(0, 18))}...</code></div>` : ''}
                </div>` : '';
                const canEval = hasAutoEval && t.status === 'open' && (isReq || (me && s.worker === me));
                return `<div class="tm-sub-item">
                <div>
                  <span class="tm-actor ${s.actorType === 'agent' ? 'agent' : 'citizen'}">${itemIcon(s.actorType === 'agent' ? 'badge-agent' : 'badge-citizen', 13)} ${s.actorType === 'agent' ? 'BLOCKY AGENT' : 'CITIZEN'}</span>
                  <b>${esc(s.blockyName)} <small>${esc(shortAddr(s.worker))}${s.agentId ? ` · #${esc(s.agentId)}` : ''}</small></b>
                  <p>${esc(s.summary)}</p>
                  ${s.proofUrl ? `<a href="${esc(s.proofUrl)}" target="_blank" rel="noopener">View proof</a>` : ''}
                  ${verdictHtml}
                </div>
                <div class="tm-sub-acts">
                  ${canEval ? `<button type="button" class="btn small-pill" data-tm-eval="${esc(t.id)}" data-tm-sub="${esc(s.id)}">${ev ? 'Re-Evaluate' : 'Run Evaluator'}</button>` : ''}
                  ${isReq && t.status === 'open' ? `<button type="button" class="btn primary small-pill" data-tm-pay="${esc(t.id)}" data-tm-sub="${esc(s.id)}">Approve & Pay ${esc(rewardStr)}</button>` : ''}
                  ${s.paid && s.payTxHash ? `<a class="btn small-pill" href="https://basescan.org/tx/${esc(s.payTxHash)}" target="_blank" rel="noopener">Paid</a>` : ''}
                </div>
              </div>`;
              }).join('')}
            </div>` : '<p class="lp-desc">No submissions yet.</p>'}
          </div>` : ''}
        </div>`;
      }).join('') : '<p class="lp-desc">No open tasks match this filter yet. Switch to <b>Post Task</b> to publish a Base Stocks or USDC task.</p>'}
    </div>`;
}

export function renderPostTaskHtml(account, walletStocks = [], allStocks = []) {
  const heldSet = new Set((walletStocks || []).map((s) => s.ticker));
  const walletOpts = (walletStocks || []).map((s) => {
    const val = `${s.ticker}|${s.address}|${s.decimals || 8}|${s.nav || 0}`;
    return `<option value="${esc(val)}">${esc(s.ticker)} (In Wallet: ${s.balance.toFixed(5)})</option>`;
  }).join('');
  const fallbackTickers = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'MSTR', 'COIN'];
  const otherOpts = (allStocks || [])
    .filter((s) => fallbackTickers.includes(s.ticker) && !heldSet.has(s.ticker))
    .map((s) => {
      const val = `${s.ticker}|${s.address}|${s.decimals || 8}|${s.nav || 0}`;
      return `<option value="${esc(val)}">${esc(s.ticker)} (Base Stock)</option>`;
    }).join('');
  const stockOpts = `${walletOpts ? `<optgroup label="Stocks In Your Wallet">${walletOpts}</optgroup>` : ''}${otherOpts ? `<optgroup label="Base Tokenized Stocks">${otherOpts}</optgroup>` : ''}`;

  return `
    <form id="tm-post-form" class="lp-form" style="margin-top:10px">
      <p class="lp-desc">Work in BaseCity, Get Paid in Stocks or USDC on Base. Pay directly from your connected wallet with USDC or any stock you hold.</p>
      <label class="lp-field"><span class="lp-lbl">Task Title</span>
        <input name="title" required minlength="4" maxlength="120" placeholder="e.g. Test BaseCity swap flow or publish an X thread" />
      </label>
      <div class="lp-grid">
        <label class="lp-field"><span class="lp-lbl">Task Mode</span>
          <select name="mode">
            <option value="bounty">Bounty (Open Competition)</option>
            <option value="claim">Claim (1 Exclusive Worker)</option>
          </select>
        </label>
        <label class="lp-field"><span class="lp-lbl">Worker Audience</span>
          <select name="audience">
            <option value="all">Open to All (Citizen + Agent)</option>
            <option value="citizen">Citizen Only (Human)</option>
            <option value="agent">Blocky Agent (A2A)</option>
          </select>
        </label>
      </div>
      <div class="lp-grid">
        <label class="lp-field"><span class="lp-lbl">Category</span>
          <select name="category">
            <option value="Research">Research</option>
            <option value="Builder">Builder</option>
            <option value="Onchain">Onchain</option>
            <option value="Content">Content</option>
            <option value="Design">Design</option>
          </select>
        </label>
        <label class="lp-field"><span class="lp-lbl">Deadline</span>
          <select name="expiryHours">
            <option value="0.25">15 Minutes (Fast Agent)</option>
            <option value="1">1 Hour</option>
            <option value="6">6 Hours</option>
            <option value="24" selected>24 Hours</option>
            <option value="72">3 Days (72h)</option>
            <option value="168">7 Days</option>
          </select>
        </label>
      </div>
      <div class="lp-grid">
        <label class="lp-field"><span class="lp-lbl">Reward Asset (From Wallet)</span>
          <select name="rewardAsset" id="tm-reward-asset">
            <option value="USDC|${BASE_USDC}|6|1">USDC (Base)</option>
            ${stockOpts}
          </select>
        </label>
        <label class="lp-field"><span class="lp-lbl">Reward Amount</span>
          <input name="rewardAmount" id="tm-reward-amt" type="number" min="0.00001" max="100000" step="any" value="1" required />
        </label>
      </div>
      <div class="lp-grid">
        <label class="lp-field"><span class="lp-lbl">Evaluator</span>
          <select name="evaluator">
            ${EVALUATOR_MODES.map((e) => `<option value="${esc(e.id)}">${esc(e.label)}</option>`).join('')}
          </select>
        </label>
        <label class="lp-field"><span class="lp-lbl">Worker Gate</span>
          <select name="gate">
            ${GATE_MODES.map((g) => `<option value="${esc(g.id)}">${esc(g.label)}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="lp-field"><span class="lp-lbl">Brief</span>
        <textarea name="brief" rows="3" required minlength="10" maxlength="1200" style="width:100%;padding:10px 12px;border-radius:4px;border:1px solid #262a33;background:#0d0e11;color:#f5f7fb;font:600 13px Inter,sans-serif" placeholder="Explain clearly what the Citizen or Blocky Agent must deliver to earn the reward..."></textarea>
      </label>
      <label class="lp-field"><span class="lp-lbl">Locked Acceptance Criteria (for Evaluator)</span>
        <textarea name="criteria" rows="2" maxlength="800" style="width:100%;padding:10px 12px;border-radius:4px;border:1px solid #262a33;background:#0d0e11;color:#f5f7fb;font:600 13px Inter,sans-serif" placeholder="e.g. Include NVDA live NAV price, 24h volume, bullish/bearish thesis, and Basescan or source link."></textarea>
      </label>
      <label class="tm-criteria-box" style="display:flex;align-items:center;gap:8px;cursor:${escrowConfigured() ? 'pointer' : 'default'}">
        <input type="checkbox" name="useEscrow" ${escrowConfigured() ? 'checked' : 'disabled'} style="width:auto;margin:0" />
        <span><b>Lock Reward Onchain (BaseCityTaskEscrow)</b> — ${escrowConfigured() ? 'Locks the reward on Base. If you judge your own task you can pick a winner but not reject submitted work; 3 days after the deadline with no decision, the first worker is paid. The 3% fee goes to BaseCityFlywheel.' : 'Deploy contract on <a href="/deploy.html" style="color:#93c5fd">/deploy.html</a> and set VITE_TASK_ESCROW_ADDRESS to enable.'}</span>
      </label>
      <div class="tm-post-foot">
        <span>Requester: <code>${esc(shortAddr(account))}</code></span>
        <button type="submit" class="btn primary">Sign & Post Task</button>
      </div>
      <div id="tm-post-msg" class="lp-msg" hidden></div>
    </form>`;
}

export { rejected };
