import assert from 'node:assert/strict';
import { profileOf, priceUnits, levelOf, SKILLS } from '../src/skills.js';
const c = profileOf(720, { Role: 'Frontend Dev', Rarity: 'Common' });
assert.equal(c.guild, 'builder'); assert.equal(c.skills.length, 1); assert.equal(c.skills[0], 'token-info');
const u = profileOf(719, { Role: 'Smart Contract Dev', Rarity: 'Uncommon', Trait: 'Shades' });
assert.equal(u.guild, 'security'); assert.equal(u.skills.length, 2); assert.equal(u.skills[0], 'token-safety');
assert.deepEqual(profileOf(719, { Role: 'Smart Contract Dev', Rarity: 'Uncommon' }).skills, u.skills); // same every time
assert.equal(profileOf(1, { Role: 'Founder', Rarity: 'Legendary' }).skills.length, Object.keys(SKILLS).length);
assert.equal(levelOf(0), 1); assert.equal(levelOf(5), 2); assert.equal(levelOf(100), 4);
assert.equal(priceUnits('nav-premium', { priceCap: 1 }, 2), 20000); // capped by level
assert.equal(priceUnits('nav-premium', { priceCap: 1.5 }, 2), 30000);
console.log('skills ok');
