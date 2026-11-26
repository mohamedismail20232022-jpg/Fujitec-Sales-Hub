'use strict';
// Local lexical retrieval: BM25 with Arabic/English normalisation + cross-document link detection.
// Semantic (embedding) retrieval is NOT implemented; it needs a provider decision.
function norm(s){return String(s).normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
  .replace(/[\u0660-\u0669]/g,d=>d.charCodeAt(0)-0x660).replace(/[\u06F0-\u06F9]/g,d=>d.charCodeAt(0)-0x6F0).toLowerCase();}
function tok(s){let t=norm(s).match(/[\p{L}\p{N}]+/gu)||[];return t.map(w=>/^[a-z]+$/.test(w)&&w.length>3?w.replace(/(ing|ed|es|s)$/,''):(/^[\u0600-\u06FF]+$/.test(w)&&w.length>3?w.replace(/^(ال|وال|بال|لل)/,''):w));}
class Index{constructor(){this.docs=[];this.df=new Map();this.len=0;}
  add(chunk,owner){const t=tok(chunk.text);const tf=new Map();t.forEach(w=>tf.set(w,(tf.get(w)||0)+1));tf.forEach((_,w)=>this.df.set(w,(this.df.get(w)||0)+1));this.docs.push({chunk,owner,tf,n:t.length});this.len+=t.length;}
  search(q,{owner,files,k=5}={}){const qt=[...new Set(tok(q))],N=this.docs.length,avg=this.len/(N||1),k1=1.4,b=.75;const out=[];
    for(const d of this.docs){if(owner&&d.owner!==owner)continue;if(files&&!files.includes(d.chunk.cite.file))continue; // isolation + file selection enforced here
      let s=0;for(const w of qt){const f=d.tf.get(w);if(!f)continue;const df=this.df.get(w),idf=Math.log(1+(N-df+.5)/(df+.5));s+=idf*f*(k1+1)/(f+k1*(1-b+b*d.n/avg));}
      if(s>0)out.push({score:Math.round(s*1e4)/1e4,text:d.chunk.text,cite:d.chunk.cite});}
    return out.sort((a,b)=>b.score-a.score).slice(0,k);}}
function entities(text){const s=new Set();let rest=String(text);(rest.match(/\b[A-Z]{2,5}-?\d{3,}\b/g)||[]).forEach(x=>{s.add(x);rest=rest.split(x).join(' ')});(rest.match(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d{4,}\b/g)||[]).forEach(x=>s.add(x.replace(/,/g,'')));return s;}
function crossLinks(chunks){const m=new Map();chunks.forEach(c=>entities(c.text).forEach(e=>{const a=m.get(e)||[];a.push(c.cite);m.set(e,a)}));
  const out=[];m.forEach((cites,e)=>{const files=[...new Set(cites.map(c=>c.file))];if(files.length>1)out.push({entity:e,files,cites});});return out;}
module.exports={Index,norm,tok,crossLinks};
