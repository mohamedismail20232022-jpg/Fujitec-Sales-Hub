// Retrieval regression (mock): "terminated" must retrieve the "terminate"/"Termination" clause (live false negative, Nov 26 2026).
const assert=require('assert'),fs=require('fs'),D=require('../lib/docs'),C=require('../lib/chat'),store=require('../lib/store').memory();
const env={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef',NODE_ENV:'test'};
(async()=>{const id=(await D.ingest({uid:'u',name:'rc_en.docx',buf:fs.readFileSync('fx/rc_en.docx'),store,env})).file.id;
 for(const q of ['Can the contract be terminated, and how?','Is termination allowed?','How do I terminate the agreement?']){let seen='';await C.run({uid:'u',b:{question:q,fileIds:[id]},store,env,provider:{name:'mock',complete:async b=>{seen=JSON.stringify(b);return 'x'}},role:'viewer'});assert(/terminate with 60 days/.test(seen),'termination clause retrieved for: '+q)}
 console.log('search stem regression ok (mock)')})().catch(e=>{console.error(e.message);process.exit(1)});
