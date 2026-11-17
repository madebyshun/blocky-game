// Fixed-origin Blue Agent job adapter. No credentials, arbitrary URLs or payment forwarding.
import {client,NFT} from './_store.js';
import {IDENTITY,OWNER_ABI,validateDelivery,deliveryMessage} from '../src/work-protocol.js';
const BASE='https://blueagent.dev/api/jobs';
const validId=id=>/^[a-f0-9]{12}$/.test(id || '');
async function blue(path='',options={}) {
  const r=await fetch(BASE+path,{...options,signal:AbortSignal.timeout(15000)});
  const j=await r.json(); if(!r.ok) throw new Error(j.error || `Job service returned ${r.status}`); return j;
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  try {
    const id=req.query?.id;
    if(id && !validId(id)) return res.status(400).json({error:'Invalid job ID'});
    if(req.method==='GET') return res.status(200).json(await blue(id?`/${id}`:''));
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
    const b=req.body || {};
    if(!validId(id)) return res.status(400).json({error:'Select a job'});
    const {job}=await blue(`/${id}`);
    const why=validateDelivery(b,job); if(why) return res.status(400).json({error:why});
    if(!NFT) return res.status(503).json({error:'NFT contract unavailable; delivery disabled'});
    const [blockyOwner,agentOwner]=await Promise.all([
      client.readContract({address:NFT,abi:OWNER_ABI,functionName:'ownerOf',args:[BigInt(b.tokenId)]}),
      client.readContract({address:IDENTITY,abi:OWNER_ABI,functionName:'ownerOf',args:[BigInt(b.agentId)]}),
    ]);
    if([blockyOwner,agentOwner].some(o=>o.toLowerCase()!==b.signer.toLowerCase())) return res.status(403).json({error:'Connected wallet must own both the Blocky NFT and ERC-8004 identity.'});
    if(!Number.isFinite(Date.parse(b.issuedAt)) || Math.abs(Date.now()-Date.parse(b.issuedAt))>600000) return res.status(400).json({error:'Signature expired; review and sign again.'});
    const message=await deliveryMessage({...b,jobId:id,priceUnits:Math.round(Number(b.priceUsd)*1e6)});
    if(!await client.verifyMessage({address:b.signer,message,signature:b.signature})) return res.status(401).json({error:'Delivery signature does not match.'});
    const body={agentId:String(b.agentId),payTo:b.signer.toLowerCase(),priceUsd:Number(b.priceUsd),preview:b.preview,result:b.result,issuedAt:b.issuedAt,signer:b.signer,signature:b.signature};
    return res.status(201).json(await blue(`/${id}/deliveries`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
  } catch(e) { return res.status(502).json({error:String(e.shortMessage || e.message).slice(0,300)}); }
}
