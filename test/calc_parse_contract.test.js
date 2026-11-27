'use strict';
// Held-out parse contract. Accepted formats must be exact; anything else must abstain (null), never guess.
const calc=require('../lib/calc');let bad=0,n=0;
const ok=[['−1,234',-1234],['SAR -1,234',-1234],['-SAR 1,234',-1234],['1234 SAR',1234],['SAR1,234.5',1234.5],['(1,234.50)',-1234.5],['(SAR 1,234)',-1234],['$-5',-5],['€ 1 234.50',1234.5],['١٬٢٣٤٫٥٠',1234.5],['-٣٤٥',-345],['٣٤٥ ر.س',345],['1,234,567',1234567],['0.5',0.5],['-0.5',-0.5],[' 12 ',12],['(−5)',-5],[1.5,1.5],[-3,-3]];
const abstain=['1.234,50','12,5','0,5','1 234,50','1,2,3','1,23,456','1,234−','1234-','5-','--5','+5','1e3','','abc','12abc','1,,234','1,23','١٢٫٥٬٣','- 5 -'];
for(const [i,e] of ok){n++;const g=calc.num(i);if(g!==e){bad++;console.log('WRONG',JSON.stringify(i),g,'expected',e)}}
for(const i of abstain){n++;const g=calc.num(i);if(g!==null){bad++;console.log('NOT ABSTAINED',JSON.stringify(i),g)}}
console.log(n+' checks, '+bad+' failures');process.exit(bad?1:0);
