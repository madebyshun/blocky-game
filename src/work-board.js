import { createPublicClient,http,toHex,decodeEventLog,parseAbi } from 'viem';
import {base} from 'viem/chains';
import {IDENTITY,OWNER_ABI,clean,deliveryMessage,validateDelivery} from './work-protocol.js';
import {esc} from './site.js';
import {linkedAgentId,linkAgentId} from './agent-id.js';
const rpc=createPublicClient({chain:base,transport:http('https://mainnet.base.org')});
const usd=n=>`$${(Number(n||0)/1e6).toFixed(2)}`;
async function api(id='',body) {
 const r=await fetch(`/api/work${id?`?id=${encodeURIComponent(id)}`:''}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});
 const j=await r.json(); if(!r.ok) throw new Error(j.error || 'Jobs unavailable'); return j;
}
export function mountWorkBoard(el,context) {
 let jobs=[],selected=null,identity=null,busy=false,loading=false,error='',status='',draft={preview:'',result:'',priceUsd:''},revision=0,loadedWallet=null,changing=false;
 const owner=()=>context().account?.toLowerCase();
 const key=()=>`blocky-work-submissions:${owner()}`;
 const records=()=>{try{return JSON.parse(localStorage.getItem(key())||'[]');}catch{return [];}};
 const saveRecord=r=>{ const old=records().filter(x=>x.jobId!==r.jobId); localStorage.setItem(key(),JSON.stringify([r,...old].slice(0,100))); };
 function draw() {
  const c=context(),wallet=owner();
  if(loadedWallet!==wallet){loadedWallet=wallet;identity=null;draft={preview:'',result:'',priceUsd:''};selected=null;status='';error='';revision++;}
  if(!identity&&!changing&&wallet&&linkedAgentId(wallet))identity={id:linkedAgentId(wallet),wallet}; // linked once (here or by the worker); ownership is checked again on submit
  const job=jobs.find(j=>j.id===selected),mine=records();
  el.innerHTML=`<div class="work-title"><div><span class="research-eyebrow">BLOCKY × BLUE AGENT JOBS</span><h3>Put your Blocky to work</h3></div><button class="btn" data-work="load" ${busy||loading?'disabled':''}>${loading?'Loading…':'Refresh jobs & submissions'}</button></div>
   <p class="agent-lede">Deliver research. Earn USDC if the customer pays to unlock it. Budgets are not escrowed; payment is not guaranteed. Tool calls cost money separately.</p>
   ${identity?`<div class="work-identity linked"><span>✓ Agent <b>#${esc(identity.id)}</b> linked to this wallet</span><button class="btn" data-work="unlink" ${busy?'disabled':''}>Change</button></div>`:`<div class="work-identity"><label>ERC-8004 agent ID <input id="work-identity" type="text" inputmode="numeric" placeholder="e.g. 1205445" value=""></label><button class="btn" data-work="verify" ${busy?'disabled':''}>Link agent</button><a href="https://app.blueagent.dev/exchange/create" target="_blank" rel="noopener">No agent yet? Create one ↗</a></div>`}
   ${!wallet?'<p>Connect the wallet that owns your Blocky to deliver work.</p>':''}
   <label class="work-select">Find work <select id="work-job" ${busy?'disabled':''}><option value="">Choose an open job (${jobs.filter(j=>j.status==='open').length})</option>${jobs.filter(j=>j.status==='open').map(j=>`<option value="${esc(j.id)}"${selected===j.id?' selected':''}>${esc(j.title)} · up to ${usd(j.budgetUnits)}</option>`).join('')}</select></label>
   ${job?`<article class="work-brief"><h4>${esc(job.title)}</h4><p class="research-text">${esc(job.brief)}</p><small>Budget ${usd(job.budgetUnits)} · ${job.deliveries?.length||0} submissions · <a href="https://app.blueagent.dev/jobs/${job.id}" target="_blank" rel="noopener">Original job ↗</a></small></article>
   <form id="work-delivery"><h4>Prepare delivery · Blocky #${c.tokenId||'—'}</h4><p>Check every requested chain, source and timestamp. An existing quote is supporting evidence, not an automatically completed job.</p>
   <label>Your price · USDC <input name="priceUsd" type="number" min="0.01" max="${job.budgetUnits/1e6}" step="0.01" required value="${esc(draft.priceUsd)}"></label>
   <label>Public preview · maximum 600 characters<textarea name="preview" maxlength="600" minlength="10" required rows="3">${esc(draft.preview)}</textarea></label>
   <label>Full report · hidden by Blue Agent until purchased<textarea name="result" maxlength="20000" required rows="7">${esc(draft.result)}</textarea></label>
   <button type="button" class="btn" data-work="evidence">Use latest research as evidence</button>
   <p>Payment goes to <b>${esc(wallet||'connect wallet')}</b>. No spending authorization is requested when submitting work.</p>
   <label class="work-check"><input type="checkbox" name="reviewed" required> I checked the job requirements, sources and price. I understand the customer may not purchase this report.</label>
   <button class="btn primary" type="submit" ${busy||!identity||!wallet||!c.tokenId?'disabled':''}>${busy?'Submitting…':'Review in wallet & submit delivery'}</button></form>`:''}
   <p role="status" class="${error?'bad':''}">${esc(error||status)}</p>
   <details class="work-history" open><summary>Your submissions · ${mine.length}</summary><p>Saved on this browser for this wallet. “Unlocked” comes from the marketplace; it is not an independently verified earnings total. Attach the buyer’s payment receipt to verify the matching USDC transfer.</p>${mine.map(r=>`<div><b>${esc(r.title)}</b><span>Blocky #${r.tokenId} · ${usd(r.priceUnits)} · ${r.unlocked?'Customer unlocked · verify receipt on Exchange':'Submitted · awaiting purchase'}</span><a href="https://app.blueagent.dev/jobs/${esc(r.jobId)}" target="_blank" rel="noopener">View job ↗</a>${r.unlocked?`<label>Payment transaction hash <input data-receipt-job="${esc(r.jobId)}" type="text" placeholder="0x…" value="${esc(r.receiptTx||'')}"></label><button class="btn" data-work="receipt" data-job="${esc(r.jobId)}">Verify incoming USDC</button>${r.receiptTx?`<a href="https://basescan.org/tx/${esc(r.receiptTx)}" target="_blank" rel="noopener">Verified matching transfer · ${usd(r.priceUnits)} ↗</a>`:''}`:''}</div>`).join('')||'<p>No deliveries submitted here yet.</p>'}</details>`;
 }
 const capture=()=>{const f=el.querySelector('#work-delivery');if(f)draft=Object.fromEntries(['preview','result','priceUsd'].map(k=>[k,f.elements[k].value]));};
 el.addEventListener('change',e=>{if(e.target.id==='work-job'){capture();selected=e.target.value;draft={preview:'',result:'',priceUsd:''};error='';status='';draw();} if(e.target.id==='work-identity'){identity=null;}});
 el.addEventListener('click',async e=>{
  const action=e.target.closest('[data-work]')?.dataset.work;if(!action)return;
  capture();error='';status='';
  try {
   if(busy || loading) return;
   if(action==='load') {loading=true;draw();jobs=(await api()).jobs||[];const saved=records();for(const r of saved){const j=jobs.find(j=>j.id===r.jobId)||(await api(r.jobId)).job;const d=j?.deliveries?.find(d=>d.id===r.deliveryId);if(d)r.unlocked=Boolean(d.unlocked);}localStorage.setItem(key(),JSON.stringify(saved));loading=false;status='Job board refreshed. No tools were run.';}
   if(action==='receipt') {
    const id=e.target.closest('[data-job]').dataset.job,record=records().find(r=>r.jobId===id);
    const tx=el.querySelector(`[data-receipt-job="${id}"]`).value.trim();
    if(!/^0x[0-9a-f]{64}$/i.test(tx))throw new Error('Enter a Base transaction hash.');
    if(records().some(r=>r.jobId!==id&&r.receiptTx?.toLowerCase()===tx.toLowerCase()))throw new Error('That receipt is already attached to another submission.');
    const {job}=await api(id),delivery=job.deliveries.find(d=>d.id===record.deliveryId);
    if(!delivery?.unlocked)throw new Error('Customer has not unlocked this delivery.');
    const receipt=await rpc.getTransactionReceipt({hash:tx});
    if(receipt.status!=='success')throw new Error('Transaction did not succeed.');
    const abi=parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
    const match=receipt.logs.some(log=>{
     if(log.address.toLowerCase()!=='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')return false;
     try{const {args}=decodeEventLog({abi,data:log.data,topics:log.topics});return args.from.toLowerCase()===job.poster.toLowerCase()&&args.to.toLowerCase()===delivery.payTo.toLowerCase()&&args.to.toLowerCase()===owner()&&args.value===BigInt(delivery.priceUnits);}catch{return false;}
    });
    if(!match)throw new Error('No matching USDC transfer from this job poster to your wallet for the delivery price.');
    const block=await rpc.getBlock({blockNumber:receipt.blockNumber});
    if(Number(block.timestamp)*1000<Date.parse(delivery.at)-1000)throw new Error('This payment predates the delivery.');
    saveRecord({...record,receiptTx:tx});status='Matching incoming payment verified on Base. Job attribution uses the receipt you supplied.';
   }
   if(action==='unlink'){identity=null;changing=true;status='';}
   if(action==='verify') {const id=el.querySelector('#work-identity').value.trim().replace(/^#\s*/,''),wallet=owner();if(!wallet||!/^\d{1,12}$/.test(id))throw new Error('Connect your wallet and enter a valid agent ID.');const who=await rpc.readContract({address:IDENTITY,abi:OWNER_ABI,functionName:'ownerOf',args:[BigInt(id)]});if(who.toLowerCase()!==wallet)throw new Error('This wallet does not own that ERC-8004 identity.');identity={id,wallet};changing=false;linkAgentId(wallet,id);status='Agent linked to this wallet. Ownership is checked again when submitting.';}
   if(action==='evidence'){const result=context().result;if(!result)throw new Error('Run a research tool first. No paid tool runs automatically.');draft.result=typeof result==='string'?result:JSON.stringify(result,null,2);if(draft.result.length>20000)throw new Error('Evidence exceeds 20,000 characters. Summarize it before submitting.');status='Evidence added. Edit the report to meet the entire brief.';}
  }catch(e){error=e.shortMessage||e.message;loading=false;}draw();
 });
 el.addEventListener('submit',async e=>{
  if(e.target.id!=='work-delivery')return;e.preventDefault();capture();error='';status='';
  const c=context(),job=jobs.find(j=>j.id===selected),wallet=owner(),tokenId=c.tokenId,version=revision;
  try{
   if(busy) return;
   if(!identity||identity.wallet!==wallet||!c.provider)throw new Error('Verify your identity with the connected wallet first.');
   draft.preview=clean(draft.preview,600);draft.result=clean(draft.result,20000);
   const b={...draft,agentId:identity.id,tokenId,signer:wallet,payTo:wallet,issuedAt:new Date().toISOString()};
   const why=validateDelivery(b,job);if(why)throw new Error(why);
   busy=true;draw();const fresh=(await api(job.id)).job;const problem=validateDelivery(b,fresh);if(problem)throw new Error(problem);
   const message=await deliveryMessage({...b,jobId:job.id,priceUnits:Math.round(Number(b.priceUsd)*1e6)});
   b.signature=await c.provider.request({method:'personal_sign',params:[toHex(message),wallet]});
   if(owner()!==wallet||revision!==version||context().tokenId!==tokenId)throw new Error('Wallet or Blocky changed; review and submit again.');
   const {delivery}=await api(job.id,b);saveRecord({jobId:job.id,deliveryId:delivery.id,title:job.title,tokenId,priceUnits:delivery.priceUnits,unlocked:false});document.dispatchEvent(new CustomEvent('blocky-delivery-submitted',{detail:{jobId:job.id,deliveryId:delivery.id}}));status='Delivery submitted. Awaiting customer purchase; no earnings recorded yet.';
  }catch(e){error=e.shortMessage||e.message;}finally{busy=false;draw();}
 });
 document.addEventListener('basecity-agent-id',e=>{if(e.detail.wallet===owner()&&!changing){identity={id:e.detail.id,wallet:e.detail.wallet};draw();}}); // the worker linked it
 draw(); return {refresh:()=>{capture();draw();},useDraft:async(item,workerSettings)=>{jobs=(await api()).jobs||[];selected=item.jobId;draft={preview:item.preview,result:item.result,priceUsd:String(workerSettings.priceUnits/1e6),tokenId:item.tokenId,agentId:item.agentId};draw();el.scrollIntoView({behavior:'smooth',block:'start'});}};
}
