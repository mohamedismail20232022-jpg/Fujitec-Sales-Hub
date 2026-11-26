'use strict';
// Structured tool-call contract between the model and the server. The model can only REQUEST a call; the server validates it against a strict
// allowlist, restricts it to the files selected for the chat, and computes the numbers itself. Numbers in an answer are labelled verified only if
// they equal a server-computed value or appear verbatim in a retrieved passage; anything else is flagged unverified.
const D=require('./docs');
const bad=(m)=>Object.assign(new Error(m),{status:422,code:'TOOL_CALL_REJECTED'});
const OPS=['pct_change','ratio','difference','share'],FNS=['sum','count','avg','min','max','median'];
const isStr=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n;
function checkSpec(s,allowed){if(!s||typeof s!=='object')throw bad('spec must be an object');
  const extra=Object.keys(s).filter(k=>!['fileId','sheet','labelCol','valueCol','fn'].includes(k));if(extra.length)throw bad('unknown spec field: '+extra[0]);
  if(!allowed.includes(s.fileId))throw bad('fileId is not among the files selected for this chat');
  for(const k of ['sheet','labelCol','valueCol'])if(!isStr(s[k],100))throw bad('spec.'+k+' invalid');
  if(!FNS.includes(s.fn))throw bad('fn not allowed');return {fileId:s.fileId,sheet:s.sheet,labelCol:s.labelCol,valueCol:s.valueCol,fn:s.fn}}
function validate(call,allowed){if(!call||typeof call!=='object'||Array.isArray(call))throw bad('call must be an object');
  const top=Object.keys(call).filter(k=>!['tool','args'].includes(k));if(top.length)throw bad('unknown field: '+top[0]);
  const a=call.args;if(!a||typeof a!=='object')throw bad('args required');
  if(call.tool==='compare'){const ex=Object.keys(a).filter(k=>!['op','a','b'].includes(k));if(ex.length)throw bad('unknown arg: '+ex[0]);
    if(!OPS.includes(a.op))throw bad('op not allowed');const side=x=>{if(!x||typeof x!=='object')throw bad('side must be an object');if(!isStr(String(x.label),200))throw bad('label invalid');return {spec:checkSpec(x.spec,allowed),label:String(x.label)}};
    return {tool:'compare',spec:{op:a.op,a:side(a.a),b:a.op==='share'?undefined:side(a.b)}}}
  if(call.tool==='aggregate'){const ex=Object.keys(a).filter(k=>!['spec'].includes(k));if(ex.length)throw bad('unknown arg: '+ex[0]);return {tool:'aggregate',spec:checkSpec(a.spec,allowed)}}
  throw bad('tool not in allowlist');}
function parse(text){const m=/<tool_call>([\s\S]*?)<\/tool_call>/.exec(String(text));if(!m)return null;try{return JSON.parse(m[1])}catch(e){throw bad('tool call is not valid JSON')}}
async function execute(call,{uid,store,env,allowed}){const v=validate(call,allowed);
  if(v.tool==='compare'){const r=await D.compare({uid,spec:v.spec,store,env});return {tool:'compare',result:r,values:[r.result.value,r.a.value].concat(r.b?[r.b.value]:[])}}
  const r=await D.analyze({uid,spec:v.spec,store,env});return {tool:'aggregate',result:{file:r.file,sheet:r.sheet,fn:r.fn,labels:r.dataset.labels,values:r.dataset.values,refs:r.dataset.refs,total:r.total,caveats:r.caveats||[]},values:r.dataset.values.concat([r.total.value])}}
const NUM=/-?\d{1,3}(?:[,\u00a0\u202f \u066c]\d{3})+(?:\.\d+)?|-?\d[\d,]*(?:\.\d+)?/g,norm=s=>String(s).replace(/[,\u00a0\u202f \u066c]/g,'');
const close=(a,b)=>Math.abs(a-b)<=Math.max(1e-6,Math.abs(b)*1e-9);
// Every number in the answer: verified (matches a server-computed value or a retrieved passage) or unverified. Citation markers like [S1] are ignored.
const rnd=(x,n,v)=>{const d=(n.split('.')[1]||'').length;if(d<1||d>6)return false;const f=Math.pow(10,d);return Math.abs(Math.round(v*f)/f-x)<1e-9};
function checkNumbers(answer,toolValues,passages){const txt=String(answer).replace(/[\u3010\uff3b]/g,'[').replace(/[\u3011\uff3d]/g,']').replace(/\[\s*S\d+(?:\s*[,;]\s*S\d+)*\s*\]/g,' ').replace(/^\s*\d+[.)]\s/gm,' ');const nums=(txt.match(NUM)||[]).map(norm);
  const hay=passages.map(p=>norm(p)).join(' \n ');const out={verified:[],unverified:[]};
  for(const n of [...new Set(nums)]){const x=Number(n);if(!isFinite(x))continue;
    if(toolValues.some(v=>typeof v==='number'&&(close(x,v)||close(x,Math.round(v*100)/100)||rnd(x,n,v))))out.verified.push({value:n,source:'server_calc'});
    else if(new RegExp('(^|[^\\d.])'+n.replace(/[.]/g,'\\.')+'($|[^\\d])').test(hay))out.verified.push({value:n,source:'passage'});
    else out.unverified.push(n)}
  return out}
module.exports={validate,parse,execute,checkNumbers};
