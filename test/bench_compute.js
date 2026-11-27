process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8181';process.env.FIREBASE_PROJECT_ID='demo-aitest';process.env.FIREBASE_WEB_API_KEY='fake-key';
const ENV={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef'},fs=require('fs'),assert=require('assert'),deps=require('../lib/deps'),{route}=require('../lib/api'),ExcelJS=require('exceljs');
const H='http://127.0.0.1:8181',P='demo-aitest',A='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
(async()=>{await fetch(H+'/emulator/v1/projects/'+P+':securityRules',{method:'PUT',body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:fs.readFileSync('firestore.rules.draft','utf8')}]}})});
const em='bn'+Date.now()+'@x.com';await fetch(H+'/v1/projects/'+P+'/databases/(default)/documents/ws/main/roles/'+em,{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({fields:{role:{stringValue:'manager'},cv:{integerValue:'2'}}})});
const U=await (await fetch(A+'/accounts:signUp?key=x',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:em,password:'pw123456',returnSecureToken:true})})).json();
let U2=U,cnt=0;const call=async(n,b)=>{if(n==='process'){const e2='bn'+Date.now()+cnt+'@x.com';await fetch(H+'/v1/projects/'+P+'/databases/(default)/documents/ws/main/roles/'+e2,{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({fields:{role:{stringValue:'manager'},cv:{integerValue:'2'}}})});U2=await (await fetch(A+'/accounts:signUp?key=x',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e2,password:'pw123456',returnSecureToken:true})})).json();}return route(n,{method:'POST',headers:{authorization:'Bearer '+U2.idToken},body:b},deps,ENV)};
// seeded generator + independent oracle (the generator knows the true numbers; the engine only sees the messy cells)
let s=Number(process.env.SEED||12345);const rnd=()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296};const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const AR=d=>String(d).replace(/\d/g,x=>'٠١٢٣٤٥٦٧٨٩'[x]);
const cm=x=>x.toLocaleString('en-US');
const fmts=[v=>[v,v],v=>[v.toFixed(2),Number(v.toFixed(2))],v=>[v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),Number(v.toFixed(2))],v=>{const w=Math.round(v);return ['SAR '+cm(w),w]},v=>{const w=Math.round(v);return [w<0?'('+Math.abs(w)+')':String(w),w]},v=>{const w=Math.round(v);return [(w<0?'-':'')+AR(Math.abs(w)),w]},v=>{const w=Math.round(v);return [w+' ر.س',w]},v=>[v.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.').replace(/^(-?\d+)\.(\d{3},)/,'$1.$2'),null],v=>[Math.abs(v).toFixed(2).replace('.',',')+(v<0?'-':''),null]];
const N=Number(process.env.N||60),res={correct:0,refused:0,wrong:0,cases:0};const wrongs=[],lat={ingest:[],analyze:[]};
const near=(a,b)=>Math.abs(a-b)<=1e-6*Math.max(1,Math.abs(b));
for(let k=0;k<N;k++){
  const labels=['Riyadh','Jeddah','Dammam','الرياض','جدة','Makkah'].slice(0,ri(2,5));const rows=ri(5,80);const data=[];
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Data');ws.addRow(['Region','Revenue']);
  const fmtIdx=ri(0,fmts.length-1);const useMixed=rnd()<0.4;
  for(let i=0;i<rows;i++){const L=labels[ri(0,labels.length-1)];const v=ri(-5000,200000)/(rnd()<0.5?1:100);const f=useMixed?fmts[ri(0,fmts.length-1)]:fmts[fmtIdx];
    let [cell,truth]=f(v);const r=rnd();if(r<0.04){cell='n/a';truth=null}else if(r<0.07){cell=null;truth=null}
    ws.addRow([L,cell]);data.push({L,truth})}
  const buf=Buffer.from(await wb.xlsx.writeBuffer());
  let t0=Date.now();const up=await call('process',{name:'b'+k+'.xlsx',contentBase64:buf.toString('base64')});lat.ingest.push(Date.now()-t0);
  if(up.status!==200){global.ri=global.ri||{};const kk=up.status+JSON.stringify(up.body).slice(0,120);global.ri[kk]=(global.ri[kk]||0)+1;res.refused++;res.cases++;continue}
  const fid=up.body.file.id;if(data.some(d=>d.truth!==null&&!isFinite(d.truth))){global.nan=(global.nan||0)+1;continue}
  for(const fn of ['sum','avg','count']){res.cases++;
    const g={};data.forEach(d=>{if(d.truth===null)return;(g[d.L]=g[d.L]||[]).push(d.truth)});
    const exp={};Object.keys(g).forEach(l=>{const a=g[l];exp[l]=fn==='sum'?a.reduce((x,y)=>x+y,0):fn==='avg'?a.reduce((x,y)=>x+y,0)/a.length:a.length});
    const all=Object.values(g).flat();const expTotal=fn==='count'?all.length:fn==='avg'?(all.length?all.reduce((x,y)=>x+y,0)/all.length:null):all.reduce((x,y)=>x+y,0);
    t0=Date.now();let r;try{r=await call('analyze',{fileId:fid,sheet:'Data',labelCol:'A',valueCol:'B',fn})}catch(e){r={status:e.status||500,body:{}}}lat.analyze.push(Date.now()-t0);
    if(!r.body||!r.body.dataset){res.refused++;if(!global.rr)global.rr={};const key=r.status+':'+(r.body&&(r.body.code||r.body.error&&r.body.error.code))+':'+(r.body&&r.body.error&&r.body.error.message||'');global.rr[key]=(global.rr[key]||0)+1;continue}
    const ds=r.body.dataset;let ok=near(r.body.total.value,expTotal);
    ds.labels.forEach((l,i)=>{if(l==='(blank)')return;if(exp[l]===undefined||!near(ds.values[i],exp[l]))ok=false});
    Object.keys(exp).forEach(l=>{if(!ds.labels.includes(l))ok=false});
    if(ok)res.correct++;else{res.wrong++;if(wrongs.length<40)wrongs.push({k,fn,fmtIdx,useMixed,total:r.body.total.value,expTotal})}}
}
const q=(a,p)=>{const x=[...a].sort((m,n)=>m-n);return x[Math.min(x.length-1,Math.floor(x.length*p))]};
console.log(JSON.stringify({seed:process.env.SEED||12345,workbooks:N,cases:res.cases,correct:res.correct,safe_refusal:res.refused,wrong:res.wrong,ingest_ms:{p50:q(lat.ingest,.5),p95:q(lat.ingest,.95)},analyze_ms:{p50:q(lat.analyze,.5),p95:q(lat.analyze,.95)},wrongs}));
console.log(JSON.stringify([global.rr,global.ri,'nan_skipped',global.nan]));process.exit(res.wrong?1:0)})().catch(e=>{console.error(e);process.exit(2)});
