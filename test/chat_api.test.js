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
// 1) first turn, cross-document: two files selected, passages from both can be retrieved
let r=await ch({question:'Riyadh revenue الرياض',fileIds:[idB,idC]});assert.strictEqual(r.status,200,JSON.stringify(r.body));const chatId=r.body.chatId;console.log('turn1 files in citations:',[...new Set(r.body.citations.map(c=>c.cite.file))].join(','));
assert.ok(new Set(r.body.citations.map(c=>c.cite.file)).size===2,'cross-document: both files retrieved');assert.deepStrictEqual(r.body.used,['S1']);
// 2) follow-up with no chatId in history from client: server loads persisted history
r=await ch({chatId,question:'and Jeddah?'});assert.strictEqual(r.status,200,JSON.stringify(r.body));assert.strictEqual(r.body.chatId,chatId);const last=seen[seen.length-1];console.log('turn2 provider got',last.messages.length,'messages (history from server)');assert.ok(last.messages.length>=3);assert.strictEqual(last.messages[0].role,'user');
// 3) persistence: list/get, as a fresh "session"
let l=await cs({action:'list'});assert.ok(l.body.chats.some(c=>c.id===chatId));let g=await cs({action:'get',chatId});assert.strictEqual(g.body.messages.length,4);console.log('persisted messages',g.body.messages.map(m=>m.role+':'+m.n).join(','),'title:',g.body.chat.title,'files kept:',g.body.chat.fileIds.length);
// 4) isolation: other user cannot see/continue/delete it
let o=await cs({action:'get',chatId},U2.idToken);assert.strictEqual(o.status,404);o=await ch({chatId,question:'x?'},U2.idToken);assert.strictEqual(o.status,404);const ol=await cs({action:'list'},U2.idToken);assert.strictEqual(ol.body.chats.length,0);
// 5) other user's file ids cannot be used
o=await ch({question:'Riyadh',fileIds:[idB]},U2.idToken);console.log('other user using my file id ->',o.status,o.body.error&&o.body.error.code);assert.ok(o.status>=400);
// 6) rename, then streaming
r=await cs({action:'rename',chatId,title:'مبيعات الرياض'});assert.strictEqual(r.status,200);g=await cs({action:'get',chatId});assert.strictEqual(g.body.chat.title,'مبيعات الرياض');
const sr=await ch({chatId,question:'Dammam?',stream:true,tools:false});assert.ok(sr.stream);const evs=[];for await(const e of sr.stream)evs.push(e);console.log('stream events:',evs.map(e=>e.type).join(','));
assert.strictEqual(evs[0].type,'meta');assert.ok(evs.filter(e=>e.type==='delta').length>2);assert.strictEqual(evs[evs.length-1].type,'done');assert.strictEqual(evs.filter(e=>e.type==='delta').map(e=>e.text).join(''),'According to the documents [S1] the answer is here.');
g=await cs({action:'get',chatId});assert.strictEqual(g.body.messages.length,6);
// 7) provider failure mid-stream: error event, nothing persisted for that turn
deps.providerOpts={testMock:async()=>'x',testStream:async function*(){yield 'partial ';throw Object.assign(new Error('boom'),{code:'AI_UPSTREAM'})}};
const fr=await ch({chatId,question:'Riyadh again',stream:true,tools:false});const fe=[];for await(const e of fr.stream)fe.push(e.type);console.log('failing stream:',fe.join(','));assert.ok(fe.includes('error')&&!fe.includes('done'));g=await cs({action:'get',chatId});assert.strictEqual(g.body.messages.length,6);
// 8) no provider configured: fails closed, nothing persisted
deps.providerOpts=undefined;const nc=await route('chat',{method:'POST',headers:{authorization:'Bearer '+U.idToken},body:{chatId,question:'q?'}},deps,ENV);assert.strictEqual(nc.status,503);
// 9) delete conversation removes messages
r=await cs({action:'delete',chatId});assert.strictEqual(r.status,200);g=await cs({action:'get',chatId});assert.strictEqual(g.status,404);
const au=await (await fetch(H+'/v1/projects/'+P+'/databases/(default)/documents/aidocs/'+U.localId+'/audit?pageSize=100',{headers:{authorization:'Bearer owner'}})).json();const acts=(au.documents||[]).map(d=>d.fields.action.stringValue);console.log('audit records (emulator admin read):',acts.length,[...new Set(acts)].sort().join(','));assert.ok(acts.includes('upload')&&acts.includes('chat')&&acts.includes('delete_chat'));
console.log('chat api tests passed')})().catch(e=>{console.error(e);process.exit(1)});
