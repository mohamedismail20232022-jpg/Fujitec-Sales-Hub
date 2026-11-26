'use strict';
const JSZip=require('jszip'),ExcelJS=require('exceljs'),{XMLParser}=require('fast-xml-parser');
const xp=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',preserveOrder:false,textNodeName:'#t'});
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
function csvRows(text){const rows=[];let r=[],f='',q=false;for(let i=0;i<text.length;i++){const ch=text[i];
  if(q){if(ch==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=ch}
  else if(ch==='"')q=true;else if(ch===','){r.push(f);f=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;r.push(f);rows.push(r);r=[];f=''}else f+=ch}
  if(f!==''||r.length){r.push(f);rows.push(r)}return rows;}
const colName=n=>{let s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26}return s};
async function parseCSV(file,buf){let t=buf.toString('utf8');if(t.charCodeAt(0)===0xFEFF)t=t.slice(1);
  const cells=[];csvRows(t).forEach((r,i)=>r.forEach((v,j)=>{if(v!=='')cells.push({v,ref:colName(j+1)+(i+1)})}));
  return {kind:'sheet',sheets:[{name:'csv',cells,hidden:false}],chunks:[],warnings:[]};}
async function parseXLSX(file,buf){await safeZip(buf);const wb=new ExcelJS.Workbook();await wb.xlsx.load(buf);const sheets=[],warnings=[];
  wb.eachSheet(ws=>{const cells=[];ws.eachRow({includeEmpty:false},(row,rn)=>row.eachCell({includeEmpty:false},(c,cn)=>{
    let v=c.value,formula=null;if(v&&typeof v==='object'){if('formula' in v||'sharedFormula' in v){formula=v.formula||('='+(v.sharedFormula||''));v=v.result}else if(v.richText)v=v.richText.map(x=>x.text).join('');else if(v instanceof Date)v=v.toISOString();else if(v.text)v=v.text;else if(v.error)v=v.error}
    if((v===undefined||v===null||v==='')&&!formula)return;if(formula&&(v===undefined||v===null)){warnings.push({code:'FORMULA_NO_CACHED_VALUE',sheet:ws.name,ref:c.address});v=null}cells.push({v,ref:c.address,formula,hiddenRow:!!row.hidden,hiddenCol:!!ws.getColumn(cn).hidden})}));
    const hidden=ws.state!=='visible';if(hidden)warnings.push({code:'HIDDEN_SHEET',sheet:ws.name});sheets.push({name:ws.name,cells,hidden});});
  return {kind:'sheet',sheets,chunks:[],warnings};}
async function safeZip(buf){const z=await JSZip.loadAsync(buf);let tot=0,n=0;for(const k in z.files){n++;const u=(z.files[k]._data&&z.files[k]._data.uncompressedSize)||0;tot+=u;if(u>60e6||tot>150e6||n>5000)throw Object.assign(new Error('Archive expands beyond the safe limit (zip bomb protection)'),{code:'TOO_LARGE'})}return z}
async function parseDOCX(file,buf){const z=await safeZip(buf);const f=z.file('word/document.xml');if(!f)throw Object.assign(new Error('Not a valid DOCX'),{code:'CORRUPT'});
  const x=xp.parse(await f.async('string'));const body=x['w:document']['w:body'];const chunks=[];let heading='(no heading)',n=0;
  const ptext=p=>arr(p['w:r']).map(r=>arr(r['w:t']).map(t=>typeof t==='object'?t['#t']||'':t).join('')).join('');
  for(const p of arr(body['w:p'])){const t=ptext(p).trim();if(!t)continue;const st=p['w:pPr']&&p['w:pPr']['w:pStyle']&&p['w:pPr']['w:pStyle']['@w:val'];
    if(st&&/^(Heading|heading|Title)/.test(st)){heading=t;continue}chunks.push({text:t,cite:{file,heading,para:++n}});}
  const sheets=[];let tn=0;for(const tb of arr(body['w:tbl'])){tn++;const cells=[];arr(tb['w:tr']).forEach((tr,ri)=>{const row=arr(tr['w:tc']).map(tc=>arr(tc['w:p']).map(ptext).join(' ').trim());if(row.some(Boolean))chunks.push({text:row.join(' | '),cite:{file,heading,table:'Table '+tn}});row.forEach((v,ci)=>{if(v!=='')cells.push({v,ref:colName(ci+1)+(ri+1)})})});if(cells.length)sheets.push({name:'Table '+tn,cells,hidden:false})}
  return {kind:'doc',chunks,sheets,noRowChunks:true,warnings:[]};}
