// Vercel serverless function: Base's last hour and its TVL, for the Data Plaza in Base Live.
//   GET /api/basestats -> { head, names: { n, last }, bridge: { n, eth }, txPerBlock, txPerDay, tvl, apps: { id: TVL on Base }, errors, at }
// Cached 5 minutes by the CDN (and by this instance).
import { readHour, readTvl, readAppTvl, readFees, readFlow } from './_baselive.js';
import { useKv, kv, KEY_BASE } from './_store.js';

// the hourly USDC flow (readFlow) is kept in KV (else this instance's memory): one hash field per hour
const FLOW_KEY = `${KEY_BASE}:baselive:usdcflow:v2`; // v2: 12 samples an hour (v1 had 4)
const flowMemory = new Map();
const flowStore = {
  async get(hours) {
    if (!useKv()) return Object.fromEntries(hours.filter((h) => flowMemory.has(h)).map((h) => [h, flowMemory.get(h)]));
    const vals = await kv('HMGET', FLOW_KEY, ...hours.map(String));
    return Object.fromEntries(hours.map((h, i) => [h, vals?.[i] ? JSON.parse(vals[i]) : null]).filter(([, v]) => v));
  },
  async set(h, v) { if (useKv()) await kv('HSET', FLOW_KEY, String(h), JSON.stringify(v)); else flowMemory.set(h, v); },
};

let last = null;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=600');
  const partial = () => last && (Object.keys(last.errors || {}).length || (last.flow && last.flow.hours < 168)); // or the week's flow still filling in
  try {
    if (!last || Date.now() - last.at > (partial() ? 25000 : 240000)) {
      const [hour, tvl, apps, fees, flow] = await Promise.all([readHour().catch((e) => ({ errors: { head: String(e.message || e).slice(0, 200) } })), readTvl(), readAppTvl(), readFees().catch((e) => ({ error: String(e.message || e).slice(0, 200) })), readFlow(flowStore).catch((e) => ({ error: String(e.message || e).slice(0, 200) }))]);
      last = { names: null, bridge: null, txPerBlock: null, txPerDay: null, ...hour, tvl, apps, appsDetail: readAppTvl.detail, fees: fees.error ? null : fees, flow: flow.error ? null : flow, at: Date.now() };
      if (flow.error) last.errors = { ...last.errors, flow: flow.error };
      if (fees.error) last.errors = { ...last.errors, fees: fees.error };
      if (tvl === null) last.errors = { ...last.errors, tvl: 'DefiLlama did not answer' };
    }
    if (partial()) res.setHeader('cache-control', 'public, s-maxage=30'); // something failed: try again soon
    res.status(200).json(last);
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ error: String(e.message || e) });
  }
}
