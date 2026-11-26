// Provider 429 / 400 / 502 handling at chat level (mock provider, no network, no quota use)
const assert=require('assert'),fs=require('fs'),D=require('../lib/docs'),C=require('../lib/chat'),store=require('../lib/store').memory();
const env={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef',NODE_ENV:'test'};
(async()=>{const id=(await D.ingest({uid:'u',name:'sales.xlsx',buf:fs.readFileSync('fx/sales.xlsx'),store,env})).file.id;
 for(const [st,code] of [[429,'AI_RATE_LIMITED'],[502,'AI_UPSTREAM'],[400,'AI_UPSTREAM']]){let calls=0;const e=new Error('upstream '+st);e.status=st;e.code=code;if(st===429)e.retryAfter=7;
  const provider={name:'mock',complete:async()=>{calls++;throw e}};
  let thrown=null,o=null;try{o=await C.run({uid:'u',b:{question:'What is in the sales file?',fileIds:[id]},store,env,provider,role:'viewer'})}catch(x){thrown=x}
  assert(thrown?(thrown.code===code&&thrown.status):(o&&o.body&&!/\d{4,}/.test(String(o.body.answer||''))),'handled '+st+': '+(thrown?thrown.code:JSON.stringify(o&&o.body).slice(0,200)));
  assert(calls<=2,'no retry storm: '+calls+' provider calls for '+st);console.log(st,'->',thrown?('thrown '+thrown.code+' retryAfter='+thrown.retryAfter+' calls='+calls):'body',)}
 {const pr={name:'mock',complete:async()=>'The total is **500** [S1].\n## Heading'};const o=await C.run({uid:'u',b:{question:'What is in the sales file?',fileIds:[id]},store,env,provider:pr,role:'viewer'});assert(!/\*\*|##/.test(o.body.answer),'markdown markers removed: '+o.body.answer)}
 console.log('chat error handling ok (mock only)')})().catch(e=>{console.error(e);process.exit(1)});
