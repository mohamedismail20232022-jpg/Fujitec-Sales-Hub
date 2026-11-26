'use strict';
// Persistence. memory() for tests; firestore(): REST with the CALLER's ID token, so Firestore rules apply (no admin credential).
const {sign,verify,sealFile,checkFile,sealMsg,checkMsg}=require('./sign');
function memory(){const files=new Map(),chunks=new Map(),chats=new Map(),msgs=new Map(),audit=[];return {kind:'memory',async putAudit(uid,r){audit.push(r)},_audit:audit,_usage:new Map(),async getUsage(uid,d){return this._usage.get(uid+'/'+d)||null},async putUsage(uid,d,u){this._usage.set(uid+'/'+d,Object.assign({},u))},
  async putChat(uid,c){chats.set(uid+'/'+c.id,Object.assign({},c))},async getChat(uid,id){return chats.get(uid+'/'+id)||null},async listChats(uid){return [...chats].filter(([k])=>k.startsWith(uid+'/')).map(([,v])=>v)},
  async putMsg(uid,cid,m){msgs.set(uid+'/'+cid+'/'+m.id,Object.assign({},m))},async getMsgs(uid,cid){return [...msgs].filter(([k])=>k.startsWith(uid+'/'+cid+'/')).map(([,v])=>v).sort((a,b)=>a.n-b.n)},
  async deleteChat(uid,id){chats.delete(uid+'/'+id);[...msgs.keys()].filter(k=>k.startsWith(uid+'/'+id+'/')).forEach(k=>msgs.delete(k))},
  async putFile(uid,f){files.set(uid+'/'+f.id,Object.assign({},f))},async getFile(uid,id){return files.get(uid+'/'+id)||null},
  async listFiles(uid){return [...files].filter(([k])=>k.startsWith(uid+'/')).map(([,v])=>v)},
  async putChunk(uid,fid,c){chunks.set(uid+'/'+fid+'/'+c.cid,Object.assign({},c))},async getChunks(uid,fid){return [...chunks].filter(([k])=>k.startsWith(uid+'/'+fid+'/')).map(([,v])=>v)},
  async deleteFile(uid,id){files.delete(uid+'/'+id);[...chunks.keys()].filter(k=>k.startsWith(uid+'/'+id+'/')).forEach(k=>chunks.delete(k))},_raw:{files,chunks}}}
