import {randomBytes} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {client,useKv,kv} from './_store.js';
import {workerSettings,controlMessage,workerGrantMessage} from '../src/worker-protocol.js';
import {get,set,read,write,session,sessionOwner,owners,index,hash,prefix,seal,publicState} from './_worker-store.js';
import {assertOwners,tick,log,blue} from './_worker-engine.js';
export const config={maxDuration:60};
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');try{
 if(req.method==='GET'&&req.query?.cron==='1'){
  if(!process.env.CRON_SECRET||req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({error:'Unauthorized scheduler'});
  const list=await owners();if(!list.length)return res.status(200).json({processed:0});
  // Round-robin one worker per invocation keeps research within the function runtime budget.
  const cursor=(await get(`${prefix}:cursor`))||0;await set(`${prefix}:cursor`,cursor+1);const state=await tick(list[cursor%list.length]);return res.status(200).json({processed:1,status:state?.enabled?'enabled':'paused'});
 }
 if(req.method==='GET'){
  const owner=await sessionOwner(req.headers.authorization?.replace(/^Bearer /,''));if(!owner)return res.status(401).json({error:'Worker session expired (sessions last 1 hour): click Renew session to sign in again'});
  let protocolReady=false;try{protocolReady=(await blue('/feed')).workerProtocol===1;}catch{}
  return res.status(200).json({protocolReady,state:publicState(await read(owner)),schedulerReady:Boolean(process.env.CRON_SECRET),autoReady:Boolean(process.env.WORKER_ENCRYPTION_KEY),storageReady:useKv()||!process.env.VERCEL});
 }
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const b=req.body||{};
 // Running a cycle can use a short-lived session; it never authorizes new spending or delegation.
 if(b.action==='discard'){
  const owner=await sessionOwner(req.headers.authorization?.replace(/^Bearer /,''));if(!owner)return res.status(401).json({error:'Worker session expired (sessions last 1 hour): click Renew session to sign in again'});
  const s=await read(owner),item=s?.items.find(i=>i.jobId===b.jobId&&['Needs review','Failed'].includes(i.status));if(!item)return res.status(400).json({error:'Only unsubmitted reports can be discarded'});item.status='Skipped';s.version++;log(s,'Skipped','Owner discarded report; a later cycle may research it again');await write(s);return res.status(200).json({state:publicState(s)});
 }
 if(b.action==='submitted'){
  const owner=await sessionOwner(req.headers.authorization?.replace(/^Bearer /,''));if(!owner)return res.status(401).json({error:'Worker session expired (sessions last 1 hour): click Renew session to sign in again'});
  const s=await read(owner),item=s?.items.find(i=>i.jobId===b.jobId);if(!item)return res.status(404).json({error:'No research record'});
  const {job}=await blue(`/${item.jobId}`),d=job.deliveries.find(d=>d.id===b.deliveryId&&d.agent.toLowerCase()===owner);
  if(!d)return res.status(400).json({error:'Delivery not found for this wallet'});item.deliveryId=d.id;item.status='Submitted';s.version++;await write(s);return res.status(200).json({ok:true});
 }
 if(b.action==='run'){
  const owner=await sessionOwner(req.headers.authorization?.replace(/^Bearer /,''));if(!owner)return res.status(401).json({error:'Worker session expired (sessions last 1 hour): click Renew session to sign in again'});
  return res.status(200).json({state:publicState(await tick(owner))});
 }
 if(!/^0x[0-9a-f]{40}$/i.test(b.owner||'')||!Number.isFinite(Date.parse(b.issuedAt))||Math.abs(Date.now()-Date.parse(b.issuedAt))>600000)return res.status(400).json({error:'Invalid or expired control request'});
 b.owner=b.owner.toLowerCase();const message=controlMessage(b);
 if(!await client.verifyMessage({address:b.owner,message,signature:b.signature}))return res.status(401).json({error:'Invalid worker control signature'});
 const replay=`${prefix}:control:${hash(b.signature)}`;
 if(useKv()){if(await kv('SET',replay,'1','NX','EX',600)!=='OK')return res.status(409).json({error:'Control request already used'});}else{if(await get(replay))return res.status(409).json({error:'Control request already used'});await set(replay,true,600);}
 if(b.action==='session')return res.status(200).json({token:await session(b.owner)});
 const s=(await read(b.owner))||{owner:b.owner,enabled:false,version:0,items:[],log:[]};
 if(b.action==='prepare'){
  const secret=generatePrivateKey();s.delegateKey=seal(secret);s.delegateAddress=privateKeyToAccount(secret).address;s.enabled=false;s.grant=null;s.version++;await write(s);
  return res.status(200).json({delegate:s.delegateAddress,nonce:randomBytes(16).toString('hex')});
 }
 if(b.action==='pause'){s.enabled=false;s.version++;log(s,'Paused','Stopped by owner; in-flight network requests may finish');await write(s);return res.status(200).json({state:publicState(s),token:await session(b.owner)});} // a wallet-signed action renews the session too: an hour-old one must not lock the owner out
 if(b.action==='enable'){
  const settings=workerSettings(b.settings||{});await assertOwners(b.owner,settings.tokenId,settings.agentId);
  s.settings=settings;s.expiresAt=new Date(Date.now()+24*3600000).toISOString();s.enabled=true;s.version++;
  if(settings.mode==='auto'){
   if((await blue('/feed')).workerProtocol!==1)throw new Error('Blue Agent worker protocol is not deployed yet; use review mode.');
   const g=b.settings.grant;
   if(!s.delegateKey||!g||g.delegate?.toLowerCase()!==s.delegateAddress.toLowerCase()||g.owner?.toLowerCase()!==b.owner||g.payTo?.toLowerCase()!==b.owner||g.agentId!==settings.agentId||g.skill!==settings.skill||!/^[a-f0-9]{32}$/.test(g.nonce||'')||!Number.isInteger(g.maxDeliveries)||g.maxDeliveries<1||g.maxDeliveries>10||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=Date.now()||Date.parse(g.expiresAt)>Date.now()+24*3600000)throw new Error('Invalid worker delegation');
   if(!await client.verifyMessage({address:b.owner,message:workerGrantMessage(g),signature:g.signature}))throw new Error('Invalid delegation signature');s.grant=g;s.expiresAt=g.expiresAt;
  }else{s.grant=null;}
  log(s,'Enabled',`${settings.mode}; free data only, $0 paid-tool budget`);await write(s);await index(b.owner);return res.status(200).json({state:publicState(s),token:await session(b.owner)});
 }
 return res.status(400).json({error:'Unsupported worker action'});
 }catch(e){return res.status(400).json({error:String(e.shortMessage||e.message).slice(0,500)});}}
