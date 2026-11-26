'use strict';
// Server-owned integrity: every stored chunk carries an HMAC so a client that can write Firestore cannot forge sources/values.
const crypto=require('crypto');
function secret(env){const s=(env||process.env).DOC_SIGNING_SECRET;if(!s||s.length<32){const e=new Error('Document signing secret not configured');e.status=503;e.code='SIGNING_NOT_CONFIGURED';throw e}return s}
// Typed, unambiguous canonical form: JSON of a fixed array. Every field must have its exact type; anything else (object cite, NaN n, non-string text) cannot be signed or verified.
const isStr=v=>typeof v==='string',isN=v=>Number.isInteger(v)&&v>=0&&v<=1e6;
const canon=c=>{if(![c.uid,c.fid,c.cid,c.kind,c.cite,c.text].every(isStr)||!isN(c.n)){const e=new Error('Record has invalid field types');e.status=409;e.code='INTEGRITY';throw e}return JSON.stringify(['chunk',c.uid,c.fid,c.cid,c.kind,c.n,c.cite,c.text])};
function sign(c,env){return crypto.createHmac('sha256',secret(env)).update(canon(c)).digest('hex')}
function verify(c,env){let ok=false;try{const a=Buffer.from(sign(c,env),'hex'),b=Buffer.from(String(c.sig||''),'hex');ok=a.length===b.length&&crypto.timingSafeEqual(a,b)}catch(e){if(e.code==='SIGNING_NOT_CONFIGURED')throw e;ok=false}return ok}
// Records written by the CALLER's token (file records, chat messages) are sealed too: a client that can write Firestore cannot forge them.
const H=(dom,arr,env)=>crypto.createHmac('sha256',secret(env)).update(dom+'\u0001'+JSON.stringify(arr)).digest('hex');
const eq=(a,b)=>{try{const x=Buffer.from(a,'hex'),y=Buffer.from(String(b||''),'hex');return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y)}catch(e){return false}};
const nz=v=>v===undefined?null:v;
const fileArr=(uid,f)=>[uid,f.id,nz(f.name),nz(f.status),nz(f.error),nz(f.size),nz(f.createdAt),nz(f.updatedAt),nz(f.warnings),nz(f.tables)];
const msgArr=(uid,cid,m)=>{if(![uid,cid,m.id,m.role,m.text,m.ts].every(isStr)||!isN(m.n)||!Array.isArray(m.cites||[])){const e=new Error('Message has invalid field types');e.code='INTEGRITY';throw e}return [uid,cid,m.id,m.role,m.text,m.cites||[],m.ts,m.n]};
module.exports={sign,verify,sealFile:(uid,f,env)=>H('file',fileArr(uid,f),env),checkFile:(uid,f,env)=>eq(H('file',fileArr(uid,f),env),f.sig),sealMsg:(uid,cid,m,env)=>H('msg',msgArr(uid,cid,m),env),checkMsg:(uid,cid,m,env)=>eq(H('msg',msgArr(uid,cid,m),env),m.sig)};