function firestore({project,token,host}){const base=(host?'http://'+host:'https://firestore.googleapis.com')+'/v1/projects/'+project+'/databases/(default)/documents';
  const H={'content-type':'application/json',authorization:'Bearer '+token};
  const enc=o=>({fields:Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='number'?{integerValue:String(v)}:{stringValue:String(v)}]))});
  const dec=d=>Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,v.integerValue!==undefined?Number(v.integerValue):v.stringValue]));
  const req=async(m,p,b)=>{const r=await fetch(base+p,{method:m,headers:H,body:b?JSON.stringify(b):undefined});if(r.status===404)return null;if(!r.ok){const e=new Error('store '+m+' '+r.status);e.status=r.status===403?403:502;e.code=r.status===403?'STORE_FORBIDDEN':'STORE_ERROR';throw e}return r.json()};
  const FK=['name','status','error','size','createdAt','updatedAt','warnings','tables','sig'];
  return {kind:'firestore',
  async putFile(uid,f){const o={};FK.forEach(k=>{if(f[k]!==undefined&&f[k]!==null)o[k]=typeof f[k]==='object'?JSON.stringify(f[k]):f[k]});await req('PATCH','/aidocs/'+uid+'/files/'+f.id,enc(o))},
  async getFile(uid,id){const d=await req('GET','/aidocs/'+uid+'/files/'+id);if(!d)return null;const o=dec(d);o.id=id;['warnings','tables'].forEach(k=>{if(o[k])try{o[k]=JSON.parse(o[k])}catch(e){}});return o},
  async listFiles(uid){const d=await req('GET','/aidocs/'+uid+'/files?pageSize=200');return ((d&&d.documents)||[]).map(x=>{const o=dec(x);o.id=x.name.split('/').pop();['warnings','tables'].forEach(k=>{if(o[k])try{o[k]=JSON.parse(o[k])}catch(e){}});return o})},
  async putChunk(uid,fid,c){await req('PATCH','/aidocs/'+uid+'/files/'+fid+'/chunks/'+c.cid,enc({text:c.text,cite:c.cite,n:c.n,kind:c.kind,sig:c.sig}))},
  async getChunks(uid,fid){let out=[],pt='';do{const d=await req('GET','/aidocs/'+uid+'/files/'+fid+'/chunks?pageSize=300'+(pt?'&pageToken='+pt:''));if(!d)break;(d.documents||[]).forEach(x=>{const o=dec(x);o.cid=x.name.split('/').pop();o.uid=uid;o.fid=fid;out.push(o)});pt=d.nextPageToken||''}while(pt);return out},
  async putAudit(uid,r){await req('PATCH','/aidocs/'+uid+'/audit/'+r.id,enc({uid:r.uid,action:r.action,ts:r.ts,ref:r.ref}))},
  async getUsage(uid,d){const x=await req('GET','/aidocs/'+uid+'/usage/'+d);return x?dec(x):null},
  async putUsage(uid,d,u){await req('PATCH','/aidocs/'+uid+'/usage/'+d,enc(u))},
  async putChat(uid,c){await req('PATCH','/aidocs/'+uid+'/chats/'+c.id,enc({title:c.title,fileIds:JSON.stringify(c.fileIds||[]),createdAt:c.createdAt,updatedAt:c.updatedAt}))},
  async getChat(uid,id){const d=await req('GET','/aidocs/'+uid+'/chats/'+id);if(!d)return null;const o=dec(d);o.id=id;try{o.fileIds=JSON.parse(o.fileIds)}catch(e){o.fileIds=[]}return o},
  async listChats(uid){const d=await req('GET','/aidocs/'+uid+'/chats?pageSize=100');return ((d&&d.documents)||[]).map(x=>{const o=dec(x);o.id=x.name.split('/').pop();try{o.fileIds=JSON.parse(o.fileIds)}catch(e){o.fileIds=[]}return o})},
  async putMsg(uid,cid,m){await req('PATCH','/aidocs/'+uid+'/chats/'+cid+'/messages/'+m.id,enc({role:m.role,text:m.text,cites:JSON.stringify(m.cites||[]),ts:m.ts,n:m.n,sig:m.sig||''}))},
  async getMsgs(uid,cid){let out=[],pt='';do{const d=await req('GET','/aidocs/'+uid+'/chats/'+cid+'/messages?pageSize=300'+(pt?'&pageToken='+pt:''));if(!d)break;(d.documents||[]).forEach(x=>{const o=dec(x);o.id=x.name.split('/').pop();try{o.cites=JSON.parse(o.cites)}catch(e){o.cites=[]}out.push(o)});pt=d.nextPageToken||''}while(pt);return out.sort((a,b)=>a.n-b.n)},
  async deleteChat(uid,id){for(const m of await this.getMsgs(uid,id)){const r=await fetch(base+'/aidocs/'+uid+'/chats/'+id+'/messages/'+m.id,{method:'DELETE',headers:H});if(!r.ok&&r.status!==404){const e=new Error('delete failed');e.status=502;e.code='DELETE_PARTIAL';throw e}}const r=await fetch(base+'/aidocs/'+uid+'/chats/'+id,{method:'DELETE',headers:H});if(!r.ok&&r.status!==404){const e=new Error('delete failed');e.status=502;e.code='DELETE_PARTIAL';throw e}},
  async deleteFile(uid,id){const cs=await this.getChunks(uid,id);for(const c of cs){const r=await fetch(base+'/aidocs/'+uid+'/files/'+id+'/chunks/'+c.cid,{method:'DELETE',headers:H});if(!r.ok&&r.status!==404){const e=new Error('delete failed');e.status=502;e.code='DELETE_PARTIAL';throw e}}const r=await fetch(base+'/aidocs/'+uid+'/files/'+id,{method:'DELETE',headers:H});if(!r.ok&&r.status!==404){const e=new Error('delete failed');e.status=502;e.code='DELETE_PARTIAL';throw e}}}}
// sealed(): every file record and chat message is HMAC-signed on write and verified on read. Unsigned/forged/edited records come back
// with verified:false, no content and are never used as history, tables, warnings or status.
function sealed(raw,env){const w=Object.create(raw);const bad=f=>({id:f.id,verified:false,status:'unverified',error:'Record failed its integrity check and is ignored',warnings:[],tables:[]});
  w.putFile=(uid,f)=>raw.putFile(uid,Object.assign({},f,{sig:sealFile(uid,f,env)}));
  const vf=(uid,f)=>f&&(checkFile(uid,f,env)?Object.assign({},f,{verified:true}):bad(f));
  w.getFile=async(uid,id)=>vf(uid,await raw.getFile(uid,id));w.listFiles=async uid=>(await raw.listFiles(uid)).map(f=>vf(uid,f));
  w.putMsg=(uid,cid,m)=>raw.putMsg(uid,cid,Object.assign({},m,{sig:sealMsg(uid,cid,m,env)}));
  w.getMsgs=async(uid,cid)=>(await raw.getMsgs(uid,cid)).map(m=>{let v=false;try{v=checkMsg(uid,cid,m,env)}catch(e){if(e.code==='SIGNING_NOT_CONFIGURED')throw e}return v?Object.assign({},m,{verified:true}):{id:String(m.id),n:null,role:'unverified',text:'[This stored message failed its integrity check and was not used]',cites:[],ts:null,verified:false}}).sort((a,b)=>(a.verified===b.verified?0:a.verified?-1:1)||(a.verified?a.n-b.n:String(a.id).localeCompare(String(b.id))));
  return w}
module.exports={memory,firestore,sealed,sign,verify};
