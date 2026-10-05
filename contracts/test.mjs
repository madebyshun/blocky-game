// Tests BaseCityBlockies on an in-memory EVM (Cancun, chain id 8453): claims, signatures, the lock,
// evictions, the supply cap and the unlock. Run: npm test (in contracts/).
import assert from 'node:assert/strict';
import { chain, account } from './evm.mjs';
import { claimTypedData } from '../api/_sig.js';

const evm = await chain(); // evm.now: the block time, moved forward below
const [owner, signer, alice, bob, carol, treasury, eve] = [11, 12, 13, 14, 15, 16, 17].map(account);
let C; // the contract
const deploy = async (maxSupply = 5) => (C = await evm.deploy(owner, [owner.address, signer.address, treasury.address, 500, BigInt(maxSupply), 'https://basecity.test/api/nft/', 'https://basecity.test/api/nft/collection']));
const send = (from, fn, args) => evm.send(from, fn, args);
const read = (fn, args) => evm.read(fn, args);
async function sign(to, ids, evict = [], deadline = evm.now + 1800, by = signer) {
  const sig = await by.signTypedData(claimTypedData({ chainId: 8453, contract: C, to: to.address, ids, evict, deadline }));
  return [ids.map(BigInt), evict.map(BigInt), BigInt(deadline), sig];
}
const ok = (r) => { assert.equal(r.error, undefined, r.error); return r; };
const reverts = (r, name) => assert.equal(r.error, name);

// --- deploy and metadata
await deploy(5);
assert.equal(await read('name'), 'BaseCity Blockies');
assert.equal(await read('symbol'), 'BCB');
assert.deepEqual(await read('royaltyInfo', [1n, 10000n]), [treasury.address, 500n]);
for (const id of ['0x80ac58cd', '0x5b5e139f', '0x2a55205a', '0x49064906', '0x01ffc9a7']) assert.equal(await read('supportsInterface', [id]), true, id);
assert.equal(await read('contractURI'), 'https://basecity.test/api/nft/collection');
assert.equal(await read('MAX_SUPPLY'), 5n);

// --- a buyer claims their Blockies with the ledger's signature
const aliceSig = await sign(alice, [1, 2]);
let r = ok(await send(alice, 'claim', aliceSig));
assert.equal(await read('ownerOf', [1n]), alice.address);
assert.equal(await read('ownerOf', [2n]), alice.address);
assert.equal(await read('totalSupply'), 2n);
assert.equal(await read('tokenURI', [2n]), 'https://basecity.test/api/nft/2');
assert.ok(r.events.some((e) => e.eventName === 'Claimed' && e.args.count === 2n));
console.log(`claim 2 Blockies: ${r.gas} gas`);

// someone else can't use it, a forged or expired one fails, a replay mints nothing
reverts(await send(bob, 'claim', aliceSig), 'BadSignature');
reverts(await send(bob, 'claim', await sign(bob, [3], [], evm.now + 60, eve)), 'BadSignature');
reverts(await send(bob, 'claim', await sign(bob, [3], [], evm.now - 1)), 'Expired');
const tampered = await sign(bob, [3]); tampered[0] = [3n, 4n];
reverts(await send(bob, 'claim', tampered), 'BadSignature');
ok(await send(alice, 'claim', aliceSig));
assert.equal(await read('totalSupply'), 2n);

// --- locked: no transfers, no approvals
reverts(await send(alice, 'transferFrom', [alice.address, bob.address, 1n]), 'Locked');
reverts(await send(alice, 'safeTransferFrom', [alice.address, bob.address, 1n]), 'Locked');
reverts(await send(alice, 'approve', [bob.address, 1n]), 'Locked');
reverts(await send(alice, 'setApprovalForAll', [bob.address, true]), 'Locked');
ok(await send(alice, 'setApprovalForAll', [bob.address, false]));

// --- alice sells: Blocky #2 leaves, burned in the next claim, and its number never comes back
r = ok(await send(bob, 'claim', await sign(bob, [3], [2])));
assert.equal(await read('exists', [2n]), false);
assert.equal(await read('evicted', [2n]), true);
assert.equal(await read('ownerOf', [3n]), bob.address);
assert.equal(await read('totalSupply'), 2n);
assert.equal(await read('totalMinted'), 3n);
assert.ok(r.events.some((e) => e.eventName === 'Evicted' && e.args.id === 2n && e.args.from === alice.address));
ok(await send(alice, 'claim', aliceSig)); // her old signature can't bring it back
assert.equal(await read('exists', [2n]), false);
ok(await send(carol, 'claim', await sign(carol, [4], [2, 99]))); // evicting a gone or unknown Blocky is a no-op
assert.equal(await read('ownerOf', [4n]), carol.address);

