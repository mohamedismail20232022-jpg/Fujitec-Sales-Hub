'use strict';
// Framework-free handlers; Vercel wrappers in api/doc/*.js call these. deps injected so tests never touch real services.
// Client sends only: file bytes, fileIds, questions, and analysis SPECS (file/sheet/column). Values, passages and source refs are server-owned.
const Q=require('./quota'),{validateFile,wrapUntrusted,rateLimiter}=require('./guard'),calc=require('./calc'),{getProvider}=require('./provider'),R=require('./report'),{Index}=require('./search'),D=require('./docs');
const MAX_BYTES=Math.floor(3.2*1024*1024); // Vercel body limit 4.5 MB applies to the base64 JSON body (+33%), so the raw file cap is ~3.2 MB
const lim=rateLimiter(30,60000);
const err=(status,code,msg)=>({status,body:{error:{code,msg}}});
async function authed(req,deps){const h=(req.headers&&(req.headers.authorization||req.headers.Authorization))||'';const m=/^Bearer (.+)$/.exec(h);
  if(!m) return {fail:err(401,'NO_TOKEN','Sign in required')};let u;try{u=await deps.verifyToken(m[1])}catch(e){return {fail:err(401,'BAD_TOKEN','Invalid or expired session')}}
  if(!u||!u.uid) return {fail:err(401,'BAD_TOKEN','Invalid or expired session')};
  const role=await deps.getRole(u.email,m[1]);if(!role||!['admin','manager','seller','estimator'].includes(role)) return {fail:err(403,'NO_ROLE','No role that allows AI documents for this account')};
  if(!lim(u.uid)) return {fail:err(429,'RATE_LIMIT','Too many requests')};return {user:u,role,token:m[1]};}
const pub=f=>({id:f.id,name:f.name,status:f.status,error:f.error,size:f.size,createdAt:f.createdAt,warnings:f.warnings||[],tables:f.tables||[]});
const OPN={pct_change:'Percentage change (a vs b)',ratio:'Ratio (a / b)',difference:'Difference (a − b)',share:'Share of total'};
function cmpSection(c){return {heading:OPN[c.op]+': '+c.a.label+(c.op==='share'?'':' vs '+c.b.label),paragraphs:[OPN[c.op]+' = '+c.result.value+(c.result.unit==='%'?' %':'')+' ('+c.result.formula+(c.result.numerator!==undefined?'; numerator '+c.result.numerator+', denominator '+c.result.denominator:'')+').'],
  dataset:{labels:[c.a.label+' ('+c.a.file+')',c.b.label+(c.op==='share'?'':' ('+c.b.file+')')],values:[c.a.value,c.b.value],refs:[c.a.refs,c.b.refs],unit:'',caveat:(c.caveats||[]).map(x=>x.msg).join(' ')||undefined},summary:true}}
function mkReport(title,analyses){return R.build({title:title||'Management Report',sections:analyses.map(a=>a.kind==='compare'?cmpSection(a):({heading:a.file+' / '+a.sheet+': '+a.fn+' of '+a.value+' by '+a.label,
  paragraphs:[(a.fn==='avg'?'Average':a.fn==='count'?'Count':a.fn==='median'?'Median':'Total')+' over '+a.total.cellsUsed+' cells: '+a.total.value+' ('+a.total.formula+(a.total.numerator!==undefined?'; numerator '+a.total.numerator+', denominator '+a.total.denominator:'')+').'].concat(a.skipped.length?['Skipped non-numeric cells: '+a.skipped.map(s=>s.ref).join(', ')]:[]),
  dataset:Object.assign({},a.dataset,{caveat:(a.caveats||[]).map(c=>c.msg).join(' ')||undefined}),summary:true}))});}
async function route(name,req,deps,env){const ctx={};const r=await route0(name,req,deps,env,ctx);
  const act={process:'upload',delete:'delete_file',analyze:'analyze',chart:'chart',export:'export',chat:'chat',compare:'compare',retention:'retention',chats:(req.body||{}).action==='delete'?'delete_chat':null}[name];
  if(ctx.uid&&act&&r.status===200&&ctx.store.putAudit){try{await ctx.store.putAudit(ctx.uid,{id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),uid:ctx.uid,action:act,ts:new Date().toISOString(),ref:String((req.body||{}).fileId||(req.body||{}).chatId||(req.body||{}).name||'').slice(0,120)})}catch(e){r.auditFailed=true}}
  return r}
