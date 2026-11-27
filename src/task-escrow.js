// Shared ABI, hashing helpers & onchain client for BaseCityTaskEscrow.sol (Base Mainnet).
import { createPublicClient, encodeFunctionData, erc20Abi, fallback, getAddress, http, isAddress, keccak256, parseEventLogs, parseUnits, toHex, zeroHash } from 'viem';
import { base } from 'viem/chains';
import { sendTx, waitTx, toBase } from './wallet.js';
import { withBuilderCode } from './attribution.js';

export const TASK_ESCROW_ADDRESS = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TASK_ESCROW_ADDRESS) || ''; // empty = escrow off, until a v2 contract is deployed

export const escrowConfigured = () => isAddress(TASK_ESCROW_ADDRESS, { strict: false });

export const EVALUATOR_MODES = [
  { id: 'self', label: 'Self-Approve (Requester)', short: 'SELF EVAL', desc: 'Requester reviews submissions and releases reward.' },
  { id: 'stock-verifier', label: 'Stock Rules Check (advisory)', short: 'RULES CHECK', desc: 'Automatic checks of the submission against live Base stock data: ticker, figures, NAV, sources. A guide for you, not a judge: you still release the payment.' },
  { id: 'ai-jury', label: 'Three-Check Review (advisory)', short: '3-CHECK REVIEW', desc: 'Three simple checks: criteria words, evidence, quality. A guide for you, not a judge: you still release the payment.' },
];

export const GATE_MODES = [
  { id: 'open', code: 0, label: 'Open (Any Base Wallet)', short: 'OPEN' },
  { id: 'blocky-nft', code: 1, label: 'Blocky NFT Holders Only', short: 'NFT GATE' },
  { id: 'erc8004-agent', code: 2, label: 'ERC-8004 Verified Agents Only', short: 'AGENT GATE' },
];

export function hashCriteria({ title = '', brief = '', criteria = '', evaluator = 'self', gate = 'open' } = {}) {
  const payload = JSON.stringify({
    v: 1,
    title: String(title).trim(),
    brief: String(brief).trim(),
    criteria: String(criteria).trim(),
    evaluator: String(evaluator).trim(),
    gate: String(gate).trim(),
  });
  return keccak256(toHex(payload));
}

export function hashDelivery({ taskId = '', worker = '', summary = '', proofUrl = '' } = {}) {
  const payload = JSON.stringify({
    v: 1,
    taskId: String(taskId).trim(),
    worker: String(worker).trim().toLowerCase(),
    summary: String(summary).trim(),
    proofUrl: String(proofUrl).trim(),
  });
  return keccak256(toHex(payload));
}

export const TASK_ESCROW_ABI = [
  {
    type: 'function',
    name: 'createTask',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'evaluator', type: 'address' },
      { name: 'deadline', type: 'uint64' },
      { name: 'mode', type: 'uint8' },
      { name: 'gate', type: 'uint8' },
      { name: 'criteriaHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'taskId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimTask',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'taskId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unclaimTask',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'taskId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'submitWork',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'taskId', type: 'uint256' },
      { name: 'deliveryHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'complete',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'taskId', type: 'uint256' },
      { name: 'winner', type: 'address' },
      { name: 'attestationHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'reject',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'taskId', type: 'uint256' },
      { name: 'reasonHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refundExpired',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'taskId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'settleDefault',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'taskId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelTask',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'taskId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'feeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    type: 'event',
    name: 'TaskCreated',
    inputs: [
      { indexed: true, name: 'taskId', type: 'uint256' },
      { indexed: true, name: 'requester', type: 'address' },
      { indexed: true, name: 'evaluator', type: 'address' },
      { indexed: false, name: 'token', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'deadline', type: 'uint64' },
      { indexed: false, name: 'mode', type: 'uint8' },
      { indexed: false, name: 'gate', type: 'uint8' },
      { indexed: false, name: 'criteriaHash', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'TaskCompleted',
    inputs: [
      { indexed: true, name: 'taskId', type: 'uint256' },
      { indexed: true, name: 'evaluator', type: 'address' },
      { indexed: true, name: 'winner', type: 'address' },
      { indexed: false, name: 'workerPayout', type: 'uint256' },
      { indexed: false, name: 'flywheelFee', type: 'uint256' },
      { indexed: false, name: 'attestationHash', type: 'bytes32' },
    ],
  },
];

let _pubClient = null;
function pubClient() {
  if (!_pubClient) {
    _pubClient = createPublicClient({
      chain: base,
      transport: fallback([
        http('https://base-rpc.publicnode.com'),
        http('https://mainnet.base.org'),
      ]),
    });
  }
  return _pubClient;
}

export async function lockTaskEscrow({
  provider, account, tokenAddress, amount, decimals = 6,
  evaluatorAddress, expiryHours = 24, mode = 'bounty', gate = 'open',
  criteriaHash = zeroHash, onStatus,
}) {
  if (!escrowConfigured()) throw new Error('BaseCityTaskEscrow contract is not configured yet (set VITE_TASK_ESCROW_ADDRESS).');
  const escrow = getAddress(TASK_ESCROW_ADDRESS);
  const token = getAddress(tokenAddress);
  const owner = getAddress(account);
  const evalAddr = getAddress(evaluatorAddress || account);
  const units = parseUnits(String(amount).replace(',', '.'), Number(decimals) || 6);
  if (units <= 0n) throw new Error('Escrow reward amount must be greater than zero.');

  await toBase(provider);

  onStatus?.('Checking token allowance for BaseCity Task Escrow...');
  const allowance = await pubClient().readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, escrow],
  }).catch(() => 0n);

  if (allowance < units) {
    onStatus?.('Approve token spend for BaseCity Task Escrow in your wallet...');
    const appData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [escrow, units] });
    const appHash = await sendTx(provider, withBuilderCode({ from: owner, to: token, data: appData }));
    onStatus?.('Waiting for approval confirmation on Base...');
    const appRes = await waitTx(appHash, provider);
    if (appRes.ok === false) throw new Error('Token approval reverted on Base.');
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.max(900, Math.round((Number(expiryHours) || 24) * 3600)));
  const modeCode = mode === 'claim' ? 1 : 0;
  const gateCode = GATE_MODES.find((g) => g.id === gate)?.code ?? 0;

  onStatus?.('Confirm onchain escrow lock in your wallet...');
  const data = encodeFunctionData({
    abi: TASK_ESCROW_ABI,
    functionName: 'createTask',
    args: [token, units, evalAddr, deadline, modeCode, gateCode, criteriaHash],
  });
  const txHash = await sendTx(provider, withBuilderCode({ from: owner, to: escrow, data }));
  onStatus?.('Confirming escrow lock on Base...');
  const res = await waitTx(txHash, provider);
  if (res.ok === false) throw new Error('Escrow createTask transaction reverted on Base.');

  let escrowTaskId = null;
  try {
    const logs = parseEventLogs({ abi: TASK_ESCROW_ABI, eventName: 'TaskCreated', logs: res.receipt?.logs || [] });
    if (logs[0]?.args?.taskId != null) escrowTaskId = Number(logs[0].args.taskId);
  } catch { /* fallback if receipt logs missing */ }

  return { escrowTaskId, escrowTxHash: txHash };
}

