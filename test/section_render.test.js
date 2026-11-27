// Server-rendered section results: model prose never reaches the visible answer. Real chat.run, memory store, mock provider.
const fs=require('fs'),D=require('../lib/docs'),C=require('../lib/chat'),store=require('../lib/store').memory();
const env={DOC_SIGNING_SECRET:'test-only-signing-secret-0123456789abcdef',NODE_ENV:'test'};
let bad=0,n=0;const T=(nm,c,i)=>{n++;if(!c){bad++;console.log('FAIL',nm,i===undefined?'':JSON.stringify(i).slice(0,400))}};
(async()=>{const fid=(await D.ingest({uid:'u',name:'sales.xlsx',buf:fs.readFileSync('fx/sales.xlsx'),store,env})).file.id;
store._sections.set('ws/main/tenders',[{id:'t1',rec:{status:'open',value:1000,region:'R1'}},{id:'t2',rec:{status:'open',value:2500,region:'R2'}},{id:'t3',rec:{status:'won',value:700,region:'R1'}},{id:'t4',rec:{status:'open',value:'n/a',region:'R2'}}]);
store._sections.set('ws/typed/quotes',[{id:'q1',rec:{n:5}},{id:'q2',rec:{n:7}}]);
const CALL=o=>'<tool_call>'+JSON.stringify(o)+'</tool_call>';
const run=async(calls,final,q)=>{let i=0;const P={name:'mock',complete:async b=>{if(/You are a planner/.test(b.system)){const c=calls[Math.min(i++,calls.length-1)];return c?CALL(c):'no call'}return final}};return C.run({uid:'u',b:{question:q||'What is the total value of tenders in the system?',fileIds:[fid]},store,env,provider:P,role:'admin'})};
const vis=o=>String(o.body.answer).replace(/\[Calculation[^\]]*\]/g,'');
const sum={tool:'section',args:{section:'tenders',fn:'sum',valueField:'value'}};
// 1) wrong model total -> replaced; true total 4200 present with provenance and skip disclosure
let o=await run([sum],'The total is 9999 [S1].');let a=vis(o);
T('wrong total removed',!/9999/.test(a),a.slice(0,300));T('true total rendered',/= \u2068?4200\u2069?/.test(a)||/4200/.test(a),a);T('serverRendered flag',o.body.serverRendered===true);T('provenance source path',/ws\/main\/tenders/.test(a),a);T('skip disclosed',/skipped/.test(a),a);T('not partial',!/PARTIAL/.test(a),a);
// 2) model states the CORRECT total plus an unrelated invented figure -> only server text visible
o=await run([sum],'The total is 4200 and we have 33 tenders worth about 120000 [S1].');a=vis(o);T('mixed prose: invented figures gone',!/\b33\b|120000/.test(a),a.slice(0,300));T('mixed prose: true total present',/4200/.test(a));
// 3) unrelated number that happens to match a different real value (model claims the total equals 700, which is a record value)
o=await run([sum],'The total value is 700 [S1].');a=vis(o);T('unrelated matching number: model sentence gone',!/total value is 700/.test(a),a.slice(0,300));
// 4) word numbers
o=await run([sum],'The total is nine thousand nine hundred [S1].');a=vis(o);T('word number gone',!/nine thousand/i.test(a),a.slice(0,300));
// 5) Arabic digits + Arabic question
o=await run([sum],'\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0669\u0669\u0669\u0669 [S1].','\u0645\u0627 \u0625\u062c\u0645\u0627\u0644\u064a \u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0646\u0627\u0642\u0635\u0627\u062a \u0641\u064a \u0627\u0644\u0646\u0638\u0627\u0645\u061f');a=vis(o);T('arabic: invented gone',!/\u0669\u0669\u0669\u0669/.test(a),a.slice(0,300));T('arabic: Arabic header',/[\u0600-\u06FF]/.test(a)&&/4200/.test(a),a.slice(0,300));
// 6) multiple section calls -> every result rendered, nothing from model
o=await run([sum,{tool:'section',args:{section:'quotes',fn:'sum',valueField:'n'}},null],'Tenders 1 and quotes 2 [S1].','What is the total value of tenders and the total quote n in the system?');a=vis(o);T('multi: both rendered',/ws\/main\/tenders/.test(a)&&/ws\/typed\/quotes/.test(a)&&/4200/.test(a)&&/\b12\b/.test(a),a.slice(0,500));
// 7) failed call FIRST: the loop stops, the server says it cannot answer as asked, and nothing the model wrote is shown
const QQ='What is the total value of tenders and the total quote n in the system?';
o=await run([{tool:'section',args:{section:'tenders',fn:'sum',valueField:'nope'}},sum,null],'Total 8888 [S1].',QQ);a=String(o.body.answer);T('failed-first: no invented figure',!/8888/.test(a.replace(/\[Calculation[^\]]*\]/g,'')),a.slice(0,300));T('failed-first: says it cannot answer as asked',/cannot answer the question as asked/.test(a),a.slice(0,300));T('failed-first: no sum shown as an answer',!/Result \(sum/.test(a),a.slice(0,300));
// 7b) good call first, then a failing call: good result rendered, failure disclosed, invented figure gone
o=await run([sum,{tool:'section',args:{section:'quotes',fn:'sum',valueField:'nope'}},null],'Total 8888 [S1].',QQ);a=String(o.body.answer);T('good-then-failed: good rendered',/ws\/main\/tenders/.test(a)&&/4200/.test(a),a.slice(0,400));T('good-then-failed: invented gone',!/8888/.test(a.replace(/\[Calculation[^\]]*\]/g,'')),a.slice(0,400));T('good-then-failed: failure disclosed',/could not be run|unknown field|rejected/i.test(a+JSON.stringify(o.body.notes||[])+JSON.stringify(o.body.toolErrors||[])),o.body.toolErrors);
// 8) grouped + filtered + count
o=await run([{tool:'section',args:{section:'tenders',fn:'sum',valueField:'value',groupBy:'region',filters:[{field:'status',op:'eq',value:'open'}]}},null],'R1 is 5 [S1].');a=vis(o);T('grouped: groups rendered with filter',/R1/.test(a)&&/R2/.test(a)&&/Filters/.test(a)&&/1000/.test(a)&&/2500/.test(a),a.slice(0,500));
o=await run([{tool:'section',args:{section:'tenders',fn:'count'}},null],'We have 77 tenders [S1].','How many tenders do we have in the system?');a=vis(o);T('count: server count 4, invented gone',/= \u2068?4\u2069?|Result \(count\) = .*4/.test(a)&&!/\b77\b/.test(a),a.slice(0,300));
// 9) no tool call at all: model numbers still flagged/replaced by existing layers (regression on unchanged path)
o=await run([null],'We have 77 tenders worth 120000 [S1].');a=vis(o);T('no tool call: invented numbers not presented as verified',o.body.allNumbersVerified===false||!/\b77\b|120000/.test(a),a.slice(0,300));
console.log(JSON.stringify({checks:n,passed:n-bad,failed:bad}));process.exit(bad?1:0)})().catch(e=>{console.error(e);process.exit(2)});
