// Wallet-signed actions for BaseCity's write APIs (tasks, stock intel, game saves). One message format,
// built the same way in the browser (which signs it) and on the server (which rebuilds it from the body
// it received and checks the signature against that), so a signature can't be reused for a different
// action, task, wallet or text. No transaction, no gas: it's an ordinary personal_sign.
import { keccak256, toHex } from 'viem';

export const FRESH_MS = 10 * 60000; // a signature is good for 10 minutes
const f = (v) => String(v ?? '').trim();
export const digest = (values) => keccak256(toHex(JSON.stringify(values.map(f))));

export function actionMessage(domain, action, wallet, lines, values, issuedAt) {
  return [domain, `action: ${action}`, `wallet: ${f(wallet).toLowerCase()}`, ...lines, `fields: ${digest(values)}`, `issued: ${issuedAt}`, 'Signing posts this action. No transaction, no gas.'].join('\n');
}

// ---- BaseCity Tasks (api/city-tasks.js) ----
export const TASK_FIELDS = {
  create: ['title', 'brief', 'category', 'mode', 'audience', 'expiryHours', 'rewardToken', 'rewardTokenAddress', 'rewardDecimals', 'rewardAmount', 'rewardUsdc', 'evaluator', 'gate', 'criteria'],
  claim: ['taskId', 'blockyName', 'actorType'],
  unclaim: ['taskId'],
  submit: ['taskId', 'blockyName', 'actorType', 'agentId', 'summary', 'proofUrl'],
  evaluate: ['taskId', 'submissionId'],
  cancel: ['taskId'],
};
// approve needs no signature: the on-chain payment from the requester to the worker is the proof
export const taskWallet = (action, b) => (action === 'create' || action === 'cancel' ? b.requester : action === 'evaluate' ? (b.caller || b.requester || b.worker) : b.worker);
export function taskMessage(action, b, issuedAt) {
  const keys = TASK_FIELDS[action];
  if (!keys) throw new Error('Unknown task action');
  const lines = [];
  if (b.taskId) lines.push(`task: ${f(b.taskId)}`);
  if (action === 'create') lines.push(`title: ${f(b.title).slice(0, 120)}`, `reward: ${f(b.rewardAmount ?? b.rewardUsdc)} ${f(b.rewardToken) || 'USDC'}`);
  return actionMessage('BaseCity task v1', action, taskWallet(action, b), lines, keys.map((k) => b[k]), issuedAt);
}

// ---- Stock Intel (api/stock-intel.js): publishing ----
export const INTEL_FIELDS = ['ticker', 'stance', 'title', 'preview', 'fullReport', 'priceUsdc', 'blockyName'];
export const intelMessage = (b, issuedAt) => actionMessage('BaseCity intel v1', 'publish', b.author, [`ticker: ${f(b.ticker).toUpperCase()}`, `title: ${f(b.title).slice(0, 100)}`, `price: ${f(b.priceUsdc)} USDC`], INTEL_FIELDS.map((k) => b[k]), issuedAt);

// The author takes their own report down. Bound to the report id, so the signature can't remove any other.
export const intelRemoveMessage = (b, issuedAt) => actionMessage('BaseCity intel v1', 'remove', b.author, [`report: ${f(b.id)}`], [b.id], issuedAt);

// ---- Game Mode saves (api/rpg-state.js): one signature opens a 24-hour save session ----
export const rpgMessage = (wallet, issuedAt) => ['BaseCity game save v1', `wallet: ${f(wallet).toLowerCase()}`, `issued: ${issuedAt}`, 'Signing lets this browser save your Game Mode progress for 24 hours. No transaction, no gas.'].join('\n');
