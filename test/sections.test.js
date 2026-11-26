// Unit test (memory store, no network). Section tools: allowlist, filters, grouping, sample/archived exclusion, caller-denied read, validation.
const assert=require('assert'),S=require('../lib/sections'),TC=require('../lib/toolcall'),store=require('../lib/store').memory();
store._sections.set('ws/main/tenders',[{id:'t1',rec:{region:'N',value:5,status:'open'}},{id:'t2',rec:{region:'N',value:7,status:'open'}},{id:'t3',rec:{region:'S',value:1,status:'won'}},{id:'s',rec:{isSample:true,region:'S',value:99,status:'open'}},{id:'a',rec:{archived:true,region:'S',value:50,status:'open'}}]);
(async()=>{
 let r=await TC.execute({tool:'section',args:{section:'tenders',filters:[{field:'status',op:'eq',value:'open'}],groupBy:'region',valueField:'value',fn:'sum'}},{uid:'u',store,env:{},allowed:[],role:'admin'});
 assert.strictEqual(r.result.matched,2);assert.strictEqual(r.result.total,12);assert.strictEqual(r.result.groups[0].refs[0],'ws/main/tenders/t1');
 r=await S.execute({section:'tenders',fn:'count'},{store,uid:'u',role:'admin'});assert.strictEqual(r.result.total,3);
 for(const bad of [{section:'users',fn:'count'},{section:'tenders',fn:'drop'},{section:'tenders',fn:'count',filters:[{field:'a b',op:'eq',value:1}]},{section:'tenders',fn:'sum'},{section:'tenders',fn:'count',x:1}])
   await assert.rejects(()=>TC.execute({tool:'section',args:bad},{uid:'u',store,env:{},allowed:[],role:'admin'}),e=>e.code==='TOOL_CALL_REJECTED');
 const denied={listSection:async()=>{const e=new Error('store GET 403');e.status=403;throw e}};
 await assert.rejects(()=>S.execute({section:'tenders',fn:'count'},{store:denied,uid:'u',role:'admin'}),e=>e.status===403);
 const empty=await S.execute({section:'accounts',fn:'count'},{store,uid:'u',role:'admin'});assert.strictEqual(empty.result.total,0);assert(empty.result.caveats.some(c=>/sees no records/.test(c)));
 assert.deepStrictEqual(S.hint('how many open tenders and quotes'),['tenders','quotes']);
 console.log('sections ok (memory store, mock only)')})().catch(e=>{console.error(e);process.exit(1)});
(async()=>{const a=require('assert'),S=require('../lib/sections'),TC=require('../lib/toolcall'),st=require('../lib/store').memory();
 st._sections.set('ws/main/tenders',[{id:'t1',rec:{value:5}}]);let reads=0;const spy={listSection:async(...x)=>{reads++;return st.listSection(...x)}};
 for(const role of ['seller','estimator','viewer',null])await a.rejects(()=>TC.execute({tool:'section',args:{section:'tenders',fn:'count'}},{uid:'u',store:spy,env:{},allowed:[],role}),e=>e.code==='SECTION_FORBIDDEN');
 a.strictEqual(reads,0,'no read before authorization');a.strictEqual(S.allowedRole('seller'),false);
 for(const role of ['admin','manager']){const r=await TC.execute({tool:'section',args:{section:'tenders',fn:'count'}},{uid:'u',store:spy,env:{},allowed:[],role});a.strictEqual(r.result.total,1)}
 const e=await S.execute({section:'tenders',fn:'count',filters:[{field:'value',op:'gt',value:100}]},{store:st,uid:'u',role:'admin'});a.strictEqual(e.result.groups.length,0);a.strictEqual(e.result.matched,0);
 console.log('section role gate ok (mock only)')})().catch(x=>{console.error(x);process.exit(1)});
