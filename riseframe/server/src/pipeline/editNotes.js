// Notas de edição faladas: durante a gravação a pessoa fala "nota de edição, usa o take
// anterior, fim da nota". O trecho inteiro da nota sai do vídeo (as palavras viram
// `removed`, como a limpeza da fala) e o texto da nota vai para o relatório — assim ela
// lê o que pediu ao editor, e nada disso aparece no vídeo final.

import { DEFAULT_NOTE_OPEN, DEFAULT_NOTE_CLOSE } from '../../../shared/editFlow.js';

/** Minúsculas, sem acento e sem pontuação ("Edição," → "edicao"). */
export function normWord(w) {
  return String(w || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** Frase → tokens normalizados (vazios fora). */
export function phraseTokens(phrase) {
  return String(phrase || '').split(/\s+/).map(normWord).filter(Boolean);
}

// A transcrição troca as preposições curtas com frequência ("nota da edição").
const LINKS = new Set(['de', 'da', 'do', 'di', 'du', 'e']);
const tokenMatch = (a, b) => a === b || (LINKS.has(a) && LINKS.has(b));

/**
 * Procura a frase `tokens` na lista de palavras a partir de `from`. Uma palavra da
 * transcrição pode juntar duas da frase ("fimda") — por isso compara também a junção.
 * @returns {{start:number,end:number}|null} índices da 1ª e da última palavra
 */
function findPhrase(list, tokens, from) {
  if (!tokens.length) return null;
  for (let i = from; i < list.length; i++) {
    let k = 0; // token da frase
    let j = i; // palavra da transcrição
    while (k < tokens.length && j < list.length) {
      const n = list[j].n;
      if (!n) { j++; continue; } // pontuação solta
      if (tokenMatch(n, tokens[k])) { k++; j++; continue; }
      const two = k + 1 < tokens.length ? tokens[k] + tokens[k + 1] : null;
      if (two && n === two) { k += 2; j++; continue; }
      break;
    }
    if (k === tokens.length && list[i].n) return { start: i, end: j - 1 };
  }
  return null;
}

/**
 * Marca as notas faladas como removidas. Não muta a transcrição recebida.
 * Sem a frase de fechamento (esqueceu de falar): a nota vai até o fim da frase em que
 * começou (até `maxSeconds`), para nunca engolir o resto do vídeo.
 * @param {object} transcript {segments:[{start,end,text,words:[{start,end,word,removed?}]}]}
 * @param {{open?:string, close?:string, maxSeconds?:number}} opts
 * @returns {{transcript:object, notes:Array<{start:number,end:number,text:string,closed:boolean}>}}
 */
export function markEditNotes(transcript, opts = {}) {
  const open = phraseTokens(opts.open || DEFAULT_NOTE_OPEN);
  const close = phraseTokens(opts.close || DEFAULT_NOTE_CLOSE);
  const maxSeconds = Number(opts.maxSeconds) > 0 ? Number(opts.maxSeconds) : 90;
  const segments = (transcript?.segments || []).map((seg) => ({ ...seg, words: (seg.words || []).map((w) => ({ ...w })) }));
  const list = [];
  segments.forEach((seg, si) => seg.words.forEach((w) => list.push({ w, si, n: normWord(w.word) })));
  const notes = [];
  if (!open.length || !list.length) return { transcript: { ...transcript, segments }, notes };

  let i = 0;
  while (i < list.length) {
    const o = findPhrase(list, open, i);
    if (!o) break;
    const t0 = Number(list[o.start].w.start);
    let c = findPhrase(list, close, o.end + 1);
    if (c && Number(list[c.end].w.end) - t0 > maxSeconds) c = null;
    // não pode haver outra nota aberta antes do fechamento: a 2ª abertura fecha a 1ª
    const nextOpen = findPhrase(list, open, o.end + 1);
    if (c && nextOpen && nextOpen.start < c.start) c = null;
    let last;
    if (c) last = c.end;
    else {
      // fim da frase (segmento) da abertura, sem passar do tempo máximo nem da próxima nota
      last = o.end;
      for (let j = o.end + 1; j < list.length; j++) {
        if (list[j].si !== list[o.start].si) break;
        if (nextOpen && j >= nextOpen.start) break;
        if (Number(list[j].w.end) - t0 > maxSeconds) break;
        last = j;
      }
    }
    const body = list.slice(o.end + 1, c ? c.start : last + 1).map((x) => String(x.w.word || '').trim()).filter(Boolean).join(' ');
    for (let j = o.start; j <= last; j++) {
      list[j].w.removed = true;
      list[j].w.editNote = true;
    }
    notes.push({
      start: +Number(list[o.start].w.start).toFixed(3),
      end: +Number(list[last].w.end).toFixed(3),
      text: body.replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, ''),
      closed: Boolean(c),
    });
    i = last + 1;
  }
  return { transcript: { ...transcript, segments }, notes };
}

/** Atalho do pipeline: aplica se `options.editNotes` estiver ligado. */
export function applyEditNotes(transcript, options = {}) {
  if (options.editNotes !== true) return { transcript, notes: [] };
  return markEditNotes(transcript, { open: options.editNoteOpen, close: options.editNoteClose });
}
