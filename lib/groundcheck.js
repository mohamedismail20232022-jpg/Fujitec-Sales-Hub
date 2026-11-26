'use strict';
// Labelled-total check. A number that appears in a cited passage is not thereby a "total". When the question or answer speaks of a total and the
// passages contain a figure explicitly labelled as the total (total / grand total / \u0625\u062c\u0645\u0627\u0644\u064a / \u0627\u0644\u0645\u062c\u0645\u0648\u0639), any other passage figure the answer presents
// is reported as a conflict for the user to resolve. It does not decide which figure is right.
const NUM=/\d{1,3}(?:[,\u00a0\u202f\u066c ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g,norm=s=>String(s).replace(/[,\u00a0\u202f\u066c ]/g,'');
const LABEL=/(?:grand total|total|\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a|\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0627\u062c\u0645\u0627\u0644\u064a|\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a|\u0627\u0644\u0627\u062c\u0645\u0627\u0644\u064a|\u0625\u062c\u0645\u0627\u0644\u064a|\u0627\u0644\u0645\u062c\u0645\u0648\u0639)[^\d\n]{0,25}(\d{1,3}(?:[,\u00a0\u202f\u066c ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi;
const TOTALQ=/total|grand|\u0625\u062c\u0645\u0627\u0644|\u0627\u062c\u0645\u0627\u0644|\u0645\u062c\u0645\u0648\u0639/i;
const AD=s=>String(s).replace(/[\u0660-\u0669]/g,d=>d.charCodeAt(0)-0x660).replace(/[\u06F0-\u06F9]/g,d=>d.charCodeAt(0)-0x6F0).replace(/\u066B/g,'.').replace(/\u066C/g,',');
const isAr=s=>/[\u0600-\u06ff]/.test(String(s));
const numsOf=t=>(AD(t).match(NUM)||[]).map(norm);
function labelledTotals(passages){const s=new Set();for(const p of passages){let m;LABEL.lastIndex=0;while((m=LABEL.exec(AD(p))))s.add(norm(m[1]))}return s}
function where(passages,n,labelledOnly){const o=[];passages.forEach((p,i)=>{if(labelledOnly){let m;LABEL.lastIndex=0;while((m=LABEL.exec(AD(p))))if(norm(m[1])===n){o.push(i);break}}else if(numsOf(p).includes(n))o.push(i)});return o}
function check(question,answer,passages,extra){const a=AD(answer).replace(/\[[^\]\n]*![^\]\n]*\]/g,' ').replace(/\[\s*S\d+(?:\s*[,;]\s*S\d+)*\s*\]/g,' ').replace(/^\s*\d+[.)]\s/gm,' ');
  if(!TOTALQ.test(question)&&!TOTALQ.test(a))return {conflict:false};
  const lab=labelledTotals(passages);if(!lab.size)return {conflict:false};
  const ex=(extra||[]).map(v=>norm(AD(String(v))));const support=new Set([...passages.flatMap(numsOf),...ex]);const ans=[...new Set(numsOf(a))];
  const other=ans.filter(n=>!lab.has(n)&&support.has(n));
  const pickedSome=lab.size>1&&ans.some(n=>lab.has(n))&&ans.filter(n=>lab.has(n)).length<lab.size;
  if(!other.length&&!pickedSome)return {conflict:false};
  const ar=isAr(question);const L=[...lab].join(', '),O=other.join(', ');
  return {conflict:true,reason:other.length?'other_figure':'one_of_several_labelled',labelled:[...lab],answered:other,labelledAt:Object.fromEntries([...lab].map(n=>[n,where(passages,n,true)])),otherAt:Object.fromEntries(other.map(n=>[n,where(passages,n,false)])),otherFromCalc:other.filter(n=>ex.includes(n)),note:ar?'[\u062a\u0636\u0627\u0631\u0628 \u0641\u064a \u0627\u0644\u062a\u0623\u0643\u064a\u062f: '+L+']':'[Grounding conflict: labelled totals '+L+(O?'; answer states '+O:'; answer picks only some of them')+']'}}
module.exports={check,labelledTotals,where};
