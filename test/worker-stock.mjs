import assert from 'node:assert/strict';
import {eligible} from '../api/_worker-engine.js';
import {tickerOf,supportsStockJob,researchStock} from '../api/_worker-stock.js';
const owner='0x'+'1'.repeat(40),s={owner,items:[],settings:{priceUnits:100000}};
const job={id:'j1',status:'open',title:'NVDA weekend gap',brief:'Ticker: NVDA',poster:'0x'+'2'.repeat(40),deliveries:[],budgetUnits:500000,contract:{skill:'stock-weekend-gap',chainId:8453}};
assert.equal(tickerOf(job),'NVDA');assert.equal(tickerOf({contract:{inputs:{ticker:'tsla'}}}),'TSLA');
assert.ok(eligible(job,s));assert.ok(!eligible({...job,contract:{skill:'stock-weekend-gap',chainId:4663}},s));
assert.ok(!eligible({...job,brief:'no ticker'},s));assert.ok(!supportsStockJob({...job,contract:{skill:'other'}}));
const data={stocks:[{ticker:'NVDA',name:'NVIDIA',address:'0xb2',nav:180,multiplier:1}],nyse:{open:false},
 week:{hours:168,closedShare:0.6,tickers:{NVDA:{n24:3,usd24:900,n7:20,usd7:5000}}},
 weekend:{call:{provisional:false,rows:[{ticker:'NVDA',move:1.5,call:'up',dex:182.7,close:180}]}}};
const hood={rows:[{contract:'0xb2',oracle_usd:180,dex_usd:182.7,pool_ref:'0xp',oracle_updated_at:1}]};
const f=async(u)=>({ok:true,json:async()=>String(u).includes('hood-live')?hood:data});
for(const skill of ['stock-weekend-gap','stock-after-hours-volume','stock-nav-premium']){
 const r=await researchStock({...job,contract:{skill}},{fetchImpl:f,site:'x'});assert.ok(r.result.includes('NVDA')&&r.preview&&r.costUnits===0,skill);}
const r=await researchStock({...job,contract:{skill:'stock-nav-premium'}},{fetchImpl:f,site:'x'});assert.ok(r.preview.includes('1.50%'));
await assert.rejects(researchStock({...job,brief:'Ticker: ZZZZ'},{fetchImpl:f,site:'x'}));
await assert.rejects(researchStock({...job,contract:{skill:'stock-nav-premium',inputs:{ticker:'NVDA',token:'0x'+'3'.repeat(40)}}},{fetchImpl:f,site:'x'}),/not Coinbase/);
const s2={...s,settings:{priceUnits:100000,agentId:'7'}};
assert.ok(!eligible({...job,invitedAgentId:'9'},s2));assert.ok(eligible({...job,invitedAgentId:'7'},s2));
assert.ok(eligible({...job,invitedAgentId:'9',inviteExpiresAt:'2000-01-01T00:00:00Z'},s2));
console.log('worker-stock ok');
