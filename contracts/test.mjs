// Tests BaseCityBlockies on an in-memory EVM (Cancun, chain id 8453): signed claims, the supply cap,
// free trading from the start, owner tools. Run: npm test (in contracts/).
import assert from 'node:assert/strict';
import { chain, account } from './evm.mjs';
import { claimTypedData } from '../api/_sig.js';

const evm = await chain(); // evm.now: the block time
const [owner, signer, alice, bob, carol, treasury, eve] = [11, 12, 13, 14, 15, 16, 17].map(account);
let C; // the contract
const deploy = async (maxSupply = 5) => (C = await evm.deploy(owner, [owner.address, signer.address, treasury.address, 500, BigInt(maxSupply), 'https://basecity.test/api/nft/', 'https://basecity.test/api/nft/collection']));
const send = (from, fn, args) => evm.send(from, fn, args);
const read = (fn, args) => evm.read(fn, args);
// a claim as the ledger signs it (only ever for citizens)
async function sign(to, ids, { deadline = evm.now + 1800, by = signer } = {}) {
  const sig = await by.signTypedData(claimTypedData({ chainId: 8453, contract: C, to: to.address, ids, deadline }));
  return [ids.map(BigInt), BigInt(deadline), sig];
}
const ok = (r) => { assert.equal(r.error, undefined, r.error); return r; };
const reverts = (r, name) => assert.equal(r.error, name);
const claimed = (r) => r.events.find((e) => e.eventName === 'Claimed')?.args.count ?? 0n;

// --- deploy and metadata
await deploy(5);
assert.equal(await read('name'), 'BaseCity Blockies');
assert.equal(await read('symbol'), 'BCB');
assert.deepEqual(await read('royaltyInfo', [1n, 10000n]), [treasury.address, 500n]);
for (const id of ['0x80ac58cd', '0x5b5e139f', '0x2a55205a', '0x49064906', '0x01ffc9a7']) assert.equal(await read('supportsInterface', [id]), true, id);
assert.equal(await read('contractURI'), 'https://basecity.test/api/nft/collection');
assert.equal(await read('MAX_SUPPLY'), 5n);

// --- a wallet claims its citizens with the ledger's signature
const aliceSig = await sign(alice, [1, 2]);
let r = ok(await send(alice, 'claim', aliceSig));
assert.equal(await read('ownerOf', [1n]), alice.address);
assert.equal(await read('ownerOf', [2n]), alice.address);
assert.equal(await read('totalSupply'), 2n);
assert.equal(await read('tokenURI', [2n]), 'https://basecity.test/api/nft/2');
assert.equal(claimed(r), 2n);
console.log(`claim 2 Blockies: ${r.gas} gas`);

// someone else can't use it, a forged, tampered or expired one fails, a replay mints nothing
reverts(await send(bob, 'claim', aliceSig), 'BadSignature');
reverts(await send(bob, 'claim', await sign(bob, [3], { by: eve })), 'BadSignature');
reverts(await send(bob, 'claim', await sign(bob, [3], { deadline: evm.now - 1 })), 'Expired');
const tampered = await sign(bob, [3]); tampered[0] = [3n, 4n];
reverts(await send(bob, 'claim', tampered), 'BadSignature');
r = ok(await send(alice, 'claim', aliceSig));
assert.equal(claimed(r), 0n);
assert.equal(await read('totalSupply'), 2n);

// --- citizens are ordinary NFTs: transfers and approvals work from the start
ok(await send(alice, 'transferFrom', [alice.address, bob.address, 1n]));
assert.equal(await read('ownerOf', [1n]), bob.address);
ok(await send(bob, 'approve', [carol.address, 1n]));
ok(await send(carol, 'transferFrom', [bob.address, carol.address, 1n]));
assert.equal(await read('ownerOf', [1n]), carol.address);
ok(await send(alice, 'setApprovalForAll', [bob.address, true]));
ok(await send(bob, 'safeTransferFrom', [alice.address, bob.address, 2n]));
assert.equal(await read('ownerOf', [2n]), bob.address);

// --- the supply cap: ids that exist are skipped, claims stop at MAX_SUPPLY
r = ok(await send(bob, 'claim', await sign(bob, [2, 3, 4])));
assert.equal(claimed(r), 2n);
r = ok(await send(carol, 'claim', await sign(carol, [5, 6, 7])));
assert.equal(claimed(r), 1n);
assert.equal(await read('totalSupply'), 5n);
assert.equal(await read('exists', [5n]), true);
assert.equal(await read('exists', [6n]), false);
r = ok(await send(carol, 'claim', await sign(carol, [8])));
assert.equal(claimed(r), 0n);

// --- owner tools: metadata, royalties, a new signer key
for (const [fn, args] of [['setSigner', [eve.address]], ['setBaseURI', ['x']], ['setContractURI', ['x']], ['setRoyalty', [eve.address, 1000]]]) {
  reverts(await send(eve, fn, args), 'OwnableUnauthorizedAccount');
}
r = ok(await send(owner, 'setBaseURI', ['https://basecity.xyz/api/nft/']));
assert.ok(r.events.some((e) => e.eventName === 'BatchMetadataUpdate'));
assert.equal(await read('tokenURI', [1n]), 'https://basecity.xyz/api/nft/1');
r = ok(await send(owner, 'setContractURI', ['https://basecity.xyz/api/nft/collection']));
assert.ok(r.events.some((e) => e.eventName === 'ContractURIUpdated'));
ok(await send(owner, 'setRoyalty', [owner.address, 250]));
assert.deepEqual(await read('royaltyInfo', [1n, 10000n]), [owner.address, 250n]);
reverts(await send(owner, 'setSigner', ['0x0000000000000000000000000000000000000000']), 'ZeroAddress');
await deploy(10000);
const newSigner = account(21);
ok(await send(owner, 'setSigner', [newSigner.address]));
reverts(await send(bob, 'claim', await sign(bob, [4])), 'BadSignature');
ok(await send(bob, 'claim', await sign(bob, [4], { by: newSigner })));

// a big claim: 50 Blockies in one transaction
const big = Array.from({ length: 50 }, (_, i) => 100 + i);
r = ok(await send(carol, 'claim', await sign(carol, big, { by: newSigner })));
assert.equal(await read('balanceOf', [carol.address]), 50n);
console.log(`claim 50 Blockies: ${r.gas} gas`);
console.log('BaseCityBlockies: all tests pass');
