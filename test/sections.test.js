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
 {const r=await S.execute({section:'tenders',fn:'count',groupBy:null,valueField:'',filters:null},{store,uid:'u',role:'admin'});assert.strictEqual(r.result.total,3)}
 {const r=await S.execute({section:'Tenders',fn:'COUNT',filters:[{field:'status',op:'=',value:'open'}]},{store,uid:'u',role:'admin'});assert.strictEqual(r.result.total,2)}
 console.log('sections ok (memory store, mock only)')})().catch(e=>{console.error(e);process.exit(1)});
(async()=>{const a=require('assert'),S=require('../lib/sections'),TC=require('../lib/toolcall'),st=require('../lib/store').memory();
 st._sections.set('ws/main/tenders',[{id:'t1',rec:{value:5}}]);let reads=0;const spy={listSection:async(...x)=>{reads++;return st.listSection(...x)}};
 for(const role of ['seller','estimator','viewer',null])await a.rejects(()=>TC.execute({tool:'section',args:{section:'tenders',fn:'count'}},{uid:'u',store:spy,env:{},allowed:[],role}),e=>e.code==='SECTION_FORBIDDEN');
 a.strictEqual(reads,0,'no read before authorization');a.strictEqual(S.allowedRole('seller'),false);
 for(const role of ['admin','manager']){const r=await TC.execute({tool:'section',args:{section:'tenders',fn:'count'}},{uid:'u',store:spy,env:{},allowed:[],role});a.strictEqual(r.result.total,1)}
 const e=await S.execute({section:'tenders',fn:'count',filters:[{field:'value',op:'gt',value:100}]},{store:st,uid:'u',role:'admin'});a.strictEqual(e.result.groups.length,0);a.strictEqual(e.result.matched,0);
 console.log('section role gate ok (mock only)')})().catch(x=>{console.error(x);process.exit(1)});
(async()=>{const a=require('assert'),S=require('../lib/sections'),st=require('../lib/store').memory();
 st._sections.set('ws/typed/quotes',[{id:'1',rec:{region:'N',amt:0.1,flag:true,n:null,ar:'٣٢٠',txt:'x'}},{id:'2',rec:{region:'N',amt:0.2,flag:false,n:null,ar:'١٫٥',txt:'y'}},{id:'3',rec:{region:'S',amt:'1,000.10',flag:true,n:5,ar:'٣٢٠',txt:'z'}}]);
 const ex=x=>S.execute(x,{store:st,uid:'u',role:'admin'});
 let r=await ex({section:'quotes',fn:'sum',valueField:'amt'});a.strictEqual(r.result.total,1000.4,'exact decimal sum (0.1+0.2+1000.1)');
 r=await ex({section:'quotes',fn:'sum',valueField:'ar'});a.strictEqual(r.result.total,641.5,'Arabic-Indic digits normalized');
 await a.rejects(()=>ex({section:'quotes',fn:'sum',valueField:'flag'}),/not numeric|unknown/);
 r=await ex({section:'quotes',fn:'sum',valueField:'n'});a.strictEqual(r.result.total,5);a.strictEqual(r.result.caveats.some(c=>/skipped/.test(c)),true,'null is skipped, not 0');
 await a.rejects(()=>ex({section:'quotes',fn:'count',groupBy:'regoin'}),/unknown field/);
 await a.rejects(()=>ex({section:'quotes',fn:'count',filters:[{field:'nope',op:'eq',value:1}]}),/unknown field/);
 await a.rejects(()=>ex({section:'quotes',fn:'sum',valueField:'txt'}),/not numeric/);
 st._sections.set('ws/main/tasks',Array.from({length:60},(_,i)=>({id:'k'+i,rec:{g:'g'+i,v:1}})).concat(Array.from({length:30},(_,i)=>({id:'m'+i,rec:{g:'g0',v:1}}))));
 r=await ex({section:'tasks',fn:'sum',valueField:'v',groupBy:'g'});a.strictEqual(r.result.total,90);a.strictEqual(r.result.groupsTotal,60);a.strictEqual(r.result.groupsShown,50);a.strictEqual(r.result.groups.find(x=>x.label==='g0').refsTruncated,true);a.strictEqual(r.result.caveats.some(c=>/top 50 of 60/.test(c)),true);
 a.deepStrictEqual(await S.schemas(st,'u','open quotes','seller'),[]);a.strictEqual((await S.schemas(st,'u','open quotes','admin')).length,1);
 {st._sections.set('ws/main/contracts',[{id:'1',rec:{v:10,only:null,big:1e21,m:'5'}},{id:'2',rec:{v:'n/a',only:null,big:3,m:'7'}},{id:'3',rec:{v:30,only:null,big:Infinity,m:'x'}},{id:'4',rec:{v:'20',only:null,big:2,m:'y'}}]);
 let r=await ex({section:'contracts',fn:'sum',valueField:'v'});assert.strictEqual(r.result.total,60,'mixed numeric+n/a column stays numeric, n/a skipped');assert(r.result.caveats.some(c=>/skipped/.test(c)),'skip is reported');assert(r.result.caveats.some(c=>/exact to 6 decimal/.test(c)),'precision stated');
 await assert.rejects(()=>ex({section:'contracts',fn:'sum',valueField:'only'}),/unknown field/);
 // INTENTIONAL BEHAVIOUR CHANGE (Nov 27): the original assertion here was `total === 5` with '1e21 and Infinity skipped, no throw'. That returned a silently partial total, so it is replaced: beyond-1e15 and non-finite values now refuse. The original expectation is NOT satisfied by the new code.
 await assert.rejects(()=>ex({section:'contracts',fn:'sum',valueField:'big'}),/Unsupported or out-of-range number/,'1e21 and Infinity now refuse instead of returning a partial total');
 await assert.rejects(()=>ex({section:'contracts',fn:'sum',valueField:'m'}),/not numeric/,'mostly-text column is not numeric')}
 console.log('section calc accuracy/truncation/schema gate ok (mock only)')})().catch(x=>{console.error(x);process.exit(1)});
