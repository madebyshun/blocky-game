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

const RPC = `${location.origin}/api/rpc`; // Base reads through BaseCity's RPC (api/rpc.js), not the rate-limited public one
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

const rejectedSig = (e) => e?.code === 4001 || e?.cause?.code === 4001 || /reject|denied|cancel/i.test(e?.message || '');

const SEAPORT = '0x0000000000000068F116a894984e2DB1123eB395';
const ORDER_TYPES = {
  OrderComponents: [
    { name: 'offerer', type: 'address' }, { name: 'zone', type: 'address' }, { name: 'offer', type: 'OfferItem[]' }, { name: 'consideration', type: 'ConsiderationItem[]' },
    { name: 'orderType', type: 'uint8' }, { name: 'startTime', type: 'uint256' }, { name: 'endTime', type: 'uint256' }, { name: 'zoneHash', type: 'bytes32' },
    { name: 'salt', type: 'uint256' }, { name: 'conduitKey', type: 'bytes32' }, { name: 'counter', type: 'uint256' },
  ],
  OfferItem: [{ name: 'itemType', type: 'uint8' }, { name: 'token', type: 'address' }, { name: 'identifierOrCriteria', type: 'uint256' }, { name: 'startAmount', type: 'uint256' }, { name: 'endAmount', type: 'uint256' }],
  ConsiderationItem: [{ name: 'itemType', type: 'uint8' }, { name: 'token', type: 'address' }, { name: 'identifierOrCriteria', type: 'uint256' }, { name: 'startAmount', type: 'uint256' }, { name: 'endAmount', type: 'uint256' }, { name: 'recipient', type: 'address' }],
};
const item = (i) => ({ ...i, itemType: Number(i.itemType), identifierOrCriteria: BigInt(i.identifierOrCriteria), startAmount: BigInt(i.startAmount), endAmount: BigInt(i.endAmount) });
const asMessage = (c) => ({ ...c, offer: c.offer.map(item), consideration: c.consideration.map(item), orderType: Number(c.orderType), startTime: BigInt(c.startTime), endTime: BigInt(c.endTime), salt: BigInt(c.salt), counter: BigInt(c.counter) });

// One listing at a time, each signed by the wallet itself (for contract wallets), then posted.
async function signEach({ sdk, walletClient, account, list, onStep }) {
  const listed = [], failed = [];
  for (const [i, x] of list.entries()) {
    const n = Number(x.asset.tokenId);
    onStep?.(list.length > 1 ? `Sign listing ${i + 1} of ${list.length} in your wallet…` : 'Sign the listing in your wallet…');
    try {
      const components = await sdk._ordersManager.buildListingOrderComponents({ ...x, accountAddress: account });
      const signature = await walletClient.signTypedData({ account, domain: { name: 'Seaport', version: '1.6', chainId: 8453, verifyingContract: SEAPORT }, types: ORDER_TYPES, primaryType: 'OrderComponents', message: asMessage(components) });
      await sdk.api.postListing({ parameters: components, signature }, SEAPORT);
      listed.push(n);
    } catch (e) {
      if (rejectedSig(e)) { if (!listed.length) throw e; break; } // cancelled: stop, keep what's listed
      failed.push({ n, error: explain(e) });
    }
  }
  return { listed, failed };
}

// An error in words, with the contract call behind it when there is one (ethers' CALL_EXCEPTION)
const NAMES = { '0xf07ec373': 'getCounter', '0xe985e9c5': 'isApprovedForAll', '0x6352211e': 'ownerOf', '0xa22cb465': 'setApprovalForAll', '0x70a08231': 'balanceOf', '0x01ffc9a7': 'supportsInterface', '0xf47b7740': 'information', '0x46423aa7': 'getOrderStatus' };
export function explain(e) {
  const rpcErr = e?.info?.error?.message; // what the RPC actually said, under ethers' "missing revert data"
  const msg = `${e?.shortMessage || e?.message || String(e)}${rpcErr ? `: ${rpcErr}` : ''}`;
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
  const expirationTime = Math.floor(Date.now() / 1000) + days * 86400;
  const one = (x) => ({ asset: { tokenAddress: contract, tokenId: String(x.n) }, amount: x.eth, expirationTime, includeOptionalCreatorFees: true });
  // A contract wallet (Coinbase Smart Wallet, MetaMask's smart account: EIP-7702) is checked by Seaport
  // through its own isValidSignature, which knows one listing's digest, not a bulk signature's tree
  // root: OpenSea rejects those ("Signature invalid"). It signs each listing on its own, with its own
  // signature as is (seaport-js would shorten a 65-byte one to 64, which a wallet contract may refuse).
  const code = await publicClient.getCode({ address: account }).catch(() => null);
  const each = (list) => signEach({ sdk, walletClient, account, list: list.map(one), onStep });
  if (code && code !== '0x') return each(items.map((x) => ({ ...x })));
  if (items.length === 1) {
    onStep?.('Sign the listing in your wallet…');
    await sdk.createListing({ ...one(items[0]), accountAddress: account });
    return { listed: [items[0].n], failed: [] };
  }
  onStep?.(`Sign once to list ${items.length} Blockies…`);
  const r = await sdk.createBulkListings({ listings: items.map(one), accountAddress: account, continueOnError: true, onProgress });
  // a wallet that turned out to sign as a contract (an undeployed smart wallet has no code yet): one by one
  if (!r.successful?.length && r.failed?.some((f) => /signature invalid/i.test(f.error?.message || ''))) {
    onStep?.('Your wallet signs listings one at a time: signing each…');
    return each(items.map((x) => ({ ...x })));
  }
  const failedIdx = new Set((r.failed || []).map((f) => f.index));
  return {
    listed: items.filter((_, i) => !failedIdx.has(i)).map((x) => x.n),
    failed: (r.failed || []).map((f) => ({ n: items[f.index]?.n, error: f.error?.message || String(f.error) })),
  };
}
