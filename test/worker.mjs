import assert from 'node:assert/strict';
import {workerSettings,controlMessage,workerGrantMessage} from '../src/worker-protocol.js';
import {eligible} from '../api/_worker-engine.js';
const opts={tokenId:717,agentId:'1204128',maxPending:2,maxJobsDaily:2,priceUsd:.1};
assert.equal(workerSettings(opts).maxDailyCostUnits,0);
assert.throws(()=>workerSettings({...opts,maxPending:99}));
assert.throws(()=>workerSettings({...opts,priceUsd:NaN}));
assert.throws(()=>workerSettings({...opts,agentId:'bad'}));
const owner='0x'+'1'.repeat(40),s={owner,settings:workerSettings(opts),items:[]},job={id:'a',title:'Trending tokens on Base I can still exit',brief:'List trending tokens on Base',poster:'0x'+'2'.repeat(40),status:'open',budgetUnits:500000,deliveries:[]};
assert.ok(eligible(job,s));assert.ok(!eligible({...job,title:'Transfer my money'},s));assert.ok(!eligible({...job,brief:'Also compare Robinhood'},s));assert.ok(!eligible({...job,poster:owner},s));assert.ok(!eligible(job,{...s,items:[{jobId:'a'}]}));
assert.notEqual(controlMessage({owner,action:'enable',issuedAt:'t',settings:opts}),controlMessage({owner,action:'pause',issuedAt:'t',settings:opts}));
const grant={owner,delegate:'0x'+'2'.repeat(40),agentId:'12',payTo:owner,skill:'base-token-exit-screen',maxDeliveries:2,expiresAt:'t',nonce:'a'.repeat(32)};
assert.notEqual(workerGrantMessage(grant),workerGrantMessage({...grant,payTo:grant.delegate}));
console.log('worker: scope, budget, duplicates and control binding pass');
// Storage session boundaries, lease exclusion and encrypted delegate integrity.
{
 const W=await import('../api/_worker-store.js');
 const token=await W.session(owner);assert.equal(await W.sessionOwner(token),owner);assert.equal(await W.sessionOwner('bad'),null);
 const release=await W.lock(owner);assert.ok(release);assert.equal(await W.lock(owner),null);await release();const second=await W.lock(owner);assert.ok(second);await second();
 const old=process.env.WORKER_ENCRYPTION_KEY;process.env.WORKER_ENCRYPTION_KEY='22'.repeat(32);
 const encrypted=W.seal('a private delegate');assert.equal(W.unseal(encrypted),'a private delegate');assert.throws(()=>W.unseal({...encrypted,tag:'00'.repeat(16)}));
 assert.equal(W.publicState({owner,delegateKey:encrypted}).delegateKey,undefined);
 if(old===undefined)delete process.env.WORKER_ENCRYPTION_KEY;else process.env.WORKER_ENCRYPTION_KEY=old;
}
console.log('worker: sessions, lease and encrypted key integrity pass');
// Exercise authenticated control handler with real signatures; all RPC and upstream reads are stubbed.
{
 const {privateKeyToAccount}=await import('viem/accounts');
 const {verifyMessage}=await import('viem');
 const {client}=await import('../api/_store.js');
 const handler=(await import('../api/worker.js')).default;
 const oldVerify=client.verifyMessage,oldRead=client.readContract,oldFetch=globalThis.fetch;
 const account=privateKeyToAccount('0x'+'11'.repeat(32));
 client.verifyMessage=args=>verifyMessage(args);client.readContract=async()=>account.address;
 globalThis.fetch=async()=>({ok:true,json:async()=>({workerProtocol:1})});
 const request=async req=>{let status=200,body;const res={setHeader(){},status(n){status=n;return this;},json(j){body=j;return this;}};await handler({headers:{},query:{},...req},res);return {status,body};};
 const b={owner:account.address.toLowerCase(),action:'session',issuedAt:new Date().toISOString(),settings:{}};
 b.signature=await account.signMessage({message:controlMessage(b)});
 const session=await request({method:'POST',body:b});assert.equal(session.status,200);assert.match(session.body.token,/^[a-f0-9]{64}$/);
 assert.equal((await request({method:'POST',body:b})).status,409,'signed controls cannot replay');
 assert.equal((await request({method:'GET'})).status,401);
 assert.equal((await request({method:'GET',headers:{authorization:`Bearer ${session.body.token}`}})).status,200);
 const tampered={...b,action:'enable'};assert.equal((await request({method:'POST',body:tampered})).status,401);
 client.verifyMessage=oldVerify;client.readContract=oldRead;globalThis.fetch=oldFetch;
}
console.log('worker: real signature controls, replay and private session access pass');
{
 const W=await import('../api/_worker-store.js');
 await W.write({owner,version:1,enabled:true});
 await W.write({owner,version:2,enabled:false});
 assert.equal(await W.writeIf({owner,version:1,enabled:true},1),false);
 assert.equal((await W.read(owner)).enabled,false,'an in-flight cycle cannot overwrite pause');
}
console.log('worker: pause compare-and-set pass');

// an agent id typed the way the site shows it ("#1205445") reads as its digits; the two errors say which field
{
  const assert = (await import('node:assert/strict')).default;
  assert.equal(workerSettings({ tokenId: 718, agentId: '#1205445' }).agentId, '1205445');
  assert.equal(workerSettings({ tokenId: 718, agentId: ' 1205445 ' }).agentId, '1205445');
  assert.throws(() => workerSettings({ tokenId: 718, agentId: 'abc' }), /agent ID: digits only/);
  assert.throws(() => workerSettings({ agentId: '1205445' }), /claimed Blocky/);
  console.log('worker: "#1205445" accepted, field errors named');
}
