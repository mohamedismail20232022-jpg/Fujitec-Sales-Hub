// Provider 429 / 400 / 502 handling at chat level (mock provider, no network, no quota use)
const assert=require('assert'),fs=require('fs'),D=require('../lib/docs'),C=require('../lib/chat'),store=require('../lib/store').memory();
const env={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef',NODE_ENV:'test'};
(async()=>{const id=(await D.ingest({uid:'u',name:'sales.xlsx',buf:fs.readFileSync('fx/sales.xlsx'),store,env})).file.id;
 for(const [st,code] of [[429,'AI_RATE_LIMITED'],[502,'AI_UPSTREAM'],[400,'AI_UPSTREAM']]){let calls=0;const e=new Error('upstream '+st);e.status=st;e.code=code;if(st===429)e.retryAfter=7;
  const provider={name:'mock',complete:async()=>{calls++;throw e}};
  let thrown=null,o=null;try{o=await C.run({uid:'u',b:{question:'What is in the sales file?',fileIds:[id]},store,env,provider,role:'viewer'})}catch(x){thrown=x}
  assert(thrown?(thrown.code===code&&thrown.status):(o&&o.body&&!/\d{4,}/.test(String(o.body.answer||''))),'handled '+st+': '+(thrown?thrown.code:JSON.stringify(o&&o.body).slice(0,200)));
  assert(calls<=2,'no retry storm: '+calls+' provider calls for '+st);console.log(st,'->',thrown?('thrown '+thrown.code+' retryAfter='+thrown.retryAfter+' calls='+calls):'body',)}
 {const pr={name:'mock',complete:async()=>'The columns are **Region** and Revenue [S1].\n## Heading\n`a**b**c` and __init__ stay'};const o=await C.run({uid:'u',b:{question:'What is in the sales file?',fileIds:[id]},store,env,provider:pr,role:'viewer'});assert(!/\*\*500|##/.test(o.body.answer)&&/`a\*\*b\*\*c`/.test(o.body.answer)&&/__init__/.test(o.body.answer),'markdown markers removed: '+o.body.answer)}
 console.log('chat error handling ok (mock only)')})().catch(e=>{console.error(e);process.exit(1)});
// faithfulness enforcement (mock only): unsupported wording is replaced by the verbatim source text, never shown; supported answers pass untouched
(async()=>{const assert=require('assert'),fs=require('fs'),D=require('../lib/docs'),C=require('../lib/chat'),store=require('../lib/store').memory();
 const id=(await D.ingest({uid:'u',name:'contract.docx',buf:fs.readFileSync('fx/contract.docx'),store,env})).file.id;
 const run=async(a,q)=>(await C.run({uid:'u',b:{question:q||'What is the payment term?',fileIds:[id]},store,env,provider:{name:'mock',complete:async()=>a},role:'viewer'})).body;
 const outside=o=>o.answer.replace(/\u201c[^\u201d]*\u201d/g,'');
 for(const [a,bad] of [['Payment is due within 30 days from the invoice date [S1].',/invoice/],['The payment must be made in cash, paid by the buyer [S1].',/cash|buyer/],['Payment is due in 30 days, and late invoices may be cancelled [S1].',/cancel/],['Payment is due in 30 days, non-refundable after delivery [S1].',/refund|delivery/],['Payment due in 45 days [S1].',/due in 45/]]){
   const o=await run(a);assert(o.faithfulnessReplaced===1&&/Exact text from the document: \u201c[^\u201d]*30 days/.test(o.answer)&&!bad.test(outside(o)),'unsupported qualifier replaced: '+a+' => '+o.answer)}
 let o=await run('Payment is due in 30 days [S1].');assert(!o.faithfulnessReplaced&&/due in 30 days/.test(o.answer),'supported answer untouched: '+o.answer);
 o=await run('The late fee is 2% monthly [S1].','What is the late fee?');assert(!o.faithfulnessReplaced,'supported late-fee answer untouched: '+o.answer);o=await run('The late fee is 2% monthly, waived for first offence [S1].','What is the late fee?');assert(o.faithfulnessReplaced===1&&!/waived/.test(outside(o)),'late-fee qualifier replaced: '+o.answer);
 o=await run('\u0627\u0644\u062f\u0641\u0639 \u062e\u0644\u0627\u0644 30 \u064a\u0648\u0645\u0627\u064b \u0645\u0646 \u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629 [S1]','\u0645\u0627 \u0634\u0631\u0637 \u0627\u0644\u062f\u0641\u0639\u061f');assert(o.faithfulnessReplaced===1&&/\u0627\u0644\u0646\u0635 \u0627\u0644\u062d\u0631\u0641\u064a/.test(o.answer)&&!/\u0645\u0646 \u062a\u0627\u0631\u064a\u062e/.test(o.answer)&&/\u201c/.test(o.answer),'cross-language shown as quote only: '+o.answer);
 o=await run('Here is the answer.\n\nPayment is due in 30 days [S1].\n`code [S1] stays`');assert(/Here is the answer\./.test(o.answer)&&!o.faithfulnessReplaced,'uncited text and code untouched: '+o.answer);
 console.log('faithfulness enforcement ok (mock only)')})().catch(e=>{console.error(e.message);process.exit(1)});
