// Suggested NFT prices (src/pricing.js) and OpenSea listings (api/_market.js). Run: npm test
import assert from 'node:assert/strict';
import { suggestEth, specialNumber, PRICING } from '../src/pricing.js';
import { rarityOf } from '../src/sim.js';
import { parseListings } from '../api/_market.js';

const common = [2, 4, 5].find((n) => rarityOf(n).rarity.id === 'common');
const rare = Array.from({ length: 5000 }, (_, i) => i + 2).find((n) => rarityOf(n).rarity.id === 'rare' && !specialNumber(n));
// the floor, times the rarity
assert.equal(suggestEth(common, null, { floor: 0.008, ethUsd: 2700 }), 0.008);
assert.equal(suggestEth(rare, null, { floor: 0.008, ethUsd: 2700 }), 0.04);
// never below what earning one costs ($12 of ETH)
assert.equal(suggestEth(common, null, { floor: 0.001, ethUsd: 2700 }), Math.ceil((12 / 2700) * 1e4) / 1e4);
// no floor yet: $15 of ETH; nothing to go by: null
assert.equal(suggestEth(common, null, { ethUsd: 3000 }), 0.005);
assert.equal(suggestEth(common, null, {}), null);
assert.equal(suggestEth(common, null, { floor: 0.01 }), 0.01, 'a floor alone is enough');
// numbers people collect
assert.ok(specialNumber(101) && specialNumber(111) && specialNumber(2222) && specialNumber(3000) && specialNumber(420));
assert.ok(!specialNumber(102) && !specialNumber(5) && !specialNumber(1001));
assert.equal(suggestEth(101, null, { floor: 0.01 }) >= 0.01 * PRICING.special, true);

// listings: the cheapest per token, ETH only, this contract only
const L = (id, wei, who, token = '0xD1C1') => ({ price: { current: { currency: 'ETH', decimals: 18, value: String(wei) } }, protocol_data: { parameters: { offerer: who, offer: [{ token, identifierOrCriteria: String(id), startAmount: '1' }] } } });
const got = parseListings([L(5, 6e15, '0xAA'), L(5, 5e15, '0xBB'), L(7, 9e15, '0xAA'), L(8, 1e15, '0xAA', '0xother'), { price: { current: { currency: 'USDC', decimals: 6, value: '1000' } }, protocol_data: { parameters: { offerer: '0xaa', offer: [{ token: '0xD1C1', identifierOrCriteria: '9' }] } } }], '0xd1c1');
assert.deepEqual(got, { 5: { eth: 0.005, maker: '0xbb' }, 7: { eth: 0.009, maker: '0xaa' } });
console.log('pricing: all checks pass');
