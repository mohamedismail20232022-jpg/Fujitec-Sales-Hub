const assert=require('assert');const {enforce}=require('../lib/support');
const P=t=>[{id:'S1',text:t}];
const run=(ans,q,t)=>enforce(ans,q,P(t));
const bad='The notice period is 30 days unconditionally [S1].';
// 1 short valid quote kept untouched
{const r=run('Either party may terminate with 60 days written notice [S1].','termination notice','1. Term. 12 months.\n2. Termination. Either party may terminate with 60 days written notice.');assert(!r.replaced.length,'valid kept')}
// 2 wrong claim -> whole clause incl. qualifier
{const t='1. Term. The agreement lasts 12 months.\n2. Termination. The notice period is 60 days. This applies only after the first 6 months. Before that no termination is allowed.\n3. Fees. Paid monthly.';
 const r=run(bad,'what is the notice period',t);const a=r.answer;assert(/Exact text from the document/.test(a)&&/only after the first 6 months/.test(a)&&/no termination is allowed/.test(a),a);assert(!/Fees/.test(a));assert(!/unconditionally/.test(a)&&!/30 days/.test(a),a);assert(!/retrieved passage only/.test(a),'closed clause is whole')}
// 3 qualifier beyond 700 chars: complete, not truncated
{const filler=Array.from({length:12},(_,i)=>'Further detail number '+i+' about the notice period applies here.').join(' ');
 const t='1. Intro. x.\n2. Termination. The notice period is 60 days. '+filler+' Unless the buyer is in default.\n3. Fees. y.';
 const r=run(bad,'notice period',t);assert(/Unless the buyer is in default/.test(r.answer),'qualifier past 700 kept');assert(r.answer.length>700)}
// 4 exception after 5+ sentences
{const t='2. Termination. The notice period is 60 days. A. one. B. two. C. three. D. four. E. five. Except in case of fraud there is no notice.\n3. Fees. y.';
 const r=run(bad,'notice period',t);assert(/Except in case of fraud/.test(r.answer),r.answer)}
// 5 next numbered clause boundary respected
{const t='2. Termination. The notice period is 60 days.\n3. Governing law. The notice period for law changes is 90 days.';
 const r=run('The notice period is 45 days [S1].','notice period',t);assert(!/45/.test(r.answer.replace(/\[S1\]/,'')));const rep=r.replaced[0];assert(rep.clauseStatus==='ambiguous'||!/Governing/.test(r.answer),r.answer)}
// 6 oversize clause fails closed, no partial quote shown as whole
{const filler=Array.from({length:60},(_,i)=>'Detail '+i+' of the notice period applies here.').join(' ');
 const t='2. Termination. The notice period is 60 days. '+filler;const r=run(bad,'notice period',t);assert(!/Exact text from the document/.test(r.answer)&&/Review the source/.test(r.answer),r.answer);assert(r.replaced[0].quote==='')}
// 7 multiple conflicting clauses -> fail closed
{const t='4. Termination A. The notice period is 60 days for the supplier.\n5. Termination B. The notice period is 30 days for the buyer.';
 const r=run('The notice period is 45 days [S1].','notice period',t);assert(!/Exact text from the document/.test(r.answer)&&/Review the source/.test(r.answer),r.answer)}
