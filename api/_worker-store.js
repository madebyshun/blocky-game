import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {kv,useKv,KEY_BASE} from './_store.js';
export const prefix=`${KEY_BASE}:worker:v1`;
const memory=new Map();
export async function get(key){return useKv()?JSON.parse((await kv('GET',key))||'null'):structuredClone(memory.get(key)||null);}
export async function set(key,value,ttl=30*86400){if(useKv())await kv('SET',key,JSON.stringify(value),'EX',ttl);else{if(process.env.VERCEL)throw new Error('Worker requires persistent KV');memory.set(key,structuredClone(value));}}
export const stateKey=owner=>`${prefix}:state:${owner.toLowerCase()}`;
export const read=owner=>get(stateKey(owner));
export const write=state=>set(stateKey(state.owner),state);
export const hash=s=>createHash('sha256').update(s).digest('hex');
export async function session(owner){const token=randomBytes(32).toString('hex');await set(`${prefix}:session:${hash(token)}`,{owner,expiresAt:Date.now()+3600000},3600);return token;}
export async function sessionOwner(token){if(!/^[a-f0-9]{64}$/.test(token||''))return null;const v=await get(`${prefix}:session:${hash(token)}`);return v?.expiresAt>Date.now()?v.owner:null;}
export async function index(owner){if(useKv())await kv('SADD',`${prefix}:owners`,owner);else{const arr=memory.get('owners')||[];memory.set('owners',[...new Set([...arr,owner])]);}}
export async function owners(){return useKv()?(await kv('SMEMBERS',`${prefix}:owners`))||[]:memory.get('owners')||[];}
export async function lock(owner){const key=`${prefix}:lock:${owner}`,token=randomBytes(16).toString('hex');if(useKv()){if(await kv('SET',key,token,'NX','EX',90)!=='OK')return null;}else{const old=memory.get(key);if(old?.until>Date.now())return null;memory.set(key,{token,until:Date.now()+90000});}return async()=>{if(useKv())await kv('EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,key,token);else if(memory.get(key)?.token===token)memory.delete(key);};}
function key(){const k=process.env.WORKER_ENCRYPTION_KEY;if(!/^[a-f0-9]{64}$/i.test(k||''))throw new Error('Auto-submit requires WORKER_ENCRYPTION_KEY (32 bytes hex). Review mode works without it.');return Buffer.from(k,'hex');}
export function seal(value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);const out=Buffer.concat([c.update(value,'utf8'),c.final()]);return {iv:iv.toString('hex'),tag:c.getAuthTag().toString('hex'),value:out.toString('hex')};}
export function unseal(v){const c=createDecipheriv('aes-256-gcm',key(),Buffer.from(v.iv,'hex'));c.setAuthTag(Buffer.from(v.tag,'hex'));return Buffer.concat([c.update(Buffer.from(v.value,'hex')),c.final()]).toString('utf8');}
export function publicState(s){if(!s)return null;const {delegateKey,...out}=s;return out;}

// Compare-and-set prevents an in-flight research cycle from overwriting Pause/settings.
export async function writeIf(state,version){const key=stateKey(state.owner);if(useKv()){const result=await kv('EVAL',"local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end local old=cjson.decode(raw); if old.version~=tonumber(ARGV[1]) then return 0 end redis.call('SET',KEYS[1],ARGV[2],'EX',2592000); return 1",1,key,String(version),JSON.stringify(state));return Number(result)===1;}const current=await read(state.owner);if(current?.version!==version)return false;await write(state);return true;}
