import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C, glass, fmtDuration } from '../theme.js';
import { PrimaryButton, GhostButton } from './ui.jsx';
import Icon from './Icon.jsx';
import { sourceUrl, filmstripUrl, getPeaks, suggestBrollMoments, uploadMedia } from '../api.js';
import { APP_VERSION } from '../version.js';
import CaptionPreview from './CaptionPreview.jsx';
import { BrollControls } from './OptionsPanel.jsx';

const PPS_MIN = 24;
const PPS_MAX = 240;

/**
 * Editor em timeline (fase 2): pré-visualiza o vídeo original, mostra as legendas
 * como blocos numa linha do tempo sincronizada com o player e deixa:
 * - navegar (clique na régua) e selecionar trechos
 * - CORTAR arrastando as bordas do bloco (trim), palavra a palavra ou trecho inteiro
 * - DIVIDIR um trecho no playhead e JUNTAR com o próximo
 * - corrigir o texto (duplo-clique na palavra)
 * "Renderizar" reprocessa com a transcrição editada.
 */
export default function TimelineEditor({ transcript, durationSec, sourceId, catalog, options, onGenerate, onBack, onSettings, busy }) {
  const cap0 = options || {};
  // Ajustes de legenda editáveis aqui na timeline (posição, fonte, estilo, etc.).
  const [cap, setCap] = useState({
    captions: cap0.captions !== false,
    captionTemplate: cap0.captionTemplate || 'clean',
    captionFont: cap0.captionFont || 'auto',
    captionColor: cap0.captionColor || 'white',
    captionBackground: cap0.captionBackground || 'auto',
    captionPosition: cap0.captionPosition || 'auto',
    captionMode: cap0.captionMode || 'auto',
    captionScale: cap0.captionScale || 1,
  });
  const setCapField = (patch) => setCap((c) => ({ ...c, ...patch }));
  const [tab, setTab] = useState('enquadramento');
  const [peaks, setPeaks] = useState([]);
  // Ajustes de B-roll editáveis aqui na timeline (sobrepõem os das opções).
  const [brollOpts, setBrollOpts] = useState({
    broll: options?.broll === true,
    imageSource: options?.imageSource,
    niche: options?.niche,
    brollLayout: options?.brollLayout,
    personCrop: options?.personCrop,
  });
  const brollOn = brollOpts.broll === true;
  // Momentos de B-roll no tempo do vídeo ORIGINAL. off = o usuário tirou.
  const [broll, setBroll] = useState([]);
  const [brollLoading, setBrollLoading] = useState(false);
  const rangeDragRef = useRef(null);
  // Volume da fala: geral, mudo e trechos com volume próprio (tempo original).
  const [audioMute, setAudioMute] = useState(options?.audioMute === true);
  const [audioVolume, setAudioVolume] = useState(Number(options?.audioVolume ?? 1));
  const [gains, setGains] = useState([]);
  // Trechos cortados à mão na faixa de vídeo (tempo original).
  const [cuts, setCuts] = useState([]);
  const drawRef = useRef(null);
  const [drawing, setDrawing] = useState(null);
  // Corte marcado pelo playhead: guarda o início até o usuário fechar no fim.
  const [cutStart, setCutStart] = useState(null);
  const wave = useMemo(() => wavePath(peaks), [peaks]);
  useEffect(() => {
    let vivo = true;
    getPeaks(sourceId).then((p) => { if (vivo) setPeaks(p); }).catch(() => {});
    return () => { vivo = false; };
  }, [sourceId]);

  useEffect(() => {
    if (!brollOn) return undefined;
    let vivo = true;
    setBrollLoading(true);
    suggestBrollMoments(sourceId, { ...options, ...brollOpts })
      .then((ms) => {
        if (!vivo) return;
        setBroll(ms.map((m, i) => ({ key: `b${i}`, start: m.start, end: m.end, query: m.query || '', off: false })));
      })
      .catch(() => {})
      .finally(() => { if (vivo) setBrollLoading(false); });
    return () => { vivo = false; };
    // options muda de identidade a cada render do pai; só estes valores mudam a sugestão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, brollOn, brollOpts.niche]);
  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const previewBoxRef = useRef(null);
  const panRef = useRef(null); // arraste na prévia: {startX,startY,fx,fy,w,h,zoom}
  const trackRef = useRef(null);
  const dragRef = useRef(null); // { si, edge: 'left'|'right' }
  const mediaDragRef = useRef(null); // { key, mode: 'move'|'left'|'right', x0, start0, dur0 }
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState(0);
  const [pps, setPps] = useState(64); // zoom da timeline (pixels por segundo)
  const zoomTl = (dir) => setPps((p) => Math.max(PPS_MIN, Math.min(PPS_MAX, Math.round(p * (dir > 0 ? 1.4 : 1 / 1.4)))));

  // Enquadramento no rosto (tela dividida): 'auto' detecta o rosto no servidor;
  // 'manual' usa o foco (arrastável) + zoom escolhidos aqui.
  const [framingMode, setFramingMode] = useState('manual');
  const [focus, setFocus] = useState({ x: 0.5, y: 0.4 });
  const [zoom, setZoom] = useState(1);
  const [personSide, setPersonSide] = useState('top'); // só p/ a prévia da composição
  const [media, setMedia] = useState([]); // minhas mídias na timeline (imagens/vídeos/músicas)
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaErr, setMediaErr] = useState('');
  const mediaInputRef = useRef(null);
  const framingBoxRef = useRef(null);
  const focusDragRef = useRef(false);

  const [segments, setSegments] = useState(() =>
    (transcript.segments || []).map((s) => ({
      ...s,
      words: (s.words?.length ? s.words : [{ start: s.start, end: s.end, word: s.text }]).map((w) => ({ ...w, removed: !!w.removed })),
    })),
  );

  const dur = durationSec || segments.reduce((m, s) => Math.max(m, s.end || 0), 0) || 1;
  const width = Math.max(320, Math.round(dur * pps));

  // ── Pausas de silêncio (gaps entre palavras mantidas). O usuário decide, na
  // timeline, quais cortar. Por padrão TODA pausa visível é cortada (o cliente
  // reclamou que sobrava silêncio); clicar numa pausa a preserva.
  const MIN_PAUSE = 0.28; // só mostra/oferece corte a partir daqui (mais sensível = corta mais silêncio)
  const [keptPauses, setKeptPauses] = useState(() => new Set());
  const pauseKey = (p) => p.start.toFixed(2);

  const flatWords = useMemo(() => {
    const arr = [];
    for (const s of segments) for (const w of s.words) if (!w.removed) arr.push(w);
    return arr.sort((a, b) => a.start - b.start);
  }, [segments]);

  const pauses = useMemo(() => {
    const out = [];
    if (flatWords.length) {
      const lead = flatWords[0].start;
      if (lead >= MIN_PAUSE) out.push({ start: 0, end: flatWords[0].start, dur: lead });
      for (let i = 0; i < flatWords.length - 1; i++) {
        const gap = flatWords[i + 1].start - flatWords[i].end;
        if (gap >= MIN_PAUSE) out.push({ start: flatWords[i].end, end: flatWords[i + 1].start, dur: gap });
      }
      const last = flatWords[flatWords.length - 1].end;
      if (dur - last >= MIN_PAUSE) out.push({ start: last, end: dur, dur: dur - last });
    }
    return out;
  }, [flatWords, dur]);

  const isPauseCut = (p) => !keptPauses.has(pauseKey(p));
  function togglePause(p) {
    setKeptPauses((prev) => {
      const n = new Set(prev);
      const k = pauseKey(p);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }
  function cutAllPauses() { setKeptPauses(new Set()); }
  function keepAllPauses() { setKeptPauses(new Set(pauses.map(pauseKey))); }
  const pausesCut = pauses.filter(isPauseCut);
  const pauseCutSec = pausesCut.reduce((a, p) => a + p.dur, 0);

  // ── sincroniza o vídeo ↔ timeline
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const onTime = () => setCur(v.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); };
  }, []);

  // ── arrastar bordas dos blocos (trim) — listeners globais durante o arrasto
  useEffect(() => {
    function move(e) {
      const d = dragRef.current;
      if (!d) return;
      applyTrim(d.si, d.edge, timeAtClientX(e.clientX));
    }
    function up() {
      if (dragRef.current) { dragRef.current = null; document.body.style.userSelect = ''; }
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  // ── arrastar/redimensionar os blocos de mídia direto na régua ──
  useEffect(() => {
    function move(e) {
      const d = mediaDragRef.current;
      if (!d) return;
      const dt = (e.clientX - d.x0) / pps;
      const maxDur = d.kind === 'audio' ? dur : Math.min(d.srcDuration || dur, dur);
      if (d.mode === 'move') {
        const start = Math.max(0, Math.min(d.start0 + dt, dur - Math.min(d.dur0, dur)));
        updateMedia(d.key, { start: +start.toFixed(2) });
      } else if (d.mode === 'right') {
        const duration = Math.max(0.3, Math.min(d.dur0 + dt, maxDur, dur - d.start0));
        updateMedia(d.key, { duration: +duration.toFixed(2) });
      } else { // left
        const start = Math.max(0, Math.min(d.start0 + dt, d.start0 + d.dur0 - 0.3));
        const duration = Math.min(d.start0 + d.dur0 - start, maxDur);
        updateMedia(d.key, { start: +start.toFixed(2), duration: +duration.toFixed(2) });
      }
    }
    function up() {
      if (mediaDragRef.current) { mediaDragRef.current = null; document.body.style.userSelect = ''; }
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [pps, dur]);

  // Arrastar/redimensionar faixas de tempo (B-roll e trechos de volume).
  useEffect(() => {
    function move(e) {
      const d = rangeDragRef.current;
      if (!d) return;
      const dt = (e.clientX - d.x0) / pps;
      d.setList((list) => list.map((r) => {
        if (r.key !== d.key) return r;
        if (d.mode === 'move') {
          const start = Math.max(0, Math.min(d.start0 + dt, dur - (d.end0 - d.start0)));
          return { ...r, start: +start.toFixed(2), end: +(start + (d.end0 - d.start0)).toFixed(2) };
        }
        if (d.mode === 'right') return { ...r, end: +Math.min(dur, Math.max(d.start0 + 0.4, d.end0 + dt)).toFixed(2) };
        return { ...r, start: +Math.max(0, Math.min(d.end0 - 0.4, d.start0 + dt)).toFixed(2) };
      }));
    }
    function up() {
      if (rangeDragRef.current) { rangeDragRef.current = null; document.body.style.userSelect = ''; }
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [pps, dur]);

  // Desenhar um corte arrastando sobre a faixa de vídeo.
  useEffect(() => {
    function move(e) {
      const d = drawRef.current;
      if (!d) return;
      const t = Math.max(0, Math.min(dur, (e.clientX - d.left) / pps));
      d.cur = t;
      setDrawing({ start: Math.min(d.t0, t), end: Math.max(d.t0, t) });
    }
    function up() {
      const d = drawRef.current;
      if (!d) return;
      drawRef.current = null;
      document.body.style.userSelect = '';
      setDrawing(null);
      const a = Math.min(d.t0, d.cur ?? d.t0);
      const b = Math.max(d.t0, d.cur ?? d.t0);
      // Clique seco (sem arrastar) não vira corte — seria fácil criar um sem querer.
      if (b - a > 0.15) setCuts((l) => [...l, { key: `c${Date.now()}`, start: +a.toFixed(2), end: +b.toFixed(2) }]);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [pps, dur]);

  function startCutDraw(e) {
    if (e.button !== 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(dur, (e.clientX - box.left) / pps));
    drawRef.current = { t0: t, cur: t, left: box.left };
    setDrawing({ start: t, end: t });
    e.stopPropagation();
    e.preventDefault();
    document.body.style.userSelect = 'none';
  }

  function startRangeDrag(setList, r, mode, e) {
    e.stopPropagation();
    e.preventDefault();
    rangeDragRef.current = { setList, key: r.key, mode, x0: e.clientX, start0: r.start, end0: r.end };
    document.body.style.userSelect = 'none';
  }

  function startMediaDrag(m, mode, e) {
    e.stopPropagation();
    e.preventDefault();
    mediaDragRef.current = { key: m.key, mode, x0: e.clientX, start0: m.start, dur0: m.duration, kind: m.kind, srcDuration: m.srcDuration };
    document.body.style.userSelect = 'none';
  }

  function timeAtClientX(clientX) {
    const el = trackRef.current;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(dur, (clientX - r.left + el.scrollLeft) / pps));
  }

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const x = cur * pps;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
  }, [cur]);

  function seek(t) { const v = videoRef.current; const c = Math.max(0, Math.min(dur, t)); if (v) v.currentTime = c; setCur(c); }
  function togglePlay() { const v = videoRef.current; if (!v) return; if (v.paused) v.play(); else v.pause(); }
  function onTrackClick(e) { seek(timeAtClientX(e.clientX)); }

  // Foco do enquadramento: mapeia o ponteiro para 0–1 sobre a área REAL do vídeo
  // (considera as barras do objectFit=contain).
  function setFocusFromClient(clientX, clientY) {
    const v = videoRef.current;
    if (!v) return;
    const rect = v.getBoundingClientRect();
    const vw = v.videoWidth || rect.width;
    const vh = v.videoHeight || rect.height;
    const scale = Math.min(rect.width / vw, rect.height / vh) || 1;
    const cw = vw * scale;
    const ch = vh * scale;
    const offX = rect.left + (rect.width - cw) / 2;
    const offY = rect.top + (rect.height - ch) / 2;
    const x = cw ? (clientX - offX) / cw : 0.5;
    const y = ch ? (clientY - offY) / ch : 0.5;
    setFocus({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  }
  useEffect(() => {
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    function move(e) {
      if (focusDragRef.current) { e.preventDefault(); setFocusFromClient(e.clientX, e.clientY); return; }
      if (panRef.current) {
        e.preventDefault();
        const p = panRef.current;
        // Arrastar a imagem move o enquadramento no sentido inverso (arrastar p/ direita
        // mostra mais da esquerda). Divide pelo zoom p/ um ajuste mais fino quando ampliado.
        const dx = (e.clientX - p.startX) / (p.w * p.zoom);
        const dy = (e.clientY - p.startY) / (p.h * p.zoom);
        setFocus({ x: clamp01(p.fx - dx), y: clamp01(p.fy - dy) });
      }
    }
    function up() { focusDragRef.current = false; panRef.current = null; }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  const clampZoom = (z) => Math.min(3, Math.max(1, Math.round(z * 100) / 100));
  // Rolagem do mouse sobre a prévia = zoom (listener nativo para poder travar o scroll da página).
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    function onWheel(e) { e.preventDefault(); setZoom((z) => clampZoom(z + (e.deltaY < 0 ? 0.1 : -0.1))); }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [framingMode]);

  // faixa mantida (não cortada) de um trecho
  function keptRange(s) {
    const kept = s.words.filter((w) => !w.removed);
    if (!kept.length) return null;
    return [Math.min(...kept.map((w) => w.start)), Math.max(...kept.map((w) => w.end))];
  }

  // trim: arrastar a borda esquerda/direita corta as palavras fora da faixa mantida
  function applyTrim(si, edge, t) {
    setSegments((prev) => prev.map((s, i) => {
      if (i !== si) return s;
      const kr = keptRange(s) || [s.start, s.end];
      let [left, right] = kr;
      if (edge === 'left') left = Math.max(s.start, Math.min(t, right - 0.15));
      else right = Math.min(s.end, Math.max(t, left + 0.15));
      return { ...s, words: s.words.map((w) => { const mid = (w.start + w.end) / 2; return { ...w, removed: mid < left - 0.001 || mid > right + 0.001 }; }) };
    }));
  }

  function startDrag(si, edge, e) { e.stopPropagation(); e.preventDefault(); setSel(si); dragRef.current = { si, edge }; document.body.style.userSelect = 'none'; }

  function splitAtPlayhead() {
    const idx = segments.findIndex((s) => cur > s.start + 0.05 && cur < s.end - 0.05);
    if (idx < 0) return;
    const s = segments[idx];
    const a = s.words.filter((w) => (w.start + w.end) / 2 <= cur);
    const b = s.words.filter((w) => (w.start + w.end) / 2 > cur);
    if (!a.length || !b.length) return;
    const segA = { ...s, end: a[a.length - 1].end, words: a };
    const segB = { ...s, start: b[0].start, words: b };
    setSegments((prev) => [...prev.slice(0, idx), segA, segB, ...prev.slice(idx + 1)]);
    setSel(idx);
  }
  function mergeNext(si) {
    setSegments((prev) => {
      if (si >= prev.length - 1) return prev;
      const a = prev[si]; const b = prev[si + 1];
      const merged = { ...a, end: b.end, words: [...a.words, ...b.words] };
      return [...prev.slice(0, si), merged, ...prev.slice(si + 2)];
    });
  }

  const activeIndex = useMemo(() => segments.findIndex((s) => cur >= s.start && cur < (s.end || s.start + 0.1)), [segments, cur]);
  // Segundos cobertos por pausas cortadas + cortes da faixa de vídeo, unindo os
  // trechos que se sobrepõem para não descontar o mesmo pedaço duas vezes.
  const cortadoSec = useMemo(() => {
    const rs = [...pausesCut.map((p) => ({ start: p.start, end: p.end })), ...cuts]
      .sort((a, b) => a.start - b.start);
    let total = 0, fim = -1;
    for (const r of rs) {
      const ini = Math.max(r.start, fim);
      if (r.end > ini) { total += r.end - ini; fim = r.end; }
    }
    return total;
  }, [pausesCut, cuts]);
  const stats = useMemo(() => {
    let total = 0, removed = 0, removedSec = 0;
    for (const s of segments) for (const w of s.words) { total++; if (w.removed) { removed++; removedSec += Math.max(0, w.end - w.start); } }
    const keptSec = Math.max(0, dur - removedSec - cortadoSec);
    return { total, removed, removedSec, keptSec };
  }, [segments, dur, cortadoSec]);
  const segRemoved = (s) => s.words.every((w) => w.removed);
  const canSplit = segments.some((s) => cur > s.start + 0.05 && cur < s.end - 0.05);

  function toggleSeg(si) { setSegments((prev) => prev.map((s, i) => { if (i !== si) return s; const gone = segRemoved(s); return { ...s, words: s.words.map((w) => ({ ...w, removed: !gone })) }; })); }
  function toggleWord(si, wi) { setSegments((prev) => prev.map((s, i) => (i !== si ? s : { ...s, words: s.words.map((w, j) => (j !== wi ? w : { ...w, removed: !w.removed })) }))); }
  function editWord(si, wi) {
    const next = window.prompt('Corrigir a palavra (muda a legenda, não o corte):', segments[si].words[wi].word);
    if (next == null) return;
    setSegments((prev) => prev.map((s, i) => (i !== si ? s : { ...s, words: s.words.map((w, j) => (j !== wi ? w : { ...w, word: next })) })));
  }

  async function onPickMedia(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // permite reenviar o mesmo arquivo
    if (!files.length) return;
    setMediaErr('');
    setMediaBusy(true);
    try {
      for (const file of files) {
        const info = await uploadMedia(file);
        const srcDur = Number(info.durationSec) || (info.kind === 'image' ? 4 : 5);
        setMedia((prev) => [
          ...prev,
          {
            key: `${info.id}-${prev.length}-${Date.now()}`,
            mediaId: info.id,
            kind: info.kind,
            filename: info.filename || file.name,
            srcDuration: srcDur,
            start: +cur.toFixed(2), // entra no ponto atual do playhead
            duration: info.kind === 'audio' ? Math.min(srcDur, dur) : Math.min(info.kind === 'image' ? 4 : srcDur, 8),
            mode: 'cover', // cobre a tela (visual). PiP = canto.
            volume: 0.35, // música de fundo
            scale: 0.4, // tamanho do PiP
            px: 0.62,
            py: 0.06,
            opacity: 1,
          },
        ]);
      }
    } catch (err) {
      setMediaErr(err.message || 'falha ao enviar a mídia');
    } finally {
      setMediaBusy(false);
    }
  }
  const updateMedia = (key, patch) => setMedia((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const removeMedia = (key) => setMedia((prev) => prev.filter((m) => m.key !== key));

  function generate() {
    // Cortes de silêncio escolhidos: uma pequena folga interna evita cortar o
    // ataque/finalização das palavras vizinhas.
    const silenceCuts = pausesCut
      .map((p) => ({ start: p.start + Math.min(0.03, p.dur / 4), end: p.end - Math.min(0.03, p.dur / 4) }))
      .filter((c) => c.end - c.start > 0.02);
    onGenerate(
      {
        provider: transcript.provider,
        language: transcript.language,
        segments: segments.map((s) => ({ start: s.start, end: s.end, words: s.words.map((w) => ({ start: w.start, end: w.end, word: w.word, removed: !!w.removed })) })),
      },
      {
        manualSilence: true,
        silenceCuts,
        // Enquadramento (tela dividida): manual envia foco; auto deixa o servidor
        // detectar o rosto. Zoom vale para os dois.
        personZoom: +Number(zoom).toFixed(2),
        ...(framingMode === 'manual'
          ? { personFocusX: +focus.x.toFixed(3), personFocusY: +focus.y.toFixed(3) }
          : {}),
        // Ajustes de legenda escolhidos aqui na timeline (sobrepõem os das opções).
        ...cap,
        // Trechos cortados à mão na faixa de vídeo (tempo original).
        videoCuts: cuts.map((c) => ({ start: +c.start.toFixed(2), end: +c.end.toFixed(2) })),
        // Volume da fala (tempo original — este estágio roda antes dos cortes).
        audioMute,
        audioVolume: +Number(audioVolume).toFixed(2),
        audioGains: gains.map((g) => ({ start: +g.start.toFixed(2), end: +g.end.toFixed(2), volume: +Number(g.volume).toFixed(2) })),
        // B-roll: ajustes da aba + momentos da faixa (tempo original; o servidor
        // remapeia depois dos cortes).
        ...brollOpts,
        ...(brollOn
          ? { brollMoments: broll.filter((b) => !b.off).map((b) => ({ start: +b.start.toFixed(2), end: +b.end.toFixed(2), query: b.query })) }
          : {}),
        // Minhas mídias colocadas na timeline (imagens/vídeos/músicas próprias).
        userMedia: media.map((m) => ({
          mediaId: m.mediaId,
          kind: m.kind,
          start: +Number(m.start).toFixed(2),
          duration: +Number(m.duration).toFixed(2),
          mode: m.mode,
          volume: +Number(m.volume).toFixed(2),
          scale: +Number(m.scale).toFixed(2),
          px: +Number(m.px).toFixed(3),
          py: +Number(m.py).toFixed(3),
          opacity: +Number(m.opacity).toFixed(2),
        })),
      },
    );
  }

  const allGone = stats.removed >= stats.total;
  const selSeg = segments[sel];

  return (
    <div style={{ ...glass(), padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
        <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="film" size={20} strokeWidth={1.9} /></span>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Timeline · editar antes de renderizar</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.orange, background: 'rgba(255,107,53,0.14)', border: `1px solid ${C.orange}`, borderRadius: 999, padding: '2px 9px', letterSpacing: 0.4 }}>{APP_VERSION}</span>
        <GhostButton onClick={onBack} disabled={busy} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="arrowLeft" size={14} strokeWidth={2} /> Voltar
        </GhostButton>
      </div>

      <div className="rf-tl-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 420px) 1fr', gap: 18, alignItems: 'start' }}>
        <div>
          <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}`, background: '#000' }}>
            <video ref={videoRef} src={sourceUrl(sourceId)} style={{ width: '100%', display: 'block', maxHeight: 420, objectFit: 'contain', background: '#000' }} onClick={framingMode === 'manual' ? undefined : togglePlay} playsInline />
            {framingMode === 'manual' && (
              <div
                ref={framingBoxRef}
                onPointerDown={(e) => { e.preventDefault(); focusDragRef.current = true; setFocusFromClient(e.clientX, e.clientY); }}
                style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
                title="Arraste para escolher o ponto do rosto"
              >
                <div style={{ position: 'absolute', left: `${focus.x * 100}%`, top: `${focus.y * 100}%`, width: 34, height: 34, marginLeft: -17, marginTop: -17, borderRadius: '50%', border: `2px solid ${C.orange}`, boxShadow: '0 0 0 2px rgba(0,0,0,0.5), 0 0 14px rgba(0,0,0,0.6)', background: 'rgba(255,107,53,0.18)', pointerEvents: 'none' }} />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <button onClick={togglePlay} style={playBtn}><Icon name={playing ? 'pause' : 'play'} size={16} strokeWidth={2} /></button>
            <div style={{ fontSize: 12.5, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(cur)} <span style={{ color: C.faint }}>/ {fmtDuration(dur)}</span></div>
          </div>

        </div>

        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Chip label="Palavras" value={stats.total} color={C.text} />
            <Chip label="Cortadas" value={stats.removed} color={C.red} />
            <Chip label="Pausas cortadas" value={pausesCut.length} sub={pauseCutSec > 0.1 ? `−${fmtDuration(pauseCutSec)}` : null} color={C.orangeSoft} />
            <Chip label="Duração final" value={fmtDuration(stats.keptSec)} sub={(stats.removedSec + cortadoSec) > 0.1 ? `−${fmtDuration(stats.removedSec + cortadoSec)}` : null} color={C.green} />
          </div>

          {selSeg && (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: 0.4 }}>TRECHO {sel + 1}/{segments.length} · {fmtDuration(selSeg.start)}</div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => mergeNext(sel)} disabled={sel >= segments.length - 1} style={miniBtn(false, sel >= segments.length - 1)}>
                    <Icon name="arrowLeft" size={12} strokeWidth={2.2} style={{ transform: 'rotate(180deg)' }} /> Juntar
                  </button>
                  <button onClick={() => toggleSeg(sel)} style={miniBtn(segRemoved(selSeg))}>
                    <Icon name={segRemoved(selSeg) ? 'undo' : 'close'} size={12} strokeWidth={2.2} /> {segRemoved(selSeg) ? 'Reincluir' : 'Cortar trecho'}
                  </button>
                </div>
              </div>
              <div style={{ lineHeight: 2 }}>
                {selSeg.words.map((w, wi) => (
                  <span key={wi} onClick={() => toggleWord(sel, wi)} onDoubleClick={() => editWord(sel, wi)} title={`${w.start.toFixed(1)}s — clique corta, 2 cliques edita`}
                    style={{ display: 'inline-block', margin: '0 3px', padding: '2px 6px', borderRadius: 7, cursor: 'pointer', userSelect: 'none', textDecoration: w.removed ? 'line-through' : 'none', opacity: w.removed ? 0.42 : 1, background: w.removed ? 'rgba(240,82,107,0.14)' : 'transparent', color: w.removed ? C.red : C.text }}>
                    {w.word}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>Clique numa palavra para cortá-la · duplo-clique para corrigir · arraste as bordas do bloco na timeline</div>
            </div>
          )}
        </div>
      </div>

      {/* Barra de ferramentas da timeline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={splitAtPlayhead} disabled={!canSplit} style={toolBtn(!canSplit)}>
          <Icon name="scissors" size={14} strokeWidth={2} /> Dividir no playhead
        </button>
        <span style={{ width: 1, height: 20, background: C.border, margin: '0 2px' }} />
        <button
          onClick={() => {
            if (cutStart == null) { setCutStart(cur); return; }
            const a = Math.min(cutStart, cur);
            const b = Math.max(cutStart, cur);
            if (b - a > 0.15) setCuts((l) => [...l, { key: `c${Date.now()}`, start: +a.toFixed(2), end: +b.toFixed(2) }]);
            setCutStart(null);
          }}
          style={cutStart == null ? toolBtn(false) : miniBtn(true, false)}
          title="Posicione o playhead, marque o início, mova e feche o corte"
        >
          <Icon name="scissors" size={14} strokeWidth={2} />
          {cutStart == null ? 'Cortar deste ponto' : `Fechar corte em ${fmtDuration(cur)}`}
        </button>
        {cutStart != null && (
          <button onClick={() => setCutStart(null)} style={toolBtn(false)}>Cancelar</button>
        )}
        {pauses.length > 0 && (
          <>
            <span style={{ width: 1, height: 20, background: C.border, margin: '0 2px' }} />
            <span style={{ fontSize: 11.5, color: C.faint }}>Pausas:</span>
            <button onClick={cutAllPauses} disabled={pausesCut.length === pauses.length} style={toolBtn(pausesCut.length === pauses.length)}>
              <Icon name="scissors" size={13} strokeWidth={2} /> Cortar todas
            </button>
            <button onClick={keepAllPauses} disabled={pausesCut.length === 0} style={toolBtn(pausesCut.length === 0)}>
              <Icon name="undo" size={13} strokeWidth={2} /> Manter todas
            </button>
          </>
        )}
        {/* Zoom da timeline (aproxima/afasta os blocos) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={{ fontSize: 11.5, color: C.faint }}>Zoom</span>
          <button onClick={() => zoomTl(-1)} disabled={pps <= PPS_MIN} style={toolBtn(pps <= PPS_MIN)} title="Afastar">−</button>
          <button onClick={() => zoomTl(1)} disabled={pps >= PPS_MAX} style={toolBtn(pps >= PPS_MAX)} title="Aproximar">+</button>
          <button onClick={() => setPps(64)} style={toolBtn(false)} title="Zoom padrão">Ajustar</button>
        </div>
      </div>

      {/* Timeline: coluna fixa com o nome das faixas + área que rola */}
      <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 12, background: 'rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ width: 104, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.25)', paddingBottom: 6 }}>
          <div style={{ height: LANE.ruler }} />
          <Rotulo h={LANE.legenda} gap={6} nome="LEGENDA" dica="clique na palavra" />
          <Rotulo h={LANE.video} gap={4} nome="VÍDEO" dica={cuts.length ? null : 'arraste ou use o botão'} />
          <Rotulo h={LANE.broll} gap={4} nome="B-ROLL" dica={!brollOn ? 'ligue na aba' : brollLoading ? 'procurando…' : broll.length === 0 ? 'nada sugerido' : null} />
          <Rotulo h={LANE.audio} gap={4} nome="ÁUDIO" dica={gains.length ? null : 'use a aba Áudio'} />
          <Rotulo h={LANE.pausas} gap={4} nome="PAUSAS" dica={pauses.length ? 'clique p/ manter' : null} />
          {media.length > 0 && <Rotulo h={LANE.midias} gap={4} nome="MÍDIAS" />}
        </div>
        <div ref={trackRef} onClick={onTrackClick} style={{ position: 'relative', overflowX: 'auto', overflowY: 'hidden', flex: 1, minWidth: 0, paddingBottom: 6 }}>
          <div style={{ position: 'relative', width, height: LANE.ruler + 6 + LANE.legenda + 4 + LANE.video + 4 + LANE.broll + 4 + LANE.audio + 4 + LANE.pausas + (media.length ? 4 + LANE.midias : 0) }}>
          <div style={{ position: 'relative', height: LANE.ruler, borderBottom: `1px solid ${C.border}`, cursor: 'crosshair' }}>
            {Array.from({ length: Math.ceil(dur) + 1 }).map((_, s) => (
              <div key={s} style={{ position: 'absolute', left: s * pps, top: 0, height: 20, borderLeft: `1px solid ${s % 5 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'}` }}>
                {s % 5 === 0 && <span style={{ position: 'absolute', left: 3, top: 3, fontSize: 9.5, color: C.faint }}>{s}s</span>}
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', height: LANE.legenda, marginTop: 6 }}>
            {segments.map((s, si) => {
              const left = s.start * pps;
              const fullW = Math.max(10, (Math.max(s.end, s.start + 0.2) - s.start) * pps - 2);
              const gone = segRemoved(s);
              const isSel = si === sel;
              const isActive = si === activeIndex;
              const kr = keptRange(s);
              return (
                <div key={si} onClick={(e) => { e.stopPropagation(); setSel(si); seek(s.start); }} title={s.words.map((x) => x.word).join(' ')}
                  style={{ position: 'absolute', left, width: fullW, top: 6, height: 52, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                    border: isSel ? `1.5px solid ${C.orange}` : `1px solid ${gone ? 'rgba(240,82,107,0.5)' : C.border}`,
                    background: gone ? 'rgba(240,82,107,0.16)' : isActive ? 'linear-gradient(180deg, rgba(255,107,53,0.32), rgba(124,58,237,0.22))' : 'rgba(255,255,255,0.06)',
                    color: gone ? C.red : C.text, boxShadow: isSel ? `0 0 0 2px ${C.orange}33` : 'none' }}>
                  {/* máscaras das pontas cortadas (trim) */}
                  {kr && !gone && kr[0] > s.start + 0.01 && (
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (kr[0] - s.start) * pps, background: 'rgba(240,82,107,0.22)', borderRight: `1px dashed ${C.red}` }} />
                  )}
                  {kr && !gone && kr[1] < s.end - 0.01 && (
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: (s.end - kr[1]) * pps, background: 'rgba(240,82,107,0.22)', borderLeft: `1px dashed ${C.red}` }} />
                  )}
                  <span style={{ position: 'relative', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', padding: '5px 9px', fontSize: 10.5, lineHeight: 1.25, textDecoration: gone ? 'line-through' : 'none' }}>
                    {s.words.map((x) => x.word).join(' ')}
                  </span>
                  {/* alças de trim (só no bloco selecionado) */}
                  {isSel && !gone && (
                    <>
                      <div onMouseDown={(e) => startDrag(si, 'left', e)} onClick={(e) => e.stopPropagation()} style={handleStyle('left')} />
                      <div onMouseDown={(e) => startDrag(si, 'right', e)} onClick={(e) => e.stopPropagation()} style={handleStyle('right')} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {/* Faixa de vídeo: miniaturas + cortes desenhados arrastando */}
          <div
            onMouseDown={startCutDraw}
            title="Arraste para cortar um trecho"
            style={{ position: 'relative', height: LANE.video, marginTop: 4, borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.45)', cursor: 'crosshair' }}
          >
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${filmstripUrl(sourceId)})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }} />
            {cuts.map((c) => (
              <div
                key={c.key}
                title={`Corte ${fmtDuration(c.start)} → ${fmtDuration(c.end)}`}
                onMouseDown={(e) => startRangeDrag(setCuts, c, 'move', e)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', left: c.start * pps, width: Math.max(10, (c.end - c.start) * pps), top: 0, bottom: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab',
                  border: `1px solid ${C.red}`,
                  background: 'repeating-linear-gradient(45deg, rgba(240,82,107,0.55), rgba(240,82,107,0.55) 5px, rgba(240,82,107,0.3) 5px, rgba(240,82,107,0.3) 10px)',
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setCuts((l) => l.filter((x) => x.key !== c.key)); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="Desfazer este corte"
                  style={{ width: 18, height: 18, borderRadius: 5, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: 1, fontFamily: 'inherit' }}
                >
                  ×
                </button>
                <div onMouseDown={(e) => startRangeDrag(setCuts, c, 'left', e)} style={handleStyle('left')} />
                <div onMouseDown={(e) => startRangeDrag(setCuts, c, 'right', e)} style={handleStyle('right')} />
              </div>
            ))}
            {cutStart != null && Math.abs(cur - cutStart) > 0.02 && (
              <div style={{ position: 'absolute', left: Math.min(cutStart, cur) * pps, width: Math.abs(cur - cutStart) * pps, top: 0, bottom: 0, background: 'rgba(240,82,107,0.22)', border: `1px dashed ${C.red}`, pointerEvents: 'none' }} />
            )}
            {drawing && drawing.end > drawing.start && (
              <div style={{ position: 'absolute', left: drawing.start * pps, width: (drawing.end - drawing.start) * pps, top: 0, bottom: 0, background: 'rgba(240,82,107,0.3)', border: `1px dashed ${C.red}`, pointerEvents: 'none' }} />
            )}
          </div>

          {/* Faixa de B-roll: momentos sugeridos pela análise, ajustáveis aqui */}
          {(
            <div style={{ position: 'relative', height: LANE.broll, marginTop: 4 }}>
              {brollOn && broll.map((b) => {
                const left = b.start * pps;
                const w = Math.max(18, (b.end - b.start) * pps - 1);
                return (
                  <div
                    key={b.key}
                    title={b.query || 'B-roll'}
                    onMouseDown={(e) => { if (!b.off) startRangeDrag(setBroll, b, 'move', e); }}
                    onClick={(e) => { e.stopPropagation(); if (b.off) setBroll((l) => l.map((x) => (x.key === b.key ? { ...x, off: false } : x))); }}
                    style={{
                      position: 'absolute', left, width: w, top: 2, height: 26, borderRadius: 7, overflow: 'hidden',
                      display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8, paddingRight: 4,
                      cursor: b.off ? 'pointer' : 'grab',
                      border: `1px solid ${b.off ? C.border : 'rgba(46,212,122,0.55)'}`,
                      background: b.off ? 'rgba(255,255,255,0.04)' : 'rgba(46,212,122,0.18)',
                      color: b.off ? C.faint : C.text, opacity: b.off ? 0.6 : 1,
                    }}
                  >
                    <Icon name="image" size={12} strokeWidth={2} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: b.off ? 'line-through' : 'none' }}>
                      {b.query || 'B-roll'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setBroll((l) => l.map((x) => (x.key === b.key ? { ...x, off: !x.off } : x))); }}
                      title={b.off ? 'Usar este momento' : 'Tirar este momento'}
                      style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, border: 'none', background: 'rgba(0,0,0,0.3)', color: 'inherit', cursor: 'pointer', fontSize: 12, lineHeight: 1, fontFamily: 'inherit' }}
                    >
                      {b.off ? '+' : '×'}
                    </button>
                    {!b.off && <div onMouseDown={(e) => startRangeDrag(setBroll, b, 'left', e)} style={handleStyle('left')} />}
                    {!b.off && <div onMouseDown={(e) => startRangeDrag(setBroll, b, 'right', e)} style={handleStyle('right')} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Faixa de áudio: forma de onda da fala original */}
          <div style={{ position: 'relative', height: LANE.audio, marginTop: 4, borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}`, background: 'rgba(124,58,237,0.10)' }}>
            {wave && (
              <svg width={width} height={34} viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" style={{ display: 'block' }}>
                <path d={wave} fill={C.purpleSoft} opacity={0.6} />
              </svg>
            )}
            {gains.map((g) => {
              const left = g.start * pps;
              const w = Math.max(16, (g.end - g.start) * pps - 1);
              const mudo = Number(g.volume) < 0.005;
              return (
                <div
                  key={g.key}
                  title={`Volume ${mudo ? 'mudo' : `${Number(g.volume).toFixed(2)}×`}`}
                  onMouseDown={(e) => startRangeDrag(setGains, g, 'move', e)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute', left, width: w, top: 0, bottom: 0, borderRadius: 5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab',
                    border: `1px solid ${mudo ? C.red : C.orange}`,
                    background: mudo ? 'rgba(240,82,107,0.28)' : 'rgba(255,107,53,0.22)',
                    fontSize: 10.5, fontWeight: 700, color: C.text, overflow: 'hidden', whiteSpace: 'nowrap',
                  }}
                >
                  {mudo ? 'mudo' : `${Number(g.volume).toFixed(2)}×`}
                  <div onMouseDown={(e) => startRangeDrag(setGains, g, 'left', e)} style={handleStyle('left')} />
                  <div onMouseDown={(e) => startRangeDrag(setGains, g, 'right', e)} style={handleStyle('right')} />
                </div>
              );
            })}
          </div>

          {/* Lane de pausas (silêncio entre palavras) — clique alterna cortar/manter */}
          <div style={{ position: 'relative', height: LANE.pausas, marginTop: 4 }}>
            {pauses.map((p, pi) => {
              const cut = isPauseCut(p);
              const w = Math.max(6, p.dur * pps - 1);
              return (
                <div
                  key={pi}
                  onClick={(e) => { e.stopPropagation(); togglePause(p); }}
                  title={`Pausa de ${p.dur.toFixed(1)}s — ${cut ? 'será cortada (clique p/ manter)' : 'mantida (clique p/ cortar)'}`}
                  style={{
                    position: 'absolute', left: p.start * pps, top: 0, width: w, height: 22, borderRadius: 6,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    background: cut ? 'repeating-linear-gradient(45deg, rgba(240,82,107,0.28), rgba(240,82,107,0.28) 5px, rgba(240,82,107,0.14) 5px, rgba(240,82,107,0.14) 10px)' : 'rgba(255,255,255,0.05)',
                    border: `1px ${cut ? 'solid' : 'dashed'} ${cut ? 'rgba(240,82,107,0.55)' : C.border}`,
                    color: cut ? C.red : C.faint,
                  }}
                >
                  {w > 26 && (cut ? <Icon name="scissors" size={11} strokeWidth={2.2} /> : <span style={{ fontSize: 9.5, fontWeight: 600 }}>{p.dur.toFixed(1)}s</span>)}
                </div>
              );
            })}
          </div>
          {/* Lane das minhas mídias — arraste para mover, pontas para redimensionar */}
          {media.length > 0 && (
            <div style={{ position: 'relative', height: LANE.midias, marginTop: 4 }}>
              {media.map((m) => {
                const left = m.start * pps;
                const w = Math.max(16, m.duration * pps - 1);
                const col = m.kind === 'audio' ? C.purple : m.kind === 'video' ? C.orange : '#22D3EE';
                return (
                  <div
                    key={m.key}
                    onMouseDown={(e) => startMediaDrag(m, 'move', e)}
                    onClick={(e) => { e.stopPropagation(); seek(m.start); }}
                    title={`${m.filename} — arraste para mover, pontas para ajustar a duração`}
                    style={{
                      position: 'absolute', left, top: 0, width: w, height: 28, borderRadius: 7, overflow: 'hidden',
                      cursor: 'grab', display: 'flex', alignItems: 'center', gap: 5, padding: '0 9px',
                      background: `${col}2b`, border: `1px solid ${col}`, color: C.text, userSelect: 'none',
                    }}
                  >
                    <span style={{ display: 'flex', flexShrink: 0, color: col }}><Icon name={m.kind === 'audio' ? 'play' : m.kind === 'video' ? 'film' : 'image'} size={11} strokeWidth={2.2} /></span>
                    {w > 44 && <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.filename}</span>}
                    <div onMouseDown={(e) => startMediaDrag(m, 'left', e)} onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 7, cursor: 'ew-resize', background: `${col}` }} />
                    <div onMouseDown={(e) => startMediaDrag(m, 'right', e)} onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 7, cursor: 'ew-resize', background: `${col}` }} />
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ position: 'absolute', left: cur * pps, top: 0, bottom: 0, width: 2, background: C.orange, boxShadow: `0 0 8px ${C.orange}`, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: -1, left: -4, width: 10, height: 10, borderRadius: '50%', background: C.orange }} />
          </div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 7 }}>Faixas, de cima para baixo: <b>legenda</b> (blocos de fala) · <b>vídeo</b> (arraste sobre ele para cortar um trecho){brollOn && <> · <b>B-roll</b> (arraste para mover, × para tirar)</>} · <b>áudio</b> · a faixa das <span style={{ color: C.red }}>pausas de silêncio</span> (hachuradas serão cortadas — clique para manter) · arraste as pontas dos blocos para aparar{media.length > 0 && <> · a faixa das <span style={{ color: C.purpleSoft }}>minhas mídias</span> pode ser arrastada (mover) e ter as pontas ajustadas (duração)</>}</div>

      {/* Ajustes em abas: mantém o vídeo e a timeline no topo, sem rolagem. */}
      <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={sectionTab(tab === t.id)}>
              <Icon name={t.icon} size={14} strokeWidth={2} /> {t.label}
            </button>
          ))}
        </div>

        {/* Enquadramento na tela dividida */}
        {tab === 'enquadramento' && (
          <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="image" size={15} strokeWidth={2} /></span>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Enquadramento no rosto</div>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 10 }}>
              Ajusta como você aparece: na <b>tela dividida</b> (sua metade) e, com zoom, também no <b>vídeo em tela cheia</b> (aproxima e reposiciona).
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[{ id: 'auto', label: 'Automático (rosto)' }, { id: 'manual', label: 'Ajustar eu mesmo' }].map((o) => (
                <button key={o.id} onClick={() => setFramingMode(o.id)} style={framingTab(framingMode === o.id)}>{o.label}</button>
              ))}
            </div>
            {framingMode === 'manual' && (() => {
              const personHalf = (
                <div
                  key="person"
                  ref={previewBoxRef}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const r = previewBoxRef.current.getBoundingClientRect();
                    panRef.current = { startX: e.clientX, startY: e.clientY, fx: focus.x, fy: focus.y, w: r.width, h: r.height, zoom };
                  }}
                  style={{ position: 'relative', height: '50%', overflow: 'hidden', cursor: 'grab', touchAction: 'none', boxShadow: `inset 0 0 0 2px ${C.orange}` }}
                >
                  <video
                    ref={previewVideoRef}
                    src={sourceUrl(sourceId)}
                    muted loop autoPlay playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${focus.x * 100}% ${focus.y * 100}%`, transform: `scale(${zoom})`, transformOrigin: `${focus.x * 100}% ${focus.y * 100}%` }}
                  />
                  <div style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '2px 7px', borderRadius: 6 }}>você (arraste/role)</div>
                </div>
              );
              const brollHalf = (
                <div key="broll" style={{ height: '50%', display: 'grid', placeItems: 'center', background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.02) 8px, rgba(255,255,255,0.02) 16px)', color: C.faint }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <Icon name="image" size={18} strokeWidth={1.8} />
                    <div style={{ fontSize: 10.5, fontWeight: 700 }}>B-roll</div>
                  </div>
                </div>
              );
              return (
                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
                    <span style={{ width: 46 }}>Zoom</span>
                    <button onClick={() => setZoom((z) => clampZoom(z - 0.1))} style={zoomBtn} title="Diminuir">−</button>
                    <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(e) => setZoom(clampZoom(Number(e.target.value)))} style={{ flex: 1 }} />
                    <button onClick={() => setZoom((z) => clampZoom(z + 0.1))} style={zoomBtn} title="Aumentar">+</button>
                    <span style={{ width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{zoom.toFixed(2)}×</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Prévia (as duas metades)</div>
                    <button onClick={() => setPersonSide((s) => (s === 'top' ? 'bottom' : 'top'))} style={{ ...zoomBtn, width: 'auto', padding: '0 10px', fontSize: 11, fontWeight: 600 }}>Você: {personSide === 'top' ? 'em cima' : 'embaixo'}</button>
                  </div>
                  {/* Composição 9:16 = sua metade (interativa) + B-roll. Arraste/role na sua metade. */}
                  <div style={{ width: '100%', maxWidth: 190, margin: '0 auto', aspectRatio: '9 / 16', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, border: `1px solid ${C.border}`, background: '#000' }}>
                    {personSide === 'top' ? [personHalf, brollHalf] : [brollHalf, personHalf]}
                  </div>
                  <div style={{ fontSize: 11, color: C.faint, textAlign: 'center' }}>Sem B-roll, o mesmo ajuste (zoom) reenquadra o vídeo inteiro.</div>
                </div>
              );
            })()}
          </div>
        )}

        {/* B-roll: liga/desliga e ajustes, sem precisar voltar para as opções */}
        {tab === 'broll' && (
          <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '4px 14px 10px' }}>
            <BrollControls
              catalog={catalog}
              options={{ ...options, ...brollOpts }}
              onChange={(next) => setBrollOpts({
                broll: next.broll,
                imageSource: next.imageSource,
                niche: next.niche,
                brollLayout: next.brollLayout,
                personCrop: next.personCrop,
              })}
              onSettings={onSettings}
            />
            <div style={{ fontSize: 11.5, color: C.faint, paddingTop: 4 }}>
              {brollOn ? 'Os momentos aparecem na faixa verde da timeline — arraste para mover, × para tirar.' : 'Ligue para escolher os momentos na timeline.'}
            </div>
          </div>
        )}

        {/* Volume da fala: geral, mudo e trechos com volume próprio */}
        {tab === 'audio' && (
          <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <CapRow label="Mudo">
              <button onClick={() => setAudioMute((m) => !m)} style={miniBtn(audioMute, false)}>
                {audioMute ? 'Fala silenciada' : 'Fala com som'}
              </button>
            </CapRow>
            <CapRow label="Volume da fala">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: audioMute ? 0.4 : 1 }}>
                <input type="range" min="0" max="2" step="0.05" value={audioVolume} disabled={audioMute}
                  onChange={(e) => setAudioVolume(Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ width: 46, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{Number(audioVolume).toFixed(2)}×</span>
              </label>
            </CapRow>
            <CapRow label="Trecho com volume próprio">
              <button
                onClick={() => setGains((l) => {
                  // Trechos sobrepostos multiplicam o volume no ffmpeg; começa depois do que já cobre o playhead.
                  const cobre = l.filter((g) => cur >= g.start && cur < g.end);
                  const inicio = cobre.length ? Math.max(...cobre.map((g) => g.end)) : cur;
                  if (inicio >= dur - 0.4) return l;
                  return [...l, { key: `g${Date.now()}`, start: +inicio.toFixed(2), end: +Math.min(dur, inicio + 2).toFixed(2), volume: 0.3 }];
                })}
                disabled={audioMute || cur >= dur - 0.4}
                style={toolBtn(audioMute || cur >= dur - 0.4)}
              >
                <Icon name="scissors" size={14} strokeWidth={2} /> Abaixar a partir do playhead
              </button>
            </CapRow>
            {gains.map((g) => (
              <CapRow key={g.key} label={`${fmtDuration(g.start)} → ${fmtDuration(g.end)}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="range" min="0" max="2" step="0.05" value={g.volume}
                    onChange={(e) => setGains((l) => l.map((x) => (x.key === g.key ? { ...x, volume: Number(e.target.value) } : x)))} style={{ flex: 1 }} />
                  <span style={{ width: 46, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>
                    {Number(g.volume) < 0.005 ? 'mudo' : `${Number(g.volume).toFixed(2)}×`}
                  </span>
                  <button onClick={() => setGains((l) => l.filter((x) => x.key !== g.key))} style={miniBtn(false, false)} title="Tirar este trecho">×</button>
                </div>
              </CapRow>
            ))}
            <div style={{ fontSize: 11.5, color: C.faint, paddingTop: 6 }}>
              {audioMute
                ? 'A fala original sai muda no vídeo final — a música de Minhas mídias continua.'
                : 'Os trechos aparecem na faixa de áudio — arraste para mover e puxe as pontas para ajustar.'}
            </div>
          </div>
        )}

        {/* Ajustes de legenda (posição, fonte, estilo…) direto na edição */}
        {tab === 'legenda' && catalog && cap.captions && (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="image" size={15} strokeWidth={2} /></span>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Legenda</div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <CapRow label="Estilo"><Sel value={cap.captionTemplate} opts={catalog.captionTemplates} onChange={(v) => setCapField({ captionTemplate: v })} /></CapRow>
                <CapRow label="Fonte"><Sel value={cap.captionFont} opts={catalog.captionFonts} onChange={(v) => setCapField({ captionFont: v })} /></CapRow>
                <CapRow label="Modo (palavra / frase)"><Sel value={cap.captionMode} opts={catalog.captionModes} onChange={(v) => setCapField({ captionMode: v })} /></CapRow>
                <CapRow label="Fundo do texto"><Sel value={cap.captionBackground} opts={catalog.captionBackgrounds} onChange={(v) => setCapField({ captionBackground: v })} /></CapRow>
                <CapRow label="Posição"><Sel value={cap.captionPosition} opts={catalog.captionPositions} onChange={(v) => setCapField({ captionPosition: v })} /></CapRow>
                <CapRow label="Cor">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(catalog.captionColors || []).map((o) => (
                      <button key={o.id} onClick={() => setCapField({ captionColor: o.id })} title={o.label}
                        style={{ width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', background: o.hex, border: cap.captionColor === o.id ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)' }} />
                    ))}
                  </div>
                </CapRow>
                <CapRow label={`Tamanho (${Math.round((cap.captionScale ?? 1) * 100)}%)`}>
                  <input type="range" min="0.6" max="1.4" step="0.05" value={cap.captionScale ?? 1} onChange={(e) => setCapField({ captionScale: Number(e.target.value) })} style={{ width: '100%' }} />
                </CapRow>
              </div>
              <div style={{ marginTop: 8 }}><CaptionPreview options={cap} /></div>
            </div>
        )}
        {tab === 'legenda' && !(catalog && cap.captions) && (
          <div style={{ fontSize: 12.5, color: C.faint }}>As legendas estão desligadas nas opções deste vídeo.</div>
        )}

        {/* Minhas mídias: coloque suas imagens/vídeos/músicas na timeline */}
        {tab === 'midias' && (
          <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="film" size={15} strokeWidth={2} /></span>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Minhas mídias</div>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 10 }}>
              Adicione suas <b>imagens</b>, <b>vídeos</b> e <b>músicas</b>. Elas entram no ponto atual do vídeo (playhead) e você ajusta o tempo abaixo.
            </div>
            <input ref={mediaInputRef} type="file" accept="image/*,video/*,audio/*" multiple onChange={onPickMedia} style={{ display: 'none' }} />
            <button onClick={() => mediaInputRef.current?.click()} disabled={mediaBusy} style={{ ...framingTab(false), width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6, opacity: mediaBusy ? 0.6 : 1, cursor: mediaBusy ? 'wait' : 'pointer' }}>
              <Icon name="image" size={13} strokeWidth={2} /> {mediaBusy ? 'Enviando…' : '+ Adicionar mídia'}
            </button>
            {mediaErr && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{mediaErr}</div>}
            {media.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {media.map((m) => {
                  const isAudio = m.kind === 'audio';
                  const maxDur = isAudio ? Math.max(0.5, dur) : Math.max(0.5, Math.min(m.srcDuration || dur, dur));
                  return (
                    <div key={m.key} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 10, padding: 9 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <Icon name={isAudio ? 'play' : m.kind === 'video' ? 'film' : 'image'} size={12} strokeWidth={2} />
                        <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{m.filename}</div>
                        <button onClick={() => removeMedia(m.key)} title="Remover" style={{ ...zoomBtn, width: 22, height: 22, color: C.red }}>×</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted, marginBottom: 6 }}>
                        <span>Começa em <b style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(m.start)}</b></span>
                        <button onClick={() => updateMedia(m.key, { start: +cur.toFixed(2) })} style={{ ...zoomBtn, width: 'auto', padding: '0 8px', fontSize: 10.5, fontWeight: 600 }} title="Usar o ponto atual do vídeo">↧ aqui</button>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted, marginBottom: isAudio ? 6 : 8 }}>
                        <span style={{ width: 58 }}>Duração</span>
                        <input type="range" min="0.5" max={maxDur.toFixed(2)} step="0.1" value={Math.min(m.duration, maxDur)} onChange={(e) => updateMedia(m.key, { duration: Number(e.target.value) })} style={{ flex: 1 }} />
                        <span style={{ width: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(m.duration)}</span>
                      </label>
                      {isAudio ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted }}>
                          <span style={{ width: 58 }}>Volume</span>
                          <input type="range" min="0" max="1.5" step="0.05" value={m.volume} onChange={(e) => updateMedia(m.key, { volume: Number(e.target.value) })} style={{ flex: 1 }} />
                          <span style={{ width: 42, textAlign: 'right' }}>{Math.round(m.volume * 100)}%</span>
                        </label>
                      ) : (
                        <>
                          <div style={{ display: 'flex', gap: 6, marginBottom: m.mode === 'pip' ? 8 : 0 }}>
                            {[{ id: 'cover', label: 'Tela cheia' }, { id: 'pip', label: 'Cantinho (PiP)' }].map((o) => (
                              <button key={o.id} onClick={() => updateMedia(m.key, { mode: o.id })} style={framingTab(m.mode === o.id)}>{o.label}</button>
                            ))}
                          </div>
                          {m.mode === 'pip' && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted }}>
                              <span style={{ width: 58 }}>Tamanho</span>
                              <input type="range" min="0.15" max="0.9" step="0.05" value={m.scale} onChange={(e) => updateMedia(m.key, { scale: Number(e.target.value) })} style={{ flex: 1 }} />
                              <span style={{ width: 42, textAlign: 'right' }}>{Math.round(m.scale * 100)}%</span>
                            </label>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <PrimaryButton onClick={generate} disabled={busy || allGone} style={{ width: '100%', marginTop: 18 }}>
        {allGone ? 'Você cortou tudo — reinclua algo' : busy ? 'Gerando…' : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Icon name="clapper" size={18} strokeWidth={1.9} /> Renderizar vídeo final</span>)}
      </PrimaryButton>

      <style>{`@media (max-width: 860px){ .rf-tl-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

// Altura de cada faixa. A coluna de nomes e as faixas leem daqui, para não
// desalinharem quando uma mudar.
const LANE = { ruler: 20, legenda: 64, video: 44, broll: 30, audio: 34, pausas: 24, midias: 30 };

/** Nome de uma faixa, na coluna fixa à esquerda da timeline. */
function Rotulo({ h, gap, nome, dica }) {
  return (
    <div style={{ height: h, marginTop: gap, padding: '0 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: C.muted, whiteSpace: 'nowrap' }}>{nome}</div>
      {dica && <div style={{ fontSize: 9, color: C.faint, lineHeight: 1.15, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={dica}>{dica}</div>}
    </div>
  );
}

/** Caminho SVG do envelope do áudio (espelhado), em viewBox 0..n por 0..100. */
function wavePath(peaks) {
  if (!peaks.length) return '';
  const top = peaks.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i} ${50 - v * 46}`).join(' ');
  const bottom = peaks.map((_, i) => { const j = peaks.length - 1 - i; return `L ${j} ${50 + peaks[j] * 46}`; }).join(' ');
  return `${top} ${bottom} Z`;
}

function handleStyle(side) {
  return {
    position: 'absolute', top: 0, bottom: 0, [side]: 0, width: 9, cursor: 'ew-resize', zIndex: 3,
    background: 'linear-gradient(180deg, #FF6B35, #7C3AED)', opacity: 0.9,
    borderRadius: side === 'left' ? '7px 0 0 7px' : '0 7px 7px 0',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)',
  };
}
const playBtn = { width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #FF6B35, #7C3AED)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 6px 16px -6px rgba(255,107,53,0.6)' };
function toolBtn(disabled) {
  return { display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.05)', color: disabled ? C.faint : C.text, borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'inherit' };
}
function miniBtn(active, disabled) {
  return { display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${active ? C.red : C.border}`, background: active ? 'rgba(240,82,107,0.18)' : 'rgba(255,255,255,0.05)', color: active ? C.red : C.muted, borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, fontFamily: 'inherit' };
}
const TABS = [
  { id: 'enquadramento', label: 'Enquadramento', icon: 'crop' },
  { id: 'broll', label: 'B-roll', icon: 'image' },
  { id: 'audio', label: 'Áudio', icon: 'mic' },
  { id: 'legenda', label: 'Legenda', icon: 'captions' },
  { id: 'midias', label: 'Minhas mídias', icon: 'film' },
];
function sectionTab(active) {
  return { display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${active ? C.orange : C.border}`, background: active ? 'rgba(255,107,53,0.16)' : 'rgba(255,255,255,0.05)', color: active ? C.orange : C.muted, borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
}
function framingTab(active) {
  return { flex: 1, border: `1px solid ${active ? C.orange : C.border}`, background: active ? 'rgba(255,107,53,0.16)' : 'rgba(255,255,255,0.05)', color: active ? C.orange : C.muted, borderRadius: 9, padding: '7px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
}
const zoomBtn = { width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.06)', color: C.text, fontSize: 16, fontWeight: 700, lineHeight: 1, cursor: 'pointer', display: 'grid', placeItems: 'center', fontFamily: 'inherit' };
function Sel({ value, opts, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', background: '#13131B', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
      {(opts || []).map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
    </select>
  );
}
function CapRow({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}
function Chip({ label, value, sub, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 11, padding: '7px 12px' }}>
      <div style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color, marginTop: 2 }}>{value} {sub && <span style={{ color: C.faint, fontSize: 11.5, fontWeight: 500 }}>{sub}</span>}</div>
    </div>
  );
}
