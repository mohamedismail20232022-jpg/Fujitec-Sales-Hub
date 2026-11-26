'use strict';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// type: bar|line|pie. data: [{label,value}]. Returns SVG string (pure). PNG via toPNG (resvg).
function svg({type='bar',title='',data,width=640,height=380,source}){
  const d=data.filter(x=>typeof x.value==='number'&&isFinite(x.value)); if(!d.length) throw Object.assign(new Error('No numeric data to chart'),{code:'NO_DATA'});
  const P={l:90,r:20,t:50,b:70},w=width-P.l-P.r,h=height-P.t-P.b,max=Math.max(...d.map(x=>x.value),0),min=Math.min(...d.map(x=>x.value),0),rng=(max-min)||1;
  const y=v=>P.t+h-(v-min)/rng*h;let body='';const col=['#c8102e','#222','#888','#e57373','#555','#bbb'];
  if(type==='pie'){const tot=d.reduce((a,b)=>a+Math.max(b.value,0),0);if(tot<=0)throw Object.assign(new Error('Pie needs positive values'),{code:'NO_DATA'});let a=-Math.PI/2;const cx=width/2-80,cy=height/2+10,r=Math.min(w,h)/2.2;
    d.forEach((x,i)=>{const f=Math.max(x.value,0)/tot,b=a+f*2*Math.PI,l=f>.5?1:0;body+=`<path d="M${cx},${cy} L${cx+r*Math.cos(a)},${cy+r*Math.sin(a)} A${r},${r} 0 ${l} 1 ${cx+r*Math.cos(b)},${cy+r*Math.sin(b)} Z" fill="${col[i%6]}"/><rect x="${width-170}" y="${60+i*20}" width="12" height="12" fill="${col[i%6]}"/><text x="${width-152}" y="${71+i*20}" font-size="12">${esc(x.label)} (${(f*100).toFixed(1)}%)</text>`;a=b});}
  else{for(let i=0;i<=4;i++){const v=min+rng*i/4;body+=`<line x1="${P.l}" x2="${P.l+w}" y1="${y(v)}" y2="${y(v)}" stroke="#ddd"/><text x="${P.l-6}" y="${y(v)+4}" font-size="11" text-anchor="end">${Number(v.toFixed(2)).toLocaleString('en-US')}</text>`;}
    const bw=w/d.length;
    if(type==='bar')d.forEach((x,i)=>{const y0=y(Math.max(x.value,0)),hh=Math.abs(y(x.value)-y(0));body+=`<rect x="${P.l+i*bw+bw*.15}" y="${y0}" width="${bw*.7}" height="${hh}" fill="#c8102e"><title>${esc(x.label)}: ${x.value}</title></rect>`});
    else body+=`<polyline fill="none" stroke="#c8102e" stroke-width="2" points="${d.map((x,i)=>(P.l+i*bw+bw/2)+','+y(x.value)).join(' ')}"/>`+d.map((x,i)=>`<circle cx="${P.l+i*bw+bw/2}" cy="${y(x.value)}" r="3" fill="#222"><title>${esc(x.label)}: ${x.value}</title></circle>`).join('');
    d.forEach((x,i)=>body+=`<text x="${P.l+i*bw+bw/2}" y="${P.t+h+16}" font-size="11" text-anchor="middle">${esc(String(x.label).slice(0,14))}</text>`);}
  return `<svg xmlns="http://www.w3.org/2000/svg" direction="ltr" style="direction:ltr" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="${width/2}" y="26" font-size="16" font-weight="bold" text-anchor="middle">${esc(title)}</text>${body}${source?`<text x="10" y="${height-8}" font-size="10" fill="#666">Source: ${esc(source)}</text>`:''}</svg>`;}
const path=require('path'),FONTS=['NotoNaskhArabic-Regular.ttf','DejaVuSans.ttf'].map(f=>path.join(__dirname,'fonts',f));
function toPNG(svgStr){const {Resvg}=require('@resvg/resvg-js');return new Resvg(svgStr,{fitTo:{mode:'width',value:1280},font:{loadSystemFonts:false,fontFiles:FONTS,defaultFontFamily:'DejaVu Sans'}}).render().asPng();}
function lineSVG(text,size,width,bold){const rtl=/[\u0590-\u08FF]/.test(text);const w=width||900,h=Math.round(size*1.6);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="${rtl?w-4:4}" y="${size*1.2}" font-size="${size}" font-family="Noto Naskh Arabic, DejaVu Sans"${bold?' font-weight="bold"':''} text-anchor="${rtl?'end':'start'}" direction="${rtl?'rtl':'ltr'}" unicode-bidi="plaintext">${esc(text)}</text></svg>`;}
module.exports={svg,toPNG,lineSVG};
