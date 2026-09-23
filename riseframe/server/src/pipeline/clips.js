import path from 'node:path';
import fs from 'node:fs/promises';
import { probeSummary } from './ffmpeg.js';
import { remapTranscript, remuxByKeepSegments } from './timeline.js';
import { burnCaptions } from './captions.js';
import { colorFilter } from './color.js';
import { finalRender } from './render.js';
import { extractThemes } from './analyze.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('clips');

// Palavras-gatilho que costumam marcar um bom momento de corte curto.
const HOOKS = new Set(
  ('como porque segredo dica dicas erro erros nunca sempre importante atenção incrível ' +
    'melhor pior primeiro passo truque verdade ninguém descobri resultado transformar ' +
    'você precisa vou mostrar olha veja imagina')
    .split(/\s+/),
);

// Palavras que ABREM dependendo do que veio antes (o clipe começa "no meio" e
// fica sem contexto se começar por elas): conectivos e pronomes de referência.
const CONTEXT_OPENERS = new Set(
  ('e mas porque porém porem então entao aí ai daí dai pois logo assim portanto ' +
    'isso isto esse essa esses essas aquilo aquele aquela ele ela eles elas dele dela ' +
    'ou seja além alem também tambem por depois antes')
    .split(/\s+/),
);

function firstContentWord(segs) {
  const t = String(segs?.[0]?.text || '').toLowerCase();
  const m = t.match(/[a-záàâãéêíóôõúüç0-9]+/i);
  return m ? m[0] : '';
}

function windowText(segs) {
  return segs.map((s) => s.text).join(' ');
}

/**
 * Particiona a transcrição em janelas naturais (quebra em pausas grandes ou ao
 * atingir o comprimento-alvo) e pontua cada uma por sinais de engajamento.
 * Puro/exportado para teste.
 * @returns {Array<{start,end,title,score,words}>}
 */
export function findHighlights(transcript, meta, options = {}) {
  const minLen = options.clipMin ?? 15;
  const maxLen = options.clipMax ?? 50;
  const count = options.clipsCount ?? 3;
  const segments = transcript?.segments || [];
  if (!segments.length) return [];

  // 1) monta janelas
  const windows = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const start = cur[0].start;
    const end = cur[cur.length - 1].end;
    if (end - start >= Math.min(minLen, 4)) windows.push({ segs: cur, start, end });
    cur = [];
  };
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    cur.push(seg);
    const start = cur[0].start;
    const dur = seg.end - start;
    const gapNext = i + 1 < segments.length ? segments[i + 1].start - seg.end : 99;
    if (dur >= maxLen || (dur >= minLen && gapNext > 0.7)) flush();
  }
  flush();
  if (!windows.length) return [];

  // 2) pontua
  const scored = windows.map((w) => {
    const dur = Math.max(1, w.end - w.start);
    const words = w.segs.reduce((a, s) => a + (s.words?.length || s.text.split(/\s+/).length), 0);
    const text = windowText(w.segs).toLowerCase();
    const tokens = text.split(/[^a-záàâãéêíóôõúüç0-9]+/i).filter(Boolean);
    const unique = new Set(tokens.filter((t) => t.length >= 5)).size;
    const hookHits = tokens.filter((t) => HOOKS.has(t)).length;
    const hasQuestion = /\?/.test(text) ? 1 : 0;
    const hasNumber = /\d/.test(text) ? 1 : 0;

    const pace = words / dur; // palavras/seg (fala densa engaja)
    const density = unique / dur; // informação por segundo
    // encaixe de duração: melhor entre 20–45s
    const lenFit = dur >= 20 && dur <= 45 ? 1 : dur < 20 ? dur / 20 : Math.max(0.3, 45 / dur);

    // CONTEXTO: penaliza clipe que começa "no meio" (por conectivo/pronome) e
    // premia clipe que termina numa frase completa (pontuação final). Assim o
    // corte curto tende a ser autoexplicativo, não um pedaço solto.
    const opensCold = CONTEXT_OPENERS.has(firstContentWord(w.segs)) ? 1 : 0;
    const endsComplete = /[.!?]\s*$/.test(windowText(w.segs).trim()) ? 1 : 0;

    const score =
      pace * 1.0 + density * 2.0 + hookHits * 1.5 + hasQuestion * 1.2 + hasNumber * 0.6 + lenFit * 1.5
      - opensCold * 2.5 + endsComplete * 1.0;

    const themes = extractThemes(text, 3).map((t) => t.term);
    const title = titleFor(w.segs, themes);
    return { start: w.start, end: w.end, title, score: Math.round(score * 100) / 100, words };
  });

  // 3) top N (já não se sobrepõem — são partições), ordenados por tempo na saída
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.start - b.start);
}

