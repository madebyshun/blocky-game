import {toHex} from 'viem';
import {esc} from './site.js';
import {agentIdOf,controlMessage,workerGrantMessage,EXIT_SKILL,revokeMessage} from './worker-protocol.js';
import {linkedAgentId,linkAgentId} from './agent-id.js';
// Cost ledger: tool spend from each report's costUnits (target $0), infra on free tiers, earnings from
// verified payouts only. "Stack my earnings" buys stocks with it later, from the owner's own wallet.
function ledger(items,earned){const spent=items.reduce((n,i)=>n+(i.costUnits||0),0)/1e6,net=earned-spent;
 return `<div class="wk-ledger"><h4>Profit & loss</h4><div><span>Earned (verified payouts)</span><b>$${earned.toFixed(2)}</b></div><div><span>Tool spend</span><b>$${spent.toFixed(2)}</b></div><div><span>Running cost (free tiers)</span><b>$0.00</b></div><div class="wk-net"><span>Net</span><b>${net<0?'-':''}$${Math.abs(net).toFixed(2)}</b></div>
 <button class="btn" disabled title="Buys tokenized stocks from your own wallet; BaseCity never holds funds">🧱 Stack my earnings${earned>0?` ($${earned.toFixed(2)})`:''} · coming soon</button><p class="wk-note">Turns payouts into Blocky 10 stocks from your own wallet, and your tower on Blocky Street grows a floor. Not offered to U.S. persons.</p></div>`;}
