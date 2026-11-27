'use strict';
// Deterministic calculation engine. Every result carries its inputs and formula (traceable).
function num(v){ if(typeof v==='number') return isFinite(v)?v:null;
  if(v==null) return null; let s=String(v).trim(); if(!s) return null;
  s=s.replace(/[\u0660-\u0669]/g,d=>d.charCodeAt(0)-0x660).replace(/[\u06F0-\u06F9]/g,d=>d.charCodeAt(0)-0x6F0).replace(/\u066B/g,'.').replace(/\u066C/g,',');
  s=s.replace(/\u2212/g,'-').replace(/SAR|USD|EUR|ر\.س|[$\u00A3\u20AC]/gi,'').trim(); let neg=/^\(.*\)$/.test(s)||/^-/.test(s); {const core=s.replace(/[()%]/g,'').replace(/^-/,'').replace(/\u00A0/g,' ').trim(); if(core.includes(',')&&!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(core))return null; if(/\s/.test(core)&&!/^\d{1,3}( \d{3})+(\.\d+)?$/.test(core))return null;} s=s.replace(/[()\s,%]/g,'').replace(/^-/,'');
  if(!/^\d*\.?\d+$/.test(s)) return null; const n=parseFloat(s); return neg?-n:n; }
function cells(arr){ return arr.map(x=>(x&&typeof x==='object')?x:{v:x}); }
function vals(arr){ const used=[],skipped=[]; cells(arr).forEach((c,i)=>{const n=num(c.v); (n===null?skipped:used).push(n===null?{i,ref:c.ref,raw:c.v}:{i,ref:c.ref,n});}); return {used,skipped}; }
function res(name,value,formula,inputs,skipped,extra){ return Object.assign({name,value,formula,inputs,skipped:skipped||[]},extra||{}); }
const R=(x,d=10)=>{if(x==null)return null;const r=Math.round(x*10**d)/10**d;return r===0?0:r;};
// Exact decimal summation (scaled integers, 9 dp) so long columns do not accumulate binary floating-point error. Falls back to float for huge values.
function exactSum(ns){let t=0n;for(const x of ns){if(!isFinite(x)||Math.abs(x)>=1e15)return ns.reduce((a,b)=>a+b,0);t+=BigInt(x.toFixed(9).replace('.',''))}const neg=t<0n;let d=(neg?-t:t).toString().padStart(10,'0');return Number((neg?'-':'')+d.slice(0,-9)+'.'+d.slice(-9))}
function sum(arr){const {used,skipped}=vals(arr); return res('sum',R(exactSum(used.map(u=>u.n))),'Σxᵢ',used,skipped);}
function count(arr){const {used,skipped}=vals(arr); return res('count',used.length,'n',used,skipped);}
function avg(arr){const {used,skipped}=vals(arr); if(!used.length) return res('average',null,'Σx/n',[],skipped,{error:'no numeric inputs'});
  const s=exactSum(used.map(u=>u.n)); return res('average',R(s/used.length),'Σx/n',used,skipped,{numerator:R(s),denominator:used.length});}
function median(arr){const {used,skipped}=vals(arr); if(!used.length) return res('median',null,'median',[],skipped,{error:'no numeric inputs'});
  const s=used.map(u=>u.n).sort((a,b)=>a-b),m=s.length>>1; return res('median',s.length%2?s[m]:R((s[m-1]+s[m])/2),'middle value',used,skipped);}
function stdev(arr,sample=true){const {used,skipped}=vals(arr); const n=used.length; if(n<(sample?2:1)) return res('stdev',null,'',used,skipped,{error:'not enough values'});
  const m=used.reduce((a,b)=>a+b.n,0)/n, ss=used.reduce((a,b)=>a+(b.n-m)**2,0); const d=sample?n-1:n;
  return res('stdev',R(Math.sqrt(ss/d)),sample?'√(Σ(x−x̄)²/(n−1))':'√(Σ(x−x̄)²/n)',used,skipped,{numerator:R(ss),denominator:d});}
function percentile(arr,p){const {used,skipped}=vals(arr); if(!used.length||p<0||p>100) return res('percentile',null,'linear interpolation',[],skipped,{error:'invalid'});
  const s=used.map(u=>u.n).sort((a,b)=>a-b), k=(s.length-1)*p/100, f=Math.floor(k), c=Math.ceil(k);
  return res('percentile',R(s[f]+(s[c]-s[f])*(k-f)),'P'+p+' linear interpolation (Excel PERCENTILE.INC)',used,skipped);}
function ratio(name,numer,denom,pct){ if(num(denom)===null||num(numer)===null) return res(name,null,'numerator/denominator',[],[],{error:'non-numeric input'});
  const n=num(numer),d=num(denom); if(d===0) return res(name,null,'numerator/denominator',[],[],{numerator:n,denominator:d,error:'division by zero'});
  return res(name,R(pct?n/d*100:n/d),pct?'numerator/denominator×100':'numerator/denominator',[],[],{numerator:n,denominator:d,unit:pct?'%':'ratio'});}
