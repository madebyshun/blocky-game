// Snapshot BaseCity Blockies (BCB) NFT holders on Base and execute or preview auto-push Epoch payouts.
// Usage (dry-run, auto-detects max-id from basecity.space/api/colony):
//   node scripts/flywheel-snapshot.mjs --epoch 1 --total-fees 100000 --decimals 18
// Exclude extra dev/test wallets:
//   node scripts/flywheel-snapshot.mjs --epoch 1 --total-fees 100000 --exclude 0xabc...,0xdef...
// Execute live auto-push payouts on Base (requires FLYWHEEL_CONTRACT + FLYWHEEL_OPERATOR_KEY):
//   FLYWHEEL_CONTRACT=0x... FLYWHEEL_OPERATOR_KEY=0x... node scripts/flywheel-snapshot.mjs --epoch 1 --total-fees 100000 --token 0xE72A... --execute
// Optional buyback burn in the same run:
//   --burn-token 0xB200000000000000000000A2408e76AcE2AD63FD --burn-amount 35000
import { createPublicClient, createWalletClient, fallback, http, parseUnits, formatUnits, getAddress, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { CONFIG } from '../src/config.js';

const NFT = CONFIG.nft.contract;
const DEFAULT_TOKEN = CONFIG.tokenAddress; // $BLOCKY
const COLONY_URL = `${(CONFIG.siteUrl || 'https://basecity.space').replace(/\/$/, '')}/api/colony`;

const ERC721_ABI = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
];

const FLYWHEEL_ABI = [
  {
    type: 'function',
    name: 'batchDisperse',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'epoch', type: 'uint256' },
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'burnBuyback',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'epoch', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
];

function arg(name, fallbackVal) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--') ? process.argv[idx + 1] : fallbackVal;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function detectMaxId() {
  try {
    const r = await fetch(COLONY_URL, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return 1000;
    const j = await r.json();
    const issued = Number(j?.issued || j?.minted || 0);
    return Math.max(issued + 50, 1000);
  } catch {
    return 1000;
  }
}

