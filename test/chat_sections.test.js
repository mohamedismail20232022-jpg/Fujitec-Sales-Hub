// Real chat entry (chat.run) with memory store + mock provider: section context must never reach the model for non-admin/manager roles.
const assert=require('assert'),fs=require('fs'),D=require('../lib/docs'),C=require('../lib/chat'),store=require('../lib/store').memory();
const env={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef',NODE_ENV:'test'};
store._sections.set('ws/main/tenders',[{id:'t1',rec:{status:'open',value:5,secretnote:'PRIVATE-TENDER-NOTE'}}]);
let reads=0;const real=store.listSection.bind(store);store.listSection=async(...a)=>{reads++;return real(...a)};
(async()=>{const r=await D.ingest({uid:'u',name:'sales.xlsx',buf:fs.readFileSync('fx/sales.xlsx'),store,env});const fid=r.file.id;
 const seen=[];const provider={name:'mock',complete:async b=>{seen.push(JSON.stringify(b));return 'No section data was used.'}};
 for(const role of ['seller','estimator','viewer',undefined]){reads=0;seen.length=0;const o=await C.run({uid:'u',b:{question:'How many open tenders do we have?',fileIds:[fid]},store,env,provider,role});
  assert.strictEqual(reads,0,'no section read for role '+role);assert(!seen.join('').includes('secretnote')&&!seen.join('').includes('PRIVATE-TENDER-NOTE')&&!seen.join('').includes('Site sections'),'no section schema/context to the model for '+role);
  assert(/limited to admin and manager/.test(String(o.body.answer)+JSON.stringify(o.body.notes||[])),'user told why: '+role)}
 reads=0;seen.length=0;const ok=await C.run({uid:'u',b:{question:'How many open tenders do we have?',fileIds:[fid]},store,env,provider,role:'admin'});
 assert(reads>0&&seen.join('').includes('Site sections you can query'),'admin gets schema');assert(!seen.join('').includes('PRIVATE-TENDER-NOTE'),'raw record values are not sent to the model in the schema');
 // failing planner: model-independent fallback, filtered question must NOT be answered from the unfiltered count
 { store._sections.set('ws/main/tenders',[{id:'t1',rec:{status:'open',value:5}},{id:'t2',rec:{status:'won',value:'n/a'}},{id:'t3',rec:{status:'open',value:7}}]);
  const p2={name:'mock',complete:async b=>/You are a planner/.test(b.system)?'I cannot decide':'FILTERED ANSWER: 1 open tender worth 5'};
  const o=await C.run({uid:'u',b:{question:'How many open tenders do we have?',fileIds:[fid]},store,env,provider:p2,role:'manager'});
  assert(!/FILTERED ANSWER/.test(o.body.answer),'model free text not used after planner failure');assert(/cannot answer the question as asked/.test(o.body.answer)&&/3 visible record/.test(o.body.answer)&&/no filters/.test(o.body.answer),o.body.answer);
  {const oa=await C.run({uid:'u',b:{question:'\u0643\u0645 \u0639\u062f\u062f \u0627\u0644\u0645\u0646\u0627\u0642\u0635\u0627\u062a \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629 \u061f',fileIds:[fid]},store,env,provider:p2,role:'manager'});assert(/[\u0600-\u06FF]/.test(oa.body.answer)&&!/cannot answer/.test(oa.body.answer),'Arabic question gets Arabic server template')}
  const call='<tool_call>'+JSON.stringify({tool:'section',args:{section:'tenders',fn:'sum',valueField:'value'}})+'</tool_call>';
  const p3={name:'mock',complete:async b=>/You are a planner/.test(b.system)?call:'The total is 5.'};
  const o2=await C.run({uid:'u',b:{question:'What is the total value of tenders?',fileIds:[fid]},store,env,provider:p3,role:'admin'});
  assert(!/Calculation caveats:/.test(o2.body.answer)&&(o2.body.notes||[]).some(x=>/did not ask for system data/.test(x)),'original no-cue question: file-only answer plus clarification note, no section data: '+o2.body.answer);
  const o2b=await C.run({uid:'u',b:{question:'What is the total value of tenders in the system?',fileIds:[fid]},store,env,provider:p3,role:'admin'});
  // INTENTIONAL ASSERTION CHANGE (Nov 27 live smoke): the caveats were printed twice, once in the server render's own [Caveats: ...] block and again as a separate [Calculation caveats: ...] block. The duplicate block is no longer added when the render already shows the text. The visibility checks (skipped, 6 decimal) are unchanged; only the accepted label is widened, (exactly-once is covered in answer_tidy.test.js).
  {const a=o2b.body.answer;assert(/(Calculation caveats|Caveats):/.test(a)&&/skipped/.test(a)&&/6 decimal/.test(a),'skip and precision caveats are visible in the answer: '+a)}}
 console.log('chat entry section gate ok (memory store + mock provider, no network)')})().catch(e=>{console.error(e);process.exit(1)});
// file-only intent: generic words (quote, tender, contract) with files selected and no site cue must not open sections or read them
(async()=>{const r=await D.ingest({uid:'u2',name:'sales.xlsx',buf:fs.readFileSync('fx/sales.xlsx'),store,env});let n=0;const rl=store.listSection;store.listSection=async(...a)=>{n++;return rl(...a)};
 const seen=[];const provider={name:'mock',complete:async b=>{seen.push(JSON.stringify(b));return 'ok'}};
 await C.run({uid:'u2',b:{question:'Quote the total contract value from this file',fileIds:[r.file.id]},store,env,provider,role:'admin'});
 assert.strictEqual(n,0,'no section read for file-only question');assert(!seen.join('').includes('Site sections'),'no section schema in prompt');
 console.log('file-only intent does not spill into sections (mock only)')})().catch(e=>{console.error(e);process.exit(1)});
