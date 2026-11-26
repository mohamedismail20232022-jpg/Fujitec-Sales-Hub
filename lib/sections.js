'use strict';
// Read-only access to the site's own sections (accounts, tenders, ...). Records are read through the store with the CALLER's token, so the
// Firestore rules (signed-in user with a role) decide what is visible; nothing here writes. Sample records (isSample) are excluded.
const SECTIONS={accounts:{path:'ws/main/accounts',en:/account|customer|client/i,ar:/\u062d\u0633\u0627\u0628|\u0639\u0645\u064a\u0644|\u0639\u0645\u0644\u0627\u0621/},
 contacts:{path:'ws/main/contacts',en:/contact|person|people/i,ar:/\u062c\u0647\u0629 \u0627\u062a\u0635\u0627\u0644|\u062c\u0647\u0627\u062a/},
 buildings:{path:'ws/main/buildings',en:/building|site|tower/i,ar:/\u0645\u0628\u0646\u0649|\u0645\u0628\u0627\u0646\u064a|\u0628\u0631\u062c/},
 equipment:{path:'ws/main/equipment',en:/equipment|lift|elevator|escalator|unit/i,ar:/\u0645\u0635\u0639\u062f|\u0645\u0639\u062f\u0627\u062a|\u062c\u0647\u0627\u0632/},
 opportunities:{path:'ws/main/opportunities',en:/opportunit|pipeline|deal|lead/i,ar:/\u0641\u0631\u0635|\u0641\u0631\u0635\u0629|\u0635\u0641\u0642/},
 tenders:{path:'ws/main/tenders',en:/tender|bid/i,ar:/\u0645\u0646\u0627\u0642\u0635/},
 quotes:{path:'ws/typed/quotes',en:/quot|proposal/i,ar:/\u0639\u0631\u0636 \u0633\u0639\u0631|\u0639\u0631\u0648\u0636|\u0639\u0631\u0636/},
 handoffs:{path:'ws/main/handoffs',en:/handoff|hand-off|handover/i,ar:/\u062a\u0633\u0644\u064a\u0645/},
 meetings:{path:'ws/main/meetings',en:/meeting|visit/i,ar:/\u0627\u062c\u062a\u0645\u0627\u0639|\u0632\u064a\u0627\u0631/},
 tasks:{path:'ws/main/tasks',en:/task|follow-?up|to-?do/i,ar:/\u0645\u0647\u0645\u0629|\u0645\u0647\u0627\u0645|\u0645\u062a\u0627\u0628\u0639/},
 followupLeads:{path:'ws/main/followupLeads',en:/follow-?up lead/i,ar:/\u0645\u062a\u0627\u0628\u0639\u0629/},
 contracts:{path:'ws/main/contracts',en:/contract/i,ar:/\u0639\u0642\u062f|\u0639\u0642\u0648\u062f/},
 workOrders:{path:'ws/main/workOrders',en:/work ?order|maintenance|breakdown|callout/i,ar:/\u0635\u064a\u0627\u0646\u0629|\u0623\u0645\u0631 \u0639\u0645\u0644/},
 pmPlans:{path:'ws/main/pmPlans',en:/\bpm\b|preventive|maintenance plan/i,ar:/\u0648\u0642\u0627\u0626\u064a/},
 spareParts:{path:'ws/main/spareParts',en:/spare|part|inventory|stock/i,ar:/\u0642\u0637\u0639 \u063a\u064a\u0627\u0631|\u0645\u062e\u0632\u0648\u0646/},
 technicians:{path:'ws/main/technicians',en:/technician|engineer/i,ar:/\u0641\u0646\u064a|\u0645\u0647\u0646\u062f\u0633/}};
const NAMES=Object.keys(SECTIONS);
const FNS=['count','sum','avg','min','max'],OPS=['eq','ne','contains','gt','lt'];
const bad=m=>Object.assign(new Error(m),{status:422,code:'TOOL_CALL_REJECTED'});
function hint(q){const out=[];for(const n of NAMES){const s=SECTIONS[n];if(s.en.test(q)||s.ar.test(q))out.push(n)}return out.slice(0,3)}
const scalar=v=>v===null||['string','number','boolean'].includes(typeof v);
async function rows(store,uid,sec){if(!SECTIONS[sec])throw bad('section not allowed');if(!store.listSection)throw bad('sections are not available in this store');
  const raw=await store.listSection(uid,SECTIONS[sec].path);return (raw||[]).filter(r=>r&&r.rec&&typeof r.rec==='object'&&!r.rec.isSample&&!r.rec.archived&&!r.rec.deleted)}
