// Unit test (memory store, no network). Section tools: allowlist, filters, grouping, sample/archived exclusion, caller-denied read, validation.
const assert=require('assert'),S=require('../lib/sections'),TC=require('../lib/toolcall'),store=require('../lib/store').memory();
store._sections.set('ws/main/tenders',[{id:'t1',rec:{region:'N',value:5,status:'open'}},{id:'t2',rec:{region:'N',value:7,status:'open'}},{id:'t3',rec:{region:'S',value:1,status:'won'}},{id:'s',rec:{isSample:true,region:'S',value:99,status:'open'}},{id:'a',rec:{archived:true,region:'S',value:50,status:'open'}}]);
(async()=>{
 let r=await TC.execute({tool:'section',args:{section:'tenders',filters:[{field:'status',op:'eq',value:'open'}],groupBy:'region',valueField:'value',fn:'sum'}},{uid:'u',store,env:{},allowed:[]});
 assert.strictEqual(r.result.matched,2);assert.strictEqual(r.result.total,12);assert.strictEqual(r.result.groups[0].refs[0],'ws/main/tenders/t1');
 r=await S.execute({section:'tenders',fn:'count'},{store,uid:'u'});assert.strictEqual(r.result.total,3);
 for(const bad of [{section:'users',fn:'count'},{section:'tenders',fn:'drop'},{section:'tenders',fn:'count',filters:[{field:'a b',op:'eq',value:1}]},{section:'tenders',fn:'sum'},{section:'tenders',fn:'count',x:1}])
   await assert.rejects(()=>TC.execute({tool:'section',args:bad},{uid:'u',store,env:{},allowed:[]}),e=>e.code==='TOOL_CALL_REJECTED');
 const denied={listSection:async()=>{const e=new Error('store GET 403');e.status=403;throw e}};
 await assert.rejects(()=>S.execute({section:'tenders',fn:'count'},{store:denied,uid:'u'}),e=>e.status===403);
 const empty=await S.execute({section:'accounts',fn:'count'},{store,uid:'u'});assert.strictEqual(empty.result.total,0);assert(empty.result.caveats.some(c=>/No records/.test(c)));
 assert.deepStrictEqual(S.hint('how many open tenders and quotes'),['tenders','quotes']);
 console.log('sections ok (memory store, mock only)')})().catch(e=>{console.error(e);process.exit(1)});
