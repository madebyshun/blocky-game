// "List on OpenSea" from the claim page: Seaport listings built and signed in the wallet with
// OpenSea's SDK (loaded only when used), posted through /api/os (api/opensea.js, which holds the API
// key). The first listing asks the wallet to approve OpenSea for the collection once (a transaction);
// then one signature lists one Blocky, or all of them at once. Listings last `days` and include the
// collection's creator earnings.
import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { base } from 'viem/chains';
import { Buffer } from 'buffer/';
import { toBase } from './wallet.js';

globalThis.Buffer ??= Buffer; // the SDK's merkle trees (bulk listings) expect Node's Buffer

const RPC = 'https://mainnet.base.org';

// items: [{ n, eth }]. Returns { listed: [n...], failed: [{ n, error }] }.
export async function listOnOpenSea({ provider, account, contract, items, days = 7, onProgress }) {
  await toBase(provider);
  const { OpenSeaSDK, Chain } = await import('@opensea/sdk/viem');
  const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
  const walletClient = createWalletClient({ chain: base, transport: custom(provider), account });
  const sdk = new OpenSeaSDK({ publicClient, walletClient, rpcUrl: RPC }, { chain: Chain.Base, apiKey: 'basecity', apiBaseUrl: `${location.origin}/api/os` });
  const expirationTime = Math.floor(Date.now() / 1000) + days * 86400;
  const one = (x) => ({ asset: { tokenAddress: contract, tokenId: String(x.n) }, amount: x.eth, expirationTime, includeOptionalCreatorFees: true });
  if (items.length === 1) {
    await sdk.createListing({ ...one(items[0]), accountAddress: account });
    return { listed: [items[0].n], failed: [] };
  }
  const r = await sdk.createBulkListings({ listings: items.map(one), accountAddress: account, continueOnError: true, onProgress });
  const failedIdx = new Set((r.failed || []).map((f) => f.index));
  return {
    listed: items.filter((_, i) => !failedIdx.has(i)).map((x) => x.n),
    failed: (r.failed || []).map((f) => ({ n: items[f.index]?.n, error: f.error?.message || String(f.error) })),
  };
}
