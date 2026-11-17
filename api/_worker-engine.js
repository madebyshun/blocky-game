import {privateKeyToAccount} from 'viem/accounts';
import {decodeEventLog,parseAbi} from 'viem';
import {client,NFT} from './_store.js';
import {OWNER_ABI,IDENTITY,deliveryMessage} from '../src/work-protocol.js';
import {reservationMessage} from '../src/worker-protocol.js';
import {read,write,writeIf,lock,unseal} from './_worker-store.js';
import {researchExit} from './_worker-research.js';
import {skillOf,supportsStockJob,researchStock} from './_worker-stock.js';
const base='https://blueagent.dev/api/jobs';
export async function blue(path='',body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok)throw new Error(j.error||`Jobs HTTP ${r.status}`);return j;}
export async function assertOwners(owner,tokenId,agentId){if(!NFT)throw new Error('NFT contract unavailable');for(const [address,id]of [[NFT,tokenId],[IDENTITY,agentId]]){const who=await client.readContract({address,abi:OWNER_ABI,functionName:'ownerOf',args:[BigInt(id)]});if(who.toLowerCase()!==owner.toLowerCase())throw new Error('Ownership changed. Worker is paused.');}}
export function log(s,event,detail){s.log=[{at:new Date().toISOString(),event,detail},...(s.log||[])].slice(0,60);}
export function eligible(job,s){return job.status==='open'&&(skillOf(job)==='base-token-exit-screen'?!/robinhood|ethereum|0x[0-9a-f]{40}/i.test(job.brief):supportsStockJob(job)&&(s.settings.mode!=='auto'||job.contract?.autonomousEligible===true))&&job.poster.toLowerCase()!==s.owner&&!job.deliveries.some(d=>d.agent.toLowerCase()===s.owner)&&!s.items.some(d=>d.jobId===job.id&&d.status!=='Skipped')&&job.budgetUnits>=s.settings.priceUnits;}
async function sync(s,jobs){
 for(const item of s.items.filter(i=>!i.receipt&&i.status!=='Skipped')){
  const job=jobs.find(j=>j.id===item.jobId)||(await blue(`/${item.jobId}`)).job,d=job?.deliveries.find(d=>item.deliveryId?d.id===item.deliveryId:d.agent.toLowerCase()===s.owner&&String(d.agentId)===s.settings.agentId);
  if(d&&!item.deliveryId&&s.items.some(other=>other!==item&&other.deliveryId===d.id))continue;
  if(d&&!item.deliveryId)item.deliveryId=d.id;
  if(!d)continue;item.status=d.unlocked?'Purchased · receipt pending':'Submitted';
  const receipt=d.receipt;if(!receipt?.tx)continue;
  const r=await client.getTransactionReceipt({hash:receipt.tx});if(r.status!=='success')continue;
  const confirmed=await client.getBlockNumber();if(confirmed-r.blockNumber<10n)continue;
  if(s.items.some(i=>i.receipt?.tx===receipt.tx&&i!==item))continue;
  const matches=r.logs.some(l=>{if(l.address.toLowerCase()!=='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')return false;try{const {args}=decodeEventLog({abi:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),topics:l.topics,data:l.data});return args.from.toLowerCase()===job.poster.toLowerCase()&&args.to.toLowerCase()===s.owner&&args.value===BigInt(d.priceUnits);}catch{return false;}});
  if(matches){item.receipt={tx:receipt.tx,amountUnits:d.priceUnits,verifiedAt:new Date().toISOString()};item.status='Paid';log(s,'Paid',`${item.jobId}: ${d.priceUnits/1e6} USDC`);}
 }
}
export async function tick(owner,{syncOnly=false}={}){const release=await lock(owner);if(!release)return {busy:true};try{
 const s=await read(owner);if(!s)return null;const version=s.version;
 const jobs=(await blue()).jobs||[];await sync(s,jobs);
 if(syncOnly||!s.enabled){const latest=await read(owner);if(latest.version===version)await writeIf(s,version);return await read(owner);}
 if(Date.now()>Date.parse(s.expiresAt)){s.enabled=false;log(s,'Paused','Worker authorization expired');await writeIf(s,version);return s;}
 try{await assertOwners(s.owner,s.settings.tokenId,s.settings.agentId);}catch(e){s.enabled=false;log(s,'Paused',e.message);await writeIf(s,version);return s;}
 const pending=s.items.filter(i=>!['Paid','Failed','Skipped'].includes(i.status));
 for(const item of s.items){if(item.status==='Researching'&&Date.now()-Date.parse(item.createdAt)>10*60000){item.status='Failed';item.error='Research timed out; no delivery was sent';}}
 const day=new Date().toISOString().slice(0,10),today=s.items.filter(i=>i.createdAt.startsWith(day));
 if(pending.length>=s.settings.maxPending||today.length>=s.settings.maxJobsDaily){log(s,'Idle','Pending or daily job limit reached');await writeIf(s,version);return s;}
 const job=jobs.find(j=>eligible(j,s));if(!job){log(s,'Idle','No new supported job (exit screen, stock weekend gap, after-hours volume, NAV premium). Repeat deliveries are skipped.');await writeIf(s,version);return s;}
 const before=await read(owner);if(before.version!==version||!before.enabled)return before;
 const item={jobId:job.id,title:job.title,createdAt:new Date().toISOString(),status:'Researching',costUnits:0};s.items.push(item);log(s,'Researching',job.title);if(!await writeIf(s,version))return await read(owner);
 try{
  let delegate=null;
  if(s.settings.mode==='auto'){
   if(!s.grant||Date.now()>=Date.parse(s.grant.expiresAt))throw new Error('Delegation expired or missing');
   delegate=privateKeyToAccount(unseal(s.delegateKey));const issuedAt=new Date().toISOString();const signature=await delegate.signMessage({message:reservationMessage(job.id,s.settings.agentId,issuedAt)});
   await blue(`/${job.id}/reserve`,{agentId:s.settings.agentId,signer:delegate.address,signature,issuedAt,workerGrant:s.grant});
  }
  const report=skillOf(job)==='base-token-exit-screen'?await researchExit(client):await researchStock(job,{client});Object.assign(item,{...report,status:'Needs review'});delete item.evidence;
  if(Date.now()-Date.parse(report.evidence.timestamp)>10*60000)throw new Error('Research expired before submission');
  const current=await read(owner);if(current.version!==version||!current.enabled)return current;
  if(delegate){
   await assertOwners(s.owner,s.settings.tokenId,s.settings.agentId);
   const fresh=(await blue(`/${job.id}`)).job;if(fresh.status!=='open'||fresh.budgetUnits<s.settings.priceUnits)throw new Error('Job changed before submission');
   const b={agentId:s.settings.agentId,payTo:s.owner,priceUsd:s.settings.priceUnits/1e6,preview:report.preview,result:report.result,issuedAt:new Date().toISOString(),signer:delegate.address,workerGrant:s.grant};
   b.signature=await delegate.signMessage({message:await deliveryMessage({...b,jobId:job.id,priceUnits:s.settings.priceUnits})});
   const latest=await read(owner);if(latest.version!==version||!latest.enabled)return latest;
   const {delivery}=await blue(`/${job.id}/deliveries`,b);item.deliveryId=delivery.id;item.status='Submitted';
  }
  log(s,item.status,job.title);
 }catch(e){item.status='Failed';item.error=String(e.shortMessage||e.message).slice(0,500);log(s,'Failed',item.error);}
 const latest=await read(owner);if(latest.version===version&&latest.enabled)await writeIf(s,version);return await read(owner);
 }finally{await release();}}
