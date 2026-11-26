'use strict';
// Labelled-total check. A number that appears in a cited passage is not thereby a "total". When the question or answer speaks of a total and the
// passages contain a figure explicitly labelled as the total (total / grand total / \u0625\u062c\u0645\u0627\u0644\u064a / \u0627\u0644\u0645\u062c\u0645\u0648\u0639), any other passage figure the answer presents
// is reported as a conflict for the user to resolve. It does not decide which figure is right.
const NUM=/\d{1,3}(?:[,\u00a0\u202f\u066c ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g,norm=s=>String(s).replace(/[,\u00a0\u202f\u066c ]/g,'');
const LABEL=/(?:grand total|total|\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a|\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0627\u062c\u0645\u0627\u0644\u064a|\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a|\u0627\u0644\u0627\u062c\u0645\u0627\u0644\u064a|\u0625\u062c\u0645\u0627\u0644\u064a|\u0627\u0644\u0645\u062c\u0645\u0648\u0639)[^\d\n]{0,25}(\d{1,3}(?:[,\u00a0\u202f\u066c ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi;
const TOTALQ=/total|grand|\u0625\u062c\u0645\u0627\u0644|\u0627\u062c\u0645\u0627\u0644|\u0645\u062c\u0645\u0648\u0639/i;
const isAr=s=>/[\u0600-\u06ff]/.test(String(s));
function labelledTotals(passages){const s=new Set();for(const p of passages){let m;LABEL.lastIndex=0;while((m=LABEL.exec(String(p))))s.add(norm(m[1]))}return s}
function where(passages,n,labelledOnly){const o=[];passages.forEach((p,i)=>{if(labelledOnly){let m;LABEL.lastIndex=0;while((m=LABEL.exec(String(p))))if(norm(m[1])===n){o.push(i);break}}else if(norm(p).includes(n))o.push(i)});return o}
function check(question,answer,passages,extra){const a=String(answer).replace(/\[[^\]\n]*![^\]\n]*\]/g,' ').replace(/\[\s*S\d+(?:\s*[,;]\s*S\d+)*\s*\]/g,' ').replace(/^\s*\d+[.)]\s/gm,' ');
  if(!TOTALQ.test(question)&&!TOTALQ.test(a))return {conflict:false};
  const lab=labelledTotals(passages);if(!lab.size)return {conflict:false};
  const hay=passages.map(norm).concat((extra||[]).map(v=>norm(String(v)))).join(' ');const ans=[...new Set((a.match(NUM)||[]).map(norm))];
  const other=ans.filter(n=>!lab.has(n)&&hay.includes(n));if(!other.length)return {conflict:false};
  const ar=isAr(question);const L=[...lab].join(', '),O=other.join(', ');
  return {conflict:true,labelled:[...lab],answered:other,labelledAt:Object.fromEntries([...lab].map(n=>[n,where(passages,n,true)])),otherAt:Object.fromEntries(other.map(n=>[n,where(passages,n,false)])),otherFromCalc:other.filter(n=>(extra||[]).some(v=>norm(String(v))===n)),note:ar?'[\u062a\u0636\u0627\u0631\u0628 \u0641\u064a \u0627\u0644\u062a\u0623\u0643\u064a\u062f: \u0627\u0644\u0645\u0633\u062a\u0646\u062f \u064a\u0635\u0641 '+L+' \u0643\u0625\u062c\u0645\u0627\u0644\u064a\u060c \u0644\u0643\u0646 \u0627\u0644\u0625\u062c\u0627\u0628\u0629 \u0630\u0643\u0631\u062a '+O+' \u0648\u0647\u0648 \u0645\u0648\u062c\u0648\u062f \u0641\u064a \u0627\u0644\u0645\u0642\u0627\u0637\u0639 \u062f\u0648\u0646 \u0648\u0635\u0641 \u0625\u062c\u0645\u0627\u0644\u064a. \u0631\u0627\u062c\u0639 \u0627\u0644\u0645\u0635\u062f\u0631 \u0642\u0628\u0644 \u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f.]':'[Grounding conflict: the document labels '+L+' as a total, but the answer states '+O+', which appears in the passages without a total label (for example a table cell). The server cannot tell which figure applies; check the source before relying on it.]'}}
module.exports={check,labelledTotals,where};