function growth(prev,cur){ const p=num(prev),c=num(cur); if(p===null||c===null) return res('growth',null,'(cur−prev)/|prev|×100',[],[],{error:'non-numeric input'});
  if(p===0) return res('growth',null,'(cur−prev)/|prev|×100',[],[],{numerator:c-p,denominator:0,error:'previous period is zero'});
  return res('growth',R((c-p)/Math.abs(p)*100),'(cur−prev)/|prev|×100',[],[],{numerator:R(c-p),denominator:Math.abs(p),unit:'%'});}
function margin(rev,cost){const r=num(rev),c=num(cost); if(r===null||c===null) return res('margin',null,'(rev−cost)/rev×100',[],[],{error:'non-numeric input'});
  return ratio('margin',r-c,r,true);}
function cagr(start,end,years){const s=num(start),e=num(end),y=num(years); if([s,e,y].some(x=>x===null)||s<=0||y<=0||e<0) return res('cagr',null,'(end/start)^(1/years)−1',[],[],{error:'invalid input'});
  return res('cagr',R((Math.pow(e/s,1/y)-1)*100),'(end/start)^(1/years)−1',[],[],{numerator:e,denominator:s,unit:'%'});}
function npv(rate,flows){const r=num(rate); const {used,skipped}=vals(flows); if(r===null||r<=-1) return res('npv',null,'Σ CFₜ/(1+r)ᵗ, t from 0',[],skipped,{error:'invalid rate'});
  return res('npv',R(used.reduce((a,b,t)=>a+b.n/Math.pow(1+r,t),0),6),'Σ CFₜ/(1+r)ᵗ, t from 0',used,skipped);}
function irr(flows){const {used,skipped}=vals(flows); const f=used.map(u=>u.n); if(!f.some(x=>x>0)||!f.some(x=>x<0)) return res('irr',null,'rate where NPV=0',used,skipped,{error:'needs both positive and negative flows'});
  const g=r=>f.reduce((a,x,t)=>a+x/Math.pow(1+r,t),0); let lo=-0.999999,hi=10; if(g(lo)*g(hi)>0) return res('irr',null,'rate where NPV=0',used,skipped,{error:'no sign change in [-99.9%,1000%]'});
  for(let i=0;i<300;i++){const m=(lo+hi)/2; if(g(lo)*g(m)<=0) hi=m; else lo=m;} return res('irr',R((lo+hi)/2*100,6),'bisection on NPV=0',used,skipped,{unit:'%'});}
function regress(xs,ys){const X=cells(xs).map(c=>num(c.v)),Y=cells(ys).map(c=>num(c.v)); const p=[]; X.forEach((x,i)=>{if(x!==null&&Y[i]!=null&&Y[i]!==null)p.push([x,Y[i]])});
  const n=p.length; if(n<2) return res('regression',null,'OLS',[],[],{error:'not enough pairs'});
  const mx=p.reduce((a,b)=>a+b[0],0)/n,my=p.reduce((a,b)=>a+b[1],0)/n; let sxy=0,sxx=0,syy=0; p.forEach(([x,y])=>{sxy+=(x-mx)*(y-my);sxx+=(x-mx)**2;syy+=(y-my)**2});
  if(sxx===0) return res('regression',null,'OLS',[],[],{error:'x has zero variance'});
  const b=sxy/sxx,a=my-b*mx; return res('regression',{slope:R(b),intercept:R(a),r2:syy===0?1:R(sxy*sxy/(sxx*syy)),n},'y=a+bx, b=Sxy/Sxx',p.map(([x,y],i)=>({i,x,y})),[]);}
function movingAvg(arr,w){const {used}=vals(arr); if(!(w>=1)||used.length<w) return res('movingAvg',null,'',used,[],{error:'window too large'});
  const out=[]; for(let i=w-1;i<used.length;i++){let s=0;for(let j=i-w+1;j<=i;j++)s+=used[j].n; out.push(R(s/w));} return res('movingAvg',out,'mean of last '+w,used,[]);}
function pivot(rows,groupKey,valueKey,agg='sum'){const g={},sk=[]; rows.forEach((r,i)=>{const n=num(r[valueKey]); if(n===null){sk.push({i,raw:r[valueKey]});return;} const k=String(r[groupKey]??'(blank)'); (g[k]=g[k]||[]).push(n);});
  const out=Object.keys(g).map(k=>{const a=g[k],s=a.reduce((x,y)=>x+y,0); return {group:k,n:a.length,value:R(agg==='avg'?s/a.length:agg==='count'?a.length:s)};});
  return res('pivot',out,agg+' of '+valueKey+' by '+groupKey,[],sk);}
module.exports={num,sum,count,avg,median,stdev,percentile,ratio,growth,margin,cagr,npv,irr,regress,movingAvg,pivot};
