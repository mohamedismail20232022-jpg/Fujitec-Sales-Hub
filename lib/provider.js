'use strict';
// AI provider abstraction. Production fails closed: no key => error, never demo text.
const PROVIDERS={
  anthropic:{env:'ANTHROPIC_API_KEY',url:'https://api.anthropic.com/v1/messages'},
};
function getProvider(env,opts){
  opts=opts||{};
  if(opts.testMock && env.NODE_ENV==='test') return {name:'mock',complete:opts.testMock,stream:opts.testStream||(async function*(b){const t=await opts.testMock(b);for(const w of String(t).split(/(?<= )/))yield w})};
  const name=(env.AI_PROVIDER||'').toLowerCase(); const p=PROVIDERS[name];
  if(!p) { const e=new Error('AI provider not configured'); e.status=503; e.code='AI_NOT_CONFIGURED'; throw e; }
  const key=env[p.env]; if(!key){ const e=new Error('AI provider key missing'); e.status=503; e.code='AI_NOT_CONFIGURED'; throw e; }
  const hdr={'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'};
  const up=async(body,fetchImpl)=>{const r=await (fetchImpl||fetch)(p.url,{method:'POST',headers:hdr,body:JSON.stringify(body)});if(!r.ok){const e=new Error('AI provider error '+r.status);e.status=502;e.code='AI_UPSTREAM';throw e}return r};
  // complete() returns plain text. stream() yields text deltas (Anthropic Messages SSE format; NOT exercised against the real service in tests).
  return {name,complete:async(body,fetchImpl)=>{const j=await (await up(body,fetchImpl)).json();return (j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('')},
    stream:async function*(body,fetchImpl){const r=await up(Object.assign({},body,{stream:true}),fetchImpl);const dec=new TextDecoder();let buf='';for await(const ch of r.body){buf+=typeof ch==='string'?ch:dec.decode(ch,{stream:true});let i;while((i=buf.indexOf('\n\n'))>=0){const ev=buf.slice(0,i);buf=buf.slice(i+2);const m=ev.match(/^data: (.*)$/m);if(!m)continue;let d;try{d=JSON.parse(m[1])}catch(e){continue}if(d.type==='content_block_delta'&&d.delta&&d.delta.type==='text_delta')yield d.delta.text;if(d.type==='error'){const e=new Error('AI stream error');e.status=502;e.code='AI_UPSTREAM';throw e}}}}};
}
module.exports={getProvider};
