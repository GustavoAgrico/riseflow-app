import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, GRAD, glass, fmtDuration } from '../theme.js';
import { PrimaryButton, GhostButton } from './ui.jsx';
import Icon from './Icon.jsx';
import { sourceUrl, colorFrameUrl, filmstripUrl, getPeaks, uploadMedia, fetchBrollPlan, previewVoice, searchBroll } from '../api.js';
import CostLine, { openPlans } from './CostLine.jsx';
import { APP_VERSION } from '../version.js';
import { useAuth } from '../AuthContext.jsx';
import { CaptionOverlay } from './CaptionPreview.jsx';
import CaptionGallery from './CaptionGallery.jsx';
import VoicePanel, { voiceOf } from './VoicePanel.jsx';
import { MOTION_Z, motionAt, demoMotion, volumeAt, playWhoosh, LOOK_CSS, colorAdjustCss } from '../livePreview.js';
import { keyZoomMoments } from '../../../shared/keyMoments.js';

// Tempo no formato do player: 00:12
// Timecode como no Premiere (mm:ss:quadros, 30 fps): 00:56:23
const tc = (t) => { const f = Math.max(0, t || 0); return `${mmss(f)}:${String(Math.floor((f % 1) * 30)).padStart(2, '0')}`; };
// Busca sem acento e sem caixa
const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const mmss = (t) => `${String(Math.floor((t || 0) / 60)).padStart(2, '0')}:${String(Math.floor((t || 0) % 60)).padStart(2, '0')}`;

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
// Palavra como vai para o servidor: tempos, texto, corte, posição manual e ênfase.
function wordOut(w) {
  return {
    start: w.start, end: w.end, word: w.word, removed: !!w.removed,
    ...(w.px != null ? { px: w.px, py: w.py } : {}),
    ...(w.emColor ? { emColor: w.emColor } : {}),
    ...(w.emBig ? { emBig: true } : {}),
  };
}

