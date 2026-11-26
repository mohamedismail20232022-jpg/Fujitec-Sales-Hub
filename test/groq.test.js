'use strict';
const assert=require('assert');const {getProvider,toOpenAI}=require('../lib/provider');
(async()=>{
 // fail closed
 assert.throws(()=>getProvider({AI_PROVIDER:'groq'}),e=>e.code==='AI_NOT_CONFIGURED');
 assert.throws(()=>getProvider({}),e=>e.code==='AI_NOT_CONFIGURED');
 const env={AI_PROVIDER:'groq',GROQ_API_KEY:'test-key-not-real'};const p=getProvider(env);assert.equal(p.name,'groq');
 const body={model:'openai/gpt-oss-120b',max_tokens:300,system:'SYS',messages:[{role:'user',content:'hi'}]};
 const o=toOpenAI(body);assert.equal(o.messages[0].role,'system');assert.equal(o.max_completion_tokens,300);assert.equal(o.reasoning_effort,'low');assert.ok(!('max_tokens' in o));
 assert.ok(!('reasoning_effort' in toOpenAI(Object.assign({},body,{model:'qwen/qwen3.8-27b'}))));
 let seen;const ok=async(u,i)=>{seen={u,i};return {ok:true,status:200,json:async()=>({choices:[{message:{content:'answer [S1]'}}]})}};
 assert.equal(await p.complete(body,ok),'answer [S1]');assert.equal(seen.u,'https://api.groq.com/openai/v1/chat/completions');assert.equal(seen.i.headers.authorization,'Bearer test-key-not-real');assert.ok(!JSON.parse(seen.i.body).stream);
 // streaming
 const sse=['data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n','data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n'];
 const st=async()=>({ok:true,status:200,body:(async function*(){for(const s of sse)yield Buffer.from(s)})()});
 let acc='';for await(const d of p.stream(body,st))acc+=d;assert.equal(acc,'Hello');
 // rate limit
 const rl=async()=>({ok:false,status:429,headers:{get:()=>'7'}});
 await assert.rejects(p.complete(body,rl),e=>e.code==='AI_RATE_LIMITED'&&e.status===429&&e.retryAfter===7);
 const bad=async()=>({ok:false,status:500,headers:{get:()=>null}});
 await assert.rejects(p.complete(body,bad),e=>e.code==='AI_UPSTREAM'&&e.status===502);
 // key never in error text
 try{await p.complete(body,bad)}catch(e){assert.ok(!String(e.message).includes('test-key'))}
 console.log('groq adapter ok (mock fetch only, no network)');
})().catch(e=>{console.error(e);process.exit(1)});
