'use strict';
// AI provider abstraction. Production fails closed: no key => error, never demo text.
const PROVIDERS={
  anthropic:{env:'ANTHROPIC_API_KEY',url:'https://api.anthropic.com/v1/messages'},
  groq:{env:'GROQ_API_KEY',url:'https://api.groq.com/openai/v1/chat/completions',openai:true},
};
// Convert the internal Anthropic-shaped body to an OpenAI-style chat body (used by Groq). Only text content is sent.
function toOpenAI(body){const msgs=[];if(body.system)msgs.push({role:'system',content:String(body.system)});for(const m of body.messages||[])msgs.push({role:m.role,content:String(m.content)});
  const o={model:body.model,messages:msgs,max_completion_tokens:body.max_tokens||1024,temperature:0.2};if(/gpt-oss/.test(String(body.model)))o.reasoning_effort='low';return o}
function upstreamError(r){const e=new Error('AI provider error '+r.status);e.status=r.status===429?429:502;e.code=r.status===429?'AI_RATE_LIMITED':'AI_UPSTREAM';if(r.status===429){const ra=r.headers&&r.headers.get&&r.headers.get('retry-after');if(ra)e.retryAfter=Number(ra)||undefined}return e}
function getProvider(env,opts){
  opts=opts||{};
  if(opts.testMock && env.NODE_ENV==='test') return {name:'mock',complete:opts.testMock,stream:opts.testStream||(async function*(b){const t=await opts.testMock(b);for(const w of String(t).split(/(?<= )/))yield w})};
  const name=(env.AI_PROVIDER||'').toLowerCase(); const p=PROVIDERS[name];
  if(!p) { const e=new Error('AI provider not configured'); e.status=503; e.code='AI_NOT_CONFIGURED'; throw e; }
  const key=env[p.env]; if(!key){ const e=new Error('AI provider key missing'); e.status=503; e.code='AI_NOT_CONFIGURED'; throw e; }
  if(p.openai){const h={'content-type':'application/json',authorization:'Bearer '+key};
    const call=async(body,fetchImpl,stream)=>{const o=toOpenAI(body);if(stream)o.stream=true;const r=await (fetchImpl||fetch)(p.url,{method:'POST',headers:h,body:JSON.stringify(o)});if(!r.ok)throw upstreamError(r);return r};
    return {name,complete:async(body,fetchImpl)=>{const j=await (await call(body,fetchImpl,false)).json();const c=j&&j.choices&&j.choices[0]&&j.choices[0].message;return c&&typeof c.content==='string'?c.content:''},
      stream:async function*(body,fetchImpl){const r=await call(body,fetchImpl,true);const dec=new TextDecoder();let buf='';for await(const ch of r.body){buf+=typeof ch==='string'?ch:dec.decode(ch,{stream:true});let i;while((i=buf.indexOf('\n\n'))>=0){const ev=buf.slice(0,i);buf=buf.slice(i+2);const m=ev.match(/^data: (.*)$/m);if(!m||m[1]==='[DONE]')continue;let d;try{d=JSON.parse(m[1])}catch(e){continue}if(d.error){const e=new Error('AI stream error');e.status=502;e.code='AI_UPSTREAM';throw e}const t=d.choices&&d.choices[0]&&d.choices[0].delta&&d.choices[0].delta.content;if(t)yield t}}}}}
  const hdr={'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'};
  const up=async(body,fetchImpl)=>{const r=await (fetchImpl||fetch)(p.url,{method:'POST',headers:hdr,body:JSON.stringify(body)});if(!r.ok){const e=new Error('AI provider error '+r.status);e.status=502;e.code='AI_UPSTREAM';throw e}return r};
  // complete() returns plain text. stream() yields text deltas (Anthropic Messages SSE format; NOT exercised against the real service in tests).
  return {name,complete:async(body,fetchImpl)=>{const j=await (await up(body,fetchImpl)).json();return (j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('')},
    stream:async function*(body,fetchImpl){const r=await up(Object.assign({},body,{stream:true}),fetchImpl);const dec=new TextDecoder();let buf='';for await(const ch of r.body){buf+=typeof ch==='string'?ch:dec.decode(ch,{stream:true});let i;while((i=buf.indexOf('\n\n'))>=0){const ev=buf.slice(0,i);buf=buf.slice(i+2);const m=ev.match(/^data: (.*)$/m);if(!m)continue;let d;try{d=JSON.parse(m[1])}catch(e){continue}if(d.type==='content_block_delta'&&d.delta&&d.delta.type==='text_delta')yield d.delta.text;if(d.type==='error'){const e=new Error('AI stream error');e.status=502;e.code='AI_UPSTREAM';throw e}}}}};
}
module.exports={getProvider,toOpenAI};
