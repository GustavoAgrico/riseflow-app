import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('sfx');

// Volume de cada tipo de efeito por intensidade (0..1). "medio" é o padrão.
const LEVELS = {
  suave: { pop: 0.18, whoosh: 0.4, tick: 0.5 },
  medio: { pop: 0.32, whoosh: 0.6, tick: 0.75 },
  forte: { pop: 0.5, whoosh: 0.85, tick: 1 },
};

// Batidas de teclado reais (assets/sfx/tecla-*.wav), carregadas uma vez.
const SFX_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'sfx');
let keySamples = null;
/** Lê os WAVs de tecla (16 bits mono) como Float32Array. [] se não houver. */
export async function loadKeySamples(dir = SFX_DIR) {
  if (keySamples && dir === SFX_DIR) return keySamples;
  let names = [];
  try {
    names = (await fs.readdir(dir)).filter((n) => /^tecla-\d+\.wav$/.test(n)).sort();
  } catch {
    names = [];
  }
  const out = [];
  for (const n of names) {
    const b = await fs.readFile(path.join(dir, n));
    const pos = b.indexOf('data');
    if (pos < 0 || b.readUInt16LE(22) !== 1 || b.readUInt16LE(34) !== 16) continue;
    const len = Math.floor(b.readUInt32LE(pos + 4) / 2);
    const f = new Float32Array(len);
    for (let i = 0; i < len && pos + 8 + i * 2 + 1 < b.length; i++) f[i] = b.readInt16LE(pos + 8 + i * 2) / 32768;
    out.push(f);
  }
  if (dir === SFX_DIR) keySamples = out;
  return out;
}

/**
 * Faixa com os sons de tecla das palavras da legenda. Com `samples` (as teclas gravadas
 * de assets/sfx), sorteia uma por palavra; sem elas, sintetiza um "tec" parecido (estalo
 * + ruído filtrado em ~2,4 kHz + corpo grave leve). A força varia um pouco a cada tecla
 * (soa como digitação, não como metrônomo).
 * Gerada aqui mesmo como WAV: muitas teclas viram UMA entrada no mix. Exportada para teste.
 * @returns {Buffer} WAV mono 16 bits
 */
