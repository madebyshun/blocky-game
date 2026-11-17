import {toHex} from 'viem';
import {esc} from './site.js';
import {controlMessage,workerGrantMessage,EXIT_SKILL,revokeMessage} from './worker-protocol.js';
export function mountWorkerConsole(el,context,review){
 let token=null,owner=null,state=null,error='',busy=false,ready={};
 let settings={agentId:'',maxPending:2,maxJobsDaily:2,priceUsd:.1,mode:'review'};
 const getOwner=()=>context().account?.toLowerCase();
 const auth=()=>({authorization:`Bearer ${token}`,'content-type':'application/json'});
 async function call(body){const r=await fetch('/api/worker',{method:body?'POST':'GET',headers:auth(),...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Worker unavailable');return j;}
 async function signed(action,opts={}){const c=context();if(!c.account||!c.provider)throw new Error('Connect owner wallet');const b={owner:getOwner(),action,issuedAt:new Date().toISOString(),settings:opts};b.signature=await c.provider.request({method:'personal_sign',params:[toHex(controlMessage(b)),c.account]});if(getOwner()!==b.owner)throw new Error('Wallet changed');return call(b);}
 function capture(){const f=el.querySelector('form');if(f)for(const k of Object.keys(settings))settings[k]=f.elements[k].value;}
 function draw(){
  if(getOwner()!==owner){owner=getOwner();token=null;state=null;error='';settings.agentId='';}
  el.innerHTML=`<div class="work-title"><div><span class="research-eyebrow">AUTOMATION · BASE 8453</span><h3>Your research worker</h3></div><a href="https://app.blueagent.dev/jobs" target="_blank" rel="noopener">Hire a researcher ↗</a></div><p>One worker per wallet. Base exit research only. Public data and read-only quotes; $0 paid-tool budget. No token approvals, trades or guaranteed income.</p>
  <div class="agent-acts"><button class="btn" data-worker="unlock" ${busy?'disabled':''}>${token?'Renew session':'Unlock worker controls'}</button>${token?`<button class="btn" data-worker="refresh" ${busy?'disabled':''}>Refresh</button><button class="btn" data-worker="run" ${busy?'disabled':''}>Run one cycle</button><button class="btn" data-worker="pause" ${busy?'disabled':''}>Pause worker</button>`:''}</div>
  ${token?`<form id="worker-settings"><label>ERC-8004 agent ID<input name="agentId" type="text" value="${esc(settings.agentId)}" required inputmode="numeric"></label><label>Mode<select name="mode"><option value="review"${settings.mode==='review'?' selected':''}>Auto research → review before submit</option><option value="auto"${settings.mode==='auto'?' selected':''}>Auto research + scoped auto-submit</option></select></label><label>Reports per UTC day<input name="maxJobsDaily" type="number" min="1" max="5" value="${esc(settings.maxJobsDaily)}"></label><label>Maximum pending reports<input name="maxPending" type="number" min="1" max="5" value="${esc(settings.maxPending)}"></label><label>Delivery price · USDC<input name="priceUsd" type="number" min="0.01" max="1" step="0.01" value="${esc(settings.priceUsd)}"></label><p>Worker uses Blocky #${context().tokenId||'—'}. Authorization expires within 24 hours. Auto-submit allows at most 5 deliveries; payout stays with your wallet. New settings replace the current worker.</p><button class="btn primary" type="submit" ${busy?'disabled':''}>Review permissions & enable</button></form>
  <p>Worker: <b>${state?.enabled?'Enabled':'Paused'}</b> · Scheduler ${ready.schedulerReady?'configured':'not configured'} · Auto-submit ${ready.autoReady?'server key available':'requires server encryption key'} · Storage ${ready.storageReady?'available':'unavailable'}</p>`:''}
  <p role="status" class="${error?'bad':''}">${esc(error||'')}</p>
  ${state?`<div class="worker-earnings"><b>${((state.items||[]).reduce((sum,i)=>sum+(i.receipt?.amountUnits||0),0)/1e6).toFixed(2)} USDC verified received</b><span>Paid tool cost: 0 USDC · net after paid tools equals verified receipts. Infrastructure costs excluded. Refresh to update receipt status.</span></div><h4>Activity & review queue</h4>${(state.items||[]).map((i,n)=>`<article><b>${esc(i.title)}</b><p>${esc(i.status)} · ${esc(i.createdAt)}${i.error?` · ${esc(i.error)}`:''}</p>${i.result?`<details><summary>Research report</summary><pre>${esc(i.result)}</pre></details>`:''}${['Needs review','Failed'].includes(i.status)?`<button class="btn" data-worker="discard" data-index="${n}">Discard / allow fresh research</button>`:''}${i.status==='Needs review'?`<button class="btn" data-worker="review" data-index="${n}">Review & prepare delivery</button>`:''}${i.receipt?`<a href="https://basescan.org/tx/${esc(i.receipt.tx)}" target="_blank" rel="noopener">Payment receipt ↗</a>`:''}</article>`).join('')||'<p>No work yet. Enable, then run a cycle or wait for the scheduler.</p>'}<details><summary>Worker log</summary>${(state.log||[]).map(l=>`<p>${esc(l.at)} · ${esc(l.event)} · ${esc(l.detail)}</p>`).join('')}</details>`:''}`;
 }
 async function refresh(){const j=await call();state=j.state;ready=j;}
 el.addEventListener('click',async e=>{
  const action=e.target.closest('[data-worker]')?.dataset.worker;if(!action||busy)return;capture();busy=true;error='';draw();
  try{
   if(action==='unlock'){token=(await signed('session')).token;await refresh();if(state?.settings)settings={...settings,agentId:state.settings.agentId,maxPending:state.settings.maxPending,maxJobsDaily:state.settings.maxJobsDaily,priceUsd:state.settings.priceUnits/1e6,mode:state.settings.mode};}
   if(action==='refresh')await refresh();
   if(action==='run'){state=(await call({action:'run'})).state;await refresh();}
   if(action==='pause'){
    state=(await signed('pause')).state;
    if(state?.grant){const g=state.grant,issuedAt=new Date().toISOString(),signature=await context().provider.request({method:'personal_sign',params:[toHex(revokeMessage(g.agentId,g.nonce,issuedAt)),owner]});const r=await fetch('/api/worker-revoke',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({owner,agentId:g.agentId,nonce:g.nonce,issuedAt,signature})});if(!r.ok)throw new Error('Worker paused locally. Upstream revocation failed; retry or wait for delegation expiry.');}
   }
   if(action==='discard'){const item=state.items[Number(e.target.closest('[data-index]').dataset.index)];state=(await call({action:'discard',jobId:item.jobId})).state;}
   if(action==='review'){const item=state.items[Number(e.target.closest('[data-index]').dataset.index)];await review(item,state.settings);}
  }catch(e){error=e.shortMessage||e.message;}finally{busy=false;draw();}
 });
 el.addEventListener('submit',async e=>{if(e.target.id!=='worker-settings')return;e.preventDefault();if(busy)return;capture();busy=true;error='';draw();try{
  const opts={...settings,tokenId:context().tokenId};
  if(settings.mode==='auto'){
   if(!ready.protocolReady)throw new Error('Blue Agent worker protocol is not deployed; use review mode.');
   if(!ready.autoReady)throw new Error('Configure server encryption key first, or select review mode.');
   const prepared=await signed('prepare');
   const grant={owner,delegate:prepared.delegate,agentId:String(settings.agentId),payTo:owner,skill:EXIT_SKILL,maxDeliveries:5,expiresAt:new Date(Date.now()+23*3600000).toISOString(),nonce:prepared.nonce};
   grant.signature=await context().provider.request({method:'personal_sign',params:[toHex(workerGrantMessage(grant)),owner]});opts.grant=grant;
  }
  state=(await signed('enable',opts)).state;await refresh();
 }catch(e){error=e.shortMessage||e.message;}finally{busy=false;draw();}});
 document.addEventListener('blocky-delivery-submitted',async e=>{if(!token)return;try{await call({action:'submitted',jobId:e.detail.jobId,deliveryId:e.detail.deliveryId});await refresh();draw();}catch{}});
 draw();return {refresh:()=>{capture();draw();}};
}