async function main() {
  const epoch = Number(arg('epoch', '1'));
  const totalFeeStr = arg('total-fees', '');
  const holderPoolStr = arg('pool', '');
  const decimals = Number(arg('decimals', '18'));
  const maxIdArg = arg('max-id', '');
  const maxId = maxIdArg ? Number(maxIdArg) : await detectMaxId();
  const batchSize = Number(arg('batch', '150'));
  const minPayout = parseUnits(arg('min-payout', '0.01'), decimals);
  const rewardToken = getAddress(arg('token', DEFAULT_TOKEN));
  const execute = hasFlag('execute');
  const burnTokenArg = arg('burn-token', '');
  const burnAmtArg = arg('burn-amount', '');

  const extraExcludes = arg('exclude', '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => isAddress(s));

  const EXCLUDED = new Set([
    CONFIG.nft.reserve?.wallet,
    CONFIG.nft.treasury,
    ...(CONFIG.nft.grants || []).map((g) => g.wallet),
    ...extraExcludes,
    '0x0000000000000000000000000000000000000000',
    '0x000000000000000000000000000000000000dead',
  ].filter(Boolean).map((a) => a.toLowerCase()));

  const totalFeesWei = totalFeeStr ? parseUnits(totalFeeStr, decimals) : 0n;
  const holderPoolWei = holderPoolStr
    ? parseUnits(holderPoolStr, decimals)
    : totalFeesWei > 0n
      ? (totalFeesWei * 45n) / 100n
      : parseUnits('1000', decimals);
  const buybackTargetWei = totalFeesWei > 0n ? (totalFeesWei * 35n) / 100n : 0n;
  const treasuryTargetWei = totalFeesWei > 0n ? totalFeesWei - holderPoolWei - buybackTargetWei : 0n;

  const transport = fallback([
    ...(process.env.BASE_RPC_URL ? [http(process.env.BASE_RPC_URL)] : []),
    http('https://base-rpc.publicnode.com'),
    http('https://mainnet.base.org'),
  ]);
  const client = createPublicClient({ chain: base, transport });

  const counts = new Map();
  let totalEligible = 0;
  let totalMinted = 0;
  let highestMintedId = 0;

  for (let start = 1; start <= maxId; start += 50) {
    const ids = [];
    for (let id = start; id < start + 50 && id <= maxId; id++) ids.push(BigInt(id));
    const res = await client.multicall({
      contracts: ids.map((id) => ({ address: NFT, abi: ERC721_ABI, functionName: 'ownerOf', args: [id] })),
      allowFailure: true,
    });
    res.forEach((r, idx) => {
      if (r.status !== 'success' || !r.result) return;
      totalMinted++;
      const tokenId = start + idx;
      if (tokenId > highestMintedId) highestMintedId = tokenId;
      const owner = String(r.result).toLowerCase();
      if (EXCLUDED.has(owner)) return;
      counts.set(owner, (counts.get(owner) || 0) + 1);
      totalEligible++;
    });
  }

  const payouts = [];
  let allocated = 0n;
  for (const [wallet, nfts] of counts.entries()) {
    const amt = totalEligible > 0 ? (holderPoolWei * BigInt(nfts)) / BigInt(totalEligible) : 0n;
    if (amt < minPayout) continue;
    payouts.push({ wallet: getAddress(wallet), nfts, amount: amt.toString(), formatted: formatUnits(amt, decimals) });
    allocated += amt;
  }
  payouts.sort((a, b) => b.nfts - a.nfts);

  const batches = [];
  for (let i = 0; i < payouts.length; i += batchSize) {
    const slice = payouts.slice(i, i + batchSize);
    batches.push({
      recipients: slice.map((x) => x.wallet),
      amounts: slice.map((x) => x.amount),
    });
  }

  const summary = {
    mode: execute ? 'execute' : 'dry-run',
    epoch,
    nftContract: NFT,
    rewardToken,
    scannedUpToId: maxId,
    highestMintedId,
    totalMinted,
    totalEligibleNfts: totalEligible,
    excludedWalletsCount: EXCLUDED.size,
    eligibleHolders: payouts.length,
    split: {
      holders45: formatUnits(holderPoolWei, decimals),
      buyback35: totalFeesWei > 0n ? formatUnits(buybackTargetWei, decimals) : null,
      treasury20: totalFeesWei > 0n ? formatUnits(treasuryTargetWei, decimals) : null,
    },
    allocated: formatUnits(allocated, decimals),
    batchCount: batches.length,
    topHolders: payouts.slice(0, 15),
    batches,
  };

  if (!execute) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const flywheelAddr = process.env.FLYWHEEL_CONTRACT;
  const opKey = process.env.FLYWHEEL_OPERATOR_KEY;
  if (!flywheelAddr || !isAddress(flywheelAddr)) throw new Error('Missing valid FLYWHEEL_CONTRACT env var');
  if (!opKey || !/^0x[0-9a-fA-F]{64}$/.test(opKey)) throw new Error('Missing valid FLYWHEEL_OPERATOR_KEY env var');

  const account = privateKeyToAccount(opKey);
  const walletClient = createWalletClient({ account, chain: base, transport });
  const txHashes = [];

  for (let i = 0; i < batches.length; i++) {
    const b = batches[i];
    const hash = await walletClient.writeContract({
      address: getAddress(flywheelAddr),
      abi: FLYWHEEL_ABI,
      functionName: 'batchDisperse',
      args: [rewardToken, BigInt(epoch), b.recipients, b.amounts.map((a) => BigInt(a))],
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    txHashes.push({ type: 'batchDisperse', batch: i + 1, hash, status: receipt.status, block: Number(receipt.blockNumber) });
  }

  if (burnTokenArg && burnAmtArg) {
    const burnToken = getAddress(burnTokenArg);
    const burnWei = parseUnits(burnAmtArg, decimals);
    const hash = await walletClient.writeContract({
      address: getAddress(flywheelAddr),
      abi: FLYWHEEL_ABI,
      functionName: 'burnBuyback',
      args: [burnToken, BigInt(epoch), burnWei],
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    txHashes.push({ type: 'burnBuyback', token: burnToken, amount: burnAmtArg, hash, status: receipt.status, block: Number(receipt.blockNumber) });
  }

  console.log(JSON.stringify({ ...summary, executedBy: account.address, flywheelContract: getAddress(flywheelAddr), transactions: txHashes }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
