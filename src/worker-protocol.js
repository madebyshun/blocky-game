export const EXIT_SKILL='base-token-exit-screen';
export const STOCK_AUTO_SKILLS=['stock-nav-premium','stock-weekend-gap','stock-after-hours-volume'];
export const AUTO_SKILLS=['all',EXIT_SKILL,...STOCK_AUTO_SKILLS];
export function workerGrantMessage(g){return ['Blue Agent worker delegation v1','Domain: blueagent.dev | Base 8453',`owner: ${g.owner.toLowerCase()}`,`delegate: ${g.delegate.toLowerCase()}`,`agent: ${g.agentId}`,`payTo: ${g.payTo.toLowerCase()}`,`skill: ${g.skill}`,`maxDeliveries: ${g.maxDeliveries}`,`expires: ${g.expiresAt}`,`nonce: ${g.nonce}`,'Permission: submit research deliveries only. No spending, transfers, approvals or guaranteed income.'].join('\n');}
export const revokeMessage=(agentId,nonce,issuedAt)=>`Blue Agent revoke worker v1\nDomain: blueagent.dev | Base 8453\nagent: ${agentId}\nnonce: ${nonce}\nissued: ${issuedAt}`;
export const reservationMessage=(jobId,agentId,issuedAt)=>`Blue Agent reserve job v1\nDomain: blueagent.dev | Base 8453\njob: ${jobId}\nagent: ${agentId}\nissued: ${issuedAt}`;
export const controlMessage=b=>`BaseCity worker control v1\nDomain: basecity.space | Base 8453\nWallet: ${b.owner.toLowerCase()}\nAction: ${b.action}\nIssued: ${b.issuedAt}\nSettings: ${JSON.stringify(b.settings||{})}`;
// an ERC-8004 agent id as people write it ("#1205445", " 1205445 ") → its digits
export const agentIdOf=(v)=>String(v??'').trim().replace(/^#\s*/,'');
export function workerSettings(raw){
 const skill=raw.skill?String(raw.skill).trim():EXIT_SKILL;
 if(!AUTO_SKILLS.includes(skill))throw new Error('Unsupported worker skill');
 const s={tokenId:Number(raw.tokenId),agentId:agentIdOf(raw.agentId),maxPending:Number(raw.maxPending??2),maxJobsDaily:Number(raw.maxJobsDaily??2),priceUnits:Math.round(Number(raw.priceUsd??.1)*1e6),mode:raw.mode==='auto'?'auto':'review',maxDailyCostUnits:0,skill,fleet:raw.fleet!==false&&raw.fleet!=='false',perBlockyDaily:Math.min(5,Math.max(1,Number(raw.perBlockyDaily??2)||2))};
 if(!Number.isInteger(s.tokenId)||s.tokenId<1||s.tokenId>10000)throw new Error('Select one of your claimed Blocky first');
 if(!/^\d{1,12}$/.test(s.agentId))throw new Error('ERC-8004 agent ID: digits only, e.g. 1205445');
 if(!Number.isInteger(s.maxPending)||s.maxPending<1||s.maxPending>20||!Number.isInteger(s.maxJobsDaily)||s.maxJobsDaily<1||s.maxJobsDaily>50||!Number.isSafeInteger(s.priceUnits)||s.priceUnits<10000||s.priceUnits>1000000)throw new Error('Limits: 1–20 pending, 1–50 jobs/day (whole fleet), $0.01–$1 report price');
 return s;
}
