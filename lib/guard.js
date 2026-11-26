'use strict';
// Input guards: file validation (magic bytes, size), prompt-injection wrapping, rate limiter.
const MAGIC={pdf:b=>b.slice(0,5).toString()==='%PDF-',zip:b=>b[0]===0x50&&b[1]===0x4b,ole:b=>b[0]===0xD0&&b[1]===0xCF&&b[2]===0x11&&b[3]===0xE0};
const EXT={pdf:'pdf',xlsx:'zip',docx:'zip',pptx:'zip',xls:'ole',doc:'ole',ppt:'ole',csv:null};
function validateFile(name,buf,maxBytes){
  const ext=(String(name).split('.').pop()||'').toLowerCase();
  if(!(ext in EXT)) return {ok:false,code:'UNSUPPORTED_TYPE',msg:'Unsupported file type .'+ext};
  if(!buf||!buf.length) return {ok:false,code:'EMPTY',msg:'File is empty'};
  if(buf.length>maxBytes) return {ok:false,code:'TOO_LARGE',msg:'File exceeds '+maxBytes+' bytes'};
  const k=EXT[ext]; if(k&&!MAGIC[k](buf)) return {ok:false,code:'BAD_SIGNATURE',msg:'Content does not match .'+ext};
  if(k==='zip'&&/\.(xlsm|docm|pptm)/i.test(name)) return {ok:false,code:'MACRO',msg:'Macro files rejected'};
  if(k==='zip'&&buf.includes(Buffer.from('vbaProject.bin'))) return {ok:false,code:'MACRO',msg:'Embedded macros rejected'};
  return {ok:true,ext};
}
function wrapUntrusted(text,src){ // document text is data, never instructions
  return '<document source="'+String(src).replace(/[<>"]/g,'')+'" trust="untrusted-data">\n'+String(text).replace(/<\/?document[^>]*>/gi,'')+'\n</document>';
}
function rateLimiter(max,windowMs,now){now=now||Date.now;const h=new Map();
  return uid=>{const t=now(),a=(h.get(uid)||[]).filter(x=>t-x<windowMs); if(a.length>=max){h.set(uid,a);return false;} a.push(t);h.set(uid,a);return true;};}
module.exports={validateFile,wrapUntrusted,rateLimiter};
