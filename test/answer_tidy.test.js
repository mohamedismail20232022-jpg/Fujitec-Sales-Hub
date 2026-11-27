// Live-smoke findings (Nov 27): (a) a skipped-cell caveat printed twice, (b) a refusal answer full of bare "sentence removed" lines. Real chat.run, memory store, mock provider.
const fs=require('fs'),D=require('../lib/docs'),C=require('../lib/chat'),store=require('../lib/store').memory();
const env={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef',NODE_ENV:'test'};
let bad=0,n=0;const T=(nm,c,i)=>{n++;if(!c){bad++;console.log('FAIL',nm,i===undefined?'':JSON.stringify(i).slice(0,400))}};
const EN='[sentence removed: not supported by the retrieved document text]',AR='[\u062a\u0645 \u062d\u0630\u0641 \u062c\u0645\u0644\u0629 \u0644\u0645 \u064a\u062f\u0639\u0645\u0647\u0627 \u0646\u0635 \u0627\u0644\u0645\u0633\u062a\u0646\u062f\u0627\u062a \u0627\u0644\u0645\u0633\u062a\u0631\u062c\u0639\u0629]';
// unit: tidyRemoved
{const t=C.tidyRemoved;
 const plain='Total: 5 [S1]\nNothing else.';T('no marker: byte-identical',t(plain,false)===plain);
 const a=t('Intro line.\n\n'+EN+'\n\n- '+EN+'\n- '+EN+'\n- Makkah: +5 [S1]\n1. '+EN+'\n\nThe total cannot be confirmed.',false);
 T('marker-only lines are gone',!a.split('\n').some(l=>l.trim()===EN||/^\s*(-|1\.)\s*\[sentence removed/.test(l)),a);
 T('exactly one count note, correct count (4)',/\[4 sentence\(s\) removed: not supported by the retrieved document text\]\s*$/.test(a)&&(a.match(/sentence\(s\) removed/g)||[]).length===1,a);
 T('surviving text and the supported bullet are unchanged',a.includes('Intro line.')&&a.includes('- Makkah: +5 [S1]')&&a.includes('The total cannot be confirmed.'),a);
 T('no triple blank lines',!/\n{3,}/.test(a),a);
 const m='Revenue was 12 and '+EN+' then more.';T('inline marker inside a longer line stays; nothing counted',t(m,false)===m);
 const r=t('- '+AR+'\n- '+AR+'\nالإجمالي غير مؤكد.',true);T('Arabic markers collapse to one Arabic note with count 2',!r.includes(AR)&&/\u062a\u0645 \u062d\u0630\u0641 2 \u062c\u0645\u0644\u0629/.test(r)&&r.includes('\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u063a\u064a\u0631 \u0645\u0624\u0643\u062f'),r);
 T('only markers: note alone',t(EN+'\n'+EN,false)==='[2 sentence(s) removed: not supported by the retrieved document text]');
}
// unit: caveats given as {code,msg} objects (PDF table detection) must render their message
{const c=C.cvTxt([{code:'PDF_TABLE_HEURISTIC',msg:'detected from PDF text positions'},'1 cell(s) were skipped',{code:'ONLY_CODE'},null,'']);
 T('object caveat renders its msg, no [object Object]',!/object Object/.test(c)&&/detected from PDF text positions/.test(c)&&/1 cell\(s\) were skipped/.test(c)&&/ONLY_CODE/.test(c),c);
 T('no caveats: empty string',C.cvTxt([])===''&&C.cvTxt(undefined)==='');}
// flow: a PDF-style object caveat on a rendered aggregate never prints [object Object]
{const x=C.renderAggregate({tool:'aggregate',result:{file:'t.pdf',sheet:'Page 1 Table 1',fn:'sum',labels:['A'],values:[5],refs:['t.pdf!B2'],total:{value:5,refs:'t.pdf!B2'},caveats:[{code:'PDF_TABLE_HEURISTIC',msg:'detected from PDF text positions'}]}},false,'total');
 T('renderAggregate with object caveat',!/object Object/.test(x)&&/\[Caveats: detected from PDF text positions\]/.test(x),x);}
// unit: digits inside the server-rendered "- file / sheet" label are not answer figures (false "Unverified numbers: 1" seen live on pdf and pptx)
{const TC=require('../lib/toolcall');const r={file:'1-smoke_table.pptx',sheet:'Slide 1 Table 1',fn:'sum',labels:['Riyadh','Jeddah'],values:[150500.5,98000],refs:['f!B2','f!B3'],total:{value:248500.5,refs:'f!B2'},caveats:[]};
 const x=C.renderAggregate({tool:'aggregate',result:r},false,'total revenue by city');const vals=[150500.5,98000,248500.5];
 T('label digits are not flagged',TC.checkNumbers(x,vals,[]).unverified.length===0,TC.checkNumbers(x,vals,[]));
 T('an invented figure in the same answer is still flagged',TC.checkNumbers(x+'\nAlso the total is 999777.',vals,[]).unverified.includes('999777'),TC.checkNumbers(x+'\nAlso the total is 999777.',vals,[]));
 T('a wrong rendered value is still flagged',TC.checkNumbers(x.replace('248500.5','248999.5'),vals,[]).unverified.length>0);}
(async()=>{const fid=(await D.ingest({uid:'u',name:'sales.xlsx',buf:fs.readFileSync('fx/sales.xlsx'),store,env})).file.id;
 const SP={fileId:fid,sheet:'Sales',labelCol:'A',valueCol:'C',fn:'sum'};const call='<tool_call>'+JSON.stringify({tool:'aggregate',args:{spec:SP}})+'</tool_call>';
 const mk=txt=>({name:'mock',complete:async b=>/You are a planner/.test(b.system)?(/Server results so far/.test(JSON.stringify(b.messages))?'DONE':call):txt});
 // (a) skipped-cell caveat appears once
 const o=await C.run({uid:'u',b:{question:'What is the total of the Revenue column in the Sales sheet?',fileIds:[fid]},store,env,provider:mk('The total is 656700.49 [S1].'),role:'admin'});const a=String(o.body.answer);
 const cnt=(a.match(/1 text such as n\/a/g)||[]).length;
 T('server total shown',/656700\.49/.test(a),a.slice(0,400));
 T('skipped-cell caveat shown exactly once (was twice)',cnt===1,{cnt,a:a.slice(0,900)});
 T('caveats field still reports it for the API',(o.body.caveats||[]).some(x=>/skipped/.test(x)),o.body.caveats);
 T('no "Calculation caveats" duplicate block when the render already has it',!/\[Calculation caveats:/.test(a)||cnt===1,a);
 console.log(JSON.stringify({checks:n,passed:n-bad,failed:bad}));process.exit(bad?1:0)})().catch(x=>{console.error(x);process.exit(1)});
