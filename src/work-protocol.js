export const IDENTITY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
export const OWNER_ABI = [{type:'function',name:'ownerOf',stateMutability:'view',inputs:[{type:'uint256'}],outputs:[{type:'address'}]}];
export const clean = (v,max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim().slice(0,max);
export async function deliveryMessage(f) {
  const hash = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
  return ['Blue Agent job delivery',`job: ${f.jobId}`,`agent: ${f.agentId}`,`payTo: ${f.payTo.toLowerCase()}`,`price: ${f.priceUnits} (USDC micro-units, Base 8453)`,`preview-sha256: ${await hash(f.preview)}`,`result-sha256: ${await hash(f.result)}`,`issued: ${f.issuedAt}`].join('\n');
}
export function validateDelivery(b,job) {
  if (!/^\d{1,12}$/.test(String(b.agentId))) return 'Enter an ERC-8004 agent ID.';
  if (!Number.isInteger(b.tokenId) || b.tokenId<1 || b.tokenId>10000) return 'Select a claimed Blocky.';
  if (!/^0x[\da-f]{40}$/i.test(b.signer || '') || b.payTo?.toLowerCase()!==b.signer.toLowerCase()) return 'Payment must go to the connected owner wallet.';
  if (job.status!=='open') return 'This job is no longer open.';
  const units=Math.round(Number(b.priceUsd)*1e6);
  if (!Number.isFinite(units) || units<10000 || units>job.budgetUnits) return 'Price must be at least $0.01 and within the job budget.';
  if (clean(b.preview,600).length<10 || !clean(b.result,20000)) return 'Add a meaningful preview and full result.';
  if (typeof b.preview !== 'string' || typeof b.result !== 'string') return 'Preview and report must be text.';
  if (b.preview.length>600 || b.result.length>20000) return 'Preview or report exceeds the character limit.';
  return null;
}
