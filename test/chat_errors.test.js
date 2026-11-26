// Provider 429 / 400 / 502 handling at chat level (mock provider, no network, no quota use)
const assert=require('assert'),fs=require('fs'),D=require('../lib/docs'),C=require('../lib/chat'),store=require('../lib/store').memory();
const env={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef',NODE_ENV:'test'};
(async()=>{const id=(await D.ingest({uid:'u',name:'sales.xlsx',buf:fs.readFileSync('fx/sales.xlsx'),store,env})).file.id;
 for(const [st,code] of [[429,'AI_RATE_LIMITED'],[502,'AI_UPSTREAM'],[400,'AI_UPSTREAM']]){let calls=0;const e=new Error('upstream '+st);e.status=st;e.code=code;if(st===429)e.retryAfter=7;
  const provider={name:'mock',complete:async()=>{calls++;throw e}};
  let thrown=null,o=null;try{o=await C.run({uid:'u',b:{question:'What is in the sales file?',fileIds:[id]},store,env,provider,role:'viewer'})}catch(x){thrown=x}
  assert(thrown?(thrown.code===code&&thrown.status):(o&&o.body&&!/\d{4,}/.test(String(o.body.answer||''))),'handled '+st+': '+(thrown?thrown.code:JSON.stringify(o&&o.body).slice(0,200)));
  assert(calls<=2,'no retry storm: '+calls+' provider calls for '+st);console.log(st,'->',thrown?('thrown '+thrown.code+' retryAfter='+thrown.retryAfter+' calls='+calls):'body',)}
 {const pr={name:'mock',complete:async()=>'The total is **500** [S1].\n## Heading\n`a**b**c` and __init__ stay'};const o=await C.run({uid:'u',b:{question:'What is in the sales file?',fileIds:[id]},store,env,provider:pr,role:'viewer'});assert(!/\*\*500|##/.test(o.body.answer)&&/`a\*\*b\*\*c`/.test(o.body.answer)&&/__init__/.test(o.body.answer),'markdown markers removed: '+o.body.answer)}
 console.log('chat error handling ok (mock only)')})().catch(e=>{console.error(e);process.exit(1)});
// wording-support check (mock only): unseen qualifiers are listed with the exact source text; clean answers get no note
(async()=>{const assert=require('assert'),fs=require('fs'),D=require('../lib/docs'),C=require('../lib/chat'),store=require('../lib/store').memory();
 const id=(await D.ingest({uid:'u',name:'contract.docx',buf:fs.readFileSync('fx/contract.docx'),store,env})).file.id;
 const run=async a=>(await C.run({uid:'u',b:{question:'What is the payment term?',fileIds:[id]},store,env,provider:{name:'mock',complete:async()=>a},role:'viewer'})).body;
 let o=await run('Payment is due within 30 days from the invoice date [S1].');assert(/Wording not found in \[S1\]: .*invoice/.test(o.answer)&&/Exact source text: "[^"]*30 days/.test(o.answer),'qualifier flagged: '+o.answer);
 o=await run('Payment is due in 30 days [S1].');assert(!/Wording not found/.test(o.answer),'clean answer unflagged: '+o.answer);
 o=await run('The payment must be made in cash, paid by the buyer [S1].');assert(/Wording not found in \[S1\]: .*cash/.test(o.answer),'second unseen qualifier: '+o.answer);
 o=await run('\u0627\u0644\u062f\u0641\u0639 \u062e\u0644\u0627\u0644 30 \u064a\u0648\u0645\u0627\u064b \u0645\u0646 \u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629 [S1]');assert(/different language|\u0644\u063a\u0629/.test(o.answer)&&/30 days/.test(o.answer),'cross-language quote shown: '+o.answer);
 console.log('wording support ok (mock only)')})().catch(e=>{console.error(e.message);process.exit(1)});
