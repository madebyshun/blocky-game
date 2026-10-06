// The daily recap: the numbers of a day (src/recap-data.js) and its share page and image (api/recap.js),
// from a fake colony state.
import assert from 'node:assert/strict';

const DAY = 86400e3, now = Date.now(), start = now - 1.5 * DAY;
const W = ['0xb7b3bdf2e53b9c877efabc99a74badfc03299823', '0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'];
const blockies = [];
for (let n = 1; n <= 100; n++) blockies.push([W[0], start, null, null]); // the team reserve, from the start
blockies.push([W[1], start + 2 * 3600e3, null, 7]); // #101 on day 1
blockies.push([W[2], start + 3 * 3600e3, start + 5 * 3600e3, 8]); // #102 came and left on day 1
blockies.push([W[1], start + DAY + 3600e3, null, 9]); // #103 on day 2
const state = { cityStart: start, blockies, whales: [], boughtUsd: 30, names: { [W[1]]: 'shun.base.eth' } };

const { recapOf, recapPost, dayCount, defaultDay } = await import('../src/recap-data.js');
assert.equal(dayCount(start, now), 2);
assert.equal(defaultDay(2), 1); // the last full day
let s = recapOf(state, 1, now);
assert.deepEqual([s.live, s.inCity, s.arrived.length, s.left.length, s.net], [false, 101, 102, 1, 101]);
assert.ok(s.blocks > 0 && s.buildings > 0);
assert.ok(s.mvp && s.mvp[0].id === 101); // the hardest-working buyer's Blocky, not the team's
s = recapOf(state, 2, now);
assert.deepEqual([s.live, s.inCity, s.arrived.length, s.left.length], [true, 102, 1, 0]);
assert.match(recapPost(s, 'https://basecity.test/r/2'), /Day 2 recap \(so far\)[\s\S]*102 Blockies in the city \(\+1\)[\s\S]*https:\/\/basecity.test\/r\/2/);

// the API: the share page carries the X card, the image is a PNG
globalThis.fetch = async (url) => ({ ok: String(url).endsWith('/api/colony'), status: 200, json: async () => state });
const recap = (await import('../api/recap.js')).default;
const call = (query) => new Promise((resolve) => {
  const headers = {};
  const res = { setHeader: (k, v) => (headers[k] = v), status: (code) => ({ send: (body) => resolve({ code, body, headers }), json: (body) => resolve({ code, body, headers }) }) };
  recap({ query, url: '/api/recap', headers: { host: 'basecity.test' } }, res);
});
let r = await call({ day: '1' });
assert.equal(r.code, 200);
assert.match(r.body, /<meta name="twitter:card" content="summary_large_image">/);
assert.match(r.body, /og:image" content="[^"]*\/api\/recap\?day=1&amp;format=png/);
assert.match(r.body, /url=[^"]*\/recap\.html\?day=1/);
r = await call({ day: '1', format: 'png' });
assert.equal(r.headers['content-type'], 'image/png');
assert.deepEqual([...r.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
assert.match(r.headers['cache-control'], /s-maxage=86400/); // a finished day
r = await call({ day: '9', format: 'png' }); // no such day: the default one
assert.equal(r.code, 200);
console.log('recap: all checks pass');
