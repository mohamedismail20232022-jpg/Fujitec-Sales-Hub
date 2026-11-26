// Cross-file aggregate (deterministic, no model) and labelled-total grounding check. Memory store + mock provider only; nothing live.
const assert=require('assert'),fs=require('fs'),D=require('../lib/docs'),C=require('../lib/chat'),GC=require('../lib/groundcheck'),store=require('../lib/store').memory();
const env={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef',NODE_ENV:'test'};
(async()=>{let called=0;const provider={name:'mock',complete:async b=>{called++;return 'MODEL TEXT'}};
 const a=(await D.ingest({uid:'u',name:'sales.xlsx',buf:fs.readFileSync('fx/sales.xlsx'),store,env})).file.id,b=(await D.ingest({uid:'u',name:'book.xlsx',buf:fs.readFileSync('fx/book.xlsx'),store,env})).file.id;
 const run=q=>C.run({uid:'u',b:{question:q,fileIds:[a,b]},store,env,provider,role:'viewer'});
 let o=await run('Compare total Revenue across both files');
 assert(o.body.deterministic&&!o.body.clarification&&called===0,'no model call');assert(o.body.calculations.length===2,'one aggregate per file');
 const tot=o.body.calculations.map(c=>c.result.total.value);console.log('per-file totals',tot);
 assert(/cells used: 6; sales\.xlsx!Sales!C2/.test(o.body.answer)&&/1 non-numeric cell\(s\).*skipped/.test(o.body.answer),'cell refs and skipped-value caveat visible');assert(/sales\.xlsx/.test(o.body.answer)&&/book\.xlsx/.test(o.body.answer)&&/units\/currency are not stated/.test(o.body.answer),o.body.answer);
 o=await run('Compare total across both files');assert(o.body.clarification&&!/\d{3}/.test(o.body.answer.split('\n')[0]+'')&&o.body.calculations.length===0&&called===0,'ambiguous measure -> clarification, no figure: '+o.body.answer);
 o=await run('Compare total Cost across both files');assert(o.body.clarification&&/book\.xlsx/.test(o.body.answer)&&o.body.calculations.length===0,'Cost is not numeric in book.xlsx -> clarification: '+o.body.answer);
 o=await run('\u0642\u0627\u0631\u0646 \u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0645\u0644\u0641\u064a\u0646');assert(o.body.clarification&&/[\u0600-\u06ff]/.test(o.body.answer),'Arabic clarification');
 // grounding: contract has a labelled total 5000 and an unlabelled table cell 9000
 const c=(await D.ingest({uid:'u',name:'contract.docx',buf:fs.readFileSync('fx/contract.docx'),store,env})).file.id;
 const call='<tool_call>'+JSON.stringify({tool:'aggregate',args:{spec:{fileId:c,sheet:'Table 1',labelCol:'A',valueCol:'B',fn:'sum'}}})+'</tool_call>';
 const p9={name:'mock',complete:async b=>/You are a planner/.test(b.system)?call:'The total contract value is 9000 (computed from the table [c.docx!Table 1!B2]).'};
 o=await C.run({uid:'u',b:{question:'What is the total contract value?',fileIds:[c]},store,env,provider:p9,role:'viewer'});
 assert(o.body.groundingConflict&&o.body.conflictClarification&&!/The total contract value is 9000/.test(o.body.answer)&&/5000 \[S\d\]/.test(o.body.answer)&&/9000 server calculation/.test(o.body.answer)&&/Which do you mean/.test(o.body.answer)&&!/Unverified numbers/.test(o.body.answer),'conflict reported, cell-ref digits ignored: '+o.body.answer);
 const p5={name:'mock',complete:async b=>/You are a planner/.test(b.system)?call:'The total contract value is 5000 SAR [S1].'};
 o=await C.run({uid:'u',b:{question:'What is the total contract value?',fileIds:[c]},store,env,provider:p5,role:'viewer'});assert(!o.body.groundingConflict,'labelled figure gives no conflict');
 assert(!GC.check('How many lifts?','There are 3 lifts',['Lift 9000 total 5000']).conflict,'non-total question not flagged');
 console.log('cross-file + grounding ok (memory store, mock provider only)')})().catch(e=>{console.error(e);process.exit(1)});
