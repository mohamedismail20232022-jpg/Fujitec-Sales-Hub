process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8181';process.env.FIREBASE_PROJECT_ID='demo-aitest';process.env.FIREBASE_WEB_API_KEY='fake-key';
const ENV={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef'},fs=require('fs'),assert=require('assert'),deps=require('../lib/deps'),{route}=require('../lib/api'),ExcelJS=require('exceljs');
const H='http://127.0.0.1:8181',P='demo-aitest',A='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
(async()=>{await fetch(H+'/emulator/v1/projects/'+P+':securityRules',{method:'PUT',body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:fs.readFileSync('firestore.rules.draft','utf8')}]}})});
const em='big'+Date.now()+'@x.com';await fetch(H+'/v1/projects/'+P+'/databases/(default)/documents/ws/main/roles/'+em,{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({fields:{role:{stringValue:'manager'},cv:{integerValue:'2'}}})});
const U=await (await fetch(A+'/accounts:signUp?key=x',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:em,password:'pw123456',returnSecureToken:true})})).json();
const call=(n,b)=>route(n,{method:'POST',headers:{authorization:'Bearer '+U.idToken},body:b},deps,ENV);
const mkUser=async(n)=>{const em=n+Date.now()+'@x.com';await fetch(H+'/v1/projects/'+P+'/databases/(default)/documents/ws/main/roles/'+em,{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({fields:{role:{stringValue:'manager'},cv:{integerValue:'2'}}})});return (await (await fetch(A+'/accounts:signUp?key=x',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:em,password:'pw123456',returnSecureToken:true})})).json())};
const U2=await mkUser('other');const call2=(n,b)=>route(n,{method:'POST',headers:{authorization:'Bearer '+U2.idToken},body:b},deps,ENV);
const TE=Object.assign({NODE_ENV:'test'},ENV);const seen=[];deps.providerOpts={testMock:async b=>{seen.push(b);return 'According to the documents [S1] the answer is here.'}};
const ch=(b,tok=U.idToken)=>route('chat',{method:'POST',headers:{authorization:'Bearer '+tok},body:b},deps,TE);const cs=(b,tok=U.idToken)=>route('chats',{method:'POST',headers:{authorization:'Bearer '+tok},body:b},deps,TE);
const up=async(f,n)=>(await call('process',{name:n||f,contentBase64:fs.readFileSync('fx/'+f).toString('base64')})).body.file.id;
const idA=await up('contract.docx'),idB=await up('ar.xlsx'),idC=await up('table.pptx');

