// Compound sentences citing several passages, and near-adjacent wording. Mock only, held-out written after the change. Exit 1 on any miss.
const S=require('../lib/support');
const P=[{id:'S1',text:'Price List 1. Items. Lift | 9000. Escalator | 15000.'},{id:'S2',text:'Payment Terms 1. Payment. Payment is due in 30 days from the invoice date. 2. Delay. Late payment carries a 2% charge.'}];
const q='What is the cost of the Lift and the payment term?';
const C=[
[1,'The Lift costs 9000 [S1] and payment is due in 30 days [S2].',q],
[1,'The Lift costs 9000 and payment is due in 30 days [S1, S2].',q],
[1,'Lift is 9000, payment is due in 30 days [S1, S2].',q],
[0,'The Lift costs 9000 and payment is due in 60 days [S1, S2].',q],
[0,'The Lift costs 19000 and payment is due in 30 days [S1, S2].',q],
[0,'The Lift costs 9000 and payment is due in 30 days with free installation [S1, S2].',q],
[0,'The Escalator costs 9000 and payment is due in 30 days [S1, S2].',q],
[0,'The Lift costs 15000 [S1].','How much is the Lift?'],
[1,'The Escalator is 15000 [S1].','How much is the Escalator?'],
[1,'Lift | 9000 [S1].','How much is the Lift?'],
[0,'The Lift costs 9000 and a 5% discount applies [S1, S2].',q],
[0,'Lift 9000 and payment due 30 days [S1].',q], // single cite: both clauses must sit in S1, they do not
[1,'Late payment carries a 2% charge [S2].','What is the late payment charge?'],
[0,'Late payment carries a 5% charge [S2].','What is the late payment charge?'],
];
let ok=0,n=0;const bad=[];
for(const [k,a,qq] of C){n++;const r=S.enforce(a,qq,P,{all:P}),kept=!r.replaced.length;(k?kept:!kept)?ok++:bad.push((k?'FALSE-ABSTAIN: ':'MISSED: ')+a)}
console.log('compound (mock): '+ok+'/'+n+' as expected');
if(bad.length){console.error(bad.join('\n'));process.exit(1)}
