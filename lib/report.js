'use strict';
// Real file exporters. report: {title, sections:[{heading,paragraphs:[],table:{head,rows},chart:{svg},sources:[str]}]}
const D=require('docx'),ExcelJS=require('exceljs'),PptxGenJS=require('pptxgenjs'),{PDFDocument,StandardFonts,rgb}=require('pdf-lib');
const {toPNG,svg:mkSvg,lineSVG}=require('./chart'),calc=require('./calc');
// build(): one dataset per section drives table, chart, summary and sources, so they cannot disagree.
// spec section: {heading, dataset:{labels:[], values:[], refs:[], unit}, chartType, paragraphs?}
function build(spec){const bad=(m,c)=>Object.assign(new Error(m),{code:c||'REPORT_INCONSISTENT'});
  if(!spec||!spec.title||!Array.isArray(spec.sections)||!spec.sections.length)throw bad('Report needs title and sections','REPORT_INVALID');
  return {title:spec.title,sections:spec.sections.map(s=>{
    if(s.table||s.chart||s.sources)throw bad('Section "'+s.heading+'": table/chart/sources must be derived from dataset, not supplied separately');
    const o={heading:s.heading,paragraphs:(s.paragraphs||[]).slice()};const d=s.dataset;if(!d)return o;
    if(!Array.isArray(d.labels)||!Array.isArray(d.values)||!Array.isArray(d.refs)||d.labels.length!==d.values.length||d.refs.length!==d.values.length)throw bad('Section "'+s.heading+'": labels, values and refs must have equal length (every value needs a source)');
    if(d.refs.some(r=>!r||!String(r).trim()))throw bad('Section "'+s.heading+'": a value has no source reference');
    const t=calc.sum(d.values.map((v,i)=>({v,ref:d.refs[i]})));if(t.skipped.length)throw bad('Section "'+s.heading+'": non-numeric values at '+t.skipped.map(x=>x.ref).join(', '),'REPORT_NON_NUMERIC');
    o.table={head:['Item','Value'+(d.unit?' ('+d.unit+')':''),'Source'],rows:d.labels.map((l,i)=>[l,d.values[i],d.refs[i]])};
    if(!s.summary)o.paragraphs.unshift('Total of '+d.values.length+' items: '+t.value+(d.unit?' '+d.unit:'')+' (sum of the values in the table).');
    if(d.caveat)o.paragraphs.unshift('CAUTION: '+d.caveat);
    o.caveat=d.caveat;o.chart={svg:mkSvg({type:s.chartType||'bar',title:s.heading,data:d.labels.map((l,i)=>({label:l,value:Number(d.values[i])})),source:(d.caveat?'CAUTION: heuristic PDF table, verify. ':'')+d.refs.length+' sources, see table'}),n:d.values.length,sum:t.value};
    o.sources=[...new Set(d.refs)];return o;})};}

const cite=s=>s.sources&&s.sources.length?'Sources: '+s.sources.join('; '):'';
async function docx(r){const ch=[new D.Paragraph({heading:D.HeadingLevel.TITLE,text:r.title})];
  for(const s of r.sections){ch.push(new D.Paragraph({heading:D.HeadingLevel.HEADING_1,text:s.heading}));(s.paragraphs||[]).forEach(p=>ch.push(new D.Paragraph(p)));
    if(s.table)ch.push(new D.Table({rows:[s.table.head,...s.table.rows].map(row=>new D.TableRow({children:row.map(c=>new D.TableCell({children:[new D.Paragraph(String(c))]}))}))}));
    if(s.table)ch.push(new D.Paragraph({text:''}));if(s.chart)ch.push(new D.Paragraph({children:[new D.ImageRun({type:'png',data:toPNG(s.chart.svg),transformation:{width:480,height:285}})]}));
    if(cite(s))ch.push(new D.Paragraph({children:[new D.TextRun({text:cite(s),italics:true,size:18})]}));}
  return D.Packer.toBuffer(new D.Document({sections:[{children:ch}]}));}
async function xlsx(r){const wb=new ExcelJS.Workbook();for(const s of r.sections){const ws=wb.addWorksheet(String(s.heading).replace(/[\\\/?*\[\]:]/g,' ').slice(0,31));
  if(s.table){ws.addRow(s.table.head).font={bold:true};s.table.rows.forEach(x=>ws.addRow(x.map(c=>typeof c==='string'&&c.trim()!==''&&isFinite(c)?Number(c):c)));}
  ws.columns.forEach(c=>c.width=28);(s.paragraphs||[]).forEach(p=>ws.addRow([p]));if(cite(s))ws.addRow([cite(s)]);if(s.chart){const id=wb.addImage({buffer:toPNG(s.chart.svg),extension:'png'});ws.addImage(id,{tl:{col:4,row:0},ext:{width:480,height:285}});}}return Buffer.from(await wb.xlsx.writeBuffer());}