function fields(rs){const f={};for(const r of rs.slice(0,200))for(const [k,v] of Object.entries(r.rec))if(scalar(v)&&v!==null){const t=typeof v==='number'?'number':'text';if(!f[k]||f[k]==='text')f[k]=t}return f}
async function schemas(store,uid,q){const out=[];for(const n of hint(q)){try{const rs=await rows(store,uid,n);out.push({section:n,records:rs.length,fields:fields(rs)})}catch(e){out.push({section:n,error:String(e.code||e.message)})}}return out}
const num=v=>{const n=typeof v==='number'?v:Number(String(v).replace(/,/g,''));return isFinite(n)&&String(v).trim()!==''?n:null};
function checkSpec(a){if(!a||typeof a!=='object')throw bad('args required');
  const extra=Object.keys(a).filter(k=>!['section','filters','groupBy','valueField','fn'].includes(k));if(extra.length)throw bad('unknown arg: '+extra[0]);
  if(!NAMES.includes(a.section))throw bad('section not allowed');if(!FNS.includes(a.fn))throw bad('fn not allowed');
  const fl=a.filters===undefined?[]:a.filters;if(!Array.isArray(fl)||fl.length>5)throw bad('filters invalid');
  const isF=s=>typeof s==='string'&&/^[A-Za-z0-9_]{1,60}$/.test(s);
  for(const f of fl){if(!f||typeof f!=='object'||!isF(f.field)||!OPS.includes(f.op)||!['string','number'].includes(typeof f.value))throw bad('filter invalid')}
  if(a.groupBy!==undefined&&!isF(a.groupBy))throw bad('groupBy invalid');
  if(a.fn!=='count'&&!isF(a.valueField))throw bad('valueField required for '+a.fn);
  return {section:a.section,filters:fl.map(f=>({field:f.field,op:f.op,value:f.value})),groupBy:a.groupBy,valueField:a.valueField,fn:a.fn}}
const test=(v,f)=>{if(v===undefined||v===null)return false;if(f.op==='contains')return String(v).toLowerCase().includes(String(f.value).toLowerCase());
  if(f.op==='eq')return String(v).toLowerCase()===String(f.value).toLowerCase();if(f.op==='ne')return String(v).toLowerCase()!==String(f.value).toLowerCase();
  const a=num(v),b=num(f.value);if(a===null||b===null)return false;return f.op==='gt'?a>b:a<b};
const agg=(fn,xs,n)=>fn==='count'?n:!xs.length?null:fn==='sum'?xs.reduce((a,b)=>a+b,0):fn==='avg'?xs.reduce((a,b)=>a+b,0)/xs.length:fn==='min'?Math.min(...xs):Math.max(...xs);
async function execute(args,{store,uid}){const s=checkSpec(args),rs=await rows(store,uid,s.section),path=SECTIONS[s.section].path;
  const m=rs.filter(r=>s.filters.every(f=>test(r.rec[f.field],f)));const caveats=['Archived, deleted and sample records are excluded; only records synced to the cloud workspace are visible to the server.'];
  const g=new Map();let skipped=0;
  for(const r of m){const key=s.groupBy?String(r.rec[s.groupBy]===undefined?'(blank)':r.rec[s.groupBy]):'all';let e=g.get(key);if(!e){e={label:key,n:0,xs:[],ids:[]};g.set(key,e)}
    e.n++;if(e.ids.length<20)e.ids.push(path+'/'+r.id);if(s.fn!=='count'){const v=num(r.rec[s.valueField]);if(v===null)skipped++;else e.xs.push(v)}}
  if(skipped)caveats.push(skipped+' matching records had no numeric '+s.valueField+' and were skipped.');
  const groups=[...g.values()].map(e=>({label:e.label,value:agg(s.fn,e.xs,e.n),count:e.n,refs:e.ids})).sort((a,b)=>(b.value||0)-(a.value||0)).slice(0,50);
  const all=m.reduce((a,r)=>a,0);const tv=s.fn==='count'?m.length:agg(s.fn,[...g.values()].flatMap(e=>e.xs),m.length);
  const result={section:s.section,source:path,totalRecords:rs.length,matched:m.length,fn:s.fn,valueField:s.valueField,groupBy:s.groupBy,filters:s.filters,total:tv,groups,caveats};
  if(!rs.length)result.caveats.push('No records in this section are visible to the server (empty, not synced, or not permitted).');
  return {tool:'section',result,values:[m.length,rs.length,tv].concat(groups.map(x=>x.value),groups.map(x=>x.count)).filter(v=>typeof v==='number')}}
module.exports={SECTIONS,NAMES,hint,schemas,execute,checkSpec};