async function parsePPTX(file,buf){const z=await safeZip(buf);const names=Object.keys(z.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>+a.match(/\d+/)[0]-+b.match(/\d+/)[0]);
  if(!names.length)throw Object.assign(new Error('No slides found'),{code:'CORRUPT'});const chunks=[],warnings=[],sheets=[];
  for(const nm of names){const slide=+nm.match(/\d+/)[0];const s=await z.file(nm).async('string');
    const texts=[...s.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g,'').matchAll(/<a:p[ >][\s\S]*?<\/a:p>/g)].map(m=>[...m[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t=>t[1]).join('').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')).filter(t=>t.trim());
    texts.forEach(t=>chunks.push({text:t,cite:{file,slide}}));
    const nf='ppt/notesSlides/notesSlide'+slide+'.xml';if(z.file(nf)){const ns=await z.file(nf).async('string');const t=[...ns.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m=>m[1]).join(' ').trim();if(t)chunks.push({text:t,cite:{file,slide,notes:true}})}
    if(/<p:pic>/.test(s))warnings.push({code:'IMAGE_NOT_OCRED',slide});
    let k=0;for(const tb of s.matchAll(/<a:tbl>[\s\S]*?<\/a:tbl>/g)){k++;const cells=[];[...tb[0].matchAll(/<a:tr[ >][\s\S]*?<\/a:tr>/g)].forEach((tr,ri)=>{const row=[...tr[0].matchAll(/<a:tc[ >][\s\S]*?<\/a:tc>/g)].map(tc=>[...tc[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t=>t[1]).join(' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim());if(row.some(Boolean))chunks.push({text:row.join(' | '),cite:{file,slide,table:'Table '+k}});row.forEach((v,ci)=>{if(v!=='')cells.push({v,ref:colName(ci+1)+(ri+1)})})});if(cells.length)sheets.push({name:'Slide '+slide+' Table '+k,cells,hidden:false})}}
  return {kind:'slides',chunks,sheets,noRowChunks:true,warnings};}
const OCR_MAX_PAGES=+process.env.AIDOCS_OCR_MAX_PAGES||8,OCR_BUDGET_MS=120000;let _w=null;
function ocrOn(){return process.env.AIDOCS_OCR!=='0'}
async function ocrPage(pg){const {createWorker}=require('tesseract.js');const vp=pg.getViewport({scale:2});if(vp.width*vp.height>40e6)throw new Error('page too large');
  const cv=require('@napi-rs/canvas').createCanvas(Math.ceil(vp.width),Math.ceil(vp.height));const ctx=cv.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);await pg.render({canvasContext:ctx,viewport:vp,canvas:cv}).promise;
  if(!_w)_w=await createWorker(['ara','eng'],1,{langPath:require('path').join(__dirname,'tessdata'),gzip:true,cachePath:'/tmp/tess',workerPath:require.resolve('tesseract.js/src/worker-script/node/index.js')});
  const r=await _w.recognize(cv.toBuffer('image/png'));return {text:r.data.text.replace(/[\u200e\u200f]/g,'').split('\n').map(x=>x.trim()).filter(Boolean).join('\n'),conf:Math.round(r.data.confidence)}}
async function ocrClose(){if(_w){const w=_w;_w=null;await w.terminate()}}

// Heuristic PDF table detection from text positions: >=3 consecutive rows with the same number (>=2) of x-aligned cells. Heuristic only; results are flagged PDF_TABLE_HEURISTIC and must be reviewed.
function pdfTables(items,page,file,sheets,chunks){const its=items.filter(i=>'str' in i&&i.str.trim()).map(i=>({x:Math.round(i.transform[4]),y:Math.round(i.transform[5]),t:i.str.trim()}));
  const rows=[];its.sort((a,b)=>b.y-a.y||a.x-b.x).forEach(i=>{const r=rows.find(r=>Math.abs(r.y-i.y)<=3);if(r)r.c.push(i);else rows.push({y:i.y,c:[i]})});
  rows.forEach(r=>r.c.sort((a,b)=>a.x-b.x));let run=[],k=0;
  const flush=()=>{if(run.length>=3){k++;const cells=[];run.forEach((r,ri)=>r.c.forEach((c,ci)=>cells.push({v:c.t,ref:colName(ci+1)+(ri+1)})));sheets.push({name:'Page '+page+' Table '+k,cells,hidden:false,heuristic:true});run.forEach(r=>chunks.push({text:r.c.map(c=>c.t).join(' | '),cite:{file,page,table:'Table '+k,heuristic:true}}))}run=[]};
  for(const r of rows){const ok=r.c.length>=2&&(!run.length||(r.c.length===run[0].c.length&&r.c.every((c,i)=>Math.abs(c.x-run[0].c[i].x)<=12)));if(ok)run.push(r);else{flush();if(r.c.length>=2)run=[r]}}flush()}
async function parsePDF(file,buf){const t0=Date.now();let ocrPages=0;const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc=await pdfjs.getDocument({data:new Uint8Array(buf),useSystemFonts:false,isEvalSupported:false,disableFontFace:true,standardFontDataUrl:require('path').dirname(require.resolve('pdfjs-dist/package.json'))+'/standard_fonts/'}).promise;const chunks=[],warnings=[],sheets=[];
  for(let p=1;p<=doc.numPages;p++){const pg=await doc.getPage(p);const tc=await pg.getTextContent();let lines=[],cur='',y=null;
    for(const it of tc.items){if(!('str' in it))continue;const yy=Math.round(it.transform[5]);if(y!==null&&Math.abs(yy-y)>3){lines.push(cur);cur=''}cur+=it.str+(it.hasEOL?'':'');y=yy}
    const tblc=[];pdfTables(tc.items,p,file,sheets,tblc);
    if(cur)lines.push(cur);const text=lines.map(l=>l.trim()).filter(Boolean).join('\n');
    if(text.length>=20){chunks.push({text,cite:{file,page:p}});chunks.push(...tblc);continue}
    if(!ocrOn()||ocrPages>=OCR_MAX_PAGES||Date.now()-t0>OCR_BUDGET_MS){warnings.push({code:ocrOn()?'OCR_PAGE_LIMIT':'NO_TEXT_LAYER_NEEDS_OCR',page:p});continue}
    try{ocrPages++;const o=await ocrPage(pg);if(o.text.length<5)warnings.push({code:'OCR_EMPTY',page:p});else if(o.conf<75)warnings.push({code:'OCR_LOW_CONFIDENCE_EXCLUDED',page:p,conf:o.conf,msg:'OCR text for this page is unreliable and was NOT indexed; review the page image or upload a better scan'});else{chunks.push({text:o.text,cite:{file,page:p,ocr:true,conf:o.conf}});warnings.push({code:'OCR_USED',page:p,conf:o.conf})}}catch(e){warnings.push({code:'OCR_FAILED',page:p})}}
  if(sheets.length)warnings.push({code:'PDF_TABLE_HEURISTIC',msg:'Tables were detected from text positions, review them against the page'});await ocrClose();return {kind:'pdf',pages:doc.numPages,chunks,sheets,noRowChunks:true,warnings};}
async function parseFile(file,buf){const ext=file.split('.').pop().toLowerCase();
  try{let r;if(ext==='pdf')r=await parsePDF(file,buf);else if(ext==='docx')r=await parseDOCX(file,buf);else if(ext==='pptx')r=await parsePPTX(file,buf);
    else if(ext==='xlsx')r=await parseXLSX(file,buf);else if(ext==='csv')r=await parseCSV(file,buf);
    else return {status:'failed',error:{code:'LEGACY_FORMAT_NEEDS_CONVERTER',msg:'.'+ext+' needs a server-side converter (not implemented)'},chunks:[],warnings:[]};
    if(r.sheets&&!r.noRowChunks)r.sheets.forEach(s=>{const rows={};s.cells.forEach(c=>{const rn=c.ref.replace(/\D/g,'');(rows[rn]=rows[rn]||[]).push(c)});
      Object.keys(rows).forEach(rn=>r.chunks.push({text:rows[rn].map(c=>c.ref+'='+(c.v===null?(c.formula?'='+c.formula.replace(/^=/,'')+' (no cached value)':''):c.v)).join('; '),cite:{file,sheet:s.name,cells:rows[rn][0].ref+':'+rows[rn][rows[rn].length-1].ref,hidden:s.hidden||undefined}}))});
    return Object.assign({status:r.chunks.length?'ready':'failed',file},r,r.chunks.length?{}:{error:{code:'NO_CONTENT',msg:'No extractable text (scanned? needs OCR)'}});}
  catch(e){return {status:'failed',file,error:{code:e.code||'CORRUPT',msg:'Could not parse '+file+': '+String(e.message).slice(0,120)},chunks:[],warnings:[]};}}
module.exports={parseFile,ocrClose};