// 8 unnumbered single paragraph is one clause: whole paragraph incl. qualifier
{const t='The notice period is 60 days. It is reduced if the buyer pays early.\nFees are monthly.';const r=run(bad,'notice period',t);assert(/retrieved passage only/.test(r.answer),r.answer)}
// 9 Arabic negation/exception kept whole
{const t='1. \u0627\u0644\u0645\u062f\u0629. \u0645\u062f\u0629 \u0627\u0644\u0639\u0642\u062f \u0633\u0646\u0629.\n2. \u0627\u0644\u0625\u0646\u0647\u0627\u0621. \u0644\u0627 \u064a\u062c\u0648\u0632 \u0627\u0644\u0625\u0646\u0647\u0627\u0621 \u0625\u0644\u0627 \u0628\u0625\u0634\u0639\u0627\u0631 \u0645\u062f\u062a\u0647 60 \u064a\u0648\u0645\u0627\u064b. \u0648\u0644\u0627 \u064a\u0646\u0637\u0628\u0642 \u0630\u0644\u0643 \u0639\u0644\u0649 \u062d\u0627\u0644\u0629 \u0627\u0644\u063a\u0634.\n3. \u0627\u0644\u0631\u0633\u0648\u0645. \u0634\u0647\u0631\u064a\u0629.';
 const r=run('\u064a\u062c\u0648\u0632 \u0627\u0644\u0625\u0646\u0647\u0627\u0621 \u0628\u0634\u0643\u0644 \u0645\u0637\u0644\u0642 \u0628\u062f\u0648\u0646 \u0625\u0634\u0639\u0627\u0631 [S1].','\u0627\u0644\u0625\u0646\u0647\u0627\u0621 \u0625\u0634\u0639\u0627\u0631',t);assert(/\u062d\u0627\u0644\u0629 \u0627\u0644\u063a\u0634/.test(r.answer)&&!/\u0627\u0644\u0631\u0633\u0648\u0645/.test(r.answer),r.answer)}
const W=/retrieved passage only/;
// 10 source ends mid-clause (chunk cut): never labelled whole
{const t='1. Term. 12 months.\n2. Termination. The notice period is 60 days. Exception: none applies except';const r=run(bad,'notice period',t);assert(W.test(r.answer)&&r.replaced[0].clauseStatus==='open',r.answer)}
// 11 exception sits in the next chunk (retrieved text stops right after clause end, no closing start)
{const t='2. Termination. The notice period is 60 days.';const r=run(bad,'notice period',t);assert(W.test(r.answer)&&r.replaced[0].quote==='',r.answer)}
// 12 Arabic-Indic numbered starts, closed clause is whole
{const t='\u0661. \u0627\u0644\u0645\u062f\u0629. \u0633\u0646\u0629.\n\u0662. \u0627\u0644\u0625\u0646\u0647\u0627\u0621. \u0645\u062f\u0629 \u0627\u0644\u0625\u0634\u0639\u0627\u0631 60 \u064a\u0648\u0645\u0627\u064b. \u0625\u0644\u0627 \u0641\u064a \u062d\u0627\u0644\u0629 \u0627\u0644\u063a\u0634.\n\u0663. \u0627\u0644\u0631\u0633\u0648\u0645. \u0634\u0647\u0631\u064a\u0629.';const r=run('\u0645\u062f\u0629 \u0627\u0644\u0625\u0634\u0639\u0627\u0631 \u0623\u0633\u0628\u0648\u0639 [S1].','\u0645\u062f\u0629 \u0627\u0644\u0625\u0634\u0639\u0627\u0631',t);assert(/\u062d\u0627\u0644\u0629 \u0627\u0644\u063a\u0634/.test(r.answer)&&!/\u0627\u0644\u0631\u0633\u0648\u0645/.test(r.answer)&&!W.test(r.answer)&&!/\u0644\u0645 \u064a\u062a\u0645/.test(r.answer),r.answer)}
// 13 decimal multilevel: sub-clauses 2.1 and 2.2 belong to clause 2, exception in 2.2 is kept; clause 3 excluded
{const t='2. Termination.\n2.1 The notice period is 60 days.\n2.2 Except for fraud, where no notice is needed.\n3. Fees. Monthly.';const r=run(bad,'notice period',t);assert(/Except for fraud/.test(r.answer)&&!/Fees/.test(r.answer)&&!W.test(r.answer),r.answer)}
// 14 unnumbered paragraph is only the retrieved passage, never claimed as the complete clause
{const t='The notice period is 60 days. It is reduced if the buyer pays early.\nFees are monthly.';const r=run(bad,'notice period',t);assert(W.test(r.answer)&&r.replaced[0].quote==='',r.answer)}
console.log('whole_clause ok');
