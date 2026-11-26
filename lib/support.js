'use strict';
// Wording-support check (bounded heuristic, not a fact checker): content words in an answer sentence that cite a passage but do not occur in that
// passage or the question are listed, and the passage's closest sentence is quoted verbatim. Only runs when answer and passage use the same script.
const AR=/[\u0600-\u06ff]/,isAr=s=>AR.test(s);
const STOP=new Set('that this with from which have been will shall would could their there these those about document documents file files states stated says said according provided mentioned also into than then them they what when where while does your more most only such other each some any are was were the and for not but can its has had'.split(' '));
const norm=s=>String(s).toLowerCase().replace(/[\u060c\u061b\u061f]/g,' ').replace(/[\u064b-\u0652\u0640]/g,'').replace(/[\u0623\u0625\u0622]/g,'\u0627').replace(/\u0629/g,'\u0647').replace(/\u0649/g,'\u064a');
function stem(w){w=norm(w);if(AR.test(w)){w=w.replace(/^(\u0648|\u0641)?(\u0627\u0644|\u0628|\u0644|\u0643)/,'').replace(/(\u0647\u0627|\u0647|\u0627\u062a|\u0648\u0646|\u064a\u0646|\u064a)$/,'');return w}return w.replace(/(ing|ed|es|s|ly)$/,'')}
const words=t=>(norm(t).replace(/\[[^\]]*\]/g,' ').match(/[a-z\u0600-\u06ff]+/g)||[]).filter(w=>w.length>=(AR.test(w)?3:4)&&!STOP.has(w));
function ansSentences(a){const r=String(a).split(/(?<=[.!?\u061f\n])\s+|\n+/).filter(x=>x.trim());const o=[];for(const x of r){if(/^\s*(\[[^\]]*\]\s*)+[.!?]?\s*$/.test(x)&&o.length)o[o.length-1]+=' '+x;else o.push(x)}return o}
const letters=(t,ar)=>(String(t).match(ar?/[\u0600-\u06ff]/g:/[a-zA-Z]/g)||[]).length;
function sentences(t){const r=String(t).split(/(?<=[.!?\u061f\n])\s+|\n+/).map(s=>s.trim()).filter(Boolean),o=[];for(let i=0;i<r.length;i++){if(/^\d{1,2}[.)]$/.test(r[i])&&i+1<r.length){r[i+1]=r[i]+' '+r[i+1]}else o.push(r[i])}return o}
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
// ---- Enforcement (replaces the warning-only check): a cited prose sentence whose wording is not supported by its cited passage is NOT shown;
// the verbatim passage sentence is shown instead under a server-written label. Bounded rules, not a general fact checker:
//  - same-language sentence: every content word (minus question words and a small generic list) must occur in the best-matching passage sentence (+ the next one);
//  - cross-language sentence (answer language differs from passage): cannot be machine-checked, so only the verbatim quote is shown;
//  - sentences without [S#], code, tables, headings, and the server calculation block are left alone.
const GENERIC=new Set('period duration length time rate percent percentage total sum amount number value count average per each term terms clause section list below above following example based total totals result results answer yes none'.split(' '));
const hasCite=s=>/\[S\d+(?:\s*,\s*S\d+)*\]/.test(s),citeIds=s=>[...new Set((s.match(/S\d+/g)||[]))];
function bestWindow(sent,text){const A=new Set(words(sent).map(stem)),N=new Set((sent.replace(/(\d),(?=\d{3})/g,'$1').match(/\d+(?:\.\d+)?/g)||[]));const ss=sentences(text);let bi=-1,bs=-1;ss.forEach((t,i)=>{const n=words(t).filter(w=>A.has(stem(w))).length+3*(t.replace(/(\d),(?=\d{3})/g,'$1').match(/\d+(?:\.\d+)?/g)||[]).filter(x=>N.has(x)).length;if(n>bs){bs=n;bi=i}});if(bi<0)return null;return {quote:ss[bi],win:ss[bi]+' '+(ss[bi+1]||'')}}
function enforce(answer,question,passages,opt={}){const byId=Object.fromEntries(passages.map(p=>[p.id,p.text]));const Q=new Set(words(question).map(stem)),ar=isAr(question),replaced=[];
  const ALL=(opt.all&&opt.all.length?opt.all:passages);
  const ABST=/\b(do(es)? not|did not|cannot|can't|unable|no (information|mention|provision|clause)|not (state|stated|specif|mention|contain|provid|found|include))|\u0644\u0627 (\u062a\u0630\u0643\u0631|\u064a\u0630\u0643\u0631|\u062a\u062d\u062a\u0648\u064a|\u064a\u0648\u062c\u062f|\u062a\u0648\u062c\u062f|\u0623\u062c\u062f|\u0623\u0633\u062a\u0637\u064a\u0639|\u064a\u0645\u0643\u0646)|\u0644\u0645 (\u064a\u0631\u062f|\u0623\u062c\u062f|\u062a\u0631\u062f)|\u063a\u064a\u0631 (\u0645\u0630\u0643\u0648\u0631|\u0645\u0648\u062c\u0648\u062f)/i;
  const supportedBy=(body,t)=>{const sa=isAr(body);const bw=bestWindow(body,t);if(!bw)return false;const pas=sentences(t).filter(l=>letters(l,sa)>=3&&letters(l,sa)>=letters(l,!sa));if(!pas.length)return false;const bw2=bestWindow(body,pas.join('\n'));if(!bw2)return false;
    const ps=words(bw2.win).map(stem),key=ps.map(w=>w.slice(0,5));const sup=w=>{const x=stem(w);return ps.includes(x)||key.some(k=>k.length>=3&&x.slice(0,5)===k)};
    const bad=[...new Set(words(body))].filter(w=>!Q.has(stem(w))&&!GENERIC.has(w)&&!sup(w));const nums=(body.match(/\d+(?:[.,]\d+)?/g)||[]).filter(n=>!bw2.win.replace(/,/g,'').includes(n.replace(/,/g,'')));
    const tk=t=>(norm(t).replace(/\[[^\]]*\]/g,' ').match(/[a-z\u0600-\u06ff]+|\d+(?:\.\d+)?/g)||[]).filter(w=>/\d/.test(w)||(w.length>=(AR.test(w)?3:4)&&!STOP.has(w))).map(w=>/\d/.test(w)?w:stem(w).slice(0,5));
    const ws=tk(bw2.win),pairs=new Set();for(let i=0;i+1<ws.length;i++){pairs.add(ws[i]+'|'+ws[i+1]);pairs.add(ws[i+1]+'|'+ws[i])}
    const as=tk(body),qk=new Set([...Q].map(x=>x.slice(0,5))),gk=new Set([...GENERIC].map(x=>stem(x).slice(0,5)));const skipW=w=>qk.has(w)||gk.has(w);
    for(let i=0;i+1<as.length;i++){if(skipW(as[i])||skipW(as[i+1])||/\d/.test(as[i])&&/\d/.test(as[i+1]))continue;if(!pairs.has(as[i]+'|'+as[i+1]))return false}
    return !bad.length&&!nums.length};
  const uncited=sent=>{const m=sent.match(/^(\s*(?:\d{1,2}[.)]|[-*\u2022])\s+)?([\s\S]*)$/),lead=m[1]||'',body=m[2];if(!body.trim()||/[?\u061f]\s*$/.test(body)||ABST.test(body)||(opt.skip&&opt.skip(sent))||/`/.test(sent))return sent;
    const cw=[...new Set(words(body))].filter(w=>!Q.has(stem(w))&&!GENERIC.has(w));if(cw.length<2&&!/\d/.test(body))return sent;
    for(const p of ALL){if(supportedBy(body,p.text))return lead+body.replace(/\s+$/,'')+' ['+p.id+']'}
    replaced.push({id:null,original:body.trim().slice(0,200),quote:'',uncited:true});return lead+(ar?'[\u062a\u0645 \u062d\u0630\u0641 \u062c\u0645\u0644\u0629 \u0644\u0645 \u064a\u062f\u0639\u0645\u0647\u0627 \u0646\u0635 \u0627\u0644\u0645\u0633\u062a\u0646\u062f\u0627\u062a \u0627\u0644\u0645\u0633\u062a\u0631\u062c\u0639\u0629]':'[sentence removed: not supported by the retrieved document text]')};
  const lines=String(answer).split('\n');let fence=false,inCalc=false;
  const out=lines.map(line=>{if(/^\s*```/.test(line)){fence=!fence;return line}
    if(/^\s*\[(Calculation source|\u0645\u0635\u062f\u0631 \u0627\u0644\u062d\u0633\u0627\u0628)/.test(line))inCalc=true;if(inCalc||fence||/^\s*(\||#|>)/.test(line))return line;
    const parts=[];for(const x of line.split(/(?<=[.!?\u061f])\s+/)){if(/^\s*(\[S\d+(?:\s*,\s*S\d+)*\]\s*)+[.!?\u061f]?\s*$/.test(x)&&parts.length)parts[parts.length-1]+=' '+x;else parts.push(x)}
    return parts.map(sent=>{if(!hasCite(sent)){return uncited(sent)}const ids=citeIds(sent).filter(i=>byId[i]);if(!ids.length)return uncited(sent);
      if(/`/.test(sent)||(opt.skip&&opt.skip(sent)))return sent;
      const body=sent.replace(/\[S\d+(?:\s*,\s*S\d+)*\]/g,' ').replace(/^\s*(?:\d{1,2}[.)]|[-*\u2022])\s+/,'');const sa=isAr(body);
      let ok=false,quote='',qid=ids[0];
      for(const id of ids){const t=byId[id];const bw=bestWindow(body,t);if(!bw)continue;if(!quote){quote=bw.quote;qid=id}
        const pas=sentences(t).filter(l=>letters(l,sa)>=3&&letters(l,sa)>=letters(l,!sa));
        if(!pas.length)continue; // cross-language: unverifiable
        const bw2=bestWindow(body,pas.join('\n'));if(!bw2)continue;
        const ps=words(bw2.win).map(stem),key=ps.map(w=>w.slice(0,5));const sup=w=>{const s=stem(w);return ps.includes(s)||key.some(k=>k.length>=3&&s.slice(0,5)===k)};
        const bad=[...new Set(words(body))].filter(w=>!Q.has(stem(w))&&!GENERIC.has(w)&&!sup(w));
        const nums=(body.match(/\d+(?:[.,]\d+)?/g)||[]).filter(n=>!bw2.win.replace(/,/g,'').includes(n.replace(/,/g,'')));
        const tk=t=>(norm(t).replace(/\[[^\]]*\]/g,' ').match(/[a-z\u0600-\u06ff]+|\d+(?:\.\d+)?/g)||[]).filter(w=>/\d/.test(w)||(w.length>=(AR.test(w)?3:4)&&!STOP.has(w))).map(w=>/\d/.test(w)?w:stem(w).slice(0,5));
        const ws=tk(bw2.win),pairs=new Set();for(let i=0;i+1<ws.length;i++){pairs.add(ws[i]+'|'+ws[i+1]);pairs.add(ws[i+1]+'|'+ws[i])}
        const as=tk(body),qk=new Set([...Q].map(x=>x.slice(0,5))),gk=new Set([...GENERIC].map(x=>stem(x).slice(0,5)));const skipW=w=>qk.has(w)||gk.has(w);
        const badPairs=[];for(let i=0;i+1<as.length;i++){if(skipW(as[i])||skipW(as[i+1])||/\d/.test(as[i])&&/\d/.test(as[i+1]))continue;if(!pairs.has(as[i]+'|'+as[i+1]))badPairs.push(as[i]+' '+as[i+1])}
        if(!bad.length&&!nums.length&&!badPairs.length){ok=true;break}else{quote=bw2.quote;qid=id}}
      if(ok)return sent;
      replaced.push({id:qid,original:body.trim().slice(0,200),quote:quote.slice(0,300)});
      return (ar?'\u0627\u0644\u0646\u0635 \u0627\u0644\u062d\u0631\u0641\u064a \u0645\u0646 \u0627\u0644\u0645\u0633\u062a\u0646\u062f: ':'Exact text from the document: ')+'\u201c'+quote.slice(0,300)+'\u201d ['+qid+']'}).join(' ')});
  return {answer:out.join('\n'),replaced}}
module.exports.enforce=enforce;
for(const w of 'must should shall will would can could may might need needs needed required requires require does done being made make makes takes take given gives give'.split(' '))STOP.add(w);
