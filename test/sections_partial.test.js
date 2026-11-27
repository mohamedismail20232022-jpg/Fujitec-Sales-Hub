// Sections: numeric-looking unsupported values must refuse (no total); blank/text disclosed; beyond-1e15 explicitly PARTIAL. Real chat.run, memory store, mock provider.
const fs=require('fs'),D=require('../lib/docs'),C=require('../lib/chat'),store=require('../lib/store').memory();
const env={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef',NODE_ENV:'test'};
let bad=0,n=0;const T=(nm,c,i)=>{n++;if(!c){bad++;console.log('FAIL',nm,i===undefined?'':JSON.stringify(i).slice(0,350))}};
(async()=>{const fid=(await D.ingest({uid:'u',name:'sales.xlsx',buf:fs.readFileSync('fx/sales.xlsx'),store,env})).file.id;
const call='<tool_call>'+JSON.stringify({tool:'section',args:{section:'tenders',fn:'sum',valueField:'value'}})+'</tool_call>';
const pad=(k,v)=>Array.from({length:k},()=>v);
const cases=[
 ['clean',[100,200,300],'ok',600],['blank_text_only',[100,200,300,400,'n/a',null],'ok',1000],['all_zero',[0,0,0],'ok',0],
 ['currency_sign',['SAR -1,000','(SAR 500)','−250','SAR 2,000'],'ok',250],
 ['decimal_comma_among_10',[...pad(9,10),'12,5'],'refuse'],['plus_sign',[...pad(9,10),'+5'],'refuse'],['exponent',[...pad(9,10),'1e3'],'refuse'],['indian_grouping',[...pad(9,10),'1,23,456'],'refuse'],['trailing_minus',[...pad(9,10),'250-'],'refuse'],['european',[...pad(9,10),'1.234,50'],'refuse'],
 ['all_unsupported',['12,5','3,5','+5','1e3'],'refuse'],
 ['beyond_1e15',[10,20,1e21],'refuse'],['infinity',[10,20,Infinity],'refuse']];
for(const [nm,vals,exp,total] of cases){store._sections.set('ws/main/tenders',vals.map((v,i)=>({id:'t'+i,rec:{status:'open',value:v}})));
 const mkP=txt=>({name:'mock',complete:async b=>/You are a planner/.test(b.system)?call:txt});const ask=async txt=>C.run({uid:'u',b:{question:'What is the total value of tenders in the system?',fileIds:[fid]},store,env,provider:mkP(txt),role:'admin'});
 const o=await ask(exp==='refuse'?'The total is 9999 and the average is 4321 [S1].':'The total is '+total+' [S1].');const a=String(o.body.answer);
 if(exp==='refuse')T(nm+':invented 9999/4321 never visible',!/9999|4321/.test(a.replace(/\[Calculation[^\]]*\]/g,'')),a.slice(0,300));
 else{const oi=await ask('The total is 9999 [S1].');const ai=String(oi.body.answer).replace(/\[Calculation[^\]]*\]/g,'');T(nm+':invented total is REPLACED by the server rendering (not merely labelled)',!/9999/.test(ai)&&oi.body.serverRendered===true,ai.slice(0,300))}
 if(exp==='ok'){T(nm+':true total shown',a.includes(String(total)),a.slice(0,300));if(vals.some(v=>v===null||v==='n/a'||v===''))T(nm+':skip disclosed',/skipped/.test(a),a.slice(0,300));T(nm+':not labelled partial',!/PARTIAL/.test(a),a.slice(0,300))}
 else if(exp==='refuse'){const sumv=vals.filter(v=>typeof v==='number'||/^\d+$/.test(String(v))).reduce((x,y)=>x+Number(y),0);T(nm+':refused, no total',!new RegExp('\\b'+sumv+'\\b').test(a)||sumv===0,a.slice(0,300));T(nm+':says unsupported format or could not be run',/unsupported number format|could not|not numeric/i.test(a+JSON.stringify(o.body.notes||[])+JSON.stringify(o.body.toolErrors||[])),{a:a.slice(0,200),notes:o.body.notes,te:o.body.toolErrors})}
 else{T(nm+':PARTIAL visible',/PARTIAL RESULT/.test(a),a.slice(0,300))}
}
console.log(JSON.stringify({checks:n,passed:n-bad,failed:bad}));process.exit(bad?1:0)})().catch(e=>{console.error(e);process.exit(2)});