// --- owner tools while locked
reverts(await send(eve, 'evict', [[1n]]), 'OwnableUnauthorizedAccount');
reverts(await send(eve, 'setSigner', [eve.address]), 'OwnableUnauthorizedAccount');
reverts(await send(eve, 'unlock'), 'OwnableUnauthorizedAccount');
r = ok(await send(owner, 'setBaseURI', ['https://basecity.xyz/api/nft/']));
assert.ok(r.events.some((e) => e.eventName === 'BatchMetadataUpdate'));
assert.equal(await read('tokenURI', [1n]), 'https://basecity.xyz/api/nft/1');

// --- the supply cap: claims stop at MAX_SUPPLY, and transfers open by themselves a day later
assert.equal(await read('totalSupply'), 3n); // #1 alice, #3 bob, #4 carol
r = ok(await send(carol, 'claim', await sign(carol, [5, 6, 7, 8])));
assert.equal(await read('totalSupply'), 5n);
assert.equal(await read('exists', [7n]), false);
assert.equal(await read('unlocked'), false);
const unlockAt = await read('unlockAt');
assert.equal(unlockAt, BigInt(evm.now + 86400));
assert.ok(r.events.some((e) => e.eventName === 'UnlockScheduled' && e.args.at === unlockAt));
reverts(await send(alice, 'transferFrom', [alice.address, bob.address, 1n]), 'Locked');
reverts(await send(alice, 'approve', [bob.address, 1n]), 'Locked');
// that day is for Blockies whose wallets sold just before: #6 is burned and #7 takes its place
evm.now += 3600;
ok(await send(bob, 'claim', await sign(bob, [7], [6])));
assert.equal(await read('exists', [6n]), false);
assert.equal(await read('ownerOf', [7n]), bob.address);
assert.equal(await read('totalSupply'), 5n);
assert.equal(await read('unlockAt'), unlockAt, 'the unlock is not pushed back');
ok(await send(owner, 'evict', [[5n]])); // the owner can still evict
assert.equal(await read('exists', [5n]), false);
evm.now = Number(unlockAt);
assert.equal(await read('unlocked'), true);

// --- unlocked: transfers and approvals work, nobody can be evicted
ok(await send(alice, 'transferFrom', [alice.address, bob.address, 1n]));
assert.equal(await read('ownerOf', [1n]), bob.address);
ok(await send(bob, 'approve', [carol.address, 1n]));
ok(await send(carol, 'transferFrom', [bob.address, carol.address, 1n]));
ok(await send(carol, 'claim', await sign(carol, [9, 10], [1]))); // nobody can be evicted now
assert.equal(await read('ownerOf', [1n]), carol.address);
assert.equal(await read('exists', [9n]), true); // #5 and #6 left room: one more fits
assert.equal(await read('exists', [10n]), false); // and then it's full
reverts(await send(owner, 'evict', [[1n]]), 'AlreadyUnlocked');
reverts(await send(owner, 'unlock'), 'AlreadyUnlocked');

// --- a fresh collection: the owner can evict and unlock early, rotate the signer, change royalties
await deploy(10000);
ok(await send(alice, 'claim', await sign(alice, [1, 2, 3])));
ok(await send(owner, 'evict', [[3n]]));
assert.equal(await read('exists', [3n]), false);
const newSigner = account(21);
ok(await send(owner, 'setSigner', [newSigner.address]));
reverts(await send(bob, 'claim', await sign(bob, [4])), 'BadSignature');
ok(await send(bob, 'claim', await sign(bob, [4], [], evm.now + 60, newSigner)));
ok(await send(owner, 'setRoyalty', [owner.address, 250]));
assert.deepEqual(await read('royaltyInfo', [1n, 10000n]), [owner.address, 250n]);
ok(await send(owner, 'unlock'));
ok(await send(alice, 'transferFrom', [alice.address, carol.address, 1n]));
// a big claim: 50 Blockies in one transaction
const big = Array.from({ length: 50 }, (_, i) => 100 + i);
r = ok(await send(carol, 'claim', await sign(carol, big, [], evm.now + 1800, newSigner)));
assert.equal(await read('balanceOf', [carol.address]), 51n);
console.log(`claim 50 Blockies: ${r.gas} gas`);
console.log('BaseCityBlockies: all tests pass');