async function pptx(r){const p=new PptxGenJS();let s=p.addSlide();s.addText(r.title,{x:.5,y:2,w:9,h:1,fontSize:32,bold:true,color:'C8102E'});
  for(const sec of r.sections){s=p.addSlide();s.addText(sec.heading,{x:.5,y:.3,w:9,h:.6,fontSize:24,bold:true});let y=1;
    if(sec.paragraphs&&sec.paragraphs.length){s.addText(sec.paragraphs.join('\n'),{x:.5,y,w:9,h:1.2,fontSize:14,valign:'top'});y+=1.3}
    if(sec.table)s.addTable([sec.table.head.map(t=>({text:String(t),options:{bold:true}})),...sec.table.rows.map(row=>row.map(String))],{x:.5,y,w:5,fontSize:11});
    if(sec.chart)s.addImage({data:'image/png;base64,'+toPNG(sec.chart.svg).toString('base64'),x:5.6,y,w:4.2,h:2.5});
    if(cite(sec))s.addText(cite(sec),{x:.5,y:5.1,w:9,h:.4,fontSize:9,italic:true});}
  return Buffer.from(await p.write({outputType:'nodebuffer'}));}
async function pdf(r){const d=await PDFDocument.create(),f=await d.embedFont(StandardFonts.Helvetica),fb=await d.embedFont(StandardFonts.HelveticaBold);
  let pg=d.addPage([595,842]),y=800;const isLatin=t=>/^[\x20-\x7E\u00A0-\u00FF]*$/.test(t);
  const line=async(t,sz,font,x=50,cw=495,keep)=>{t=String(t);if(!keep&&t.length>85){const ws=t.split(/\s+/);let cur='';const out=[];for(const w of ws){if((cur+' '+w).length>85&&cur){out.push(cur);cur=w}else cur=cur?cur+' '+w:w}out.push(cur);for(const o of out)await line(o,sz,font,x,cw,keep);return}t=t.slice(0,110);if(y<60&&!keep){pg=d.addPage([595,842]);y=800}
    if(isLatin(t)){pg.drawText(t,{x,y,size:sz,font:font||f,color:rgb(0,0,0)});}
    else{const W=cw*2,im=await d.embedPng(toPNG(lineSVG(t,sz*2,W,font===fb)));const h=sz*1.6*(495/W)*2/2*1.0;pg.drawImage(im,{x,y:y-sz*.4,width:cw,height:sz*1.6});} // shaped via resvg + bundled Noto Naskh; text in these lines is an image (not selectable)
    if(!keep)y-=sz+6};
  await line(r.title,20,fb);y-=8;for(const s of r.sections){await line(s.heading,15,fb);for(const p of s.paragraphs||[])await line(p,11);
    if(s.table){const X=[50,230,330],CW=[170,90,215];for(const [i,row] of [s.table.head,...s.table.rows].entries()){if(y<60){pg=d.addPage([595,842]);y=800}for(let c=0;c<row.length;c++)await line(row[c],10,i?f:fb,X[c]||50,CW[c]||90,true);y-=16}}
    if(s.chart){const img=await d.embedPng(toPNG(s.chart.svg));if(y<260){pg=d.addPage([595,842]);y=800}pg.drawImage(img,{x:50,y:y-230,width:400,height:228});y-=240}
    if(cite(s))await line(cite(s),8);y-=8}
  return {buf:Buffer.from(await d.save()),warnings:[]};}
function csv(r){const q=v=>{v=String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};const o=[];for(const s of r.sections)if(s.table){o.push(q(s.heading));if(s.caveat)o.push(q('CAUTION: '+s.caveat));if(/^(Percentage|Ratio|Difference|Share)/.test(s.heading))(s.paragraphs||[]).forEach(p=>{if(!/^CAUTION/.test(p))o.push(q(p))});o.push(s.table.head.map(q).join(','));s.table.rows.forEach(x=>o.push(x.map(q).join(',')));o.push('')}return '\uFEFF'+o.join('\r\n');}
module.exports={build,docx,xlsx,pptx,pdf,csv};
