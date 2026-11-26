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
const AG=CALL({tool:'aggregate',args:{spec:SP}});
// 1) model invents ranking + wrong number after a real aggregate: server render replaces prose
let r=await ask([AG,'Jeddah is the highest at 999999 [S1], far more than Riyadh.']);
assert.strictEqual(r.status,200);let a=r.body.answer;console.log('AGG1',a);
assert(/From the server calculation|\u0645\u0646 \u0627\u0644\u062d\u0633\u0627\u0628/.test(a),'server render shown');
assert(!/999999/.test(a)&&!/far more/.test(a),'invented number/ranking absent from visible answer');
assert(/150500\.5/.test(a)&&/98000/.test(a),'real values shown');
assert(/\u0627\u0644\u0623\u0639\u0644\u0649|Highest/.test(a),'server-derived ranking');
const hi=a.split('\n').find(l=>/Highest|\u0627\u0644\u0623\u0639\u0644\u0649/.test(l));assert(/\u0627\u0644\u0631\u064a\u0627\u0636/.test(hi),'highest is Riyadh: '+hi);
// 2) honest total: still a server render, total correct
r=await ask([AG,'The total is 323750.75 [S1].']);a=r.body.answer;assert(/From the server calculation|\u0645\u0646 \u0627\u0644\u062d\u0633\u0627\u0628 \u0627\u0644\u0645\u0646\u0641\u0651\u0630/.test(a)&&/323750\.75/.test(a),a);
// 3) correct numbers, wrong label association, no ranking word
r=await ask([AG,'Jeddah has 150500.5 and Riyadh has 98000 [S1].']);a=r.body.answer;
const rl=l=>a.split('\n').find(x=>x.includes(l));
assert(/\u0627\u0644\u0631\u064a\u0627\u0636[^\n]*150500\.5/.test(rl('\u0627\u0644\u0631\u064a\u0627\u0636')),'Riyadh line has its own value: '+a);assert(!/Jeddah/.test(a),'model wording absent');
// 4) negation / omitted group
r=await ask([AG,'Dammam did not sell anything; only Riyadh and Jeddah exist [S1].']);a=r.body.answer;assert(!/did not sell|only Riyadh/.test(a)&&/75250\.25/.test(a),'omitted group shown from server: '+a);
// 5) persisted history equals visible answer, invented claim absent from it
r=await ask([AG,'Jeddah is the highest at 999999 [S1].']);{const g=await cs({action:'get',chatId:r.body.chatId});const last=g.body.messages.filter(m=>m.role==='assistant').pop();assert.strictEqual(last.text,r.body.answer,'persisted == visible');assert(!/999999/.test(JSON.stringify(g.body.messages))&&!/999999/.test(r.body.answer)&&!/999999/.test(JSON.stringify(r.body.wordingCheck||[])),'invented number nowhere visible/persisted')}
// 2b) calc executed but model prose mentions no value, label or relation word: still server render, never raw prose
r=await ask([AG,'Sure, here you go.']);a=r.body.answer;assert(!/Sure, here you go/.test(a)&&/150500\.5/.test(a)&&/323750\.75/.test(a),'unsupported prose dropped: '+a);
// 6) unit: empty / zero / negative / tie groups
const {renderAggregate}=require('../lib/chat');const mk2=(labels,values,total,caveats)=>({result:{fn:'sum',labels,values,refs:labels.map((_,i)=>'f!S!B'+(i+2)),total:{value:total},file:'f',sheet:'S',caveats:caveats||[]}});
let x=renderAggregate(mk2([],[],0),false);assert(/Total \(sum\) = .0./.test(x)&&!/Highest/.test(x),'empty: '+x);
x=renderAggregate(mk2(['A','B'],[0,-5],-5),false);assert(/Highest[^\n]*A[^\n]*0/.test(x)&&/Lowest[^\n]*B[^\n]*-5/.test(x),'zero/negative: '+x);
x=renderAggregate(mk2(['A','B'],[5,5],10),false);assert(!/Highest|Lowest/.test(x),'tie: no ranking claimed: '+x);
x=renderAggregate(mk2(['A','B'],[1,2],3,['limited to the first 2 of 70000 groups in the listing']),false);assert(!/Highest|Lowest/.test(x)&&/Caveats/.test(x),'truncated listing: no ranking claimed: '+x);
console.log('agg render tests passed')})().catch(e=>{console.error(e);process.exit(1)});
