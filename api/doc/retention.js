const {route}=require('../../lib/api');
// Real deps: Firebase token verification + role lookup must be wired here (needs server credentials; not configured).
module.exports=async(req,res)=>{try{const deps=require('../../lib/deps');const r=await route('retention',req,deps,process.env);res.status(r.status).json(r.body)}catch(e){res.status(500).json({error:{code:'INTERNAL',msg:'Request failed'}})}};
module.exports.config={maxDuration:60};
