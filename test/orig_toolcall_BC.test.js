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
r=await ask(['Revenue grew 87.3% [S1].']);assert.ok(r.body.allNumbersVerified===false&&r.body.numberCheck.unverified.includes('87.3'),'ORIGINAL B: invented number must appear in numberCheck.unverified');console.log('B-ANSWER',JSON.stringify(r.body.answer),JSON.stringify(r.body.numberCheck));
// C) model calls the tool correctly but then states a DIFFERENT number -> flagged
r=await ask([CALL(goodCall),'Riyadh is 61.2% above Jeddah [S1].']);assert.ok(r.body.numberCheck.unverified.includes('61.2')&&r.body.allNumbersVerified===false,'ORIGINAL C: wrong number must appear in numberCheck.unverified');console.log('C-ANSWER',JSON.stringify(r.body.answer),JSON.stringify(r.body.numberCheck));

// NEW strong assertions (documented behaviour change): invented/wrong figure is absent from the visible answer; the correct executed result is shown for C.
r=await ask(['Revenue grew 87.3% [S1].']);assert.ok(!/87\.3/.test(r.body.answer),'NEW B: invented number absent from the WHOLE visible answer incl. notes');
r=await ask([CALL(goodCall),'Riyadh is 61.2% above Jeddah [S1].']);assert.ok(r.body.serverRendered&&/53\.57/.test(r.body.answer)&&!/61\.2/.test(r.body.answer),'NEW C: server result rendered, wrong number absent: '+r.body.answer);
assert.ok(/150500\.5/.test(r.body.answer)&&/98000/.test(r.body.answer),'NEW C: both operands shown');
// wrong-city / reversed claim after a correct call must also be replaced by the server render
r=await ask([CALL(goodCall),'Jeddah is 53.5719387755% above Riyadh [S1].']);assert.ok(r.body.serverRendered&&!/above/.test(r.body.answer),'NEW REV: reversed relation never shown, server render only: '+r.body.answer);

// reload: persisted history text must equal the final visible answer (no pre-finalization text, no removed numbers)
r=await ask([CALL(goodCall),'Riyadh is 61.2% above Jeddah [S1].']);{const g=await cs({action:'get',chatId:r.body.chatId});const last=g.body.messages.filter(m=>m.role==='assistant').pop();assert.strictEqual(last.text,r.body.answer,'NEW: persisted == visible');assert.ok(!/61\.2/.test(JSON.stringify(g.body)),'NEW: reload does not contain wrong number');console.log('FNC',JSON.stringify(r.body.answer),JSON.stringify(r.body.numberCheck));assert.strictEqual(r.body.finalAnswerNumbersVerified,true);assert.strictEqual(r.body.allNumbersVerified,false);}
r=await ask(['Revenue grew 87.3% [S1].']);{const g=await cs({action:'get',chatId:r.body.chatId});assert.ok(!/87\.3/.test(JSON.stringify(g.body.messages.filter(m=>m.role==='assistant'))),'NEW: reload B');assert.ok(!/87\.3/.test(JSON.stringify(r.body.wordingCheck)),'NEW: wordingCheck does not carry the removed text')}
console.log('ORIGINAL B/C strict + NEW tests passed');process.exit(0)})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
