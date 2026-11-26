'use strict';
const crypto=require('crypto'),zlib=require('zlib'),{parseFile}=require('./parse'),calc=require('./calc'),{sign,verify}=require('./sign');
const MAX_PACKS=40,MAXTXT=15000,PACK_RAW=2500000,PACK_B64_MAX=800000,MAX_PASSAGES=400000;
const colOf=ref=>String(ref).replace(/\d+/g,''),rowOf=ref=>+String(ref).replace(/\D+/g,'');
function detectTables(sheets){const out=[];for(const s of sheets){const rows={};s.cells.forEach(c=>{(rows[rowOf(c.ref)]=rows[rowOf(c.ref)]||[]).push(c)});
  const rn=Object.keys(rows).map(Number).sort((a,b)=>a-b);const hr=rn.find(r=>rows[r].filter(c=>c.v!==null&&c.v!=='').length>=2);if(hr===undefined)continue;
  const cols=rows[hr].map(h=>{const col=colOf(h.ref);const vals=rn.filter(r=>r>hr).map(r=>(rows[r].find(c=>colOf(c.ref)===col)||{}).v).filter(v=>v!==undefined&&v!==null&&v!=='');
    const nn=vals.filter(v=>calc.num(v)!==null).length;return {col,name:String(h.v),numeric:vals.length>0&&nn/vals.length>=.6,count:vals.length}});
  out.push({sheet:s.name,headerRow:hr,rows:rn.filter(r=>r>hr).length,hidden:!!s.hidden,heuristic:s.heuristic||undefined,columns:cols});}return out;}