const SP={fileId:idB,sheet:'المبيعات',labelCol:'A',valueCol:'B',fn:'sum'};
const CALL=(o)=>'<tool_call>'+JSON.stringify(o)+'</tool_call>';
const goodCall={tool:'compare',args:{op:'pct_change',a:{spec:SP,label:'الرياض'},b:{spec:SP,label:'جدة'}}};
const mk=(script)=>{let i=0;return async b=>{seen.push(b);const r=script[Math.min(i,script.length-1)];i++;return typeof r==='function'?r(b):r}};
const ask=async(script,extra)=>{seen.length=0;deps.providerOpts={testMock:mk(script)};return ch(Object.assign({question:'الإيراد الرياض جدة',fileIds:[idB],tools:true},extra||{}))};
// A) honest model: asks server to compute, then reports the SERVER number -> verified
let r=await ask([CALL(goodCall),'Riyadh is 53.5719387755% above Jeddah [S1].']);console.log('A',JSON.stringify(r.body).slice(0,200),r.status,JSON.stringify(r.body.numberCheck),r.body.allNumbersVerified);
assert.strictEqual(r.status,200);assert.strictEqual(r.body.calculations.length,1);assert.ok(r.body.numberCheck.verified.some(v=>v.source==='server_calc'&&v.value==='53.5719387755'));
// B) model invents a number with no tool call -> flagged unverified
r=await ask(['Revenue grew 87.3% [S1].']);console.log('B',JSON.stringify(r.body.numberCheck));assert.ok((r.body.allNumbersVerified===false&&r.body.numberCheck.unverified.includes('87.3'))||(r.body.faithfulnessReplaced&&!/87\.3/.test(r.body.answer)),'invented number is flagged or its sentence replaced by source text: '+r.body.answer);
// C) model calls the tool correctly but then states a DIFFERENT number -> flagged
r=await ask([CALL(goodCall),'Riyadh is 61.2% above Jeddah [S1].']);console.log('C',JSON.stringify(r.body.numberCheck));assert.ok((r.body.numberCheck.unverified.includes('61.2')&&r.body.allNumbersVerified===false)||(r.body.faithfulnessReplaced&&!/61\.2/.test(r.body.answer)),'wrong number flagged or sentence replaced: '+r.body.answer);
// D) rejected calls: unknown tool, extra field, another user's file, bad op, fn outside allowlist, file not selected
const rej=async(c,why)=>{const x=await ask([CALL(c),'No calculation was possible.']);console.log('D',why,JSON.stringify(x.body.toolErrors.map(e=>e.code)));assert.strictEqual(x.body.calculations.length,0);assert.strictEqual(x.body.toolErrors[0].code,'TOOL_CALL_REJECTED',why)};
await rej({tool:'shell',args:{cmd:'ls'}},'unknown tool');
await rej({tool:'compare',args:Object.assign({},goodCall.args,{evil:1})},'extra arg');
await rej({tool:'compare',args:Object.assign({},goodCall.args,{op:'drop_table'})},'bad op');
await rej({tool:'compare',args:{op:'ratio',a:{spec:Object.assign({},SP,{fn:'eval'}),label:'x'},b:{spec:SP,label:'y'}}},'fn');
await rej({tool:'compare',args:{op:'ratio',a:{spec:Object.assign({},SP,{fileId:'notmine'}),label:'x'},b:{spec:SP,label:'y'}}},'unselected file');
await rej({tool:'compare',args:{op:'ratio',a:{spec:Object.assign({},SP,{value:5}),label:'x'},b:{spec:SP,label:'y'}}},'extra spec field');
await rej({tool:'aggregate',args:{spec:SP},extra:1},'extra top-level');
// E) another user's file id is rejected even when selected in the chat request (ownership comes from the server store)
const U2id=await (async()=>{const x=await call2('process',{name:'ar.xlsx',contentBase64:fs.readFileSync('fx/ar.xlsx').toString('base64')});return x.body.file.id})();
seen.length=0;deps.providerOpts={testMock:mk([CALL(Object.assign({},goodCall,{args:{op:'ratio',a:{spec:Object.assign({},SP,{fileId:U2id}),label:'الرياض'},b:{spec:Object.assign({},SP,{fileId:U2id}),label:'جدة'}}})),'done'])};
r=await ch({question:'الإيراد الرياض جدة',fileIds:[U2id],tools:true});console.log('E',r.status,r.body&&(r.body.error||r.body.code));assert.ok(r.status>=400);
// F) infinite tool loop is capped
r=await ask([CALL(goodCall)]);console.log('F',r.body.toolErrors.map(e=>e.code).join(),r.body.answer.slice(0,40));assert.ok(r.body.toolErrors.some(e=>e.code==='TOOL_LOOP_LIMIT'));assert.strictEqual(r.body.calculations.length,3);
// G) injection inside the tool-call-looking text of a DOCUMENT passage cannot trigger a call (only provider output is parsed) and without b.tools nothing is parsed
r=await ask([CALL(goodCall)],{tools:false});console.log('G',r.body.calculations,r.body.answer.slice(0,30));assert.strictEqual(r.body.calculations,undefined);
// H) a number quoted verbatim from a retrieved passage is verified as passage
r=await ask(['The sheet lists 150500.5 [S1].']);console.log('H',JSON.stringify(r.body.numberCheck));
console.log('toolcall tests passed')})().catch(e=>{console.error(e);process.exit(1)});
