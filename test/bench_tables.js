'use strict';
// Seeded table-extraction benchmark: docx, pdf (text-positioned), pptx. Independent oracle. Wrong vs abstain classified separately.
const fs=require('fs'),D=require('../lib/docs'),store=require('../lib/store').memory();
const dx=require('docx'),{PDFDocument,StandardFonts}=require('pdf-lib'),Pptx=require('pptxgenjs');
const env={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef',NODE_ENV:'test'};
let s=Number(process.env.SEED||1);const rnd=()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296};const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const fmt=[v=>[String(v),v],v=>[v.toLocaleString('en-US'),v],v=>['SAR '+v.toLocaleString('en-US'),v],v=>[v<0?'('+Math.abs(v)+')':String(v),v],v=>['-'+Math.abs(v)+'',-Math.abs(v)]];
const names=['Riyadh','Jeddah','Dammam','Makkah','Abha','Tabuk'];
const near=(a,b)=>Math.abs(a-b)<1e-6*Math.max(1,Math.abs(b));
(async()=>{const N=Number(process.env.N||30),out={};
for(const kind of ['docx','pdf','pptx']){const o=out[kind]={cases:0,correct:0,abstain:0,wrong:0,wrongs:[]};
 for(let k=0;k<N;k++){const rows=ri(3,25),f=fmt[ri(0,fmt.length-1)];const data=[];const used=names.slice(0,ri(2,4));
  for(let i=0;i<rows;i++){const v=ri(0,90000);const [c,t]=f(v);data.push({L:used[i%used.length],c,t})}
  let buf,name='t'+k+'.'+kind;
  if(kind==='docx'){const cell=x=>new dx.TableCell({children:[new dx.Paragraph(String(x))]});const doc=new dx.Document({sections:[{children:[new dx.Paragraph('Report'),new dx.Table({rows:[['City','Revenue'].concat([]),...data.map(d=>[d.L,d.c])].map(r=>new dx.TableRow({children:r.map(cell)}))})]}]});buf=Buffer.from(await dx.Packer.toBuffer(doc))}
  else if(kind==='pdf'){const pd=await PDFDocument.create(),pg=pd.addPage([600,Math.max(300,100+rows*20)]),ft=await pd.embedFont(StandardFonts.Helvetica);let y=pg.getHeight()-50;
   pg.drawText('City',{x:50,y,size:11,font:ft});pg.drawText('Revenue',{x:250,y,size:11,font:ft});data.forEach(d=>{y-=20;pg.drawText(d.L,{x:50,y,size:11,font:ft});pg.drawText(d.c,{x:250,y,size:11,font:ft})});buf=Buffer.from(await pd.save())}
  else{const p=new Pptx(),sl=p.addSlide();sl.addTable([[{text:'City'},{text:'Revenue'}],...data.map(d=>[{text:d.L},{text:d.c}])],{x:0.5,y:0.3,w:8});buf=Buffer.from(await p.write({outputType:'nodebuffer'}))}
  o.cases++;let r;try{const ing=await D.ingest({uid:'u',name,buf,store,env});const t=ing.file.tables[0];if(!t){o.abstain++;continue}
   const L=t.columns.find(c=>c.name==='City'),V=t.columns.find(c=>c.name==='Revenue');if(!L||!V||!V.numeric){o.abstain++;continue}
   r=await D.analyze({uid:'u',spec:{fileId:ing.file.id,sheet:t.sheet,labelCol:L.col,valueCol:V.col,fn:'sum'},store,env})}catch(e){o.abstain++;continue}
  const exp={};data.forEach(d=>exp[d.L]=(exp[d.L]||0)+d.t);let ok=r.dataset.labels.length===Object.keys(exp).length;r.dataset.labels.forEach((l,i)=>{if(exp[l]===undefined||!near(r.dataset.values[i],exp[l]))ok=false});
  if(ok)o.correct++;else{o.wrong++;if(o.wrongs.length<5)o.wrongs.push({k,rows,cells:data.slice(0,3).map(d=>d.c),got:r.dataset.values,exp})}}}
console.log(JSON.stringify({seed:process.env.SEED||1,N,out}));process.exit(Object.values(out).some(o=>o.wrong)?1:0)})().catch(e=>{console.error(e);process.exit(2)});
