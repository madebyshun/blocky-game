// BaseCity x402 v2 Server Helper (coinbase/x402 v2, "exact" scheme on Base Mainnet eip155:8453).
// Builds HTTP 402 Payment Required challenges and verifies EIP-3009 TransferWithAuthorization
// signatures from `PAYMENT-SIGNATURE` / `X-PAYMENT` headers using viem.
import { recoverTypedDataAddress } from 'viem';

export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BASE_NETWORK = 'eip155:8453';

export function buildRequirement({ payTo, amountUsdc, resource }) {
  const units = String(Math.max(1000, Math.round(Number(amountUsdc || 0.1) * 1e6)));
  return {
    scheme: 'exact',
    network: BASE_NETWORK,
    asset: BASE_USDC,
    amount: units,
    payTo: String(payTo).toLowerCase(),
    maxTimeoutSeconds: 300,
    extra: { name: 'USD Coin', version: '2' },
    resource: resource || null,
  };
}

export function decodePaymentHeader(req) {
  const raw = req.headers?.['payment-signature'] || req.headers?.['x-payment'] || '';
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export async function verifyX402Payment(payload, expected) {
  const { accepted, payload: p } = payload || {};
  if (!accepted || !p?.authorization || !p?.signature) return { ok: false, error: 'Missing x402 payment payload.' };
  const auth = p.authorization;
  if (String(accepted.network) !== BASE_NETWORK) return { ok: false, error: 'Wrong network (Base Mainnet required).' };
  if (String(accepted.asset || '').toLowerCase() !== BASE_USDC.toLowerCase()) return { ok: false, error: 'USDC on Base required.' };
  if (String(auth.to || '').toLowerCase() !== String(expected.payTo).toLowerCase()) return { ok: false, error: 'Payment recipient mismatch.' };
  if (BigInt(auth.value || '0') < BigInt(expected.amount)) return { ok: false, error: 'Payment amount too low.' };
  const nowSec = Math.floor(Date.now() / 1000);
  if (Number(auth.validBefore || 0) <= nowSec) return { ok: false, error: 'x402 authorization expired.' };

  try {
    const recovered = await recoverTypedDataAddress({
      domain: {
        name: accepted.extra?.name || 'USD Coin',
        version: accepted.extra?.version || '2',
        chainId: 8453,
        verifyingContract: BASE_USDC,
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
        from: auth.from,
        to: auth.to,
        value: BigInt(auth.value),
        validAfter: BigInt(auth.validAfter),
        validBefore: BigInt(auth.validBefore),
        nonce: auth.nonce,
      },
      signature: p.signature,
    });
    if (recovered.toLowerCase() !== String(auth.from).toLowerCase()) {
      return { ok: false, error: 'Invalid EIP-3009 signature.' };
    }
    return { ok: true, payer: recovered.toLowerCase(), value: String(auth.value), nonce: auth.nonce };
  } catch (e) {
    return { ok: false, error: e?.message || 'Could not verify x402 signature.' };
  }
}

export function send402(res, requirement) {
  return res.status(402).json({
    x402Version: 2,
    error: 'Payment Required',
    accepts: [requirement],
  });
}
