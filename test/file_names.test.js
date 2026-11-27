process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8181';process.env.FIREBASE_PROJECT_ID='demo-aitest';process.env.FIREBASE_WEB_API_KEY='fake-key';
const ENV={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef'},fs=require('fs'),assert=require('assert'),deps=require('../lib/deps'),{route}=require('../lib/api'),ExcelJS=require('exceljs');
const H='http://127.0.0.1:8181',P='demo-aitest',A='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
(async()=>{await fetch(H+'/emulator/v1/projects/'+P+':securityRules',{method:'PUT',body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:fs.readFileSync('firestore.rules.draft','utf8')}]}})});
const em='fn'+Date.now()+'@x.com';await fetch(H+'/v1/projects/'+P+'/databases/(default)/documents/ws/main/roles/'+em,{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({fields:{role:{stringValue:'manager'},cv:{integerValue:'2'}}})});
const U=await (await fetch(A+'/accounts:signUp?key=x',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:em,password:'pw123456',returnSecureToken:true})})).json();
const call=(n,b)=>route(n,{method:'POST',headers:{authorization:'Bearer '+U.idToken},body:b},deps,ENV);
const put=(f,n)=>call('process',{name:n,contentBase64:fs.readFileSync('fx/'+f).toString('base64')});
let n=0;
// Real fixtures under names a phone or copy/paste can produce: all must be accepted and parsed, and the stored name must be clean.
for(const [f,nm,clean] of [['report.pdf','report.pdf ','report.pdf'],['report.pdf','تقرير\u200f.pdf\u200f','تقرير.pdf'],['contract.docx','"contract.docx"','contract.docx'],['sales.xlsx','sales.XLSX\u202c','sales.XLSX'],['deck.pptx','deck.pptx.','deck.pptx'],['data.csv','data.csv\u200e ','data.csv'],['report.pdf','C:\\fakepath\\report.pdf','report.pdf']]){
  const r=await put(f,nm);assert.strictEqual(r.status,200,JSON.stringify(nm)+' '+JSON.stringify(r.body).slice(0,160));assert.strictEqual(r.body.file.status,'ready',nm);assert.strictEqual(r.body.file.name,clean,'stored name for '+JSON.stringify(nm));n+=3}
// Still rejected, with a message that names the real problem
const rej=async(f,nm,code,re)=>{const r=await put(f,nm);assert.strictEqual(r.status,400,nm);assert.strictEqual(r.body.error.code,code,nm);assert(re.test(r.body.error.msg),nm+' '+r.body.error.msg);n++};
await rej('report.pdf','report','UNSUPPORTED_TYPE',/no extension/);
await rej('report.pdf','photo.jpg','UNSUPPORTED_TYPE',/\.jpg.*Supported/);
await rej('report.pdf','notes.txt','UNSUPPORTED_TYPE',/\.txt.*Supported/);
await rej('report.pdf','sheet.xlsm','UNSUPPORTED_TYPE',/\.xlsm/);
await rej('contract.docx','x.pdf','BAD_SIGNATURE',/does not match/);          // extension/content mismatch still refused
{const r=await put('bad.pdf','bad.pdf');assert.notStrictEqual(r.status,200);assert(!/UNSUPPORTED/.test(JSON.stringify(r.body)),'corrupt pdf is not reported as unsupported type');n++}

// Traceability, collisions, signatures on real bytes after normalization
{const r1=await put('report.pdf','dup.pdf'),r2=await put('report.pdf','dup.pdf '),r3=await put('report.pdf','dup.pdf');
 assert.strictEqual(r1.status,200);assert.strictEqual(r2.status,200);assert.strictEqual(r3.status,200);
 assert.strictEqual(new Set([r1.body.file.id,r2.body.file.id,r3.body.file.id]).size,3,'every upload gets its own id (no overwrite)');n++;
 assert(!r1.body.file.warnings.some(w=>w.code==='NAME_NORMALIZED'),'clean name: no note');assert(r2.body.file.warnings.some(w=>w.code==='NAME_NORMALIZED'&&/dup\.pdf/.test(w.msg)),'cleaned name: traceability note');n+=2;
 const L=await call('files',{action:'list'});const names=(L.body.files||[]).filter(f=>f.name==='dup.pdf').length;assert.strictEqual(names,3,'all three listed, none replaced');n++}
// double extension / path-like names: the check runs on the bytes against the LAST extension
await rej('report.pdf','a.pdf.docx','BAD_SIGNATURE',/does not match/);
await rej('contract.docx','a.docx.pdf','BAD_SIGNATURE',/does not match/);
await rej('contract.docx','../../etc/a.pdf','BAD_SIGNATURE',/does not match/);
await rej('report.pdf','dir\\sub/a.docx','BAD_SIGNATURE',/does not match/);
{const r=await put('report.pdf','../../x/y/a.pdf');assert.strictEqual(r.status,200);assert.strictEqual(r.body.file.name,'a.pdf');n++}
await rej('report.pdf','  .. ','UNSUPPORTED_TYPE',/no extension/);
// long names keep their extension (previously the 200-char cut could remove it)
{const nm='ت'.repeat(260)+'.pdf';const r=await put('report.pdf',nm);assert.strictEqual(r.status,200,JSON.stringify(r.body).slice(0,200));assert.strictEqual(r.body.file.status,'ready');assert(r.body.file.name.endsWith('.pdf')&&r.body.file.name.length<=200);n+=3}
console.log('file_names OK',n,'checks')})().catch(e=>{console.error(e.message);process.exit(1)});
