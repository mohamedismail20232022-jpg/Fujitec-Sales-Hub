const S=require('../lib/support');
const en='Supply Agreement 1. Payment. The Buyer shall pay each invoice within 45 days of the delivery date. 2. Deposit. A deposit of 20% of the contract price is due on signing. 3. Delivery. The Seller shall deliver the equipment within 90 days of signing. 4. Warranty. The equipment carries a warranty of 12 months from commissioning. 5. Late fee. Late payments incur a fee of 1.5% per month. 6. Termination. Either party may terminate with 60 days written notice. 7. Liability. The Seller liability is limited to the contract price. 8. Governing law. This agreement is governed by the laws of the Kingdom of Saudi Arabia.';
const ar='1. الدفع: يلتزم المشتري بسداد كل فاتورة خلال 45 يوماً من تاريخ التسليم. 2. الدفعة المقدمة: تستحق دفعة مقدمة بنسبة 20% من قيمة العقد عند التوقيع. 3. التسليم: يلتزم البائع بالتسليم خلال 90 يوماً من تاريخ التوقيع. 4. الضمان: تشمل المعدات ضماناً لمدة 12 شهراً من تاريخ التشغيل. 5. غرامة التأخير: تُفرض غرامة تأخير بنسبة 1.5% شهرياً. 6. الإنهاء: يجوز لأي طرف إنهاء العقد بإشعار كتابي مدته 60 يوماً. 7. المسؤولية: تقتصر مسؤولية البائع على قيمة العقد.';
// [expectKept?, answer, question, text]
const C=[
[1,'Payment is due in 45 days from the delivery date [S1].','What is the payment term?',en],
[1,'The payment term is 45 days of the delivery date. [S1]','What is the payment term?',en],
[1,'The Buyer must pay each invoice within 45 days of the delivery date [S1].','When must the buyer pay?',en],
[0,'Payment is due within 45 days from the invoice date [S1].','What is the payment term?',en],
[0,'Payment is due 45 days after the invoice is received [S1].','What is the payment term?',en],
[1,'The warranty period is 12 months from commissioning. [S1]','How long is the warranty?',en],
[0,'The warranty lasts 12 months from delivery [S1].','How long is the warranty?',en],
[0,'The warranty is 12 months from commissioning and covers spare parts [S1].','How long is the warranty?',en],
[1,'The late fee is 1.5 % per month [S1].','What is the late fee?',en],
[0,'The late fee is 1.5% per month, capped at 10% [S1].','What is the late fee?',en],
[1,'Either party can terminate with 60 days written notice [S1].','Can the contract be terminated?',en],
[0,'Either party can terminate with 60 days written notice by registered mail [S1].','Can the contract be terminated?',en],
[0,'Only the Buyer can terminate with 60 days written notice [S1].','Can the contract be terminated?',en],
[1,'The agreement is governed by the laws of the Kingdom of Saudi Arabia [S1].','What law governs?',en],
[0,'The agreement is governed by the laws of Egypt [S1].','What law governs?',en],
[1,'The deposit is 20% of the contract price, due on signing [S1].','What is the deposit?',en],
[0,'The deposit is 20% of the contract price, due on delivery [S1].','What is the deposit?',en],
[1,'The Seller must deliver within 90 days of signing [S1].','What is the delivery time?',en],
[0,'The Seller must deliver within 90 days of the deposit payment [S1].','What is the delivery time?',en],
[1,'مدة السداد هي 45 يوماً من تاريخ التسليم. [S1]','ما هي مدة السداد؟',ar],
[0,'مدة السداد هي 45 يوماً من تاريخ الفاتورة. [S1]','ما هي مدة السداد؟',ar],
[1,'نسبة غرامة التأخير هي 1.5 % شهرياً [S1].','كم نسبة غرامة التأخير؟',ar],
[0,'نسبة غرامة التأخير 1.5 % شهرياً بحد أقصى 10% [S1].','كم نسبة غرامة التأخير؟',ar],
[1,'الضمان 12 شهراً من تاريخ التشغيل [S1]','كم مدة الضمان؟',ar],
[0,'الضمان 12 شهراً من تاريخ التسليم [S1]','كم مدة الضمان؟',ar],
[0,'الضمان 12 شهراً من تاريخ التشغيل ويشمل قطع الغيار [S1]','كم مدة الضمان؟',ar],
[1,'يجوز لأي طرف إنهاء العقد بإشعار كتابي مدته 60 يوماً [S1]','هل يمكن إنهاء العقد؟',ar],
[0,'يجوز للمشتري فقط إنهاء العقد بإشعار كتابي مدته 60 يوماً [S1]','هل يمكن إنهاء العقد؟',ar],
];
let keptOK=0,keptN=0,catchOK=0,catchN=0;const bad=[];
for(const [k,a,q,t] of C){const r=S.enforce(a,q,[{id:'S1',text:t}]),kept=!r.replaced.length;if(k){keptN++;if(kept)keptOK++;else bad.push('FALSE-ABSTAIN: '+a)}else{catchN++;if(!kept)catchOK++;else bad.push('MISSED: '+a)}}
console.log('faithfulness regression (mock, own authored cases): legit kept '+keptOK+'/'+keptN+'; unsupported caught '+catchOK+'/'+catchN);if(bad.length){console.error(bad.join('\n'));process.exit(1)}
{ // list markers must not become separate "uncited sentences"
  const r=S.enforce('1. The monthly fee is SAR 12,000. [S1]\n2. Support is extended to Saturdays. [S1]\n- The late fee is 1.5% per month [S1]','Terms?',[{id:'S1',text:en+' SAR 12,000 monthly fee. Support is extended to Saturdays.'}]);
  if(/sentence removed|\u062a\u0645 \u062d\u0630\u0641/.test(r.answer)&&r.replaced.some(x=>x.uncited&&/^\d?\.?$/.test(x.original))){console.error('LIST MARKER BUG',JSON.stringify(r.replaced));process.exit(1)}
}