function titleFor(segs, themes) {
  const words = (segs[0]?.text || '').split(/\s+/).slice(0, 6).join(' ');
  const base = themes[0] ? themes[0][0].toUpperCase() + themes[0].slice(1) : words;
  return (base || 'Clipe').slice(0, 48);
}

/**
 * Gera os clipes curtos: para cada janela, corta a fonte, remapeia a transcrição,
 * queima legendas, aplica o grade e reframe. Reutiliza os módulos do pipeline.
 * @returns {Promise<Array>} clips com {index,start,end,title,file,durationSec}
 */
export async function generateClips(ctx, onProgress = () => {}) {
  const { source, work, outputsDir, jobId, transcript, meta, options } = ctx;
  const windows = findHighlights(transcript, meta, options);
  if (!windows.length) throw new Error('não foi possível identificar trechos para clipes');

  const aspect = options.clipAspect || '9:16';
  const results = [];

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const base = (i + 0) / windows.length;
    const span = 1 / windows.length;
    const prog = (p) => onProgress(base + Math.max(0, Math.min(1, p)) * span);

    const cwork = path.join(work, `clip${i}`);
    await fs.mkdir(cwork, { recursive: true });

    // 1) corta a fonte para a janela — com uma pequena folga (lead-in/out) para
    //    não decepar a 1ª/última palavra e dar um respiro de contexto.
    const leadIn = 0.4;
    const leadOut = 0.35;
    const keep = [{ start: Math.max(0, w.start - leadIn), end: Math.min(meta.duration, w.end + leadOut) }];
    const cut = await remuxByKeepSegments(source, cwork, meta, keep, () => {}, 'clipcut');
    let input = cut.output;
    const trackInput = input; // corte limpo (antes das legendas) para o tracker de reframe
    let cmeta = await probeSummary(input);

    // 2) transcrição local (remapeada para 0..dur, palavras da janela)
    const localTranscript = remapTranscript(transcript, keep);

    // 3) legendas
    if (options.captions !== false) {
      const style = {
        template: options.captionTemplate || 'pop', // clipes: default palavra-a-palavra
        color: options.captionColor || 'white',
        font: options.captionFont || 'auto',
        animation: options.captionAnimation || 'auto',
        fontScale: options.captionScale || 1,
        mode: options.captionMode,
      };
      const r = await burnCaptions(input, cwork, cmeta, localTranscript, style, () => {});
      input = r.output;
    }
    prog(0.5);

    // 4) color grade (auto por padrão) — aplicado dentro do render final
    const colorLook = options.colorLook || 'auto';
    const { vf: colorVf } = await colorFilter(input, { ...options, colorLook });

    // 5) cor + reframe + render final → outputs/<jobId>_clipN.mp4
    const clipId = `${jobId}_clip${i}`;
    const r = await finalRender(input, outputsDir, clipId, cmeta, { ...options, aspect, trackInput, colorVf }, () => {});
    prog(1);

    results.push({
      index: i,
      start: Math.round(w.start * 10) / 10,
      end: Math.round(w.end * 10) / 10,
      title: w.title,
      score: w.score,
      durationSec: Math.round((w.end - w.start) * 10) / 10,
      file: path.basename(r.output),
      aspect,
    });
    await fs.rm(cwork, { recursive: true, force: true });
    log.ok(`clipe ${i + 1}/${windows.length}: "${w.title}" (${results[i].durationSec}s)`);
  }

  return results;
}