export async function completeEscrowOnchain({ provider, account, escrowTaskId, winner, attestationHash = zeroHash, onStatus }) {
  if (!escrowConfigured()) throw new Error('BaseCityTaskEscrow contract is not configured.');
  const escrow = getAddress(TASK_ESCROW_ADDRESS);
  const data = encodeFunctionData({
    abi: TASK_ESCROW_ABI,
    functionName: 'complete',
    args: [BigInt(escrowTaskId), getAddress(winner), attestationHash || zeroHash],
  });
  await toBase(provider);
  onStatus?.('Confirm onchain escrow settlement (auto-splits Flywheel fee)...');
  const txHash = await sendTx(provider, withBuilderCode({ from: account, to: escrow, data }));
  onStatus?.('Confirming escrow payout on Base...');
  const res = await waitTx(txHash, provider);
  if (res.ok === false) throw new Error('Escrow complete() reverted (ensure winner submitted onchain or wallet is evaluator).');
  return txHash;
}

export async function refundExpiredEscrowOnchain({ provider, account, escrowTaskId, onStatus }) {
  if (!escrowConfigured()) throw new Error('BaseCityTaskEscrow contract is not configured.');
  const escrow = getAddress(TASK_ESCROW_ADDRESS);
  const data = encodeFunctionData({
    abi: TASK_ESCROW_ABI,
    functionName: 'refundExpired',
    args: [BigInt(escrowTaskId)],
  });
  await toBase(provider);
  onStatus?.('Confirm escrow refund transaction in your wallet...');
  const txHash = await sendTx(provider, withBuilderCode({ from: account, to: escrow, data }));
  onStatus?.('Confirming refund on Base...');
  const res = await waitTx(txHash, provider);
  if (res.ok === false) throw new Error('Escrow refundExpired() reverted (deadline may not have passed yet).');
  return txHash;
}

// Anyone can call this once the deadline plus the 3-day review window has passed with work submitted and nobody
// deciding: the first submitter is paid (requester judged their own task) or the requester is refunded (a third-party
// evaluator went missing).
export async function settleDefaultEscrowOnchain({ provider, account, escrowTaskId, onStatus }) {
  if (!escrowConfigured()) throw new Error('BaseCityTaskEscrow contract is not configured.');
  const escrow = getAddress(TASK_ESCROW_ADDRESS);
  const data = encodeFunctionData({ abi: TASK_ESCROW_ABI, functionName: 'settleDefault', args: [BigInt(escrowTaskId)] });
  await toBase(provider);
  onStatus?.('Confirm the default settlement in your wallet...');
  const txHash = await sendTx(provider, withBuilderCode({ from: account, to: escrow, data }));
  onStatus?.('Confirming settlement on Base...');
  const res = await waitTx(txHash, provider);
  if (res.ok === false) throw new Error('settleDefault() reverted (the review window may still be open, or there is no submission).');
  return txHash;
}
