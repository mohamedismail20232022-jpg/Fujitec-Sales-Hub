// Holdout written AFTER the rules were frozen (support.js at commit with uncited enforcement). Mock only. Reports misses honestly; exit 1 on any miss.
const S=require('../lib/support');
const A='Services Agreement 1. Fees. The Client shall pay a monthly fee of SAR 12,000. Fees are due on the first day of each month. 2. Term. The agreement runs for 24 months and renews automatically for 12 months unless either party gives 90 days notice. 3. Confidentiality. Each party shall keep the other party information confidential for 5 years after termination. 4. Support. The Supplier provides support on working days from 9am to 5pm. 5. Penalty. A penalty of 0.5% of the monthly fee applies for each day of delay.';
const B='Addendum 1. Fees. From January the monthly fee is SAR 13,500. 2. Support. Support is extended to Saturdays.';
const AR='عقد خدمات 1. الرسوم: يدفع العميل رسماً شهرياً قدره 12,000 ريال. 2. المدة: مدة العقد 24 شهراً وتتجدد تلقائياً لمدة 12 شهراً ما لم يخطر أحد الطرفين الآخر قبل 90 يوماً. 3. السرية: يلتزم كل طرف بسرية معلومات الطرف الآخر لمدة 5 سنوات بعد انتهاء العقد. 4. الدعم: يقدم المورد الدعم في أيام العمل من 9 صباحاً إلى 5 مساءً.';
const P1=[{id:'S1',text:A}];
// [kept?, answer, question, passages]
const C=[
[1,'The monthly fee is SAR 12,000 [S1].','What is the monthly fee?',P1],
[0,'The monthly fee is SAR 12,000, payable quarterly [S1].','What is the monthly fee?',P1],
[0,'The monthly fee is SAR 12,000, payable quarterly.','What is the monthly fee?',P1],            // uncited unsupported
[1,'The monthly fee is SAR 12,000.','What is the monthly fee?',P1],                                  // uncited supported (gets a server citation)
[0,'The agreement runs for 24 months and renews for 24 months [S1].','What is the term?',P1],        // number swap
[0,'The agreement runs for 24 months and renews for 24 months.','What is the term?',P1],
[1,'The agreement runs for 24 months and renews automatically for 12 months unless notice is given [S1].','What is the term?',P1],
[0,'The agreement ends automatically after 24 months [S1].','What is the term?',P1],                 // negation of auto-renewal
[0,'Either party must give 30 days notice [S1].','How much notice is needed?',P1],
[1,'Either party must give 90 days notice [S1].','How much notice is needed?',P1],
[0,'The Supplier keeps the information confidential for 5 years after signing [S1].','How long does confidentiality last?',P1], // order/anchor
[1,'Each party keeps the other party information confidential for 5 years after termination [S1].','How long does confidentiality last?',P1],
[0,'Support is available 24/7 [S1].','When is support available?',P1],
[0,'Support is available 24/7.','When is support available?',P1],
[1,'Support is provided on working days from 9am to 5pm [S1].','When is support available?',P1],
[0,'The penalty is 0.5% of the annual fee for each day of delay [S1].','What is the penalty?',P1],
[1,'The penalty is 0.5% of the monthly fee for each day of delay [S1].','What is the penalty?',P1],
[0,'It must be paid on the last day of the month [S1].','When are fees due?',P1],                      // pronoun claim
[1,'Fees are due on the first day of each month [S1].','When are fees due?',P1],
// multi-source: answer attributes addendum fee to the wrong source / mixes
[0,'The monthly fee is SAR 13,500 [S1].','What is the monthly fee?',[{id:'S1',text:A},{id:'S2',text:B}]],
[1,'The monthly fee is SAR 13,500 [S2].','What is the monthly fee?',[{id:'S1',text:A},{id:'S2',text:B}]],
[0,'The monthly fee is SAR 12,000 [S1], and support covers Saturdays [S1].','What are the fee and support days?',[{id:'S1',text:A},{id:'S2',text:B}]],
// Arabic cited / uncited / mixed language
[1,'يدفع العميل رسماً شهرياً قدره 12,000 ريال [S1].','كم الرسوم الشهرية؟',[{id:'S1',text:AR}]],
[0,'يدفع العميل رسماً شهرياً قدره 12,000 ريال تدفع ربع سنوياً [S1].','كم الرسوم الشهرية؟',[{id:'S1',text:AR}]],
[0,'يدفع العميل رسماً شهرياً قدره 12,000 ريال تدفع ربع سنوياً.','كم الرسوم الشهرية؟',[{id:'S1',text:AR}]],
[0,'مدة العقد 36 شهراً [S1].','ما مدة العقد؟',[{id:'S1',text:AR}]],
[0,'مدة السرية 10 سنوات بعد انتهاء العقد [S1].','ما مدة السرية؟',[{id:'S1',text:AR}]],
[1,'يلتزم كل طرف بسرية معلومات الطرف الآخر لمدة 5 سنوات بعد انتهاء العقد [S1].','ما مدة السرية؟',[{id:'S1',text:AR}]],
[0,'The monthly fee is 12,000 riyals, payable monthly [S1].','ما الرسوم الشهرية؟',[{id:'S1',text:AR}]], // English answer, Arabic source: cross-language, quote only
// citation-fragment and list forms
[1,'1. The monthly fee is SAR 12,000. [S1]','What is the monthly fee?',P1],
[0,'1. The monthly fee is SAR 15,000. [S1]','What is the monthly fee?',P1],
[1,'The late penalty is described in the agreement. Do you want the exact rate?','What is the penalty?',P1], // non-claims untouched
];
let kOK=0,kN=0,cOK=0,cN=0;const bad=[];
for(const [k,a,q,ps] of C){const r=S.enforce(a,q,ps,{all:ps}),kept=!r.replaced.length;if(k){kN++;kept?kOK++:bad.push('FALSE-ABSTAIN: '+a)}else{cN++;!kept?cOK++:bad.push('MISSED: '+a)}}
console.log('holdout (mock): legit kept '+kOK+'/'+kN+'; unsupported caught '+cOK+'/'+cN);
if(bad.length){console.error(bad.join('\n'));process.exit(1)}
