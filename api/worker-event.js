import {createHmac,timingSafeEqual} from 'node:crypto';
import {tick} from './_worker-engine.js';
import {get,set,prefix,hash} from './_worker-store.js';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const b=req.body||{},key=process.env.WORKER_WEBHOOK_SECRET,sig=req.headers['x-worker-signature'];
 if(!key||!/^[0-9a-f]{64}$/.test(sig||''))return res.status(401).json({error:'Unauthorized event'});
 const expected=createHmac('sha256',key).update(JSON.stringify(b)).digest();
 if(!timingSafeEqual(expected,Buffer.from(sig,'hex'))||!Number.isFinite(b.timestamp)||Math.abs(Date.now()-b.timestamp)>300000||!/^0x[0-9a-f]{40}$/i.test(b.owner||''))return res.status(401).json({error:'Invalid event'});
 try{const id=`${prefix}:event:${hash(sig)}`;if(await get(id))return res.status(200).json({duplicate:true});await set(id,true,600);await tick(b.owner.toLowerCase(),{syncOnly:true});return res.status(200).json({received:true});}catch{return res.status(503).json({error:'Retry via polling'});}
}
