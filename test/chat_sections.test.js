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
 console.log('chat entry section gate ok (memory store + mock provider, no network)')})().catch(e=>{console.error(e);process.exit(1)});
