// Blocky Agent: a citizen that has been claimed and activated can take paid jobs on Base and earn USDC.
// Brief: docs/BLOCKY-AGENT.md. Phase 1 jobs read NVIDIA/NVDAc data from Blue Agent's x402 API
// (https://blueagent.dev); the owner signs for the USDC and receives it in their own wallet.
//
// This module is the browser side (the claim page and the Blocky card). The server side is
// api/agent.js (state in KV) and api/blueagent.js (the x402 proxy, which holds no keys).

import { payRequirement, payWithPermit2, chooseRequirement, methodOf } from './x402.js';

export const AGENT_JOBS = [
  {
    id: 'nvda-quote',
    title: 'NVDAc quote',
    blurb: "Base pool price, 24 h change, liquidity and how far the pool sits from Chainlink's NAV: the number a trader needs before moving NVDAc.",
    price: 0.02,
    tool: 'base-stock-quote',
  },
  {
    id: 'nvda-screen',
    title: 'NVDAc drift screen',
    blurb: 'Screens every tokenized stock on Base for drift from its oracle price and flags NVDAc: the risk read for a portfolio holding it.',
    price: 0.02,
    tool: 'stock-screen',
  },
  {
    id: 'stock-movers',
    title: 'Stock movers',
    blurb: 'The tokenized stocks moving most on Base right now, by volume and liquidity: the daily brief.',
    price: 0.03,
    tool: 'base-stock-movers',
  },
];

export const jobById = (id) => AGENT_JOBS.find((j) => j.id === id) || null;

// The server holds no key and pays nothing: every job asks for a few cents of USDC, and the owner's own
// wallet signs it (src/x402.js). An unpaid call answers 402, which the job flow turns into one prompt.
const api = (path, opts) => fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts?.headers || {}) } });

// The agent's state for a wallet: { enabled, agents: { [tokenId]: { active, jobsDone, earnedUsdc, lastJobAt } },
// totals } . Never throws: the page shows "off" instead.
export async function loadAgentState(address) {
  try {
    const r = await api(`/api/agent?address=${encodeURIComponent(address)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Turn the agent on for one claimed Blocky. The wallet signs a short message (no transaction, no gas):
// this proves the caller holds the token, and only the holder can switch their own agent on.
// The message a wallet signs for an agent switch. Readable in the wallet, exact on the server
// (api/agent.js parses the same three fields).
export const agentMessage = (kind, tokenId, address) =>
  `BaseCity: ${kind} Blocky Agent\n\nBlocky #${tokenId}\nWallet ${String(address).toLowerCase()}\n\n${
    kind === 'activate'
      ? 'This switches the agent on for this Blocky: it can take paid jobs and earn USDC in your own wallet.'
      : 'This switches the agent off for this Blocky.'} No transaction, no gas.`;

export async function activateAgent({ address, tokenId, sign }) {
  const message = agentMessage('activate', tokenId, address);
  const signature = await sign(message);
  const r = await api('/api/agent', { method: 'POST', body: JSON.stringify({ address, tokenId, signature, message }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Could not activate the agent');
  return j;
}

export async function deactivateAgent({ address, tokenId, sign }) {
  const message = agentMessage('deactivate', tokenId, address);
  const signature = await sign(message);
  const r = await api('/api/agent', { method: 'PUT', body: JSON.stringify({ address, tokenId, signature, message }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Could not switch the agent off');
  return j;
}

// Run one job. The server checks the agent is on and owns the token, then calls Blue Agent.
// Blue Agent answers 402 with an accepts list; the owner's wallet signs one of them (src/x402.js) and the
// same call is retried with that payment. Permit2 is preferred when offered — it is the only method a
// smart account (EIP-7702) can satisfy, and plain wallets sign it just as well. EIP-3009 needs a plain
// key, so a delegated wallet is told why instead of being asked for a signature that cannot work.
export async function runJob({ address, tokenId, jobId, args = {}, signTypedData = null }) {
  const call = (payment) => api('/api/agent', {
    method: 'POST',
    headers: { 'x-agent-action': 'run' },
    body: JSON.stringify({ address, tokenId, jobId, args, payment }),
  });

  let r = await call(null);
  let j = await r.json().catch(() => ({}));
  if (r.status === 402 && j.payment && signTypedData) {
    const requirement = chooseRequirement(j.payment?.accepts || []);
    if (!requirement) throw new Error('The job asked for payment but did not say where to pay');
    const payment = methodOf(requirement) === 'permit2'
      ? await payWithPermit2({ requirement, from: address, signTypedData, resource: j.payment?.resource })
      : await payRequirement({ requirement, from: address, signTypedData, resource: j.payment?.resource });
    r = await call(payment);
    j = await r.json().catch(() => ({}));
  }
  if (!r.ok) {
    const err = new Error(j.error || 'The job failed');
    err.paymentRequired = r.status === 402 ? j.payment : null;
    // Permit2 needs a one-time ERC-20 approval; the 402 detail says insufficient_funds when it's missing
    const detail = j.payment?.detail || j.payment?.invalidReason || '';
    err.code = /insufficient_funds|permit2/i.test(JSON.stringify(detail)) ? 'PERMIT2_APPROVAL' : err.code;
    throw err;
  }
  return j;
}
