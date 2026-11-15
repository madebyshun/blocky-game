// x402 payments (src/x402.js): the EIP-712 authorization the wallet signs, and the payload header.
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { payRequirement, verifyPayload, authorizationOf, transferTypedData, paymentPayload, decodeHeader, randomNonce } from '../src/x402.js';

// Blue Agent's real requirements, from a live 402 on /api/x402/base-stock-quote
const REQ = {
  scheme: 'exact',
  network: 'eip155:8453',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  amount: '20000',
  payTo: '0x02950ad38ada1d599375bd447e080cd404809205',
  maxTimeoutSeconds: 120,
  extra: { name: 'USD Coin', version: '2' },
};

const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);

// base64 as the header carries it (btoa in a browser; Buffer here)
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
globalThis.btoa ??= (s) => b64(s);
globalThis.atob ??= (v) => Buffer.from(v, 'base64').toString('binary');
globalThis.unescape ??= (s) => s;

// the authorization is built from the requirement, not invented
const when = 1_700_000_000_000;
const a = authorizationOf(REQ, account.address, when);
assert.equal(a.from, account.address);
assert.equal(a.to, REQ.payTo, 'the money goes exactly where Blue Agent asked');
assert.equal(a.value, '20000', 'atomic units, unrounded');
assert.equal(a.validAfter, '0');
assert.equal(a.validBefore, String(Math.floor(when / 1000) + 120));
assert.match(a.nonce, /^0x[0-9a-f]{64}$/);
assert.notEqual(randomNonce(), randomNonce(), 'each payment gets a fresh single-use nonce');

// the EIP-712 domain comes from the token's own metadata
const typed = transferTypedData({ requirement: REQ, authorization: a, chainId: 8453 });
assert.equal(typed.domain.name, 'USD Coin');
assert.equal(typed.domain.version, '2');
assert.equal(typed.domain.chainId, 8453);
assert.equal(typed.domain.verifyingContract, REQ.asset);
assert.deepEqual(typed.types.TransferWithAuthorization.map((f) => `${f.name}:${f.type}`),
  ['from:address', 'to:address', 'value:uint256', 'validAfter:uint256', 'validBefore:uint256', 'nonce:bytes32']);
assert.equal(typed.message.value, 20000n);

// the whole flow: sign with a real key, decode the header, verify it recovers the payer
const header = await payRequirement({
  requirement: REQ, from: account.address, now: when, checkWallet: false, // no network in this test
  signTypedData: (t) => account.signTypedData(t),
});
const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
assert.equal(decoded.x402Version, 2);
assert.deepEqual(decoded.accepted, REQ, 'the payload echoes the requirement it accepts');
assert.equal(decoded.payload.authorization.from, account.address);
assert.equal(await verifyPayload(decoded), true, 'the signature recovers to the payer');

// a tampered amount must not verify: same signature, different value
const tampered = { ...decoded, payload: { ...decoded.payload, authorization: { ...decoded.payload.authorization, value: '99999999' } } };
assert.equal(await verifyPayload(tampered), false, 'changing the amount breaks the signature');

// a payment that sends somewhere else must not verify either
const other = { ...decoded, payload: { ...decoded.payload, authorization: { ...decoded.payload.authorization, to: '0x' + '9'.repeat(40) } } };
assert.equal(await verifyPayload(other), false, 'changing the payee breaks the signature');

// bad input is refused, not silently mis-signed
await assert.rejects(() => payRequirement({ requirement: { ...REQ, payTo: null }, from: account.address, checkWallet: false, signTypedData: (t) => account.signTypedData(t) }), /where to pay/);
await assert.rejects(() => payRequirement({ requirement: { ...REQ, network: 'nope' }, from: account.address, checkWallet: false, signTypedData: (t) => account.signTypedData(t) }), /Unsupported payment network/);

// decodeHeader round-trips
assert.deepEqual(decodeHeader(header), decoded);
assert.equal(decodeHeader('not-base64-!!'), null);
void paymentPayload;


// EIP-3009 has no contract-signature path: an EIP-7702 delegated wallet can never pay, so the flow
// refuses before the owner signs instead of producing a signature USDC will reject.
{
  const { isDelegated, Eip3009Unsupported, payRequirement } = await import('../src/x402.js');
  const fakeFetch = (code) => async () => ({ json: async () => ({ result: code }) });
  const real = globalThis.fetch;
  globalThis.fetch = fakeFetch('0xef0100' + 'ab'.repeat(20)); // delegated
  assert.equal(await isDelegated('0x' + '1'.repeat(40)), true);
  let signed = 0;
  await assert.rejects(
    () => payRequirement({ requirement: REQ, from: account.address, signTypedData: async () => { signed++; return '0x'; } }),
    (e) => e instanceof Eip3009Unsupported && e.code === 'EIP3009_UNSUPPORTED');
  assert.equal(signed, 0, 'a delegated wallet is refused before it is asked to sign');

  globalThis.fetch = fakeFetch('0x60806040'); // ordinary contract / EOA bytecode
  assert.equal(await isDelegated('0x' + '1'.repeat(40)), false);

  globalThis.fetch = fakeFetch('0x'); // plain EOA
  assert.equal(await isDelegated('0x' + '1'.repeat(40)), false);
  const header2 = await payRequirement({ requirement: REQ, from: account.address, signTypedData: (t) => account.signTypedData(t) });
  assert.ok(await verifyPayload(decodeHeader(header2)), 'a plain EOA still pays normally');
  globalThis.fetch = real;
}

console.log('x402: all checks pass');
