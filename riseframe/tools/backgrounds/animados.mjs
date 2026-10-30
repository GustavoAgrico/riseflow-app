import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [outDir, ffmpeg, only] = process.argv.slice(2);
const L = 6, FPS = 24, N = L * FPS;
// cada fundo: HTML estático + função draw(t) (t em 0..1 do loop) executada no navegador
const BG = {
  'preto-raios': {
    html: `<div style="position:absolute;inset:0;background:radial-gradient(80% 60% at 50% 50%,#232121,#0b0b0b 75%)"></div>
      <svg id="a" width="1080" height="1920" style="position:absolute;inset:0"><defs><filter id="gl"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g id="b1" filter="url(#gl)"></g><g id="b2" filter="url(#gl)"></g></svg>`,
    draw: `(t)=>{const sp=(cx,cy,base,rot)=>{let s='';for(let i=0;i<8;i++){const a=(base+rot+i*11)*Math.PI/180;const L=430+((i*37)%4)*110;const w=20+(i%3)*9;const tx=cx+Math.cos(a)*L,ty=cy+Math.sin(a)*L;const px=-Math.sin(a)*w*2.2,py=Math.cos(a)*w*2.2;s+='<path d="M'+(cx+px)+' '+(cy+py)+' L'+tx+' '+ty+' L'+(cx-px)+' '+(cy-py)+'Z" fill="#fff" opacity="'+(0.8+(i%2)*0.2)+'"/>';}return s;};
      const r=Math.sin(t*Math.PI*2)*9;document.getElementById('b1').innerHTML=sp(1110,-30,92,r);document.getElementById('b2').innerHTML=sp(-30,1950,272,-r);}`,
  },
  'grade-ondulada': {
    html: `<svg width="1080" height="1920" style="position:absolute;inset:0"><defs><radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#f2f2f2"/><stop offset=".6" stop-color="#dcdcdc"/><stop offset="1" stop-color="#b8b8b8"/></radialGradient>
      <filter id="w" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence id="tb" type="fractalNoise" baseFrequency="0.0028 0.0024" numOctaves="2" seed="4"/><feDisplacementMap id="dm" in="SourceGraphic" scale="40"/></filter>
      <pattern id="p" width="74" height="74" patternUnits="userSpaceOnUse"><path d="M74 0H0V74" fill="none" stroke="#6e6e6e" stroke-width="2.4"/></pattern></defs>
      <rect width="1080" height="1920" fill="url(#g)"/><rect x="-60" y="-60" width="1200" height="2040" fill="url(#p)" filter="url(#w)" opacity=".9"/></svg>`,
    draw: `(t)=>{document.getElementById('dm').setAttribute('scale',String(34+22*Math.sin(t*Math.PI*2)));document.getElementById('tb').setAttribute('baseFrequency',(0.0028+0.0004*Math.sin(t*Math.PI*2))+' '+(0.0024+0.0004*Math.cos(t*Math.PI*2)));}`,
  },
  'azul-grade': {
    html: `<div style="position:absolute;inset:0;background:#0b10e3"></div>
      <div id="gr" style="position:absolute;left:120px;top:370px;width:840px;height:1240px;background-image:linear-gradient(rgba(235,240,255,1) 4px,transparent 4px),linear-gradient(90deg,rgba(235,240,255,1) 4px,transparent 4px);background-size:84px 84px;filter:drop-shadow(0 0 8px #9fb2ff) drop-shadow(0 0 18px #4d63ff);-webkit-mask-image:radial-gradient(closest-side,#000 72%,transparent 100%);mask-image:radial-gradient(closest-side,#000 72%,transparent 100%)"></div>
      <svg width="1080" height="1920" style="position:absolute;inset:0"><defs><path id="st" d="M0 -100 Q20 -20 100 0 Q20 20 0 100 Q-20 20 -100 0 Q-20 -20 0 -100Z"/></defs>
      <use id="s1" href="#st" fill="#4352ff"/><use id="s2" href="#st" fill="#4352ff"/></svg>`,
    draw: `(t)=>{const a=t*90;document.getElementById('s1').setAttribute('transform','translate(880 130) scale(2.7) rotate('+a+')');document.getElementById('s2').setAttribute('transform','translate(170 1790) scale(2.6) rotate('+(-a)+')');document.getElementById('gr').style.opacity=String(0.85+0.15*Math.sin(t*Math.PI*2));}`,
  },
  'cinza-manchas': {
    html: `<svg width="1080" height="1920" style="position:absolute;inset:0"><defs><radialGradient id="g" cx="55%" cy="50%" r="70%"><stop offset="0" stop-color="#e6e6e6"/><stop offset=".55" stop-color="#bdbdbd"/><stop offset="1" stop-color="#7d7d7d"/></radialGradient>
      <pattern id="p" width="70" height="70" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M70 0H0V70" fill="none" stroke="#5a5a5a" stroke-width="1.8" opacity=".8"/></pattern>
      <filter id="sh"><feDropShadow dx="10" dy="16" stdDeviation="14" flood-color="#000" flood-opacity=".45"/></filter>
      <path id="sp" d="M-32 -90 C-51 -143 -48 -245 0 -275 C48 -245 51 -143 32 -90 Q46 -63 75 -58 C121 -92 218 -121 262 -85 C248 -30 152 4 95 2 Q74 24 78 54 C125 86 183 170 162 222 C105 226 43 146 27 91 Q0 78 -27 91 C-43 146 -105 226 -162 222 C-183 170 -125 86 -78 54 Q-74 24 -95 2 C-152 4 -248 -30 -262 -85 C-218 -121 -121 -92 -75 -58 Q-46 -63 -32 -90 Z"/></defs>
      <rect width="1080" height="1920" fill="url(#g)"/><rect width="1080" height="1920" fill="url(#p)"/>
      <use id="a" href="#sp" fill="#141414" filter="url(#sh)"/><use id="b" href="#sp" fill="#141414" filter="url(#sh)"/></svg>`,
    draw: `(t)=>{const w=Math.sin(t*Math.PI*2)*8;document.getElementById('a').setAttribute('transform','translate(980 160) scale(1.7) rotate('+(20+w)+')');document.getElementById('b').setAttribute('transform','translate(80 1800) scale(1.75) rotate('+(-15-w)+')');}`,
  },
  'holofote-cone': {
    html: `<div style="position:absolute;inset:0;background:#030303"></div>
      <div id="c" style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.75),rgba(255,255,255,.22) 65%,rgba(255,255,255,.1));clip-path:polygon(48% 0,52% 0,99% 100%,1% 100%);filter:blur(3px)"></div>
      <div style="position:absolute;left:470px;top:-40px;width:140px;height:120px;border-radius:50%;background:radial-gradient(closest-side,#fff,rgba(255,255,255,0))"></div>
      <div id="d" style="position:absolute;inset:0"></div>`,
    draw: `(t)=>{if(!window._p){let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647;window._p=Array.from({length:240},()=>({x:r()*1080,y:r()*1920,z:0.6+r()*2.6,ph:r(),sp:1+Math.floor(r()*3)}));}
      document.getElementById('c').style.opacity=String(0.9+0.1*Math.sin(t*Math.PI*4));
      document.getElementById('d').innerHTML=window._p.map(p=>{const o=0.25+0.75*(0.5+0.5*Math.sin((t*p.sp+p.ph)*Math.PI*2));return '<div style="position:absolute;left:'+p.x+'px;top:'+p.y+'px;width:'+p.z*2+'px;height:'+p.z*2+'px;border-radius:50%;background:#fff;opacity:'+o.toFixed(2)+';box-shadow:0 0 '+(p.z*3)+'px #fff"></div>';}).join('');}`,
  },
  lampada: {
    html: `<div style="position:absolute;inset:0;background:radial-gradient(60% 40% at 50% 50%,#101010,#000 70%)"></div>
      <div id="pv" style="position:absolute;left:540px;top:0;width:0;height:0;transform-origin:0 0">
        <div style="position:absolute;left:-2px;top:0;width:4px;height:820px;background:#6a6a6a"></div>
        <div id="gl" style="position:absolute;left:-420px;top:560px;width:840px;height:840px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.42),rgba(255,255,255,.1) 50%,transparent)"></div>
        <div style="position:absolute;left:-44px;top:800px;width:88px;height:70px;border-radius:10px;background:linear-gradient(90deg,#bdbdbd,#f0f0f0,#bdbdbd)"></div>
        <div style="position:absolute;left:-118px;top:850px;width:236px;height:260px;border-radius:46% 46% 50% 50% / 38% 38% 62% 62%;background:radial-gradient(circle at 50% 50%,#fff,#fbfbfb 55%,#ececec);box-shadow:0 0 70px 26px rgba(255,255,255,.8),0 0 160px 60px rgba(255,255,255,.25)"></div>
      </div>`,
    draw: `(t)=>{document.getElementById('pv').style.transform='rotate('+(Math.sin(t*Math.PI*2)*6)+'deg)';document.getElementById('gl').style.opacity=String(0.85+0.15*Math.sin(t*Math.PI*6));}`,
  },
  'azul-orbita': {
    html: `<div style="position:absolute;inset:0;background:linear-gradient(180deg,#000a1f 0%,#04204f 55%,#0b3c8c 100%)"></div>
      <svg width="1080" height="1920" style="position:absolute;inset:0"><g fill="none" stroke="rgba(160,200,255,.6)" stroke-width="4"><circle cx="1000" cy="80" r="430"/><circle cx="60" cy="1840" r="450"/></g><g id="sq" fill="#fff"></g></svg>
      <div id="dust" style="position:absolute;inset:0"></div>`,
    draw: `(t)=>{const sq=(cx,cy,r,a)=>{const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;return '<rect x="'+(x-30)+'" y="'+(y-30)+'" width="60" height="60" rx="12" transform="rotate('+(a*57.3)+' '+x+' '+y+')" style="filter:drop-shadow(0 0 12px #9cc4ff)"/>';};
      const A=t*Math.PI*2;document.getElementById('sq').innerHTML=sq(1000,80,430,A+2.0)+sq(1000,80,430,A+2.9)+sq(60,1840,450,-A+5.3)+sq(60,1840,450,-A+0.3);
      if(!window._d){let s=11;const r=()=>(s=(s*16807)%2147483647)/2147483647;window._d=Array.from({length:70},()=>'<div style="position:absolute;left:'+r()*1080+'px;top:'+r()*1920+'px;width:2px;height:2px;border-radius:50%;background:#cfe0ff;opacity:'+(0.2+r()*0.5).toFixed(2)+'"></div>').join('');document.getElementById('dust').innerHTML=window._d;}}`,
  },
  'lilas-flor': {
    html: `<div style="position:absolute;inset:0;background:linear-gradient(165deg,#e6b6d6 0%,#a98be6 28%,#4a3fc8 50%,#0e0b3a 72%,#030212 100%)"></div>
      <svg width="1080" height="1920" style="position:absolute;inset:0"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c86ff"/><stop offset=".55" stop-color="#3b2fd6"/><stop offset="1" stop-color="#0b0a4a"/></linearGradient>
      <filter id="sh"><feDropShadow dx="-14" dy="10" stdDeviation="18" flood-color="#0a0630" flood-opacity=".55"/></filter></defs><path id="fl" fill="url(#f)" filter="url(#sh)"/></svg>`,
    draw: `(t)=>{const cx=980,cy=900,R=560,n=12,amp=46,rot=t*Math.PI*2/n;let d='';for(let i=0;i<=360;i++){const a=i*Math.PI/180;const r=R+amp*Math.cos(n*(a-rot));const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;d+=(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);}document.getElementById('fl').setAttribute('d',d+'Z');}`,
  },
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const [id, bg] of Object.entries(BG)) {
  if (only && only !== id) continue;
  const dir = fs.mkdtempSync(path.join(outDir, '_f-'));
  await page.setContent(`<html><body style="margin:0;overflow:hidden"><div style="position:relative;overflow:hidden;width:1080px;height:1920px">${bg.html}</div></body></html>`);
  await page.evaluate(`window._draw = ${bg.draw}`);
  for (let k = 0; k < N; k++) {
    await page.evaluate((t) => window._draw(t), k / N);
    await page.screenshot({ path: path.join(dir, `${String(k).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
  }
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, '%04d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(outDir, `${id}.mp4`)]);
  if (r.status) throw new Error(r.stderr.toString());
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('ok', id);
}
await browser.close();