export function tickTrackWav(times, durationSec, { rate = 44100, gain = 0.5, samples = null } = {}) {
  const total = Math.max(1, Math.ceil((durationSec + 0.1) * rate));
  const pcm = new Float32Array(total);
  const len = Math.round(0.03 * rate);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let last = -Infinity;
  let lastKey = -1;
  for (const t of [...times].sort((a, b) => a - b)) {
    if (!Number.isFinite(t) || t < 0 || t - last < 0.09) continue; // teclas coladas viram uma só
    last = t;
    const i0 = Math.round(t * rate);
    if (samples?.length) {
      // Tecla gravada: sorteia uma (nunca a mesma duas vezes seguidas) com força variando um pouco.
      let k = Math.floor(rnd() * samples.length);
      if (k === lastKey && samples.length > 1) k = (k + 1) % samples.length;
      lastKey = k;
      const smp = samples[k];
      const g = gain * (0.88 + 0.24 * rnd());
      for (let n = 0; n < smp.length && i0 + n < total; n++) pcm[i0 + n] += g * smp[n];
      continue;
    }
    const f0 = 2400 * (0.95 + 0.1 * rnd()); // centro do "tec"
    const amp = gain * (0.85 + 0.3 * rnd());
    // passa-faixa (biquad, Q≈4) para o ruído do clique
    const w = (2 * Math.PI * f0) / rate;
    const al = Math.sin(w) / (2 * 4);
    const b0 = al / (1 + al); const a1 = (-2 * Math.cos(w)) / (1 + al); const a2 = (1 - al) / (1 + al);
    let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
    for (let n = 0; n < len && i0 + n < total; n++) {
      const x = n / rate;
      const nz = rnd() * 2 - 1;
      const y = b0 * nz - b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = nz; y2 = y1; y1 = y;
      const click = y * 4.5 * Math.exp(-x / 0.004) * (1 - Math.exp(-x / 0.0003));
      const snap = n < 4 ? (rnd() * 2 - 1) * 0.18 * (1 - n / 4) : 0; // estalo do começo
      const body = 0.07 * Math.sin(2 * Math.PI * 190 * x) * Math.exp(-x / 0.005);
      pcm[i0 + n] += amp * (click + snap + body);
    }
  }
  const buf = Buffer.alloc(44 + total * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + total * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(total * 2, 40);
  for (let i = 0; i < total; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
  return buf;
}

/**
 * Biblioteca de efeitos sonoros — os mais usados em edição de Reels/Shorts (riser,
 * obturador, clique, digitação...). Todos SINTETIZADOS pelo FFmpeg: sem assets de
 * terceiros, sem risco de direitos autorais.
 * - base: qual nível de LEVELS usar; gain: ajuste fino sobre ele.
 * - lead: segundos ANTES do momento em que o som começa (o riser "chega" no ponto).
 * - src/af: entrada lavfi e cadeia de filtros que geram o som.
 */
export const SFX_LIBRARY = {
  whoosh: {
    label: 'Whoosh (passagem)', base: 'whoosh', gain: 1, lead: 0.3,
    // Ruído marrom (grave, macio) com subida longa e queda rápida, passando de um lado
    // para o outro no estéreo e com um pouco de ar — soa como "passagem", não chiado.
    src: 'anoisesrc=d=0.65:c=brown:a=0.9:r=44100',
    af: ['highpass=f=120', 'lowpass=f=2600', 'equalizer=f=900:t=q:w=1:g=4',
      'afade=t=in:st=0:d=0.42:curve=qsin', 'afade=t=out:st=0.42:d=0.23:curve=exp',
      'aecho=0.8:0.6:35:0.25', 'volume=1.6', 'aformat=channel_layouts=stereo', 'apulsator=hz=1.3:amount=0.7'],
  },
  swoosh: {
    label: 'Swoosh (rápido)', base: 'whoosh', gain: 0.8, lead: 0.15,
    src: 'anoisesrc=d=0.32:c=pink:a=0.9:r=44100',
    af: ['highpass=f=700', 'lowpass=f=7000', 'afade=t=in:st=0:d=0.18:curve=qsin',
      'afade=t=out:st=0.18:d=0.14:curve=exp', 'volume=1.4', 'aformat=channel_layouts=stereo', 'apulsator=hz=3:amount=0.8'],
  },
  riser: {
    label: 'Riser metálico (subida)', base: 'whoosh', gain: 0.75, lead: 1.5,
    // Tom com glissando para cima + ruído, com flanger para o brilho "metálico".
    src: "aevalsrc='0.35*sin(2*PI*(180*t+260*t*t))+0.2*sin(2*PI*(360*t+520*t*t))+0.12*(random(0)*2-1)':d=1.6:s=44100",
    af: ['highpass=f=150', 'afade=t=in:st=0:d=1.35:curve=exp', 'afade=t=out:st=1.45:d=0.15',
      'flanger=delay=2:depth=4:speed=0.6', 'aecho=0.8:0.5:40:0.3', 'aformat=channel_layouts=stereo'],
  },
  shutter: {
    label: 'Obturador de câmera', base: 'pop', gain: 1.1, lead: 0,
    // Dois estalos secos (abre/fecha), como uma câmera fotográfica.
    src: "aevalsrc='(random(0)*2-1)*(exp(-t*90)+0.75*gte(t,0.09)*exp(-(t-0.09)*70))':d=0.3:s=44100",
    af: ['highpass=f=1500', 'lowpass=f=9000', 'volume=1.3', 'aformat=channel_layouts=stereo'],
  },
  click: {
    label: 'Clique de mouse', base: 'pop', gain: 1, lead: 0,
    src: "aevalsrc='(random(0)*2-1)*exp(-t*420)+0.5*sin(2*PI*2400*t)*exp(-t*320)':d=0.06:s=44100",
    af: ['highpass=f=900', 'aformat=channel_layouts=stereo'],
  },
  typing: {
    label: 'Digitação (teclado)', base: 'pop', gain: 1.2, lead: 0,
    // Sequência irregular de teclas por ~1,2 s.
    src: "aevalsrc='(random(0)*2-1)*exp(-mod(t+0.03*sin(t*29),0.105)*260)*(0.55+0.45*sin(t*37))':d=1.2:s=44100",
    af: ['highpass=f=1200', 'lowpass=f=8000', 'afade=t=out:st=1.05:d=0.15', 'aformat=channel_layouts=stereo'],
  },
  pop: {
    label: 'Pop', base: 'pop', gain: 1, lead: 0,
    // Pop: blip curto (clique suave).
    src: 'sine=frequency=1000:duration=0.06:sample_rate=44100',
    af: ['afade=t=out:st=0.008:d=0.05', 'volume=0.8'],
  },
  impact: {
    label: 'Impacto (boom)', base: 'whoosh', gain: 0.55, lead: 0,
    src: "aevalsrc='sin(2*PI*(55-25*t)*t)*exp(-t*4)+0.3*(random(0)*2-1)*exp(-t*20)':d=1.2:s=44100",
    af: ['lowpass=f=600', 'aformat=channel_layouts=stereo'],
  },
  kick: {
    label: 'Batida (bumbo)', base: 'pop', gain: 0.8, lead: 0,
    src: "aevalsrc='sin(2*PI*(120*exp(-t*18)+45)*t)*exp(-t*9)':d=0.4:s=44100",
    af: ['lowpass=f=900', 'aformat=channel_layouts=stereo'],
  },
  glitch: {
    label: 'Glitch (digital)', base: 'pop', gain: 0.5, lead: 0,
    src: "aevalsrc='(random(0)*2-1)*lt(mod(t,0.06),0.03)*0.8+0.4*sin(2*PI*880*t)*lt(mod(t,0.09),0.02)':d=0.45:s=44100",
    af: ['highpass=f=300', 'aformat=channel_layouts=stereo'],
  },
  bling: {
    label: 'Brilho (bling)', base: 'pop', gain: 0.9, lead: 0,
    src: "aevalsrc='0.4*sin(2*PI*1760*t)*exp(-t*5)+0.3*sin(2*PI*2637*t)*exp(-t*6)*gte(t,0.08)+0.25*sin(2*PI*3520*t)*exp(-t*7)*gte(t,0.16)':d=1:s=44100",
    af: ['aecho=0.8:0.5:60:0.25', 'volume=3', 'aformat=channel_layouts=stereo'],
  },
  bubble: {
    label: 'Bolha (pop na água)', base: 'pop', gain: 1.3, lead: 0,
    src: "aevalsrc='sin(2*PI*(300+1400*t)*t)*exp(-t*25)':d=0.15:s=44100",
    af: ['aformat=channel_layouts=stereo'],
  },
  cash: {
    label: 'Dinheiro (caixa registradora)', base: 'pop', gain: 0.9, lead: 0,
    src: "aevalsrc='0.4*sin(2*PI*2093*t)*exp(-t*3)+0.3*sin(2*PI*2637*t)*exp(-t*3.5)+0.6*(random(0)*2-1)*exp(-t*120)':d=1:s=44100",
    af: ['aformat=channel_layouts=stereo'],
  },
  error: {
    label: 'Erro (buzzer)', base: 'pop', gain: 0.8, lead: 0,
    src: "aevalsrc='0.35*(gt(sin(2*PI*180*t),0)*2-1)*(lt(t,0.18)+between(t,0.25,0.43))':d=0.45:s=44100",
    af: ['lowpass=f=2200', 'aformat=channel_layouts=stereo'],
  },
  drone: {
    label: 'Suspense (tensão)', base: 'whoosh', gain: 0.8, lead: 0,
    src: "aevalsrc='0.25*sin(2*PI*65*t)+0.15*sin(2*PI*98*t)+0.08*sin(2*PI*131*t+sin(2*PI*0.5*t))':d=2.5:s=44100",
    af: ['afade=t=in:st=0:d=1', 'afade=t=out:st=1.9:d=0.6', 'aformat=channel_layouts=stereo'],
  },
  ding: {
    label: 'Ding (notificação)', base: 'pop', gain: 0.7, lead: 0,
    src: "aevalsrc='0.5*sin(2*PI*1320*t)*exp(-t*4)+0.25*sin(2*PI*2640*t)*exp(-t*6)':d=1.1:s=44100",
    af: ['aformat=channel_layouts=stereo'],
  },
  // ── mais sons (como a biblioteca do CapCut), todos sintetizados aqui ──
  whooshdown: {
    label: 'Whoosh descendo', base: 'whoosh', gain: 0.9, lead: 0.2,
    src: 'anoisesrc=d=0.7:c=pink:a=0.9:r=44100',
    af: ['highpass=f=200', 'lowpass=f=4200', 'afade=t=in:st=0:d=0.12:curve=exp', 'afade=t=out:st=0.2:d=0.5:curve=qsin', 'volume=1.4', 'aformat=channel_layouts=stereo', 'apulsator=hz=1.1:amount=0.6'],
  },
  swipe: {
    label: 'Swipe (deslizar)', base: 'whoosh', gain: 0.7, lead: 0.08,
    src: 'anoisesrc=d=0.2:c=white:a=0.8:r=44100',
    af: ['highpass=f=2200', 'lowpass=f=9000', 'afade=t=in:st=0:d=0.1:curve=qsin', 'afade=t=out:st=0.1:d=0.1', 'volume=1.3', 'aformat=channel_layouts=stereo'],
  },
  rewind: {
    label: 'Rebobinar', base: 'whoosh', gain: 0.7, lead: 0,
    src: "aevalsrc='0.35*sin(2*PI*(900-650*t)*t*(1+0.25*sin(2*PI*14*t)))+0.12*(random(0)*2-1)':d=0.8:s=44100",
    af: ['highpass=f=200', 'lowpass=f=5000', 'afade=t=out:st=0.6:d=0.2', 'aformat=channel_layouts=stereo'],
  },
  boom: {
    label: 'Explosão (boom grave)', base: 'whoosh', gain: 0.75, lead: 0,
    src: "aevalsrc='sin(2*PI*(42-14*t)*t)*exp(-t*2.5)+0.5*(random(0)*2-1)*exp(-t*7)':d=2:s=44100",
    af: ['lowpass=f=420', 'aecho=0.8:0.5:80:0.3', 'volume=1.6', 'aformat=channel_layouts=stereo'],
  },
  thud: {
    label: 'Soco (thud)', base: 'pop', gain: 1.1, lead: 0,
    src: "aevalsrc='sin(2*PI*(90*exp(-t*30)+50)*t)*exp(-t*14)+0.4*(random(0)*2-1)*exp(-t*60)':d=0.35:s=44100",
    af: ['lowpass=f=1500', 'aformat=channel_layouts=stereo'],
  },
  bassdrop: {
    label: 'Bass drop', base: 'whoosh', gain: 0.8, lead: 0,
    src: "aevalsrc='sin(2*PI*(150*exp(-t*2)+30)*t)*exp(-t*1.2)':d=2.2:s=44100",
    af: ['lowpass=f=320', 'volume=0.95', 'aformat=channel_layouts=stereo'],
  },
  notify: {
    label: 'Notificação (duas notas)', base: 'pop', gain: 0.9, lead: 0,
    src: "aevalsrc='0.4*sin(2*PI*880*t)*exp(-t*8)*lt(t,0.15)+0.4*sin(2*PI*1320*t)*exp(-(t-0.12)*6)*gte(t,0.12)':d=0.8:s=44100",
    af: ['aformat=channel_layouts=stereo'],
  },
  success: {
    label: 'Acerto (sucesso)', base: 'pop', gain: 0.9, lead: 0,
    src: "aevalsrc='0.3*sin(2*PI*523*t)*exp(-t*6)+0.3*sin(2*PI*659*t)*exp(-(t-0.1)*6)*gte(t,0.1)+0.35*sin(2*PI*784*t)*exp(-(t-0.2)*4)*gte(t,0.2)':d=1:s=44100",
    af: ['aecho=0.8:0.4:50:0.2', 'volume=2.2', 'aformat=channel_layouts=stereo'],
  },
  fail: {
    label: 'Fracasso (trombone)', base: 'pop', gain: 0.7, lead: 0,
    src: "aevalsrc='0.3*(gt(sin(2*PI*(311-gte(t,0.3)*18-gte(t,0.6)*18-gte(t,0.9)*30*(1+0.03*sin(2*PI*6*t)))*t),0)*2-1)*if(lt(t,0.9),1,exp(-(t-0.9)*2.5))':d=1.6:s=44100",
    af: ['lowpass=f=1400', 'aformat=channel_layouts=stereo'],
  },
  clock: {
    label: 'Relógio (tic-tac)', base: 'pop', gain: 1, lead: 0,
    src: "aevalsrc='(random(0)*2-1)*exp(-mod(t,0.5)*300)*(0.6+0.4*lt(mod(t,1),0.5))':d=2:s=44100",
    af: ['highpass=f=1800', 'aformat=channel_layouts=stereo'],
  },
  boing: {
    label: 'Mola (boing)', base: 'pop', gain: 0.9, lead: 0,
    src: "aevalsrc='0.5*sin(2*PI*(200+90*sin(2*PI*12*t)*exp(-t*3))*t)*exp(-t*3)':d=0.8:s=44100",
    af: ['aformat=channel_layouts=stereo'],
  },
  coin: {
    label: 'Moeda (game)', base: 'pop', gain: 0.7, lead: 0,
    src: "aevalsrc='0.35*(gt(sin(2*PI*988*t),0)*2-1)*lt(t,0.08)+0.35*(gt(sin(2*PI*1319*t),0)*2-1)*gte(t,0.08)*exp(-(t-0.08)*7)':d=0.6:s=44100",
    af: ['lowpass=f=6000', 'aformat=channel_layouts=stereo'],
  },
  laser: {
    label: 'Laser', base: 'pop', gain: 0.8, lead: 0,
    src: "aevalsrc='0.5*sin(2*PI*(1800*exp(-t*12)+220)*t)*exp(-t*5)':d=0.45:s=44100",
    af: ['aformat=channel_layouts=stereo'],
  },
  zap: {
    label: 'Choque (zap)', base: 'pop', gain: 0.6, lead: 0,
    src: "aevalsrc='(0.45*(random(0)*2-1)*lt(mod(t,0.04),0.02)+0.35*sin(2*PI*(600+400*sin(2*PI*30*t))*t))*exp(-t*4)':d=0.45:s=44100",
    af: ['highpass=f=250', 'aformat=channel_layouts=stereo'],
  },
  sparkle: {
    label: 'Brilhinho (magia)', base: 'pop', gain: 0.9, lead: 0,
    src: "aevalsrc='0.2*sin(2*PI*2093*t)*exp(-t*5)+0.2*sin(2*PI*2637*t)*exp(-(t-0.07)*5)*gte(t,0.07)+0.2*sin(2*PI*3136*t)*exp(-(t-0.14)*5)*gte(t,0.14)+0.2*sin(2*PI*4186*t)*exp(-(t-0.21)*5)*gte(t,0.21)':d=1.1:s=44100",
    af: ['aecho=0.8:0.6:45:0.35', 'volume=2', 'aformat=channel_layouts=stereo'],
  },
  magic: {
    label: 'Varinha mágica (subindo)', base: 'pop', gain: 0.8, lead: 0.4,
    src: "aevalsrc='0.3*sin(2*PI*(700+1800*t)*t)*exp(-t*1.6)':d=1:s=44100",
    af: ['aecho=0.8:0.6:60:0.4', 'volume=2.2', 'aformat=channel_layouts=stereo'],
  },
  heartbeat: {
    label: 'Batimento cardíaco', base: 'whoosh', gain: 0.9, lead: 0,
    src: "aevalsrc='sin(2*PI*55*t)*(exp(-mod(t,0.9)*12)+0.7*exp(-abs(mod(t,0.9)-0.22)*28))':d=1.8:s=44100",
    af: ['lowpass=f=220', 'volume=1.05', 'aformat=channel_layouts=stereo'],
  },
  scratch: {
    label: 'Disco arranhando', base: 'pop', gain: 0.7, lead: 0,
    src: "aevalsrc='(random(0)*2-1)*abs(sin(2*PI*7*t))':d=0.5:s=44100",
    af: ['bandpass=f=1400:w=900', 'volume=60', 'alimiter=limit=0.8', 'aformat=channel_layouts=stereo'],
  },
};

/** Categorias da biblioteca (como as do CapCut). */
export const SFX_CATEGORIES = {
  transicao: 'Transição',
  impacto: 'Impacto',
  interface: 'Interface e redes',
  divertido: 'Divertido e games',
  clima: 'Clima e brilho',
};
const SFX_CAT = {
  whoosh: 'transicao', swoosh: 'transicao', riser: 'transicao', whooshdown: 'transicao', swipe: 'transicao', rewind: 'transicao',
  impact: 'impacto', kick: 'impacto', boom: 'impacto', thud: 'impacto', bassdrop: 'impacto',
  shutter: 'interface', click: 'interface', typing: 'interface', pop: 'interface', bubble: 'interface', ding: 'interface', notify: 'interface', clock: 'interface',
  glitch: 'divertido', cash: 'divertido', error: 'divertido', success: 'divertido', fail: 'divertido', boing: 'divertido', coin: 'divertido', laser: 'divertido', zap: 'divertido', scratch: 'divertido',
  bling: 'clima', drone: 'clima', sparkle: 'clima', magic: 'clima', heartbeat: 'clima',
};
/** Categoria e duração (s) de cada som, para a biblioteca e a faixa S1 do editor. */
export function sfxInfo(type) {
  const s = SFX_LIBRARY[type];
  if (!s) return null;
  const m = /(?:^|[:=])d(?:uration)?=([\d.]+)/.exec(s.src);
  return { cat: SFX_CAT[type] || 'clima', dur: m ? Number(m[1]) : 0.5 };
}

const isType = (type) => Object.hasOwn(SFX_LIBRARY, type);

/** Gera (uma vez por tipo) o arquivo de cada SFX da biblioteca usado. */
async function synthSfx(work, types) {
  const files = {};
  for (const type of new Set(types)) {
    if (!isType(type)) continue;
    const s = SFX_LIBRARY[type];
    const file = path.join(work, `sfx_${type}.wav`);
    await runFfmpeg(['-f', 'lavfi', '-i', s.src, '-af', s.af.join(','), '-ac', '2', '-y', file], { label: `sfx-${type}` });
    files[type] = file;
  }
  return files;
}

/** Arquivo do som (gerado uma vez em cache) para ouvir na prévia do editor. */
export async function sfxPreviewFile(type, cacheDir) {
  if (!isType(type)) return null;
  const file = path.join(cacheDir, `sfx-preview-${type}.wav`);
  try {
    await fs.access(file);
    return file;
  } catch {
    /* ainda não gerado */
  }
  await fs.mkdir(cacheDir, { recursive: true });
  const s = SFX_LIBRARY[type];
  await runFfmpeg(['-f', 'lavfi', '-i', s.src, '-af', s.af.join(','), '-ac', '2', '-y', file], { label: `sfx-preview-${type}` });
  return file;
}

/**
 * Monta o filter_complex que mixa os SFX no áudio original nos tempos dos eventos.
 * Puro/exportado para teste. Retorna { filter, order } onde `order` são os tipos
 * de SFX na ordem dos inputs extras (input 0 = vídeo original).
 * `t` é o MOMENTO do efeito; o início do som já desconta o `lead` do tipo.
 * @param {Array<{t:number,type:string}>} events
 */
export function buildSfxMix(events, opts = {}) {
  const lv = LEVELS[opts.intensity] || LEVELS.medio;
  const list = (events || [])
    .filter((e) => e && Number.isFinite(e.t) && e.t >= 0 && isType(e.type))
    .map((e) => ({ ...e, at: Math.max(0, e.t - SFX_LIBRARY[e.type].lead) }))
    .sort((a, b) => a.at - b.at)
    .slice(0, opts.max ?? 80);
  // Os cliques (tick) chegam prontos numa faixa só (opts.tickTrack), como mais uma entrada.
  if (!list.length && !opts.tickTrack) return null;

  const parts = [];
  const order = [];
  list.forEach((e, i) => {
    const s = SFX_LIBRARY[e.type];
    // volume de cada som colocado à mão (0–2, como o do CapCut); o padrão é 1
    const vol = +(lv[s.base] * s.gain * (Number.isFinite(Number(e.volume)) ? Math.max(0, Math.min(2, Number(e.volume))) : 1)).toFixed(3);
    const ms = Math.round(e.at * 1000);
    const idx = i + 1; // input 0 é o vídeo original
    parts.push(`[${idx}:a]adelay=${ms}|${ms},volume=${vol}[e${i}]`);
    order.push(e.type);
  });
  const labels = list.map((_, i) => `[e${i}]`);
  if (opts.tickTrack) {
    parts.push(`[${list.length + 1}:a]aformat=channel_layouts=stereo,volume=${lv.tick}[ticks]`);
    labels.push('[ticks]');
    order.push('ticks');
  }
  // normalize=0 mantém o áudio original no volume; SFX somam por cima; limiter evita clip.
  parts.push(`[0:a]${labels.join('')}amix=inputs=${labels.length + 1}:normalize=0:dropout_transition=0,alimiter=limit=0.95[aout]`);
  return { filter: parts.join(';'), order };
}

/**
 * Aplica os efeitos sonoros ao vídeo (mantém o vídeo, remixa só o áudio).
 * @param {Array<{t:number,type:string}>} events momentos (na timeline final); 'tick' = tecla por palavra
 * @returns {Promise<{output:string, applied:boolean, count:number}>}
 */
export async function applySoundEffects(input, work, meta, events, options, onProgress) {
  if (!meta.hasAudio) {
    log.info('sem áudio; pulando efeitos sonoros');
    return { output: input, applied: false, count: 0 };
  }
  const ticks = (events || []).filter((e) => e?.type === 'tick').map((e) => e.t);
  let tickPath = null;
  if (ticks.length) {
    tickPath = path.join(work, 'sfx_ticks.wav');
    const samples = await loadKeySamples();
    await fs.writeFile(tickPath, tickTrackWav(ticks, meta.duration || Math.max(...ticks) + 1, samples.length ? { samples, gain: 0.6 } : {}));
  }
  const mix = buildSfxMix(events, { intensity: options.sfxIntensity, tickTrack: !!tickPath });
  if (!mix) return { output: input, applied: false, count: 0 };

  const files = await synthSfx(work, mix.order);
  const output = path.join(work, 'sfx.mp4');
  const args = ['-i', input];
  for (const type of mix.order) args.push('-i', type === 'ticks' ? tickPath : files[type]);
  args.push(
    '-filter_complex', mix.filter,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-y', output,
  );

  await runFfmpeg(args, { label: 'sfx', totalDuration: meta.duration, onProgress });
  const count = mix.order.filter((t) => t !== 'ticks').length + ticks.length;
  const byType = {};
  for (const t of mix.order) if (t !== 'ticks') byType[t] = (byType[t] || 0) + 1;
  if (ticks.length) byType.tick = ticks.length;
  log.ok(`efeitos sonoros mixados (${count}: ${Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', ')})`);
  return { output, applied: true, count, byType };
}
