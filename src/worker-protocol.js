export const EXIT_SKILL='base-token-exit-screen';
export function workerGrantMessage(g){return ['Blue Agent worker delegation v1','Domain: blueagent.dev | Base 8453',`owner: ${g.owner.toLowerCase()}`,`delegate: ${g.delegate.toLowerCase()}`,`agent: ${g.agentId}`,`payTo: ${g.payTo.toLowerCase()}`,`skill: ${g.skill}`,`maxDeliveries: ${g.maxDeliveries}`,`expires: ${g.expiresAt}`,`nonce: ${g.nonce}`,'Permission: submit research deliveries only. No spending, transfers, approvals or guaranteed income.'].join('\n');}
export const revokeMessage=(agentId,nonce,issuedAt)=>`Blue Agent revoke worker v1\nDomain: blueagent.dev | Base 8453\nagent: ${agentId}\nnonce: ${nonce}\nissued: ${issuedAt}`;
export const reservationMessage=(jobId,agentId,issuedAt)=>`Blue Agent reserve job v1\nDomain: blueagent.dev | Base 8453\njob: ${jobId}\nagent: ${agentId}\nissued: ${issuedAt}`;
export const controlMessage=b=>`BaseCity worker control v1\nDomain: basecity.space | Base 8453\nWallet: ${b.owner.toLowerCase()}\nAction: ${b.action}\nIssued: ${b.issuedAt}\nSettings: ${JSON.stringify(b.settings||{})}`;
export function workerSettings(raw){
 const s={tokenId:Number(raw.tokenId),agentId:String(raw.agentId||''),maxPending:Number(raw.maxPending??2),maxJobsDaily:Number(raw.maxJobsDaily??2),priceUnits:Math.round(Number(raw.priceUsd??.1)*1e6),mode:raw.mode==='auto'?'auto':'review',maxDailyCostUnits:0,skill:EXIT_SKILL};
 if(!Number.isInteger(s.tokenId)||s.tokenId<1||s.tokenId>10000||!/^\d{1,12}$/.test(s.agentId))throw new Error('Select a valid Blocky and ERC-8004 identity');
 if(!Number.isInteger(s.maxPending)||s.maxPending<1||s.maxPending>5||!Number.isInteger(s.maxJobsDaily)||s.maxJobsDaily<1||s.maxJobsDaily>5||!Number.isSafeInteger(s.priceUnits)||s.priceUnits<10000||s.priceUnits>1000000)throw new Error('Limits: 1–5 pending, 1–5 jobs/day, $0.01–$1 report price');
 return s;
}