export default function TimelineEditor({ transcript, durationSec, sourceId, catalog, options, onGenerate, onBack, onSettings, busy }) {
  const { billing } = useAuth();
  const caps = catalog?.capabilities || {};
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
    captionLines: cap0.captionLines === 1 ? 1 : 2,
    captionMaxChars: Number(cap0.captionMaxChars) || 0,
    captionHighlight: cap0.captionHighlight === true,
    captionAnimation: cap0.captionAnimation || 'auto',
    captionPreset: cap0.captionPreset,
  });
  const setCapField = (patch) => setCap((c) => ({ ...c, ...patch }));
  // Posição manual da legenda (arrastar na prévia): só esta frase, só esta palavra ou todas.
  const [capScope, setCapScope] = useState('frase');
  // Efeitos (zoom + sons) e cor, ajustáveis aqui na timeline antes do render.
  const [fx, setFx] = useState({
    videoMotion: cap0.videoMotion || 'none',
    motionIntensity: cap0.motionIntensity || 'medio',
    soundEffects: cap0.soundEffects === true,
    sfxIntensity: cap0.sfxIntensity || 'medio',
  });
  // Tratamento e modificadores da voz (aba Áudio) + prévia ouvível.
  const [voice, setVoice] = useState(() => voiceOf(cap0));
  const [voicePrev, setVoicePrev] = useState({ busy: false, url: null, err: '' });
  const voiceAudioRef = useRef(null);
  async function playVoicePreview() {
    setVoicePrev((p) => ({ ...p, busy: true, err: '' }));
    try {
      const url = await previewVoice(sourceId, Math.max(0, cur - 0.5), voice);
      setVoicePrev((p) => { if (p.url) URL.revokeObjectURL(p.url); return { busy: false, url, err: '' }; });
      videoRef.current?.pause();
      setTimeout(() => voiceAudioRef.current?.play().catch(() => {}), 50);
    } catch (e) {
      setVoicePrev((p) => ({ ...p, busy: false, err: e.message }));
    }
  }
  // Zoom nos MOMENTOS-CHAVE (faixa ZOOM da timeline). null = ainda não calculado.
  const [zoomMoments, setZoomMoments] = useState(null);
  const [selZoom, setSelZoom] = useState(null);
  const [selBroll, setSelBroll] = useState(null); // momento de B-roll selecionado (índice)
  const [badThumbs, setBadThumbs] = useState(() => new Set()); // miniaturas que não carregaram
  const [colorLook, setColorLook] = useState(cap0.colorLook || 'auto');
  const [colorAdj, setColorAdj] = useState({ brightness: 0, contrast: 0, saturation: 0, temperature: 0, ...(cap0.colorAdjust || {}) });
  const colorCss = colorPreviewCss(colorAdj);
  // Prévia do look escolhido (aproximada) + ajuste manual por cima.
  const lookCss = LOOK_CSS[colorLook] || LOOK_CSS.auto;
  const videoFilter = [lookCss.filter, colorCss.filter].filter(Boolean).join(' ') || undefined;
  const [tab, setTab] = useState('enquadramento');
  // Celular: editor em tela cheia no estilo CapCut (timeline com cursor fixo no centro,
  // barra de ferramentas embaixo e painéis que sobem de baixo).
  const MQ_MOBILE = '(max-width: 860px)';
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(MQ_MOBILE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(MQ_MOBILE);
    if (!mq) return undefined;
    const on = () => setIsMobile(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  useEffect(() => {
    if (!isMobile) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile]);
  const [sheet, setSheet] = useState(null); // painel de baixo aberto (celular)
  const [mTool, setMTool] = useState('main'); // barra de ferramentas: principal ou da legenda
  const [advOpen, setAdvOpen] = useState(false);
  const [peaks, setPeaks] = useState([]);
  const rangeDragRef = useRef(null);
  // Volume da fala: geral, mudo e trechos com volume próprio (tempo original).
  const [audioMute, setAudioMute] = useState(options?.audioMute === true);
  // Velocidade do vídeo final (a prévia toca na mesma velocidade) e corte de respirações.
  const [speed, setSpeed] = useState(() => (SPEEDS.includes(Number(options?.speed)) ? Number(options.speed) : 1));
  const [cutBreaths, setCutBreaths] = useState(options?.cutBreaths !== false);
  useEffect(() => { const v = videoRef.current; if (v) v.playbackRate = speed; }, [speed, isMobile]);
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
  // Formato do vídeo final e como ele entra no formato (igual ao servidor):
  // auto = segue o rosto · manual = ponto escolhido · fit = inteiro com fundo desfocado.
  const [aspectSel, setAspectSel] = useState(['original', '9:16', '1:1', '16:9'].includes(options?.aspect) ? options.aspect : 'original');
  // Qualidade de exportação (720p/1080p/4K: recurso do Premium).
  const [quality, setQuality] = useState(['720', '1080', '2160'].includes(String(options?.quality)) ? String(options.quality) : 'original');
  const hdAllowed = !billing || billing.unlimited || billing.features?.includes('hd');
  const [reframeMode, setReframeMode] = useState(['auto', 'manual', 'fit'].includes(options?.reframeMode) ? options.reframeMode : 'auto');
  const bgVideoRef = useRef(null); // fundo desfocado da prévia no modo "vídeo inteiro"
  const composedRef = useRef(null);
  const [cbox, setCbox] = useState(null); // tamanho da prévia do formato (para a legenda)
  // Lado da pessoa na tela dividida: segue o layout do B-roll (apoio em cima → você embaixo).
  // Layout do B-roll (igual à escolha do início, editável aqui): tela cheia ou tela
  // dividida com o B-roll em cima (você embaixo) ou embaixo (você em cima).
  // Fonte das imagens/vídeos do B-roll (igual à escolha do início, editável aqui).
  const [imageSource, setImageSource] = useState(BROLL_SOURCES.some((b) => b.id === options?.imageSource) ? options.imageSource : 'mix');
  const [brollLayoutSel, setBrollLayoutSel] = useState(['fullscreen', 'top', 'bottom'].includes(options?.brollLayout) ? options.brollLayout : 'fullscreen');
  const personSide = brollLayoutSel === 'top' ? 'bottom' : 'top';
  const setPersonSide = (fn) => {
    const next = typeof fn === 'function' ? fn(personSide) : fn;
    setBrollLayoutSel(next === 'top' ? 'bottom' : 'top');
  };
  const motionWrapRef = useRef(null); // zoom dos momentos-chave na prévia 9:16
  const [media, setMedia] = useState([]); // minhas mídias na timeline (imagens/vídeos/músicas)
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaErr, setMediaErr] = useState('');
  const mediaInputRef = useRef(null);
  // Revisão de B-roll: null = ainda não revisou; senão { moments:[{...escolhas}] }
  const [brollReview, setBrollReview] = useState(null);
  const [brollBusy, setBrollBusy] = useState(false);
  const [brollErr, setBrollErr] = useState('');
  const brollUploadRef = useRef(null); // input file para "usar minha mídia" num momento
  const brollTargetIdx = useRef(null);
  const framingBoxRef = useRef(null);
  const focusDragRef = useRef(false);

  const [segments, setSegments] = useState(() =>
    (transcript.segments || []).map((s) => ({
      ...s,
      words: (s.words?.length ? s.words : [{ start: s.start, end: s.end, word: s.text }]).map((w) => ({ ...w, removed: !!w.removed })),
    })),
  );

  // Desfazer / refazer (texto, cortes e divisões da legenda + cortes do vídeo)
  const histRef = useRef({ past: [], future: [], prev: null, skip: false });
  const [, setHistTick] = useState(0);
  useEffect(() => {
    const h = histRef.current;
    const snap = { segments, cuts };
    if (h.prev && !h.skip) {
      h.past.push(h.prev);
      if (h.past.length > 80) h.past.shift();
      h.future = [];
    }
    h.skip = false;
    h.prev = snap;
    setHistTick((n) => n + 1);
  }, [segments, cuts]);
  function undo() {
    const h = histRef.current;
    if (!h.past.length) return;
    h.future.push(h.prev);
    const p = h.past.pop();
    h.skip = true;
    setSegments(p.segments);
    setCuts(p.cuts);
  }
  function redo() {
    const h = histRef.current;
    if (!h.future.length) return;
    h.past.push(h.prev);
    const n = h.future.pop();
    h.skip = true;
    setSegments(n.segments);
    setCuts(n.cuts);
  }
  const canUndo = histRef.current.past.length > 0;
  const canRedo = histRef.current.future.length > 0;

  const dur = durationSec || segments.reduce((m, s) => Math.max(m, s.end || 0), 0) || 1;
  const width = Math.max(320, Math.round(dur * pps));

  // ── Pausas de silêncio (gaps entre palavras mantidas). O usuário decide, na
  // timeline, quais cortar. Por padrão TODA pausa visível é cortada (o cliente
  // reclamou que sobrava silêncio); clicar numa pausa a preserva.
  const MIN_PAUSE = 0.22; // só mostra/oferece corte a partir daqui (mais sensível = corta mais silêncio e respiração)
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
  }, [isMobile]); // no celular o editor vai para um portal → o <video> é outro elemento

  // Retângulo onde o vídeo aparece dentro do player (object-fit: contain) — base para
  // desenhar legenda, véus de cor e B-roll exatamente sobre a imagem.
  const [vbox, setVbox] = useState(null);
  const [vdim, setVdim] = useState(null); // tamanho real do vídeo (mesmo com o player escondido no celular)
  // Tamanho do palco (player): P deixa mais espaço para a timeline, G para ver o vídeo.
  const [stage, setStage] = useState(() => { try { return localStorage.getItem('rf_stage') || 'm'; } catch { return 'm'; } });
  useEffect(() => { try { localStorage.setItem('rf_stage', stage); } catch { /* sem storage */ } }, [stage]);
  const demoRef = useRef({ start: 0, until: 0 });
  // Prévia de cor EXATA (quadro gerado pelo servidor com o mesmo filtro do render),
  // mostrada na aba Cor com o vídeo pausado. Tocando, vale a prévia aproximada (CSS).
  const [colorFrame, setColorFrame] = useState(null); // { url, loaded }
  const [previewCuts, setPreviewCuts] = useState(true); // prévia pula os cortes ao tocar
  const curTenth = Math.round(cur * 10);
  useEffect(() => {
    if (tab !== 'cor' || playing || !sourceId) { setColorFrame(null); return undefined; }
    const id = setTimeout(() => {
      const url = colorFrameUrl(sourceId, curTenth / 10, colorLook, colorAdj);
      setColorFrame((f) => (f?.url === url ? f : { url, loaded: false }));
    }, 350);
    return () => clearTimeout(id);
  }, [tab, playing, sourceId, curTenth, colorLook, colorAdj.brightness, colorAdj.contrast, colorAdj.saturation, colorAdj.temperature]);

  // Tamanho do quadro da pessoa na prévia 9:16 (para recortar igual ao servidor).
  const [pbox, setPbox] = useState(null);
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setPbox((b) => (b && Math.abs(b.w - r.width) < 0.5 && Math.abs(b.h - r.height) < 0.5 ? b : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  useEffect(() => {
    const el = composedRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setCbox((b) => (b && Math.abs(b.w - r.width) < 0.5 && Math.abs(b.h - r.height) < 0.5 ? b : { x: 0, y: 0, w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  function measureVideo() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.clientWidth) return;
    const ew = v.clientWidth;
    const eh = v.clientHeight;
    const k = Math.min(ew / v.videoWidth, eh / v.videoHeight);
    const w = v.videoWidth * k;
    const h = v.videoHeight * k;
    const next = { x: Math.round((ew - w) / 2), y: Math.round((eh - h) / 2), w: Math.round(w), h: Math.round(h), vw: v.videoWidth, vh: v.videoHeight };
    setVbox((b) => (b && b.x === next.x && b.y === next.y && b.w === next.w && b.h === next.h && b.vw === next.vw ? b : next));
  }
  useEffect(() => {
    const v = videoRef.current;
    if (!v || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => measureVideo());
    ro.observe(v);
    return () => ro.disconnect();
  }, [isMobile]);

  // Escolheu um movimento → demonstração curta no player (mesmo pausado).
  const fxFirst = useRef(true);
  useEffect(() => {
    if (fxFirst.current) { fxFirst.current = false; return; }
    if (fx.videoMotion && fx.videoMotion !== 'none') {
      const now = performance.now();
      demoRef.current = { start: now, until: now + 4200 };
    }
  }, [fx.videoMotion, fx.motionIntensity]);
  // Ligou os efeitos sonoros / trocou o volume → toca um whoosh de exemplo.
  const sfxFirst = useRef(true);
  useEffect(() => {
    if (sfxFirst.current) { sfxFirst.current = false; return; }
    if (fx.soundEffects) playWhoosh(fx.sfxIntensity);
  }, [fx.soundEffects, fx.sfxIntensity]);

  // ── prévia AO VIVO dos efeitos no player: zoom (movimento), volume e whoosh.
  // Um laço requestAnimationFrame mexe direto no <video> (sem re-renderizar o editor).
  const liveRef = useRef({});
  useEffect(() => {
    let id;
    let lastT = null;
    const loop = () => {
      const v = videoRef.current;
      const L = liveRef.current;
      if (v && L.fx) {
        const now = performance.now();
        let t = v.currentTime;
        // Tocando: pula os trechos cortados (prévia igual ao vídeo final).
        if (!v.paused && L.skip?.length) {
          const hit = L.skip.find(([a, b]) => t >= a && t < b - 0.03);
          if (hit) { v.currentTime = Math.min(hit[1], v.duration || hit[1]); t = hit[1]; }
        }
        const m = v.paused && now < demoRef.current.until
          ? demoMotion(L.fx.videoMotion, L.fx.motionIntensity, (now - demoRef.current.start) / 1000)
          : motionAt(L.fx.videoMotion, L.fx.motionIntensity, t, L.dur, L.windows);
        const tf = m.scale > 1.0005 ? `scale(${m.scale.toFixed(4)})` : '';
        if (v.style.transform !== tf) v.style.transform = tf;
        v.style.transformOrigin = `${m.ox}% ${m.oy}%`;
        v.style.transition = L.fx.videoMotion === 'dynamic' ? 'transform .12s ease-out' : 'none';
        // Prévia 9:16 no mesmo instante do player (mesmo quadro, mesmo zoom).
        const pv = previewVideoRef.current;
        if (pv) {
          if (pv.playbackRate !== v.playbackRate) pv.playbackRate = v.playbackRate;
          if (Math.abs(pv.currentTime - t) > (v.paused ? 0.04 : 0.3)) { try { pv.currentTime = t; } catch { /* ainda carregando */ } }
          if (v.paused && !pv.paused) pv.pause();
          else if (!v.paused && pv.paused) pv.play().catch(() => {});
        }
        const bv = bgVideoRef.current;
        if (bv) {
          if (bv.playbackRate !== v.playbackRate) bv.playbackRate = v.playbackRate;
          if (Math.abs(bv.currentTime - t) > (v.paused ? 0.04 : 0.3)) { try { bv.currentTime = t; } catch { /* ainda carregando */ } }
          if (v.paused && !bv.paused) bv.pause();
          else if (!v.paused && bv.paused) bv.play().catch(() => {});
        }
        const mw = motionWrapRef.current;
        if (mw) {
          if (mw.style.transform !== tf) mw.style.transform = tf;
          mw.style.transformOrigin = `${m.ox}% ${m.oy}%`;
          mw.style.transition = v.style.transition;
        }
        const vol = Math.max(0, Math.min(1, volumeAt(t, L.audio)));
        if (Math.abs(v.volume - vol) > 0.01) v.volume = vol;
        // whoosh nos mesmos pontos do render (entradas do zoom dinâmico e do B-roll)
        if (!v.paused && L.fx.soundEffects && lastT != null && t > lastT && t - lastT < 0.6) {
          if (L.sfxTimes.some((e) => e > lastT && e <= t)) playWhoosh(L.fx.sfxIntensity);
        }
        lastT = v.paused ? null : t;
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
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
    const padL = isMobile ? el.clientWidth / 2 : 0; // no celular a timeline começa no meio (cursor fixo)
    return Math.max(0, Math.min(dur, (clientX - r.left + el.scrollLeft - padL) / pps));
  }

  const progScrollRef = useRef(-1);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const x = cur * pps;
    if (isMobile) {
      // cursor fixo no centro: a timeline anda por baixo dele
      const want = Math.round(x);
      if (Math.abs(el.scrollLeft - want) > 1) { el.scrollLeft = want; progScrollRef.current = el.scrollLeft; }
      return;
    }
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
  }, [cur, isMobile, pps]);
  // Celular: arrastar a timeline com o dedo muda o ponto do vídeo (como no CapCut).
  function onTrackScroll(e) {
    if (!isMobile) return;
    const el = e.currentTarget;
    if (Math.abs(el.scrollLeft - progScrollRef.current) <= 1) return;
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
    seek(el.scrollLeft / pps);
  }
  // Pinça com dois dedos: aproxima/afasta a timeline.
  const pinchRef = useRef(null);
  function onTrackTouchStart(e) {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchRef.current = { d, pps };
    }
  }
  function onTrackTouchMove(e) {
    const p0 = pinchRef.current;
    if (!p0 || e.touches.length !== 2) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    setPps(Math.max(PPS_MIN, Math.min(PPS_MAX, Math.round(p0.pps * (d / p0.d)))));
  }
  function onTrackTouchEnd() { pinchRef.current = null; }

  // ── Momentos de zoom (punch-in): automáticos nos momentos-chave e editáveis.
  function autoZoomMoments() {
    return keyZoomMoments(segments, dur).map((m, i) => ({ key: `z${i}_${Date.now()}`, start: m.start, end: m.end, scale: null }));
  }
  useEffect(() => {
    if (fx.videoMotion === 'dynamic' && zoomMoments === null) setZoomMoments(autoZoomMoments());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.videoMotion]);
  function addZoomAtPlayhead() {
    const start = Math.max(0, Math.min(cur, dur - 0.5));
    const z = { key: `z${Date.now()}`, start: +start.toFixed(2), end: +Math.min(dur, start + 1.8).toFixed(2), scale: null };
    setZoomMoments((l) => [...(l || []), z].sort((a, b) => a.start - b.start));
    setSelZoom(z.key);
  }
  const selZoomItem = (zoomMoments || []).find((z) => z.key === selZoom) || null;
  const setBrollMoments = (fn) => setBrollReview((r) => (r ? { ...r, moments: fn(r.moments) } : r));

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

  const clampZoom = (z) => Math.min(2.5, Math.max(1, Math.round(z * 100) / 100)); // mesmo limite do servidor
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

  // Corrige o TEXTO de uma frase (legenda). Mesma quantidade de palavras → troca uma a
  // uma (tempos iguais); senão redistribui as palavras novas no tempo da frase, pelo
  // tamanho de cada uma. Palavras cortadas continuam cortadas (só mexe nas que ficam).
  function setPhraseText(si, text) {
    const parts = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return;
    setSegments((prev) => prev.map((s, i) => {
      if (i !== si) return s;
      const kept = s.words.filter((w) => !w.removed);
      if (!kept.length) return s;
      if (kept.length === parts.length) {
        let k = 0;
        return { ...s, words: s.words.map((w) => (w.removed ? w : { ...w, word: parts[k++] })) };
      }
      const t0 = kept[0].start;
      const t1 = kept[kept.length - 1].end;
      const pos = kept[0].px != null ? { px: kept[0].px, py: kept[0].py } : {};
      const total = parts.reduce((a, p) => a + p.length + 1, 0);
      let acc = 0;
      const fresh = parts.map((p) => {
        const a = t0 + ((t1 - t0) * acc) / total;
        acc += p.length + 1;
        const b = t0 + ((t1 - t0) * acc) / total;
        return { start: +a.toFixed(3), end: +b.toFixed(3), word: p, ...pos };
      });
      const words = [...s.words.filter((w) => w.removed), ...fresh].sort((x, y) => x.start - y.start);
      return { ...s, words };
    }));
  }
  const [fixText, setFixText] = useState(null); // texto em edição no trecho selecionado
  useEffect(() => setFixText(null), [sel]);

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

  // Transcrição atual (edições da timeline) — usada para planejar o B-roll.
  function currentTranscript() {
    return {
      provider: transcript.provider,
      language: transcript.language,
      segments: segments.map((s) => ({ start: s.start, end: s.end, words: s.words.map(wordOut) })),
    };
  }

  // Busca outro termo para um momento do B-roll (troca as opções daquele momento).
  const [searching, setSearching] = useState(null);
  async function searchMoment(i, q) {
    const query = String(q || '').trim();
    if (query.length < 2) return;
    setSearching(i);
    setBrollErr('');
    try {
      // Orientação do vídeo final: o formato escolhido ou, no original, o do próprio vídeo.
      const v = videoRef.current;
      const portrait = aspectSel === '9:16' || (aspectSel !== '16:9' && aspectSel !== '1:1' && (!v || v.videoHeight >= v.videoWidth));
      const r = await searchBroll(query, imageSource, portrait ? 'portrait' : 'landscape');
      if (!r.candidates?.length) setBrollErr(`Nada encontrado para “${query}”. Tente outro termo ou outra fonte.`);
      else setMoment(i, { candidates: r.candidates, pick: 0, removed: false, query, term: query, myMediaId: null, myThumb: null });
    } catch (e) {
      setBrollErr(e.message);
    } finally {
      setSearching(null);
    }
  }

  async function reviewBroll(srcOverride) {
    setBrollErr('');
    setBrollBusy(true);
    try {
      const src = typeof srcOverride === 'string' ? srcOverride : imageSource;
      const plan = await fetchBrollPlan(sourceId, currentTranscript(), { ...options, ...cap, broll: true, imageSource: src });
      const moments = (plan.moments || []).map((m, i) => ({
        key: `b${i}_${Date.now()}`, zoom: 1, fx: 0.5, fy: 0.5,
        start: m.start, end: m.end, term: m.term, query: m.query,
        candidates: m.candidates || [],
        pick: (m.candidates || []).length ? 0 : -1, // índice do candidato escolhido (-1 = nenhum)
        removed: (m.candidates || []).length === 0, // sem candidato → começa removido
        myThumb: null, myMediaId: null, myKind: null,
      }));
      setBrollReview({ source: plan.source, moments });
      if (!moments.length) setBrollErr('Nenhum momento de B-roll foi sugerido para este vídeo.');
    } catch (err) {
      setBrollErr(err.message || 'falha ao planejar o B-roll');
    } finally {
      setBrollBusy(false);
    }
  }
  const setMoment = (i, patch) => setBrollReview((r) => ({ ...r, moments: r.moments.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const cycleCand = (i, dir) => setBrollReview((r) => ({ ...r, moments: r.moments.map((m, j) => {
    if (j !== i || !m.candidates.length) return m;
    const n = m.candidates.length;
    return { ...m, pick: ((m.pick + dir) % n + n) % n, removed: false, myThumb: null, myMediaId: null };
  }) }));

  async function onPickBrollMedia(e) {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    const i = brollTargetIdx.current;
    if (!file || i == null) return;
    setBrollBusy(true);
    try {
      const info = await uploadMedia(file);
      setMoment(i, { myMediaId: info.id, myKind: info.kind, myThumb: URL.createObjectURL(file), removed: false });
    } catch (err) {
      setBrollErr(err.message || 'falha ao enviar a mídia');
    } finally {
      setBrollBusy(false);
    }
  }

  // Monta o plano de B-roll travado para enviar no render (a partir da revisão).
  function brollPlanForRender() {
    if (!brollReview) return null;
    return brollReview.moments.map((m) => {
      if (m.removed) return { start: m.start, end: m.end, remove: true };
      const frame = { zoom: +Number(m.zoom || 1).toFixed(2), fx: +Number(m.fx ?? 0.5).toFixed(3), fy: +Number(m.fy ?? 0.5).toFixed(3) };
      if (m.myMediaId) return { start: m.start, end: m.end, mediaId: m.myMediaId, kind: m.myKind, query: m.term, ...frame };
      const c = m.candidates[m.pick];
      if (!c) return { start: m.start, end: m.end, remove: true };
      return { start: m.start, end: m.end, url: c.link, kind: c.kind, query: m.term, credit: c.credit || null, ...frame };
    });
  }

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
        segments: segments.map((s) => ({ start: s.start, end: s.end, words: s.words.map(wordOut) })),
      },
      {
        manualSilence: true,
        silenceCuts,
        // Enquadramento (tela dividida): manual envia foco; auto deixa o servidor
        // detectar o rosto. Zoom vale para os dois.
        personZoom: +Number(zoom).toFixed(2),
        // Formato do vídeo final + enquadramento no formato (escolhidos na aba Enquadramento).
        aspect: aspectSel,
        quality: hdAllowed ? quality : 'original',
        reframeMode,
        ...(framingMode === 'manual'
          ? { personFocusX: +focus.x.toFixed(3), personFocusY: +focus.y.toFixed(3) }
          : {}),
        // Ajustes de legenda escolhidos aqui na timeline (sobrepõem os das opções).
        ...cap,
        // Zoom, efeitos sonoros e cor escolhidos nas abas Efeitos e Cor.
        ...fx,
        // Tratamento e modificadores da voz (aba Áudio).
        ...voice,
        // Zooms nos momentos-chave (tempo original; o servidor remapeia após os cortes).
        ...(fx.videoMotion === 'dynamic' && zoomMoments
          ? { zoomMoments: zoomMoments.map((z) => ({ start: +z.start.toFixed(2), end: +z.end.toFixed(2), ...(z.scale ? { scale: +Number(z.scale).toFixed(2) } : {}) })) }
          : {}),
        colorLook,
        colorAdjust: colorAdj,
        // Trechos cortados à mão na faixa de vídeo (tempo original).
        videoCuts: cuts.map((c) => ({ start: +c.start.toFixed(2), end: +c.end.toFixed(2) })),
        // Volume da fala (tempo original — este estágio roda antes dos cortes).
        audioMute,
        cutBreaths,
        speed,
        audioVolume: +Number(audioVolume).toFixed(2),
        audioGains: gains.map((g) => ({ start: +g.start.toFixed(2), end: +g.end.toFixed(2), volume: +Number(g.volume).toFixed(2) })),
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
        // B-roll revisado: trava o que entra em cada momento (e liga o B-roll).
        ...(brollReview ? { broll: true, brollPlan: brollPlanForRender() } : {}),
        // Layout do B-roll escolhido aqui (tela cheia ou tela dividida).
        brollLayout: brollLayoutSel,
        imageSource,
      },
    );
  }

  // Capítulos automáticos (faixa colorida da timeline): Intro, Conteúdo principal e
  // Conclusão — ou "Chamada (CTA)" quando a frase final pede uma ação.
  const chapters = useMemo(() => {
    const segs = segments.filter((x) => !segRemoved(x));
    if (dur < 12 || segs.length < 3) return [];
    const CTA = /\b(segue|siga|comenta|comente|link|bio|salva|salve|compartilha|compartilhe|inscreva|inscreve|curte|curta|chama|chame|manda|whatsapp|direct|clica|clique)\b/i;
    const introTarget = Math.min(9, Math.max(3, dur * 0.12));
    const introEnd = (segs.find((x) => x.end >= introTarget) || segs[0]).end;
    const cta = segs.find((x) => x.start >= dur * 0.6 && CTA.test(x.words.map((w) => w.word).join(' ')));
    const concStart = cta ? cta.start : (segs.find((x) => x.start >= dur * 0.85) || segs[segs.length - 1]).start;
    const last = segs[segs.length - 1].end;
    const list = [{ label: 'Intro', start: segs[0].start, end: introEnd, color: C.orange }];
    if (concStart - introEnd >= 3) {
      list.push({ label: 'Conteúdo principal', start: introEnd, end: concStart, color: C.purple });
      list.push({ label: cta ? 'Chamada (CTA)' : 'Conclusão', start: concStart, end: last, color: '#3B82F6' });
    } else {
      list.push({ label: 'Conteúdo principal', start: introEnd, end: last, color: C.purple });
    }
    return list.filter((c) => c.end - c.start > 0.5);
  }, [segments, dur]);

  const allGone = stats.removed >= stats.total;
  const showZoomLane = fx.videoMotion === 'dynamic';
  const showChapLane = chapters.length > 0 && !isMobile;
  const legH = isMobile ? 44 : LANE.legenda;
  const showBrollLane = !!brollReview?.moments?.length;

  const selSeg = segments[sel];

  // Arrastou a legenda na prévia: grava a posição (0–1 no quadro final) conforme o escopo.
  function onCapDrag(x, y, seg, word) {
    if (capScope === 'todas') {
      setCapField({ captionX: x, captionY: y });
      return;
    }
    setSegments((prev) => prev.map((s) => {
      if (s.start !== seg?.start) return s;
      return {
        ...s,
        words: s.words.map((w) => (capScope === 'palavra' && w.start !== word?.start) || w.removed ? w : { ...w, px: x, py: y }),
      };
    }));
  }
  const capSegNow = segments.find((s) => cur >= s.start && cur < s.end) || null;
  // ── Painel de legendas (lista estilo Premiere + propriedades da selecionada)
  const [capPane, setCapPane] = useState('lista');
  const [capQuery, setCapQuery] = useState('');
  const [capEdit, setCapEdit] = useState(null); // índice da legenda em edição na lista
  const capListRef = useRef(null);
  const capRows = useMemo(() => {
    const q = norm(capQuery.trim());
    const rows = segments.map((s, si) => ({ s, si }));
    return q ? rows.filter(({ s }) => norm(s.words.map((w) => w.word).join(' ')).includes(q)) : rows;
  }, [segments, capQuery]);
  const capSel = segments[sel] || null;
  const capSelRange = capSel ? (keptRange(capSel) || [capSel.start, capSel.end]) : [0, 0];
  const capSelText = capSel ? (segRemoved(capSel) ? capSel.words : capSel.words.filter((w) => !w.removed)).map((w) => w.word).join(' ') : '';
  function goCaption(dir) {
    const i = Math.max(0, Math.min(segments.length - 1, sel + dir));
    const s = segments[i];
    if (!s) return;
    setSel(i);
    seek((keptRange(s) || [s.start])[0] + 0.01);
  }
  function openSheet(kind, t) {
    if (t) setTab(t);
    if (kind === 'capList') setCapPane('lista');
    if (kind === 'capStyle') setCapPane('estilo');
    if (kind === 'capEm') setCapPane('enfase');
    if (kind !== 'tab' && kind !== 'speed') setTab('legenda');
    setSheet(kind);
  }
  // A lista acompanha: tocando → a legenda falada; parado → a selecionada.
  const capFollow = playing ? activeIndex : sel;
  useEffect(() => {
    const box = capListRef.current;
    if (!box || capFollow < 0) return;
    const row = box.querySelector(`[data-si="${capFollow}"]`);
    if (!row) return;
    if (row.offsetTop < box.scrollTop || row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = Math.max(0, row.offsetTop - box.clientHeight / 3);
    }
  }, [capFollow, capPane, tab]);
  // Atalhos de teclado (fora de campos de texto): espaço, setas, S para dividir.
  const keysRef = useRef({});
  keysRef.current = { togglePlay, seek, cur, goCaption, splitAtPlayhead, undo, redo };
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = keysRef.current;
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) k.redo(); else k.undo(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); k.redo(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); k.togglePlay(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); k.seek(k.cur - (e.shiftKey ? 5 : 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); k.seek(k.cur + (e.shiftKey ? 5 : 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); k.goCaption(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); k.goCaption(1); }
      else if (e.key === 's' || e.key === 'S') { k.splitAtPlayhead(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const capMoved = segments.some((s) => s.words.some((w) => w.px != null)) || cap.captionX != null;
  // Ênfase manual de uma palavra (cor própria / maior) — identificada pelo início dela.
  const [emWord, setEmWord] = useState(null);
  function setWordEm(seg, start, patch) {
    setSegments((prev) => prev.map((s) => (s.start !== seg.start ? s : {
      ...s,
      words: s.words.map((w) => {
        if (w.start !== start) return w;
        const next = { ...w, ...patch };
        if (!next.emColor) delete next.emColor;
        if (!next.emBig) delete next.emBig;
        return next;
      }),
    })));
  }
  function resetCapPos(all) {
    setSegments((prev) => prev.map((s) => (all || s === capSegNow
      ? { ...s, words: s.words.map(({ px, py, ...w }) => w) }
      : s)));
    if (all) setCapField({ captionX: undefined, captionY: undefined });
  }

  // Prévia da composição 9:16 (sua metade interativa + metade do B-roll). Fica ao
  // lado do vídeo (mesma linha) quando o enquadramento é manual.
  // B-roll escolhido no instante atual (mostrado sobre o vídeo, como no render).
  const brollMoment = (brollReview?.moments || []).find((m) => !m.removed && cur >= m.start && cur < m.end);
  const thumbOf = (m) => (m && !m.removed ? (m.myThumb || m.candidates?.[m.pick]?.thumb || null) : null);
  const brollNow = thumbOf(brollMoment);
  // Na prévia 9:16 mostra o B-roll do momento atual ou, se nenhum, o selecionado na aba.
  const brollShownIdx = brollMoment ? brollReview.moments.indexOf(brollMoment) : selBroll;
  const brollShown = brollShownIdx != null ? brollReview?.moments?.[brollShownIdx] : null;
  const brollImgStyle = (m) => ({
    width: '100%', height: '100%', objectFit: 'cover', display: 'block',
    objectPosition: `${(m?.fx ?? 0.5) * 100}% ${(m?.fy ?? 0.5) * 100}%`,
    transform: `scale(${m?.zoom || 1})`, transformOrigin: `${(m?.fx ?? 0.5) * 100}% ${(m?.fy ?? 0.5) * 100}%`,
    filter: videoFilter,
  });

  // Prévia 9:16 = o que sai no vídeo naquele instante: com B-roll ativo, tela dividida
  // (ou B-roll em tela cheia); sem B-roll, o VÍDEO INTEIRO com o enquadramento.
  const brollLayout = brollLayoutSel === 'fullscreen' ? 'fullscreen' : 'split';
  const previewMode = brollMoment && thumbOf(brollMoment) ? (brollLayout === 'split' ? 'split' : 'broll') : 'video';
  // Recorte da pessoa = a MESMA conta do servidor (faceCropGeometry): cobre o quadro,
  // amplia pelo zoom e CENTRALIZA no ponto do rosto. Assim a prévia bate com o render.
  const fitMode = reframeMode === 'fit' && aspectSel !== 'original' && previewMode === 'video';
  const personCropStyle = (() => {
    if (fitMode) return { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', filter: videoFilter };
    const sd = vdim || (vbox?.vw ? { w: vbox.vw, h: vbox.vh } : null);
    if (!sd || !pbox?.w || !pbox?.h) {
      return { width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${focus.x * 100}% ${focus.y * 100}%`, filter: videoFilter };
    }
    const g = coverCrop(sd.w, sd.h, pbox.w, pbox.h, focus, zoom);
    return { position: 'absolute', left: -g.cropX, top: -g.cropY, width: g.scaledW, height: g.scaledH, maxWidth: 'none', objectFit: 'fill', filter: videoFilter };
  })();
  const personHalf = (
    <div
      key="person"
      ref={previewBoxRef}
      onPointerDown={(e) => {
        e.preventDefault();
        const r = previewBoxRef.current.getBoundingClientRect();
        panRef.current = { startX: e.clientX, startY: e.clientY, fx: focus.x, fy: focus.y, w: r.width, h: r.height, zoom };
      }}
      style={{ position: 'relative', height: previewMode === 'split' ? '50%' : previewMode === 'video' ? '100%' : '0%', display: previewMode === 'broll' ? 'none' : 'block', overflow: 'hidden', cursor: 'grab', touchAction: 'none', boxShadow: `inset 0 0 0 2px ${C.orange}` }}
    >
      {fitMode && (
        <video ref={bgVideoRef} src={sourceUrl(sourceId)} muted playsInline preload="auto" aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.12)', filter: `${videoFilter && videoFilter !== 'none' ? `${videoFilter} ` : ''}blur(9px) brightness(0.88)` }} />
      )}
      <div ref={motionWrapRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
        <video
          ref={previewVideoRef}
          src={sourceUrl(sourceId)}
          muted playsInline preload="auto"
          style={personCropStyle}
        />
      </div>
      <div style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '2px 7px', borderRadius: 6 }}>
        {previewMode === 'video' ? (fitMode ? 'vídeo inteiro · fundo desfocado' : aspectSel !== 'original' && reframeMode === 'auto' && framingMode !== 'manual' ? 'segue o rosto (automático)' : 'vídeo · arraste/role') : 'você (arraste/role)'}
      </div>
    </div>
  );
  const brollHalf = (() => {
    const th = thumbOf(brollShown);
    const ok = th && !badThumbs.has(th);
    const idx = brollShownIdx;
    const onDown = (e) => {
      if (!ok || idx == null) return;
      e.preventDefault();
      const box = e.currentTarget.getBoundingClientRect();
      const m0 = brollReview.moments[idx];
      const start = { x: e.clientX, y: e.clientY, fx: m0.fx ?? 0.5, fy: m0.fy ?? 0.5 };
      setSelBroll(idx);
      const move = (ev) => {
        // arrastar a imagem para a direita mostra mais da esquerda (como mover a foto)
        const fx = Math.min(1, Math.max(0, start.fx - (ev.clientX - start.x) / box.width));
        const fy = Math.min(1, Math.max(0, start.fy - (ev.clientY - start.y) / box.height));
        setMoment(idx, { fx: +fx.toFixed(3), fy: +fy.toFixed(3) });
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    return (
      <div key="broll" onPointerDown={onDown} style={{ height: previewMode === 'split' ? '50%' : previewMode === 'broll' ? '100%' : '0%', display: previewMode === 'video' ? 'none' : 'grid', position: 'relative', overflow: 'hidden', cursor: ok ? 'grab' : 'default', placeItems: 'center', background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.02) 8px, rgba(255,255,255,0.02) 16px)', color: C.faint }}>
        {ok ? (
          <>
            <img src={th} alt="" draggable={false} onError={() => setBadThumbs((bt) => new Set(bt).add(th))} style={{ ...brollImgStyle(brollShown), position: 'absolute', inset: 0 }} />
            <span style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 9.5, fontWeight: 700, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 6, padding: '2px 6px' }}>B-roll · arraste</span>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Icon name="image" size={18} strokeWidth={1.8} />
            <div style={{ fontSize: 10.5, fontWeight: 700 }}>B-roll</div>
          </div>
        )}
      </div>
    );
  })();
  // Proporção da prévia = proporção do vídeo final escolhido.
  const srcDim = vdim || (vbox?.vw ? { w: vbox.vw, h: vbox.vh } : null);
  const previewRatio = aspectSel === '1:1' ? '1 / 1' : aspectSel === '16:9' ? '16 / 9' : aspectSel === '9:16' ? '9 / 16' : srcDim ? `${srcDim.w} / ${srcDim.h}` : '9 / 16';
  const landscapePreview = aspectSel === '16:9' || (aspectSel === 'original' && srcDim && srcDim.w > srcDim.h);
  // Proporção (largura/altura) do vídeo original e do formato final — dividem a largura.
  const mainAr = srcDim ? srcDim.w / srcDim.h : 9 / 16;
  const fmtAr = aspectSel === '1:1' ? 1 : aspectSel === '16:9' ? 16 / 9 : aspectSel === '9:16' ? 9 / 16 : mainAr;
  const previewLabel = aspectSel === 'original' ? 'formato original' : aspectSel;
  const composedPreview = (
    <div ref={composedRef} style={{ position: 'relative', width: `min(calc(var(--rf-stage-h) * ${fmtAr.toFixed(4)}), calc((100cqw - 16px) * var(--fmt-share)))`, aspectRatio: previewRatio, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, border: `1px solid ${C.border}`, background: '#000' }}>
      {personSide === 'top' ? [personHalf, brollHalf] : [brollHalf, personHalf]}
      <span className="rf-tl-pvlabel" style={{ position: 'absolute', top: 6, right: 6, zIndex: 3, pointerEvents: 'none', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: '3px 6px' }}>
        Prévia {previewLabel}{previewMode === 'split' ? ' · dividida' : previewMode === 'broll' ? ' · B-roll' : ''}
      </span>
      {/* Legenda como sai no vídeo final, por cima da prévia do formato. */}
      {cap.captions && cbox && <CaptionOverlay videoRef={videoRef} segments={segments} options={cap} box={cbox} sample={tab === 'legenda'} editable={tab === 'legenda'} onDragPos={onCapDrag} />}
    </div>
  );
  const showFormatPreview = framingMode === 'manual' || aspectSel !== 'original';


  // Trechos que NÃO vão para o vídeo final (cortes, pausas cortadas, palavras cortadas):
  // a prévia pula por cima deles ao tocar — igual ao resultado.
  const skipRanges = (() => {
    const r = [
      ...cuts.map((c) => [c.start, c.end]),
      ...pausesCut.map((p) => [p.start, p.end]),
    ];
    for (const seg of segments) for (const w of seg.words || []) if (w.removed) r.push([w.start, w.end]);
    r.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [a, b] of r) {
      if (b - a < 0.05) continue;
      const last = out[out.length - 1];
      if (last && a <= last[1] + 0.02) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    return out;
  })();

  // Dados usados pela prévia ao vivo (lidos pelo laço do player).
  const liveWindows = fx.videoMotion === 'dynamic' ? (zoomMoments || []).map((z) => [z.start, z.end, z.scale]) : [];
  liveRef.current = {
    skip: previewCuts ? skipRanges : [],
    fx,
    dur,
    windows: liveWindows,
    audio: { audioMute, audioVolume, gains },
    sfxTimes: [
      ...liveWindows.map(([a]) => Math.max(0, a - 0.3)),
      ...((brollReview?.moments || []).filter((m) => !m.removed).map((m) => Math.max(0, Number(m.start) - 0.3))),
    ],
  };

  // Ênfase por palavra da legenda selecionada (cor própria / maior)
  const enfaseBlock = cap.captions && catalog && capSel ? (
                    <div style={{ padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Ênfase nas palavras</div>
                    {capSel ? (() => {
                      const kept = capSel.words.filter((w) => !w.removed);
                      const pick = kept.find((w) => w.start === emWord) || null;
                      return (
                        <>
                          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Toque numa palavra da frase e escolha uma cor ou deixe maior. Vale só para ela.</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {kept.map((w) => {
                              const on = w.start === emWord;
                              const hex = (catalog.captionColors || []).find((c) => c.id === w.emColor)?.hex;
                              return (
                                <button key={w.start} onClick={() => setEmWord(on ? null : w.start)}
                                  style={{ padding: '5px 9px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: w.emBig ? 13.5 : 12, fontWeight: 700,
                                    color: hex || C.text, background: on ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.3)', border: on ? '1.5px solid #fff' : `1px solid ${C.border}` }}>
                                  {w.word}
                                </button>
                              );
                            })}
                          </div>
                          {pick ? (
                            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: C.muted, marginRight: 2 }}>Cor de "{pick.word}":</span>
                                {(catalog.captionColors || []).map((o) => (
                                  <button key={o.id} onClick={() => setWordEm(capSel, pick.start, { emColor: pick.emColor === o.id ? undefined : o.id })} title={o.label}
                                    style={{ width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', background: o.hex, border: pick.emColor === o.id ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)' }} />
                                ))}
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button onClick={() => setWordEm(capSel, pick.start, { emBig: !pick.emBig })} style={miniBtn(!!pick.emBig, false)}>{pick.emBig ? 'Maior ✓' : 'Deixar maior'}</button>
                                {(pick.emColor || pick.emBig) && (
                                  <button onClick={() => setWordEm(capSel, pick.start, { emColor: undefined, emBig: undefined })} style={miniBtn(false, false)}>Tirar ênfase</button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>Nenhuma palavra escolhida.</div>
                          )}
                        </>
                      );
                    })() : (
                      <div style={{ fontSize: 11, color: C.faint }}>Leve o vídeo até um trecho com fala para escolher as palavras.</div>
                    )}
                  </div>
  ) : null;

  const editorCard = (
    <div className={`rf-tl-card${isMobile ? ' rf-m' : ''}${isMobile && sheet ? ' rf-m-sheet' : ''}`} style={{ ...glass(), padding: 22 }}>
      {isMobile && (
        <div className="rf-m-top">
          <button onClick={onBack} disabled={busy} aria-label="Fechar o editor" style={mIconBtn}><Icon name="close" size={22} strokeWidth={2} /></button>
          <button onClick={() => openSheet('tab', 'enquadramento')} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.08)', color: C.text, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
            {aspectSel === 'original' ? 'Original' : aspectSel} <Icon name="chevron" size={13} strokeWidth={2.2} style={{ transform: 'rotate(90deg)' }} />
          </button>
          <button onClick={generate} disabled={busy || allGone} style={{ height: 36, padding: '0 16px', borderRadius: 10, border: 'none', background: busy || allGone ? 'rgba(255,255,255,0.1)' : GRAD, color: '#fff', fontWeight: 700, fontSize: 14.5, fontFamily: 'inherit', cursor: 'pointer' }}>
            {busy ? 'Gerando…' : 'Exportar'}
          </button>
        </div>
      )}
      <div className="rf-tl-head" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,107,53,0.14)', color: C.orangeSoft }}><Icon name="film" size={18} strokeWidth={1.9} /></span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16.5, letterSpacing: -0.2 }}>Editor de vídeo</div>
          <div className="rf-tl-hide-sm" style={{ fontSize: 11.5, color: C.faint }}>Corte, legende e ajuste antes de exportar · {APP_VERSION}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <GhostButton onClick={onBack} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="arrowLeft" size={14} strokeWidth={2} /> Voltar
          </GhostButton>
          <button onClick={generate} disabled={busy || allGone} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 11, padding: '0 18px', minHeight: 40, background: busy || allGone ? 'rgba(255,255,255,0.08)' : GRAD, color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy || allGone ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: busy || allGone ? 'none' : '0 10px 24px -10px rgba(255,107,53,0.7)' }}>
            <Icon name="upload" size={15} strokeWidth={2.2} /> Exportar
          </button>
        </div>
      </div>

      <div className={`rf-tl-grid rf-stage-${stage}`} style={{ display: 'grid', gridTemplateColumns: '156px minmax(0, 1fr) minmax(320px, 360px)', gap: 16, alignItems: 'start', ...(isMobile && sheet ? { '--rf-stage-h': 'max(140px, calc(100dvh - var(--rf-sheet-h) - 118px - env(safe-area-inset-top)))' } : isMobile ? { '--rf-stage-h': `max(200px, calc(100dvh - ${(stage === 's' ? 470 : stage === 'l' ? 330 : 400) + (showZoomLane ? 28 : 0) + (showBrollLane ? 30 : 0) + (media.length ? 34 : 0)}px - env(safe-area-inset-bottom)))` } : {}) }}>
        {/* Ferramentas (como num editor): cada uma abre o painel de ajustes à direita */}
        <nav className="rf-tl-nav" style={{ display: 'grid', gap: 4, padding: 8, borderRadius: 16, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.025)', alignSelf: 'start' }}>
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} title={t.label} style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: on ? 700 : 600, textAlign: 'left', whiteSpace: 'nowrap',
                background: on ? 'linear-gradient(90deg, rgba(255,107,53,0.18), rgba(255,107,53,0.04))' : 'transparent', color: on ? C.text : C.muted,
              }}>
                {on && <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: C.orange }} />}
                <Icon name={t.icon} size={17} strokeWidth={1.9} color={on ? C.orangeSoft : 'currentColor'} /> <span className="rf-tl-navlbl">{t.label}</span>
              </button>
            );
          })}
          <div style={{ height: 1, background: C.border, margin: '6px 4px' }} />
          <button onClick={generate} disabled={busy || allGone} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 11, border: 'none', cursor: busy || allGone ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: 'transparent', color: C.orangeSoft, textAlign: 'left' }}>
            <Icon name="upload" size={17} strokeWidth={2} /> <span className="rf-tl-navlbl">Exportar</span>
          </button>
        </nav>

        <div className="rf-tl-preview">
          {/* Vídeo principal + prévia 9:16 do ajuste, LADO A LADO (mesma linha) */}
          {/* Vídeo e prévia do formato centralizados, lado a lado e com a MESMA altura:
              cada um ocupa uma fatia da largura proporcional ao seu formato. */}
          <div className={`rf-tl-pv${showFormatPreview ? ' rf-tl-pv--fmt' : ''}`} style={{ '--main-share': showFormatPreview ? (mainAr / (mainAr + fmtAr)).toFixed(4) : 1, '--fmt-share': showFormatPreview ? (fmtAr / (mainAr + fmtAr)).toFixed(4) : 1, containerType: 'inline-size', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, padding: 10, borderRadius: 16, border: `1px solid ${C.border}`, background: 'radial-gradient(circle at 50% 0%, rgba(124,58,237,0.10), transparent 60%), rgba(0,0,0,0.35)' }}>
            <div className="rf-tl-main" style={{ flex: '0 0 auto', minWidth: 0 }}>
              <div style={{ position: 'relative', width: `min(calc(var(--rf-stage-h) * ${mainAr.toFixed(4)}), calc((100cqw - ${showFormatPreview ? 16 : 0}px) * var(--main-share)))`, aspectRatio: `${mainAr}`, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, background: '#000' }}>
                <video ref={videoRef} src={sourceUrl(sourceId)} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', background: '#000', filter: videoFilter }} onClick={framingMode === 'manual' ? undefined : togglePlay} onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth) setVdim({ w: v.videoWidth, h: v.videoHeight }); if (cur > 0.05 && Math.abs(v.currentTime - cur) > 0.2) v.currentTime = cur; v.playbackRate = speed; measureVideo(); }} playsInline />
                {vbox && lookCss.tint && <div style={{ position: 'absolute', left: vbox.x, top: vbox.y, width: vbox.w, height: vbox.h, pointerEvents: 'none', ...lookCss.tint }} />}
                {vbox && colorCss.tint && <div style={{ position: 'absolute', left: vbox.x, top: vbox.y, width: vbox.w, height: vbox.h, pointerEvents: 'none', ...colorCss.tint }} />}
                {vbox && brollNow && (
                  <div style={{
                    position: 'absolute', left: vbox.x, width: vbox.w, pointerEvents: 'none', overflow: 'hidden',
                    // Tela dividida: o B-roll ocupa só a metade dele (em cima ou embaixo).
                    top: vbox.y + (brollLayoutSel === 'bottom' ? vbox.h / 2 : 0),
                    height: brollLayoutSel === 'fullscreen' ? vbox.h : vbox.h / 2,
                  }}>
                    <img src={brollNow} alt="" style={brollImgStyle(brollMoment)} />
                    <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, fontWeight: 700, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 6, padding: '2px 6px' }}>B-roll</span>
                  </div>
                )}
                {vbox && colorFrame && (
                  <div style={{ position: 'absolute', left: vbox.x, top: vbox.y, width: vbox.w, height: vbox.h, pointerEvents: 'none' }}>
                    <img src={colorFrame.url} alt="" onLoad={() => setColorFrame((f) => (f ? { ...f, loaded: true } : f))} onError={() => setColorFrame(null)}
                      style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', opacity: colorFrame.loaded ? 1 : 0, transition: 'opacity .15s' }} />
                    <span style={{ position: 'absolute', right: 6, top: 6, fontSize: 10, fontWeight: 700, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 6, padding: '2px 7px' }}>
                      {colorFrame.loaded ? '✓ cor exata do vídeo final' : 'gerando cor exata…'}
                    </span>
                  </div>
                )}
                {cap.captions && <CaptionOverlay videoRef={videoRef} segments={segments} options={cap} box={vbox} sample={tab === 'legenda'} editable={tab === 'legenda' && !showFormatPreview} onDragPos={onCapDrag} />}
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
            </div>
            {showFormatPreview && (
              <div className="rf-tl-pv-fmt">
                {composedPreview}
                {previewMode === 'split' && <button onClick={() => setPersonSide((s) => (s === 'top' ? 'bottom' : 'top'))} style={{ ...zoomBtn, width: '100%', padding: '6px 0', marginTop: 8, fontSize: 11, fontWeight: 600 }}>Você: {personSide === 'top' ? 'em cima' : 'embaixo'}</button>}
              </div>
            )}
          </div>
          {isMobile && (
            <div className="rf-m-ctrl">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <button onClick={() => { const el = previewBoxRef.current?.parentElement || videoRef.current; if (el?.requestFullscreen) el.requestFullscreen().catch(() => {}); }} aria-label="Tela cheia" style={mIconBtn}><Icon name="maximize" size={19} strokeWidth={2} /></button>
                <span style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{mmss(cur)} <span style={{ color: C.faint }}>/ {mmss(dur)}</span></span>
              </div>
              <button onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Tocar'} style={{ ...mIconBtn, width: 44, height: 44, justifySelf: 'center' }}><Icon name={playing ? 'pause' : 'play'} size={24} strokeWidth={2} /></button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                {speed !== 1 && <button onClick={() => openSheet('speed')} aria-label="Velocidade" style={{ border: 'none', borderRadius: 6, background: 'rgba(255,107,53,0.18)', color: C.orangeSoft, fontSize: 11, fontWeight: 800, padding: '4px 6px', fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 }}>{fmtSpeed(speed)}</button>}
                <button onClick={() => setPreviewCuts((v) => !v)} aria-label="Prévia com cortes" title={previewCuts ? 'Tocando com os cortes' : 'Tocando sem cortes'} style={{ ...mIconBtn, width: 34, color: previewCuts ? C.orangeSoft : C.muted }}><Icon name="scissors" size={18} strokeWidth={2} /></button>
                <button onClick={undo} disabled={!canUndo} aria-label="Desfazer" style={{ ...mIconBtn, width: 34, opacity: canUndo ? 1 : 0.35 }}><Icon name="undo" size={19} strokeWidth={2} /></button>
                <button onClick={redo} disabled={!canRedo} aria-label="Refazer" style={{ ...mIconBtn, width: 34, opacity: canRedo ? 1 : 0.35 }}><Icon name="undo" size={19} strokeWidth={2} style={{ transform: 'scaleX(-1)' }} /></button>
              </div>
            </div>
          )}
          {/* Barra do player: play, tempo, barra de progresso, prévia com cortes e tela cheia */}
          {!isMobile && <div className="rf-tl-bar" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, padding: '8px 12px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)' }}>
            <button onClick={togglePlay} style={{ ...playBtn, width: 34, height: 34 }}><Icon name={playing ? 'pause' : 'play'} size={15} strokeWidth={2} /></button>
            <div style={{ fontSize: 12.5, color: C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{mmss(cur)} <span style={{ color: C.faint }}>/ {mmss(dur)}</span></div>
            <div
              onPointerDown={(e) => {
                const el = e.currentTarget;
                const at = (ev) => { const r = el.getBoundingClientRect(); seek(((ev.clientX - r.left) / r.width) * dur); };
                at(e);
                const move = (ev) => at(ev);
                const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
              }}
              style={{ position: 'relative', flex: 1, height: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', minWidth: 40 }}
            >
              <div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ position: 'absolute', left: 0, width: `${dur ? (cur / dur) * 100 : 0}%`, height: 4, borderRadius: 4, background: GRAD }} />
              <div style={{ position: 'absolute', left: `calc(${dur ? (cur / dur) * 100 : 0}% - 6px)`, width: 12, height: 12, borderRadius: '50%', background: '#fff', boxShadow: `0 0 0 3px ${C.orange}55` }} />
            </div>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title="Velocidade do vídeo final (a prévia toca nela)" aria-label="Velocidade"
              style={{ height: 30, flexShrink: 0, borderRadius: 8, border: `1px solid ${speed !== 1 ? C.orange : C.border}`, background: 'rgba(0,0,0,0.35)', color: speed !== 1 ? C.orangeSoft : C.text, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', padding: '0 6px', cursor: 'pointer' }}>
              {SPEEDS.map((k) => <option key={k} value={k}>{fmtSpeed(k)}</option>)}
            </select>
            <button onClick={() => setPreviewCuts((v) => !v)} title="Ao tocar, pular os trechos cortados (como no vídeo final)" style={{ ...miniBtn(previewCuts, false), whiteSpace: 'nowrap', flexShrink: 0 }}>
              <Icon name="scissors" size={12} strokeWidth={2.2} /> <span className="rf-tl-hide-sm">{previewCuts ? 'Com cortes' : 'Sem cortes'}</span>
            </button>
            <button onClick={() => setStage((v) => (v === 'm' ? 'l' : v === 'l' ? 's' : 'm'))} title="Tamanho do player: menor deixa mais espaço para a timeline" style={{ ...miniBtn(false, false), whiteSpace: 'nowrap', flexShrink: 0 }}>
              <Icon name="layout" size={13} strokeWidth={2} /> <span className="rf-tl-hide-sm">Player {stage === 's' ? 'P' : stage === 'l' ? 'G' : 'M'}</span>
            </button>
            <button onClick={() => { const el = videoRef.current?.parentElement; if (el?.requestFullscreen) el.requestFullscreen().catch(() => {}); }} title="Tela cheia" style={{ ...zoomBtn, width: 30, height: 30 }}>
              <Icon name="maximize" size={14} strokeWidth={2} />
            </button>
          </div>}
        </div>

        {/* Ajustes em abas, AO LADO da prévia: dá para ver o efeito enquanto ajusta. */}
          {(!isMobile || sheet) && (
          <div className="rf-tl-adjust" style={{ minWidth: 0, alignSelf: 'start', position: 'sticky', top: 12, maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', paddingRight: 4 }}>
          {isMobile && (
            <div className="rf-m-sheethead">
              <span style={{ width: 40 }} />
              <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>{SHEET_TITLE[sheet] || (TABS.find((t) => t.id === tab) || {}).label}</div>
              <button onClick={() => setSheet(null)} aria-label="Concluir" style={mIconBtn}><Icon name={sheet === 'capAuto' ? 'close' : 'check'} size={22} strokeWidth={2.2} /></button>
            </div>
          )}
          {sheet === 'speed' && isMobile ? (
            <div style={{ display: 'grid', gap: 14, paddingTop: 4 }}>
              <SpeedPicker value={speed} onChange={setSpeed} big />
              <div style={{ ...mRow, justifyContent: 'space-between' }}>
                <span>Duração final</span>
                <span style={{ color: C.green, fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(stats.keptSec / speed)}</span>
              </div>
              <div style={{ ...mRow, display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><Icon name="mic" size={19} strokeWidth={1.9} /> <span style={{ flex: 1 }}>Respirações</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={() => setCutBreaths(true)} style={{ ...miniBtn(cutBreaths, false), minHeight: 40, justifyContent: 'center' }}>Remover</button>
                  <button onClick={() => setCutBreaths(false)} style={{ ...miniBtn(!cutBreaths, false), minHeight: 40, justifyContent: 'center' }}>Manter</button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>A prévia já toca nessa velocidade. A voz acelera sem mudar o tom; legendas e sons acompanham.</div>
            </div>
          ) : sheet === 'capAuto' && isMobile ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
              <div style={mRow}>
                <Icon name="sparkles" size={19} strokeWidth={1.9} /> <span style={{ flex: 1 }}>Gerar a partir de</span>
                <span style={{ color: C.muted, fontWeight: 600 }}>Fala do vídeo</span>
              </div>
              <div style={mRow}>
                <Icon name="mic" size={19} strokeWidth={1.9} /> <span style={{ flex: 1 }}>Idioma de origem</span>
                <span style={{ color: C.muted, fontWeight: 600 }}>{transcript.language ? String(transcript.language).toUpperCase() : 'Automático'}</span>
              </div>
              <div style={{ ...mRow, display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Icon name="captions" size={19} strokeWidth={1.9} /> <span style={{ flex: 1 }}>Modelos</span>
                  <button onClick={() => openSheet('capStyle')} style={{ background: 'none', border: 'none', color: C.muted, display: 'flex', cursor: 'pointer' }} aria-label="Mais ajustes de estilo"><Icon name="chevron" size={16} strokeWidth={2.2} /></button>
                </div>
                <CaptionGallery row options={cap} onApply={(p) => { setCapField(p); if (p.soundEffects) setFx((f) => ({ ...f, soundEffects: true })); }} />
              </div>
              <div style={{ ...mRow, display: 'block', background: 'linear-gradient(180deg, rgba(124,58,237,0.16), rgba(255,255,255,0.05))' }}>
                <button onClick={() => setAdvOpen((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', color: C.purpleSoft, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}>
                  <Icon name="sparkles" size={18} strokeWidth={2} /> <span style={{ flex: 1, textAlign: 'left' }}>Opções avançadas</span>
                  <Icon name="chevron" size={16} strokeWidth={2.2} style={{ transform: advOpen ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .15s' }} />
                </button>
                {advOpen && catalog && (
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    <CapRow label="Linhas por legenda">
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[1, 2].map((n) => <button key={n} onClick={() => setCapField({ captionLines: n })} style={{ ...miniBtn(cap.captionLines === n, false), flex: 1, minHeight: 36 }}>{n === 1 ? '1 linha' : '2 linhas'}</button>)}
                      </div>
                    </CapRow>
                    <CapRow label={`Caracteres por linha (${cap.captionMaxChars > 0 ? cap.captionMaxChars : 'automático'})`}>
                      <input type="range" min="7" max="42" step="1" value={cap.captionMaxChars > 0 ? cap.captionMaxChars : 7} onChange={(e) => { const v = Number(e.target.value); setCapField({ captionMaxChars: v <= 7 ? 0 : v }); }} style={{ width: '100%' }} />
                    </CapRow>
                    <CapRow label="Modo (palavra / frase)"><Sel value={cap.captionMode} opts={catalog.captionModes} onChange={(v) => setCapField({ captionMode: v })} /></CapRow>
                    <CapRow label="Destacar palavra falada">
                      <button onClick={() => setCapField({ captionHighlight: !cap.captionHighlight })} style={{ ...miniBtn(cap.captionHighlight, false), minHeight: 36 }}>{cap.captionHighlight ? 'Ligado' : 'Desligado'}</button>
                    </CapRow>
                  </div>
                )}
              </div>
              <button onClick={() => { setCapField({ captions: true }); setSheet(null); setMTool('legenda'); }} style={{ height: 52, borderRadius: 14, border: 'none', background: GRAD, color: '#fff', fontSize: 16.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 14px 30px -14px rgba(255,107,53,0.8)' }}>
                {cap.captions ? 'Aplicar' : 'Gerar legendas'}
              </button>
            </div>
          ) : (<>

          {/* Enquadramento na tela dividida */}
          {tab === 'enquadramento' && (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="crop" size={15} strokeWidth={2} /></span>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Formato do vídeo</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 10 }}>
                {FORMATS.map((o) => {
                  const on = aspectSel === o.id;
                  return (
                    <button key={o.id} onClick={() => setAspectSel(o.id)} title={o.hint}
                      style={{ ...framingTab(on), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 4px' }}>
                      <span style={{ width: o.w, height: o.h, borderRadius: 3, border: `1.5px solid ${on ? C.orange : C.muted}` }} />
                      <span style={{ fontSize: 11.5 }}>{o.label}</span>
                    </button>
                  );
                })}
              </div>
              {aspectSel !== 'original' && (
                <>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: 0.3, marginBottom: 6 }}>COMO O VÍDEO ENTRA NO FORMATO</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {REFRAME_MODES.map((o) => (
                      <button key={o.id} onClick={() => { setReframeMode(o.id); if (o.id === 'manual') setFramingMode('manual'); }}
                        style={{ ...framingTab(reframeMode === o.id), textAlign: 'left', padding: '8px 10px' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{o.label}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontWeight: 500, marginTop: 2 }}>{o.hint}</div>
                      </button>
                    ))}
                  </div>
                  {reframeMode === 'manual' && <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>Arraste o vídeo na <b>prévia</b> (ou o ponto laranja no player) para escolher o que fica no quadro.</div>}
                </>
              )}
            </div>
          )}
          {tab === 'enquadramento' && (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="sparkles" size={15} strokeWidth={2} /></span>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Qualidade da exportação</div>
                {!hdAllowed && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: '#fff', background: GRAD, borderRadius: 20, padding: '2px 8px' }}>PREMIUM</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                {QUALITY_OPTS.map((o) => {
                  const on = (hdAllowed ? quality : 'original') === o.id;
                  const locked = o.id !== 'original' && !hdAllowed;
                  return (
                    <button key={o.id} onClick={() => (locked ? openPlans() : setQuality(o.id))} title={locked ? 'Disponível no plano Premium' : o.hint}
                      style={{ ...framingTab(on), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 4px', opacity: locked ? 0.55 : 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{locked && <Icon name="lock" size={11} strokeWidth={2.4} />}{o.label}</span>
                      <span style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>{o.sub}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>
                {hdAllowed
                  ? quality === 'original'
                    ? 'Mantém a resolução do formato escolhido. Escolha 720p, 1080p ou 4K para ampliar com redução de ruído e nitidez.'
                    : `O vídeo sai em ${QUALITY_OPTS.find((q) => q.id === quality)?.label}, ampliado com redução de ruído e nitidez${quality === '2160' ? ' (4K demora mais e gera arquivo maior)' : ''}. Não inventa detalhes que a gravação não tem.`
                  : <>720p, 1080p e 4K são do plano <b style={{ color: C.text }}>Premium</b>. <button onClick={openPlans} style={{ background: 'none', border: 'none', color: C.orangeSoft, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 11 }}>Ver planos</button></>}
              </div>
            </div>
          )}
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
              {framingMode === 'manual' && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
                    <span style={{ width: 46 }}>Zoom</span>
                    <button onClick={() => setZoom((z) => clampZoom(z - 0.1))} style={zoomBtn} title="Diminuir">−</button>
                    <input type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={(e) => setZoom(clampZoom(Number(e.target.value)))} style={{ flex: 1 }} />
                    <button onClick={() => setZoom((z) => clampZoom(z + 0.1))} style={zoomBtn} title="Aumentar">+</button>
                    <span style={{ width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{zoom.toFixed(2)}×</span>
                  </label>
                  <div style={{ fontSize: 11, color: C.faint }}>Arraste no ponto do rosto (vídeo) ou direto na <b>prévia</b>. A prévia mostra o que sai em cada ponto: <b>tela dividida</b> quando há B-roll naquele momento e o <b>vídeo inteiro</b> (com este zoom e enquadramento) quando não há.</div>
                </div>
              )}
            </div>
          )}

          {/* B-roll: revisar/trocar as imagens escolhidas antes de renderizar */}
          {tab === 'broll' && (
            <div style={{ marginTop: 14, background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="image" size={15} strokeWidth={2} /></span>
                <div style={{ fontSize: 13, fontWeight: 700 }}>B-roll · imagens automáticas</div>
              </div>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: 0.3, marginBottom: 6 }}>COMO O B-ROLL APARECE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginBottom: 12 }}>
                {BROLL_LAYOUTS.map((o) => {
                  const on = brollLayoutSel === o.id;
                  return (
                    <button key={o.id} onClick={() => setBrollLayoutSel(o.id)} title={o.hint}
                      style={{ ...framingTab(on), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 6px' }}>
                      <span style={{ width: 22, height: 36, borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: `1px solid ${on ? C.orange : C.border}` }}>
                        {o.id === 'fullscreen'
                          ? <span style={{ flex: 1, background: C.purpleSoft }} />
                          : o.id === 'top'
                            ? <><span style={{ flex: 1, background: C.purpleSoft }} /><span style={{ flex: 1, background: C.orange }} /></>
                            : <><span style={{ flex: 1, background: C.orange }} /><span style={{ flex: 1, background: C.purpleSoft }} /></>}
                      </span>
                      <span style={{ fontSize: 11, lineHeight: 1.2, textAlign: 'center' }}>{o.label}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: 0.3, marginBottom: 6 }}>DE ONDE VÊM AS IMAGENS</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {BROLL_SOURCES.filter((o) => (o.id !== 'pexels' || caps.brollReady) && (o.id !== 'pixabay' || caps.pixabayReady) && (o.id !== 'google' || caps.googleImagesReady)).map((o) => (
                  <button key={o.id} title={o.hint} disabled={brollBusy}
                    onClick={() => { setImageSource(o.id); if (brollReview) reviewBroll(o.id); }}
                    style={{ ...framingTab(imageSource === o.id), flex: '1 1 auto' }}>{o.label}</button>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 10 }}>
                Veja as imagens/vídeos que o sistema escolheu para cada trecho e <b>troque, substitua pela sua mídia ou remova</b> antes de gerar.
                {billing && !billing.unlimited && <> Cada imagem inserida custa <b>{billing.costs.image} créditos</b>.</>}
              </div>
              {billing && !billing.features.includes('image') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#FCA5B4', background: 'rgba(240,82,107,0.1)', border: `1px solid ${C.red}55`, borderRadius: 9, padding: '8px 10px', marginBottom: 10 }}>
                  <Icon name="lock" size={14} strokeWidth={2} />
                  <span style={{ flex: 1 }}>B-roll faz parte do plano Pro ou acima.</span>
                  <button onClick={openPlans} style={{ background: 'none', border: 'none', color: C.orangeSoft, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Ver planos</button>
                </div>
              )}
              <input ref={brollUploadRef} type="file" accept="image/*,video/*" onChange={onPickBrollMedia} style={{ display: 'none' }} />
              {!brollReview && (
                <button onClick={() => reviewBroll()} disabled={brollBusy} style={{ ...framingTab(false), width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6, opacity: brollBusy ? 0.6 : 1, cursor: brollBusy ? 'not-allowed' : 'pointer' }}>
                  <Icon name="image" size={13} strokeWidth={2} /> {brollBusy ? 'Analisando o vídeo…' : 'Revisar / trocar imagens'}
                </button>
              )}
              {brollErr && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{brollErr}</div>}
              {brollReview && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 11, color: C.faint }}>{brollReview.moments.length} momento(s) · fonte: {brollReview.source}</div>
                    <button onClick={() => reviewBroll()} disabled={brollBusy} style={{ ...zoomBtn, width: 'auto', padding: '0 8px', fontSize: 10.5, fontWeight: 600 }} title="Analisar de novo">↻ refazer</button>
                  </div>
                  {brollReview.moments.map((m, i) => {
                    const n = m.candidates.length;
                    const thumb0 = m.removed ? null : (m.myThumb || m.candidates[m.pick]?.thumb);
                    const thumb = thumb0 && !badThumbs.has(thumb0) ? thumb0 : null;
                    const isSel = i === selBroll;
                    return (
                      <div key={m.key || i} onClick={() => { setSelBroll(i); seek(m.start + 0.05); }}
                        style={{ background: isSel ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isSel ? C.purpleSoft : C.border}`, borderRadius: 10, padding: 8, opacity: m.removed ? 0.55 : 1, cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 10.5, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(m.start)}</span>
                          <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{m.term}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                          <div style={{ width: 64, height: 54, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: '#000', border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center' }}>
                            {thumb
                              ? <img src={thumb} alt="" onError={() => setBadThumbs((b) => new Set(b).add(thumb0))} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${(m.fx ?? 0.5) * 100}% ${(m.fy ?? 0.5) * 100}%` }} />
                              : <span style={{ fontSize: 9.5, color: C.faint, textAlign: 'center' }}>{thumb0 ? <>sem<br />prévia</> : <>sem<br />imagem</>}</span>}
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <button onClick={() => cycleCand(i, -1)} disabled={n < 2 || m.removed} style={{ ...zoomBtn, width: 24, height: 22 }} title="Anterior">‹</button>
                              <span style={{ fontSize: 10.5, color: C.muted, minWidth: 34, textAlign: 'center' }}>{m.removed ? '—' : m.myMediaId ? 'minha' : n ? `${m.pick + 1}/${n}` : '0'}</span>
                              {!m.removed && !m.myMediaId && m.candidates[m.pick] && (
                                <span style={{ fontSize: 9.5, fontWeight: 700, borderRadius: 5, padding: '1px 5px', color: '#fff', background: m.candidates[m.pick].kind === 'video' ? C.purple : m.candidates[m.pick].source === 'google' ? '#1a73e8' : 'rgba(255,255,255,0.18)' }}>
                                  {m.candidates[m.pick].kind === 'video' ? '▶ vídeo' : SOURCE_LABEL[m.candidates[m.pick].source] || 'imagem'}
                                </span>
                              )}
                              <button onClick={() => cycleCand(i, 1)} disabled={n < 2 || m.removed} style={{ ...zoomBtn, width: 24, height: 22 }} title="Próxima">›</button>
                            </div>
                            <div style={{ display: 'flex', gap: 5 }}>
                              <button onClick={() => { brollTargetIdx.current = i; brollUploadRef.current?.click(); }} style={{ ...zoomBtn, width: 'auto', flex: 1, padding: '0 6px', fontSize: 10, fontWeight: 600 }} title="Usar minha imagem/vídeo">Minha</button>
                              <button onClick={() => setMoment(i, { removed: !m.removed })} style={{ ...zoomBtn, width: 'auto', flex: 1, padding: '0 6px', fontSize: 10, fontWeight: 600, color: m.removed ? C.green : C.red }}>{m.removed ? 'Repor' : 'Remover'}</button>
                            </div>
                          </div>
                        </div>
                        {isSel && (
                          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                            <form onSubmit={(e) => { e.preventDefault(); searchMoment(i, new FormData(e.currentTarget).get('q')); }} style={{ display: 'flex', gap: 5 }}>
                              <input name="q" key={`${m.key || i}-${m.query}`} defaultValue={m.query || m.term} placeholder="Buscar outra imagem (ex.: reunião, café, academia)"
                                style={{ flex: 1, minWidth: 0, minHeight: 30, padding: '0 9px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 12, fontFamily: 'inherit' }} />
                              <button type="submit" disabled={searching === i} style={{ ...zoomBtn, width: 'auto', padding: '0 10px', fontSize: 11, fontWeight: 700 }}>{searching === i ? '…' : 'Buscar'}</button>
                            </form>
                            {!m.removed && m.candidates[m.pick]?.credit && !m.myMediaId && (
                              <div style={{ fontSize: 10.5, color: C.faint }}>Crédito: {m.candidates[m.pick].credit}</div>
                            )}
                            {!m.removed && (<>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.muted }}>
                              <span style={{ width: 40 }}>Zoom</span>
                              <input type="range" min="1" max="2.5" step="0.05" value={m.zoom || 1} onChange={(e) => setMoment(i, { zoom: Number(e.target.value) })} style={{ flex: 1 }} />
                              <span style={{ width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number(m.zoom || 1).toFixed(2)}×</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.muted }}>
                              <span style={{ width: 40 }}>Lado</span>
                              <input type="range" min="0" max="1" step="0.01" value={m.fx ?? 0.5} onChange={(e) => setMoment(i, { fx: Number(e.target.value) })} style={{ flex: 1 }} />
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.muted }}>
                              <span style={{ width: 40 }}>Altura</span>
                              <input type="range" min="0" max="1" step="0.01" value={m.fy ?? 0.5} onChange={(e) => setMoment(i, { fy: Number(e.target.value) })} style={{ flex: 1 }} />
                            </label>
                            <div style={{ fontSize: 10.5, color: C.faint }}>Ajuste aparece na prévia (e na 9:16). Dica: arraste a imagem na prévia 9:16 para posicionar.</div>
                            </>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 10.5, color: C.faint }}>As trocas são aplicadas quando você clicar em <b>Gerar vídeo</b>.</div>
                </div>
              )}
            </div>
          )}

          {/* Volume da fala: geral, mudo e trechos com volume próprio */}
          {tab === 'audio' && (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${C.border}`, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Silêncios e respirações</div>
                <CapRow label="Respirações entre as frases">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setCutBreaths(true)} style={{ ...miniBtn(cutBreaths, false), flex: 1 }}>Remover</button>
                    <button onClick={() => setCutBreaths(false)} style={{ ...miniBtn(!cutBreaths, false), flex: 1 }}>Manter</button>
                  </div>
                </CapRow>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11.5, color: C.muted, flex: 1, minWidth: 140 }}>{pauses.length ? `${pausesCut.length} de ${pauses.length} pausas cortadas (−${fmtDuration(pauseCutSec)})` : 'Sem pausas para cortar'}</span>
                  <button onClick={cutAllPauses} disabled={!pauses.length || pausesCut.length === pauses.length} style={miniBtn(false, !pauses.length || pausesCut.length === pauses.length)}>Cortar todas</button>
                  <button onClick={keepAllPauses} disabled={!pausesCut.length} style={miniBtn(false, !pausesCut.length)}>Manter todas</button>
                </div>
                <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.45 }}>Com <b>Remover</b>, a inspiração antes de cada frase sai junto com a pausa (o corte vai até a próxima palavra).</div>
              </div>
              <div style={{ paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Velocidade do vídeo</div>
                <SpeedPicker value={speed} onChange={setSpeed} />
                <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>Duração final: <b style={{ color: C.text }}>{fmtDuration(stats.keptSec / speed)}</b> · a voz acelera sem mudar o tom.</div>
              </div>
              <div style={{ paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Voz</div>
                <VoicePanel stacked catalog={catalog} value={voice} onChange={setVoice} onPreview={playVoicePreview} previewBusy={voicePrev.busy}
                  previewNote={voicePrev.err || 'a partir do ponto atual do vídeo'} />
                {voicePrev.url && <audio ref={voiceAudioRef} src={voicePrev.url} controls style={{ width: '100%', marginTop: 6, height: 34 }} />}
              </div>
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

          {tab === 'efeitos' && (
            <div style={{ display: 'grid', gap: 12, background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <CapRow label="Movimento (zoom)">
                <Sel value={fx.videoMotion} opts={catalog?.videoMotions} onChange={(v) => setFx((f) => ({ ...f, videoMotion: v }))} />
              </CapRow>
              {fx.videoMotion !== 'none' && (
                <CapRow label="Intensidade do zoom">
                  <div style={{ display: 'flex', gap: 6 }}>
                    {INTENSITIES.map((o) => (
                      <button key={o.id} onClick={() => setFx((f) => ({ ...f, motionIntensity: o.id }))} style={framingTab(fx.motionIntensity === o.id)}>{o.label}</button>
                    ))}
                  </div>
                </CapRow>
              )}
              {fx.videoMotion === 'dynamic' && (
                <CapRow label={`Momentos de zoom (${(zoomMoments || []).length}) — faixa ZOOM na timeline`}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={addZoomAtPlayhead} style={toolBtn(false)}>+ Zoom no playhead ({fmtDuration(cur)})</button>
                    <button onClick={() => { setZoomMoments(autoZoomMoments()); setSelZoom(null); }} style={toolBtn(false)}>
                      <Icon name="undo" size={13} strokeWidth={2} /> Recalcular automático
                    </button>
                  </div>
                </CapRow>
              )}
              {fx.videoMotion === 'dynamic' && selZoomItem && (
                <div style={{ border: `1px solid ${C.orange}`, borderRadius: 10, padding: 10, background: 'rgba(255,107,53,0.06)', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
                    Zoom em {fmtDuration(selZoomItem.start)} → {fmtDuration(selZoomItem.end)}
                    <button onClick={() => { setZoomMoments((l) => l.filter((z) => z.key !== selZoomItem.key)); setSelZoom(null); }} style={{ ...miniBtn(false, false), marginLeft: 'auto', color: C.red }}>Remover</button>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: C.muted }}>
                    <span style={{ width: 62 }}>Aproximar</span>
                    <input type="range" min="1.03" max="1.5" step="0.01"
                      value={selZoomItem.scale || MOTION_Z[fx.motionIntensity] || 1.12}
                      onChange={(e) => { const v = Number(e.target.value); setZoomMoments((l) => l.map((z) => (z.key === selZoomItem.key ? { ...z, scale: v } : z))); demoRef.current = { start: performance.now(), until: performance.now() + 2500 }; }}
                      style={{ flex: 1 }} />
                    <span style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number(selZoomItem.scale || MOTION_Z[fx.motionIntensity] || 1.12).toFixed(2)}×</span>
                  </label>
                </div>
              )}
              <CapRow label="Efeitos sonoros (whoosh)">
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setFx((f) => ({ ...f, soundEffects: false }))} style={framingTab(!fx.soundEffects)}>Desligados</button>
                  <button onClick={() => setFx((f) => ({ ...f, soundEffects: true }))} style={framingTab(fx.soundEffects)}>Ligados</button>
                </div>
              </CapRow>
              {fx.soundEffects && (
                <CapRow label="Volume dos efeitos">
                  <div style={{ display: 'flex', gap: 6 }}>
                    {INTENSITIES.map((o) => (
                      <button key={o.id} onClick={() => setFx((f) => ({ ...f, sfxIntensity: o.id }))} style={framingTab(fx.sfxIntensity === o.id)}>{o.label}</button>
                    ))}
                  </div>
                </CapRow>
              )}
              <div style={{ fontSize: 11.5, color: C.faint }}>
                <b>Prévia:</b> ao escolher um movimento, o player ao lado mostra o efeito na hora; dê play para ver no ritmo da fala e ouvir os whooshes. O <b>zoom nos momentos-chave</b> só aproxima nos pontos de ênfase (pausa antes, números, perguntas, palavras fortes) — não o vídeo inteiro. Na faixa <b>ZOOM</b> da timeline: clique para ajustar, arraste para mover, puxe as pontas para mudar a duração. Os whooshes tocam nesses zooms e nas entradas de B-roll.
              </div>
            </div>
          )}

          {tab === 'cor' && (
            <div style={{ display: 'grid', gap: 12, background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <CapRow label="Look (estilo de cor)">
                <Sel value={colorLook} opts={catalog?.colorLooks} onChange={setColorLook} />
              </CapRow>
              {COLOR_SLIDERS.map((sl) => (
                <CapRow key={sl.id} label={sl.hint ? `${sl.label} (${sl.hint})` : sl.label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="range" min="-100" max="100" step="1" value={colorAdj[sl.id]}
                      onChange={(e) => setColorAdj((a) => ({ ...a, [sl.id]: Number(e.target.value) }))} style={{ flex: 1 }} />
                    <span style={{ width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{colorAdj[sl.id] > 0 ? '+' : ''}{colorAdj[sl.id]}</span>
                  </div>
                </CapRow>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11.5, color: C.faint, flex: 1, minWidth: 200 }}>
                  Com o vídeo <b>pausado</b>, a prévia mostra a <b>cor exata</b> do vídeo final (gerada com o mesmo filtro do render). Tocando, a cor é uma aproximação rápida.
                </div>
                <button onClick={() => setColorAdj({ brightness: 0, contrast: 0, saturation: 0, temperature: 0 })} style={miniBtn(false, false)}>Zerar ajustes</button>
              </div>
            </div>
          )}

          {/* Ajustes de legenda (posição, fonte, estilo…) direto na edição */}
          {tab === 'legenda' && (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="captions" size={15} strokeWidth={2} /></span>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Legenda</div>
                <button onClick={() => setCapField({ captions: !cap.captions })} title="Mostrar ou não a legenda no vídeo final"
                  style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${cap.captions ? 'rgba(46,212,122,0.45)' : C.border}`, background: cap.captions ? 'rgba(46,212,122,0.12)' : 'rgba(255,255,255,0.04)', color: cap.captions ? C.green : C.muted, borderRadius: 999, padding: '4px 10px 4px 6px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ width: 26, height: 15, borderRadius: 999, background: cap.captions ? C.green : 'rgba(255,255,255,0.18)', position: 'relative', transition: 'background .15s' }}>
                    <span style={{ position: 'absolute', top: 2, left: cap.captions ? 13 : 2, width: 11, height: 11, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                  </span>
                  {cap.captions ? 'No vídeo' : 'Desligada'}
                </button>
              </div>
              {!isMobile && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 3, borderRadius: 11, background: 'rgba(255,255,255,0.05)', marginBottom: 10 }}>
                {[{ id: 'lista', label: 'Legendas', icon: 'list' }, { id: 'estilo', label: 'Estilo', icon: 'type' }].map((o) => (
                  <button key={o.id} onClick={() => setCapPane(o.id)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: capPane === o.id ? 'rgba(255,255,255,0.13)' : 'transparent', color: capPane === o.id ? C.text : C.muted }}>
                    <Icon name={o.icon} size={14} strokeWidth={2} /> {o.label}
                  </button>
                ))}
              </div>}
              {capPane === 'enfase' ? (
                enfaseBlock || <div style={{ fontSize: 12, color: C.faint, padding: '8px 2px' }}>Ligue a legenda e escolha uma frase na timeline para destacar palavras.</div>
              ) : capPane === 'lista' ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {/* Lista de legendas (como o painel Captions do Premiere): nº, entrada/saída e texto */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                      <span style={{ position: 'absolute', left: 9, top: 9, color: C.faint, display: 'flex' }}><Icon name="search" size={14} strokeWidth={2} /></span>
                      <input value={capQuery} onChange={(e) => setCapQuery(e.target.value)} placeholder="Buscar na legenda"
                        style={{ width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px 0 30px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 12.5, fontFamily: 'inherit' }} />
                    </div>
                    <button onClick={splitAtPlayhead} disabled={!canSplit} title="Dividir a legenda no ponto atual (S)" style={{ ...zoomBtn, width: 32, height: 32, opacity: canSplit ? 1 : 0.4 }}><Icon name="scissors" size={14} strokeWidth={2} /></button>
                    <button onClick={() => mergeNext(sel)} disabled={sel >= segments.length - 1} title="Juntar com a próxima" style={{ ...zoomBtn, width: 32, height: 32, opacity: sel < segments.length - 1 ? 1 : 0.4 }}><Icon name="merge" size={14} strokeWidth={2} /></button>
                  </div>
                  <div ref={capListRef} style={{ position: 'relative', maxHeight: isMobile ? '44dvh' : 'min(40vh, 360px)', minHeight: 120, overflowY: 'auto', borderRadius: 11, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.3)', padding: 4 }}>
                    {capRows.length === 0 && <div style={{ fontSize: 12, color: C.faint, padding: 14, textAlign: 'center' }}>{capQuery ? 'Nada encontrado.' : 'Sem falas para legendar.'}</div>}
                    {capRows.map(({ s: seg, si }) => {
                      const gone = segRemoved(seg);
                      const kr = keptRange(seg) || [seg.start, seg.end];
                      const on = si === sel;
                      const live = si === activeIndex;
                      const text = (gone ? seg.words : seg.words.filter((w) => !w.removed)).map((w) => w.word).join(' ');
                      return (
                        <div key={si} data-si={si} onClick={() => { if (isMobile && on && !gone) { setCapEdit(si); return; } setSel(si); seek(kr[0] + 0.01); }} onDoubleClick={() => setCapEdit(si)}
                          style={{ position: 'relative', display: 'grid', gridTemplateColumns: isMobile ? '30px 48px minmax(0, 1fr)' : '26px 70px minmax(0, 1fr)', gap: 8, alignItems: isMobile ? 'center' : 'start', padding: isMobile ? '13px 8px' : '9px 8px 9px 10px', borderRadius: 9, cursor: 'pointer', background: on ? 'rgba(255,255,255,0.09)' : 'transparent', marginBottom: 2 }}>
                          {live && <span style={{ position: 'absolute', left: 2, top: 8, bottom: 8, width: 3, borderRadius: 3, background: C.orange }} />}
                          {isMobile ? (
                            <button onClick={(e) => { e.stopPropagation(); setSel(si); seek(kr[0] + 0.01); videoRef.current?.play?.(); }} aria-label="Tocar esta legenda" style={{ background: 'none', border: 'none', color: on ? C.text : C.muted, display: 'flex', padding: 0, cursor: 'pointer' }}><Icon name="play" size={17} strokeWidth={2} /></button>
                          ) : (
                            <span style={{ fontSize: 11.5, color: C.faint, fontVariantNumeric: 'tabular-nums', paddingTop: 1 }}>{si + 1}.</span>
                          )}
                          {isMobile ? (
                            <span style={{ fontSize: 13.5, color: on ? C.text : C.muted, fontWeight: on ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>{mmss(kr[0])}</span>
                          ) : (
                            <span style={{ fontSize: 11, color: on ? C.text : C.muted, fontVariantNumeric: 'tabular-nums', lineHeight: 1.45 }}>{tc(kr[0])}<br />{tc(kr[1])}</span>
                          )}
                          {capEdit === si ? (
                            <input autoFocus defaultValue={text} onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => { setPhraseText(si, e.target.value); setCapEdit(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setCapEdit(null); }}
                              style={{ width: '100%', boxSizing: 'border-box', height: 30, padding: '0 8px', borderRadius: 7, border: `1px solid ${C.orange}`, background: 'rgba(0,0,0,0.5)', color: C.text, fontSize: 13, fontFamily: 'inherit' }} />
                          ) : (
                            <span style={{ fontSize: isMobile ? 15.5 : 13, lineHeight: 1.4, color: gone ? C.red : isMobile && !on ? C.muted : C.text, fontWeight: isMobile && on ? 600 : 400, textDecoration: gone ? 'line-through' : 'none', wordBreak: 'break-word' }}>{text}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {isMobile && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 4 }}>
                      <button onClick={() => mergeNext(sel)} disabled={sel >= segments.length - 1} className="rf-m-tool" style={{ opacity: sel < segments.length - 1 ? 1 : 0.4 }}><Icon name="merge" size={22} strokeWidth={1.7} /><span>Juntar com a próxima</span></button>
                      <button onClick={() => (pausesCut.length === pauses.length ? keepAllPauses() : cutAllPauses())} disabled={!pauses.length} className="rf-m-tool" style={{ opacity: pauses.length ? 1 : 0.4 }}><Icon name="scissors" size={22} strokeWidth={1.7} /><span>{pausesCut.length === pauses.length && pauses.length ? 'Manter pausas' : 'Remover pausas'}</span></button>
                    </div>
                  )}
                  <div className="rf-tl-hide-touch" style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>Clique para ir · duplo-clique para editar · <b>Espaço</b> toca/pausa · <b>↑ ↓</b> legenda anterior/próxima · <b>← →</b> 1s</div>

                  {/* Propriedades da legenda selecionada */}
                  {capSel && !isMobile && (
                    <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'linear-gradient(180deg, rgba(255,107,53,0.06), rgba(255,255,255,0.02))' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Legenda {sel + 1}<span style={{ color: C.faint, fontWeight: 600 }}> de {segments.length}</span></div>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                          <button onClick={() => goCaption(-1)} disabled={sel <= 0} title="Anterior (↑)" style={{ ...zoomBtn, opacity: sel > 0 ? 1 : 0.4 }}><Icon name="prev" size={12} strokeWidth={2} /></button>
                          <button onClick={() => goCaption(1)} disabled={sel >= segments.length - 1} title="Próxima (↓)" style={{ ...zoomBtn, opacity: sel < segments.length - 1 ? 1 : 0.4 }}><Icon name="next" size={12} strokeWidth={2} /></button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        {[['Entrada', capSelRange[0]], ['Saída', capSelRange[1]], ['Duração', capSelRange[1] - capSelRange[0]]].map(([k, v]) => (
                          <div key={k} style={{ flex: 1, minWidth: 70, padding: '5px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 9.5, color: C.faint, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>{k}</div>
                            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{k === 'Duração' ? `${v.toFixed(1)}s` : tc(v)}</div>
                          </div>
                        ))}
                      </div>
                      <textarea key={`${capSel.start}-${capSelText}`} defaultValue={capSelText} rows={2}
                        onBlur={(e) => setPhraseText(sel, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
                        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '8px 10px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.4)', color: C.text, fontSize: 14, lineHeight: 1.4, fontFamily: 'inherit' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10.5, color: C.faint }}>{capSelText.length} caracteres · Enter salva</span>
                        <button onClick={() => toggleSeg(sel)} style={{ ...miniBtn(false, false), marginLeft: 'auto', color: segRemoved(capSel) ? C.green : C.red }}>
                          <Icon name={segRemoved(capSel) ? 'undo' : 'trash'} size={12} strokeWidth={2} /> {segRemoved(capSel) ? 'Restaurar' : 'Cortar do vídeo'}
                        </button>
                      </div>
                    </div>
                  )}
                  {!isMobile && enfaseBlock}
                </div>
              ) : cap.captions && catalog ? (
                <>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>Modelo</div>
                    <CaptionGallery options={cap} onApply={(p) => { setCapField(p); if (p.soundEffects) setFx((f) => ({ ...f, soundEffects: true })); }} compact />
                  </div>
                  <CapRow label="Fonte"><Sel value={cap.captionFont} opts={catalog.captionFonts} onChange={(v) => setCapField({ captionFont: v })} /></CapRow>
                  <CapRow label="Modo (palavra / frase)"><Sel value={cap.captionMode} opts={catalog.captionModes} onChange={(v) => setCapField({ captionMode: v })} /></CapRow>
                  <CapRow label="Destacar palavra falada">
                    <button onClick={() => setCapField({ captionHighlight: !cap.captionHighlight })} style={miniBtn(cap.captionHighlight, false)}>
                      {cap.captionHighlight ? 'Ligado' : 'Desligado (legenda normal)'}
                    </button>
                  </CapRow>
                  <CapRow label="Fundo do texto"><Sel value={cap.captionBackground} opts={catalog.captionBackgrounds} onChange={(v) => setCapField({ captionBackground: v })} /></CapRow>
                  <CapRow label="Posição"><Sel value={cap.captionPosition} opts={catalog.captionPositions} onChange={(v) => setCapField({ captionPosition: v, captionX: undefined, captionY: undefined })} /></CapRow>
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
                  <CapRow label="Linhas por legenda">
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[1, 2].map((n) => <button key={n} onClick={() => setCapField({ captionLines: n })} style={{ ...miniBtn(cap.captionLines === n, false), flex: 1 }}>{n === 1 ? '1 linha' : '2 linhas'}</button>)}
                    </div>
                  </CapRow>
                  <CapRow label={`Caracteres por linha (${cap.captionMaxChars > 0 ? cap.captionMaxChars : 'automático'})`}>
                    <input type="range" min="7" max="42" step="1" value={cap.captionMaxChars > 0 ? cap.captionMaxChars : 7} onChange={(e) => { const v = Number(e.target.value); setCapField({ captionMaxChars: v <= 7 ? 0 : v }); }} style={{ width: '100%' }} />
                  </CapRow>
                  <div style={{ marginTop: 4, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Posição manual · arraste a legenda na prévia</div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Pare o vídeo na frase, escolha o que mover e arraste o texto (contorno tracejado) para onde quiser.</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                      {[{ id: 'frase', label: 'Só esta frase' }, { id: 'palavra', label: 'Só esta palavra' }, { id: 'todas', label: 'Todas' }].map((o) => (
                        <button key={o.id} onClick={() => setCapScope(o.id)} style={{ ...framingTab(capScope === o.id), padding: '7px 4px', fontSize: 11.5 }}>{o.label}</button>
                      ))}
                    </div>
                    {capScope === 'palavra' && <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>Mover palavra por palavra combina com o modo <b>Palavra</b> (uma palavra por vez na tela).</div>}
                    {capMoved && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => resetCapPos(false)} disabled={!capSegNow} style={miniBtn(false, !capSegNow)}>Voltar esta frase ao padrão</button>
                        <button onClick={() => resetCapPos(true)} style={miniBtn(false, false)}>Voltar todas ao padrão</button>
                      </div>
                    )}
                  </div>
                </div>
                </>
              ) : (
                <div style={{ fontSize: 11.5, color: C.faint, paddingTop: 8 }}>
                  O vídeo final sai <b>sem legendas</b>. Os blocos de fala continuam valendo para cortar e ajustar a timeline.
                </div>
              )}
            </div>
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
          </>)}
        </div>
          )}

        {/* Timeline logo abaixo do vídeo (como num editor), ao lado do painel de ajustes */}
        <div className="rf-tl-bottom" style={{ minWidth: 0 }}>
        {/* Barra de ferramentas da timeline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={splitAtPlayhead} disabled={!canSplit} title="Dividir no playhead (S)" style={toolBtn(!canSplit)}>
            <Icon name="scissors" size={14} strokeWidth={2} /> <span className="rf-tl-hide-sm">Dividir no playhead</span>
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
            {cutStart == null ? <span className="rf-tl-hide-sm">Cortar deste ponto</span> : `Fechar corte em ${fmtDuration(cur)}`}
          </button>
          {cutStart != null && (
            <button onClick={() => setCutStart(null)} style={toolBtn(false)}>Cancelar</button>
          )}
          {pauses.length > 0 && (
            <>
              <span style={{ width: 1, height: 20, background: C.border, margin: '0 2px' }} />
              <span className="rf-tl-hide-sm" style={{ fontSize: 11.5, color: C.faint }}>Pausas:</span>
              <button onClick={cutAllPauses} disabled={pausesCut.length === pauses.length} style={toolBtn(pausesCut.length === pauses.length)}>
                <Icon name="scissors" size={13} strokeWidth={2} /> <span className="rf-tl-hide-sm">Cortar pausas</span>
              </button>
              <button onClick={keepAllPauses} disabled={pausesCut.length === 0} style={toolBtn(pausesCut.length === 0)}>
                <Icon name="undo" size={13} strokeWidth={2} /> <span className="rf-tl-hide-sm">Manter pausas</span>
              </button>
            </>
          )}
          {/* Zoom da timeline (aproxima/afasta os blocos) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <span className="rf-tl-hide-sm" style={{ fontSize: 11.5, color: C.faint }}>Zoom</span>
            <button onClick={() => zoomTl(-1)} disabled={pps <= PPS_MIN} style={toolBtn(pps <= PPS_MIN)} title="Afastar">−</button>
            <button onClick={() => zoomTl(1)} disabled={pps >= PPS_MAX} style={toolBtn(pps >= PPS_MAX)} title="Aproximar">+</button>
            <button onClick={() => setPps(64)} style={toolBtn(false)} title="Zoom padrão">Ajustar</button>
          </div>
        </div>

        {/* Timeline: coluna fixa com o nome das faixas + área que rola */}
        <div className="rf-tl-track" style={{ position: 'relative', display: 'flex', border: `1px solid ${C.border}`, borderRadius: 16, background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.35))', overflow: 'hidden', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
          {/* celular: cursor fixo no meio, a timeline corre por baixo */}
          {isMobile && <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, background: '#fff', zIndex: 5, pointerEvents: 'none', boxShadow: '0 0 6px rgba(0,0,0,0.6)' }} />}
          <div className="rf-tl-labels" style={{ width: 104, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.25)', paddingBottom: 6 }}>
            <div style={{ height: LANE.ruler }} />
            {showChapLane && <Rotulo h={LANE.capitulos} gap={4} nome="CAPÍTULOS" dica="clique p/ ir" />}
            <Rotulo h={LANE.legenda} gap={6} nome="LEGENDA" dica="clique na palavra" />
            <Rotulo h={LANE.video} gap={4} nome="VÍDEO" dica={cuts.length ? null : 'arraste ou use o botão'} />
            {showZoomLane && <Rotulo h={LANE.zoom} gap={4} nome="ZOOM" dica="momentos-chave" />}
            {showBrollLane && <Rotulo h={LANE.broll} gap={4} nome="B-ROLL" dica="clique p/ ajustar" />}
            <Rotulo h={LANE.audio} gap={4} nome="ÁUDIO" dica={gains.length ? null : 'use a aba Áudio'} />
            <Rotulo h={LANE.pausas} gap={4} nome="PAUSAS" dica={pauses.length ? 'clique p/ manter' : null} />
            {media.length > 0 && <Rotulo h={LANE.midias} gap={4} nome="MÍDIAS" />}
          </div>
          <div ref={trackRef} onClick={onTrackClick} onScroll={onTrackScroll} onTouchStart={onTrackTouchStart} onTouchMove={onTrackTouchMove} onTouchEnd={onTrackTouchEnd}
            style={{ position: 'relative', overflowX: 'auto', overflowY: 'hidden', flex: 1, minWidth: 0, paddingBottom: 6, ...(isMobile ? { display: 'flex', scrollbarWidth: 'none' } : {}) }}>
            {isMobile && <div style={{ flex: '0 0 50%' }} />}
            <div style={{ position: 'relative', flex: '0 0 auto', width, height: LANE.ruler + (showChapLane ? 4 + LANE.capitulos : 0) + 6 + legH + 4 + LANE.video + (showZoomLane ? 4 + LANE.zoom : 0) + (showBrollLane ? 4 + LANE.broll : 0) + 4 + LANE.audio + (isMobile ? 0 : 4 + LANE.pausas) + (media.length ? 4 + LANE.midias : 0) }}>
            <div style={{ position: 'relative', height: LANE.ruler, borderBottom: `1px solid ${C.border}`, cursor: 'crosshair' }}>
              {Array.from({ length: Math.ceil(dur) + 1 }).map((_, s) => (
                <div key={s} style={{ position: 'absolute', left: s * pps, top: 0, height: 20, borderLeft: `1px solid ${s % 5 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'}` }}>
                  {s % (pps < 40 ? 10 : 5) === 0 && <span style={{ position: 'absolute', left: 4, top: 4, fontSize: 9.5, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{mmss(s)}</span>}
                </div>
              ))}
            </div>
            {showChapLane && (
              <div style={{ position: 'relative', height: LANE.capitulos, marginTop: 4 }}>
                {chapters.map((c) => (
                  <button key={c.label} onClick={(e) => { e.stopPropagation(); seek(c.start + 0.01); }} title={`${c.label} · ${mmss(c.start)}–${mmss(c.end)}`}
                    style={{ position: 'absolute', left: c.start * pps + 1, width: Math.max(20, (c.end - c.start) * pps - 2), top: 2, bottom: 2, borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: `linear-gradient(180deg, ${c.color}, ${c.color}cc)`, color: '#fff', fontSize: 11, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', padding: '0 10px', textAlign: 'left', boxShadow: `0 4px 12px -6px ${c.color}` }}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <div style={{ position: 'relative', height: legH, marginTop: 6 }}>
              {segments.map((s, si) => {
                const left = s.start * pps;
                const fullW = Math.max(10, (Math.max(s.end, s.start + 0.2) - s.start) * pps - 2);
                const gone = segRemoved(s);
                const isSel = si === sel;
                const isActive = si === activeIndex;
                const kr = keptRange(s);
                return (
                  <div key={si} onClick={(e) => { e.stopPropagation(); setSel(si); seek(s.start); if (isMobile) setMTool('legenda'); }} title={s.words.map((x) => x.word).join(' ')}
                    style={isMobile ? {
                      // celular: blocos âmbar como no CapCut; o selecionado ganha borda branca
                      position: 'absolute', left, width: fullW, top: 4, height: legH - 8, borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', border: isSel ? '2px solid #fff' : '1px solid rgba(0,0,0,0.25)',
                      background: gone ? 'rgba(240,82,107,0.35)' : '#E8A020', color: gone ? '#fff' : '#2a1800',
                    } : { position: 'absolute', left, width: fullW, top: 6, height: 52, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
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
                    {isMobile ? (
                      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textDecoration: gone ? 'line-through' : 'none' }}>
                        <Icon name="captions" size={13} strokeWidth={2} /> {s.words.filter((x) => !x.removed || gone).map((x) => x.word).join(' ')}
                      </span>
                    ) : (
                    <span style={{ position: 'relative', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', padding: '5px 9px', fontSize: 10.5, lineHeight: 1.25, textDecoration: gone ? 'line-through' : 'none' }}>
                      {s.words.map((x) => x.word).join(' ')}
                    </span>
                    )}
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

            {/* Faixa ZOOM: momentos-chave do punch-in (editáveis) */}
            {showZoomLane && (
              <div style={{ position: 'relative', height: LANE.zoom, marginTop: 4 }}>
                {(zoomMoments || []).map((z) => {
                  const isSel = z.key === selZoom;
                  return (
                    <div
                      key={z.key}
                      title={`Zoom ${Number(z.scale || MOTION_Z[fx.motionIntensity] || 1.12).toFixed(2)}× — clique para ajustar, arraste para mover`}
                      onMouseDown={(e) => { setSelZoom(z.key); startRangeDrag(setZoomMoments, z, 'move', e); }}
                      onClick={(e) => { e.stopPropagation(); setSelZoom(z.key); setTab('efeitos'); seek(z.start); }}
                      style={{
                        position: 'absolute', left: z.start * pps, width: Math.max(14, (z.end - z.start) * pps - 1), top: 0, bottom: 0, borderRadius: 5,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap',
                        border: `1px solid ${isSel ? '#fff' : C.orange}`, background: isSel ? 'rgba(255,107,53,0.5)' : 'rgba(255,107,53,0.25)',
                        fontSize: 10, fontWeight: 700, color: C.text,
                      }}
                    >
                      <Icon name="search" size={10} strokeWidth={2.4} /> {Number(z.scale || MOTION_Z[fx.motionIntensity] || 1.12).toFixed(2)}×
                      <div onMouseDown={(e) => startRangeDrag(setZoomMoments, z, 'left', e)} style={handleStyle('left')} />
                      <div onMouseDown={(e) => startRangeDrag(setZoomMoments, z, 'right', e)} style={handleStyle('right')} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Faixa B-ROLL: momentos revisados (clique abre o ajuste; arraste move) */}
            {showBrollLane && (
              <div style={{ position: 'relative', height: LANE.broll, marginTop: 4 }}>
                {brollReview.moments.map((m, i) => {
                  const isSel = i === selBroll;
                  const th = thumbOf(m);
                  return (
                    <div
                      key={m.key || i}
                      title={`${m.term} — clique para ajustar`}
                      onMouseDown={(e) => { setSelBroll(i); startRangeDrag(setBrollMoments, m, 'move', e); }}
                      onClick={(e) => { e.stopPropagation(); setSelBroll(i); setTab('broll'); seek(m.start + 0.05); }}
                      style={{
                        position: 'absolute', left: m.start * pps, width: Math.max(16, (m.end - m.start) * pps - 1), top: 0, bottom: 0, borderRadius: 5,
                        display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px', cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap',
                        border: `1px solid ${isSel ? '#fff' : C.purpleSoft}`, background: m.removed ? 'rgba(255,255,255,0.05)' : isSel ? 'rgba(124,58,237,0.55)' : 'rgba(124,58,237,0.3)',
                        opacity: m.removed ? 0.5 : 1, fontSize: 10, fontWeight: 700, color: C.text,
                      }}
                    >
                      {th && !badThumbs.has(th) && <img src={th} alt="" style={{ height: 20, width: 20, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.term}</span>
                      <div onMouseDown={(e) => startRangeDrag(setBrollMoments, m, 'left', e)} style={handleStyle('left')} />
                      <div onMouseDown={(e) => startRangeDrag(setBrollMoments, m, 'right', e)} style={handleStyle('right')} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Faixa de áudio: forma de onda da fala original */}
            <div style={{ position: 'relative', height: LANE.audio, marginTop: 4, borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}`, background: 'rgba(59,130,246,0.08)' }}>
              {wave && (
                <svg width={width} height={34} viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" style={{ display: 'block' }}>
                  <path d={wave} fill="#4F7BFF" opacity={0.85} />
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
            {!isMobile && <div style={{ position: 'relative', height: LANE.pausas, marginTop: 4 }}>
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
            </div>}
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
            {!isMobile && (
            <div style={{ position: 'absolute', left: cur * pps, top: 0, bottom: 0, width: 2, background: C.orange, boxShadow: `0 0 8px ${C.orange}`, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: 0, left: -6, width: 14, height: 16, borderRadius: '4px 4px 7px 7px', background: C.orange, boxShadow: `0 2px 8px ${C.orange}88` }} />
            </div>
            )}
            </div>
            {isMobile && <div style={{ flex: '0 0 50%' }} />}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 7 }}>Faixas, de cima para baixo: <b>legenda</b> (blocos de fala) · <b>vídeo</b> (arraste sobre ele para cortar um trecho)· <b>áudio</b> · a faixa das <span style={{ color: C.red }}>pausas de silêncio</span> (hachuradas serão cortadas — clique para manter) · arraste as pontas dos blocos para aparar{media.length > 0 && <> · a faixa das <span style={{ color: C.purpleSoft }}>minhas mídias</span> pode ser arrastada (mover) e ter as pontas ajustadas (duração)</>}</div>

        {/* Resumo + trecho selecionado na timeline (editar palavras) */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Chip label="Palavras" value={stats.total} color={C.text} />
            <Chip label="Cortadas" value={stats.removed} color={C.red} />
            <Chip label="Pausas cortadas" value={pausesCut.length} sub={pauseCutSec > 0.1 ? `−${fmtDuration(pauseCutSec)}` : null} color={C.orangeSoft} />
            <Chip label={speed !== 1 ? `Duração final · ${fmtSpeed(speed)}` : 'Duração final'} value={fmtDuration(stats.keptSec / speed)} sub={(stats.removedSec + cortadoSec) > 0.1 ? `−${fmtDuration(stats.removedSec + cortadoSec)}` : null} color={C.green} />
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
              {fixText != null ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <input autoFocus value={fixText} onChange={(e) => setFixText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setPhraseText(sel, fixText); setFixText(null); } if (e.key === 'Escape') setFixText(null); }}
                    style={{ flex: '1 1 240px', minHeight: 38, padding: '0 11px', borderRadius: 9, border: `1px solid ${C.orange}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 14, fontFamily: 'inherit' }} />
                  <button onClick={() => { setPhraseText(sel, fixText); setFixText(null); }} style={{ ...miniBtn(false, false), color: C.green, borderColor: C.green }}>Salvar</button>
                  <button onClick={() => setFixText(null)} style={miniBtn(false, false)}>Cancelar</button>
                </div>
              ) : (
                <button onClick={() => setFixText(selSeg.words.filter((w) => !w.removed).map((w) => w.word).join(' '))} disabled={segRemoved(selSeg)}
                  style={{ ...miniBtn(false, segRemoved(selSeg)), marginTop: 8 }}>
                  <Icon name="edit" size={12} strokeWidth={2.2} /> Corrigir o texto da legenda
                </button>
              )}
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>Clique numa palavra para cortá-la · duplo-clique para corrigir só ela · arraste as bordas do bloco na timeline</div>
            </div>
          )}
        </div>

        <CostLine
          mode="render"
          sourceId={sourceId}
          options={{ ...options, ...cap, ...(brollReview ? { broll: true, brollPlan: brollPlanForRender() } : {}) }}
          style={{ marginTop: 18 }}
        />
        <PrimaryButton onClick={generate} disabled={busy || allGone} style={{ width: '100%', marginTop: 12 }}>
          {allGone ? 'Você cortou tudo — reinclua algo' : busy ? 'Gerando…' : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Icon name="clapper" size={18} strokeWidth={1.9} /> Renderizar vídeo final</span>)}
        </PrimaryButton>
        </div>
      </div>

      {/* Celular: barra de ferramentas embaixo (principal ou da legenda), como no CapCut */}
      {isMobile && (
        <div className="rf-m-tools">
          {mTool === 'legenda' && (
            <button onClick={() => setMTool('main')} aria-label="Voltar às ferramentas" style={{ flex: '0 0 auto', width: 44, height: 56, alignSelf: 'center', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.08)', color: C.text, display: 'grid', placeItems: 'center', cursor: 'pointer', marginRight: 4 }}>
              <Icon name="chevron" size={18} strokeWidth={2.4} style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}
          {(mTool === 'legenda' ? [
            { k: 'split', icon: 'scissors', label: 'Dividir', act: splitAtPlayhead, off: !canSplit },
            { k: 'style', icon: 'type', label: 'Estilo', act: () => openSheet('capStyle') },
            { k: 'list', icon: 'edit', label: 'Editar legendas', act: () => openSheet('capList') },
            { k: 'auto', icon: 'sparkles', label: 'Modelos', act: () => openSheet('capAuto') },
            { k: 'em', icon: 'star', label: 'Destacar', act: () => openSheet('capEm') },
            { k: 'merge', icon: 'merge', label: 'Juntar', act: () => mergeNext(sel), off: sel >= segments.length - 1 },
            { k: 'del', icon: selSeg && segRemoved(selSeg) ? 'undo' : 'trash', label: selSeg && segRemoved(selSeg) ? 'Restaurar' : 'Excluir', act: () => toggleSeg(sel), off: !selSeg },
            { k: 'pauses', icon: 'scissors', label: pausesCut.length === pauses.length && pauses.length ? 'Manter pausas' : 'Remover pausas', act: () => (pausesCut.length === pauses.length ? keepAllPauses() : cutAllPauses()), off: !pauses.length },
          ] : [
            { k: 'cap', icon: 'captions', label: 'Legendas', act: () => setMTool('legenda') },
            { k: 'split', icon: 'scissors', label: 'Dividir', act: splitAtPlayhead, off: !canSplit },
            { k: 'speed', icon: 'clock', label: speed !== 1 ? `Velocidade ${fmtSpeed(speed)}` : 'Velocidade', act: () => openSheet('speed') },
            ...TABS.filter((t) => t.id !== 'legenda').map((t) => ({ k: t.id, icon: t.icon, label: t.id === 'enquadramento' ? 'Formato' : t.id === 'midias' ? 'Mídias' : t.label, act: () => openSheet('tab', t.id) })),
            { k: 'pauses', icon: 'scissors', label: pausesCut.length === pauses.length && pauses.length ? 'Manter pausas' : 'Remover pausas', act: () => (pausesCut.length === pauses.length ? keepAllPauses() : cutAllPauses()), off: !pauses.length },
          ]).map((t) => (
            <button key={t.k} onClick={t.act} disabled={t.off} className="rf-m-tool" style={{ opacity: t.off ? 0.38 : 1 }}>
              <Icon name={t.icon} size={23} strokeWidth={1.7} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      <style>{`
        /* ── Celular: editor em tela cheia (estilo CapCut) ── */
        .rf-tl-card.rf-m{ position: fixed !important; inset: 0; z-index: 1000; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; box-shadow: none !important; margin: 0 !important; padding: 0 0 calc(80px + env(safe-area-inset-bottom)) !important; border: none !important; border-radius: 0 !important; display: flex; flex-direction: column; background: #0d0d12 !important; overflow: hidden; }
        .rf-m{ --rf-sheet-h: 56dvh; }
        .rf-m > .rf-tl-head{ display: none !important; }
        /* painel aberto: o vídeo encolhe e fica inteiro acima dele (timeline e ferramentas somem) */
        .rf-tl-card.rf-m.rf-m-sheet{ padding-bottom: var(--rf-sheet-h) !important; }
        .rf-m-sheet .rf-tl-bottom, .rf-m-sheet .rf-m-tools{ display: none !important; }
        .rf-m-sheet .rf-tl-preview{ justify-content: flex-start; }
        .rf-m-top{ display: flex; align-items: center; gap: 8px; padding: calc(8px + env(safe-area-inset-top)) 12px 6px; flex: 0 0 auto; }
        .rf-m .rf-tl-grid{ display: flex !important; flex-direction: column; align-items: stretch !important; gap: 0 !important; flex: 1 1 auto; min-height: 0; }
        .rf-m .rf-tl-nav{ display: none !important; }
        .rf-m .rf-tl-preview{ order: 1 !important; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 12px; }
        .rf-m .rf-tl-pv{ background: none !important; border: none !important; padding: 4px 0 !important; border-radius: 0 !important; }
        .rf-m .rf-tl-pvlabel{ display: none; }
        .rf-m-ctrl{ display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; padding: 2px 8px; }
        .rf-m .rf-tl-bottom{ order: 2 !important; padding: 0 0 6px; }
        .rf-m .rf-tl-bottom > :not(.rf-tl-track){ display: none !important; }
        .rf-m .rf-tl-track{ border: none !important; border-radius: 0 !important; background: transparent !important; box-shadow: none !important; }
        .rf-m .rf-tl-labels{ display: none !important; }
        .rf-m .rf-tl-track > div::-webkit-scrollbar{ display: none; }
        .rf-m .rf-tl-adjust{ position: fixed !important; left: 0; right: 0; bottom: 0; top: auto !important; z-index: 1010; height: var(--rf-sheet-h); max-height: var(--rf-sheet-h) !important; overflow-y: auto !important; overflow-x: hidden !important; padding: 0 14px calc(18px + env(safe-area-inset-bottom)) !important; background: #1c1c22; border-radius: 20px 20px 0 0; box-shadow: 0 -24px 60px rgba(0,0,0,0.65); animation: rf-sheet-in .22s ease-out; }
        .rf-m .rf-tl-adjust > div:not(.rf-m-sheethead){ background: transparent !important; border: none !important; padding-left: 0 !important; padding-right: 0 !important; }
        .rf-m-sheethead{ position: sticky; top: 0; z-index: 2; display: flex; align-items: center; padding: 14px 0 12px; margin-bottom: 6px; background: #1c1c22; border-bottom: 1px solid rgba(255,255,255,0.07); }
        @keyframes rf-sheet-in{ from{ transform: translateY(40px); opacity: 0; } to{ transform: none; opacity: 1; } }
        .rf-m-tools{ position: fixed; left: 0; right: 0; bottom: 0; z-index: 1001; display: flex; align-items: stretch; gap: 2px; overflow-x: auto; scrollbar-width: none; padding: 8px 8px calc(8px + env(safe-area-inset-bottom)); background: #15151b; border-top: 1px solid rgba(255,255,255,0.06); }
        .rf-m-tools::-webkit-scrollbar{ display: none; }
        .rf-m-tool{ flex: 0 0 auto; min-width: 66px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 6px 6px; border: none; background: none; color: #f2f2f5; font-family: inherit; font-size: 11.5px; line-height: 1.15; text-align: center; cursor: pointer; border-radius: 10px; }
        .rf-m-tool > span{ max-width: 76px; }
        .rf-m-tool:active{ background: rgba(255,255,255,0.08); }
        /* Palco (player) cabe na tela junto com a timeline: a altura acompanha a janela. */
        .rf-tl-grid{ --rf-stage-h: clamp(200px, calc(100dvh - 560px), 620px); }
        .rf-tl-grid.rf-stage-s{ --rf-stage-h: clamp(160px, calc(100dvh - 680px), 420px); }
        .rf-tl-grid.rf-stage-l{ --rf-stage-h: clamp(320px, calc(100dvh - 240px), 900px); }
        .rf-tl-pv-fmt{ display: flex; flex-direction: column; align-items: center; min-width: 0; }
        .rf-tl-nav{ grid-column: 1; grid-row: 1 / span 2; position: sticky; top: 12px; }
        .rf-tl-preview{ grid-column: 2; grid-row: 1; min-width: 0; }
        .rf-tl-adjust{ grid-column: 3; grid-row: 1 / span 2; }
        .rf-tl-bottom{ grid-column: 2; grid-row: 2; }
        @media (max-width: 1440px){
          /* notebook: menu vira uma barra só de ícones, sobra largura para vídeo e timeline */
          .rf-tl-grid{ grid-template-columns: 58px minmax(0, 1fr) minmax(290px, 330px) !important; gap: 12px !important; }
          .rf-tl-navlbl{ display: none; }
          .rf-tl-nav{ padding: 5px !important; }
          .rf-tl-nav > button{ justify-content: center; padding: 11px 0 !important; }
        }
        @media (max-width: 1100px){
          /* tela estreita: mostra só a prévia do formato final (o player continua tocando o som) */
          .rf-tl-pv{ grid-template-columns: minmax(0, 1fr) !important; }
          .rf-tl-pv--fmt .rf-tl-main{ display: none; }
          .rf-tl-pv--fmt{ --fmt-share: 1 !important; }
        }
        @media (max-width: 860px){
          .rf-tl-grid{ grid-template-columns: minmax(0, 1fr) !important; }
          .rf-tl-nav, .rf-tl-preview, .rf-tl-adjust, .rf-tl-bottom{ grid-column: 1 !important; grid-row: auto !important; }
          .rf-tl-nav{ display: flex !important; overflow-x: auto; flex-wrap: nowrap !important; padding: 4px !important; scrollbar-width: none; position: static; }
          .rf-tl-nav > div{ display: none; }
          .rf-tl-navlbl{ display: inline; }
          .rf-tl-nav > button{ padding: 8px 10px !important; justify-content: flex-start; }
          .rf-tl-adjust{ position: static !important; max-height: none !important; overflow: visible !important; }
          .rf-tl-pv{ grid-template-columns: minmax(0, 1fr) !important; padding: 8px !important; }
          .rf-tl-nav{ order: 1; } .rf-tl-preview{ order: 2; } .rf-tl-bottom{ order: 3; } .rf-tl-adjust{ order: 4; }
          .rf-tl-grid{ --rf-stage-h: clamp(200px, calc(100dvh - 640px), 520px); }
          .rf-tl-grid.rf-stage-s{ --rf-stage-h: clamp(170px, calc(100dvh - 680px), 400px); }
          .rf-tl-grid.rf-stage-l{ --rf-stage-h: min(74dvh, 720px); }
        }
        @media (hover: none){ .rf-tl-hide-touch{ display: none; } }
        @media (max-width: 480px){
          .rf-tl-grid{ --rf-stage-h: clamp(200px, calc(100dvh - 600px), 520px); }
          .rf-tl-bar{ gap: 8px !important; padding: 6px 8px !important; }
          .rf-tl-hide-sm{ display: none; }
          .rf-tl-card{ padding: 12px !important; }
          .rf-tl-head{ flex-wrap: nowrap !important; margin-bottom: 10px !important; }
          .rf-tl-head > span{ display: none !important; }
        }
      `}</style>
    </div>
  );
  // No celular o editor ocupa a tela toda (fora do layout da página, que tem barra e menu).
  return isMobile && typeof document !== 'undefined' ? createPortal(editorCard, document.body) : editorCard;
}

// Altura de cada faixa. A coluna de nomes e as faixas leem daqui, para não
// desalinharem quando uma mudar.
const LANE = { ruler: 22, capitulos: 28, legenda: 64, video: 44, zoom: 24, broll: 26, audio: 34, pausas: 24, midias: 30 };

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
// Velocidades oferecidas (o servidor aceita de 0,5× a 2×)
// Qualidade de exportação (lado menor do quadro): Premium.
const QUALITY_OPTS = [
  { id: 'original', label: 'Original', sub: 'padrão', hint: 'Resolução do formato escolhido' },
  { id: '720', label: '720p', sub: 'HD', hint: 'Lado menor com 720 pixels' },
  { id: '1080', label: '1080p', sub: 'Full HD', hint: 'Lado menor com 1080 pixels' },
  { id: '2160', label: '4K', sub: 'Ultra HD', hint: 'Lado menor com 2160 pixels' },
];

const SPEEDS = [0.75, 1, 1.1, 1.2, 1.25, 1.5, 2];
const fmtSpeed = (k) => `${String(k).replace('.', ',')}×`;
function SpeedPicker({ value, onChange, big = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SPEEDS.length}, minmax(0, 1fr))`, gap: 5 }}>
      {SPEEDS.map((k) => {
        const on = value === k;
        return (
          <button key={k} onClick={() => onChange(k)} aria-pressed={on}
            style={{ minHeight: big ? 46 : 32, borderRadius: big ? 12 : 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: big ? 14 : 12, fontWeight: 700, padding: 0,
              border: on ? `1.5px solid ${C.orange}` : `1px solid ${C.border}`, background: on ? 'rgba(255,107,53,0.16)' : 'rgba(255,255,255,0.04)', color: on ? C.orangeSoft : C.text }}>
            {fmtSpeed(k)}
          </button>
        );
      })}
    </div>
  );
}

// Celular (estilo CapCut)
const mIconBtn = { width: 40, height: 40, borderRadius: 12, border: 'none', background: 'none', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 };
const mRow = { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.06)', fontSize: 15.5, fontWeight: 600, color: '#fff' };
const SHEET_TITLE = { speed: 'Velocidade', capList: 'Editar legendas', capStyle: 'Estilo da legenda', capEm: 'Destacar palavras', capAuto: 'Legendas automáticas' };

const TABS = [
  { id: 'enquadramento', label: 'Enquadramento', icon: 'crop' },
  { id: 'broll', label: 'B-roll', icon: 'image' },
  { id: 'audio', label: 'Áudio', icon: 'mic' },
  { id: 'legenda', label: 'Legenda', icon: 'captions' },
  { id: 'midias', label: 'Minhas mídias', icon: 'film' },
  { id: 'efeitos', label: 'Efeitos', icon: 'wand' },
  { id: 'cor', label: 'Cor', icon: 'palette' },
];

// Formatos do vídeo final (ids iguais aos do servidor) e o desenho do ícone.
const FORMATS = [
  { id: 'original', label: 'Original', w: 22, h: 16, hint: 'Mantém o formato em que foi gravado' },
  { id: '9:16', label: '9:16', w: 13, h: 22, hint: 'Vertical — Reels, Shorts, TikTok' },
  { id: '1:1', label: '1:1', w: 18, h: 18, hint: 'Quadrado — feed' },
  { id: '16:9', label: '16:9', w: 24, h: 14, hint: 'Horizontal — YouTube' },
];
const REFRAME_MODES = [
  { id: 'auto', label: 'Automático · segue o rosto', hint: 'A IA acompanha você no quadro ao longo do vídeo.' },
  { id: 'manual', label: 'Posição que eu escolher', hint: 'O quadro fica fixo no ponto que você arrastar na prévia.' },
  { id: 'fit', label: 'Vídeo inteiro · fundo desfocado', hint: 'Não corta nada: o vídeo aparece inteiro com o fundo desfocado.' },
];

// Layouts do B-roll: ids iguais aos do servidor (top = B-roll em cima → você embaixo).
const BROLL_LAYOUTS = [
  { id: 'fullscreen', label: 'Tela cheia', hint: 'O B-roll cobre o vídeo inteiro no momento dele' },
  { id: 'top', label: 'Dividido · você embaixo', hint: 'B-roll na metade de cima, você na de baixo' },
  { id: 'bottom', label: 'Dividido · você em cima', hint: 'Você na metade de cima, B-roll na de baixo' },
];

const BROLL_SOURCES = [
  { id: 'mix', label: 'Tudo ✨', hint: 'Mistura vídeos e fotos de todos os bancos gratuitos — escolha entre todos' },
  { id: 'pexels', label: '▶ Pexels', hint: 'Vídeos e fotos livres de direitos' },
  { id: 'pixabay', label: '▶ Pixabay', hint: 'Vídeos e fotos livres de direitos' },
  { id: 'wikimedia', label: 'Wikimedia', hint: 'Acervo livre (fotos e vídeos com licença livre)' },
  { id: 'openverse', label: 'Creative Commons', hint: 'Openverse: imagens de uso livre' },
  { id: 'nasa', label: 'NASA', hint: 'Ciência, tecnologia e espaço — domínio público' },
  { id: 'google', label: 'Google Imagens', hint: 'Imagens contextuais — atenção a direitos autorais' },
];
const SOURCE_LABEL = { google: 'Google', openverse: 'CC', pexels: 'Pexels', pixabay: 'Pixabay', wikimedia: 'Wikimedia', nasa: 'NASA' };

const INTENSITIES = [{ id: 'suave', label: 'Suave' }, { id: 'medio', label: 'Médio' }, { id: 'forte', label: 'Forte' }];
const COLOR_SLIDERS = [
  { id: 'brightness', label: 'Brilho' },
  { id: 'contrast', label: 'Contraste' },
  { id: 'saturation', label: 'Saturação' },
  { id: 'temperature', label: 'Temperatura', hint: 'frio ← → quente' },
];

/** Prévia aproximada do ajuste manual (mesmas proporções do filtro do servidor). */
/** Mesma conta do faceCropGeometry do servidor (pipeline/broll.js), em px da prévia. */
function coverCrop(inW, inH, regionW, regionH, focus = {}, zoom = 1) {
  const base = Math.max(regionW / inW, regionH / inH);
  const k = base * Math.min(2.5, Math.max(1, zoom));
  const scaledW = Math.max(regionW, inW * k);
  const scaledH = Math.max(regionH, inH * k);
  const fx = Math.min(1, Math.max(0, Number.isFinite(focus.x) ? focus.x : 0.5));
  const fy = Math.min(1, Math.max(0, Number.isFinite(focus.y) ? focus.y : 0.4));
  const cropX = Math.min(Math.max(fx * scaledW - regionW / 2, 0), scaledW - regionW);
  const cropY = Math.min(Math.max(fy * scaledH - regionH / 2, 0), scaledH - regionH);
  return { scaledW, scaledH, cropX, cropY };
}

const colorPreviewCss = colorAdjustCss;
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
