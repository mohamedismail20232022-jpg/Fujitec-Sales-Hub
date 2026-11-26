'use strict';
// Server-owned integrity: every stored chunk carries an HMAC so a client that can write Firestore cannot forge sources/values.
const crypto=require('crypto');
function secret(env){const s=(env||process.env).DOC_SIGNING_SECRET;if(!s||s.length<32){const e=new Error('Document signing secret not configured');e.status=503;e.code='SIGNING_NOT_CONFIGURED';throw e}return s}
const canon=c=>[c.uid,c.fid,c.cid,c.kind,c.n,c.cite,c.text].join('\u0001');
function sign(c,env){return crypto.createHmac('sha256',secret(env)).update(canon(c)).digest('hex')}
function verify(c,env){let ok=false;try{const a=Buffer.from(sign(c,env),'hex'),b=Buffer.from(String(c.sig||''),'hex');ok=a.length===b.length&&crypto.timingSafeEqual(a,b)}catch(e){if(e.code==='SIGNING_NOT_CONFIGURED')throw e}return ok}
module.exports={sign,verify};