async function route0(name,req,deps,env,ctx){
  if(req.method!=='POST') return err(405,'METHOD','POST only');
  const a=await authed(req,deps);if(a.fail) return a.fail;const b=req.body||{};const uid=a.user.uid;
  const store=deps.makeStore?deps.makeStore(a.token):null;if(!store) return err(503,'STORE_NOT_CONFIGURED','Storage not configured');ctx.uid=uid;ctx.store=store;
  try{
  if(name==='usage')return {status:200,body:Object.assign(await Q.usage(store,uid,env),{retentionDays:Q.retentionDays(env)})};
  if(name==='retention'){const r=await Q.retention(store,uid,env,{apply:b.apply===true});return {status:200,body:r}}
  const qk={process:'upload',chat:'chat',analyze:'analyze',chart:'chart',export:'export',compare:'compare'}[name];
  if(qk){const q=await Q.consume(store,uid,qk,env);if(!q.ok)return {status:429,body:{error:{code:'QUOTA_EXCEEDED',msg:'Daily limit for '+qk+' reached ('+q.used+'/'+q.limit+'). Resets at 00:00 UTC.'},quota:q}}}
  if(name==='process'){const buf=Buffer.from(String(b.contentBase64||''),'base64');const v=validateFile(b.name||'',buf,MAX_BYTES);
    if(!v.ok) return err(v.code==='TOO_LARGE'?413:400,v.code,v.msg);const r=await D.ingest({uid,name:b.name,buf,store,env});return {status:r.http,body:{file:pub(r.file),passages:r.passages}};}
  if(name==='files'){const l=await store.listFiles(uid);return {status:200,body:{files:l.map(pub).sort((x,y)=>String(y.createdAt).localeCompare(String(x.createdAt)))}};}
  if(name==='delete'){const f=await store.getFile(uid,String(b.fileId||''));if(!f)return err(404,'NOT_FOUND','File not found');await store.deleteFile(uid,f.id);return {status:200,body:{deleted:f.id}};}
  if(name==='analyze'){const r=await D.analyze({uid,spec:b,store,env});return {status:200,body:r};}
  if(name==='chart'){const an=await D.analyze({uid,spec:b,store,env});const rep=mkReport(b.title,[an]);const sec=rep.sections[0];
    return {status:200,body:{svg:sec.chart.svg,pngBase64:require('./chart').toPNG(sec.chart.svg).toString('base64'),analysis:an}};}
  if(name==='export'){const fmt=['docx','xlsx','pptx','pdf','csv'].includes(b.format)?b.format:null;if(!fmt||!Array.isArray(b.specs)||!b.specs.length||b.specs.length>10)return err(400,'BAD_EXPORT','Unsupported format or no analyses selected');
    const ans=[];for(const s of b.specs)ans.push(s&&s.kind==='compare'?await D.compare({uid,spec:s,store,env}):await D.analyze({uid,spec:s,store,env}));let rep;try{rep=mkReport(b.title,ans)}catch(e){return err(422,e.code||'REPORT_INVALID',e.message)}
    const o=await R[fmt](rep);const buf=Buffer.isBuffer(o)?o:o.buf||Buffer.from(o);return {status:200,body:{format:fmt,contentBase64:buf.toString('base64'),warnings:o.warnings||[],analyses:ans.length}};}
  if(name==='compare'){return {status:200,body:await D.compare({uid,spec:b,store,env})}}
  if(name==='chats')return await require('./chat').manage({uid,b,store});
  if(name==='chat'){let p;try{p=getProvider(env,deps.providerOpts)}catch(e){return err(e.status||503,e.code||'AI_NOT_CONFIGURED','AI is not configured; no answer was generated')}
    return await require('./chat').run({uid,b,store,env,provider:p});}
  return err(404,'NOT_FOUND','Unknown endpoint');
  }catch(e){if(e.status&&e.code)return err(e.status,e.code,e.message);throw e}}
module.exports={route,MAX_BYTES,mkReport};
