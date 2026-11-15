// x402 payments, signed in the owner's own wallet (spec: coinbase/x402 v2, "exact" scheme on EVM).
// Used by the Blocky Agent (src/blockyagent.js): the server relays a job call, Blue Agent answers 402
// with an `accepts` list, the wallet signs an EIP-3009 transferWithAuthorization for the USDC amount,
// and the same call is retried with that payment attached. No key ever reaches the server, and the USDC
// moves straight from the owner's wallet to Blue Agent's payTo address.
//
// Transport (specs/transports-v2/http.md):
//   client -> server  PAYMENT-SIGNATURE: base64(JSON PaymentPayload)
//   server -> client  PAYMENT-RESPONSE:  base64(JSON SettlementResponse)
// Blue Agent happens to also accept the older X-PAYMENT name for the same value, and its own responses
// carry `_settle` in the body; both are read.
import { hexToSignature, recoverTypedDataAddress } from 'viem';

const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

// a single-use 32-byte nonce, as EIP-3009 wants it
export function randomNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// The EIP-712 shape of the USDC transfer the payment authorises.
export function transferTypedData({ requirement, authorization, chainId }) {
  return {
    domain: {
      name: requirement.extra?.name || 'USD Coin',
      version: requirement.extra?.version || '2',
      chainId,
      verifyingContract: requirement.asset,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  };
}

// What the wallet signs: the authorization's fields, as the strings the JSON-RPC call carries.
export function authorizationOf(requirement, from, now = Date.now(), nonce = randomNonce()) {
  return {
    from,
    to: requirement.payTo,
    value: String(requirement.amount),
    validAfter: '0',
    validBefore: String(Math.floor(now / 1000) + (requirement.maxTimeoutSeconds ?? 120)),
    nonce,
  };
}

const chainOf = (network) => Number(String(network || '').split(':')[1]);

// The PaymentPayload the header carries: the requirement it accepts, the signed authorization, and
// the signature over it.
export function paymentPayload({ requirement, authorization, signature, resource = null, version = 2 }) {
  return {
    x402Version: version,
    ...(resource ? { resource } : {}),
    accepted: requirement,
    payload: { signature, authorization },
  };
}

// USDC's EIP-3009 verifies with a plain ecrecover, so it only accepts a signature from a key that is
// the account. An EIP-7702 delegated account (bytecode `0xef0100 || address`, which Coinbase Smart
// Wallet and many newer wallets now use) is not: its typed-data signature comes from a session key, so
// ecrecover never recovers the account and the token reverts with "FiatTokenV2: invalid signature".
// Unlike Permit2, EIP-3009 has no contract-signature path. So the payment cannot be made from that
// wallet at all — say so, instead of sending a signature that is certain to fail.
const DELEGATED = /^0xef0100/;
export const isDelegated = async (address, rpc = 'https://mainnet.base.org') => {
  try {
    const r = await fetch(rpc, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }),
    });
    const code = (await r.json())?.result || '0x';
    return DELEGATED.test(code);
  } catch { return false; } // can't tell: let the payment try, the error will explain it
};

export class Eip3009Unsupported extends Error {
  constructor() {
    super('This wallet signs with EIP-7702 delegation, and USDC\'s EIP-3009 can only verify a plain key signature, so it cannot pay for a job. Use a standard EOA wallet (or a smart wallet with Permit2 support) for Blocky Agent payments.');
    this.name = 'Eip3009Unsupported';
    this.code = 'EIP3009_UNSUPPORTED';
  }
}

// Sign one x402 requirement with the connected wallet and return the header value.
// `signTypedData` is the wallet's own signer: provider.request('eth_signTypedData_v4', …) in a browser,
// or a viem account's signTypedData in a test.
export async function payRequirement({ requirement, from, resource = null, signTypedData, now = Date.now(), checkWallet = true }) {
  if (!requirement?.payTo || !requirement?.asset) throw new Error('This job did not say where to pay');
  const chainId = chainOf(requirement.network);
  if (!Number.isInteger(chainId)) throw new Error(`Unsupported payment network: ${requirement.network}`);
  // a delegated wallet can never satisfy EIP-3009: stop before making the owner sign something useless
  if (checkWallet && await isDelegated(from, rpcFor(chainId))) throw new Eip3009Unsupported();
  const authorization = authorizationOf(requirement, from, now);
  const typed = transferTypedData({ requirement, authorization, chainId });
  const signature = await signTypedData(typed);
  const payload = paymentPayload({ requirement, authorization: { ...authorization }, signature, resource });
  return b64(JSON.stringify(payload));
}

// The chain's code is read from a public RPC: Base mainnet for now (the only network Blue Agent prices).
const rpcFor = (id) => (id === 8453 ? 'https://mainnet.base.org' : 'https://mainnet.base.org');

// Sign with a wallet provider's JSON-RPC (EOAs and Coinbase Smart Wallet both answer eth_signTypedData_v4)
export const providerSigner = (provider, account) => async (typed) => {
  const json = JSON.stringify(typed, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  return provider.request({ method: 'eth_signTypedData_v4', params: [account, json] });
};

// Check a payload the way the facilitator does: the signature recovers to `authorization.from`.
export async function verifyPayload(payload) {
  const { accepted, payload: p } = payload || {};
  if (!accepted || !p?.authorization || !p?.signature) return false;
  const chainId = chainOf(accepted.network);
  try {
    const typed = transferTypedData({ requirement: accepted, authorization: p.authorization, chainId });
    const who = await recoverTypedDataAddress({ ...typed, signature: p.signature });
    return who.toLowerCase() === String(p.authorization.from).toLowerCase();
  } catch { return false; }
}

export const decodeHeader = (v) => {
  try { return JSON.parse(decodeURIComponent(escape(atob(v)))); } catch { return null; }
};
void hexToSignature;
