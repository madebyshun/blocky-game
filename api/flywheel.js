// Onchain sync endpoint for BaseCityFlywheel ($BASECITY / WETH / BCB NFTs).
// Reads live vault balances, deferred balances, burned totals, and incremental onchain
// EpochDistributed / BuybackBurned / DeferredClaimed logs with KV persistence.
import { createPublicClient, fallback, http, formatUnits, keccak256, toBytes, getAddress } from 'viem';
import { base } from 'viem/chains';
import { CONFIG } from '../src/config.js';
import { env, RPC, KEY_BASE, useKv, kv } from './_store.js';

const DEAD = '0x000000000000000000000000000000000000dEaD';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';

const EPOCH_DIST_TOPIC = keccak256(toBytes('EpochDistributed(uint256,address,uint256,uint256,uint256)')).toLowerCase();
const BUYBACK_BURN_TOPIC = keccak256(toBytes('BuybackBurned(uint256,address,uint256)')).toLowerCase();
const DEFERRED_CLAIMED_TOPIC = keccak256(toBytes('DeferredClaimed(address,address,uint256)')).toLowerCase();

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
];

const FLYWHEEL_ABI = [
  { type: 'function', name: 'operator', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'totalDeferred', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
];

const CACHE_KEY = `${KEY_BASE}:flywheel:${CONFIG.flywheel.basecityToken.toLowerCase()}`;
const CACHE_TTL_MS = 45_000;
const INITIAL_LOOKBACK = 20000n;
const CHUNK_TIERS = [5000n, 2000n, 500n, 9n];
const MAX_CHUNKS_PER_SYNC = 30;
let memCache = null;

function makeClient() {
  const urls = [];
  if (RPC) urls.push(RPC);
  const def = base.rpcUrls?.default?.http?.[0];
  if (def && !urls.includes(def)) urls.push(def);
  return createPublicClient({
    chain: base,
    transport: fallback(urls.map((u) => http(u, { retryCount: 1, timeout: 8000 }))),
  });
}

function makeLogClient() {
  const def = base.rpcUrls?.default?.http?.[0];
  const url = def || RPC;
  return createPublicClient({
    chain: base,
    transport: http(url, { retryCount: 1, timeout: 8000 }),
  });
}

function tokenMetaMap(bcToken, blockyToken) {
  return {
    [bcToken.toLowerCase()]: { symbol: '$BASECITY', decimals: 18 },
    [blockyToken.toLowerCase()]: { symbol: '$BLOCKY', decimals: 18 },
    [USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
    [WETH.toLowerCase()]: { symbol: 'WETH', decimals: 18 },
  };
}

export function decodeFlywheelLog(log, tokens) {
  const topics = log.topics || [];
  const t0 = String(topics[0] || '').toLowerCase();
  const hex = String(log.data || '0x').replace(/^0x/, '');
  const tx = String(log.transactionHash || '');
  const blockNumber = Number(typeof log.blockNumber === 'bigint' ? log.blockNumber : BigInt(log.blockNumber || 0));
  const logIndex = Number(typeof log.logIndex === 'bigint' ? log.logIndex : BigInt(log.logIndex || 0));

  const addrFromTopic = (t) => (t && t.length >= 42 ? `0x${t.slice(-40)}`.toLowerCase() : '');
  const metaFor = (addr) => tokens[addr] || { symbol: addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : 'TOKEN', decimals: 18 };

  if (t0 === EPOCH_DIST_TOPIC && hex.length >= 192) {
    const epoch = topics[1] ? Number(BigInt(topics[1])) : 0;
    const tok = addrFromTopic(topics[2]);
    const meta = metaFor(tok);
    const paidCount = Number(BigInt(`0x${hex.slice(0, 64)}`));
    const totalPaid = Number(formatUnits(BigInt(`0x${hex.slice(64, 128)}`), meta.decimals));
    const deferredAmt = Number(formatUnits(BigInt(`0x${hex.slice(128, 192)}`), meta.decimals));
    const detail = deferredAmt > 0
      ? `${paidCount} holder${paidCount === 1 ? '' : 's'} · ${deferredAmt.toFixed(2)} deferred`
      : `${paidCount} holder${paidCount === 1 ? '' : 's'}`;
    return { id: `${tx}:${logIndex}`, epoch, kind: 'Auto-Push Payout', token: tok, sym: meta.symbol, amount: totalPaid, paidCount, detail, tx, blockNumber, timestamp: null };
  }

  if (t0 === BUYBACK_BURN_TOPIC && hex.length >= 64) {
    const epoch = topics[1] ? Number(BigInt(topics[1])) : 0;
    const tok = addrFromTopic(topics[2]);
    const meta = metaFor(tok);
    const burned = Number(formatUnits(BigInt(`0x${hex.slice(0, 64)}`), meta.decimals));
    return { id: `${tx}:${logIndex}`, epoch, kind: 'Buyback & Burn', token: tok, sym: meta.symbol, amount: burned, paidCount: 0, detail: 'Sent to 0x…dEaD', tx, blockNumber, timestamp: null };
  }

  if (t0 === DEFERRED_CLAIMED_TOPIC && hex.length >= 64) {
    const tok = addrFromTopic(topics[1]);
    const recipient = addrFromTopic(topics[2]);
    const meta = metaFor(tok);
    const claimed = Number(formatUnits(BigInt(`0x${hex.slice(0, 64)}`), meta.decimals));
    const shortRec = recipient ? `${recipient.slice(0, 6)}…${recipient.slice(-4)}` : 'holder';
    return { id: `${tx}:${logIndex}`, epoch: 0, kind: 'Deferred Claim', token: tok, sym: meta.symbol, amount: claimed, paidCount: 1, detail: `Claimed by ${shortRec}`, tx, blockNumber, timestamp: null };
  }

  return null;
}

async function scanLogsAdaptive(primaryClient, fallbackClient, fwContract, startBlock, endBlock) {
  const out = [];
  if (endBlock < startBlock) return { logs: out, scannedTo: endBlock };
  let cursor = startBlock;
  let chunks = 0;
  let tierIdx = 0;
  let scannedTo = startBlock > 0n ? startBlock - 1n : 0n;

  while (cursor <= endBlock && chunks < MAX_CHUNKS_PER_SYNC && tierIdx < CHUNK_TIERS.length) {
    const size = CHUNK_TIERS[tierIdx];
    const to = cursor + size > endBlock ? endBlock : cursor + size;
    let ok = false;
    for (const c of [primaryClient, fallbackClient]) {
      if (!c) continue;
      try {
        const logs = await c.getLogs({ address: fwContract, fromBlock: cursor, toBlock: to });
        if (Array.isArray(logs) && logs.length) out.push(...logs);
        scannedTo = to;
        cursor = to + 1n;
        chunks++;
        ok = true;
        break;
      } catch { /* try next client or smaller tier */ }
    }
    if (!ok) tierIdx++;
  }
  return { logs: out, scannedTo };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'public, s-maxage=45, stale-while-revalidate=120');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const force = req.query?.refresh === '1';
  if (!force && memCache && Date.now() - memCache.ts < CACHE_TTL_MS) {
    return res.status(200).json(memCache.data);
  }

  let stored = null;
  if (useKv()) {
    try {
      stored = JSON.parse((await kv('GET', CACHE_KEY)) || 'null');
      if (!force && stored && Date.now() - (stored.ts || 0) < CACHE_TTL_MS && stored.data) {
        memCache = stored;
        return res.status(200).json(stored.data);
      }
    } catch { /* ignore kv error */ }
  }

  const fw = CONFIG.flywheel || {};
  const fwContract = env.FLYWHEEL_CONTRACT || fw.contract ? getAddress(env.FLYWHEEL_CONTRACT || fw.contract) : '';
  const bcToken = getAddress(fw.basecityToken);
  const blockyToken = getAddress(CONFIG.tokenAddress || '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885');
  const split = fw.split || { holders: 45, buyback: 35, treasury: 20 };
  const tokens = tokenMetaMap(bcToken, blockyToken);

  const client = makeClient();
  const latestBlock = await client.getBlockNumber().catch(() => 0n);

  let operator = fw.operator || '';
  const vault = [];
  const burned = { basecity: 0, blocky: 0 };
  let newLogs = [];
  let scannedTo = BigInt(stored?.data?.scannedBlock || 0);

  if (fwContract && latestBlock > 0n) {
    const deployBlock = BigInt(Math.max(CONFIG.flywheel.launchBlock, Number(env.FLYWHEEL_DEPLOY_BLOCK) || 0));
    const defaultStart = latestBlock > INITIAL_LOOKBACK ? latestBlock - INITIAL_LOOKBACK : 0n;
    const prevBlock = BigInt(stored?.data?.scannedBlock || 0);
    const startBlock = prevBlock > 0n
      ? (prevBlock + 1n > latestBlock ? latestBlock : prevBlock + 1n)
      : (deployBlock > 0n ? deployBlock : defaultStart);

    const tracked = [
      { address: bcToken, symbol: '$BASECITY', decimals: 18 },
      { address: blockyToken, symbol: '$BLOCKY', decimals: 18 },
      { address: getAddress(USDC), symbol: 'USDC', decimals: 6 },
      { address: getAddress(WETH), symbol: 'WETH', decimals: 18 },
    ];

    const [scanRes, mc] = await Promise.all([
      scanLogsAdaptive(makeLogClient(), client, fwContract, startBlock, latestBlock),
      client.multicall({
        allowFailure: true,
        contracts: [
          { address: fwContract, abi: FLYWHEEL_ABI, functionName: 'operator' },
          ...tracked.map((t) => ({ address: t.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [fwContract] })),
          ...tracked.map((t) => ({ address: fwContract, abi: FLYWHEEL_ABI, functionName: 'totalDeferred', args: [t.address] })),
          { address: bcToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [DEAD] },
          { address: blockyToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [DEAD] },
        ],
      }).catch(() => []),
    ]);

    newLogs = scanRes.logs;
    if (scanRes.scannedTo > scannedTo) scannedTo = scanRes.scannedTo;

    if (Array.isArray(mc) && mc.length >= 1 + tracked.length * 2 + 2) {
      if (mc[0]?.status === 'success' && mc[0].result) operator = String(mc[0].result);
      tracked.forEach((t, i) => {
        const balRaw = mc[1 + i]?.status === 'success' ? mc[1 + i].result : 0n;
        const defRaw = mc[1 + tracked.length + i]?.status === 'success' ? mc[1 + tracked.length + i].result : 0n;
        const freeRaw = balRaw > defRaw ? balRaw - defRaw : 0n;
        vault.push({
          symbol: t.symbol,
          address: t.address,
          balance: Number(formatUnits(balRaw, t.decimals)),
          deferred: Number(formatUnits(defRaw, t.decimals)),
          free: Number(formatUnits(freeRaw, t.decimals)),
        });
      });
      const bcBurnIdx = 1 + tracked.length * 2;
      const blBurnIdx = bcBurnIdx + 1;
      if (mc[bcBurnIdx]?.status === 'success') burned.basecity = Number(formatUnits(mc[bcBurnIdx].result, 18));
      if (mc[blBurnIdx]?.status === 'success') burned.blocky = Number(formatUnits(mc[blBurnIdx].result, 18));
    }
  }

  const byId = new Map();
  for (const prev of stored?.data?.events || []) {
    if (prev?.id) byId.set(prev.id, prev);
  }
  for (const raw of newLogs) {
    const decoded = decodeFlywheelLog(raw, tokens);
    if (!decoded) continue;
    const existing = byId.get(decoded.id);
    byId.set(decoded.id, { ...decoded, timestamp: existing?.timestamp || decoded.timestamp });
  }

  const events = [...byId.values()].sort((a, b) => (b.blockNumber - a.blockNumber) || (b.epoch - a.epoch));

  // Backfill block timestamps for newly discovered events
  const missingTs = events.filter((e) => !e.timestamp && e.blockNumber > 0).slice(0, 10);
  if (missingTs.length) {
    const uniqueBlocks = [...new Set(missingTs.map((e) => e.blockNumber))];
    const blocks = await Promise.all(
      uniqueBlocks.map((bn) => client.getBlock({ blockNumber: BigInt(bn) }).catch(() => null))
    );
    const tsMap = new Map();
    uniqueBlocks.forEach((bn, i) => {
      if (blocks[i]?.timestamp) tsMap.set(bn, Number(blocks[i].timestamp) * 1000);
    });
    for (const e of events) {
      if (!e.timestamp && tsMap.has(e.blockNumber)) e.timestamp = tsMap.get(e.blockNumber);
    }
  }

  const payouts = events.filter((e) => e.kind === 'Auto-Push Payout');
  const burns = events.filter((e) => e.kind === 'Buyback & Burn');
  const claims = events.filter((e) => e.kind === 'Deferred Claim');
  const latestEpoch = events.reduce((m, e) => Math.max(m, e.epoch || 0), 0);
  const totalHoldersPaid = payouts.reduce((s, e) => s + (e.paidCount || 0), 0);

  const data = {
    contract: fwContract,
    operator,
    basecityToken: bcToken,
    blockyToken,
    split,
    latestBlock: Number(latestBlock),
    scannedBlock: Number(scannedTo),
    syncedAt: new Date().toISOString(),
    vault,
    burned,
    summary: {
      latestEpoch,
      payoutCount: payouts.length,
      burnCount: burns.length,
      claimCount: claims.length,
      totalHoldersPaid,
    },
    events: events.slice(0, 50),
  };

  const payload = { ts: Date.now(), data };
  memCache = payload;
  if (useKv()) {
    try { await kv('SET', CACHE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
  }

  return res.status(200).json(data);
}
