'use strict';
// Wording-support check (bounded heuristic, not a fact checker): content words in an answer sentence that cite a passage but do not occur in that
// passage or the question are listed, and the passage's closest sentence is quoted verbatim. Only runs when answer and passage use the same script.
const AR=/[\u0600-\u06ff]/,isAr=s=>AR.test(s);
const STOP=new Set('that this with from which have been will shall would could their there these those about document documents file files states stated says said according provided mentioned also into than then them they what when where while does your more most only such other each some any are was were the and for not but can its has had'.split(' '));
const norm=s=>String(s).toLowerCase().replace(/[\u064b-\u0652\u0640]/g,'').replace(/[\u0623\u0625\u0622]/g,'\u0627').replace(/\u0629/g,'\u0647').replace(/\u0649/g,'\u064a');
function stem(w){w=norm(w);if(AR.test(w)){w=w.replace(/^(\u0648|\u0641)?(\u0627\u0644|\u0628|\u0644|\u0643)/,'').replace(/(\u0647\u0627|\u0647|\u0627\u062a|\u0648\u0646|\u064a\u0646|\u064a)$/,'');return w}return w.replace(/(ing|ed|es|s|ly)$/,'')}
const words=t=>(norm(t).replace(/\[[^\]]*\]/g,' ').match(/[a-z\u0600-\u06ff]+/g)||[]).filter(w=>w.length>=(AR.test(w)?3:4)&&!STOP.has(w));
function ansSentences(a){const r=String(a).split(/(?<=[.!?\u061f\n])\s+|\n+/).filter(x=>x.trim());const o=[];for(const x of r){if(/^\s*(\[[^\]]*\]\s*)+[.!?]?\s*$/.test(x)&&o.length)o[o.length-1]+=' '+x;else o.push(x)}return o}
const letters=(t,ar)=>(String(t).match(ar?/[\u0600-\u06ff]/g:/[a-zA-Z]/g)||[]).length;
function sentences(t){return String(t).split(/(?<=[.!?\u061f\n])\s+|\n+/).map(s=>s.trim()).filter(Boolean)}
function check(answer,question,passages){ // passages: [{id,text}] for the cited sources only
  const out=[];const q=new Set(words(question).map(stem));
  for(const p of passages){const AA=isAr(answer),same=sentences(p.text).filter(l=>letters(l,AA)>=3&&letters(l,AA)>=letters(l,!AA));if(!same.length){const cited=ansSentences(answer).filter(s=>new RegExp('\\[[^\\]]*\\b'+p.id+'\\b').test(s));const dg=new Set((cited.join(' ').match(/\d+(?:[.,]\d+)?/g)||[]));let best='',bs=-1;for(const t of sentences(p.text)){const n=(t.match(/\d+(?:[.,]\d+)?/g)||[]).filter(x=>dg.has(x)).length;if(n>bs){bs=n;best=t}}if(cited.length)out.push({id:p.id,crossLang:true,quote:best.slice(0,300)});continue}
    const ps=new Set(words(same.join(' ')).map(stem));const key=[...ps].map(w=>w.slice(0,5));
    const sup=w=>{const s=stem(w);return ps.has(s)||key.some(k=>k.length>=3&&s.slice(0,5)===k)};
    const cited=ansSentences(answer).filter(s=>new RegExp('\\[[^\\]]*\\b'+p.id+'\\b').test(s));
    const aw=[...new Set(words(cited.join(' ')))],bad=aw.filter(w=>!sup(w));
    if(aw.length&&bad.length===aw.length&&same.length<=sentences(p.text).length-same.length){let bq='',bn=-1;const dg=new Set((cited.join(' ').match(/\d+(?:[.,]\d+)?/g)||[]));for(const t of sentences(p.text)){const n=(t.match(/\d+(?:[.,]\d+)?/g)||[]).filter(x=>dg.has(x)).length;if(n>bn){bn=n;bq=t}}out.push({id:p.id,crossLang:true,quote:bq.slice(0,300)});continue}
    if(bad.length){const A=new Set(aw.map(stem));let best='',bs=-1;for(const s of sentences(p.text)){const n=words(s).filter(w=>A.has(stem(w))).length;if(n>bs){bs=n;best=s}}out.push({id:p.id,unsupported:bad.slice(0,8),quote:best.slice(0,300)})}}
  return out}
module.exports={check};
