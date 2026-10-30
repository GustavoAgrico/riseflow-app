import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2];
const star4 = (x, y, s, c, o = 1, r = 0) => `<svg style="position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;opacity:${o};transform:rotate(${r}deg)" viewBox="0 0 100 100"><path d="M50 0C54 34 66 46 100 50C66 54 54 66 50 100C46 66 34 54 0 50C34 46 46 34 50 0Z" fill="${c}"/></svg>`;
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const dots = (n, color, maxR, area = [0, 0, 1080, 1920], glow = false) => Array.from({ length: n }, () => {
  const r = 0.6 + rnd() * maxR; const x = area[0] + rnd() * area[2]; const y = area[1] + rnd() * area[3];
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:${color};opacity:${0.35 + rnd() * 0.65};${glow ? `box-shadow:0 0 ${r * 4}px ${color}` : ''}"></div>`; }).join('');
const noise = `<svg width="1080" height="1920" style="position:absolute;inset:0;opacity:.07;mix-blend-mode:overlay"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
const BG = {
  escuro: `background:#0a0a0b">
    <div style="position:absolute;left:-200px;top:-520px;width:1480px;height:1100px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,107,53,.42),rgba(255,107,53,.12) 55%,transparent)"></div>
    <div style="position:absolute;left:-420px;bottom:-460px;width:1100px;height:900px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,107,53,.16),transparent)"></div>${noise}`,
  branco: `background:radial-gradient(120% 80% at 50% 42%,#ffffff 0%,#f6f5f1 60%,#ebe9e3 100%)">${noise}`,
  vsl: `background:linear-gradient(180deg,#1b1038 0%,#120a24 55%,#0e0b1e 100%)">
    <div style="position:absolute;left:-160px;top:-420px;width:1400px;height:1000px;border-radius:50%;background:radial-gradient(closest-side,rgba(139,92,246,.45),transparent)"></div>
    <div style="position:absolute;right:-380px;bottom:-300px;width:1000px;height:900px;border-radius:50%;background:radial-gradient(closest-side,rgba(155,99,255,.28),transparent)"></div>${noise}`,
  'azul-grade': `background:#2238e8">
    <div style="position:absolute;inset:0;background:radial-gradient(90% 60% at 50% 40%,#3150ff,#1a2bd0 70%,#1422b0)"></div>
    <div style="position:absolute;left:150px;top:330px;width:780px;height:1200px;border:3px solid rgba(255,255,255,.75);background-image:linear-gradient(rgba(255,255,255,.55) 2px,transparent 2px),linear-gradient(90deg,rgba(255,255,255,.55) 2px,transparent 2px);background-size:78px 80px;background-position:-1px -1px"></div>
    ${star4(700, 90, 360, '#4a63ff')}${star4(-90, 1520, 380, '#4a63ff')}${star4(860, 1180, 120, '#ffffff', .9)}${star4(90, 260, 70, '#ffffff', .8)}`,
  'azul-orbita': `background:linear-gradient(180deg,#05112e 0%,#0b2463 55%,#1546a8 100%)">
    <svg style="position:absolute;inset:0" width="1080" height="1920"><g fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-dasharray="4 18" stroke-linecap="round">
    <circle cx="1080" cy="80" r="420"/><circle cx="0" cy="1880" r="460"/><circle cx="540" cy="960" r="880" stroke="rgba(255,255,255,.18)"/></g>
    <g fill="#fff"><rect x="690" y="150" width="22" height="22" rx="4" transform="rotate(20 701 161)"/><rect x="980" y="480" width="18" height="18" rx="3"/><rect x="420" y="1700" width="20" height="20" rx="4" transform="rotate(35 430 1710)"/><rect x="60" y="1390" width="16" height="16" rx="3"/></g></svg>
    ${dots(60, '#ffffff', 1.6, [0, 0, 1080, 1920], true)}${noise}`,
  'roxo-ondas': `background:linear-gradient(170deg,#c9b8ff 0%,#8b6cff 30%,#3d2591 62%,#120a24 100%)">
    <svg style="position:absolute;inset:0" width="1080" height="1920"><path d="M0 760 C220 620 360 860 560 760 S900 560 1080 700 L1080 1920 L0 1920Z" fill="#2a1a63" opacity=".75"/>
    <path d="M0 1040 C260 900 420 1140 640 1020 S960 860 1080 980 L1080 1920 L0 1920Z" fill="#170d3a" opacity=".85"/>
    <path d="M0 1380 C240 1280 480 1460 700 1360 S980 1240 1080 1320 L1080 1920 L0 1920Z" fill="#0d0820"/></svg>${noise}`,
  'preto-linha': `background:radial-gradient(70% 50% at 50% 30%,#141414,#050505 70%,#000)">
    <div style="position:absolute;left:539px;top:0;width:2px;height:780px;background:linear-gradient(#fff0,#ffffffcc)"></div>
    <div style="position:absolute;left:526px;top:770px;width:28px;height:28px;border-radius:50%;background:#fff;box-shadow:0 0 40px #ffffffaa"></div>${noise}`,
  'holofote-cone': `background:#030303">
    <div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:conic-gradient(from 160deg at 50% -2%,transparent 0deg,rgba(255,255,255,.0) 4deg,rgba(255,255,255,.22) 14deg,rgba(255,255,255,.32) 20deg,rgba(255,255,255,.22) 26deg,rgba(255,255,255,0) 36deg,transparent 40deg);filter:blur(6px)"></div>
    <div style="position:absolute;left:190px;top:1500px;width:700px;height:160px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.28),transparent)"></div>
    ${dots(140, '#ffffff', 1.4)}${dots(25, '#ffffff', 2.4, [300, 100, 480, 1400], true)}${noise}`,
  'azul-claro': `background:linear-gradient(180deg,#eaf3ff 0%,#f7fbff 45%,#ffffff 100%)">
    <div style="position:absolute;left:-200px;top:-300px;width:900px;height:900px;border-radius:50%;background:radial-gradient(closest-side,rgba(80,150,255,.28),transparent)"></div>
    <div style="position:absolute;right:-300px;bottom:-200px;width:1000px;height:900px;border-radius:50%;background:radial-gradient(closest-side,rgba(120,180,255,.25),transparent)"></div>${noise}`,
  'papel-cinza': `background:radial-gradient(110% 80% at 50% 40%,#e2dfd8,#cfcbc2 70%,#bdb8ae)">
    <svg width="1080" height="1920" style="position:absolute;inset:0;opacity:.18;mix-blend-mode:multiply"><filter id="p"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="4"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#p)"/></svg>`,
  'branco-zigzag': `background:#fbfbfa">
    <svg style="position:absolute;inset:0" width="1080" height="1920"><g fill="none" stroke="#151515" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M70 330 l26 -26 26 26 26 -26 26 26"/><path d="M890 1530 l26 -26 26 26 26 -26 26 26"/><path d="M960 250 l22 -22 22 22 22 -22"/></g>
    <line x1="540" y1="1240" x2="540" y2="1920" stroke="#d9d9d9" stroke-width="3"/></svg>${noise}`,
  'preto-raios': `background:#060606">
    <svg style="position:absolute;inset:0" width="1080" height="1920"><g fill="#fff">${(() => {
      const ray = (cx, cy, deg, L, w, o) => { const t = deg * Math.PI / 180; const bx = cx + Math.cos(t) * L; const by = cy + Math.sin(t) * L; const px = -Math.sin(t) * w; const py = Math.cos(t) * w;
        return `<path d="M${cx} ${cy} L${bx + px} ${by + py} L${bx - px} ${by - py}Z" opacity="${o}"/>`; };
      let g = '';
      for (let i = 0; i < 11; i++) { const L = 380 + ((i * 37) % 5) * 70; g += ray(1100, -20, 100 + i * 7, L, 7 + (i % 3) * 3, 0.55 + (i % 3) * 0.2); }
      for (let i = 0; i < 11; i++) { const L = 380 + ((i * 53) % 5) * 70; g += ray(-20, 1940, 280 + i * 7, L, 7 + (i % 3) * 3, 0.55 + (i % 3) * 0.2); }
      return g; })()}
    </g></svg><div style="position:absolute;inset:0;background:radial-gradient(60% 40% at 50% 50%,rgba(255,255,255,.07),transparent)"></div>${noise}`,
  'cinza-rasgado': `background:linear-gradient(160deg,#d6d6d6,#a9a9a9)">
    <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(0,0,0,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.09) 1px,transparent 1px);background-size:120px 120px"></div>
    <svg style="position:absolute;inset:0" width="1080" height="1920"><path d="M640 0 L1080 0 L1080 560 L960 520 L1010 430 L880 380 L930 290 L780 230 L820 140 L690 90Z" fill="#1d1d1d"/>
    <path d="M0 1420 L130 1480 L90 1560 L240 1620 L190 1710 L330 1780 L300 1920 L0 1920Z" fill="#1d1d1d"/></svg>${noise}`,
  'branco-grade': `background:#eeeeec">
    <div style="position:absolute;inset:0;background-image:radial-gradient(circle,#a9a9a3 2.5px,transparent 3px);background-size:72px 72px;background-position:36px 36px"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(80% 60% at 50% 45%,rgba(255,255,255,.75),transparent)"></div>${noise}`,
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const [id, css] of Object.entries(BG)) {
  await page.setContent(`<html><body style="margin:0"><div style="position:relative;overflow:hidden;width:1080px;height:1920px;${css}</div></body></html>`);
  await page.screenshot({ path: `${out}/${id}.jpg`, type: 'jpeg', quality: 88 });
}
await browser.close();
console.log(Object.keys(BG).join(' '));
