'use strict';
// Per-user daily usage counters + retention policy. LIMITATION: counters are stored under the caller's own Firestore token, so a determined user can
// skip his own counter. Tamper-proof enforcement needs a server credential (Firebase service account) that does not exist yet; see ACCEPTANCE.md.
const DEFAULTS={upload:50,chat:200,analyze:300,chart:300,export:100,compare:300};
const KEYS=Object.keys(DEFAULTS);
const day=(now)=>(now||new Date()).toISOString().slice(0,10);
function limitFor(key,env){const v=Number(env['QUOTA_'+key.toUpperCase()+'_PER_DAY']);return Number.isInteger(v)&&v>=0?v:DEFAULTS[key]}
async function consume(store,uid,key,env,now){if(!KEYS.includes(key)||!store.getUsage)return {ok:true,unmetered:true};
  const d=day(now),u=(await store.getUsage(uid,d))||{day:d};const used=Number(u[key]||0),limit=limitFor(key,env);
  if(used>=limit)return {ok:false,key,used,limit,day:d};u[key]=used+1;u.day=d;await store.putUsage(uid,d,u);return {ok:true,used:used+1,limit,day:d}}
async function usage(store,uid,env,now){const d=day(now),u=(await store.getUsage(uid,d))||{};return {day:d,usage:Object.fromEntries(KEYS.map(k=>[k,{used:Number(u[k]||0),limit:limitFor(k,env)}]))}}
// Retention: AIDOCS_RETENTION_DAYS (0/unset = keep forever). Only the caller's own AI-document uploads are in scope, never business data.
function retentionDays(env){const v=Number(env.AIDOCS_RETENTION_DAYS);return Number.isInteger(v)&&v>0?v:0}
async function retention(store,uid,env,{apply,now}={}){const days=retentionDays(env);if(!days)return {days:0,policy:'disabled',expired:[],deleted:[]};
  const cutoff=(now||new Date()).getTime()-days*864e5;const expired=(await store.listFiles(uid)).filter(f=>Date.parse(f.createdAt)<cutoff).map(f=>({id:f.id,name:f.name,createdAt:f.createdAt}));
  const deleted=[];if(apply)for(const f of expired){await store.deleteFile(uid,f.id);deleted.push(f.id)}return {days,policy:'enabled',expired,deleted,applied:!!apply}}
module.exports={consume,usage,retention,retentionDays,limitFor,DEFAULTS,KEYS};
