const {route}=require('../../lib/api');
module.exports=async(req,res)=>{try{const deps=require('../../lib/deps');const r=await route('chat',req,deps,process.env);
  if(r.stream){res.status(200);res.setHeader('content-type','text/event-stream; charset=utf-8');res.setHeader('cache-control','no-cache, no-transform');for await(const ev of r.stream)res.write('data: '+JSON.stringify(ev)+'\n\n');return res.end()}
  res.status(r.status).json(r.body)}catch(e){if(res.headersSent)return res.end();res.status(500).json({error:{code:'INTERNAL',msg:'Request failed'}})}};
module.exports.config={maxDuration:120};
