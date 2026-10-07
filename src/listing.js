// "List on OpenSea" from the claim page: Seaport listings built and signed in the wallet with
// OpenSea's SDK (loaded only when used), posted through /api/os (api/opensea.js, which holds the API
// key). The first listing asks the wallet to approve OpenSea for the collection once (a transaction);
// then one signature lists one Blocky, or all of them at once. Listings last `days` and include the
// collection's creator earnings.
import { createPublicClient, createWalletClient, custom, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { Buffer } from 'buffer/';
import { toBase, sendTx, waitTx } from './wallet.js';

globalThis.Buffer ??= Buffer; // the SDK's merkle trees (bulk listings) expect Node's Buffer

const RPC = 'https://mainnet.base.org';
const CONDUIT = '0x1E0049783F008A0085193E00003D00cd54003c71'; // OpenSea's conduit: what a Seaport listing transfers through
const ERC721 = [
  { type: 'function', name: 'isApprovedForAll', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'setApprovalForAll', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [] },
];

// The one-time approval, sent the same way as a claim (the wallet's own eth_sendTransaction), so the
// SDK finds the collection approved and only asks for the listing signature.
async function approve({ publicClient, provider, account, contract, onStep }) {
  const ok = await publicClient.readContract({ address: contract, abi: ERC721, functionName: 'isApprovedForAll', args: [account, CONDUIT] });
  if (ok) return;
  onStep?.('Approve OpenSea for BaseCity Blockies in your wallet (once, a few cents)…');
  const hash = await sendTx(provider, { from: account, to: contract, data: encodeFunctionData({ abi: ERC721, functionName: 'setApprovalForAll', args: [CONDUIT, true] }) });
  onStep?.('Waiting for the approval…');
  const r = await waitTx(hash, provider);
  if (r.ok === false) throw new Error('The approval transaction failed');
  for (let i = 0; i < 10 && !(await publicClient.readContract({ address: contract, abi: ERC721, functionName: 'isApprovedForAll', args: [account, CONDUIT] })); i++) await new Promise((d) => setTimeout(d, 1500));
}

// An error in words, with the contract call behind it when there is one (ethers' CALL_EXCEPTION)
const NAMES = { '0xf07ec373': 'getCounter', '0xe985e9c5': 'isApprovedForAll', '0x6352211e': 'ownerOf', '0xa22cb465': 'setApprovalForAll', '0x70a08231': 'balanceOf', '0x01ffc9a7': 'supportsInterface', '0xf47b7740': 'information', '0x46423aa7': 'getOrderStatus' };
export function explain(e) {
  const msg = e?.shortMessage || e?.message || String(e);
  const tx = e?.transaction || e?.info?.transaction;
  if (!tx?.to) return msg;
  const sel = String(tx.data || '').slice(0, 10);
  return `${msg} (${e.action || 'call'} ${NAMES[sel] || sel} on ${tx.to.slice(0, 6)}…${tx.to.slice(-4)})`;
}

// items: [{ n, eth }]. Returns { listed: [n...], failed: [{ n, error }] }.
export async function listOnOpenSea({ provider, account, contract, items, days = 7, onProgress, onStep }) {
  await toBase(provider);
  const { OpenSeaSDK, Chain } = await import('@opensea/sdk/viem');
  const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
  const walletClient = createWalletClient({ chain: base, transport: custom(provider), account });
  const sdk = new OpenSeaSDK({ publicClient, walletClient, rpcUrl: RPC }, { chain: Chain.Base, apiKey: 'basecity', apiBaseUrl: `${location.origin}/api/os` });
  await approve({ publicClient, provider, account, contract, onStep });
  onStep?.(items.length > 1 ? `Sign once to list ${items.length} Blockies…` : 'Sign the listing in your wallet…');
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
