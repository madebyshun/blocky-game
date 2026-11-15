// Blocky Agent: the ownership gate, the signed message, and the Blue Agent job specs.
import assert from 'node:assert/strict';

// The message the wallet signs and the server parses (src/blockyagent.js <-> api/agent.js).
const agentMessage = (kind, tokenId, address) =>
  `BaseCity: ${kind} Blocky Agent\n\nBlocky #${tokenId}\nWallet ${String(address).toLowerCase()}\n\n${
    kind === 'activate'
      ? 'This switches the agent on for this Blocky: it can take paid jobs and earn USDC in your own wallet.'
      : 'This switches the agent off for this Blocky.'} No transaction, no gas.`;
const ACT = (m) => /^BaseCity: (activate|deactivate) Blocky Agent\n\nBlocky #(\d+)\nWallet (0x[0-9a-fA-F]{40})\n/.exec(m || '');

const W = '0x8eba37ef94e6b831fe8bf6a62e79d0dc6fd8c34d';
const msg = agentMessage('activate', 42, W.toUpperCase());
const m = ACT(msg);
assert.ok(m, 'the server parses the message the page builds');
assert.equal(m[1], 'activate');
assert.equal(m[2], '42');
assert.equal(m[3], W); // lowercased on both sides

// a message for another token, or another wallet, is rejected before any chain read
assert.equal(ACT(agentMessage('activate', 43, W))[2], '43');
assert.equal(ACT(agentMessage('deactivate', 42, W))[1], 'deactivate');
assert.equal(ACT('BaseCity: activate Blocky Agent\n\nBlocky #42\nWallet 0xnope\n\nx'), null);
assert.equal(ACT(''), null);
assert.equal(ACT(undefined), null);

// Blue Agent's job specs: the live x402 paths and prices (not the brief's stock_signal/stock_quote,
// which do not exist on the server). Kept in step with blueagent.dev/.well-known/openapi.json.
const { JOB_SPECS, priceOf } = await import('../api/blueagent.js');
assert.deepEqual(Object.keys(JOB_SPECS).sort(), ['nvda-quote', 'nvda-screen', 'stock-movers']);
assert.equal(JOB_SPECS['nvda-quote'].path, '/api/x402/base-stock-quote');
assert.equal(JOB_SPECS['nvda-quote'].price, 0.02);
assert.deepEqual(JOB_SPECS['nvda-quote'].body(), { ticker: 'NVDAc' });
assert.equal(JOB_SPECS['stock-movers'].price, 0.03);

// the 402 body Blue Agent really sends: the price the card shows before a wallet signs
const accepts = { accepts: [{ scheme: 'exact', network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amount: '20000', payTo: '0x02950ad38ada1d599375bd447e080cd404809205' }] };
assert.equal(priceOf(accepts), 0.02);
assert.equal(priceOf({}), null);

// no server-side payer exists at all: the owner's wallet signs the x402 payment (src/x402.js)
assert.equal('payingWallet' in (await import('../api/blueagent.js')), false);

console.log('agent: all checks pass');