const safeName=n=>String(n).replace(/[\\/\u0000-\u001f<>"|?*:]/g,'_').slice(0,200);
async function ingest({uid,name,buf,store,env}){sign({uid:'x',fid:'x',cid:'x',kind:'t',n:0,cite:'',text:''},env); // fail closed before work when signing is not configured
  name=safeName(name);const fid=crypto.randomBytes(8).toString('hex'),now=new Date().toISOString(),r=await parseFile(name,buf);
  const meta={id:fid,name,size:buf.length,createdAt:now,updatedAt:now,warnings:(r.warnings||[]).slice(0,50)};
  if(r.status!=='ready'){Object.assign(meta,{status:'failed',error:(r.error&&r.error.msg)||'Failed'});await store.putFile(uid,meta);return {file:meta,http:422}}
  const out=[];let n=0;const add=(kind,text,cite)=>{for(let i=0;i<text.length||i===0;i+=MAXTXT){const t=text.slice(i,i+MAXTXT);out.push({cid:'c'+String(out.length).padStart(4,'0'),kind,n:n++,cite:JSON.stringify(cite),text:t})}};
  let blk=null;const flushB=()=>{if(blk){add('text',blk.text,{file:name,sheet:blk.sheet,cells:blk.first+':'+blk.last,hidden:blk.hidden});blk=null}};
  r.chunks.forEach(c=>{if(c.cite.sheet&&c.cite.cells){const [a,b]=c.cite.cells.split(':');if(blk&&blk.sheet===c.cite.sheet&&blk.text.length+c.text.length<2000){blk.text+='\n'+c.text;blk.last=b}else{flushB();blk={sheet:c.cite.sheet,first:a,last:b,text:c.text,hidden:c.cite.hidden}}}else{flushB();add('text',c.text,c.cite)}});flushB();
  const tables=r.sheets?detectTables(r.sheets):[];
  (r.sheets||[]).forEach(s=>{let part=[],len=0,first=null;const flush=()=>{if(part.length){add('cells',JSON.stringify(part),{file:name,sheet:s.name,cells:first+':'+part[part.length-1][0]});part=[];len=0;first=null}};
    s.cells.forEach(c=>{const e=[c.ref,c.v,c.formula||undefined];const l=JSON.stringify(e).length;if(len+l>12000)flush();if(!first)first=c.ref;part.push(e);len+=l});flush()});
  if(out.length>MAX_PASSAGES){Object.assign(meta,{status:'failed',error:'File has too many passages ('+out.length+'); not stored, not partially indexed'});await store.putFile(uid,meta);return {file:meta,http:413}}
  // pack passages into few gzip documents (Firestore free tier allows 20k writes/day; a 70k-row sheet would otherwise need thousands)
  const packs=[];const mk=arr=>{const b64=zlib.gzipSync(Buffer.from(JSON.stringify(arr.map(p=>({k:p.kind,c:p.cite,t:p.text}))))).toString('base64');if(b64.length>PACK_B64_MAX&&arr.length>1){const h=arr.length>>1;mk(arr.slice(0,h));mk(arr.slice(h));return}if(b64.length>PACK_B64_MAX)throw Object.assign(new Error('single passage too large'),{status:413,code:'TOO_LARGE'});packs.push({kind:'pack',text:b64,count:arr.length})};
  let cur=[],raw=0;for(const p of out){const l=p.text.length+p.cite.length+20;if(raw+l>PACK_RAW&&cur.length){mk(cur);cur=[];raw=0}cur.push(p);raw+=l}if(cur.length)mk(cur);
  if(packs.length>MAX_PACKS){Object.assign(meta,{status:'failed',error:'File is too large to store ('+packs.length+' packs > '+MAX_PACKS+'); not stored, not partially indexed'});await store.putFile(uid,meta);return {file:meta,http:413}}
  Object.assign(meta,{status:'processing',tables});await store.putFile(uid,meta);
  try{
    const pc=packs.map((p,i)=>{const c={uid,fid,cid:'p'+String(i).padStart(3,'0'),kind:'pack',n:p.count,cite:'{}',text:p.text};c.sig=sign(c,env);return c});
    for(let i=0;i<pc.length;i+=4)await Promise.all(pc.slice(i,i+4).map(c=>store.putChunk(uid,fid,c)));
    // signed manifest written LAST: file name, tables and the exact list of packs. Analysis trusts only this, never the editable file record.
    const man={cid:'m0000',kind:'meta',n:out.length,cite:'{}',text:JSON.stringify({name,size:buf.length,tables,cids:pc.map(c=>c.cid),count:pc.length,passages:out.length})};
    const fm=Object.assign({uid,fid},man);fm.sig=sign(fm,env);await store.putChunk(uid,fid,fm);
    meta.status='ready';meta.updatedAt=new Date().toISOString();await store.putFile(uid,meta);return {file:meta,http:200,passages:out.length,packs:pc.length};
  }catch(e){try{meta.status='failed';meta.error='Storing failed; file not usable ('+(e.code||'STORE_ERROR')+')';await store.putFile(uid,meta)}catch(_){}
    throw Object.assign(new Error('Storing the file failed; it was marked failed and is not usable'),{status:e.status||502,code:e.code||'STORE_ERROR'});}}
async function loadVerified(uid,fid,store,env){const f=await store.getFile(uid,fid);if(!f){const e=new Error('File not found');e.status=404;e.code='NOT_FOUND';throw e}
  if(f.status!=='ready'){const e=new Error('File is not ready ('+f.status+')');e.status=409;e.code='NOT_READY';throw e}
  const integ=m=>Object.assign(new Error(m),{status:409,code:'INTEGRITY'});
  const cs=await store.getChunks(uid,fid);const bad=cs.filter(c=>!verify(Object.assign({uid,fid},c),env));
  if(bad.length)throw integ('Stored data failed integrity check ('+bad.length+' passages); refusing to use it');
  const mc=cs.filter(c=>c.kind==='meta');if(mc.length!==1)throw integ('Signed manifest missing; refusing to use partial data');
  const man=JSON.parse(mc[0].text),have=new Set(cs.filter(c=>c.kind!=='meta').map(c=>c.cid));
  if(man.cids.length!==man.count||man.cids.some(id=>!have.has(id))||have.size!==man.count)throw integ('Stored passages do not match the signed manifest (missing or extra passages)');
  const passages=[];for(const c of cs.filter(c=>c.kind==='pack').sort((a,b)=>a.cid<b.cid?-1:1)){let arr;try{arr=JSON.parse(zlib.gunzipSync(Buffer.from(c.text,'base64'),{maxOutputLength:8*1024*1024}).toString())}catch(e){throw integ('Pack could not be read; refusing to use it')}arr.forEach(p=>passages.push({kind:p.k,cite:JSON.parse(p.c),text:p.t}))}
  if(passages.length!==man.passages)throw integ('Passage count does not match the signed manifest');
  return {file:Object.assign({},f,{name:man.name,tables:man.tables}),chunks:passages};}
function sheetCells(chunks,sheet){const m=[];chunks.filter(c=>c.kind==='cells'&&c.cite.sheet===sheet).forEach(c=>JSON.parse(c.text).forEach(x=>m.push({ref:x[0],v:x[1],formula:x[2]})));return m;}
const AGG={sum:calc.sum,avg:calc.avg,median:calc.median,count:calc.count};
async function analyze({uid,spec,store,env}){const {file,chunks}=await loadVerified(uid,spec.fileId,store,env);const t=(file.tables||[]).find(x=>x.sheet===spec.sheet);
  const bad=(m,c)=>Object.assign(new Error(m),{status:422,code:c||'BAD_ANALYSIS'});
  if(!t)throw bad('Sheet "'+spec.sheet+'" not found in '+file.name);const lc=t.columns.find(c=>c.col===spec.labelCol),vc=t.columns.find(c=>c.col===spec.valueCol);
  if(!lc||!vc)throw bad('Unknown column');if(!vc.numeric)throw bad('Column '+vc.col+' ("'+vc.name+'") is not numeric');if(!AGG[spec.fn||'sum'])throw bad('Unknown aggregation');
  const cells=sheetCells(chunks,spec.sheet),byRow={};cells.forEach(c=>{(byRow[rowOf(c.ref)]=byRow[rowOf(c.ref)]||{})[colOf(c.ref)]=c});
  const groups=new Map(),skipped=[];Object.keys(byRow).map(Number).filter(r=>r>t.headerRow).sort((a,b)=>a-b).forEach(r=>{const L=byRow[r][spec.labelCol],V=byRow[r][spec.valueCol];if(!V)return;
    const n=calc.num(V.v);const ref=file.name+'!'+spec.sheet+'!'+V.ref;if(n===null){skipped.push({ref,raw:V.v});return}
    const label=L&&L.v!==null?String(L.v):'(blank)';const g=groups.get(label)||{vals:[],refs:[]};g.vals.push({v:n,ref});g.refs.push(ref);groups.set(label,g)});
  const fn=spec.fn||'sum',labels=[...groups.keys()],per=labels.map(l=>AGG[fn](groups.get(l).vals));
  const all=labels.flatMap(l=>groups.get(l).vals);const total=AGG[fn==='avg'?'avg':fn==='count'?'count':'sum'](all);
  return {file:file.name,sheet:spec.sheet,fn,label:lc.name,value:vc.name,
    dataset:{labels,values:per.map(p=>p.value),refs:labels.map(l=>groups.get(l).refs.join(', ')),unit:''},total:{value:total.value,formula:total.formula,numerator:total.numerator,denominator:total.denominator,cellsUsed:all.length},skipped,
    caveats:t.heuristic?[{code:'PDF_TABLE_HEURISTIC',msg:'This table was detected from PDF text positions, not read from a real table object. Verify values against the page before relying on them.'}]:[],
    note:fn==='avg'?'Total row is the average over all cells, not the average of group averages.':undefined};}
// Deterministic comparison between two server-computed group values (same or different file/sheet). Inputs are NEVER client numbers: each side is recomputed from the verified store.
async function compare({uid,spec,store,env}){const bad=(m,c)=>Object.assign(new Error(m),{status:422,code:c||'BAD_COMPARE'});
  const OPS=['pct_change','ratio','difference','share'];if(!OPS.includes(spec.op))throw bad('Unknown comparison "'+spec.op+'"');
  const pick=async side=>{if(!side||!side.spec)throw bad('Both sides need a spec');const an=await analyze({uid,spec:side.spec,store,env});const i=an.dataset.labels.indexOf(String(side.label));if(i<0)throw bad('Label "'+side.label+'" not found in '+an.file+' / '+an.sheet);
    return {an,label:an.dataset.labels[i],value:an.dataset.values[i],refs:an.dataset.refs[i],file:an.file,sheet:an.sheet,fn:an.fn,caveats:an.caveats||[]}};
  const A=await pick(spec.a);let B=null,r;
  if(spec.op==='share'){if(A.fn!=='sum')throw bad('share needs sum');r=calc.ratio('share',A.value,A.an.total.value,true);B={label:'Total',value:A.an.total.value,refs:'all '+A.an.total.cellsUsed+' cells of '+A.file+'!'+A.sheet,file:A.file,sheet:A.sheet,caveats:[]}}
  else{B=await pick(spec.b);if(A.fn!==B.fn)throw bad('Both sides must use the same aggregation');
    r=spec.op==='pct_change'?calc.growth(B.value,A.value):spec.op==='ratio'?calc.ratio('ratio',A.value,B.value,false):Object.assign(calc.sum([A.value,-B.value]),{name:'difference',formula:'a−b',numerator:A.value,denominator:B.value})}
  if(r.value===null||r.value===undefined)throw bad('Cannot compute: '+(r.error||'invalid inputs'),'COMPARE_UNDEFINED');
  return {kind:'compare',op:spec.op,result:{value:r.value,unit:r.unit||'',formula:r.formula,numerator:r.numerator,denominator:r.denominator},
    a:{label:A.label,value:A.value,refs:A.refs,file:A.file,sheet:A.sheet},b:{label:B.label,value:B.value,refs:B.refs,file:B.file,sheet:B.sheet},
    caveats:[].concat(A.caveats,B.caveats||[])}}
module.exports={compare,ingest,loadVerified,analyze,detectTables,sheetCells};
