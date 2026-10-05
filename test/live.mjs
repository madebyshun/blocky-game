// /api/live: visitors by hashed IP in per-2-minute HyperLogLogs on KV (a fake Upstash pipeline here,
// with sets standing in for HyperLogLogs), the counts read at most every 15 s.
import assert from 'node:assert/strict';

Object.assign(process.env, { KV_REST_API_URL: 'https://kv.test', KV_REST_API_TOKEN: 't', KV_KEY: 'test' });
const sets = new Map(), ttl = new Map(), calls = [];
globalThis.fetch = async (url, { body }) => {
  assert.equal(url, 'https://kv.test/pipeline');
  const cmds = JSON.parse(body);
  calls.push(cmds.map((c) => c[0]));
  const out = cmds.map(([op, ...a]) => {
    if (op === 'PFADD') { const s = sets.get(a[0]) || new Set(); const n = s.size; s.add(a[1]); sets.set(a[0], s); return Number(s.size > n); }
    if (op === 'EXPIRE') { ttl.set(a[0], a[1]); return 1; }
    if (op === 'PFCOUNT') return new Set(a.flatMap((k) => [...(sets.get(k) || [])])).size;
    throw new Error(op);
  });
  return { json: async () => out.map((result) => ({ result })) };
};
const live = (await import('../api/live.js')).default;
const call = (ip, first) => new Promise((resolve) => {
  const res = { setHeader() {}, status: (code) => ({ json: (b) => resolve({ code, ...b }) }) };
  live({ url: `/api/live${first ? '?first=1' : ''}`, query: first ? { first: '1' } : {}, headers: { 'x-real-ip': ip } }, res);
});

let r = await call('1.1.1.1', true);
assert.deepEqual([r.code, r.now, r.total], [200, 1, 1]);
assert.deepEqual(calls[0], ['PFADD', 'EXPIRE', 'PFADD', 'PFCOUNT', 'PFCOUNT']); // first visit: counts read
assert.equal([...ttl.values()][0], 360);
assert.ok([...sets.keys()].every((k) => k.startsWith('test:live:')));
assert.ok(![...sets.values()].some((s) => [...s].some((v) => v.includes('1.1.1.1')))); // no IPs stored
// within 15 s: one command per check-in, the cached counts
r = await call('2.2.2.2', false);
assert.deepEqual(calls[1], ['PFADD']);
assert.equal(r.now, 1);
// the same visitor again counts once
await call('1.1.1.1', true);
assert.equal(sets.get('test:live:total').size, 1);
console.log('live: all checks pass');
