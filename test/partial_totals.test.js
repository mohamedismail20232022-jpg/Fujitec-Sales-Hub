process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8181';process.env.FIREBASE_PROJECT_ID='demo-aitest';process.env.FIREBASE_WEB_API_KEY='fake-key';
const ENV={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef'},fs=require('fs'),assert=require('assert'),deps=require('../lib/deps'),{route}=require('../lib/api'),ExcelJS=require('exceljs');
const H='http://127.0.0.1:8181',P='demo-aitest',A='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
(async()=>{await fetch(H+'/emulator/v1/projects/'+P+':securityRules',{method:'PUT',body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:fs.readFileSync('firestore.rules.draft','utf8')}]}})});
const em='big'+Date.now()+'@x.com';await fetch(H+'/v1/projects/'+P+'/databases/(default)/documents/ws/main/roles/'+em,{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({fields:{role:{stringValue:'manager'},cv:{integerValue:'2'}}})});
const U=await (await fetch(A+'/accounts:signUp?key=x',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:em,password:'pw123456',returnSecureToken:true})})).json();
let TOK=U.idToken;const newUser=async()=>{const e='pt'+Date.now()+Math.random().toString(36).slice(2,6)+'@x.com';await fetch(H+'/v1/projects/'+P+'/databases/(default)/documents/ws/main/roles/'+e,{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({fields:{role:{stringValue:'manager'},cv:{integerValue:'2'}}})});TOK=(await (await fetch(A+'/accounts:signUp?key=x',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e,password:'pw123456',returnSecureToken:true})})).json()).idToken};const call=(n,b)=>route(n,{method:'POST',headers:{authorization:'Bearer '+TOK},body:b},deps,ENV);
const mkUser=async(n)=>{const em=n+Date.now()+'@x.com';await fetch(H+'/v1/projects/'+P+'/databases/(default)/documents/ws/main/roles/'+em,{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({fields:{role:{stringValue:'manager'},cv:{integerValue:'2'}}})});return (await (await fetch(A+'/accounts:signUp?key=x',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:em,password:'pw123456',returnSecureToken:true})})).json())};
const U2=await mkUser('other');const call2=(n,b)=>route(n,{method:'POST',headers:{authorization:'Bearer '+U2.idToken},body:b},deps,ENV);
const TE=Object.assign({NODE_ENV:'test'},ENV);const seen=[];
const ch=(b)=>route('chat',{method:'POST',headers:{authorization:'Bearer '+TOK},body:b},deps,TE);
const CALL=(o)=>'<tool_call>'+JSON.stringify(o)+'</tool_call>';
const mkwb=async(vals,name)=>{const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('D');ws.addRow(['Region','Revenue']);vals.forEach((v,i)=>ws.addRow(['R'+(i%2),v]));const buf=Buffer.from(await wb.xlsx.writeBuffer());const r=await call('process',{name,contentBase64:buf.toString('base64')});if(r.status!==200)throw new Error('ingest '+r.status+JSON.stringify(r.body));return r.body.file.id};
const SPEC=id=>({fileId:id,sheet:'D',labelCol:'A',valueCol:'B',fn:'sum'});
const res={};let bad=0;const T=(name,cond,info)=>{res[name]=!!cond;if(!cond){bad++;console.log('FAIL',name,info===undefined?'':JSON.stringify(info).slice(0,300))}};
const pad=(n,v)=>Array.from({length:n},()=>v);
// classes: [name, cells, expect]  expect: 'complete' | 'refuse' | 'colrefuse' | 'partial'
const cases=[
 ['clean_complete',[100,200,300,400],'complete',1000],
 ['blank_na_only_complete',[100,200,300,'n/a',null,400],'complete',1000],
 ['all_zero',[0,0,0,0],'complete',0],
 ['currency_sign_combos',['SAR -1,000','(SAR 500)','−250','SAR 2,000','1,000 SAR'],'complete',1250],
 ['one_decimal_comma_among_20',[...pad(19,10),'12,5'],'refuse'],
 ['plus_sign_among_10',[...pad(9,10),'+5'],'refuse'],
 ['exponent_among_10',[...pad(9,10),'1e3'],'refuse'],
 ['indian_grouping_among_10',[...pad(9,10),'1,23,456'],'refuse'],
 ['euro_thousands_decimal_comma',[...pad(9,10),'1.234,50'],'refuse'],
 ['mixed_supported_unsupported_half_colrefuse',['100','200','12,5','3,5'],'colrefuse'],['mixed_70pct_numeric',['100','200','300','400','500','600','700','12,5','3,5','1e3'],'refuse'],
 ['all_excluded_unsupported',['12,5','3,5','1,23,456','+5'],'colrefuse'],
 ['all_blank_text',['n/a','-','TBD',null],'colrefuse'],
 ['trailing_minus_among_10',[...pad(9,10),'250-'],'refuse'],
 ['beyond_1e15_among_10',[...pad(9,10),1e21],'refuse'],['text_1e16_among_10',[...pad(9,10),'10000000000000000'],'refuse'],
];
for(const [name,cells,exp,total] of cases){await newUser();const id=await mkwb(cells,name+'.xlsx');
 const r=await call('analyze',SPEC(id));const body=r.body||{};
 if(exp==='complete'){T(name+':status',r.status===200,r);if(r.status===200){T(name+':complete flag',body.complete===true&&!body.partial,body);T(name+':total',Math.abs(body.total.value-total)<1e-9,body.total);const nb=cells.filter(c=>c===null||c==='n/a').length;if(nb)T(name+':excluded counted in caveat',(body.caveats||[]).some(c=>typeof c==='string'&&/skipped/.test(c)&&!/PARTIAL/.test(c)),body.caveats)}}
 else{T(name+':refused, no total',r.status>=400&&!(body&&body.total),{s:r.status,b:body});
  // opt-in partial only for the unsupported-format-in-numeric-column cases
  if(exp==='refuse'){const p=await call('analyze',Object.assign(SPEC(id),{allowPartial:true}));const b=p.body||{};T(name+':allowPartial is unmistakably partial',p.status===200&&b.partial===true&&b.complete===false&&b.excluded.unsupportedNumberFormat>=1&&(b.caveats||[]).some(c=>typeof c==='string'&&/^PARTIAL RESULT/.test(c)),b)}}
 // downstream chat
 deps.providerOpts={testMock:async()=>CALL({tool:'aggregate',args:{spec:SPEC(id)}})};
 const c=await ch({question:'sum of revenue by region',fileIds:[id],tools:true});const ans=String(c.body&&c.body.answer||'');
 if(exp==='complete'){T(name+':chat shows total',c.status===200&&ans.includes(String(total)),{s:c.status,a:ans.slice(0,200)});if(cells.some(x=>x===null||x==='n/a'))T(name+':chat discloses skipped',/skipped/i.test(ans),ans.slice(0,300))}
 else{const total2=cells.filter(x=>typeof x==='number'||/^\d+$/.test(String(x))).reduce((a,x)=>a+Number(x),0);T(name+':chat presents no total',!/\bTotal\b[^\n]*\d/i.test(ans.split('[Calculation')[0])&&!new RegExp('\\b'+total2+'\\b').test(ans)||total2===0,{s:c.status,a:ans.slice(0,300),toolErrors:c.body&&c.body.toolErrors})}
}
// provider invents a total AFTER the tool call was refused: nothing it states may reach the visible answer
{await newUser();const id=await mkwb([...pad(9,10),'12,5'],'inv.xlsx');
 const V=[['digits','The total revenue is 9999 [S1].',/9999/],['commas','Total revenue: 9,999.00 SAR [S1].',/9,999/],['words','The total revenue is nine thousand nine hundred ninety-nine [S1].',/nine thousand/i],['arabic digits','إجمالي الإيرادات ٩٩٩٩ [S1].',/٩٩٩٩/],['k suffix','Total is roughly 10k [S1].',/10k/i],['per region','R0 has 4321 and R1 has 5678 [S1].',/4321|5678/],['percent','Revenue grew 12.5% overall [S1].',/12\.5%/],['no-citation','Total 9999',/9999/]];
 for(const [nm,txt,re] of V){const script=[CALL({tool:'aggregate',args:{spec:SPEC(id)}}),txt];let i=0;deps.providerOpts={testMock:async()=>script[Math.min(i++,script.length-1)]};
  const c=await ch({question:'sum of revenue by region',fileIds:[id],tools:true});const ans=String(c.body&&c.body.answer||'');const vis=ans.split('[Calculation')[0];
  T('invented_after_refusal['+nm+']',c.status===200&&!re.test(vis),{a:ans.slice(0,300)})}}
const n=Object.keys(res).length;console.log(JSON.stringify({checks:n,passed:n-bad,failed:bad}));process.exit(bad?1:0)})().catch(e=>{console.error(e);process.exit(2)});