export function mountWorkerConsole(el,context,review){
 let token=null,owner=null,state=null,error='',busy=false,ready={},editing=false;
 let settings={agentId:'',maxPending:2,maxJobsDaily:2,priceUsd:.1,mode:'review'};
 const getOwner=()=>context().account?.toLowerCase();
 const auth=()=>({authorization:`Bearer ${token}`,'content-type':'application/json'});
 async function call(body){const r=await fetch('/api/worker',{method:body?'POST':'GET',headers:auth(),...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Worker unavailable');return j;}
 async function signed(action,opts={}){const c=context();if(!c.account||!c.provider)throw new Error('Connect owner wallet');const b={owner:getOwner(),action,issuedAt:new Date().toISOString(),settings:opts};b.signature=await c.provider.request({method:'personal_sign',params:[toHex(controlMessage(b)),c.account]});if(getOwner()!==b.owner)throw new Error('Wallet changed');const j=await call(b);if(j.token)token=j.token;return j;} // signed actions hand back a fresh session
 function capture(){const f=el.querySelector('#worker-settings');if(f)for(const k of Object.keys(settings))settings[k]=f.elements[k].value;settings.agentId=agentIdOf(settings.agentId);} // "#1205445" as the site shows it reads as 1205445
 function draw(){
  if(getOwner()!==owner){owner=getOwner();token=null;state=null;error='';editing=false;settings.agentId=linkedAgentId(owner);}
  if(!settings.agentId)settings.agentId=linkedAgentId(owner);
  const on=!!state?.enabled&&!!state?.settings, st=state?.settings;
  const last=(state?.log||[])[0];
  const when=(iso)=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';};
  const lastLine=last?`${when(last.at)} · ${last.event==='Idle'?'checked the job board: no matching job yet (it takes Base token exit and stock research jobs: weekend gap, after-hours volume, NAV premium)':`${last.event}${last.detail?` · ${last.detail}`:''}`}`:'';
  const form=`<form id="worker-settings"><label>ERC-8004 agent ID<input name="agentId" type="text" value="${esc(settings.agentId)}" required inputmode="numeric" placeholder="e.g. 1205445"></label><label>Mode<select name="mode"><option value="review"${settings.mode==='review'?' selected':''}>Research, I review before submitting</option><option value="auto"${settings.mode==='auto'?' selected':''}>Research and submit by itself (max 5)</option></select></label><label>Reports per day<input name="maxJobsDaily" type="number" min="1" max="5" value="${esc(settings.maxJobsDaily)}"></label><label>Waiting for review, at most<input name="maxPending" type="number" min="1" max="5" value="${esc(settings.maxPending)}"></label><label>Price per report · USDC<input name="priceUsd" type="number" min="0.01" max="1" step="0.01" value="${esc(settings.priceUsd)}"></label><p>Runs as Blocky #${context().tokenId||'—'} for 24 hours, then asks again. Payouts go to your wallet.</p><div class="agent-acts"><button class="btn primary" type="submit" ${busy?'disabled':''}>${on?'Save & restart worker':'Start worker'}</button>${on?'<button class="btn" type="button" data-worker="cancel-edit">Cancel</button>':''}</div></form>`;
  const card=on?`<div class="wk-card"><div class="wk-head"><span class="wk-dot"></span><b>Running</b><span>Blocky #${st.tokenId} · agent #${esc(st.agentId)} · ${st.mode==='auto'?'submits by itself':'you review each report'} · up to ${st.maxJobsDaily}/day · $${(st.priceUnits/1e6).toFixed(2)} a report</span></div>${lastLine?`<p class="wk-last">Last activity: ${esc(lastLine)}</p>`:''}${state.expiresAt?`<p class="wk-last">Runs until ${esc(when(state.expiresAt))}</p>`:''}<div class="agent-acts"><button class="btn primary" data-worker="run" ${busy?'disabled':''}>${busy?'Working…':'Run now'}</button><button class="btn" data-worker="edit" ${busy?'disabled':''}>Edit settings</button><button class="btn" data-worker="pause" ${busy?'disabled':''}>Pause</button><button class="btn" data-worker="refresh" ${busy?'disabled':''}>Refresh</button></div></div>`:'';
  const items=state?.items||[], review=items.filter(i=>i.status==='Needs review').length, earned=items.reduce((sum,i)=>sum+(i.receipt?.amountUnits||0),0)/1e6;
  el.innerHTML=`<div class="work-title"><div><span class="research-eyebrow">AUTO WORKER · BASE</span><h3>Let your Blocky research on its own</h3></div><a href="https://app.blueagent.dev/jobs" target="_blank" rel="noopener">Blue Agent jobs ↗</a></div><p>It checks Blue Agent's job board, researches Base token exits and Coinbase stock jobs (weekend gap, after-hours volume, NAV premium) with free public data, and ${settings.mode==='auto'?'submits':'waits for your review before submitting'}. It never spends, trades or approves tokens.</p>
  ${!token?`<div class="agent-acts"><button class="btn primary" data-worker="unlock" ${busy?'disabled':''}>${busy?'Waiting for wallet…':'Open worker (sign in with wallet)'}</button></div>`:`${card}${!on||editing?form:''}`}
  <p role="status" class="${error?'bad':''}">${esc(error||'')}</p>
  ${state?`<div class="wk-stats"><div><b>${items.length}</b><span>reports</span></div><div><b>${review}</b><span>to review</span></div><div><b>${earned.toFixed(2)}</b><span>USDC received (verified)</span></div></div>${ledger(items,earned)}
  <h4>Reports</h4>${items.map((i,n)=>`<article class="wk-item"><b>${esc(i.title)}</b><p>${esc(i.status)} · ${esc(when(i.createdAt))}${i.error?` · ${esc(i.error)}`:''}</p>${i.result?`<details><summary>Read the report</summary><pre>${esc(i.result)}</pre></details>`:''}<div class="agent-acts">${i.status==='Needs review'?`<button class="btn primary" data-worker="review" data-index="${n}">Review & submit</button>`:''}${['Needs review','Failed'].includes(i.status)?`<button class="btn" data-worker="discard" data-index="${n}">Discard</button>`:''}${i.receipt?`<a href="https://basescan.org/tx/${esc(i.receipt.tx)}" target="_blank" rel="noopener">Payment ↗</a>`:''}</div></article>`).join('')||`<p>No reports yet.${on?' Press Run now, or it checks again on its own.':''}</p>`}
  <details class="wk-log"><summary>Worker log</summary>${(state.log||[]).map(l=>`<p>${esc(when(l.at))} · ${esc(l.event)} · ${esc(l.detail)}</p>`).join('')}<p class="wk-tech">Scheduler ${ready.schedulerReady?'on':'off'} · auto-submit ${ready.autoReady?'available':'unavailable'} · storage ${ready.storageReady?'ok':'unavailable'}</p></details>`:''}`;
 }
 async function refresh(){const j=await call();state=j.state;ready=j;}
 el.addEventListener('click',async e=>{
  const action=e.target.closest('[data-worker]')?.dataset.worker;if(!action||busy)return;capture();busy=true;error='';draw();
  try{
   if(action==='unlock'){token=(await signed('session')).token;await refresh();if(state?.settings){linkAgentId(owner,state.settings.agentId);}if(state?.settings)settings={...settings,agentId:state.settings.agentId,maxPending:state.settings.maxPending,maxJobsDaily:state.settings.maxJobsDaily,priceUsd:state.settings.priceUnits/1e6,mode:state.settings.mode};}
   if(action==='refresh')await refresh();
   if(action==='edit')editing=true;
   if(action==='cancel-edit')editing=false;
   if(action==='run'){state=(await call({action:'run'})).state;await refresh();}
   if(action==='pause'){
    state=(await signed('pause')).state;
    if(state?.grant){const g=state.grant,issuedAt=new Date().toISOString(),signature=await context().provider.request({method:'personal_sign',params:[toHex(revokeMessage(g.agentId,g.nonce,issuedAt)),owner]});const r=await fetch('/api/worker-revoke',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({owner,agentId:g.agentId,nonce:g.nonce,issuedAt,signature})});if(!r.ok)throw new Error('Worker paused locally. Upstream revocation failed; retry or wait for delegation expiry.');}
   }
   if(action==='discard'){const item=state.items[Number(e.target.closest('[data-index]').dataset.index)];state=(await call({action:'discard',jobId:item.jobId})).state;}
   if(action==='review'){if(context().tokenId!==state.settings.tokenId)throw new Error(`Select Blocky #${state.settings.tokenId} before reviewing its delivery.`);const item=state.items[Number(e.target.closest('[data-index]').dataset.index)];await review(item,state.settings);}
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
  state=(await signed('enable',opts)).state;linkAgentId(owner,settings.agentId);editing=false;await refresh();
 }catch(e){error=e.shortMessage||e.message;}finally{busy=false;draw();}});
 document.addEventListener('blocky-delivery-submitted',async e=>{if(!token)return;try{await call({action:'submitted',jobId:e.detail.jobId,deliveryId:e.detail.deliveryId});await refresh();draw();}catch{}});
 draw();return {refresh:()=>{capture();draw();}};
}
