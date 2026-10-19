import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, GRAD, glass, fmtDuration } from '../theme.js';
import { PrimaryButton, GhostButton } from './ui.jsx';
import Icon from './Icon.jsx';
import { sourceUrl, coverUrl, colorFrameUrl, filmstripUrl, getPeaks, uploadMedia, addProjectMedia, sfxUrl, mediaFileUrl, mediaPreviewUrl, mediaStatus, relinkMedia, sourceStatus, relinkSource, saveProject, loadProject, fetchBrollPlan, previewVoice, searchBroll, preciseCuts, getMediaLibrary, removeLibraryMedia, listTemplatesApi, saveTemplateApi, deleteTemplateApi, defaultTemplateApi } from '../api.js';
import CostLine, { openPlans } from './CostLine.jsx';
import { APP_VERSION } from '../version.js';
import { useAuth } from '../AuthContext.jsx';
import { CaptionOverlay } from './CaptionPreview.jsx';
import SnapGuides, { snapCenter } from './SnapGuides.jsx';
import { loadAutosave, saveAutosave, markAutosaveSubmitted, clearAutosave, packState, unpackState } from '../autosave.js';
import CaptionGallery, { FontPicker, ColorSwatches, TextStyleBar } from './CaptionGallery.jsx';
import VoicePanel, { voiceOf } from './VoicePanel.jsx';
import { MOTION_Z, motionAt, demoMotion, volumeAt, playWhoosh, playSfxUrl, LOOK_CSS, colorAdjustCss } from '../livePreview.js';
import { keyZoomMoments } from '../../../shared/keyMoments.js';
import { keyAt, cleanKeys, MOMENT_EFFECTS, defaultMomentEffect } from '../../../shared/transform.js';
import { VIDEO_FX, VIDEO_FX_CSS, TEXT_TEMPLATES, TEXT_ANIMS_IN, TEXT_ANIMS_OUT, TEXT_BOXES } from '../../../shared/textLayers.js';
import { mergeExtraCaptions } from '../../../shared/extraCaptions.js';
import EditorTour, { tourSeen } from './EditorTour.jsx';
import ProjectPanel, { MediaThumb } from './ProjectPanel.jsx';
import { CAPTION_FONT_LIST, CAPTION_COLOR_LIST, fontById } from '../../../shared/captionStyle.js';
import { layoutCaption } from '../../../shared/captionKeyword.js';

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
/** Faixa de fala mantida de um bloco (palavras não cortadas), ou null. */
function speechRange(s) {
  const kept = s.words.filter((w) => !w.removed);
  if (!kept.length) return null;
  return [Math.min(...kept.map((w) => w.start)), Math.max(...kept.map((w) => w.end))];
}
/**
 * Quando a legenda aparece e some. Como no CapCut, a legenda é um bloco de texto com
 * tempo próprio: puxar as pontas ou arrastar muda só capStart/capEnd — a fala (e os
 * cortes do vídeo) continuam no tempo das palavras. Sem ajuste, é o tempo da fala.
 */
function capRangeOf(s) {
  const kr = speechRange(s) || [s.start, s.end];
  return [s.capStart ?? kr[0], s.capEnd ?? kr[1]];
}
/** O bloco como aparece na legenda: palavras esticadas/deslocadas para o tempo de exibição. */
function dispSeg(s) {
  if (s.capStart == null && s.capEnd == null) return s;
  const kr = speechRange(s);
  if (!kr) return s;
  const [c0, c1] = capRangeOf(s);
  const k = (c1 - c0) / Math.max(0.01, kr[1] - kr[0]);
  const at = (t) => +(c0 + (t - kr[0]) * k).toFixed(3);
  return { ...s, start: c0, end: c1, words: s.words.map((w) => ({ ...w, start: at(w.start), end: at(w.end) })) };
}

/** Marca como cortadas as palavras cujo meio cai dentro de um corte (tempo original). */
function markCut(s, cuts) {
  let hit = false;
  const words = s.words.map((w) => {
    if (w.removed) return w;
    const mid = (w.start + w.end) / 2;
    if (!cuts.some((c) => mid >= c.start && mid <= c.end)) return w;
    hit = true;
    return { ...w, removed: true, inCut: true };
  });
  return hit ? { ...s, words } : s;
}

// Palavra como vai para o servidor: tempos, texto, corte, posição manual e ênfase.
// `dw` é a mesma palavra no tempo de exibição (cs/ce): só vai quando a legenda foi movida.
function wordOut(w, dw = null) {
  return {
    start: w.start, end: w.end, word: w.word, removed: !!w.removed,
    ...(dw && (dw.start !== w.start || dw.end !== w.end) ? { cs: dw.start, ce: dw.end } : {}),
    ...(w.px != null ? { px: w.px, py: w.py } : {}),
    ...(w.emColor ? { emColor: w.emColor } : {}),
    ...(w.emBig ? { emBig: true } : {}),
    ...(w.hidden ? { hidden: true } : {}),
  };
}

export default function TimelineEditor({ transcript, durationSec, sourceId, catalog, options, onGenerate, onBack, onSettings, busy, hidden = false, jobError = null, projectTitle = '', onRebuild = null }) {
  const { billing } = useAuth();
  const caps = catalog?.capabilities || {};
  const cap0 = options || {};
  // Ajustes de legenda editáveis aqui na timeline (posição, fonte, estilo, etc.).
  const [cap, setCap] = useState({
    captions: cap0.captions !== false,
    captionTemplate: cap0.captionTemplate || 'clean',
    captionFont: cap0.captionFont || 'auto',
    captionFontStyle: cap0.captionFontStyle || '',
    captionItalic: cap0.captionItalic === true,
    captionUnderline: cap0.captionUnderline === true,
    captionCase: cap0.captionCase || 'auto',
    captionColor: cap0.captionColor || 'white',
    captionBackground: cap0.captionBackground || 'auto',
    captionPosition: cap0.captionPosition || 'auto',
    captionMode: cap0.captionMode || 'auto',
    captionScale: cap0.captionScale || 1,
    captionLines: cap0.captionLines === 1 ? 1 : 2,
    captionMaxChars: Number(cap0.captionMaxChars) || 0,
    captionHighlight: cap0.captionHighlight === true,
    captionHighlightStyle: cap0.captionHighlightStyle || 'auto',
    captionAnimation: cap0.captionAnimation || 'auto',
    captionPreset: cap0.captionPreset,
    captionSafeZone: cap0.captionSafeZone !== false,
    captionSpacing: Number(cap0.captionSpacing) || 0,
    captionShadow: ['off', 'on'].includes(cap0.captionShadow) ? cap0.captionShadow : 'auto',
    captionShadowSize: Number(cap0.captionShadowSize) || 1,
    captionShadowOpacity: Number(cap0.captionShadowOpacity) || 0.6,
    captionBrollCenter: cap0.captionBrollCenter !== false,
    captionMinDuration: Number(cap0.captionMinDuration) || 0,
    captionGap: Number(cap0.captionGap) || 0,
    captionNoPunct: cap0.captionNoPunct === true,
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
    sfxBrollType: cap0.sfxBrollType || 'whoosh',
    sfxZoomType: cap0.sfxZoomType || 'whoosh',
    sfxCutType: cap0.sfxCutType || 'none',
    transition: cap0.transition || 'none',
    transitionAt: cap0.transitionAt || 'broll',
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
  // Efeitos sonoros colocados à mão no playhead (tempo original).
  const [sfxMoments, setSfxMoments] = useState([]);
  const [sfxPick, setSfxPick] = useState('shutter');
  // Zoom nos MOMENTOS-CHAVE (faixa ZOOM da timeline). null = ainda não calculado.
  const [zoomMoments, setZoomMoments] = useState(null);
  // Quadros-chave do Transformar (escala, posição, giro) — tempo original, como no CapCut.
  const [transformKeys, setTransformKeys] = useState([]);
  const [selKey, setSelKey] = useState(null); // t do quadro-chave selecionado na faixa
  // Textos livres (modelos de texto) e efeitos de vídeo nos momentos — tempo original.
  const [textLayers, setTextLayers] = useState([]);
  const [selText, setSelText] = useState(null);
  // Legendas adicionadas à mão (+ Legenda): não dependem da fala nem mexem nos cortes.
  const [extraCaps, setExtraCaps] = useState([]);
  const [selXcap, setSelXcap] = useState(null);
  const [hasClip, setHasClip] = useState(false); // algo copiado (mostra o botão Colar)
  const [tour, setTour] = useState(() => !tourSeen()); // guia rápido na primeira vez
  const [fxMoments, setFxMoments] = useState([]);
  const [selFx, setSelFx] = useState(null);
  const [fxPick, setFxPick] = useState('bw');
  // Transições manuais (como no CapCut): cada uma num ponto, com o seu tipo — tempo original.
  const [transitions, setTransitions] = useState([]);
  const [selTrans, setSelTrans] = useState(null);
  // Ímã (encaixe) da timeline, marcadores (tecla M) e a linha amarela de quando encaixa.
  const [snapOn, setSnapOn] = useState(() => { try { return localStorage.getItem('rf_snap') !== '0'; } catch { return true; } });
  const [markers, setMarkers] = useState([]);
  const [selMarker, setSelMarker] = useState(null);
  const [snapLine, setSnapLine] = useState(null);
  const snapRef = useRef({ on: true, pts: [], pps: 64 });
  const clipRef = useRef(null); // copiar/colar
  // Velocidade por trecho e congelar quadro (tempo original), como no CapCut.
  const [speedRanges, setSpeedRanges] = useState([]);
  const [freezes, setFreezes] = useState([]);
  const [selSpeed, setSelSpeed] = useState(null);
  const [selFreeze, setSelFreeze] = useState(null);
  const [freezeDur, setFreezeDur] = useState(2);
  const [transPick, setTransPick] = useState('flash');
  const [selZoom, setSelZoom] = useState(null);
  const [selBroll, setSelBroll] = useState(null); // momento de B-roll selecionado (índice)
  const [badThumbs, setBadThumbs] = useState(() => new Set()); // miniaturas que não carregaram
  const [colorLook, setColorLook] = useState(cap0.colorLook || 'auto');
  const [colorAdj, setColorAdj] = useState({ brightness: 0, contrast: 0, saturation: 0, temperature: 0, ...(cap0.colorAdjust || {}) });
  const colorCss = colorPreviewCss(colorAdj);
  const [showSource, setShowSource] = useState(false); // comparar com o vídeo original ao lado
  const transOverlayRef = useRef(null); // camada da transição (no monitor visível)
  const fxOverlayRef = useRef(null); // camada dos efeitos de vídeo
  // Prévia do look escolhido (aproximada) + ajuste manual por cima.
  const lookCss = LOOK_CSS[colorLook] || LOOK_CSS.auto;
  const videoFilter = [lookCss.filter, colorCss.filter].filter(Boolean).join(' ') || undefined;
  const [tab, setTab] = useState('enquadramento');
  // Celular: editor em tela cheia no estilo CapCut (timeline com cursor fixo no centro,
  // barra de ferramentas embaixo e painéis que sobem de baixo).
  const MQ_MOBILE = '(max-width: 860px)';
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(MQ_MOBILE).matches);
  // Altura das faixas (como no Premiere): arraste a borda de baixo do nome da faixa; os
  // botões − / + mudam todas. Fica salvo neste navegador.
  const [laneOv, setLaneOv] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('rf_track_heights') || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  });
  const saveLaneOv = (fn) => setLaneOv((cur) => {
    const next = typeof fn === 'function' ? fn(cur) : fn;
    try { localStorage.setItem('rf_track_heights', JSON.stringify(next)); } catch { /* sem armazenamento */ }
    return next;
  });
  const LANE = isMobile ? LANE_M : { ...LANE_D, ...laneOv }; // altura das faixas da timeline
  const laneResizeRef = useRef(null);
  function startLaneResize(key, e) {
    e.preventDefault();
    e.stopPropagation();
    laneResizeRef.current = { key, y0: e.clientY, h0: LANE[key] };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
  }
  useEffect(() => {
    function move(e) {
      const d = laneResizeRef.current;
      if (!d) return;
      const h = Math.round(Math.max(LANE_MIN[d.key] || 16, Math.min(160, d.h0 + e.clientY - d.y0)));
      saveLaneOv((cur) => (cur[d.key] === h ? cur : { ...cur, [d.key]: h }));
    }
    function up() {
      if (!laneResizeRef.current) return;
      laneResizeRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);
  /** − / + : todas as faixas menores ou maiores (passo de 20%). */
  function scaleLanes(k) {
    saveLaneOv((cur) => {
      const next = {};
      for (const key of LANE_RESIZABLE) next[key] = Math.round(Math.max(LANE_MIN[key] || 16, Math.min(160, (cur[key] ?? LANE_D[key]) * k)));
      return next;
    });
  }
  const resetLane = (key) => saveLaneOv((cur) => { const n = { ...cur }; delete n[key]; return n; });
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
  const [cutCoughs, setCutCoughs] = useState(options?.cutCoughs !== false);
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
  // Seleção na timeline: qual faixa está ativa (Dividir/Excluir agem nela) e o que está selecionado.
  const [selKind, setSelKind] = useState('caption'); // caption | video | media | zoom | broll | gain
  const [selSet, setSelSet] = useState(() => new Set([0])); // blocos de legenda (Ctrl/Shift+clique)
  const [selMedia, setSelMedia] = useState(null);
  const [selGain, setSelGain] = useState(null);
  const [vsplits, setVsplits] = useState([]); // divisões feitas na faixa de vídeo
  const [selVideo, setSelVideo] = useState(null); // {start,end} do pedaço de vídeo selecionado
  // Trecho selecionado em TODAS as faixas (arrastar na régua, ferramenta de seleção, I/O,
  // Ctrl+A): Delete corta vídeo, áudio e legenda juntos.
  const [range, setRange] = useState(null); // { a, b } em segundos
  const [rangeTool, setRangeTool] = useState(false);
  // Palavras selecionadas na aba Transcrição (índices na lista de palavras): Delete corta.
  const [txSel, setTxSel] = useState(null); // { a, b }
  const [editText, setEditText] = useState(null); // texto do bloco de legenda em edição
  const [pps, setPps] = useState(64); // zoom da timeline (pixels por segundo)
  const ppsRef = useRef(64); // o arrasto da legenda lê o zoom atual
  ppsRef.current = pps;
  // Zoom mínimo = o vídeo inteiro cabe na largura da timeline (como o "ajustar" do CapCut).
  const [trackW, setTrackW] = useState(0);
  const fitPpsRef = useRef(PPS_MIN);
  const zoomTl = (dir) => setPps((p) => Math.max(fitPpsRef.current, Math.min(PPS_MAX, +(p * (dir > 0 ? 1.4 : 1 / 1.4)).toFixed(2))));

  // Enquadramento no rosto (tela dividida): 'auto' detecta o rosto no servidor;
  // 'manual' usa o foco (arrastável) + zoom escolhidos aqui.
  // Zoom/enquadramento escolhidos antes (no Criar vídeo) continuam valendo aqui.
  const hasFocus0 = Number.isFinite(Number(options?.personFocusX));
  const [framingMode, setFramingMode] = useState(!hasFocus0 && Number(options?.personZoom) > 1 ? 'auto' : 'manual');
  const [focus, setFocus] = useState(hasFocus0 ? { x: Number(options.personFocusX), y: Number.isFinite(Number(options.personFocusY)) ? Number(options.personFocusY) : 0.4 } : { x: 0.5, y: 0.4 });
  const [zoom, setZoom] = useState(Math.min(2.5, Math.max(1, Number(options?.personZoom) || 1)));
  // Formato do vídeo final e como ele entra no formato (igual ao servidor):
  // auto = segue o rosto · manual = ponto escolhido · fit = inteiro com fundo desfocado.
  const [aspectSel, setAspectSel] = useState(['original', '9:16', '1:1', '16:9'].includes(options?.aspect) ? options.aspect : 'original');
  // Qualidade de exportação (720p/1080p/4K: recurso do Premium).
  const [quality, setQuality] = useState(['720', '1080', '2160'].includes(String(options?.quality)) ? String(options.quality) : 'original');
  const hdAllowed = !billing || billing.unlimited || billing.features?.includes('hd');
  const [reframeMode, setReframeMode] = useState(['auto', 'manual', 'fit', 'split'].includes(options?.reframeMode) ? options.reframeMode : 'auto');
  const [splitSwap, setSplitSwap] = useState(Boolean(options?.splitSwap)); // tela dividida: quem fica em cima
  // Linhas-guia de centralização enquanto arrasta: { where: 'focus'|'pan'|'broll', x, y }
  const [guides, setGuides] = useState(null);
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
  // Título fixo no vídeo (headline) e capa (quadro + título).
  const [headline, setHeadline] = useState(() => ({ on: Boolean(options?.headline?.text), text: options?.headline?.text || '', seconds: options?.headline?.seconds ?? 5, style: options?.headline?.style || 'box', color: options?.headline?.color || 'FF6B35', position: options?.headline?.position || 'top' }));
  const [cover, setCover] = useState(() => ({ on: false, t: null, text: '', position: 'center', intro: true }));
  const setHl = (patch) => setHeadline((h) => ({ ...h, ...patch }));
  const setCv = (patch) => setCover((c) => ({ ...c, ...patch }));
  // B-roll ligado neste vídeo? Desligar guarda as escolhas (dá para religar depois).
  const [brollOn, setBrollOn] = useState(Boolean(options?.broll));
  const [brollPasteHint, setBrollPasteHint] = useState(null); // índice do momento esperando a imagem do Google
  const [brollBusy, setBrollBusy] = useState(false);
  const [brollErr, setBrollErr] = useState('');
  // Envio do render: o editor continua montado até o servidor aceitar, então um erro
  // (ex.: 403 PLAN_REQUIRED) aparece aqui sem perder nada da timeline.
  const [sending, setSending] = useState(false);
  const [renderErr, setRenderErr] = useState(null); // { message, code, locked: [] }
  // Recursos desligados aqui (sobrepõem as opções do início, ex.: autoClean: false).
  const [renderOff, setRenderOff] = useState({});
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

  const dur = durationSec || segments.reduce((m, s) => Math.max(m, s.end || 0), 0) || 1;
  // Os blocos no tempo em que a legenda aparece (o que a faixa, a prévia e o vídeo mostram).
  // Palavras dentro de um corte da faixa de vídeo saem junto (vídeo, áudio e legenda):
  // a faixa e a prévia mostram a legenda cortada; o servidor faz o mesmo no remap.
  const capSegments = useMemo(() => segments.map((s) => dispSeg(cuts.length ? markCut(s, cuts) : s)), [segments, cuts]);
  // Ripple (como no Premiere): o que foi excluído (cortes e falas cortadas) some da
  // timeline e o resto encosta. Tudo continua guardado no tempo ORIGINAL do vídeo; só a
  // posição na tela passa por X(t) e o clique volta por srcOf().
  const [ripple, setRipple] = useState(true);
  const gaps = useMemo(() => {
    if (!ripple) return [];
    const r = cuts.map((c) => [Number(c.start), Number(c.end)]);
    const flat = [];
    for (const sg of segments) for (const w of sg.words) if (Number.isFinite(w.start) && Number.isFinite(w.end)) flat.push(w);
    flat.sort((a, b) => a.start - b.start);
    let run = null;
    for (const w of flat) {
      if (w.removed) { if (!run) run = [w.start, w.end]; else run[1] = Math.max(run[1], w.end); } else if (run) { r.push(run); run = null; }
    }
    if (run) r.push(run);
    r.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [a0, b0] of r) {
      const a = Math.max(0, a0);
      const b = Math.min(dur, b0);
      if (!(b - a >= 0.05)) continue;
      const last = out[out.length - 1];
      if (last && a <= last[1] + 0.01) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    return out;
  }, [ripple, cuts, segments, dur]);
  const progOf = (t) => {
    let p = t;
    for (const [a, b] of gaps) {
      if (t >= b) p -= b - a;
      else { if (t > a) p -= t - a; break; }
    }
    return p;
  };
  const srcOf = (p) => {
    let t = p;
    for (const [a, b] of gaps) { if (t >= a) t += b - a; else break; }
    return Math.min(dur, t);
  };
  const X = (t) => progOf(Number(t) || 0) * pps;
  const W = (a, b) => Math.max(0, X(b) - X(a));
  const progDur = progOf(dur);
  // pedaços que ficam (miniaturas e forma de onda são recortadas neles)
  const keptPieces = useMemo(() => {
    const out = [];
    let t = 0;
    for (const [a, b] of gaps) { if (a > t) out.push([t, a]); t = b; }
    if (dur > t) out.push([t, dur]);
    return out;
  }, [gaps, dur]);
  const width = Math.max(320, Math.round(progDur * pps));

  // ── Pausas de silêncio (gaps entre palavras mantidas). O usuário decide, na
  // timeline, quais cortar. Por padrão TODA pausa visível é cortada (o cliente
  // reclamou que sobrava silêncio); clicar numa pausa a preserva.
  const MIN_PAUSE = 0.22; // só mostra/oferece corte a partir daqui (mais sensível = corta mais silêncio e respiração)
  const [keptPauses, setKeptPauses] = useState(() => new Set());
  // tosses/sons soltos nas pausas que o usuário restaurou (saem por padrão)
  const [keptNoises, setKeptNoises] = useState([]);
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

  // Desfazer / refazer: TODA edição da timeline (texto, cortes, pausas, legendas, B-roll,
  // capa e título, cor, áudio, enquadramento, minhas mídias). Mudanças seguidas em menos
  // de 0,4 s (arrastar um controle, ajustes automáticos logo depois de uma edição) viram
  // um passo só; o que chega do servidor pela 1ª vez (vazio → carregado) não é um passo.
  // Faixas como no Premiere: o olho esconde (some da prévia e do vídeo final), o cadeado trava.
  const [laneHide, setLaneHide] = useState({});
  const [laneLock, setLaneLock] = useState({});
  const visTexts = laneHide.txt ? [] : textLayers;
  const visFx = laneHide.vfx ? [] : fxMoments;
  const visMedia = media.filter((m) => !laneHide[`m${m.layer || 0}`]);
  const lk = (id) => (laneLock[id] ? LANE_LOCKED : null);
  const togHide = (id) => setLaneHide((h) => ({ ...h, [id]: !h[id] }));
  const togLock = (id) => setLaneLock((h) => ({ ...h, [id]: !h[id] }));
  // Prévia: legendas da fala + as adicionadas à mão (onde há uma à mão, ela vale).
  const visXcaps = laneHide.xcap ? [] : extraCaps;
  const overlaySegs = useMemo(() => mergeExtraCaptions(capSegments, visXcaps), [capSegments, visXcaps]);
  const histState = {
    segments, cuts, keptPauses, keptNoises, gains, media, brollReview, brollOn, zoomMoments, headline, cover,
    colorLook, colorAdj, cap, fx, voice, audioVolume, audioMute, speed, cutBreaths, cutCoughs,
    aspectSel, quality, reframeMode, splitSwap, framingMode, focus, zoom, vsplits, sfxMoments, transformKeys, textLayers, fxMoments, transitions, laneHide, laneLock, markers, speedRanges, freezes, extraCaps,
  };
  const histSet = {
    segments: setSegments, cuts: setCuts, keptPauses: setKeptPauses, keptNoises: setKeptNoises, gains: setGains, media: setMedia,
    brollReview: setBrollReview, brollOn: setBrollOn, zoomMoments: setZoomMoments, headline: setHeadline,
    cover: setCover, colorLook: setColorLook, colorAdj: setColorAdj, cap: setCap, fx: setFx, voice: setVoice,
    audioVolume: setAudioVolume, audioMute: setAudioMute, speed: setSpeed, cutBreaths: setCutBreaths,
    cutCoughs: setCutCoughs, aspectSel: setAspectSel, quality: setQuality, reframeMode: setReframeMode,
    splitSwap: setSplitSwap, framingMode: setFramingMode, focus: setFocus, zoom: setZoom,
    vsplits: setVsplits, sfxMoments: setSfxMoments, transformKeys: setTransformKeys, textLayers: setTextLayers, extraCaps: setExtraCaps, fxMoments: setFxMoments, transitions: setTransitions, laneHide: setLaneHide, laneLock: setLaneLock, markers: setMarkers, speedRanges: setSpeedRanges, freezes: setFreezes,
  };
  const histRef = useRef({ past: [], future: [], prev: null, skip: false, at: 0 });
  const [, setHistTick] = useState(0);
  useEffect(() => {
    const h = histRef.current;
    const snap = histState;
    const prev = h.prev;
    h.prev = snap;
    if (!prev || h.skip) {
      h.skip = false;
      setHistTick((n) => n + 1);
      return;
    }
    const changed = Object.keys(snap).filter((k) => snap[k] !== prev[k]);
    if (!changed.length) return;
    // vazio → carregado (B-roll, zooms automáticos): não é edição do usuário
    if (changed.every((k) => prev[k] == null)) return;
    const now = Date.now();
    if (now - h.at > 400) {
      h.past.push(prev);
      if (h.past.length > 100) h.past.shift();
    }
    h.at = now;
    h.future = [];
    setHistTick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, Object.values(histState));
  function restore(snap) {
    histRef.current.skip = true;
    histRef.current.at = 0;
    for (const [k, set] of Object.entries(histSet)) if (snap[k] !== histState[k]) set(snap[k]);
  }
  function undo() {
    const h = histRef.current;
    if (!h.past.length) return;
    h.future.push(h.prev);
    restore(h.past.pop());
  }
  function redo() {
    const h = histRef.current;
    if (!h.future.length) return;
    h.past.push(h.prev);
    restore(h.future.pop());
  }
  const canUndo = histRef.current.past.length > 0;
  const canRedo = histRef.current.future.length > 0;

  // Salvamento automático: depois da 1ª edição, guarda tudo no navegador (1 s depois da
  // última mudança). Ao reabrir o projeto com edições não exportadas, oferece recuperar.
  const [recover, setRecover] = useState(() => {
    const saved = loadAutosave(sourceId);
    return saved && !saved.submitted && saved.state ? saved : null;
  });
  const [savedAt, setSavedAt] = useState(null);
  const editedRef = useRef(false);
  useEffect(() => {
    if (canUndo || canRedo) editedRef.current = true;
    if (!editedRef.current || !sourceId) return undefined;
    const id = setTimeout(() => {
      if (saveAutosave(sourceId, histState)) setSavedAt(Date.now());
    }, 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...Object.values(histState), canUndo, canRedo, sourceId]);
  function recoverEdits() {
    if (!recover?.state) return;
    // vira um passo do desfazer: dá para voltar ao que estava antes de recuperar
    const h = histRef.current;
    if (h.prev) h.past.push(h.prev);
    h.future = [];
    histRef.current.at = 0;
    for (const [k, set] of Object.entries(histSet)) if (k in recover.state) set(recover.state[k]);
    editedRef.current = true;
    setRecover(null);
  }
  function discardRecovery() {
    clearAutosave(sourceId);
    setRecover(null);
  }

  // ── Projeto salvo na conta (como os rascunhos do CapCut) ──
  // A cada 30 s (e ao sair) o projeto inteiro vai para o servidor: edições, transcrição,
  // mídias. Ao reabrir, volta sozinho — inclusive em outro dia ou depois de reiniciar o app.
  const [cloudSavedAt, setCloudSavedAt] = useState(null);
  const [cloudErr, setCloudErr] = useState('');
  const [restored, setRestored] = useState(false);
  const dirtyRef = useRef(true); // salva logo na abertura: todo projeto fica na lista
  const firstStateRef = useRef(true);
  useEffect(() => {
    if (firstStateRef.current) { firstStateRef.current = false; return; }
    dirtyRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, Object.values(histState));
  const saveNowRef = useRef(null);
  saveNowRef.current = async () => {
    if (!sourceId || !restored || !dirtyRef.current) return;
    dirtyRef.current = false;
    try {
      const r = await saveProject(sourceId, packState(histState), {
        title: projectTitle || 'Projeto sem nome',
        duration: dur,
        language: transcript?.language || null,
        provider: transcript?.provider || null,
        media: media.length,
      });
      setCloudSavedAt(r.savedAt);
      setCloudErr('');
    } catch (e) {
      dirtyRef.current = true;
      setCloudErr(e.message || 'sem conexão');
    }
  };
  useEffect(() => {
    if (!restored) return undefined;
    saveNowRef.current();
    const id = setInterval(() => saveNowRef.current(), 30000);
    const onLeave = () => saveNowRef.current();
    window.addEventListener('beforeunload', onLeave);
    return () => { clearInterval(id); window.removeEventListener('beforeunload', onLeave); saveNowRef.current(); };
  }, [restored, sourceId]);

  // Abre o projeto salvo na conta (se for mais novo que a cópia deste navegador).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const doc = await loadProject(sourceId);
        if (alive && !doc?.state && !loadAutosave(sourceId)?.state) {
          let carried = null;
          try { carried = JSON.parse(sessionStorage.getItem('rf_carry_style') || 'null'); sessionStorage.removeItem('rf_carry_style'); } catch { /* ignora */ }
          if (carried) applyTemplate({ name: 'do vídeo anterior', data: carried }); // vídeo principal remontado: mantém o estilo
          else {
            // vídeo novo: entra o modelo marcado como padrão ("usar sempre nos vídeos novos")
            const def = (await listTemplatesApi().catch(() => [])).find((t) => t.isDefault);
            if (alive && def) { setTemplates(null); applyTemplate(def); }
          }
        }
        if (!alive || !doc?.state) return;
        const local = loadAutosave(sourceId);
        if (local?.state && local.at > doc.savedAt + 1000) return; // este navegador tem algo mais novo: mantém o aviso
        const st = unpackState(doc.state);
        histRef.current.skip = true;
        for (const [k, set] of Object.entries(histSet)) if (k in st && st[k] !== undefined) set(st[k]);
        setRecover(null);
        setCloudSavedAt(doc.savedAt);
        dirtyRef.current = false;
        if (Array.isArray(st.media) && st.media.length) checkMedia(st.media);
      } catch {
        /* sem projeto salvo: começa do zero */
      } finally {
        if (alive) setRestored(true);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  // Arquivos do projeto: confere cada mídia no servidor; o que sumiu fica "offline".
  async function checkMedia(list) {
    for (const m of list) {
      if (!m?.mediaId) continue;
      const st = await mediaStatus(m.mediaId).catch(() => ({ status: 'error' }));
      if (st.status === 'ok') updateMedia(m.key, { offline: false, previewUrl: m.kind === 'audio' ? null : m.kind === 'video' ? mediaPreviewUrl(m.mediaId, Date.now()) : mediaFileUrl(m.mediaId, Date.now()) });
      else if (st.status !== 'error') updateMedia(m.key, { offline: true, previewUrl: null });
    }
  }
  const relinkRef = useRef(null);
  const [relinkKey, setRelinkKey] = useState(null);
  const [relinkErr, setRelinkErr] = useState('');
  function askRelink(key) { setRelinkKey(key); setRelinkErr(''); relinkRef.current?.click(); }
  async function onRelinkFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const m = media.find((x) => x.key === relinkKey);
    if (!file || !m) return;
    try {
      let id = m.mediaId;
      try {
        await relinkMedia(id, file);
      } catch (err) {
        if (!/não encontrada/.test(err.message)) throw err;
        id = (await addProjectMedia(file)).id; // o registro também sumiu: entra como mídia nova
      }
      updateMedia(m.key, { mediaId: id, offline: false, filename: file.name, previewUrl: m.kind === 'audio' ? null : m.kind === 'video' ? mediaPreviewUrl(id, Date.now()) : mediaFileUrl(id, Date.now()) });
    } catch (err) {
      setRelinkErr(err.message);
    }
  }

  // Vídeo de origem do projeto: se o arquivo foi apagado/movido, pede para localizar.
  const [srcVer, setSrcVer] = useState(0);
  const srcUrl = `${sourceUrl(sourceId)}${srcVer ? `?v=${srcVer}` : ''}`;
  const [srcOffline, setSrcOffline] = useState(false);
  const srcRelinkRef = useRef(null);
  useEffect(() => {
    let alive = true;
    sourceStatus(sourceId).then((s) => { if (alive) setSrcOffline(s.status !== 'ok'); }).catch(() => {});
    return () => { alive = false; };
  }, [sourceId]);
  async function onRelinkSource(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await relinkSource(sourceId, file);
      setSrcOffline(false);
      setSrcVer(Date.now());
    } catch (err) {
      setRelinkErr(err.message);
    }
  }

  const isPauseCut = (p) => !keptPauses.has(pauseKey(p));
  // Pausa com som que não é palavra (tosse, pigarro): o clique alterna
  // cortar só o silêncio → cortar TUDO (o som junto, como um corte à mão) → manter.
  const pauseForcedCut = (p) => cuts.find((c) => c.pause && Math.abs(c.start - p.start) < 0.02 && Math.abs(c.end - p.end) < 0.02);
  function pauseHasSound(p) {
    if (!preciseNow) return false;
    const silent = preciseNow.pauses.reduce((a, q) => a + Math.max(0, Math.min(p.end, q.end) - Math.max(p.start, q.start)), 0);
    return p.dur - silent > 0.15;
  }
  function setPauseKept(p, keep) {
    setKeptPauses((prev) => {
      const n = new Set(prev);
      const k = pauseKey(p);
      if (keep) n.add(k); else n.delete(k);
      return n;
    });
  }
  function togglePause(p) {
    const forced = pauseForcedCut(p);
    if (forced) {
      setCuts((l) => l.filter((x) => x.key !== forced.key));
      setPauseKept(p, true);
      return;
    }
    if (isPauseCut(p) && pauseHasSound(p)) {
      setCuts((l) => [...l, { key: `c${Date.now()}`, start: +p.start.toFixed(2), end: +p.end.toFixed(2), pause: true }]);
      return;
    }
    setPauseKept(p, isPauseCut(p));
  }
  // Tosse/som solto na pausa: sai por padrão; o clique restaura (ou volta a cortar).
  function toggleNoise(n) {
    setKeptNoises((l) => {
      const hit = l.find((k) => Math.min(k.end, n.end) - Math.max(k.start, n.start) >= 0.5 * (n.end - n.start));
      return hit ? l.filter((k) => k !== hit) : [...l, { start: n.start, end: n.end }];
    });
  }
  function cutAllPauses() { setKeptPauses(new Set()); }
  function keepAllPauses() { setKeptPauses(new Set(pauses.map(pauseKey))); }
  const pausesCut = pauses.filter(isPauseCut);

  // Cortes PRECISOS para a prévia (a mesma conta do vídeo final, feita no servidor sobre o
  // áudio): a transcrição erra o tempo das palavras em décimos de segundo, e pular a pausa
  // ou a palavra removida pelos tempos dela comia pedaço de palavra na prévia. Recalcula
  // (com espera curta) quando os cortes mudam; enquanto isso, usa os tempos da transcrição.
  const cutKey = useMemo(() => JSON.stringify([
    pausesCut.map((p) => [+p.start.toFixed(2), +p.end.toFixed(2)]),
    segments.flatMap((sg) => (sg.words || []).filter((w) => w.removed).map((w) => +Number(w.start).toFixed(2))),
    cutBreaths,
    cutCoughs,
    keptNoises.map((n) => +n.start.toFixed(2)),
  ]), [pausesCut, segments, cutBreaths, cutCoughs, keptNoises]);
  const [precise, setPrecise] = useState(null); // { key, pauses, removed, noises }
  // tosses ainda sendo procuradas no servidor (1ª vez do vídeo): pergunta de novo em seguida
  const [preciseTick, setPreciseTick] = useState(0);
  useEffect(() => {
    if (!sourceId) return undefined;
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const words = segments.flatMap((sg) => (sg.words || []).map((w) => ({ start: w.start, end: w.end, word: w.word, removed: !!w.removed })));
        // mesma folga interna que vai para o render (ver generate)
        const cand = pausesCut.map((p) => ({ start: p.start + Math.min(0.03, p.dur / 4), end: p.end - Math.min(0.03, p.dur / 4) })).filter((c) => c.end - c.start > 0.02);
        const r = await preciseCuts(sourceId, { transcript: { segments: [{ start: 0, end: dur, words }] }, pauses: cand, breaths: cutBreaths, coughs: cutCoughs, keepNoises: keptNoises, strength: options?.cutStrength }, ctl.signal);
        setPrecise({ key: cutKey, pauses: r.pauses || [], removed: r.removed || [], noises: r.noises || [] });
        if (r.coughsPending) setTimeout(() => setPreciseTick((t) => t + 1), 3000);
      } catch {
        /* sem os cortes precisos: a prévia usa os tempos da transcrição */
      }
    }, 500);
    return () => { clearTimeout(id); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutKey, sourceId, preciseTick]);
  const preciseNow = precise && precise.key === cutKey ? precise : null;
  const noisesCut = (preciseNow?.noises || []).filter((n) => !n.kept);
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
    let frzTimer = null;
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
        // Quadros-chave (Transformar) + zoom do momento numa transformação só.
        const K = keyAt(L.keys, t);
        const tparts = [];
        if (Math.abs(K.x) > 1e-4 || Math.abs(K.y) > 1e-4) tparts.push(`translate(${(K.x * 100).toFixed(2)}%, ${(K.y * 100).toFixed(2)}%)`);
        if (Math.abs(K.rot) > 1e-3) tparts.push(`rotate(${K.rot.toFixed(2)}deg)`);
        const sc = K.scale * m.scale;
        if (Math.abs(sc - 1) > 0.0005) tparts.push(`scale(${sc.toFixed(4)})`);
        if (L.fxTransform) tparts.push(L.fxTransform);
        const tf = tparts.join(' ');
        if (v.style.transform !== tf) v.style.transform = tf;
        v.style.transformOrigin = `${m.ox}% ${m.oy}%`;
        v.style.transition = !L.keys?.length && L.fx.videoMotion === 'dynamic' ? 'transform .12s ease-out' : 'none';
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
        // Velocidade do trecho e congelar quadro (como fica no vídeo final).
        if (!v.paused && L.speedRanges) {
          const sr = L.speedRanges.find((r) => t >= r.start && t < r.end);
          const want = (L.gSpeed || 1) * (sr ? sr.speed : 1);
          if (Math.abs(v.playbackRate - want) > 0.001) v.playbackRate = want;
          if (lastT != null && t > lastT && t - lastT < 0.6 && !frzTimer) {
            const fz = L.freezes.find((f) => f.t > lastT && f.t <= t);
            if (fz) { v.pause(); frzTimer = setTimeout(() => { frzTimer = null; v.play().catch(() => {}); }, fz.dur * 1000); }
          }
        }
        // Sons nos mesmos pontos do render: os automáticos (se ligados) e os colocados à mão,
        // cada um com o som REAL da biblioteca (o mesmo arquivo do render).
        if (!v.paused && lastT != null && t > lastT && t - lastT < 0.6) {
          for (const e of L.sfxEvents) if (e.at > lastT && e.at <= t) playSfxUrl(sfxUrl(e.type), L.fx.sfxIntensity);
        }
        // Transição no ponto (flash, escurecer, brilho, desfoque) — igual ao render.
        const tro = transOverlayRef.current;
        if (tro) {
          let best = null;
          for (const tr of L.trans) {
            const h = TRANS_HALF[tr.type] || 0.2;
            const e = 1 - Math.abs(t - tr.t) / h;
            if (e > 0 && (!best || e > best.e)) best = { e, type: tr.type };
          }
          const E = best ? best.e : 0;
          tro.style.opacity = E > 0 ? String(best.type === 'flash' ? 0.9 * E : best.type === 'dip' ? 0.95 * E : best.type === 'glow' ? 0.4 * E : 1) : '0';
          tro.style.background = best?.type === 'dip' ? '#000' : best && best.type !== 'blur' ? '#fff' : 'transparent';
          tro.style.mixBlendMode = best?.type === 'glow' ? 'screen' : 'normal';
          tro.style.backdropFilter = best?.type === 'blur' ? `blur(${(10 * E).toFixed(1)}px)` : 'none';
        }
        // Efeitos de vídeo do momento: camadas (vinheta, moldura, grão, flash) por cima.
        const fxo = fxOverlayRef.current;
        if (fxo) {
          const fm = L.fxMoments.find((m) => t >= m.start && t < m.end);
          const ef = fm?.effect || '';
          if (fxo.dataset.fx !== ef) {
            fxo.dataset.fx = ef;
            fxo.style.background = ef === 'vignette' || ef === 'nostalgic' ? 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.75) 100%)'
              : ef === 'film' ? 'linear-gradient(#000 0 11%, transparent 11% 89%, #000 89%)'
              : ef === 'grain' || ef === 'vhs' || ef === 'retro' || ef === 'glitch' ? `url("${GRAIN_SVG}")` : 'transparent';
          }
          fxo.style.opacity = ef === 'strobe' ? (Math.sin(2 * Math.PI * t * 4) > 0.55 ? '1' : '0') : '1';
          if (ef === 'strobe') fxo.style.background = 'rgba(255,255,255,0.45)';
          L.fxTransform = ef === 'mirror' ? 'scaleX(-1)' : ef === 'shake' ? `rotate(${(2 * Math.sin(57 * t)).toFixed(2)}deg)` : '';
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
      const m = capMoveRef.current;
      if (m) {
        const dx = e.clientX - m.x0;
        if (!m.moved && Math.abs(dx) < 4) return; // clique, não arrasto
        if (!m.moved) { m.moved = true; document.body.style.userSelect = 'none'; }
        moveCaption(m.si, m.c0, m.c1, dx / ppsRef.current);
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      applyTrim(d.si, d.edge, timeAtClientX(e.clientX));
    }
    function up() {
      const m = capMoveRef.current;
      if (m) {
        capMoveRef.current = null;
        if (m.moved) { capClickBlockRef.current = true; document.body.style.userSelect = ''; setTimeout(() => { capClickBlockRef.current = false; }, 0); }
      }
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
      const timed = d.kind !== 'image'; // vídeo/música: aparar a esquerda avança no arquivo
      const srcLeft = timed && d.srcDuration ? Math.max(0.3, d.srcDuration - d.off0) : Infinity;
      if (d.mode === 'move') {
        let start = Math.max(0, Math.min(d.start0 + dt, dur - Math.min(d.dur0, dur)));
        const sn = snapSpan(snapRef.current, start, d.dur0, d.key);
        start = Math.max(0, Math.min(sn.start, dur - Math.min(d.dur0, dur)));
        setSnapLine(sn.line);
        // Arrastar para cima/baixo troca de camada (cima = por cima no vídeo).
        const layer = Math.max(0, Math.min(d.maxLayer + 1, d.layer0 + Math.round((d.y0 - e.clientY) / LANE.midias)));
        updateMedia(d.key, { start: +start.toFixed(2), layer });
      } else if (d.mode === 'right') {
        const sn = snapPoint(snapRef.current, d.start0 + d.dur0 + dt, d.key);
        setSnapLine(sn.line);
        const duration = Math.max(0.3, Math.min(sn.t - d.start0, srcLeft, dur - d.start0));
        updateMedia(d.key, { duration: +duration.toFixed(2) });
      } else { // left
        const minStart = timed ? d.start0 - d.off0 : 0; // não volta antes do início do arquivo
        const sn = snapPoint(snapRef.current, d.start0 + dt, d.key);
        setSnapLine(sn.line);
        const start = Math.max(0, minStart, Math.min(sn.t, d.start0 + d.dur0 - 0.3));
        const duration = d.start0 + d.dur0 - start;
        const patch = { start: +start.toFixed(2), duration: +duration.toFixed(2) };
        if (timed) patch.offset = +Math.max(0, d.off0 + (start - d.start0)).toFixed(2);
        updateMedia(d.key, patch);
      }
    }
    function up() {
      const d = mediaDragRef.current;
      if (d) {
        mediaDragRef.current = null;
        setSnapLine(null);
        document.body.style.userSelect = '';
        // Soltou numa camada ocupada no mesmo tempo: abre uma camada nova logo acima
        // (se subiu) ou abaixo (se desceu) da alvo. Depois renumera sem buracos.
        setMedia((list) => {
          const m = list.find((x) => x.key === d.key);
          const clash = m && list.some((x) => x.key !== m.key && (x.layer || 0) === (m.layer || 0) && x.start < m.start + m.duration && x.start + x.duration > m.start);
          const next = clash ? list.map((x) => (x.key === m.key ? { ...x, layer: (m.layer || 0) + ((m.layer || 0) >= d.layer0 ? 0.5 : -0.5) } : x)) : list;
          return normalizeLayers(next);
        });
      }
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
          const len = d.end0 - d.start0;
          const sn = snapSpan(snapRef.current, Math.max(0, Math.min(d.start0 + dt, dur - len)), len, d.key);
          d.line = sn.line;
          const start = Math.max(0, Math.min(sn.start, dur - len));
          return { ...r, start: +start.toFixed(2), end: +(start + len).toFixed(2) };
        }
        const sn = snapPoint(snapRef.current, (d.mode === 'right' ? d.end0 : d.start0) + dt, d.key);
        d.line = sn.line;
        if (d.mode === 'right') return { ...r, end: +Math.min(dur, Math.max(d.start0 + 0.4, sn.t)).toFixed(2) };
        return { ...r, start: +Math.max(0, Math.min(d.end0 - 0.4, sn.t)).toFixed(2) };
      }));
      setSnapLine(d.line ?? null);
    }
    function up() {
      if (rangeDragRef.current) { rangeDragRef.current = null; document.body.style.userSelect = ''; setSnapLine(null); }
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
      const t = Math.max(0, Math.min(dur, srcOf((e.clientX - d.left) / pps)));
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
      // Arrastar seleciona o trecho (todas as faixas; Delete exclui). Clique seco seleciona o
      // pedaço de vídeo (entre divisões).
      if (b - a > 0.15) { setRange({ a: +a.toFixed(2), b: +b.toFixed(2) }); setSelKind('range'); }
      else {
        setSelKind('video');
        setSelVideo(videoParts(d.splits, dur).find((p) => d.t0 >= p.start && d.t0 <= p.end) || null);
      }
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [pps, dur]);

  function startCutDraw(e) {
    if (e.button !== 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(dur, srcOf((e.clientX - box.left) / pps)));
    drawRef.current = { t0: t, cur: t, left: box.left, splits: vsplits };
    seek(t);
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
    setSelMedia(m.key);
    setSelKind('media');
    mediaDragRef.current = {
      key: m.key, mode, x0: e.clientX, y0: e.clientY, start0: m.start, dur0: m.duration, kind: m.kind,
      srcDuration: m.srcDuration, off0: Number(m.offset) || 0, layer0: m.layer || 0,
      maxLayer: media.reduce((mx, x) => Math.max(mx, x.layer || 0), 0),
    };
    document.body.style.userSelect = 'none';
  }

  function timeAtClientX(clientX) {
    const el = trackRef.current;
    const r = el.getBoundingClientRect();
    const padL = isMobile ? el.clientWidth / 2 : 0; // no celular a timeline começa no meio (cursor fixo)
    return Math.max(0, Math.min(dur, srcOf((clientX - r.left + el.scrollLeft - padL) / pps)));
  }

  const progScrollRef = useRef(-1);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const x = X(cur);
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
    seek(srcOf(el.scrollLeft / pps));
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
    setPps(Math.max(fitPpsRef.current, Math.min(PPS_MAX, +(p0.pps * (d / p0.d)).toFixed(2))));
  }
  function onTrackTouchEnd() { pinchRef.current = null; }

  // ── Momentos de zoom (punch-in): automáticos nos momentos-chave e editáveis.
  function autoZoomMoments() {
    return keyZoomMoments(segments, dur).map((m, i) => ({ key: `z${i}_${Date.now()}`, start: m.start, end: m.end, scale: null }));
  }
  useEffect(() => {
    if (fx.videoMotion !== 'none' && zoomMoments === null) setZoomMoments(autoZoomMoments());
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
  function onTrackClick(e) { if (rangeClickBlockRef.current) return; seek(timeAtClientX(e.clientX)); }

  // Seleção de trecho em todas as faixas: arrastar na régua (ou na timeline com a
  // ferramenta ligada); as pontas da faixa azul também arrastam.
  const selRangeDragRef = useRef(null);
  const rangeClickBlockRef = useRef(false);
  const timeAtRef = useRef(null);
  timeAtRef.current = timeAtClientX;
  // Seleção em retângulo (como no Premiere): arrastar no espaço livre das faixas desenha a
  // caixa azul; ao soltar, o trecho que ela cobre fica selecionado em todas as faixas.
  const contentRef = useRef(null);
  const [marq, setMarq] = useState(null); // { x0, y0, x1, y1 } em px dentro da timeline
  function startMarquee(e) {
    if (e.button !== 0 || isMobile || !contentRef.current) return;
    const r = contentRef.current.getBoundingClientRect();
    selRangeDragRef.current = { marq: true, rect: r, x0: e.clientX, y0: e.clientY, moved: false };
  }
  function startRangeSel(e, edge = null) {
    if (e.button !== 0 || isMobile) return;
    e.stopPropagation();
    e.preventDefault();
    selRangeDragRef.current = { edge, x0: e.clientX, t0: timeAtClientX(e.clientX), moved: false };
    document.body.style.userSelect = 'none';
  }
  useEffect(() => {
    function move(e) {
      const d = selRangeDragRef.current;
      if (!d) return;
      if (!d.moved && Math.abs(e.clientX - d.x0) < 4 && Math.abs(e.clientY - (d.y0 ?? e.clientY)) < 4) return;
      if (!d.moved) document.body.style.userSelect = 'none';
      d.moved = true;
      if (d.marq) {
        const r = d.rect;
        const box = { x0: d.x0 - r.left, y0: d.y0 - r.top, x1: Math.max(0, Math.min(r.width, e.clientX - r.left)), y1: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
        setMarq(box);
        const ta = timeAtRef.current(Math.min(d.x0, e.clientX));
        const tb = timeAtRef.current(Math.max(d.x0, e.clientX));
        if (tb - ta > 0.02) { setRange({ a: +ta.toFixed(2), b: +tb.toFixed(2) }); setSelKind('range'); }
        return;
      }
      const t = +timeAtRef.current(e.clientX).toFixed(2);
      if (d.edge) {
        setRange((r) => {
          if (!r) return r;
          const n = { ...r, [d.edge]: t };
          if (n.a <= n.b) return n;
          d.edge = d.edge === 'a' ? 'b' : 'a';
          return { a: n.b, b: n.a };
        });
      } else setRange({ a: +Math.min(d.t0, t).toFixed(2), b: +Math.max(d.t0, t).toFixed(2) });
      setSelKind('range');
    }
    function up() {
      const d = selRangeDragRef.current;
      if (!d) return;
      selRangeDragRef.current = null;
      document.body.style.userSelect = '';
      if (d.marq) setMarq(null);
      if (d.moved) { rangeClickBlockRef.current = true; setTimeout(() => { rangeClickBlockRef.current = false; }, 0); }
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

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
    const sx = snapCenter(Math.min(1, Math.max(0, cw ? (clientX - offX) / cw : 0.5)), cw);
    const sy = snapCenter(Math.min(1, Math.max(0, ch ? (clientY - offY) / ch : 0.5)), ch);
    setGuides({ where: 'focus', x: sx.on, y: sy.on });
    setFocus({ x: sx.v, y: sy.v });
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
        // centro do vídeo no centro do quadro: gruda e mostra a linha-guia
        const sx = snapCenter(clamp01(p.fx - dx), p.w * p.zoom);
        const sy = snapCenter(clamp01(p.fy - dy), p.h * p.zoom);
        setGuides({ where: 'pan', x: sx.on, y: sy.on });
        setFocus({ x: sx.v, y: sy.v });
      }
    }
    function up() {
      if (focusDragRef.current || panRef.current) setGuides(null);
      focusDragRef.current = false;
      panRef.current = null;
    }
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

  // Pontas do bloco de legenda (como no CapCut): mudam só quando o texto aparece/some.
  // Não passam das legendas vizinhas nem cortam a fala — para cortar a fala, "Cortar trecho".
  function applyTrim(si, edge, t) {
    setSegments((prev) => prev.map((s, i) => {
      if (i !== si) return s;
      const [c0, c1] = capRangeOf(s);
      const lo = si > 0 ? capRangeOf(prev[si - 1])[1] : 0;
      const hi = si < prev.length - 1 ? capRangeOf(prev[si + 1])[0] : dur;
      if (edge === 'left') return { ...s, capStart: +Math.max(lo, Math.min(t, c1 - 0.2)).toFixed(3), capEnd: c1 };
      return { ...s, capStart: c0, capEnd: +Math.min(hi, Math.max(t, c0 + 0.2)).toFixed(3) };
    }));
  }
  // Arrastar o bloco inteiro: adianta/atrasa a legenda sem mexer na fala.
  function moveCaption(si, c0, c1, shift) {
    setSegments((prev) => prev.map((s, i) => {
      if (i !== si) return s;
      const lo = si > 0 ? capRangeOf(prev[si - 1])[1] : 0;
      const hi = si < prev.length - 1 ? capRangeOf(prev[si + 1])[0] : dur;
      const len = c1 - c0;
      const start = Math.max(lo, Math.min(hi - len, c0 + shift));
      return { ...s, capStart: +start.toFixed(3), capEnd: +(start + len).toFixed(3) };
    }));
  }
  const capMoveRef = useRef(null); // { si, x0, c0, c1, moved }
  const capClickBlockRef = useRef(false);
  function startCapMove(si, e) {
    if (e.button !== 0 || isMobile) return;
    const [c0, c1] = capRangeOf(segments[si]);
    capMoveRef.current = { si, x0: e.clientX, c0, c1, moved: false };
  }

  function startDrag(si, edge, e) { e.stopPropagation(); e.preventDefault(); setSel(si); dragRef.current = { si, edge }; document.body.style.userSelect = 'none'; }

  // Um bloco de fala mostra vários cartões no vídeo. Clicar num cartão separa o bloco em
  // legendas independentes (uma por cartão) e seleciona só o cartão clicado.
  function cardSplits(si) {
    const d = capSegments[si];
    if (!d) return null;
    const ws = d.words.map((w, i) => ({ ...w, _i: i })).filter((w) => !w.removed);
    if (!ws.length) return null;
    const cards = layoutCaption(ws, { lines: cap.captionLines === 1 ? 1 : 2, maxChars: cap.captionMaxChars > 0 ? cap.captionMaxChars : 18, segEnd: d.end });
    return cards.length > 1 ? cards : null;
  }
  function splitIntoCards(si) {
    const cards = cardSplits(si);
    if (!cards) return 0;
    const s = segments[si];
    const d = capSegments[si];
    const cutIdx = cards.slice(1).map((c) => c.words[0]._i);
    const bounds = [d.start, ...cards.slice(1).map((c) => +Math.max(d.start, c.words[0].start).toFixed(3)), d.end];
    const pieces = [];
    let from = 0;
    [...cutIdx, s.words.length].forEach((to, k) => {
      const words = s.words.slice(from, to);
      from = to;
      if (!words.length) return;
      pieces.push({ ...s, start: words[0].start, end: words[words.length - 1].end, words, capStart: bounds[k], capEnd: bounds[k + 1] });
    });
    if (pieces.length < 2) return 0;
    setSegments((prev) => [...prev.slice(0, si), ...pieces, ...prev.slice(si + 1)]);
    return pieces.length - 1;
  }
  function pickCard(si, ci, card, e) {
    e.stopPropagation();
    if (capClickBlockRef.current) return;
    const n = splitIntoCards(si);
    const shift = (i) => (i > si ? i + n : i);
    const idx = si + (n ? ci : 0);
    setSelKind('caption');
    setEditText(null);
    if (e.ctrlKey || e.metaKey) {
      setSelSet((prev) => {
        const next = new Set([...prev].map(shift));
        if (next.has(idx) && next.size > 1) next.delete(idx); else next.add(idx);
        return next;
      });
      setSel(idx);
    } else if (e.shiftKey) {
      const anchor = shift(sel);
      const [a, b] = [Math.min(anchor, idx), Math.max(anchor, idx)];
      setSelSet(new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i)));
      setSel(anchor);
    } else {
      setSelSet(new Set([idx]));
      setSel(idx);
      seek(card.start + 0.01);
    }
    if (isMobile) setMTool('legenda');
  }

  // Divide a legenda exatamente no playhead (como o Ctrl+B do CapCut): cada metade fica
  // com o seu tempo de exibição, de ponta a ponta até o ponto do corte.
  function splitAtPlayhead(at = cur) {
    const idx = capSegments.findIndex((d) => at > d.start + 0.05 && at < d.end - 0.05);
    if (idx < 0) return;
    const s = segments[idx];
    const d = capSegments[idx];
    let cutAt = d.words.findIndex((w) => (w.start + w.end) / 2 > at);
    const live = s.words.filter((w) => !w.removed).length;
    if (live < 2) return; // uma palavra só: não há o que separar
    if (cutAt <= 0) cutAt = 1; // o playhead caiu dentro da 1ª palavra: ela fica na 1ª parte
    if (cutAt >= s.words.length) cutAt = s.words.length - 1;
    const a = s.words.slice(0, cutAt);
    const b = s.words.slice(cutAt);
    const t = +at.toFixed(3);
    const segA = { ...s, end: a[a.length - 1].end, words: a, capStart: d.start, capEnd: t };
    const segB = { ...s, start: b[0].start, words: b, capStart: t, capEnd: d.end };
    setSegments((prev) => [...prev.slice(0, idx), segA, segB, ...prev.slice(idx + 1)]);
    setSel(idx);
    setSelSet(new Set([idx]));
  }
  function mergeNext(si) {
    setSegments((prev) => {
      if (si >= prev.length - 1) return prev;
      const a = prev[si]; const b = prev[si + 1];
      const moved = a.capStart != null || a.capEnd != null || b.capStart != null || b.capEnd != null;
      const merged = { ...a, end: b.end, words: [...a.words, ...b.words], ...(moved ? { capStart: capRangeOf(a)[0], capEnd: capRangeOf(b)[1] } : {}) };
      return [...prev.slice(0, si), merged, ...prev.slice(si + 2)];
    });
  }

  const activeIndex = useMemo(() => capSegments.findIndex((s) => cur >= s.start && cur < (s.end || s.start + 0.1)), [capSegments, cur]);
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
  const canSplit = capSegments.some((d, i) => cur > d.start + 0.05 && cur < d.end - 0.05 && segments[i].words.filter((w) => !w.removed).length > 1);

  // Caixa de seleção na faixa de legenda: arrastar no espaço vazio seleciona todas as
  // legendas que a caixa tocar (como no CapCut).
  const [capBand, setCapBand] = useState(null); // { a, b } em segundos
  const capBandRef = useRef(null);
  function startCapBand(e) {
    if (e.button !== 0 || e.target !== e.currentTarget) return; // só no espaço vazio
    const t = timeAtClientX(e.clientX);
    capBandRef.current = { a: t, b: t };
    setCapBand({ a: t, b: t });
    document.body.style.userSelect = 'none';
  }
  useEffect(() => {
    function move(e) {
      const b = capBandRef.current;
      if (!b) return;
      b.b = timeAtClientX(e.clientX);
      setCapBand({ a: b.a, b: b.b });
    }
    function up() {
      const b = capBandRef.current;
      if (!b) return;
      capBandRef.current = null;
      document.body.style.userSelect = '';
      setCapBand(null);
      const lo = Math.min(b.a, b.b);
      const hi = Math.max(b.a, b.b);
      if (hi - lo < 0.05) return; // clique simples: só move o playhead
      const hit = capSegsRef.current.map((d, i) => (d.end > lo && d.start < hi ? i : -1)).filter((i) => i >= 0);
      if (!hit.length) return;
      setSelKind('caption');
      setSelSet(new Set(hit));
      setSel(hit[0]);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);
  const capSegsRef = useRef([]);
  capSegsRef.current = capSegments;

  // ── Seleção, dividir e excluir em qualquer faixa ─────────────────────
  function selectCaption(si, e) {
    setSelKind('caption');
    setEditText(null);
    if (e?.shiftKey) {
      const [a, b] = [Math.min(sel, si), Math.max(sel, si)];
      setSelSet(new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i)));
      return; // mantém o bloco âncora como principal
    }
    if (e?.ctrlKey || e?.metaKey) {
      setSelSet((prev) => {
        const next = new Set(prev);
        if (next.has(si) && next.size > 1) next.delete(si); else next.add(si);
        return next;
      });
      setSel(si);
      return;
    }
    setSelSet(new Set([si]));
    setSel(si);
    seek(segments[si].start);
  }
  /** Blocos de legenda selecionados (sempre inclui o principal), em ordem. */
  const selCaptions = useMemo(() => [...new Set([...selSet, sel])].filter((i) => i < segments.length).sort((a, b) => a - b), [selSet, sel, segments.length]);
  const segHidden = (s) => s.words.filter((w) => !w.removed).every((w) => w.hidden);
  function setCaptionsHidden(hidden) {
    const set = new Set(selCaptions);
    setSegments((prev) => prev.map((s, i) => (set.has(i) ? { ...s, words: s.words.map((w) => ({ ...w, hidden })) } : s)));
  }
  function setCaptionsCut(removed) {
    const set = new Set(selCaptions);
    setSegments((prev) => prev.map((s, i) => (set.has(i) ? { ...s, words: s.words.map((w) => ({ ...w, removed })) } : s)));
  }
  /** Junta os blocos selecionados (do primeiro ao último) num só. */
  function mergeSelected() {
    if (selCaptions.length < 2) { mergeNext(sel); return; }
    const a = selCaptions[0];
    const b = selCaptions[selCaptions.length - 1];
    setSegments((prev) => {
      const group = prev.slice(a, b + 1);
      const moved = group.some((g) => g.capStart != null || g.capEnd != null);
      const merged = { ...group[0], end: group[group.length - 1].end, words: group.flatMap((g) => g.words), ...(moved ? { capStart: capRangeOf(group[0])[0], capEnd: capRangeOf(group[group.length - 1])[1] } : {}) };
      return [...prev.slice(0, a), merged, ...prev.slice(b + 1)];
    });
    setSel(a);
    setSelSet(new Set([a]));
  }
  function saveEditText() {
    if (editText == null) return;
    setPhraseText(sel, editText);
    setEditText(null);
  }

  /** Divide um trecho {start,end} de uma lista em dois no tempo t (chaves novas). */
  function splitRange(setList, key, t) {
    setList((list) => {
      const i = list.findIndex((r) => r.key === key);
      const r = list[i];
      if (!r || t <= r.start + 0.2 || t >= r.end - 0.2) return list;
      const a = { ...r, end: +t.toFixed(2) };
      const b = { ...r, key: `${r.key}_${Date.now()}`, start: +t.toFixed(2) };
      return [...list.slice(0, i), a, b, ...list.slice(i + 1)];
    });
  }
  function splitMedia(key, t) {
    setMedia((list) => {
      const i = list.findIndex((m) => m.key === key);
      const m = list[i];
      if (!m || t <= m.start + 0.2 || t >= m.start + m.duration - 0.2) return list;
      const cutAt = t - m.start;
      const a = { ...m, duration: +cutAt.toFixed(2), animOut: 'none' };
      const b = {
        ...m, key: `${m.key}_${Date.now()}`, start: +t.toFixed(2), duration: +(m.duration - cutAt).toFixed(2), animIn: 'none',
        // vídeo/música: a segunda parte continua do ponto do arquivo onde a primeira parou
        offset: m.kind === 'image' ? 0 : +((Number(m.offset) || 0) + cutAt).toFixed(2),
      };
      return [...list.slice(0, i), a, b, ...list.slice(i + 1)];
    });
  }
  const selMediaItem = media.find((m) => m.key === selMedia) || null;
  const within = (r, t) => !!r && t > r.start + 0.2 && t < r.end - 0.2;
  const canSplitSel = (() => {
    if (selKind === 'caption') return canSplit;
    if (selKind === 'video') return cur > 0.05 && cur < dur - 0.05 && !vsplits.some((x) => Math.abs(x - cur) < 0.05);
    if (selKind === 'media') return !!selMediaItem && within({ start: selMediaItem.start, end: selMediaItem.start + selMediaItem.duration }, cur);
    if (selKind === 'zoom') return within(selZoomItem, cur);
    if (selKind === 'broll') return within(brollReview?.moments[selBroll], cur);
    if (selKind === 'gain') return within(gains.find((g) => g.key === selGain), cur);
    if (selKind === 'text') return within(textLayers.find((l) => l.key === selText), cur);
    if (selKind === 'vfx') return within(fxMoments.find((m) => m.key === selFx), cur);
    if (selKind === 'xcap') return within(extraCaps.find((c) => c.key === selXcap), cur);
    return false;
  })();
  function splitSelected() {
    if (!canSplitSel) return;
    if (selKind === 'caption') splitAtPlayhead();
    else if (selKind === 'video') setVsplits((l) => [...l, +cur.toFixed(2)].sort((a, b) => a - b));
    else if (selKind === 'media') splitMedia(selMedia, cur);
    else if (selKind === 'zoom') splitRange(setZoomMoments, selZoom, cur);
    else if (selKind === 'broll') splitRange(setBrollMoments, brollReview.moments[selBroll].key, cur);
    else if (selKind === 'gain') splitRange(setGains, selGain, cur);
    else if (selKind === 'text') splitRange(setTextLayers, selText, cur);
    else if (selKind === 'vfx') splitRange(setFxMoments, selFx, cur);
    else if (selKind === 'xcap') splitXcap(selXcap, cur);
  }
  /** Divide uma legenda adicionada no playhead: as palavras vão para cada lado pelo tempo. */
  function splitXcap(key, t) {
    setExtraCaps((list) => {
      const i = list.findIndex((c) => c.key === key);
      const c = list[i];
      if (!c || t <= c.start + 0.2 || t >= c.end - 0.2) return list;
      const parts = c.text.split(/\s+/).filter(Boolean);
      const n = Math.min(parts.length - 1, Math.max(1, Math.round(parts.length * (t - c.start) / (c.end - c.start))));
      const a = { ...c, end: +t.toFixed(2), text: parts.length > 1 ? parts.slice(0, n).join(' ') : c.text };
      const b = { ...c, key: `${c.key}_${Date.now()}`, start: +t.toFixed(2), text: parts.length > 1 ? parts.slice(n).join(' ') : c.text };
      return [...list.slice(0, i), a, b, ...list.slice(i + 1)];
    });
  }
  const canDeleteSel = (selKind === 'words' && !!txSel) || (selKind === 'range' && !!range && range.b - range.a > 0.05) || (selKind === 'caption' && selCaptions.length > 0) || (selKind === 'video' && !!selVideo)
    || (selKind === 'media' && !!selMediaItem) || (selKind === 'zoom' && !!selZoomItem)
    || (selKind === 'broll' && !!brollReview?.moments[selBroll]) || (selKind === 'gain' && !!selGain)
    || (selKind === 'keyframe' && selKey != null) || (selKind === 'text' && !!selText) || (selKind === 'vfx' && !!selFx) || (selKind === 'xcap' && !!selXcap) || (selKind === 'trans' && !!selTrans) || (selKind === 'marker' && !!selMarker) || (selKind === 'speed' && !!selSpeed) || (selKind === 'freeze' && !!selFreeze);
  /** Corta um trecho do vídeo final: some o vídeo, o áudio e a legenda daquele pedaço. */
  function cutTimeRange(a, b) {
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(dur, Math.max(a, b));
    if (hi - lo < 0.05) return false;
    if (hi - lo >= dur - 0.2 && !window.confirm('Isso corta o vídeo inteiro (vídeo, áudio e legenda). Continuar?')) return false;
    setCuts((l) => [...l, { key: `c${Date.now()}`, start: +lo.toFixed(2), end: +hi.toFixed(2) }]);
    return true;
  }
  /** Excluir: trecho/legenda/vídeo saem do vídeo final (vídeo, áudio e legenda juntos); os demais itens saem da faixa. */
  function deleteSelected() {
    if (!canDeleteSel) return;
    if (selKind === 'range') { if (cutTimeRange(range.a, range.b)) { setRange(null); setSelKind('caption'); } }
    else if (selKind === 'words') {
      // Palavras selecionadas na transcrição: saem do vídeo (vídeo, áudio e legenda); se todas
      // já estavam cortadas, voltam.
      const lo = Math.min(txSel.a, txSel.b);
      const hi = Math.max(txSel.a, txSel.b);
      const list = txWords.slice(lo, hi + 1);
      const restore = list.length > 0 && list.every((x) => x.w.removed);
      const bySeg = new Map();
      for (const x of list) { if (!bySeg.has(x.si)) bySeg.set(x.si, new Set()); bySeg.get(x.si).add(x.wi); }
      setSegments((prev) => prev.map((sg, si) => (bySeg.has(si) ? { ...sg, words: sg.words.map((w, wi) => (bySeg.get(si).has(wi) ? { ...w, removed: !restore } : w)) } : sg)));
      setTxSel(null);
      setRange(null);
      setSelKind('caption');
    }
    else if (selKind === 'caption') {
      // Legenda selecionada → corta a fala daquele bloco (vídeo, áudio e legenda). Se todos
      // já estavam cortados, Delete restaura. Só esconder o texto: botão "Ocultar legenda" (H).
      const all = selCaptions.every((i) => segments[i] && segRemoved(segments[i]));
      setCaptionsCut(!all);
    } else if (selKind === 'video') {
      setCuts((l) => [...l, { key: `c${Date.now()}`, start: +selVideo.start.toFixed(2), end: +selVideo.end.toFixed(2) }]);
      setSelVideo(null);
    } else if (selKind === 'media') { removeMedia(selMedia); setSelMedia(null); }
    else if (selKind === 'zoom') { setZoomMoments((l) => l.filter((z) => z.key !== selZoom)); setSelZoom(null); }
    else if (selKind === 'broll') setBrollMoments((l) => l.map((m, i) => (i === selBroll ? { ...m, removed: true } : m)));
    else if (selKind === 'gain') { setGains((l) => l.filter((g) => g.key !== selGain)); setSelGain(null); }
    else if (selKind === 'keyframe') { setTransformKeys((l) => l.filter((k) => k.t !== selKey)); setSelKey(null); }
    else if (selKind === 'text') { setTextLayers((l) => l.filter((x) => x.key !== selText)); setSelText(null); }
    else if (selKind === 'vfx') { setFxMoments((l) => l.filter((x) => x.key !== selFx)); setSelFx(null); }
    else if (selKind === 'xcap') { setExtraCaps((l) => l.filter((x) => x.key !== selXcap)); setSelXcap(null); }
    else if (selKind === 'trans') { setTransitions((l) => l.filter((x) => x.key !== selTrans)); setSelTrans(null); }
    else if (selKind === 'marker') { setMarkers((l) => l.filter((x) => x.key !== selMarker)); setSelMarker(null); }
    else if (selKind === 'speed') { setSpeedRanges((l) => l.filter((x) => x.key !== selSpeed)); setSelSpeed(null); }
    else if (selKind === 'freeze') { setFreezes((l) => l.filter((x) => x.key !== selFreeze)); setSelFreeze(null); }
  }
  /** Sobe/desce a camada da mídia (troca de lugar com quem estiver na camada vizinha). */
  function moveLayer(key, delta) {
    setMedia((list) => {
      const m = list.find((x) => x.key === key);
      if (!m) return list;
      const from = m.layer || 0;
      const to = Math.max(0, from + delta);
      if (to === from) return list;
      return normalizeLayers(list.map((x) => (x.key === key ? { ...x, layer: to } : (x.layer || 0) === to ? { ...x, layer: from } : x)));
    });
  }
  const mediaRows = media.reduce((mx, m) => Math.max(mx, (m.layer || 0) + 1), 1);
  const delTitle = selKind === 'words' ? 'Cortar as palavras selecionadas: vídeo, áudio e legenda (Delete)' : selKind === 'range' ? 'Excluir o trecho selecionado: vídeo, áudio e legenda (Delete)'
    : selKind === 'xcap' ? 'Apagar a legenda que você adicionou (Delete) — o vídeo não muda'
    : selKind === 'caption' ? 'Excluir a fala selecionada: vídeo, áudio e legenda (Delete) · H só oculta a legenda'
      : selKind === 'video' ? 'Cortar o pedaço selecionado: vídeo, áudio e legenda (Delete)' : 'Excluir o item selecionado (Delete)';
  const SEL_LABEL = { range: 'trecho', words: 'palavras', speed: 'velocidade', freeze: 'congelamento', marker: 'marcador', trans: 'transição', text: 'texto', xcap: 'legenda', vfx: 'efeito', keyframe: 'quadro-chave', caption: 'legenda', video: 'vídeo', media: 'camada', zoom: 'zoom', broll: 'B-roll', gain: 'volume' };


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

  async function onPickMedia(e, extra = null) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // permite reenviar o mesmo arquivo
    if (!files.length) return;
    setMediaErr('');
    setMediaBusy(true);
    try {
      for (const file of files) {
        const info = await addProjectMedia(file);
        addMediaItem(info, extra, file);
      }
      libLoadedRef.current = false; // a biblioteca ganhou o arquivo novo
      if (libOpen) loadLibrary();
    } catch (err) {
      setMediaErr(err.message || 'falha ao enviar a mídia');
    } finally {
      setMediaBusy(false);
    }
  }
  /** Coloca uma mídia (recém-enviada ou da biblioteca) na timeline, no ponto atual. */
  function addMediaItem(info, extra = null, file = null) {
        const srcDur = Number(info.durationSec) || (info.kind === 'image' ? 4 : 5);
        setMedia((prev) => [
          ...prev,
          {
            key: `${info.id}-${prev.length}-${Date.now()}`,
            mediaId: info.id,
            kind: info.kind,
            filename: info.filename || file?.name || 'mídia',
            // prévia: imagem local na hora; vídeo pelo servidor (vira H.264 se o navegador não tocar o original)
            previewUrl: info.kind === 'audio' ? null : info.kind === 'video' ? mediaPreviewUrl(info.id) : info.linked || !file ? mediaFileUrl(info.id) : URL.createObjectURL(file),
            fadeIn: 0,
            fadeOut: 0,
            srcDuration: srcDur,
            start: +cur.toFixed(2), // entra no ponto atual do playhead
            duration: info.kind === 'audio' ? Math.min(srcDur, dur) : Math.min(info.kind === 'image' ? 4 : srcDur, 8),
            mode: 'cover', // cobre a tela (visual). PiP = canto.
            volume: info.kind === 'video' ? 1 : 0.35, // vídeo: som original · música: de fundo
            scale: 0.4, // tamanho do PiP
            px: 0.62,
            py: 0.06,
            opacity: 1,
            animIn: 'none', // animação de entrada/saída da camada
            animOut: 'none',
            blend: 'normal', // modo de mesclagem (só tela cheia)
            offset: 0, // ponto de início no arquivo (aparar/dividir)
            layer: freeLayer(prev, cur, info.kind === 'audio' ? Math.min(srcDur, dur) : Math.min(info.kind === 'image' ? 4 : srcDur, 8)),
            ...(extra || {}),
          },
        ]);
  }

  // ── Biblioteca: tudo o que a conta já enviou fica guardado para usar de novo ──
  const [library, setLibrary] = useState(null);
  const [libOpen, setLibOpen] = useState(true);
  const [stickersOpen, setStickersOpen] = useState(false); // stickers recolhidos (abre no ▸)
  const libLoadedRef = useRef(false);
  async function loadLibrary() {
    try {
      setLibrary(await getMediaLibrary());
      libLoadedRef.current = true;
    } catch {
      setLibrary((l) => l || []);
    }
  }
  useEffect(() => {
    if ((tab === 'midias' || tab === 'projeto') && !libLoadedRef.current) loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  async function forgetLibraryItem(id) {
    if (!window.confirm('Tirar esta mídia da biblioteca? Os vídeos que já usam continuam iguais.')) return;
    setLibrary((l) => (l || []).filter((x) => x.id !== id));
    removeLibraryMedia(id).catch(() => loadLibrary());
  }

  // ── Meus modelos: o jeito de editar que você sempre usa (legenda, logo, textos, cor…) ──
  const [tplOpen, setTplOpen] = useState(false);
  const [templates, setTemplates] = useState(null);
  const [tplName, setTplName] = useState('');
  const [tplDefault, setTplDefault] = useState(false);
  const [tplMsg, setTplMsg] = useState('');
  const tplLoad = () => listTemplatesApi().then(setTemplates).catch((e) => { setTemplates((t) => t || []); setTplMsg(e.message); });
  useEffect(() => { if (tplOpen && !templates) tplLoad(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tplOpen]);
  /** O "estilo" do vídeo atual. Mídias que cobrem quase o vídeo todo (ex.: logo) viram "o vídeo inteiro". */
  function templateData() {
    return {
      cap, colorLook, colorAdj, fx, voice, audioVolume, aspectSel, quality,
      textLayers: textLayers.map(({ key, ...l }) => ({ ...l, whole: l.end - l.start >= dur * 0.8 || undefined })),
      media: media.filter((m) => m.mediaId).map(({ previewUrl, offline, ...m }) => ({ ...m, whole: m.duration >= dur * 0.8 || undefined })),
    };
  }
  async function saveTemplateNow() {
    const name = tplName.trim();
    if (!name) { setTplMsg('Dê um nome ao modelo (ex.: "Meu padrão Reels").'); return; }
    try {
      const r = await saveTemplateApi({ name, data: templateData(), ...(tplDefault ? { isDefault: true } : {}) });
      setTemplates(r.templates);
      setTplName('');
      setTplMsg(`Modelo "${r.template.name}" salvo.${r.template.isDefault ? ' Ele entra sozinho nos vídeos novos.' : ''}`);
    } catch (e) {
      setTplMsg(e.message);
    }
  }
  /** Aplica um modelo neste vídeo: troca o estilo e acrescenta as mídias e textos dele. */
  function applyTemplate(t) {
    const d = t?.data || {};
    const fit = (x) => {
      if (x.whole) return { start: 0, end: dur };
      const start = Math.max(0, Math.min(Number(x.start) || 0, Math.max(0, dur - 0.5)));
      return { start, end: Math.min(dur, start + Math.max(0.5, (Number(x.end) || start + 3) - (Number(x.start) || 0))) };
    };
    if (d.cap) setCap((c) => ({ ...c, ...d.cap }));
    if (d.colorLook !== undefined) setColorLook(d.colorLook);
    if (d.colorAdj) setColorAdj(d.colorAdj);
    if (d.fx) setFx((f) => ({ ...f, ...d.fx }));
    if (d.voice) setVoice((v) => ({ ...v, ...d.voice }));
    if (d.audioVolume !== undefined) setAudioVolume(d.audioVolume);
    if (d.aspectSel) setAspectSel(d.aspectSel);
    if (d.quality !== undefined) setQuality(d.quality);
    if (Array.isArray(d.textLayers) && d.textLayers.length) {
      setTextLayers((l) => [...l, ...d.textLayers.map(({ whole, ...x }, i) => { const r = fit({ ...x, whole }); return { ...x, key: `t${Date.now()}${i}`, start: +r.start.toFixed(2), end: +r.end.toFixed(2) }; })]);
    }
    if (Array.isArray(d.media) && d.media.length) {
      const now = Date.now();
      setMedia((prev) => normalizeLayers([...prev, ...d.media.filter((m) => !prev.some((p) => p.mediaId === m.mediaId)).map(({ whole, ...m }, i) => {
        const r = fit({ start: m.start, end: Number(m.start) + Number(m.duration), whole });
        return {
          ...m, key: `${m.mediaId}-tpl${now}${i}`, start: +r.start.toFixed(2), duration: +(r.end - r.start).toFixed(2),
          previewUrl: m.kind === 'audio' ? null : m.kind === 'video' ? mediaPreviewUrl(m.mediaId) : mediaFileUrl(m.mediaId),
        };
      })]));
      setTimeout(() => checkMedia(d.media), 0);
    }
    setTplMsg(`Modelo "${t.name}" aplicado.`);
  }
  /** Antes de remontar o vídeo principal: o estilo deste vídeo segue para o novo. */
  function carryStyleNow() {
    try { sessionStorage.setItem('rf_carry_style', JSON.stringify(templateData())); } catch { /* sem armazenamento: começa do padrão */ }
  }
  async function removeTemplate(t) {
    if (!window.confirm(`Apagar o modelo "${t.name}"?`)) return;
    try { setTemplates(await deleteTemplateApi(t.id)); } catch (e) { setTplMsg(e.message); }
  }
  async function toggleDefault(t) {
    try { setTemplates(await defaultTemplateApi(t.id, t.isDefault)); } catch (e) { setTplMsg(e.message); }
  }
  // Sticker (como no CapCut): o emoji vira uma imagem PNG e entra como camada livre no playhead.
  async function addSticker(st) {
    try {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 512;
      const g = c.getContext('2d');
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '380px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.fillText(st.ch, 256, 286);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      if (!blob) throw new Error('não deu para criar o sticker');
      const file = new File([blob], `sticker-${st.id}.png`, { type: 'image/png' });
      await onPickMedia({ target: { files: [file], value: '' } }, { mode: 'pip', scale: 0.28, cx: 0.5, cy: 0.42, duration: 2.5, animIn: 'pop', animOut: 'fade' });
    } catch (err) {
      setMediaErr(err.message || 'falha ao criar o sticker');
    }
  }
  const updateMedia = (key, patch) => setMedia((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const removeMedia = (key) => setMedia((prev) => prev.filter((m) => m.key !== key));

  // Transcrição atual (edições da timeline) — usada para planejar o B-roll.
  function currentTranscript() {
    return {
      provider: transcript.provider,
      language: transcript.language,
      segments: segments.map((s, si) => ({ start: s.start, end: s.end, words: s.words.map((w, wi) => wordOut(w, capSegments[si]?.words[wi])) })),
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
    setBrollOn(true); // revisar as imagens = quer usar B-roll
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
      const info = await addProjectMedia(file);
      setMoment(i, { myMediaId: info.id, myKind: info.kind, myThumb: URL.createObjectURL(file), removed: false });
    } catch (err) {
      setBrollErr(err.message || 'falha ao enviar a mídia');
    } finally {
      setBrollBusy(false);
    }
  }

  /** Coloca no momento `i` uma imagem enviada (arquivo) — do computador, colada ou arrastada. */
  async function takeBrollFile(i, file) {
    if (i == null || !file) return;
    setBrollBusy(true);
    setBrollErr('');
    try {
      const info = await addProjectMedia(file);
      setMoment(i, { myMediaId: info.id, myKind: info.kind, myThumb: URL.createObjectURL(file), removed: false });
      setBrollPasteHint(null);
    } catch (err) {
      setBrollErr(err.message || 'falha ao enviar a imagem');
    } finally {
      setBrollBusy(false);
    }
  }

  /**
   * Imagem vinda do Google (ou de outro site) para o momento `i`: arquivo, imagem em
   * data: (miniatura arrastada) ou link https da imagem. Devolve true se usou algo.
   */
  async function takeBrollTransfer(i, dt) {
    if (i == null || !dt) return false;
    const file = [...(dt.files || [])].find((f) => /^(image|video)\//.test(f.type));
    if (file) {
      await takeBrollFile(i, file);
      return true;
    }
    const html = dt.getData?.('text/html') || '';
    const fromHtml = (html.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '';
    const text = (dt.getData?.('text/uri-list') || dt.getData?.('text/plain') || '').split(/\s+/)[0];
    const url = [fromHtml, text].find((u) => /^(https:\/\/|data:image\/)/i.test(u || ''));
    if (!url) return false;
    if (url.startsWith('data:')) {
      const blob = await (await fetch(url)).blob();
      await takeBrollFile(i, new File([blob], 'google.jpg', { type: blob.type || 'image/jpeg' }));
      return true;
    }
    // Link da imagem: entra como opção do momento (o servidor baixa ao gerar o vídeo).
    setBrollReview((r) => ({ ...r, moments: r.moments.map((m, j) => (j === i
      ? { ...m, candidates: [{ id: `u${url}`, link: url.replace(/&amp;/g, '&'), thumb: url.replace(/&amp;/g, '&'), kind: 'image', source: 'google' }, ...m.candidates], pick: 0, removed: false, myMediaId: null, myThumb: null }
      : m)) }));
    setBrollPasteHint(null);
    return true;
  }

  // Ctrl+V com a aba B-roll aberta: cola a imagem copiada do Google no momento selecionado.
  useEffect(() => {
    if (tab !== 'broll' || selBroll == null || !brollReview) return undefined;
    const onPaste = (e) => {
      const dt = e.clipboardData;
      const hasImage = [...(dt?.files || [])].some((f) => f.type.startsWith('image/'));
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '');
      if (typing && !hasImage) return; // colando texto na busca
      e.preventDefault();
      takeBrollTransfer(selBroll, dt);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [tab, selBroll, brollReview]);

  /** Novo momento de B-roll na posição atual do vídeo (3 s); depois escolhe a imagem. */
  function addBrollHere() {
    const start = Math.max(0, Math.min(cur, durationSec - 0.8));
    const m = { key: `m${Date.now()}`, zoom: 1, fx: 0.5, fy: 0.5, start: +start.toFixed(2), end: +Math.min(durationSec, start + 3).toFixed(2), term: 'nova imagem', query: '', candidates: [], pick: -1, removed: false, myThumb: null, myMediaId: null, myKind: null, manual: true };
    setBrollOn(true);
    setBrollReview((r) => {
      const moments = [...(r?.moments || []), m].sort((a, b) => a.start - b.start);
      setSelBroll(moments.indexOf(m));
      return { source: r?.source || imageSource, moments };
    });
    setTab('broll');
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
      return { start: m.start, end: m.end, url: c.link, thumb: c.thumb || undefined, kind: c.kind, ...(c.logo ? { logo: true } : {}), query: m.term, credit: c.credit || null, ...frame };
    });
  }

  // Desliga, só neste render, um recurso que o plano não libera.
  function disableFeature(id) {
    if (id === 'ai') setRenderOff((o) => ({ ...o, autoClean: false }));
    if (id === 'captionStyle') setCapField({ captionTemplate: 'clean' });
    if (id === 'image') {
      setBrollOn(false);
      setBrollReview(null);
      setRenderOff((o) => ({ ...o, broll: false }));
    }
    setRenderErr((e) => {
      if (!e) return e;
      const locked = (e.locked || []).filter((x) => x !== id);
      return e.code === 'PLAN_REQUIRED' && !locked.length ? null : { ...e, locked };
    });
  }

  // Escondido enquanto o render processa: para a reprodução.
  useEffect(() => {
    if (hidden) videoRef.current?.pause();
  }, [hidden]);

  // O job aceito falhou no meio do processamento: o App volta para cá e o erro
  // aparece no mesmo aviso dos erros de envio.
  const renderErrRef = useRef(null);
  useEffect(() => {
    if (!jobError) return;
    setRenderErr({ message: jobError.message, code: null, locked: [] });
    requestAnimationFrame(() => renderErrRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [jobError]);

  async function generate() {
    if (sending) return;
    // Cortes de silêncio escolhidos: uma pequena folga interna evita cortar o
    // ataque/finalização das palavras vizinhas.
    const silenceCuts = pausesCut
      .map((p) => ({ start: p.start + Math.min(0.03, p.dur / 4), end: p.end - Math.min(0.03, p.dur / 4) }))
      .filter((c) => c.end - c.start > 0.02);
    setRenderErr(null);
    setSending(true);
    try {
      await onGenerate(
      {
        provider: transcript.provider,
        language: transcript.language,
        segments: segments.map((s, si) => ({ start: s.start, end: s.end, words: s.words.map((w, wi) => wordOut(w, capSegments[si]?.words[wi])) })),
      },
      {
        // Recursos desligados aqui (ex.: limpeza por IA fora do plano).
        ...renderOff,
        manualSilence: true,
        silenceCuts,
        // pausas que o usuário escolheu manter (os outros silêncios que o servidor achar saem)
        keptPauses: pauses.filter((p) => !isPauseCut(p)).map((p) => ({ start: +p.start.toFixed(2), end: +p.end.toFixed(2) })),
        // tosses/sons soltos que o usuário restaurou (os outros saem)
        keptNoises: keptNoises.map((n) => ({ start: +n.start.toFixed(3), end: +n.end.toFixed(3) })),
        // Enquadramento (tela dividida): manual envia foco; auto deixa o servidor
        // detectar o rosto. Zoom vale para os dois.
        personZoom: +Number(zoom).toFixed(2),
        // Formato do vídeo final + enquadramento no formato (escolhidos na aba Enquadramento).
        aspect: aspectSel,
        quality: hdAllowed ? quality : 'original',
        reframeMode,
        splitSwap,
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
        ...(fx.videoMotion !== 'none' && zoomMoments
          ? { zoomMoments: zoomMoments.map((z) => ({ start: +z.start.toFixed(2), end: +z.end.toFixed(2), ...(z.scale ? { scale: +Number(z.scale).toFixed(2) } : {}), ...(z.effect ? { effect: z.effect } : {}) })) }
          : {}),
        // Quadros-chave do Transformar (tempo original; o servidor remapeia após os cortes).
        transformKeys: cleanKeys(transformKeys),
        colorLook,
        colorAdjust: colorAdj,
        // Trechos cortados à mão na faixa de vídeo (tempo original).
        videoCuts: cuts.map((c) => ({ start: +c.start.toFixed(2), end: +c.end.toFixed(2) })),
        // Volume da fala (tempo original — este estágio roda antes dos cortes).
        audioMute,
        cutBreaths,
        cutCoughs,
        speed,
        audioVolume: +Number(audioVolume).toFixed(2),
        audioGains: gains.map((g) => ({ start: +g.start.toFixed(2), end: +g.end.toFixed(2), volume: +Number(g.volume).toFixed(2) })),
        // Minhas mídias colocadas na timeline (imagens/vídeos/músicas próprias).
        userMedia: visMedia.map((m) => ({
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
          animIn: m.animIn || 'none',
          animOut: m.animOut || 'none',
          blend: m.blend || 'normal',
          layer: m.layer || 0,
          offset: +Number(m.offset || 0).toFixed(2),
          ...(m.kind === 'video' && m.muted ? { muted: true } : {}),
          ...(m.kind !== 'audio' ? { bright: +Number(m.bright || 0).toFixed(2), contrast: +Number(m.contrast ?? 1).toFixed(2), sat: +Number(m.sat ?? 1).toFixed(2), flip: m.flip === true } : {}),
          ...(m.cx != null ? { cx: +Number(m.cx).toFixed(3), cy: +Number(m.cy ?? 0.5).toFixed(3) } : {}),
          ...(m.kind === 'audio' ? { fadeIn: +Number(m.fadeIn || 0).toFixed(2), fadeOut: +Number(m.fadeOut || 0).toFixed(2) } : {}),
        })),
        // Velocidade por trecho e congelar quadro (tempo original; o servidor remapeia).
        speedRanges: speedRanges.map((r) => ({ start: +r.start.toFixed(3), end: +r.end.toFixed(3), speed: r.speed })),
        freezes: freezes.map((f) => ({ t: +f.t.toFixed(3), dur: f.dur })),
        // Transições manuais (cada uma no seu ponto) — as automáticas ficam desligadas.
        transition: 'none',
        transitions: transitions.map((tr) => ({ t: +tr.t.toFixed(3), type: tr.type })),
        // Efeitos de vídeo nos momentos e textos livres (tempo original).
        fxMoments: visFx.map((m) => ({ start: +m.start.toFixed(2), end: +m.end.toFixed(2), effect: m.effect })),
        textLayers: visTexts.map(({ key, ...l }) => ({ ...l, start: +l.start.toFixed(2), end: +l.end.toFixed(2) })),
        // legendas adicionadas à mão (tempo original; o servidor leva para o vídeo cortado)
        extraCaptions: visXcaps.filter((c) => c.text.trim()).map((c) => ({ text: c.text, start: +c.start.toFixed(2), end: +c.end.toFixed(2) })),
        // Efeitos sonoros colocados à mão (tempo original; o servidor remapeia após os cortes).
        sfxMoments: sfxMoments.map((m) => ({ t: +m.t.toFixed(2), type: m.type })),
        // B-roll revisado: trava o que entra em cada momento (e liga o B-roll).
        ...(!brollOn ? { broll: false, brollPlan: [] } : brollReview ? { broll: true, brollPlan: brollPlanForRender() } : {}),
        headline: headline.on && headline.text.trim() ? { text: headline.text.trim(), seconds: headline.seconds, style: headline.style, color: headline.color, position: headline.position } : null,
        cover: cover.on ? { t: cover.t ?? 0, text: (cover.text || headline.text || '').trim(), position: cover.position, intro: cover.intro, fx: framingMode === 'manual' ? focus.x : 0.5 } : null,
        // Layout do B-roll escolhido aqui (tela cheia ou tela dividida).
        brollLayout: brollLayoutSel,
        imageSource,
      },
      );
      markAutosaveSubmitted(sourceId);
    } catch (e) {
      setRenderErr({ message: e.message, code: e.code || null, locked: e.locked || [] });
    } finally {
      // Em caso de sucesso o App mostra o progresso e este editor fica escondido.
      setSending(false);
    }
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

  // ── Transformar (quadros-chave, como no CapCut) ──
  // Mexer num valor grava um quadro-chave no playhead (ou atualiza o que já está nele);
  // entre dois quadros o vídeo anima sozinho.
  const K = keyAt(transformKeys, cur);
  const keyHere = transformKeys.find((k) => Math.abs(k.t - cur) < 0.04) || null;
  const prevKey = [...transformKeys].reverse().find((k) => k.t < cur - 0.04) || null;
  const nextKey = transformKeys.find((k) => k.t > cur + 0.04) || null;
  function setKeyValue(prop, value) {
    const t = +cur.toFixed(3);
    setTransformKeys((list) => {
      const i = list.findIndex((k) => Math.abs(k.t - t) < 0.04);
      if (i >= 0) return list.map((k, j) => (j === i ? { ...k, [prop]: value } : k));
      return cleanKeys([...list, { t, ...keyAt(list, t), [prop]: value }]);
    });
  }
  function toggleKeyHere() {
    const t = +cur.toFixed(3);
    setTransformKeys((list) => {
      const i = list.findIndex((k) => Math.abs(k.t - t) < 0.04);
      if (i >= 0) return list.filter((_, j) => j !== i);
      return cleanKeys([...list, { t, ...keyAt(list, t) }]);
    });
  }
  const keyDragRef = useRef(null); // { t0, x0, moved }
  function startKeyDrag(k, e) {
    e.stopPropagation();
    keyDragRef.current = { t0: k.t, cur: k.t, x0: e.clientX, moved: false };
  }
  useEffect(() => {
    function move(e) {
      const d = keyDragRef.current;
      if (!d) return;
      const dx = e.clientX - d.x0;
      if (!d.moved && Math.abs(dx) < 4) return;
      d.moved = true;
      document.body.style.userSelect = 'none';
      const t = +Math.max(0, Math.min(dur, d.t0 + dx / pps)).toFixed(3);
      setTransformKeys((list) => list.map((k) => (k.t === d.cur ? { ...k, t } : k)));
      setSelKey(t);
      d.cur = t;
    }
    function up() {
      const d = keyDragRef.current;
      if (!d) return;
      keyDragRef.current = null;
      document.body.style.userSelect = '';
      if (d.moved) { setTransformKeys((list) => cleanKeys(list)); setSelKind('keyframe'); }
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [pps, dur]);
  const kfBtn = (off, on) => ({ ...zoomBtn, width: 24, height: 24, fontSize: 13, opacity: off ? 0.35 : 1, cursor: off ? 'default' : 'pointer', color: on ? '#22D3EE' : C.text, borderColor: on ? '#22D3EE' : C.border });
  const kfRow = (label, prop, min, max, step, fmt, toV = (x) => x, fromV = (x) => x) => (
    <div key={prop} style={{ display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr) 54px', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={toV(K[prop])} onChange={(e) => setKeyValue(prop, fromV(Number(e.target.value)))} style={{ width: '100%' }} />
      <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: keyHere ? '#22D3EE' : C.text }}>{fmt(K[prop])}</span>
    </div>
  );
  const transformBlock = (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1 }}>Transformar {transformKeys.length ? `· ${transformKeys.length} quadro(s)-chave` : ''}</span>
        <button title="Quadro-chave anterior" disabled={!prevKey} onClick={() => prevKey && seek(prevKey.t)} style={kfBtn(!prevKey)}>‹</button>
        <button title={keyHere ? 'Remover o quadro-chave deste ponto' : 'Adicionar quadro-chave no playhead'} onClick={toggleKeyHere} style={kfBtn(false, !!keyHere)}>◆</button>
        <button title="Próximo quadro-chave" disabled={!nextKey} onClick={() => nextKey && seek(nextKey.t)} style={kfBtn(!nextKey)}>›</button>
        <button title="Apagar todos os quadros-chave" disabled={!transformKeys.length} onClick={() => { setTransformKeys([]); setSelKey(null); }} style={kfBtn(!transformKeys.length)}>⟲</button>
      </div>
      {kfRow('Escala', 'scale', 50, 300, 1, (v) => `${Math.round(v * 100)}%`, (v) => Math.round(v * 100), (v) => v / 100)}
      {kfRow('Posição X', 'x', -100, 100, 1, (v) => `${Math.round(v * 100)}`, (v) => Math.round(v * 100), (v) => v / 100)}
      {kfRow('Posição Y', 'y', -100, 100, 1, (v) => `${Math.round(v * 100)}`, (v) => Math.round(v * 100), (v) => v / 100)}
      {kfRow('Girar', 'rot', -180, 180, 1, (v) => `${Math.round(v)}°`)}
      <div style={{ fontSize: 11, color: C.faint }}>
        Mexa num valor para gravar um ◆ no ponto do playhead. Mova o playhead, mude o valor de novo e o vídeo anima sozinho entre os dois quadros (faixa QUADROS na timeline).
      </div>
    </div>
  );

  // ── Textos livres (aba Texto) ──
  const updateText = (key, patch) => setTextLayers((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  function addText(tplId) {
    const { label, ...tpl } = TEXT_TEMPLATES[tplId] || TEXT_TEMPLATES.simples;
    const start = Math.max(0, Math.min(cur, dur - 0.5));
    const t = { key: `t${Date.now()}`, ...tpl, start: +start.toFixed(2), end: +Math.min(dur, start + 3).toFixed(2) };
    setTextLayers((l) => [...l, t].sort((a, b) => a.start - b.start));
    setSelText(t.key);
    setSelKind('text');
  }
  const selTextItem = textLayers.find((l) => l.key === selText) || null;

  // ── Legendas adicionadas à mão (+ Legenda) ──
  const updateXcap = (key, patch) => setExtraCaps((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)).sort((a, b) => a.start - b.start));
  /** Garante que as legendas aparecem (legenda ligada e faixa visível). */
  function showXcaps() {
    if (cap.captions === false) setCap((x) => ({ ...x, captions: true }));
    if (laneHide.xcap) setLaneHide((h) => ({ ...h, xcap: false }));
  }
  function addExtraCap() {
    const start = +Math.max(0, Math.min(cur, dur - 0.5)).toFixed(2);
    const c = { key: `x${Date.now()}`, text: 'Nova legenda', start, end: +Math.min(dur, start + 2).toFixed(2) };
    setExtraCaps((l) => [...l, c].sort((a, b) => a.start - b.start));
    setSelXcap(c.key);
    setSelKind('xcap');
    showXcaps();
    setTab('legenda');
    setCapPane('lista');
    if (isMobile) setMTool('legenda');
    setXcapFocus(c.key);
  }
  const [xcapFocus, setXcapFocus] = useState(null); // abre o campo de texto da nova legenda
  const selXcapItem = extraCaps.find((c) => c.key === selXcap) || null;
  /** Traz de volta uma legenda cortada: as palavras e o pedaço do vídeo daquele trecho. */
  function restoreCaption(si) {
    const sg = segments[si];
    if (!sg) return;
    setSegments((prev) => prev.map((x, i) => (i === si ? { ...x, words: x.words.map((w) => (w.removed ? { ...w, removed: false } : w)) } : x)));
    const a = sg.start;
    const b = sg.end;
    setCuts((l) => l.flatMap((c) => {
      if (c.end <= a || c.start >= b) return [c];
      const out = [];
      if (c.start < a - 0.05) out.push({ ...c, end: +a.toFixed(2) });
      if (c.end > b + 0.05) out.push({ ...c, key: `${c.key}_r${Date.now()}`, start: +b.toFixed(2) });
      return out;
    }));
  }
  const xcapBlock = (
    <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 12, border: '1px solid rgba(255,107,53,0.35)', background: 'rgba(255,107,53,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Suas legendas{extraCaps.length ? ` · ${extraCaps.length}` : ''}</div>
        <button data-tour="addcap2" onClick={addExtraCap} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 9, border: 'none', background: GRAD, color: '#fff', fontWeight: 700, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>
          + Adicionar legenda
        </button>
      </div>
      {!extraCaps.length && (
        <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
          Escreva uma legenda que aparece no ponto atual do vídeo ({fmtDuration(cur)}), com o mesmo estilo das automáticas. Não corta nada do vídeo.
          Também dá para copiar uma legenda da lista (Ctrl+C) e colar onde quiser (Ctrl+V).
        </div>
      )}
      {extraCaps.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {extraCaps.map((c) => (
            <button key={c.key} onClick={() => { setSelXcap(c.key); setSelKind('xcap'); seek(c.start + 0.05); }} style={{ ...miniBtn(selXcap === c.key && selKind === 'xcap', false), maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtDuration(c.start)} · {c.text}</button>
          ))}
        </div>
      )}
      {selXcapItem && (
        <div style={{ display: 'grid', gap: 8 }}>
          <textarea key={selXcapItem.key} autoFocus={xcapFocus === selXcapItem.key} onFocus={(e) => { if (xcapFocus === selXcapItem.key) { e.currentTarget.select(); setXcapFocus(null); } }}
            value={selXcapItem.text} rows={2} placeholder="Escreva a legenda" onChange={(e) => updateXcap(selXcapItem.key, { text: e.target.value })}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '8px 10px', borderRadius: 9, border: `1px solid ${C.orange}`, background: 'rgba(0,0,0,0.4)', color: C.text, fontSize: 14, lineHeight: 1.4, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11.5, color: C.muted }}>
            {[['Começa', 'start'], ['Termina', 'end']].map(([label, k]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {label}
                <button title="0,1 s antes" onClick={() => updateXcap(selXcapItem.key, { [k]: +Math.max(k === 'end' ? selXcapItem.start + 0.2 : 0, selXcapItem[k] - 0.1).toFixed(2) })} style={{ ...zoomBtn, width: 22, height: 22 }}>−</button>
                <b style={{ fontVariantNumeric: 'tabular-nums', color: C.text, minWidth: 40, textAlign: 'center' }}>{fmtDuration(selXcapItem[k])}</b>
                <button title="0,1 s depois" onClick={() => updateXcap(selXcapItem.key, { [k]: +Math.min(k === 'start' ? selXcapItem.end - 0.2 : dur, selXcapItem[k] + 0.1).toFixed(2) })} style={{ ...zoomBtn, width: 22, height: 22 }}>+</button>
              </span>
            ))}
            <button onClick={() => updateXcap(selXcapItem.key, { start: +Math.max(0, Math.min(cur, selXcapItem.end - 0.2)).toFixed(2) })} title="A legenda começa no ponto atual do vídeo" style={miniBtn(false, false)}>Começar aqui</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={copySel} style={miniBtn(false, false)} title="Copiar (Ctrl+C)">Copiar</button>
            <button onClick={duplicateSel} style={miniBtn(false, false)} title="Duplicar logo depois (Ctrl+D)">Duplicar</button>
            <button onClick={() => { setExtraCaps((l) => l.filter((x) => x.key !== selXcapItem.key)); setSelXcap(null); }} style={{ ...miniBtn(false, false), marginLeft: 'auto', color: C.red }}>Apagar</button>
          </div>
          <div style={{ fontSize: 10.5, color: C.faint }}>Arraste o bloco na faixa “Suas legendas” para mudar de lugar · as pontas mudam a duração.</div>
        </div>
      )}
    </div>
  );
  const swatch = (hex, on, onClick) => (
    <button key={hex} onClick={onClick} title={hex} style={{ width: 22, height: 22, borderRadius: 6, background: hex, border: on ? '2px solid #fff' : `1px solid ${C.border}`, cursor: 'pointer', padding: 0 }} />
  );
  const textBlock = (
    <div style={{ display: 'grid', gap: 12, background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <CapRow label={`Modelos de texto — entram no playhead (${fmtDuration(cur)})`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          {Object.entries(TEXT_TEMPLATES).map(([id, t]) => (
            <button key={id} onClick={() => addText(id)} style={{ ...framingTab(false), textAlign: 'left', display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 11, color: C.faint }}>{t.label}</span>
              <span style={{ fontFamily: `'${fontById(t.font).family}'`, fontWeight: fontById(t.font).bold === false ? 400 : 700, fontSize: 13, color: t.color, background: t.box === 'box' ? t.boxColor : 'transparent', padding: t.box === 'box' ? '1px 5px' : 0, borderRadius: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', WebkitTextStroke: t.box === 'outline' ? `0.6px ${t.boxColor}` : undefined }}>{t.text.split('\n')[0]}</span>
            </button>
          ))}
        </div>
      </CapRow>
      {textLayers.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {textLayers.map((l) => (
            <button key={l.key} onClick={() => { setSelText(l.key); setSelKind('text'); seek(l.start + 0.05); }} style={{ ...miniBtn(selText === l.key, false), maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtDuration(l.start)} · {l.text.split('\n')[0]}</button>
          ))}
        </div>
      )}
      {selTextItem && (
        <div style={{ border: '1px solid #E8A020', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
          <textarea value={selTextItem.text} rows={2} onChange={(e) => updateText(selTextItem.key, { text: e.target.value })}
            style={{ width: '100%', boxSizing: 'border-box', background: '#13131B', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
          <CapRow label="Fonte"><Sel value={selTextItem.font} opts={CAPTION_FONT_LIST.map((f) => ({ id: f.id, label: f.label }))} onChange={(v) => updateText(selTextItem.key, { font: v })} /></CapRow>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.muted }}>
            <span style={{ width: 58 }}>Tamanho</span>
            <input type="range" min="0.015" max="0.2" step="0.002" value={selTextItem.size} onChange={(e) => updateText(selTextItem.key, { size: Number(e.target.value) })} style={{ flex: 1 }} />
            <span style={{ width: 36, textAlign: 'right' }}>{Math.round(selTextItem.size * 1000) / 10}</span>
          </label>
          <CapRow label="Cor do texto"><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{CAPTION_COLOR_LIST.map((c) => swatch(c.hex, selTextItem.color.toUpperCase() === c.hex.toUpperCase(), () => updateText(selTextItem.key, { color: c.hex })))}{swatch('#111111', selTextItem.color === '#111111', () => updateText(selTextItem.key, { color: '#111111' }))}</div></CapRow>
          <CapRow label="Fundo">
            <div style={{ display: 'flex', gap: 6 }}>{Object.entries(TEXT_BOXES).map(([id, label]) => (<button key={id} onClick={() => updateText(selTextItem.key, { box: id })} style={framingTab(selTextItem.box === id)}>{label}</button>))}</div>
          </CapRow>
          {selTextItem.box !== 'none' && (
            <CapRow label={selTextItem.box === 'box' ? 'Cor da caixa' : 'Cor do contorno'}><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{['#000000', '#111111', '#FFFFFF', ...CAPTION_COLOR_LIST.map((c) => c.hex).filter((h) => h !== '#FFFFFF')].map((hex) => swatch(hex, selTextItem.boxColor.toUpperCase() === hex.toUpperCase(), () => updateText(selTextItem.key, { boxColor: hex })))}</div></CapRow>
          )}
          {[['x', 'Posição X'], ['y', 'Posição Y']].map(([k, label]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.muted }}>
              <span style={{ width: 58 }}>{label}</span>
              <input type="range" min="0" max="1" step="0.01" value={selTextItem[k]} onChange={(e) => updateText(selTextItem.key, { [k]: Number(e.target.value) })} style={{ flex: 1 }} />
              <span style={{ width: 36, textAlign: 'right' }}>{Math.round(selTextItem[k] * 100)}%</span>
            </label>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <CapRow label="Entrada"><Sel value={selTextItem.animIn} opts={Object.entries(TEXT_ANIMS_IN).map(([id, label]) => ({ id, label }))} onChange={(v) => updateText(selTextItem.key, { animIn: v })} /></CapRow>
            <CapRow label="Saída"><Sel value={selTextItem.animOut} opts={Object.entries(TEXT_ANIMS_OUT).map(([id, label]) => ({ id, label }))} onChange={(v) => updateText(selTextItem.key, { animOut: v })} /></CapRow>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.faint }}>
            {fmtDuration(selTextItem.start)} → {fmtDuration(selTextItem.end)} · arraste o texto no vídeo ou o bloco na faixa TEXTOS
            <button onClick={() => { setTextLayers((l) => l.filter((x) => x.key !== selTextItem.key)); setSelText(null); }} style={{ ...miniBtn(false, false), marginLeft: 'auto', color: C.red }}>Excluir</button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Efeitos de vídeo nos momentos (aba Efeitos) ──
  const selFxItem = fxMoments.find((m) => m.key === selFx) || null;
  function addFxAtPlayhead() {
    const start = Math.max(0, Math.min(cur, dur - 0.3));
    const m = { key: `f${Date.now()}`, start: +start.toFixed(2), end: +Math.min(dur, start + 2).toFixed(2), effect: fxPick };
    setFxMoments((l) => [...l, m].sort((a, b) => a.start - b.start));
    setSelFx(m.key);
    setSelKind('vfx');
  }
  const fxOpts = Object.entries(VIDEO_FX).map(([id, label]) => ({ id, label }));
  const fxBlock = (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Efeitos de vídeo nos momentos {fxMoments.length ? `· ${fxMoments.length}` : ''}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1 }}><Sel value={fxPick} opts={fxOpts} onChange={setFxPick} /></div>
        <button onClick={addFxAtPlayhead} style={{ ...framingTab(false), flex: 'none' }}>+ No playhead</button>
      </div>
      {selFxItem && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1 }}><Sel value={selFxItem.effect} opts={fxOpts} onChange={(v) => setFxMoments((l) => l.map((m) => (m.key === selFxItem.key ? { ...m, effect: v } : m)))} /></div>
          <span style={{ fontSize: 11, color: C.faint }}>{fmtDuration(selFxItem.start)} → {fmtDuration(selFxItem.end)}</span>
          <button onClick={() => { setFxMoments((l) => l.filter((m) => m.key !== selFxItem.key)); setSelFx(null); }} style={{ ...miniBtn(false, false), color: C.red }}>Remover</button>
        </div>
      )}
      <div style={{ fontSize: 11, color: C.faint }}>O efeito só acontece no trecho do bloco (faixa EFEITOS) e não afeta a legenda nem os textos.</div>
    </div>
  );
  // Prévia: o efeito do momento atual entra no filtro do player.
  const fxNow = visFx.find((m) => cur >= m.start && cur < m.end);
  const videoFilterFx = [videoFilter, fxNow ? VIDEO_FX_CSS[fxNow.effect] : ''].filter(Boolean).join(' ') || undefined;

  // Quanto a velocidade dos trechos e os congelamentos mudam a duração (aproximado).
  const retimeDelta = speedRanges.reduce((acc, r) => acc + (r.end - r.start) * (1 / r.speed - 1), 0) + freezes.reduce((acc, f) => acc + f.dur, 0) * speed;
  const allGone = stats.total > 0 && stats.removed >= stats.total; // timeline sem fala (só imagens/música) pode exportar
  const showZoomLane = fx.videoMotion !== 'none';
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
    setSegments((prev) => prev.map((s, i) => {
      if (capSegments[i]?.start !== seg?.start) return s;
      return {
        ...s,
        words: s.words.map((w) => (capScope === 'palavra' && w.start !== word?.start) || w.removed ? w : { ...w, px: x, py: y }),
      };
    }));
  }
  const capSegNow = segments[capSegments.findIndex((s) => cur >= s.start && cur < s.end)] || null;
  // ── Painel de legendas (lista estilo Premiere + propriedades da selecionada)
  const [capPane, setCapPane] = useState('transcricao');
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
    if (kind === 'capText') setCapPane('transcricao');
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
  // Atalhos de teclado (fora de campos de texto): espaço, setas, S/Ctrl+B dividem a
  // faixa selecionada, Delete exclui o selecionado.
  const keysRef = useRef({});
  // Ferramentas como no Premiere: V seleção, C navalha (clique corta ali), R trecho.
  const [razorTool, setRazorTool] = useState(false);
  const [razorT, setRazorT] = useState(null);
  const [showKeys, setShowKeys] = useState(false);
  function pickTool(t) { setRazorTool(t === 'razor'); setRangeTool(t === 'range'); setRazorT(null); }
  /** Navalha / Ctrl+K: divide vídeo (V1) e legenda no ponto. */
  function razorCut(t) {
    const at = +Math.max(0.05, Math.min(dur - 0.05, t)).toFixed(2);
    setVsplits((l) => (l.some((x) => Math.abs(x - at) < 0.05) ? l : [...l, at].sort((a, b) => a - b)));
    splitAtPlayhead(at);
  }
  /** Pontos de edição (como no Premiere): começo, fim, divisões e bordas dos cortes. */
  const editPoints = () => [...new Set([0, dur, ...vsplits, ...cuts.flatMap((c) => [c.start, c.end])].map((x) => +x.toFixed(2)))].sort((a, b) => a - b);
  /** Q / W: corta do ponto de edição anterior até o playhead (Q) ou do playhead ao próximo (W). */
  function rippleTrim(side) {
    const pts = editPoints();
    if (side === 'prev') {
      const a = [...pts].reverse().find((x) => x < cur - 0.05);
      if (a != null) cutTimeRange(a, cur);
    } else {
      const b = pts.find((x) => x > cur + 0.05);
      if (b != null) cutTimeRange(cur, b);
    }
  }
  /** I / O: entrada e saída do trecho no playhead (como no Premiere). */
  function markRange(side) {
    const t = +cur.toFixed(2);
    setRange((r) => {
      const base = r || { a: side === 'a' ? t : 0, b: side === 'b' ? t : dur };
      const next = { ...base, [side]: t };
      return next.a <= next.b ? next : { a: next.b, b: next.a };
    });
    setSelKind('range');
  }
  function selectAllRange() { setRange({ a: 0, b: +dur.toFixed(2) }); setSelKind('range'); }
  function clearRange() { setRange(null); setTxSel(null); setRangeTool(false); if (selKind === 'range' || selKind === 'words') setSelKind('caption'); }
  function toggleCapHidden() {
    if (selKind !== 'caption' || !selCaptions.length) return;
    const all = selCaptions.every((i) => segments[i] && segHidden(segments[i]));
    setCaptionsHidden(!all);
  }
  keysRef.current = { razorCut, pickTool, rippleTrim, zoomTl, fitAll: () => fitAll(), rangeOn: rangeTool, toggleKeys: () => setShowKeys((v) => !v), pause: () => videoRef.current?.pause(), play: () => videoRef.current?.play()?.catch?.(() => {}), togglePlay, seek, cur, dur, goCaption, splitSelected, deleteSelected, undo, redo, hidden, copySel, pasteAtPlayhead, duplicateSel, toggleMarker, toggleSnap, markRange, selectAllRange, clearRange, toggleCapHidden, toggleRangeTool: () => setRangeTool((v) => !v) };
  useEffect(() => {
    function onKey(e) {
      if (keysRef.current.hidden) return; // escondido durante o render
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = keysRef.current;
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) k.redo(); else k.undo(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); k.redo(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); k.splitSelected(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) { if (k.copySel()) e.preventDefault(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) { if (k.pasteAtPlayhead()) e.preventDefault(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); k.duplicateSel(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); k.selectAllRange(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); k.razorCut(k.cur); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); k.togglePlay(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); k.seek(k.cur - (e.shiftKey ? 5 : 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); k.seek(k.cur + (e.shiftKey ? 5 : 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); k.goCaption(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); k.goCaption(1); }
      else if (e.key === 's' || e.key === 'S') { k.splitSelected(); }
      else if (e.key === 'm' || e.key === 'M') { k.toggleMarker(); }
      else if (e.key === 'n' || e.key === 'N') { k.toggleSnap(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); k.deleteSelected(); }
      else if (e.key === 'i' || e.key === 'I') { k.markRange('a'); }
      else if (e.key === 'o' || e.key === 'O') { k.markRange('b'); }
      else if (e.key === 'r' || e.key === 'R') { k.pickTool(k.rangeOn ? 'select' : 'range'); }
      else if (e.key === 'h' || e.key === 'H') { k.toggleCapHidden(); }
      else if (e.key === 'Escape') { k.clearRange(); k.pickTool('select'); }
      else if (e.key === 'v' || e.key === 'V') { k.pickTool('select'); }
      else if (e.key === 'c' || e.key === 'C') { k.pickTool('razor'); }
      else if (e.key === 'q' || e.key === 'Q') { k.rippleTrim('prev'); }
      else if (e.key === 'w' || e.key === 'W') { k.rippleTrim('next'); }
      else if (e.key === 'j' || e.key === 'J') { k.seek(k.cur - 5); }
      else if (e.key === 'k' || e.key === 'K') { k.pause(); }
      else if (e.key === 'l' || e.key === 'L') { k.play(); }
      else if (e.key === '=' || e.key === '+') { k.zoomTl(1); }
      else if (e.key === '-' || e.key === '_') { k.zoomTl(-1); }
      else if (e.key === '\\') { k.fitAll(); }
      else if (e.key === '?') { k.toggleKeys(); }
      else if (e.key === 'Home') { e.preventDefault(); k.seek(0); }
      else if (e.key === 'End') { e.preventDefault(); k.seek(k.dur); }
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
  const brollMoment = brollOn ? (brollReview?.moments || []).find((m) => !m.removed && cur >= m.start && cur < m.end) : null;
  const thumbOf = (m) => (m && !m.removed ? (m.myThumb || m.candidates?.[m.pick]?.thumb || null) : null);
  const brollNow = thumbOf(brollMoment);
  // Na prévia 9:16 mostra o B-roll do momento atual ou, se nenhum, o selecionado na aba.
  const brollShownIdx = brollMoment ? brollReview.moments.indexOf(brollMoment) : selBroll;
  const brollShown = brollShownIdx != null ? brollReview?.moments?.[brollShownIdx] : null;
  // Logo de marca: inteiro e centralizado num fundo claro (como no render).
  const brollImgStyle = (m) => (!m?.myThumb && m?.candidates?.[m.pick]?.logo ? {
    width: '100%', height: '100%', objectFit: 'contain', display: 'block', boxSizing: 'border-box', padding: '17%', background: '#F5F5F7', filter: videoFilterFx,
  } : {
    width: '100%', height: '100%', objectFit: 'cover', display: 'block',
    objectPosition: `${(m?.fx ?? 0.5) * 100}% ${(m?.fy ?? 0.5) * 100}%`,
    transform: `scale(${m?.zoom || 1})`, transformOrigin: `${(m?.fx ?? 0.5) * 100}% ${(m?.fy ?? 0.5) * 100}%`,
    filter: videoFilterFx,
  });

  // Prévia 9:16 = o que sai no vídeo naquele instante: com B-roll ativo, tela dividida
  // (ou B-roll em tela cheia); sem B-roll, o VÍDEO INTEIRO com o enquadramento.
  const brollLayout = brollLayoutSel === 'fullscreen' ? 'fullscreen' : 'split';
  // Tela dividida com B-roll: a legenda centraliza (linha entre as metades) — como no render.
  const capCenterWins = brollOn && brollLayout === 'split' && cap.captionBrollCenter !== false
    ? (brollReview?.moments || []).filter((m) => !m.removed && (m.myMediaId || m.candidates?.[m.pick])).map((m) => ({ start: m.start, end: m.end }))
    : [];
  const previewMode = brollMoment && thumbOf(brollMoment) ? (brollLayout === 'split' ? 'split' : 'broll') : 'video';
  // Recorte da pessoa = a MESMA conta do servidor (faceCropGeometry): cobre o quadro,
  // amplia pelo zoom e CENTRALIZA no ponto do rosto. Assim a prévia bate com o render.
  const fitMode = reframeMode === 'fit' && aspectSel !== 'original' && previewMode === 'video';
  // Tela dividida (podcast): prévia aproximada — cada metade mostra um lado do vídeo; no
  // render a IA acha o rosto de cada pessoa e recorta nele.
  const podSplit = reframeMode === 'split' && aspectSel !== 'original' && previewMode === 'video';
  const podHalfStyle = (side) => ({
    width: '100%', height: '100%', objectFit: 'cover', display: 'block',
    objectPosition: `${side * 100}% 40%`, transform: 'scale(1.9)', transformOrigin: `${side * 100}% 40%`, filter: videoFilterFx,
  });
  const personCropStyle = (() => {
    if (fitMode) return { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', filter: videoFilterFx };
    const sd = vdim || (vbox?.vw ? { w: vbox.vw, h: vbox.vh } : null);
    if (!sd || !pbox?.w || !pbox?.h) {
      return { width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${focus.x * 100}% ${focus.y * 100}%`, filter: videoFilterFx };
    }
    const g = coverCrop(sd.w, sd.h, pbox.w, pbox.h, focus, zoom);
    return { position: 'absolute', left: -g.cropX, top: -g.cropY, width: g.scaledW, height: g.scaledH, maxWidth: 'none', objectFit: 'fill', filter: videoFilterFx };
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
        <video ref={bgVideoRef} src={srcUrl} muted playsInline preload="auto" aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.12)', filter: `${videoFilter && videoFilter !== 'none' ? `${videoFilter} ` : ''}blur(9px) brightness(0.88)` }} />
      )}
      <div ref={motionWrapRef} style={{ width: '100%', height: podSplit ? '50%' : '100%', position: 'relative', overflow: 'hidden' }}>
        <video
          ref={previewVideoRef}
          src={srcUrl}
          muted playsInline preload="auto"
          style={podSplit ? podHalfStyle(splitSwap ? 0.72 : 0.28) : personCropStyle}
        />
      </div>
      {podSplit && (
        <div style={{ height: '50%', position: 'relative', overflow: 'hidden', borderTop: '2px solid rgba(0,0,0,0.6)' }}>
          <video ref={bgVideoRef} src={srcUrl} muted playsInline preload="auto" aria-hidden="true" style={podHalfStyle(splitSwap ? 0.28 : 0.72)} />
        </div>
      )}
      {guides?.where === 'pan' && <SnapGuides x={guides.x} y={guides.y} />}
      <div style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '2px 7px', borderRadius: 6 }}>
        {previewMode === 'video' ? (podSplit ? 'tela dividida · a IA recorta cada rosto' : fitMode ? 'vídeo inteiro · fundo desfocado' : aspectSel !== 'original' && reframeMode === 'auto' && framingMode !== 'manual' ? 'segue o rosto / quem fala (automático)' : 'vídeo · arraste/role') : 'você (arraste/role)'}
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
        const sx = snapCenter(Math.min(1, Math.max(0, start.fx - (ev.clientX - start.x) / box.width)), box.width);
        const sy = snapCenter(Math.min(1, Math.max(0, start.fy - (ev.clientY - start.y) / box.height)), box.height);
        setGuides({ where: 'broll', x: sx.on, y: sy.on });
        setMoment(idx, { fx: +sx.v.toFixed(3), fy: +sy.v.toFixed(3) });
      };
      const up = () => { setGuides(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    return (
      <div key="broll" onPointerDown={onDown} style={{ height: previewMode === 'split' ? '50%' : previewMode === 'broll' ? '100%' : '0%', display: previewMode === 'video' ? 'none' : 'grid', position: 'relative', overflow: 'hidden', cursor: ok ? 'grab' : 'default', placeItems: 'center', background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.02) 8px, rgba(255,255,255,0.02) 16px)', color: C.faint }}>
        {ok ? (
          <>
            <img src={th} alt="" draggable={false} onError={() => setBadThumbs((bt) => new Set(bt).add(th))} style={{ ...brollImgStyle(brollShown), position: 'absolute', inset: 0 }} />
            <span style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 9.5, fontWeight: 700, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 6, padding: '2px 6px' }}>B-roll · arraste</span>
            {guides?.where === 'broll' && <SnapGuides x={guides.x} y={guides.y} />}
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
  const showFormatPreview = framingMode === 'manual' || aspectSel !== 'original';
  // Um monitor só (como o Program do Premiere): mostra o vídeo como vai sair. O original
  // aparece ao lado só quando o usuário pede para comparar.
  const singleMon = showFormatPreview && !showSource;
  const composedPreview = (
    <div ref={composedRef} style={{ position: 'relative', width: `min(calc(var(--rf-stage-h) * ${fmtAr.toFixed(4)}), calc((100cqw - 16px) * var(--fmt-share)))`, aspectRatio: previewRatio, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, border: `1px solid ${C.border}`, background: '#000' }}>
      {personSide === 'top' ? [personHalf, brollHalf] : [brollHalf, personHalf]}
      <span className="rf-tl-pvlabel" style={{ position: 'absolute', top: 6, right: 6, zIndex: 3, pointerEvents: 'none', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: '3px 6px' }}>
        Prévia {previewLabel}{previewMode === 'split' ? ' · dividida' : previewMode === 'broll' ? ' · B-roll' : ''}
      </span>
      {/* Cor, título, efeitos e transições como saem no vídeo final (monitor único). */}
      {singleMon && cbox && lookCss.tint && <div style={{ position: 'absolute', left: cbox.x, top: cbox.y, width: cbox.w, height: cbox.h, pointerEvents: 'none', zIndex: 1, ...lookCss.tint }} />}
      {singleMon && cbox && colorCss.tint && <div style={{ position: 'absolute', left: cbox.x, top: cbox.y, width: cbox.w, height: cbox.h, pointerEvents: 'none', zIndex: 1, ...colorCss.tint }} />}
      {singleMon && cbox && <div ref={fxOverlayRef} style={{ position: 'absolute', left: cbox.x, top: cbox.y, width: cbox.w, height: cbox.h, pointerEvents: 'none', zIndex: 2, backgroundSize: 'cover' }} />}
      {singleMon && cbox && <div ref={transOverlayRef} style={{ position: 'absolute', left: cbox.x, top: cbox.y, width: cbox.w, height: cbox.h, pointerEvents: 'none', zIndex: 4, opacity: 0 }} />}
      {singleMon && cbox && headline.on && headline.text.trim() && (!headline.seconds || cur < headline.seconds) && <HeadlineOverlay h={headline} box={cbox} />}
      {/* Legenda como sai no vídeo final, por cima da prévia do formato. */}
      {cbox && <StageLayers videoRef={videoRef} box={cbox} cur={cur} media={visMedia} texts={visTexts} editable={tab === 'midias' || tab === 'texto'} selMedia={selMedia} selText={selText}
        onMedia={(key, patch) => { updateMedia(key, patch); setSelMedia(key); setSelKind('media'); }} onText={(key, patch) => { updateText(key, patch); setSelText(key); setSelKind('text'); }} />}
      {cap.captions && cbox && <CaptionOverlay videoRef={videoRef} segments={overlaySegs} options={cap} box={cbox} sample={tab === 'legenda'} editable={tab === 'legenda'} onDragPos={onCapDrag} centerWindows={capCenterWins} />}
    </div>
  );


  // Trechos que NÃO vão para o vídeo final (cortes, pausas cortadas, palavras cortadas):
  // a prévia pula por cima deles ao tocar — igual ao resultado.
  const skipRanges = (() => {
    const r = cuts.map((c) => [c.start, c.end]);
    if (preciseNow) {
      for (const p of preciseNow.pauses) r.push([p.start, p.end]);
      for (const p of preciseNow.removed) r.push([p.start, p.end]);
    } else {
      r.push(...pausesCut.map((p) => [p.start, p.end]));
      for (const seg of segments) for (const w of seg.words || []) if (w.removed) r.push([w.start, w.end]);
    }
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

  function toggleCutRange() {
    if (cutStart == null) { setCutStart(cur); return; }
    const a = Math.min(cutStart, cur);
    const b = Math.max(cutStart, cur);
    if (b - a > 0.15) setCuts((l) => [...l, { key: `c${Date.now()}`, start: +a.toFixed(2), end: +b.toFixed(2) }]);
    setCutStart(null);
  }

  // ── Transições manuais (aba Efeitos) ──
  const transDragRef = useRef(null);
  useEffect(() => {
    function move(e) {
      const d = transDragRef.current;
      if (!d) return;
      const sn = snapPoint(snapRef.current, d.t0 + (e.clientX - d.x0) / pps, d.key);
      setSnapLine(sn.line);
      const t = +Math.max(0, Math.min(dur, sn.t)).toFixed(3);
      setTransitions((l) => l.map((x) => (x.key === d.key ? { ...x, t } : x)));
    }
    function up() { if (transDragRef.current) setSnapLine(null); transDragRef.current = null; }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [pps, dur]);
  // Pontos de corte na timeline original (onde o vídeo pula ao tocar com cortes).
  const cutPoints = (skipRanges || []).map(([a]) => a).filter((a) => a > 0.3 && a < dur - 0.3);
  function addTransition(t, type = transPick) {
    if (transitions.some((x) => Math.abs(x.t - t) < 0.3)) return;
    const tr = { key: `tr${Date.now()}${Math.round(t * 100)}`, t: +t.toFixed(3), type };
    setTransitions((l) => [...l, tr].sort((a, b) => a.t - b.t));
    setSelTrans(tr.key);
    setSelKind('trans');
  }
  function addTransitionAtCuts() {
    const add = cutPoints.filter((t) => !transitions.some((x) => Math.abs(x.t - t) < 0.3)).map((t, i) => ({ key: `tr${Date.now()}_${i}`, t: +t.toFixed(3), type: transPick }));
    if (add.length) setTransitions((l) => [...l, ...add].sort((a, b) => a.t - b.t));
  }
  // ── Velocidade do trecho + congelar quadro ──
  const selSpeedItem = speedRanges.find((x) => x.key === selSpeed) || null;
  const speedTarget = selKind === 'speed' && selSpeedItem ? selSpeedItem : selKind === 'video' && selVideo ? selVideo : null;
  const speedNow = selSpeedItem && speedTarget === selSpeedItem ? selSpeedItem.speed
    : (speedTarget && speedRanges.find((r) => Math.abs(r.start - speedTarget.start) < 0.02 && Math.abs(r.end - speedTarget.end) < 0.02)?.speed) || 1;
  function setRangeSpeed(k) {
    if (!speedTarget) return;
    const a = speedTarget.start;
    const b = speedTarget.end;
    const keep = speedRanges.filter((r) => r.key !== selSpeed && (r.end <= a + 0.01 || r.start >= b - 0.01));
    if (Math.abs(k - 1) < 0.001) { setSpeedRanges(keep); setSelSpeed(null); if (selKind === 'speed') setSelKind('video'); return; }
    const key = selKind === 'speed' && selSpeed ? selSpeed : `sp${Date.now()}`;
    setSpeedRanges([...keep, { key, start: +a.toFixed(3), end: +b.toFixed(3), speed: k }].sort((x, y) => x.start - y.start));
    setSelSpeed(key);
    setSelKind('speed');
  }
  function addFreeze() {
    if (freezes.some((f) => Math.abs(f.t - cur) < 0.1)) return;
    const f = { key: `fz${Date.now()}`, t: +cur.toFixed(3), dur: freezeDur };
    setFreezes((l) => [...l, f].sort((x, y) => x.t - y.t));
    setSelFreeze(f.key);
    setSelKind('freeze');
  }
  const selFreezeItem = freezes.find((x) => x.key === selFreeze) || null;
  const speedBlock = (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Velocidade do trecho</span>
      {speedTarget ? (
        <>
          <span style={{ fontSize: 11, color: C.faint }}>{fmtDuration(speedTarget.start)} → {fmtDuration(speedTarget.end)} · fica com {fmtDuration((speedTarget.end - speedTarget.start) / speedNow)}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {RANGE_SPEEDS.map((k) => (
              <button key={k} onClick={() => setRangeSpeed(k)} style={{ ...miniBtn(Math.abs(k - speedNow) < 0.001, false), minWidth: 44 }}>{k}×</button>
            ))}
          </div>
        </>
      ) : (
        <span style={{ fontSize: 11, color: C.faint }}>Clique num pedaço da faixa V1 (divida com <b>S</b> no ponto onde começa e onde termina) para acelerar ou deixar em câmera lenta só ali.</span>
      )}
      <div style={{ height: 1, background: C.border, margin: '2px 0' }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Congelar quadro {freezes.length ? `· ${freezes.length}` : ''}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ flex: 1 }}><Sel value={String(selFreezeItem ? selFreezeItem.dur : freezeDur)} opts={FREEZE_DURS.map((d) => ({ id: String(d), label: `${d} s parado` }))}
          onChange={(v) => { const d = Number(v); if (selFreezeItem && selKind === 'freeze') setFreezes((l) => l.map((x) => (x.key === selFreezeItem.key ? { ...x, dur: d } : x))); else setFreezeDur(d); }} /></div>
        <button onClick={addFreeze} style={{ ...framingTab(false), flex: 'none' }}>❄ No playhead</button>
      </div>
      {selKind === 'freeze' && selFreezeItem && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, fontSize: 11, color: C.faint }}>Congela em {fmtDuration(selFreezeItem.t)} por {selFreezeItem.dur} s (o vídeo fica mais longo)</span>
          <button onClick={() => { setFreezes((l) => l.filter((x) => x.key !== selFreezeItem.key)); setSelFreeze(null); }} style={{ ...miniBtn(false, false), color: C.red }}>Remover</button>
        </div>
      )}
    </div>
  );
  const selTransItem = transitions.find((x) => x.key === selTrans) || null;
  const transOpts = (catalog?.transitions || []).filter((o) => o.id !== 'none');
  const transBlock = (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Transições {transitions.length ? `· ${transitions.length}` : ''}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1 }}><Sel value={transPick} opts={transOpts} onChange={setTransPick} /></div>
        <button onClick={() => addTransition(cur)} style={{ ...framingTab(false), flex: 'none' }}>+ No playhead</button>
      </div>
      {cutPoints.length > 0 && <button onClick={addTransitionAtCuts} style={{ ...framingTab(false) }}>+ Em todos os cortes ({cutPoints.length})</button>}
      {selTransItem && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1 }}><Sel value={selTransItem.type} opts={transOpts} onChange={(v) => setTransitions((l) => l.map((x) => (x.key === selTransItem.key ? { ...x, type: v } : x)))} /></div>
          <span style={{ fontSize: 11, color: C.faint }}>{fmtDuration(selTransItem.t)}</span>
          <button onClick={() => { setTransitions((l) => l.filter((x) => x.key !== selTransItem.key)); setSelTrans(null); }} style={{ ...miniBtn(false, false), color: C.red }}>Remover</button>
        </div>
      )}
      <div style={{ fontSize: 11, color: C.faint }}>Como no CapCut: cada transição fica só onde você colocou (marcador ⧓ na faixa de vídeo — arraste para mover). Nada é aplicado sozinho.</div>
    </div>
  );
  // ── Biblioteca de efeitos (como o Animation Composer no Premiere): grade com prévia ao
  // passar o mouse, categorias, busca e favoritos; ARRASTE o efeito para a timeline (entra
  // no ponto onde soltar) ou para o vídeo (entra no playhead). Clique duplo = no playhead.
  const FX_CATS = [
    { id: 'fav', label: 'Favoritos', icon: '★' },
    { id: 'trans', label: 'Transições', icon: '⧓' },
    { id: 'camera', label: 'Câmera', icon: '⤢' },
    { id: 'cor', label: 'Cor e look', icon: '◐' },
    { id: 'distorcao', label: 'Glitch e distorção', icon: '≋' },
    { id: 'luz', label: 'Luz e textura', icon: '✦' },
    { id: 'tempo', label: 'Tempo', icon: '⏱' },
    { id: 'som', label: 'Sons', icon: '♪' },
  ];
  const VFX_GROUP = { bw: 'cor', retro: 'cor', nostalgic: 'cor', cold: 'cor', warm: 'cor', saturated: 'cor', negative: 'cor', vhs: 'distorcao', glitch: 'distorcao', shake: 'distorcao', strobe: 'distorcao', pixel: 'distorcao', mirror: 'distorcao', grain: 'luz', vignette: 'luz', film: 'luz', blur: 'luz', glow: 'luz' };
  const shortLabel = (l) => String(l).replace(/\s*\(.*\)\s*$/, '');
  const fxLibrary = [
    ...transOpts.map((o) => ({ cat: 'trans', kind: 'trans', id: o.id, label: shortLabel(o.label), anim: `tr-${o.id}` })),
    ...Object.entries(MOMENT_EFFECTS).map(([id, label]) => ({ cat: 'camera', kind: 'zoom', id, label: shortLabel(label), anim: `cam-${id}` })),
    ...Object.entries(VIDEO_FX).map(([id, label]) => ({ cat: VFX_GROUP[id] || 'luz', kind: 'vfx', id, label: shortLabel(label), anim: `fx-${id}` })),
    { cat: 'tempo', kind: 'speed', id: '0.5', label: 'Câmera lenta 0,5×', anim: 'tm-slow' },
    { cat: 'tempo', kind: 'speed', id: '0.25', label: 'Super lenta 0,25×', anim: 'tm-slow' },
    { cat: 'tempo', kind: 'speed', id: '2', label: 'Acelerar 2×', anim: 'tm-fast' },
    { cat: 'tempo', kind: 'freeze', id: '1', label: 'Congelar 1 s', anim: 'tm-freeze' },
    { cat: 'tempo', kind: 'freeze', id: '2', label: 'Congelar 2 s', anim: 'tm-freeze' },
    ...(catalog?.sfxTypes || []).filter((o) => o.id !== 'none').map((o) => ({ cat: 'som', kind: 'sfx', id: o.id, label: shortLabel(o.label), anim: 'sfx' })),
  ].map((x) => ({ ...x, uid: `${x.kind}:${x.id}` }));
  const [fxCat, setFxCat] = useState('trans');
  const [fxQuery, setFxQuery] = useState('');
  const [fxFavs, setFxFavs] = useState(() => { try { return JSON.parse(localStorage.getItem('rf_fx_favs') || '[]'); } catch { return []; } });
  const toggleFav = (uid) => setFxFavs((l) => {
    const next = l.includes(uid) ? l.filter((x) => x !== uid) : [...l, uid];
    try { localStorage.setItem('rf_fx_favs', JSON.stringify(next)); } catch { /* sem armazenamento */ }
    return next;
  });
  const [dragFx, setDragFx] = useState(null); // efeito sendo arrastado
  const [dropT, setDropT] = useState(null); // onde ele vai entrar na timeline
  const [fxNote, setFxNote] = useState('');
  const fxQ = norm(fxQuery.trim());
  const fxShown = fxLibrary.filter((x) => (fxQ ? norm(x.label).includes(fxQ) : fxCat === 'fav' ? fxFavs.includes(x.uid) : x.cat === fxCat));
  /** Coloca o efeito na timeline no instante t (tempo original do vídeo). */
  function addEffectAt(item, t0) {
    const t = Math.max(0, Math.min(dur - 0.2, Number(t0) || 0));
    const end = (len) => +Math.min(dur, t + len).toFixed(2);
    if (item.kind === 'trans') {
      if (transitions.some((x) => Math.abs(x.t - t) < 0.3)) setTransitions((l) => l.map((x) => (Math.abs(x.t - t) < 0.3 ? { ...x, type: item.id } : x)));
      else addTransition(t, item.id);
    } else if (item.kind === 'zoom') {
      const z = { key: `z${Date.now()}`, start: +t.toFixed(2), end: end(1.8), scale: null, effect: item.id };
      setZoomMoments((l) => [...(l || []), z].sort((a, b) => a.start - b.start));
      if (fx.videoMotion === 'none') setFx((f) => ({ ...f, videoMotion: 'dynamic' }));
      setSelZoom(z.key);
      setSelKind('zoom');
    } else if (item.kind === 'vfx') {
      const m = { key: `f${Date.now()}`, start: +t.toFixed(2), end: end(2), effect: item.id };
      setFxMoments((l) => [...l, m].sort((a, b) => a.start - b.start));
      setSelFx(m.key);
      setSelKind('vfx');
    } else if (item.kind === 'speed') {
      const a = t;
      const b = Math.min(dur, t + 2);
      const r = { key: `sp${Date.now()}`, start: +a.toFixed(3), end: +b.toFixed(3), speed: Number(item.id) };
      setSpeedRanges((l) => [...l.filter((x) => x.end <= a + 0.01 || x.start >= b - 0.01), r].sort((x, y) => x.start - y.start));
      setSelSpeed(r.key);
      setSelKind('speed');
    } else if (item.kind === 'freeze') {
      if (freezes.some((f) => Math.abs(f.t - t) < 0.1)) return;
      const f = { key: `fz${Date.now()}`, t: +t.toFixed(3), dur: Number(item.id) };
      setFreezes((l) => [...l, f].sort((x, y) => x.t - y.t));
      setSelFreeze(f.key);
      setSelKind('freeze');
    } else if (item.kind === 'sfx') {
      setSfxMoments((l) => [...l, { key: `s${Date.now()}`, t: +t.toFixed(3), type: item.id }].sort((a, b) => a.t - b.t));
    }
    setFxNote(`${item.label} em ${fmtDuration(t)}`);
    setTimeout(() => setFxNote(''), 2200);
  }
  const fxDragOver = (e) => { if (!dragFx) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  function onTimelineDragOver(e) { if (!dragFx) return; fxDragOver(e); setDropT(timeAtClientX(e.clientX)); }
  function onTimelineDrop(e) { if (!dragFx) return; e.preventDefault(); addEffectAt(dragFx, timeAtClientX(e.clientX)); setDragFx(null); setDropT(null); }
  function onPreviewDrop(e) { if (!dragFx) return; e.preventDefault(); addEffectAt(dragFx, cur); setDragFx(null); setDropT(null); }
  const sfxAudioRef = useRef(null);
  function playSfx(id) {
    try {
      sfxAudioRef.current?.pause();
      const a = new Audio(sfxUrl(id));
      a.volume = 0.7;
      sfxAudioRef.current = a;
      a.play().catch(() => {});
    } catch { /* sem áudio */ }
  }
  const thumbFrame = { backgroundImage: `url(${filmstripUrl(sourceId)})`, backgroundSize: '12000% 100%', backgroundPosition: `${(42 / 119) * 100}% 0`, backgroundRepeat: 'no-repeat' };
  const fxBrowser = (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: 'rgba(0,0,0,0.25)' }}>
      <style>{FX_ANIM_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 0.2 }}>Efeitos</span>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 8, top: 7, color: C.faint, display: 'flex' }}><Icon name="search" size={13} strokeWidth={2} /></span>
          <input value={fxQuery} onChange={(e) => setFxQuery(e.target.value)} placeholder="Buscar efeito"
            style={{ width: '100%', boxSizing: 'border-box', height: 28, padding: '0 8px 0 27px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 12, fontFamily: 'inherit' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '128px minmax(0, 1fr)', minHeight: 230 }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', overflowX: isMobile ? 'auto' : 'visible', borderRight: isMobile ? 'none' : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : 'none', padding: 4, gap: 2 }}>
          {FX_CATS.map((c) => {
            const on = !fxQ && fxCat === c.id;
            const n = c.id === 'fav' ? fxFavs.length : fxLibrary.filter((x) => x.cat === c.id).length;
            return (
              <button key={c.id} onClick={() => { setFxCat(c.id); setFxQuery(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap', textAlign: 'left',
                  background: on ? 'rgba(255,255,255,0.1)' : 'transparent', color: on ? C.text : C.muted }}>
                <span style={{ width: 14, textAlign: 'center', color: c.id === 'fav' ? '#FACC15' : C.orangeSoft }}>{c.icon}</span>
                <span style={{ flex: 1 }}>{c.label}</span>
                <span style={{ fontSize: 10, color: C.faint }}>{n}</span>
              </button>
            );
          })}
        </div>
        <div style={{ padding: 8, overflowY: 'auto', maxHeight: isMobile ? 300 : 360 }}>
          {fxShown.length === 0 && <div style={{ fontSize: 11.5, color: C.faint, padding: 16, textAlign: 'center' }}>{fxCat === 'fav' && !fxQ ? 'Clique na ★ de um efeito para guardar aqui.' : 'Nenhum efeito encontrado.'}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8 }}>
            {fxShown.map((x) => {
              const fav = fxFavs.includes(x.uid);
              return (
                <div key={x.uid} className="rf-fxc" draggable={!isMobile}
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', x.label); e.dataTransfer.effectAllowed = 'copy'; setDragFx(x); }}
                  onDragEnd={() => { setDragFx(null); setDropT(null); }}
                  onDoubleClick={() => addEffectAt(x, cur)}
                  title={`${x.label} — arraste para a timeline ou para o vídeo · clique duplo coloca no playhead (${fmtDuration(cur)})`}
                  style={{ borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', cursor: isMobile ? 'pointer' : 'grab', overflow: 'hidden', userSelect: 'none' }}>
                  <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden', background: '#111' }}>
                    {x.kind === 'sfx' ? (
                      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, rgba(194,65,12,0.35), rgba(255,107,53,0.25))' }}>
                        <button onClick={(e) => { e.stopPropagation(); playSfx(x.id); }} aria-label={`Ouvir ${x.label}`}
                          style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon name="play" size={14} strokeWidth={2.2} /></button>
                      </div>
                    ) : (
                      <>
                        <div className={`rf-fxi a-${x.anim}`} style={{ position: 'absolute', inset: 0, ...thumbFrame, filter: x.kind === 'vfx' ? VIDEO_FX_CSS[x.id] || undefined : undefined, transform: x.id === 'mirror' ? 'scaleX(-1)' : undefined }} />
                        <div className={`rf-fxo o-${x.anim}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                        {x.kind === 'speed' || x.kind === 'freeze' ? <span style={{ position: 'absolute', right: 4, bottom: 3, fontSize: 10, fontWeight: 800, color: '#fff', textShadow: '0 1px 3px #000' }}>{x.kind === 'freeze' ? `❄ ${x.id}s` : `${x.id.replace('.', ',')}×`}</span> : null}
                      </>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); toggleFav(x.uid); }} aria-label={fav ? 'Tirar dos favoritos' : 'Favoritar'}
                      style={{ position: 'absolute', top: 2, right: 3, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: fav ? '#FACC15' : 'rgba(255,255,255,0.55)', textShadow: '0 1px 3px #000', padding: 0 }}>{fav ? '★' : '☆'}</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px' }}>
                    <span style={{ flex: 1, fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.label}</span>
                    <button onClick={(e) => { e.stopPropagation(); addEffectAt(x, cur); }} title={`Colocar no playhead (${fmtDuration(cur)})`}
                      style={{ width: 20, height: 20, borderRadius: 5, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.06)', color: C.text, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, fontFamily: 'inherit' }}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ padding: '6px 10px', borderTop: `1px solid ${C.border}`, fontSize: 10.5, color: fxNote ? C.green : C.faint, minHeight: 16 }}>
        {fxNote ? `✓ ${fxNote}` : isMobile ? 'Toque no + para colocar o efeito no ponto atual do vídeo.' : 'Passe o mouse para ver o efeito · arraste para a timeline (entra onde soltar) ou para o vídeo (entra no playhead) · ★ favorita'}
      </div>
    </div>
  );
  // Ajustes do efeito selecionado na timeline (aparece depois de soltar o efeito).
  const selFxRow = (label, range, body, onRemove) => (
    <div style={{ border: `1px solid ${C.orange}`, borderRadius: 10, padding: 10, background: 'rgba(255,107,53,0.06)', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
        <span style={{ flex: 1 }}>{label} <span style={{ color: C.faint, fontWeight: 500 }}>· {range}</span></span>
        <button onClick={onRemove} style={{ ...miniBtn(false, false), color: C.red }}>Remover</button>
      </div>
      {body}
    </div>
  );
  const fxSelPanel = selKind === 'zoom' && selZoomItem ? selFxRow('Câmera', `${fmtDuration(selZoomItem.start)} → ${fmtDuration(selZoomItem.end)}`,
    <div style={{ display: 'grid', gap: 8 }}>
      <Sel value={selZoomItem.effect || defaultMomentEffect(fx.videoMotion)} opts={Object.entries(MOMENT_EFFECTS).map(([id, label]) => ({ id, label }))}
        onChange={(v) => { setZoomMoments((l) => l.map((z) => (z.key === selZoomItem.key ? { ...z, effect: v } : z))); seek(selZoomItem.start + 0.01); }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: C.muted }}>
        <span style={{ width: 62 }}>Aproximar</span>
        <input type="range" min="1.03" max="1.5" step="0.01" value={selZoomItem.scale || MOTION_Z[fx.motionIntensity] || 1.12}
          onChange={(e) => { const v = Number(e.target.value); setZoomMoments((l) => l.map((z) => (z.key === selZoomItem.key ? { ...z, scale: v } : z))); }} style={{ flex: 1 }} />
        <span style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number(selZoomItem.scale || MOTION_Z[fx.motionIntensity] || 1.12).toFixed(2)}×</span>
      </label>
    </div>,
    () => { setZoomMoments((l) => l.filter((z) => z.key !== selZoomItem.key)); setSelZoom(null); })
    : selKind === 'vfx' && selFxItem ? selFxRow('Efeito de vídeo', `${fmtDuration(selFxItem.start)} → ${fmtDuration(selFxItem.end)}`,
    <Sel value={selFxItem.effect} opts={fxOpts} onChange={(v) => setFxMoments((l) => l.map((m) => (m.key === selFxItem.key ? { ...m, effect: v } : m)))} />,
    () => { setFxMoments((l) => l.filter((m) => m.key !== selFxItem.key)); setSelFx(null); })
    : selKind === 'trans' && selTransItem ? selFxRow('Transição', fmtDuration(selTransItem.t),
      <Sel value={selTransItem.type} opts={transOpts} onChange={(v) => setTransitions((l) => l.map((x) => (x.key === selTransItem.key ? { ...x, type: v } : x)))} />,
      () => { setTransitions((l) => l.filter((x) => x.key !== selTransItem.key)); setSelTrans(null); })
      : (selKind === 'speed' || selKind === 'freeze') ? speedBlock : null;

  // Sons da prévia: os automáticos (se ligados) e os colocados à mão, com o adiantamento de cada som.
  const leadOf = (type) => catalog?.sfxTypes?.find((o) => o.id === type)?.lead || 0;
  const liveSfxEvents = [
    ...(fx.soundEffects ? [
      ...(fx.sfxZoomType !== 'none' && fx.videoMotion !== 'none' ? (zoomMoments || []).map((z) => ({ at: z.start - leadOf(fx.sfxZoomType), type: fx.sfxZoomType })) : []),
      ...(fx.sfxBrollType !== 'none' ? (brollReview?.moments || []).filter((m) => !m.removed).map((m) => ({ at: Number(m.start) - leadOf(fx.sfxBrollType), type: fx.sfxBrollType })) : []),
      ...(fx.sfxCutType && fx.sfxCutType !== 'none' ? cutPoints.map((t) => ({ at: t - leadOf(fx.sfxCutType), type: fx.sfxCutType })) : []),
    ] : []),
    ...sfxMoments.map((m) => ({ at: m.t - leadOf(m.type), type: m.type })),
  ];

  // Largura visível da timeline → zoom que mostra o vídeo inteiro; abre já assim.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth));
    ro.observe(el);
    setTrackW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const fitPps = trackW > 0 && progDur > 0 ? Math.max(1, Math.min(PPS_MIN, +((trackW - 60) / progDur).toFixed(2))) : PPS_MIN;
  fitPpsRef.current = isMobile ? PPS_MIN : fitPps;
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || isMobile || !trackW || !(dur > 1)) return;
    fittedRef.current = true;
    setPps(Math.max(fitPps, Math.min(PPS_MAX, +((trackW - 60) / dur).toFixed(2))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackW, dur, isMobile]);
  const fitAll = () => setPps(Math.max(fitPps, Math.min(PPS_MAX, +((trackW - 60) / dur).toFixed(2))));

  // Painéis redimensionáveis (como no Premiere): arraste a divisória entre o monitor e o
  // lado direito (largura) e entre as opções e a timeline (altura). Fica salvo neste
  // navegador; clique duplo na divisória volta ao padrão.
  const [layoutSz, setLayoutSz] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('rf_editor_layout') || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  });
  const saveLayout = (patch) => setLayoutSz((cur) => {
    const next = { ...cur, ...patch };
    for (const k of Object.keys(next)) if (next[k] == null) delete next[k];
    try { localStorage.setItem('rf_editor_layout', JSON.stringify(next)); } catch { /* sem armazenamento */ }
    return next;
  });
  const splitRef = useRef(null);
  function startSplit(kind, e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const g = gridRef.current;
    const pv = g?.querySelector('.rf-tl-preview');
    const adj = g?.querySelector('.rf-tl-adjust');
    splitRef.current = { kind, x0: e.clientX, y0: e.clientY, w0: pv?.getBoundingClientRect().width || 400, h0: adj?.getBoundingClientRect().height || 320, gw: g?.getBoundingClientRect().width || 1200 };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = kind === 'col' ? 'col-resize' : 'row-resize';
  }
  useEffect(() => {
    function move(e) {
      const d = splitRef.current;
      if (!d) return;
      if (d.kind === 'col') saveLayout({ monW: Math.round(Math.max(220, Math.min(d.gw - 420, d.w0 + e.clientX - d.x0))) });
      else saveLayout({ panelH: Math.round(Math.max(120, Math.min(window.innerHeight * 0.8, d.h0 + e.clientY - d.y0))) });
    }
    function up() {
      if (!splitRef.current) return;
      splitRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.dispatchEvent(new Event('resize')); // o monitor e a timeline se ajustam ao novo tamanho
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);
  // Ajuste manual do layout (botão Layout): tamanhos prontos e +/− para o vídeo e a timeline.
  const [layoutOpen, setLayoutOpen] = useState(false);
  function layoutPreset(id) {
    const g = gridRef.current;
    const gw = g?.getBoundingClientRect().width || 1200;
    const gh = g?.getBoundingClientRect().height || window.innerHeight * 0.8;
    const adj = g?.querySelector('.rf-tl-adjust')?.getBoundingClientRect().height || 320;
    const pv = g?.querySelector('.rf-tl-preview')?.getBoundingClientRect().width || 400;
    const W = (v) => Math.round(Math.max(220, Math.min(gw - 420, v)));
    const H = (v) => Math.round(Math.max(120, Math.min(window.innerHeight * 0.8, v)));
    if (id === 'reset') saveLayout({ monW: null, panelH: null });
    else if (id === 'video') saveLayout({ monW: W(gw * 0.58), panelH: null });
    else if (id === 'timeline') saveLayout({ panelH: H(gh * 0.22) });
    else if (id === 'opcoes') saveLayout({ panelH: H(gh * 0.62) });
    else if (id === 'vid+') saveLayout({ monW: W(pv + 60) });
    else if (id === 'vid-') saveLayout({ monW: W(pv - 60) });
    else if (id === 'tl+') saveLayout({ panelH: H(adj - 50) });
    else if (id === 'tl-') saveLayout({ panelH: H(adj + 50) });
    setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
  }
  const layoutPanel = layoutOpen && createPortal(
    <div role="dialog" aria-label="Ajustar o layout" style={{ position: 'fixed', top: 64, right: 24, zIndex: 900, width: 300, padding: 14, borderRadius: 14, background: '#16161F', border: `1px solid ${C.border}`, boxShadow: '0 24px 60px -20px rgba(0,0,0,0.9)', color: C.text, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <b style={{ fontSize: 13.5 }}>Ajustar o layout</b>
        <button onClick={() => setLayoutOpen(false)} aria-label="Fechar" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.faint, fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[['video', 'Vídeo grande'], ['timeline', 'Timeline grande'], ['opcoes', 'Opções grandes'], ['reset', 'Padrão']].map(([id, label]) => (
          <button key={id} onClick={() => layoutPreset(id)} style={{ ...miniBtn(false, false), height: 34 }}>{label}</button>
        ))}
      </div>
      {[['Largura do vídeo', 'vid-', 'vid+'], ['Altura da timeline', 'tl-', 'tl+']].map(([label, minus, plus]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.muted }}>
          <span style={{ flex: 1 }}>{label}</span>
          <button onClick={() => layoutPreset(minus)} title="Diminuir" style={{ ...zoomBtn, width: 30, height: 30 }}>−</button>
          <button onClick={() => layoutPreset(plus)} title="Aumentar" style={{ ...zoomBtn, width: 30, height: 30 }}>+</button>
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
        Ou arraste as <b style={{ color: '#7DB6FF' }}>divisórias azuis</b> entre o vídeo, as opções e a timeline. A altura de cada faixa da timeline muda arrastando a borda de baixo do nome dela. Fica salvo neste computador.
      </div>
    </div>,
    document.body,
  );

  const tplPanel = tplOpen && createPortal(
    <div role="dialog" aria-label="Meus modelos" style={{ position: 'fixed', top: 64, right: 24, zIndex: 900, width: 340, maxHeight: 'calc(100vh - 90px)', overflowY: 'auto', padding: 14, borderRadius: 14, background: '#16161F', border: `1px solid ${C.border}`, boxShadow: '0 24px 60px -20px rgba(0,0,0,0.9)', color: C.text, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <b style={{ fontSize: 13.5 }}>Meus modelos</b>
        <button onClick={() => setTplOpen(false)} aria-label="Fechar" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.faint, fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>Salva o jeito que você sempre edita: estilo da legenda, mídias (ex.: seu logo), textos, cor, efeitos e voz. Depois é só aplicar em outro vídeo.</div>
      <div style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 10, border: '1px solid rgba(255,107,53,0.35)', background: 'rgba(255,107,53,0.06)' }}>
        <input value={tplName} onChange={(e) => setTplName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveTemplateNow(); }} placeholder='Nome (ex.: "Meu padrão Reels")' maxLength={60}
          style={{ height: 34, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 13, fontFamily: 'inherit' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
          <input type="checkbox" checked={tplDefault} onChange={(e) => setTplDefault(e.target.checked)} /> Usar sempre nos vídeos novos
        </label>
        <button onClick={saveTemplateNow} style={{ height: 34, borderRadius: 9, border: 'none', background: GRAD, color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>Salvar este vídeo como modelo</button>
      </div>
      {tplMsg && <div style={{ fontSize: 12, color: /salvo|aplicado/.test(tplMsg) ? '#7EE2A8' : '#FCA5B4' }}>{tplMsg}</div>}
      {templates === null ? <div style={{ fontSize: 12, color: C.faint }}>Carregando…</div> : templates.length === 0 ? (
        <div style={{ fontSize: 12, color: C.faint }}>Nenhum modelo ainda.</div>
      ) : templates.map((t) => (
        <div key={t.id} style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 10, border: `1px solid ${t.isDefault ? 'rgba(251,191,36,0.5)' : C.border}`, background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <b style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</b>
            {t.isDefault && <span style={{ fontSize: 10.5, color: '#FBBF24', fontWeight: 700 }}>★ padrão</span>}
          </div>
          <div style={{ fontSize: 11, color: C.faint }}>
            {[t.data?.cap ? 'legenda' : null, t.data?.media?.length ? `${t.data.media.length} mídia(s)` : null, t.data?.textLayers?.length ? `${t.data.textLayers.length} texto(s)` : null, t.data?.colorLook && t.data.colorLook !== 'auto' ? 'cor' : null].filter(Boolean).join(' · ') || 'estilo'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => applyTemplate(t)} style={{ ...miniBtn(true, false), flex: 1, height: 30 }}>Aplicar</button>
            <button onClick={() => toggleDefault(t)} title={t.isDefault ? 'Deixar de usar nos vídeos novos' : 'Usar sempre nos vídeos novos'} style={{ ...miniBtn(false, false), height: 30 }}>{t.isDefault ? '☆ Tirar padrão' : '★ Padrão'}</button>
            <button onClick={() => removeTemplate(t)} style={{ ...miniBtn(false, false), height: 30, color: C.red }}>Apagar</button>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );

  const splitter = (kind) => (
    <div className={`rf-split rf-split--${kind}`} onMouseDown={(e) => startSplit(kind, e)}
      onDoubleClick={() => { saveLayout(kind === 'col' ? { monW: null } : { panelH: null }); setTimeout(() => window.dispatchEvent(new Event('resize')), 0); }}
      title={kind === 'col' ? 'Arraste para mudar a largura do monitor · clique duplo volta ao padrão' : 'Arraste para mudar a altura do painel e da timeline · clique duplo volta ao padrão'}>
      <span />
    </div>
  );

  // Proporção do monitor visível (um monitor só); comparando com o original, a coluna é livre.
  const monAr = showFormatPreview ? (showSource ? 0 : +fmtAr.toFixed(4)) : +mainAr.toFixed(4);
  const monArRef = useRef(monAr);
  monArRef.current = monAr;
  // Computador: o player tem a altura que sobra na janela depois da timeline (tudo cabe
  // na tela, sem espaço vazio). Player G continua grande (rola a página).
  const gridRef = useRef(null);
  const bottomRef = useRef(null);
  useEffect(() => {
    const g = gridRef.current;
    const b = bottomRef.current;
    if (!g || !b) return undefined;
    function fit() {
      if (isMobile || window.innerWidth <= 860) { g.style.removeProperty('--rf-stage-h'); g.style.removeProperty('--rf-app-h'); return; }
      if (window.innerWidth > 1100) {
        // Tela grande (como o Premiere): o editor ocupa a janela inteira, sem rolar a página.
        // O monitor preenche a coluna da esquerda; a timeline rola por dentro.
        const top0 = g.getBoundingClientRect().top + window.scrollY;
        // desconta o que fica abaixo da grade (borda do cartão e margem da página)
        const card = g.closest('.rf-tl-card');
        const page = g.closest('.rf-page');
        const below = (card ? parseFloat(getComputedStyle(card).paddingBottom) + 2 : 12) + (page ? parseFloat(getComputedStyle(page).paddingBottom) : 0);
        const app = Math.max(560, Math.round(window.innerHeight - top0 - below));
        g.style.setProperty('--rf-app-h', `${app}px`);
        const bar = g.querySelector('.rf-tl-bar');
        const barH = bar ? bar.offsetHeight + 8 : 80;
        const mon = Math.max(200, app - barH - 16);
        const stageH = Math.round(stage === 's' ? mon * 0.78 : mon);
        g.style.setProperty('--rf-stage-h', `${stageH}px`);
        // a coluna do monitor fica do tamanho do vídeo (preenche, sem faixas vazias)
        const ar = monArRef.current;
        if (ar) {
          const gw = g.getBoundingClientRect().width;
          const w = Math.round(Math.max(280, Math.min(gw * 0.62, stageH * ar + 14)));
          g.style.setProperty('--rf-mon-auto', `${w}px`);
        } else g.style.removeProperty('--rf-mon-auto');
        return;
      }
      g.style.removeProperty('--rf-app-h');
      if (stage === 'l') { g.style.removeProperty('--rf-stage-h'); return; }
      // só a timeline (barra + faixas + zoom); o resumo e a edição de palavras ficam abaixo
      const top = g.getBoundingClientRect().top + window.scrollY;
      // notebook/tablet: só a timeline (barra + faixas + zoom) fica embaixo do monitor
      const tr = b.querySelector('.rf-tl-track');
      const tlH = tr ? tr.getBoundingClientRect().bottom - b.getBoundingClientRect().top + 52 : b.offsetHeight;
      const free = window.innerHeight - top - tlH - 10 - 82 - 16;
      const h = Math.max(stage === 's' ? 160 : 220, Math.min(900, free * (stage === 's' ? 0.78 : 1)));
      g.style.setProperty('--rf-stage-h', `${Math.round(h)}px`);
    }
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(b.querySelector('.rf-tl-track') || b);
    window.addEventListener('resize', fit);
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit); };
  }, [isMobile, stage, monAr]);

  // Pontos onde os blocos encaixam (ímã): playhead, começo/fim, marcadores, cortes e as
  // pontas de tudo que está na timeline.
  snapRef.current = {
    on: snapOn,
    pps,
    pts: [
      { t: cur, key: '·playhead' }, { t: 0 }, { t: dur },
      ...markers.map((m) => ({ t: m.t, key: m.key })),
      ...transitions.map((x) => ({ t: x.t, key: x.key })),
      ...cuts.flatMap((c) => [{ t: c.start }, { t: c.end }]),
      ...[...media.map((m) => ({ key: m.key, start: m.start, end: m.start + m.duration })), ...textLayers, ...extraCaps, ...fxMoments, ...(zoomMoments || []), ...(brollReview?.moments || []), ...gains]
        .flatMap((r) => [{ t: Number(r.start), key: r.key }, { t: Number(r.end), key: r.key }]),
      ...capSegments.flatMap((sg) => [{ t: sg.start }, { t: sg.end }]),
    ].filter((p) => Number.isFinite(p.t)),
  };
  function toggleSnap() {
    setSnapOn((v) => { try { localStorage.setItem('rf_snap', v ? '0' : '1'); } catch { /* ignora */ } return !v; });
  }
  // Marcador no playhead (M): se já houver um ali, tira.
  function toggleMarker() {
    const near = markers.find((m) => Math.abs(m.t - cur) < 0.08);
    if (near) { setMarkers((l) => l.filter((x) => x.key !== near.key)); if (selMarker === near.key) setSelMarker(null); return; }
    const mk = { key: `mk${Date.now()}`, t: +cur.toFixed(3) };
    setMarkers((l) => [...l, mk].sort((a, b) => a.t - b.t));
  }
  // Copiar / colar / duplicar (como no CapCut): mídias, textos, efeitos, transições e
  // legendas (copiar uma legenda da fala cola uma legenda sua com o mesmo texto).
  function selClip() {
    if (selKind === 'xcap') { const it = extraCaps.find((x) => x.key === selXcap); return it && { kind: 'xcap', items: [it] }; }
    if (selKind === 'caption') {
      const items = selCaptions.map((i) => {
        const d = capSegments[i];
        const text = (segments[i]?.words || []).map((w) => String(w.word ?? '').trim()).filter(Boolean).join(' ');
        if (!d || !text) return null;
        const [a, b] = capRangeOf(d);
        return { text, start: a, end: Math.max(b, a + 0.5) };
      }).filter(Boolean);
      return items.length ? { kind: 'xcap', items } : null;
    }
    if (selKind === 'media') { const it = media.find((x) => x.key === selMedia); return it && { kind: 'media', item: it }; }
    if (selKind === 'text') { const it = textLayers.find((x) => x.key === selText); return it && { kind: 'text', item: it }; }
    if (selKind === 'vfx') { const it = fxMoments.find((x) => x.key === selFx); return it && { kind: 'vfx', item: it }; }
    if (selKind === 'trans') { const it = transitions.find((x) => x.key === selTrans); return it && { kind: 'trans', item: it }; }
    return null;
  }
  function copySel() {
    const c = selClip();
    if (c) { clipRef.current = c; setHasClip(true); }
    return !!c;
  }
  function pasteClip(c, at) {
    if (!c) return false;
    const key = `${c.kind}${Date.now()}${Math.floor(Math.random() * 1e4)}`;
    const it = c.item;
    if (c.kind === 'xcap') {
      const base = c.items[0].start;
      const made = c.items.map((x, i) => {
        const start = +Math.max(0, Math.min(at + (x.start - base), dur - 0.3)).toFixed(2);
        return { key: `${key}_${i}`, text: x.text, start, end: +Math.min(dur, start + Math.max(0.5, x.end - x.start)).toFixed(2) };
      });
      setExtraCaps((l) => [...l, ...made].sort((a, b) => a.start - b.start));
      setSelXcap(made[0].key);
      setSelKind('xcap');
      showXcaps();
      return true;
    }
    if (c.kind === 'media') {
      const start = +Math.max(0, Math.min(at, dur - 0.3)).toFixed(2);
      const duration = +Math.min(Number(it.duration), dur - start).toFixed(2);
      setMedia((l) => {
        const lay = it.layer || 0;
        const clash = l.some((x) => (x.layer || 0) === lay && x.start < start + duration && x.start + x.duration > start);
        const top = l.reduce((mx, x) => Math.max(mx, x.layer || 0), 0);
        return normalizeLayers([...l, { ...it, key, start, duration, layer: clash ? top + 1 : lay }]);
      });
      setSelMedia(key);
      setSelKind('media');
    } else if (c.kind === 'text' || c.kind === 'vfx') {
      const len = it.end - it.start;
      const start = +Math.max(0, Math.min(at, dur - 0.3)).toFixed(2);
      const next = { ...it, key, start, end: +Math.min(dur, start + len).toFixed(2) };
      if (c.kind === 'text') { setTextLayers((l) => [...l, next]); setSelText(key); setSelKind('text'); }
      else { setFxMoments((l) => [...l, next]); setSelFx(key); setSelKind('vfx'); }
    } else if (c.kind === 'trans') {
      const t = +Math.max(0, Math.min(dur, at)).toFixed(3);
      if (transitions.some((x) => Math.abs(x.t - t) < 0.3)) return false;
      setTransitions((l) => [...l, { ...it, key, t }].sort((a, b) => a.t - b.t));
      setSelTrans(key);
      setSelKind('trans');
    }
    return true;
  }
  function pasteAtPlayhead() { return pasteClip(clipRef.current, cur); }
  function duplicateSel() {
    const c = selClip();
    if (!c) return false;
    if (c.kind === 'xcap') return pasteClip(c, c.items[c.items.length - 1].end);
    const it = c.item;
    const at = c.kind === 'media' ? it.start + it.duration : c.kind === 'trans' ? it.t + 1 : it.end;
    return pasteClip(c, at);
  }

  // Dados usados pela prévia ao vivo (lidos pelo laço do player).
  const liveWindows = fx.videoMotion !== 'none' ? (zoomMoments || []).map((z) => [z.start, z.end, z.scale, z.effect || defaultMomentEffect(fx.videoMotion)]) : [];
  liveRef.current = {
    skip: previewCuts ? skipRanges : [],
    fx,
    dur,
    windows: liveWindows,
    keys: transformKeys,
    trans: transitions,
    speedRanges,
    freezes,
    gSpeed: speed,
    fxMoments: visFx,
    sfxEvents: liveSfxEvents,
    audio: { audioMute, audioVolume, gains },
    sfxTimes: [
      ...liveWindows.map(([a]) => Math.max(0, a - 0.3)),
      ...((brollReview?.moments || []).filter((m) => !m.removed).map((m) => Math.max(0, Number(m.start) - 0.3))),
    ],
  };

  // Blocos da faixa de legenda: os mesmos "cartões" que aparecem no vídeo (linhas e
  // caracteres por linha da legenda), cada um no seu tempo — como a faixa de texto do CapCut.
  function capCards(s, gone) {
    const ws = (s.words || []).filter((w) => gone || !w.removed);
    if (!ws.length) return [];
    const cards = layoutCaption(ws.map((w) => ({ ...w })), { lines: cap.captionLines === 1 ? 1 : 2, maxChars: cap.captionMaxChars > 0 ? cap.captionMaxChars : 18, segEnd: s.end });
    return cards.map((c) => ({ start: Math.max(s.start, c.words[0].start), end: Math.min(Math.max(s.end, s.start + 0.2), c.end), text: c.words.map((w) => w.word).join(' ') }));
  }

  // "Criar legendas" como no Premiere: layout (uma linha / duas linhas / palavra única),
  // máximo de caracteres, duração mínima, intervalo entre legendas e remover pontuação.
  const capLayout = cap.captionMode === 'word' ? 'word' : cap.captionMode === 'phrase' ? (cap.captionLines === 1 ? 'one' : 'two') : 'auto';
  const CAP_LAYOUTS = [
    { id: 'auto', label: 'Do modelo', patch: { captionMode: 'auto' } },
    { id: 'one', label: 'Uma linha', patch: { captionMode: 'phrase', captionLines: 1 } },
    { id: 'two', label: 'Duas linhas', patch: { captionMode: 'phrase', captionLines: 2 } },
    { id: 'word', label: 'Palavra única', patch: { captionMode: 'word' } },
  ];
  const gapFrames = Math.round((cap.captionGap || 0) * 30);
  const capCreateRows = (
    <>
      <CapRow label="Layout">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          {CAP_LAYOUTS.map((o) => <button key={o.id} onClick={() => setCapField(o.patch)} style={{ ...miniBtn(capLayout === o.id, false), justifyContent: 'center', minHeight: isMobile ? 36 : undefined }}>{o.label}</button>)}
        </div>
      </CapRow>
      {capLayout !== 'word' && (
        <>
          <CapRow label={`Máximo de caracteres por linha (${cap.captionMaxChars > 0 ? cap.captionMaxChars : 'automático'})`}>
            <input type="range" min="7" max="42" step="1" value={cap.captionMaxChars > 0 ? cap.captionMaxChars : 7} onChange={(e) => { const v = Number(e.target.value); setCapField({ captionMaxChars: v <= 7 ? 0 : v }); }} style={{ width: '100%' }} />
          </CapRow>
          <CapRow label={`Duração mínima na tela (${cap.captionMinDuration > 0 ? `${String(cap.captionMinDuration).replace('.', ',')} s` : 'desligada'})`}>
            <input type="range" min="0" max="5" step="0.5" value={cap.captionMinDuration || 0} onChange={(e) => setCapField({ captionMinDuration: Number(e.target.value) })} style={{ width: '100%' }} />
          </CapRow>
          <CapRow label={`Intervalo entre legendas (${gapFrames ? `${gapFrames} ${gapFrames === 1 ? 'quadro' : 'quadros'}` : 'sem intervalo'})`}>
            <input type="range" min="0" max="15" step="1" value={gapFrames} onChange={(e) => setCapField({ captionGap: +(Number(e.target.value) / 30).toFixed(3) })} style={{ width: '100%' }} />
          </CapRow>
        </>
      )}
      <CapRow label="Remover pontuação">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch on={cap.captionNoPunct === true} onChange={(v) => setCapField({ captionNoPunct: v })} />
          <span style={{ fontSize: 11.5, color: C.muted }}>{cap.captionNoPunct ? 'Sem vírgulas, pontos e aspas na legenda' : 'Pontuação como foi falada'}</span>
        </div>
      </CapRow>
    </>
  );

  // ── Transcrição (como o painel Text › Transcript do Premiere): o texto do vídeo em
  // parágrafos com o tempo de cada um. Clique numa palavra = vai até ela; arrastar sobre as
  // palavras seleciona (Delete corta vídeo, áudio e legenda); duplo-clique edita a frase.
  const txWords = useMemo(() => {
    const out = [];
    segments.forEach((sg, si) => sg.words.forEach((w, wi) => {
      if (String(w.word ?? '').trim()) out.push({ si, wi, w, cut: !!capSegments[si]?.words[wi]?.inCut });
    }));
    return out;
  }, [segments, capSegments]);
  const txParas = useMemo(() => {
    // parágrafo novo numa pausa longa (≥ 1,2 s) ou a cada ~6 frases / 30 s
    const paras = [];
    let curP = null;
    let prevEnd = -1;
    txWords.forEach((x, i) => {
      const newSeg = i === 0 || txWords[i - 1].si !== x.si;
      const brk = !curP || (newSeg && (x.w.start - prevEnd >= 1.2 || curP.segs >= 6 || x.w.start - curP.start >= 30));
      if (brk) { curP = { start: x.w.start, from: i, to: i, segs: 1 }; paras.push(curP); } else if (newSeg) curP.segs += 1;
      curP.to = i;
      prevEnd = x.w.end;
    });
    return paras;
  }, [txWords]);
  const [txQuery, setTxQuery] = useState('');
  const [txCopied, setTxCopied] = useState(false);
  const [txEdit, setTxEdit] = useState(null); // índice da frase em edição
  const txDragRef = useRef(null);
  const txListRef = useRef(null);
  useEffect(() => { setTxSel(null); }, [txWords.length]);
  useEffect(() => {
    const up = () => { txDragRef.current = null; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
  function txSelect(a, b) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    setTxSel({ a, b });
    setRange({ a: +txWords[lo].w.start.toFixed(2), b: +txWords[hi].w.end.toFixed(2) });
    setSelKind('words');
  }
  function txDown(i, e) {
    if (e.button !== 0) return;
    if (e.shiftKey && txSel) { txSelect(txSel.a, i); e.preventDefault(); return; }
    txDragRef.current = { a: i, moved: false };
  }
  function txEnter(i) {
    const d = txDragRef.current;
    if (!d || i === d.a && !d.moved) return;
    d.moved = true;
    window.getSelection?.()?.removeAllRanges?.();
    txSelect(d.a, i);
  }
  function txClick(i, e) {
    if (e.shiftKey) return;
    if (txDragRef.current?.moved) return;
    const x = txWords[i];
    setTxSel(null);
    if (selKind === 'words') { setRange(null); setSelKind('caption'); }
    setSel(x.si);
    seek(x.w.start + 0.01);
  }
  const txActive = useMemo(() => {
    let k = -1;
    for (let i = 0; i < txWords.length; i++) { if (txWords[i].w.start <= cur + 0.01) k = i; else break; }
    return k >= 0 && cur < (txWords[k + 1]?.w.start ?? Infinity) && cur <= txWords[k].w.end + 0.6 ? k : -1;
  }, [txWords, cur]);
  // acompanha a fala tocando (rola até o parágrafo da palavra falada)
  useEffect(() => {
    const box = txListRef.current;
    if (!box || txActive < 0 || !playing) return;
    const el = box.querySelector(`[data-tx="${txActive}"]`);
    if (!el) return;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop + 10 || top > box.scrollTop + box.clientHeight - 30) box.scrollTop = Math.max(0, top - box.clientHeight / 3);
  }, [txActive, playing]);
  const txQ = norm(txQuery.trim());
  const txHits = txQ ? txWords.reduce((n, x) => n + (norm(x.w.word).includes(txQ) ? 1 : 0), 0) : 0;
  const txText = () => txParas.map((p) => `${tcode(p.start)}\n${txWords.slice(p.from, p.to + 1).filter((x) => !x.w.removed && !x.cut).map((x) => x.w.word).join(' ')}`).join('\n\n');
  function copyTranscript() {
    const text = txText();
    navigator.clipboard?.writeText(text).then(() => { setTxCopied(true); setTimeout(() => setTxCopied(false), 1500); }, () => {});
  }
  function downloadTranscript() {
    const blob = new Blob([txText()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(projectTitle || 'transcricao').replace(/[^\w\-À-ú ]+/g, '').trim() || 'transcricao'}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const txSelLo = txSel ? Math.min(txSel.a, txSel.b) : -1;
  const txSelHi = txSel ? Math.max(txSel.a, txSel.b) : -1;
  const transcriptPane = (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <span style={{ position: 'absolute', left: 9, top: 9, color: C.faint, display: 'flex' }}><Icon name="search" size={14} strokeWidth={2} /></span>
          <input value={txQuery} onChange={(e) => setTxQuery(e.target.value)} placeholder="Buscar na transcrição"
            style={{ width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px 0 30px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 12.5, fontFamily: 'inherit' }} />
          {txQ && <span style={{ position: 'absolute', right: 9, top: 8, fontSize: 11, color: C.faint }}>{txHits}</span>}
        </div>
        <button onClick={copyTranscript} title="Copiar o texto" style={{ ...zoomBtn, width: 'auto', height: 32, padding: '0 9px', fontSize: 11.5, fontWeight: 600, color: txCopied ? C.green : C.text }}>{txCopied ? 'Copiado' : 'Copiar'}</button>
        <button onClick={downloadTranscript} title="Baixar a transcrição (.txt)" style={{ ...zoomBtn, width: 32, height: 32 }}><Icon name="download" size={14} strokeWidth={2} /></button>
      </div>
      <div ref={txListRef} style={{ position: 'relative', maxHeight: isMobile ? '44dvh' : 'min(46vh, 420px)', minHeight: 140, overflowY: 'auto', borderRadius: 11, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.3)', padding: '4px 12px', userSelect: 'none' }}>
        {txParas.length === 0 && <div style={{ fontSize: 12, color: C.faint, padding: 14, textAlign: 'center' }}>Sem fala transcrita neste vídeo.</div>}
        {txParas.map((p, pi) => {
          const items = txWords.slice(p.from, p.to + 1);
          const segIds = [...new Set(items.map((x) => x.si))];
          return (
            <div key={pi} style={{ padding: '10px 0', borderBottom: pi < txParas.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(194,65,12,0.35)', display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 800, color: '#E9D5FF' }}>{pi + 1}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>Trecho {pi + 1}</span>
                <button onClick={() => { seek(p.start + 0.01); setSel(items[0].si); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: C.faint, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }}>{tcode(p.start)}</button>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                {segIds.map((si) => (txEdit === si ? (
                  <textarea key={`e${si}`} autoFocus rows={2} defaultValue={segments[si].words.filter((w) => !w.removed).map((w) => w.word).join(' ')}
                    onBlur={(e) => { setPhraseText(si, e.target.value); setTxEdit(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') setTxEdit(null); }}
                    style={{ display: 'block', width: '100%', boxSizing: 'border-box', margin: '4px 0', padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.orange}`, background: 'rgba(0,0,0,0.5)', color: C.text, fontSize: 13.5, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical', userSelect: 'text' }} />
                ) : (
                  <span key={si} onDoubleClick={() => { setTxSel(null); setTxEdit(si); }}>
                    {items.map((x, k) => {
                      if (x.si !== si) return null;
                      const i = p.from + k;
                      const gone = x.w.removed || x.cut;
                      const selOn = i >= txSelLo && i <= txSelHi;
                      const live = i === txActive;
                      const hit = txQ && norm(x.w.word).includes(txQ);
                      return (
                        <span key={i} data-tx={i} onMouseDown={(e) => txDown(i, e)} onMouseEnter={() => txEnter(i)} onClick={(e) => txClick(i, e)}
                          title={gone ? 'Cortada do vídeo — selecione e Delete para voltar' : undefined}
                          style={{ cursor: 'pointer', borderRadius: 3, padding: '1px 0', color: gone ? 'rgba(240,82,107,0.75)' : live ? '#fff' : C.text,
                            textDecoration: gone ? 'line-through' : 'none', opacity: gone ? 0.7 : 1,
                            background: selOn ? 'rgba(59,130,246,0.45)' : live ? 'rgba(255,107,53,0.55)' : hit ? 'rgba(250,204,21,0.35)' : 'transparent' }}>
                          {x.w.word}{' '}
                        </span>
                      );
                    })}
                  </span>
                )))}
              </div>
            </div>
          );
        })}
      </div>
      {txSel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: '#BFDBFE' }}>{txSelHi - txSelLo + 1} {txSelHi === txSelLo ? 'palavra selecionada' : 'palavras selecionadas'}</span>
          <button onClick={deleteSelected} style={{ ...miniBtn(true, false), marginLeft: 'auto' }}>
            <Icon name="trash" size={12} strokeWidth={2} /> {txWords.slice(txSelLo, txSelHi + 1).every((x) => x.w.removed) ? 'Restaurar' : 'Cortar do vídeo'}
          </button>
          <button onClick={clearRange} style={miniBtn(false, false)}>Cancelar</button>
        </div>
      )}
      <div className="rf-tl-hide-touch" style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>Clique numa palavra para ir · arraste sobre as palavras para selecionar (<b>Delete</b> corta vídeo, áudio e legenda) · duplo-clique edita a frase</div>
      <button onClick={() => { if (!cap.captions) setCapField({ captions: true }); setCapPane('estilo'); }}
        style={{ ...toolBtn(false), justifyContent: 'center', background: 'rgba(255,107,53,0.14)', border: '1px solid rgba(255,107,53,0.45)', color: C.text }}>
        <Icon name="captions" size={14} strokeWidth={2} /> Criar legendas
      </button>
    </div>
  );

  // Trecho selecionado (palavras clicáveis, juntar, editar, cortar): embaixo da timeline em
  // telas menores; em tela grande fica no painel Legenda › Legendas (timeline mais limpa).
  const trechoBlock = selSeg ? (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: 0.4 }}>
                  {selCaptions.length > 1 ? `${selCaptions.length} BLOCOS SELECIONADOS` : `TRECHO ${sel + 1}/${segments.length} · ${fmtDuration(selSeg.start)}`}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => { setSelKind('caption'); setSelSet(new Set(segments.map((_, i) => i))); }} style={miniBtn(false, false)}>Selecionar todas</button>
                  <button onClick={mergeSelected} disabled={selCaptions.length < 2 && sel >= segments.length - 1} style={miniBtn(false, selCaptions.length < 2 && sel >= segments.length - 1)}>
                    <Icon name="arrowLeft" size={12} strokeWidth={2.2} style={{ transform: 'rotate(180deg)' }} /> Juntar
                  </button>
                  {selCaptions.length === 1 && (
                    <button onClick={() => setEditText(editText == null ? selSeg.words.filter((w) => !w.removed).map((w) => w.word).join(' ') : null)} disabled={segRemoved(selSeg)} style={miniBtn(editText != null, segRemoved(selSeg))}>
                      <Icon name="edit" size={12} strokeWidth={2.2} /> Editar texto
                    </button>
                  )}
                  {(() => {
                    const allHidden = selCaptions.every((i) => segHidden(segments[i]));
                    return (
                      <button onClick={() => setCaptionsHidden(!allHidden)} style={miniBtn(allHidden)} title="Esconde só o texto: a fala continua no vídeo">
                        <Icon name={allHidden ? 'eye' : 'eyeOff'} size={12} strokeWidth={2.2} /> {allHidden ? 'Mostrar legenda' : 'Ocultar legenda'}
                      </button>
                    );
                  })()}
                  {(() => {
                    const allCut = selCaptions.every((i) => segRemoved(segments[i]));
                    return (
                      <button onClick={() => setCaptionsCut(!allCut)} style={miniBtn(allCut)} title="Corta a fala destes blocos do vídeo">
                        <Icon name={allCut ? 'undo' : 'scissors'} size={12} strokeWidth={2.2} /> {allCut ? 'Reincluir' : 'Cortar trecho'}
                      </button>
                    );
                  })()}
                </div>
              </div>
              {editText != null && selCaptions.length === 1 && (
                <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                  <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditText(); } if (e.key === 'Escape') setEditText(null); }}
                    style={{ width: '100%', boxSizing: 'border-box', background: '#13131B', color: C.text, border: `1px solid ${C.orange}`, borderRadius: 9, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button onClick={saveEditText} style={miniBtn(true, false)}><Icon name="check" size={12} strokeWidth={2.2} /> Salvar texto</button>
                    <button onClick={() => setEditText(null)} style={miniBtn(false, false)}>Cancelar</button>
                    <span style={{ fontSize: 11, color: C.faint }}>Muda só o que aparece na legenda, no mesmo tempo da fala.</span>
                  </div>
                </div>
              )}
              <div style={{ lineHeight: 1.7, fontSize: 13 }}>
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
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4 }}>Clique numa palavra para cortá-la · duplo-clique para corrigir só ela · arraste as bordas do bloco na timeline · Ctrl/Shift+clique nos blocos seleciona vários · S divide · <b>Delete</b> corta o trecho (vídeo, áudio e legenda) · <b>H</b> só oculta a legenda</div>
            </div>
  ) : null;

  // Espaçamento das letras, sombra e legenda no meio na tela dividida (aba Legenda).
  const capFxRows = (
    <>
      <CapRow label={`Espaçamento das letras (${cap.captionSpacing > 0 ? '+' : ''}${Math.round((cap.captionSpacing || 0) * 100)})`}>
        <input type="range" min="-0.05" max="0.3" step="0.01" value={cap.captionSpacing || 0} onChange={(e) => setCapField({ captionSpacing: Number(e.target.value) })} style={{ width: '100%' }} />
      </CapRow>
      <CapRow label="Sombra das letras">
        <div style={{ display: 'flex', gap: 6 }}>
          {[['auto', 'Do estilo'], ['off', 'Sem sombra'], ['on', 'Personalizada']].map(([id, label]) => (
            <button key={id} onClick={() => setCapField({ captionShadow: id })} style={{ ...miniBtn(cap.captionShadow === id, false), flex: 1, minHeight: 34 }}>{label}</button>
          ))}
        </div>
      </CapRow>
      {cap.captionShadow === 'on' && (
        <>
          <CapRow label={`Distância da sombra (${Math.round((cap.captionShadowSize || 1) * 100)}%)`}>
            <input type="range" min="0.3" max="3" step="0.1" value={cap.captionShadowSize || 1} onChange={(e) => setCapField({ captionShadowSize: Number(e.target.value) })} style={{ width: '100%' }} />
          </CapRow>
          <CapRow label={`Intensidade da sombra (${Math.round((cap.captionShadowOpacity || 0.6) * 100)}%)`}>
            <input type="range" min="0.1" max="1" step="0.05" value={cap.captionShadowOpacity || 0.6} onChange={(e) => setCapField({ captionShadowOpacity: Number(e.target.value) })} style={{ width: '100%' }} />
          </CapRow>
        </>
      )}
      <CapRow label="Na tela dividida do B-roll">
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setCapField({ captionBrollCenter: true })} style={{ ...miniBtn(cap.captionBrollCenter !== false, false), flex: 1, minHeight: 34 }}>Legenda no meio</button>
          <button onClick={() => setCapField({ captionBrollCenter: false })} style={{ ...miniBtn(cap.captionBrollCenter === false, false), flex: 1, minHeight: 34 }}>Posição normal</button>
        </div>
      </CapRow>
    </>
  );

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
      {tour && !isMobile && <EditorTour onClose={() => setTour(false)} />}
      {!isMobile && layoutPanel}
      {tplPanel}
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
      <input ref={relinkRef} type="file" accept="image/*,video/*,audio/*" style={{ display: 'none' }} onChange={onRelinkFile} />
      <input ref={srcRelinkRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={onRelinkSource} />
      {(srcOffline || media.some((m) => m.offline)) && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(240,82,107,0.14)', border: `1px solid ${C.red}`, fontSize: 13 }}>
          <Icon name="alert" size={16} strokeWidth={2} />
          <span style={{ flex: 1, minWidth: 200 }}>
            {srcOffline ? 'O vídeo deste projeto está offline (o arquivo foi apagado, movido ou expirou). ' : ''}
            {media.some((m) => m.offline) ? `${media.filter((m) => m.offline).length} arquivo(s) do projeto offline: ${media.filter((m) => m.offline).map((m) => m.filename).join(', ')}. ` : ''}
            Localize o arquivo para continuar — o resto do projeto está salvo.
            {relinkErr ? ` (${relinkErr})` : ''}
          </span>
          {srcOffline && <button onClick={() => srcRelinkRef.current?.click()} style={{ height: 32, padding: '0 14px', borderRadius: 9, border: 'none', background: GRAD, color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>Localizar vídeo</button>}
          {media.filter((m) => m.offline).slice(0, 3).map((m) => (
            <button key={m.key} onClick={() => askRelink(m.key)} style={{ height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 600, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>Localizar {m.filename}</button>
          ))}
        </div>
      )}
      {recover && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(194,65,12,0.16)', border: '1px solid rgba(194,65,12,0.45)', fontSize: 13 }}>
          <Icon name="undo" size={16} strokeWidth={2} />
          <span style={{ flex: 1, minWidth: 180 }}>Há edições deste projeto que não foram exportadas (salvas {new Date(recover.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}).</span>
          <button onClick={recoverEdits} style={{ height: 32, padding: '0 14px', borderRadius: 9, border: 'none', background: GRAD, color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>Recuperar</button>
          <button onClick={discardRecovery} style={{ height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>Descartar</button>
        </div>
      )}
      <div className="rf-tl-head" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,107,53,0.14)', color: C.orangeSoft }}><Icon name="film" size={18} strokeWidth={1.9} /></span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16.5, letterSpacing: -0.2 }}>Editor de vídeo</div>
          <div className="rf-tl-hide-sm" style={{ fontSize: 11.5, color: C.faint }}>Corte, legende e ajuste antes de exportar · {APP_VERSION}{cloudSavedAt ? ` · projeto salvo às ${new Date(cloudSavedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : savedAt ? ' · alterações salvas neste navegador' : ''}{cloudErr ? ' · não deu para salvar na conta agora (tenta de novo em 30 s)' : ''}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <GhostButton onClick={() => setTplOpen((v) => !v)} title="Meus modelos" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ★ <span className="rf-tl-hide-sm">Modelos</span>
          </GhostButton>
          <GhostButton onClick={() => setTour(true)} title="Guia rápido: mostra para que serve cada parte do editor" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ? <span className="rf-tl-hide-sm">Guia rápido</span>
          </GhostButton>
          <GhostButton onClick={onBack} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="arrowLeft" size={14} strokeWidth={2} /> Voltar
          </GhostButton>
          <button data-tour="export" onClick={generate} disabled={busy || allGone} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 11, padding: '0 18px', minHeight: 40, background: busy || allGone ? 'rgba(255,255,255,0.08)' : GRAD, color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy || allGone ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: busy || allGone ? 'none' : '0 10px 24px -10px rgba(255,107,53,0.7)' }}>
            <Icon name="upload" size={15} strokeWidth={2.2} /> Exportar
          </button>
        </div>
      </div>

      <div ref={gridRef} className={`rf-tl-grid rf-stage-${stage}${(showFormatPreview && !showSource ? fmtAr : mainAr) < 1 ? ' rf-mon-v' : ''}${layoutSz.monW ? ' rf-custom-col' : ''}${layoutSz.panelH ? ' rf-custom-row' : ''}${layoutOpen ? ' rf-show-splits' : ''}`} style={{ ...(layoutSz.monW ? { '--rf-mon-w': `${layoutSz.monW}px` } : {}), ...(layoutSz.panelH ? { '--rf-panel-h': `${layoutSz.panelH}px` } : {}), display: 'grid', gridTemplateColumns: '156px minmax(0, 1fr) minmax(320px, 360px)', gap: 16, alignItems: 'start', ...(isMobile && sheet ? { '--rf-stage-h': 'max(140px, calc(100dvh - var(--rf-sheet-h) - 118px - env(safe-area-inset-top)))' } : isMobile ? { '--rf-stage-h': `max(200px, calc(100dvh - ${(stage === 's' ? 470 : stage === 'l' ? 330 : 400) + (showZoomLane ? 28 : 0) + (showBrollLane ? 30 : 0) + (media.length ? 34 : 0)}px - env(safe-area-inset-bottom)))` } : {}) }}>
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
                {on && <span className="rf-tl-navind" style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: C.orange }} />}
                <Icon name={t.icon} size={17} strokeWidth={1.9} color={on ? C.orangeSoft : 'currentColor'} /> <span className="rf-tl-navlbl">{t.label}</span>
              </button>
            );
          })}
          <div className="rf-tl-navsep" style={{ height: 1, background: C.border, margin: '6px 4px' }} />
          <button className="rf-tl-navexp" onClick={generate} disabled={busy || allGone} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 11, border: 'none', cursor: busy || allGone ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: 'transparent', color: C.orangeSoft, textAlign: 'left' }}>
            <Icon name="upload" size={17} strokeWidth={2} /> <span className="rf-tl-navlbl">Exportar</span>
          </button>
          {/* Tela grande: sem cabeçalho — salvar, voltar e exportar ficam na linha das abas */}
          <div className="rf-tl-navend">
            <span className="rf-tl-navsaved" title={cloudErr ? 'Não deu para salvar na conta agora (tenta de novo em 30 s)' : undefined}>
              {APP_VERSION}{cloudSavedAt ? ` · salvo ${new Date(cloudSavedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : savedAt ? ' · salvo neste navegador' : ''}{cloudErr ? ' · ⚠ sem salvar' : ''}
            </span>
            <button onClick={onBack} disabled={busy} title="Voltar" className="rf-tl-navbtn">
              <Icon name="arrowLeft" size={13} strokeWidth={2.2} /> <span className="rf-navlbl2">Voltar</span>
            </button>
            <button onClick={() => { setTplOpen((v) => !v); setLayoutOpen(false); }} title="Meus modelos: salve e aplique o seu jeito de editar (legenda, logo, textos, cor…)" className="rf-tl-navbtn" style={tplOpen ? { borderColor: '#FF8A5C', color: '#FFD2BF' } : undefined}>
              ★ <span className="rf-navlbl2">Modelos</span>
            </button>
            <button onClick={() => setLayoutOpen((v) => !v)} title="Ajustar o tamanho do vídeo, das opções e da timeline" className="rf-tl-navbtn" style={layoutOpen ? { borderColor: '#2D8CFF', color: '#7DB6FF' } : undefined}>
              ▦ <span className="rf-navlbl2">Layout</span>
            </button>
            <button onClick={() => setTour(true)} title="Guia rápido: mostra para que serve cada parte do editor" className="rf-tl-navbtn">
              ? <span className="rf-navlbl2">Guia</span>
            </button>
            <button data-tour="export" onClick={generate} disabled={busy || allGone} className="rf-tl-navbtn rf-tl-navbtn--go" style={{ background: busy || allGone ? 'rgba(255,255,255,0.08)' : GRAD, cursor: busy || allGone ? 'not-allowed' : 'pointer' }}>
              <Icon name="upload" size={13} strokeWidth={2.2} /> Exportar
            </button>
          </div>
        </nav>

        <div className="rf-tl-preview">
          {!isMobile && splitter('col')}
          {/* Vídeo principal + prévia 9:16 do ajuste, LADO A LADO (mesma linha) */}
          {/* Vídeo e prévia do formato centralizados, lado a lado e com a MESMA altura:
              cada um ocupa uma fatia da largura proporcional ao seu formato. */}
          <div onDragOver={fxDragOver} onDrop={onPreviewDrop} className={`rf-tl-pv${showFormatPreview ? ' rf-tl-pv--fmt' : ''}${singleMon ? ' rf-tl-pv--one' : ''}`} style={{ '--main-share': showFormatPreview ? (mainAr / (mainAr + fmtAr)).toFixed(4) : 1, '--fmt-share': singleMon ? 1 : showFormatPreview ? (fmtAr / (mainAr + fmtAr)).toFixed(4) : 1, containerType: 'inline-size', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, padding: 10, borderRadius: 16, border: `1px solid ${C.border}`, background: 'radial-gradient(circle at 50% 0%, rgba(194,65,12,0.10), transparent 60%), rgba(0,0,0,0.35)' }}>
            <div className="rf-tl-main" style={{ flex: '0 0 auto', minWidth: 0 }}>
              <div style={{ position: 'relative', width: `min(calc(var(--rf-stage-h) * ${mainAr.toFixed(4)}), calc((100cqw - ${showFormatPreview ? 16 : 0}px) * var(--main-share)))`, aspectRatio: `${mainAr}`, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, background: '#000' }}>
                <video ref={videoRef} src={srcUrl} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', background: '#000', filter: videoFilterFx }} onClick={framingMode === 'manual' ? undefined : togglePlay} onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth) setVdim({ w: v.videoWidth, h: v.videoHeight }); if (cur > 0.05 && Math.abs(v.currentTime - cur) > 0.2) v.currentTime = cur; v.playbackRate = speed; measureVideo(); }} playsInline />
                {vbox && lookCss.tint && <div style={{ position: 'absolute', left: vbox.x, top: vbox.y, width: vbox.w, height: vbox.h, pointerEvents: 'none', ...lookCss.tint }} />}
                {vbox && headline.on && headline.text.trim() && (!headline.seconds || cur < headline.seconds) && (
                  <HeadlineOverlay h={headline} box={vbox} />
                )}
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
                {vbox && !singleMon && <div ref={fxOverlayRef} style={{ position: 'absolute', left: vbox.x, top: vbox.y, width: vbox.w, height: vbox.h, pointerEvents: 'none', zIndex: 2, backgroundSize: 'cover' }} />}
                {vbox && !singleMon && <div ref={transOverlayRef} style={{ position: 'absolute', left: vbox.x, top: vbox.y, width: vbox.w, height: vbox.h, pointerEvents: 'none', zIndex: 4, opacity: 0 }} />}
                {vbox && <StageLayers videoRef={videoRef} box={vbox} cur={cur} media={visMedia} texts={visTexts} editable={tab === 'midias' || tab === 'texto'} selMedia={selMedia} selText={selText}
                  onMedia={(key, patch) => { updateMedia(key, patch); setSelMedia(key); setSelKind('media'); }} onText={(key, patch) => { updateText(key, patch); setSelText(key); setSelKind('text'); }} />}
                {cap.captions && <CaptionOverlay videoRef={videoRef} segments={overlaySegs} options={cap} box={vbox} sample={tab === 'legenda'} editable={tab === 'legenda' && !showFormatPreview} onDragPos={onCapDrag} />}
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
                {guides?.where === 'focus' && vbox && <SnapGuides box={vbox} x={guides.x} y={guides.y} />}
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
          {!isMobile && <div className="rf-tl-bar" style={{ display: 'grid', gap: 6, marginTop: 8, padding: '8px 10px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)' }}>
            {/* barra de progresso na largura toda (arrastar = ir) */}
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
              title="Arraste para ir a outro ponto do vídeo"
              style={{ position: 'relative', height: 14, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ position: 'absolute', left: 0, width: `${dur ? (cur / dur) * 100 : 0}%`, height: 4, borderRadius: 4, background: GRAD }} />
              <div style={{ position: 'absolute', left: `calc(${dur ? (cur / dur) * 100 : 0}% - 6px)`, width: 12, height: 12, borderRadius: '50%', background: '#fff', boxShadow: `0 0 0 3px ${C.orange}55` }} />
            </div>
            {/* transporte: tempo · voltar/play/avançar · velocidade e opções do monitor */}
            <div className="rf-transport" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: '1 1 0', minWidth: 0, fontSize: 12, color: PR.blue, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="Posição / duração">
                {mmss(cur)} <span style={{ color: C.faint, fontWeight: 500 }}>/ {mmss(dur)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button className="rf-tbtn rf-tb-ext" onClick={() => seek(0)} title="Ir para o começo (Home)" aria-label="Começo">{svgTransport('start')}</button>
                <button className="rf-tbtn" onClick={() => seek(cur - 1 / 30)} title="Voltar 1 quadro" aria-label="Voltar 1 quadro">{svgTransport('back')}</button>
                <button onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Tocar'} title="Tocar / pausar (Espaço)" style={{ ...playBtn, width: 34, height: 34 }}><Icon name={playing ? 'pause' : 'play'} size={15} strokeWidth={2} /></button>
                <button className="rf-tbtn" onClick={() => seek(cur + 1 / 30)} title="Avançar 1 quadro" aria-label="Avançar 1 quadro">{svgTransport('fwd')}</button>
                <button className="rf-tbtn rf-tb-ext" onClick={() => seek(dur)} title="Ir para o fim (End)" aria-label="Fim">{svgTransport('end')}</button>
              </div>
              <div style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', minWidth: 'max-content' }}>
                <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title="Velocidade do vídeo final (a prévia toca nela)" aria-label="Velocidade"
                  style={{ height: 28, flexShrink: 0, borderRadius: 7, border: `1px solid ${speed !== 1 ? C.orange : C.border}`, background: 'rgba(0,0,0,0.35)', color: speed !== 1 ? C.orangeSoft : C.text, fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', padding: '0 4px', cursor: 'pointer' }}>
                  {SPEEDS.map((k) => <option key={k} value={k}>{fmtSpeed(k)}</option>)}
                </select>
                {showFormatPreview && (
                  <button className={`rf-tbtn${showSource ? ' on' : ''}`} onClick={() => setShowSource((v) => !v)} title={showSource ? 'Voltar para um monitor só (o vídeo como vai sair)' : 'Comparar com o vídeo original ao lado'} aria-pressed={showSource}>
                    <Icon name="layout" size={13} strokeWidth={2.2} />
                  </button>
                )}
                <button className={`rf-tbtn${previewCuts ? ' on' : ''}`} onClick={() => setPreviewCuts((v) => !v)} title={previewCuts ? 'Tocando com os cortes (como no vídeo final) — clique para tocar sem cortes' : 'Tocando sem cortes — clique para pular os trechos cortados'} aria-pressed={previewCuts}>
                  <Icon name="scissors" size={13} strokeWidth={2.2} />
                </button>
                <button className="rf-tbtn" onClick={() => { const el = (singleMon ? composedRef.current : videoRef.current?.parentElement); if (el?.requestFullscreen) el.requestFullscreen().catch(() => {}); }} title="Tela cheia" aria-label="Tela cheia">
                  <Icon name="maximize" size={13} strokeWidth={2} />
                </button>
              </div>
            </div>
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
                <span style={{ color: C.green, fontVariantNumeric: 'tabular-nums' }}>{fmtDuration((stats.keptSec + retimeDelta) / speed)}</span>
              </div>
              <div style={{ ...mRow, display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><Icon name="mic" size={19} strokeWidth={1.9} /> <span style={{ flex: 1 }}>Respirações</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={() => setCutBreaths(true)} style={{ ...miniBtn(cutBreaths, false), minHeight: 40, justifyContent: 'center' }}>Remover</button>
                  <button onClick={() => setCutBreaths(false)} style={{ ...miniBtn(!cutBreaths, false), minHeight: 40, justifyContent: 'center' }}>Manter</button>
                </div>
              </div>
              <div style={{ ...mRow, display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><Icon name="mic" size={19} strokeWidth={1.9} /> <span style={{ flex: 1 }}>Tosse e pigarro</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={() => setCutCoughs(true)} style={{ ...miniBtn(cutCoughs, false), minHeight: 40, justifyContent: 'center' }}>Remover</button>
                  <button onClick={() => setCutCoughs(false)} style={{ ...miniBtn(!cutCoughs, false), minHeight: 40, justifyContent: 'center' }}>Manter</button>
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
              <div style={{ ...mRow, display: 'block', background: 'linear-gradient(180deg, rgba(194,65,12,0.16), rgba(255,255,255,0.05))' }}>
                <button onClick={() => setAdvOpen((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', color: C.purpleSoft, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}>
                  <Icon name="sparkles" size={18} strokeWidth={2} /> <span style={{ flex: 1, textAlign: 'left' }}>Opções avançadas</span>
                  <Icon name="chevron" size={16} strokeWidth={2.2} style={{ transform: advOpen ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .15s' }} />
                </button>
                {advOpen && catalog && (
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
{capFxRows}
                    <CapRow label="Área segura (Reels/TikTok)">
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setCapField({ captionSafeZone: true })} style={{ ...miniBtn(cap.captionSafeZone !== false, false), flex: 1, minHeight: 36 }}>Fora dos botões</button>
                        <button onClick={() => setCapField({ captionSafeZone: false })} style={{ ...miniBtn(cap.captionSafeZone === false, false), flex: 1, minHeight: 36 }}>Livre</button>
                      </div>
                    </CapRow>
                    {capCreateRows}
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
                  {reframeMode === 'split' && (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => setSplitSwap((v) => !v)} style={{ ...framingTab(false), width: '100%', padding: '7px 10px', fontSize: 12, fontWeight: 700 }}>
                        Trocar de lugar · {splitSwap ? 'pessoa da direita em cima' : 'pessoa da esquerda em cima'}
                      </button>
                      <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>Precisa de duas pessoas lado a lado no vídeo. Com uma pessoa só, o quadro segue o rosto. Se a IA errar, use <b>Posição que eu escolher</b>.</div>
                    </div>
                  )}
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
                <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>B-roll · imagens automáticas</div>
                <button onClick={() => setBrollOn((v) => !v)} role="switch" aria-checked={brollOn} title={brollOn ? 'Desligar o B-roll neste vídeo (as escolhas ficam guardadas)' : 'Ligar o B-roll neste vídeo'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: brollOn ? C.text : C.muted, fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}>
                  {brollOn ? 'Ligado' : 'Desligado'}
                  <span style={{ width: 34, height: 20, borderRadius: 20, background: brollOn ? C.green : 'rgba(255,255,255,0.16)', position: 'relative', transition: 'background .15s' }}>
                    <span style={{ position: 'absolute', top: 2, left: brollOn ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                  </span>
                </button>
              </div>
              {!brollOn && (
                <div style={{ fontSize: 12, color: C.muted, background: 'rgba(255,255,255,0.04)', border: `1px dashed ${C.border}`, borderRadius: 9, padding: '8px 10px', marginBottom: 10 }}>
                  B-roll desligado: o vídeo sai sem imagens de apoio. Suas escolhas abaixo ficam guardadas — ligue de novo quando quiser.
                </div>
              )}
              <button onClick={addBrollHere} style={{ ...framingTab(false), width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }} title="Cria um momento de B-roll onde o vídeo está agora; depois escolha a imagem (Google, Minha ou busca)">
                <Icon name="plus" size={13} strokeWidth={2.4} /> Adicionar B-roll aqui ({fmtDuration(cur)})
              </button>
              <div style={{ opacity: brollOn ? 1 : 0.45, pointerEvents: brollOn ? 'auto' : 'none' }}>
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
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                        onDrop={(e) => { e.preventDefault(); setSelBroll(i); takeBrollTransfer(i, e.dataTransfer).then((ok) => { if (!ok) setBrollErr('Não reconheci uma imagem aí. No Google, abra a imagem e arraste ela (ou copie e cole com Ctrl+V).'); }); }}
                        style={{ background: isSel ? 'rgba(194,65,12,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isSel ? C.purpleSoft : C.border}`, borderRadius: 10, padding: 8, opacity: m.removed ? 0.55 : 1, cursor: 'pointer' }}>
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
                              <button onClick={() => setMoment(i, { removed: !m.removed })} title={m.removed ? 'Usar este B-roll' : 'Não usar este B-roll (fica guardado)'} style={{ ...zoomBtn, width: 'auto', flex: 1, padding: '0 6px', fontSize: 10, fontWeight: 600, color: m.removed ? C.green : C.muted }}>{m.removed ? '○ Usar' : '● Em uso'}</button>
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
                            <button
                              onClick={(e) => {
                                // Google busca melhor em português: o termo da fala (m.term), a não ser
                                // que a pessoa tenha digitado outra busca no campo acima.
                                const typed = (e.currentTarget.parentElement?.querySelector('input[name=q]')?.value || '').trim();
                                const q = (typed && typed !== m.query ? typed : m.term || typed || m.query || '').trim();
                                window.open(`https://www.google.com/search?tbm=isch&hl=pt-BR&q=${encodeURIComponent(q)}`, '_blank', 'noopener');
                                setBrollPasteHint(i);
                              }}
                              style={{ ...zoomBtn, width: '100%', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, color: '#fff', background: '#1a73e8', border: 'none' }}>
                              <GoogleMark /> Buscar no Google Imagens
                            </button>
                            {brollPasteHint === i && (
                              <div style={{ fontSize: 11, color: C.text, background: 'rgba(26,115,232,0.14)', border: '1px solid rgba(26,115,232,0.5)', borderRadius: 8, padding: '7px 9px', lineHeight: 1.45 }}>
                                No Google, abra a imagem que quiser, clique com o botão direito → <b>Copiar imagem</b> e volte aqui: aperte <b>Ctrl+V</b> (no Mac, ⌘+V). Também dá para <b>arrastar</b> a imagem para este quadro ou salvar e usar <b>Minha</b>.
                                <div style={{ color: C.faint, marginTop: 3 }}>Imagens do Google costumam ter dono: use só as que você pode usar.</div>
                              </div>
                            )}
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
            </div>
          )}

          {/* Volume da fala: geral, mudo e trechos com volume próprio */}
          {tab === 'audio' && (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${C.border}`, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Silêncios, respirações e tosse</div>
                <CapRow label="Respirações entre as frases">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setCutBreaths(true)} style={{ ...miniBtn(cutBreaths, false), flex: 1 }}>Remover</button>
                    <button onClick={() => setCutBreaths(false)} style={{ ...miniBtn(!cutBreaths, false), flex: 1 }}>Manter</button>
                  </div>
                </CapRow>
                <CapRow label="Tosse, pigarro e estalos">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setCutCoughs(true)} style={{ ...miniBtn(cutCoughs, false), flex: 1 }}>Remover</button>
                    <button onClick={() => setCutCoughs(false)} style={{ ...miniBtn(!cutCoughs, false), flex: 1 }}>Manter</button>
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
                <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>Duração final: <b style={{ color: C.text }}>{fmtDuration((stats.keptSec + retimeDelta) / speed)}</b> · a voz acelera sem mudar o tom.</div>
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
              {fxBrowser}
              {fxSelPanel}
              <details style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.muted }}>Mais opções (automáticos, quadros-chave, sons e transições em todos os cortes)</summary>
                <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
              {transformBlock}
              {fxBlock}
              <CapRow label="Movimento nos momentos-chave">
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
              {fx.videoMotion !== 'none' && (
                <CapRow label={`Momentos de movimento (${(zoomMoments || []).length}) — faixa ZOOM na timeline (o efeito só acontece neles)`}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={addZoomAtPlayhead} style={toolBtn(false)}>+ Momento no playhead ({fmtDuration(cur)})</button>
                    <button onClick={() => { setZoomMoments(autoZoomMoments()); setSelZoom(null); }} style={toolBtn(false)}>
                      <Icon name="undo" size={13} strokeWidth={2} /> Recalcular automático
                    </button>
                  </div>
                </CapRow>
              )}
              {fx.videoMotion !== 'none' && selZoomItem && (
                <div style={{ border: `1px solid ${C.orange}`, borderRadius: 10, padding: 10, background: 'rgba(255,107,53,0.06)', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
                    Movimento em {fmtDuration(selZoomItem.start)} → {fmtDuration(selZoomItem.end)}
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
                  <CapRow label="Efeito deste momento">
                    <Sel value={selZoomItem.effect || defaultMomentEffect(fx.videoMotion)} opts={Object.entries(MOMENT_EFFECTS).map(([id, label]) => ({ id, label }))}
                      onChange={(v) => { setZoomMoments((l) => l.map((z) => (z.key === selZoomItem.key ? { ...z, effect: v } : z))); seek(selZoomItem.start + 0.01); }} />
                  </CapRow>
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
              {fx.soundEffects && catalog?.sfxTypes && (
                <>
                  <CapRow label="Som nas entradas de B-roll"><Sel value={fx.sfxBrollType} opts={catalog.sfxTypes} onChange={(v) => setFx((f) => ({ ...f, sfxBrollType: v }))} /></CapRow>
                  <CapRow label="Som nos zooms"><Sel value={fx.sfxZoomType} opts={catalog.sfxTypes} onChange={(v) => setFx((f) => ({ ...f, sfxZoomType: v }))} /></CapRow>
                  <CapRow label="Som nos cortes"><Sel value={fx.sfxCutType} opts={catalog.sfxTypes} onChange={(v) => setFx((f) => ({ ...f, sfxCutType: v }))} /></CapRow>
                </>
              )}
              {catalog?.sfxTypes && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>Efeito sonoro no ponto atual ({cur.toFixed(1)}s)</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1 }}><Sel value={sfxPick} opts={catalog.sfxTypes.filter((o) => o.id !== 'none')} onChange={setSfxPick} /></div>
                    <button onClick={() => setSfxMoments((l) => [...l, { key: `s${Date.now()}`, t: cur, type: sfxPick }].sort((a, b) => a.t - b.t))} style={{ ...framingTab(false), flex: 'none' }}>+ Adicionar</button>
                  </div>
                  {sfxMoments.map((m) => (
                    <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.muted }}>
                      <span style={{ width: 48, fontVariantNumeric: 'tabular-nums' }}>{m.t.toFixed(1)}s</span>
                      <span style={{ flex: 1 }}>{catalog.sfxTypes.find((o) => o.id === m.type)?.label || m.type}</span>
                      <button onClick={() => setSfxMoments((l) => l.filter((x) => x.key !== m.key))} title="Remover" style={{ ...zoomBtn, width: 22, height: 22, color: C.red }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {speedBlock}
              {transBlock}
                </div>
              </details>
              <div style={{ fontSize: 11.5, color: C.faint }}>
                <b>Prévia:</b> ao escolher um movimento, o player ao lado mostra o efeito na hora; dê play para ver no ritmo da fala e ouvir os whooshes. O <b>zoom nos momentos-chave</b> só aproxima nos pontos de ênfase (pausa antes, números, perguntas, palavras fortes) — não o vídeo inteiro. Na faixa <b>ZOOM</b> da timeline: clique para ajustar, arraste para mover, puxe as pontas para mudar a duração. Os whooshes tocam nesses zooms e nas entradas de B-roll.
              </div>
            </div>
          )}

          {tab === 'capa' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="type" size={15} strokeWidth={2} /></span>
                  <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Título no vídeo (headline)</div>
                  <Switch on={headline.on} onChange={(v) => setHl({ on: v })} />
                </div>
                <div style={{ opacity: headline.on ? 1 : 0.45, pointerEvents: headline.on ? 'auto' : 'none', display: 'grid', gap: 8 }}>
                  <textarea value={headline.text} onChange={(e) => setHl({ text: e.target.value.slice(0, 90) })} rows={2} placeholder="Ex.: 3 erros que travam sua equipe"
                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 54, padding: '8px 10px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 13, fontFamily: 'inherit' }} />
                  {segments[0]?.words?.length > 0 && (
                    <button onClick={() => setHl({ text: segments[0].words.filter((w) => !w.removed).map((w) => w.word).join(' ').slice(0, 90) })} style={{ ...zoomBtn, width: 'auto', justifySelf: 'start', padding: '0 9px', fontSize: 11, fontWeight: 600 }}>Usar a primeira frase do vídeo</button>
                  )}
                  <CapRow label="Quanto tempo">
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {[[3, '3 s'], [5, '5 s'], [10, '10 s'], [0, 'Vídeo todo']].map(([v, l]) => (
                        <button key={v} onClick={() => setHl({ seconds: v })} style={{ ...miniBtn(headline.seconds === v, false), flex: '1 1 auto' }}>{l}</button>
                      ))}
                    </div>
                  </CapRow>
                  <CapRow label="Onde">
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[['top', 'Topo'], ['center', 'Meio'], ['bottom', 'Embaixo']].map(([v, l]) => (
                        <button key={v} onClick={() => setHl({ position: v })} style={{ ...miniBtn(headline.position === v, false), flex: 1 }}>{l}</button>
                      ))}
                    </div>
                  </CapRow>
                  <CapRow label="Estilo">
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[['box', 'Caixa'], ['bar', 'Faixa escura'], ['clean', 'Só texto']].map(([v, l]) => (
                        <button key={v} onClick={() => setHl({ style: v })} style={{ ...miniBtn(headline.style === v, false), flex: 1 }}>{l}</button>
                      ))}
                    </div>
                  </CapRow>
                  {headline.style === 'box' && (
                    <CapRow label="Cor da caixa">
                      <div style={{ display: 'flex', gap: 6 }}>
                        {['FF6B35', '7C3AED', 'FFD60A', '111111', 'FFFFFF', '2ED47A'].map((c) => (
                          <button key={c} onClick={() => setHl({ color: c })} aria-label={`cor ${c}`} style={{ width: 24, height: 24, borderRadius: '50%', background: `#${c}`, border: headline.color === c ? '2px solid #fff' : `1px solid ${C.border}`, cursor: 'pointer', padding: 0 }} />
                        ))}
                      </div>
                    </CapRow>
                  )}
                  <div style={{ fontSize: 10.5, color: C.faint }}>A prévia mostra o título por cima do vídeo; no vídeo final ele sai com a mesma fonte das legendas.</div>
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="image" size={15} strokeWidth={2} /></span>
                  <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Capa do vídeo</div>
                  <Switch on={cover.on} onChange={(v) => setCv({ on: v, t: cover.t ?? cur })} />
                </div>
                <div style={{ opacity: cover.on ? 1 : 0.45, pointerEvents: cover.on ? 'auto' : 'none', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 96, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: '#000', border: `1px solid ${C.border}`, aspectRatio: aspectSel === '9:16' ? '9 / 16' : aspectSel === '1:1' ? '1 / 1' : aspectSel === '16:9' ? '16 / 9' : `${mainAr}` }}>
                      {cover.on && <img alt="Prévia da capa" src={coverUrl(sourceId, { t: cover.t ?? cur, text: cover.text || headline.text, style: headline.style, color: headline.color, pos: cover.position, aspect: aspectSel, fx: framingMode === 'manual' ? focus.x : 0.5 })} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    </div>
                    <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: 11.5, color: C.muted }}>Quadro: <b style={{ color: C.text }}>{fmtDuration(cover.t ?? cur)}</b></div>
                      <button onClick={() => setCv({ t: +cur.toFixed(1) })} style={{ ...zoomBtn, width: 'auto', padding: '0 8px', fontSize: 11, fontWeight: 600 }}>Usar o quadro de agora ({fmtDuration(cur)})</button>
                      <a href={coverUrl(sourceId, { t: cover.t ?? cur, text: cover.text || headline.text, style: headline.style, color: headline.color, pos: cover.position, aspect: aspectSel, quality, fx: framingMode === 'manual' ? focus.x : 0.5, full: true })}
                        style={{ ...zoomBtn, width: 'auto', padding: '0 8px', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textDecoration: 'none', color: '#fff', background: GRAD, border: 'none' }}>
                        <Icon name="download" size={12} strokeWidth={2.2} /> Baixar capa (JPG)
                      </a>
                    </div>
                  </div>
                  <input value={cover.text} onChange={(e) => setCv({ text: e.target.value.slice(0, 80) })} placeholder={headline.text ? `Texto da capa (vazio = "${headline.text.slice(0, 30)}…")` : 'Texto da capa (ex.: Como cobrar sem brigar)'}
                    style={{ minHeight: 32, padding: '0 9px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 12.5, fontFamily: 'inherit' }} />
                  <CapRow label="Texto na capa">
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[['top', 'Topo'], ['center', 'Meio'], ['bottom', 'Embaixo']].map(([v, l]) => (
                        <button key={v} onClick={() => setCv({ position: v })} style={{ ...miniBtn(cover.position === v, false), flex: 1 }}>{l}</button>
                      ))}
                    </div>
                  </CapRow>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
                    <input type="checkbox" checked={cover.intro} onChange={(e) => setCv({ intro: e.target.checked })} />
                    Mostrar a capa no começo do vídeo (vira a miniatura no Reels/TikTok)
                  </label>
                  <div style={{ fontSize: 10.5, color: C.faint }}>A capa usa o estilo e a cor do título. Ao gerar o vídeo, ela também fica para baixar no resultado.</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'texto' && textBlock}

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
              {!isMobile && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, padding: 3, borderRadius: 11, background: 'rgba(255,255,255,0.05)', marginBottom: 10 }}>
                {/* na ordem do Premiere: transcrição → estilo (criar legendas) → legendas */}
                {[{ id: 'transcricao', label: 'Transcrição', icon: 'edit' }, { id: 'estilo', label: 'Estilo', icon: 'type' }, { id: 'lista', label: 'Legendas', icon: 'list' }].map((o) => (
                  <button key={o.id} onClick={() => setCapPane(o.id)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: capPane === o.id ? 'rgba(255,255,255,0.13)' : 'transparent', color: capPane === o.id ? C.text : C.muted }}>
                    <Icon name={o.icon} size={14} strokeWidth={2} /> {o.label}
                  </button>
                ))}
              </div>}
              {capPane === 'enfase' ? (
                enfaseBlock || <div style={{ fontSize: 12, color: C.faint, padding: '8px 2px' }}>Ligue a legenda e escolha uma frase na timeline para destacar palavras.</div>
              ) : capPane === 'lista' ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {xcapBlock}
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
                      const kr = capRangeOf(seg); // quando a legenda aparece (pode ter sido movida)
                      const on = si === sel;
                      const live = si === activeIndex;
                      const text = (gone ? seg.words : seg.words.filter((w) => !w.removed)).map((w) => w.word).join(' ');
                      return (
                        <div key={si} data-si={si} onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) { selectCaption(si, e); return; } if (isMobile && on && !gone) { setCapEdit(si); return; } setSelKind('caption'); setSelSet(new Set([si])); setSel(si); seek(kr[0] + 0.01); }} onDoubleClick={() => setCapEdit(si)}
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
                          {gone && (
                            <button onClick={(e) => { e.stopPropagation(); restoreCaption(si); }} title="Traz de volta esta fala: vídeo, áudio e legenda"
                              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', height: 24, padding: '0 9px', borderRadius: 7, border: '1px solid rgba(46,212,122,0.5)', background: 'rgba(16,24,20,0.92)', color: '#7EE2A8', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                              Restaurar
                            </button>
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
                  {!isMobile && trechoBlock && <div className="rf-only-app">{trechoBlock}</div>}
                </div>
              ) : capPane === 'transcricao' ? (
                transcriptPane
              ) : cap.captions && catalog ? (
                <>
                <div style={{ display: 'grid', gap: 8 }}>
                  {/* Criar legendas (como o diálogo do Premiere): formato dos cartões e tempo */}
                  <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: 'linear-gradient(180deg, rgba(255,107,53,0.06), rgba(255,255,255,0.02))' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>Criar legendas</div>
                    {capCreateRows}
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>Modelo</div>
                    <CaptionGallery options={cap} onApply={(p) => { setCapField(p); if (p.soundEffects) setFx((f) => ({ ...f, soundEffects: true })); }} compact />
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>Fonte</div>
                    <FontPicker value={cap.captionFont} fonts={catalog.captionFonts || []} onChange={(v) => setCapField({ captionFont: v, captionFontStyle: '' })} compact />
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>Estilo do texto</div>
                    <TextStyleBar options={cap} onChange={setCapField} compact />
                  </div>
                  <CapRow label="Destacar palavra falada">
                    <button onClick={() => setCapField({ captionHighlight: !cap.captionHighlight })} style={miniBtn(cap.captionHighlight, false)}>
                      {cap.captionHighlight ? 'Ligado' : 'Desligado (legenda normal)'}
                    </button>
                  </CapRow>
                  {catalog.captionHighlightStyles && (
                    <CapRow label="Tipo de destaque">
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {catalog.captionHighlightStyles.map((h) => (
                          <button key={h.id} onClick={() => setCapField({ captionHighlightStyle: h.id, ...(h.id !== 'auto' ? { captionHighlight: true } : null) })}
                            style={miniBtn((cap.captionHighlightStyle || 'auto') === h.id, false)}>{h.label.replace(/ \(.*\)$/, '')}</button>
                        ))}
                      </div>
                    </CapRow>
                  )}
                  <CapRow label="Fundo do texto"><Sel value={cap.captionBackground} opts={catalog.captionBackgrounds} onChange={(v) => setCapField({ captionBackground: v })} /></CapRow>
                  <CapRow label="Posição"><Sel value={cap.captionPosition} opts={catalog.captionPositions} onChange={(v) => setCapField({ captionPosition: v, captionX: undefined, captionY: undefined })} /></CapRow>
                  <CapRow label="Área segura (Reels/TikTok)">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setCapField({ captionSafeZone: true })} style={{ ...miniBtn(cap.captionSafeZone !== false, false), flex: 1 }}>Fora dos botões</button>
                      <button onClick={() => setCapField({ captionSafeZone: false })} style={{ ...miniBtn(cap.captionSafeZone === false, false), flex: 1 }}>Livre</button>
                    </div>
                  </CapRow>
                  <CapRow label="Cor">
                    <ColorSwatches value={cap.captionColor} options={catalog.captionColors || []} onChange={(v) => setCapField({ captionColor: v })} size={24} />
                  </CapRow>
                  <CapRow label={`Tamanho (${Math.round((cap.captionScale ?? 1) * 100)}%)`}>
                    <input type="range" min="0.3" max="1.4" step="0.05" value={cap.captionScale ?? 1} onChange={(e) => setCapField({ captionScale: Number(e.target.value) })} style={{ width: '100%' }} />
                  </CapRow>
                  {capFxRows}
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
                  {!isMobile && (
                    <button onClick={() => setCapPane('lista')} style={{ ...toolBtn(false), justifyContent: 'center', marginTop: 2, background: 'rgba(255,107,53,0.14)', border: '1px solid rgba(255,107,53,0.45)', color: C.text }}>
                      Ver as legendas <Icon name="next" size={13} strokeWidth={2} />
                    </button>
                  )}
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
          {tab === 'projeto' && (
            <ProjectPanel library={library} onReloadLibrary={loadLibrary} onAddLayer={(it) => addMediaItem(it)} sourceId={sourceId} durationSec={dur}
              projectTitle={projectTitle} options={options} carryStyle={carryStyleNow} onRebuild={onRebuild} />
          )}
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
              <button onClick={() => setStickersOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 'none', color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, margin: '12px 0 6px', fontFamily: 'inherit' }}>
                {stickersOpen ? '▾' : '▸'} Stickers <span style={{ fontWeight: 500, color: C.faint, fontSize: 11 }}>· {STICKERS.length} · entram no playhead, arraste no vídeo</span>
              </button>
              {stickersOpen && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {STICKERS.map((st) => (
                  <button key={st.id} onClick={() => addSticker(st)} disabled={mediaBusy} title={st.label} aria-label={`Sticker ${st.label}`}
                    style={{ width: 34, height: 34, fontSize: 18, borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', lineHeight: 1, cursor: mediaBusy ? 'wait' : 'pointer', padding: 0 }}>{st.ch}</button>
                ))}
              </div>}
              {mediaErr && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{mediaErr}</div>}
              {/* Biblioteca: o que você já enviou fica guardado — clique para usar de novo */}
              <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 10, padding: 9, background: 'rgba(255,255,255,0.02)' }}>
                <button onClick={() => setLibOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 'none', color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                  {libOpen ? '▾' : '▸'} Sua biblioteca {library ? <span style={{ fontWeight: 500, color: C.faint }}>· {library.length} arquivo(s) guardado(s)</span> : null}
                  <span style={{ marginLeft: 'auto', fontWeight: 500, color: C.faint, fontSize: 10.5 }}>clique para pôr no ponto atual</span>
                </button>
                {libOpen && (library === null ? (
                  <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>Carregando…</div>
                ) : library.length === 0 ? (
                  <div style={{ fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>Tudo o que você enviar (logo, vinheta, música, fotos) fica guardado aqui para usar em outros vídeos sem subir de novo.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 6, marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {library.map((it) => (
                      <div key={it.id} style={{ position: 'relative' }}>
                        <button onClick={() => it.status === 'ok' && addMediaItem(it)} disabled={it.status !== 'ok'} title={it.status === 'ok' ? `${it.filename} — colocar no ponto atual` : `${it.filename} — arquivo não encontrado`}
                          style={{ width: '100%', aspectRatio: '1', borderRadius: 8, border: `1px solid ${C.border}`, background: '#0E0E14', cursor: it.status === 'ok' ? 'pointer' : 'not-allowed', padding: 0, overflow: 'hidden', display: 'grid', placeItems: 'center', opacity: it.status === 'ok' ? 1 : 0.4 }}>
                          <MediaThumb it={it} fit={it.kind === 'image' ? 'contain' : 'cover'} />
                        </button>
                        <div style={{ fontSize: 9.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{it.filename}</div>
                        <button onClick={() => forgetLibraryItem(it.id)} title="Tirar da biblioteca" aria-label="Tirar da biblioteca"
                          style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 5, border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer', padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
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
                          {m.offline && <button onClick={() => askRelink(m.key)} title="O arquivo foi apagado ou movido — clique para localizar" style={{ height: 22, padding: '0 8px', borderRadius: 6, border: `1px solid ${C.red}`, background: 'rgba(240,82,107,0.15)', color: C.red, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>offline · localizar</button>}
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
                        ) : null}
                        {isAudio ? (
                          <>
                            {[['fadeIn', 'Entrada suave'], ['fadeOut', 'Saída suave']].map(([k, label]) => (
                              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted, marginTop: 6 }}>
                                <span style={{ width: 58 }}>{label}</span>
                                <input type="range" min="0" max="5" step="0.1" value={m[k] || 0} onChange={(e) => updateMedia(m.key, { [k]: Number(e.target.value) })} style={{ flex: 1 }} />
                                <span style={{ width: 42, textAlign: 'right' }}>{Number(m[k] || 0).toFixed(1)}s</span>
                              </label>
                            ))}
                          </>
                        ) : (
                          <>
                            <div style={{ display: 'flex', gap: 6, marginBottom: m.mode === 'pip' ? 8 : 0 }}>
                              {[{ id: 'cover', label: 'Tela cheia' }, { id: 'pip', label: 'Livre (posição/tamanho)' }].map((o) => (
                                <button key={o.id} onClick={() => updateMedia(m.key, { mode: o.id })} style={framingTab(m.mode === o.id)}>{o.label}</button>
                              ))}
                            </div>
                            {m.mode === 'pip' && (
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted }}>
                                <span style={{ width: 58 }}>Tamanho</span>
                                <input type="range" min="0.05" max="2" step="0.01" value={m.scale} onChange={(e) => updateMedia(m.key, { scale: Number(e.target.value) })} style={{ flex: 1 }} />
                                <span style={{ width: 42, textAlign: 'right' }}>{Math.round(m.scale * 100)}%</span>
                              </label>
                            )}
                            {m.mode === 'pip' && [['cx', 'Posição X', m.cx ?? (1 - m.scale) * m.px + m.scale / 2], ['cy', 'Posição Y', m.cy ?? m.py]].map(([k, label, v]) => (
                              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted, marginTop: 6 }}>
                                <span style={{ width: 58 }}>{label}</span>
                                <input type="range" min="-0.25" max="1.25" step="0.01" value={v} onChange={(e) => updateMedia(m.key, { [k]: Number(e.target.value), ...(k === 'cx' && m.cy == null ? { cy: m.py } : {}), ...(k === 'cy' && m.cx == null ? { cx: (1 - m.scale) * m.px + m.scale / 2 } : {}) })} style={{ flex: 1 }} />
                                <span style={{ width: 42, textAlign: 'right' }}>{Math.round(v * 100)}%</span>
                              </label>
                            ))}
                            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4 }}>Arraste a mídia direto no vídeo para posicionar (em qualquer lugar) e puxe os cantos para mudar o tamanho.</div>
                            {m.kind === 'video' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted, marginTop: 8 }}>
                                <button onClick={() => updateMedia(m.key, { muted: !m.muted })} title={m.muted ? 'Ligar o som deste vídeo' : 'Tirar o som deste vídeo'}
                                  style={{ ...framingTab(!!m.muted), flex: 'none', minWidth: 104 }}>{m.muted ? '🔇 Sem som' : '🔊 Com som'}</button>
                                <input type="range" min="0" max="1.5" step="0.05" value={m.muted ? 0 : (m.volume ?? 1)} disabled={!!m.muted} aria-label="Volume do vídeo"
                                  onChange={(e) => updateMedia(m.key, { volume: Number(e.target.value), muted: false })} style={{ flex: 1, opacity: m.muted ? 0.4 : 1 }} />
                                <span style={{ width: 42, textAlign: 'right' }}>{m.muted ? '0%' : `${Math.round((m.volume ?? 1) * 100)}%`}</span>
                              </div>
                            )}
                            <details style={{ marginTop: 8 }} open={!!(m.bright || (m.contrast ?? 1) !== 1 || (m.sat ?? 1) !== 1 || m.flip || (m.opacity ?? 1) < 1)}>
                              <summary style={{ fontSize: 11.5, fontWeight: 700, color: C.text, cursor: 'pointer' }}>Ajustes de imagem</summary>
                              {[['bright', 'Brilho', -0.5, 0.5, 0, (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`], ['contrast', 'Contraste', 0.5, 2, 1, (v) => `${Math.round(v * 100)}%`], ['sat', 'Saturação', 0, 2, 1, (v) => `${Math.round(v * 100)}%`], ['opacity', 'Opacidade', 0.1, 1, 1, (v) => `${Math.round(v * 100)}%`]].map(([k, label, min, max, def, fmt]) => (
                                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted, marginTop: 6 }}>
                                  <span style={{ width: 58 }}>{label}</span>
                                  <input type="range" min={min} max={max} step="0.01" value={m[k] ?? def} onChange={(e) => updateMedia(m.key, { [k]: Number(e.target.value) })} onDoubleClick={() => updateMedia(m.key, { [k]: def })} style={{ flex: 1 }} />
                                  <span style={{ width: 42, textAlign: 'right' }}>{fmt(m[k] ?? def)}</span>
                                </label>
                              ))}
                              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                <button onClick={() => updateMedia(m.key, { flip: !m.flip })} style={framingTab(!!m.flip)}>⇋ Espelhar</button>
                                <button onClick={() => updateMedia(m.key, { bright: 0, contrast: 1, sat: 1, opacity: 1, flip: false })} style={framingTab(false)}>Restaurar</button>
                              </div>
                            </details>
                            {catalog?.layerAnimations && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                                <CapRow label="Entrada"><Sel value={m.animIn || 'none'} opts={catalog.layerAnimations} onChange={(v) => updateMedia(m.key, { animIn: v })} /></CapRow>
                                <CapRow label="Saída"><Sel value={m.animOut || 'none'} opts={catalog.layerAnimations} onChange={(v) => updateMedia(m.key, { animOut: v })} /></CapRow>
                              </div>
                            )}
                            {catalog?.blendModes && m.mode !== 'pip' && (
                              <div style={{ marginTop: 6 }}>
                                <CapRow label="Mesclagem"><Sel value={m.blend || 'normal'} opts={catalog.blendModes} onChange={(v) => updateMedia(m.key, { blend: v })} /></CapRow>
                              </div>
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
        <div ref={bottomRef} className="rf-tl-bottom" style={{ minWidth: 0, position: 'relative', ...(isMobile ? {} : { background: PR.panel, border: `1px solid ${PR.line}`, borderRadius: 12, padding: '8px 10px 10px', boxShadow: '0 10px 30px -18px rgba(0,0,0,0.8)' }) }}>
        {!isMobile && splitter('row')}
        {/* Barra de ferramentas da timeline */}
        <div className="rf-tlbar" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 8, flexWrap: 'wrap' }}>
          <span className="rf-tl-stats" title="Palavras · cortadas · pausas cortadas · duração final">
            <b>{stats.total}</b> palavras · <b style={{ color: '#F0526B' }}>{stats.removed}</b> cortadas · <b style={{ color: '#FF9A6C' }}>{pausesCut.length}</b> pausas{cutCoughs && noisesCut.length ? <> · <b style={{ color: '#F0526B' }}>{noisesCut.length}</b> tosses/sons</> : null} · final <b style={{ color: '#2ED47A' }}>{fmtDuration((stats.keptSec + retimeDelta) / speed)}</b>
          </span>
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginRight: 8 }} title="Posição do playhead (horas:minutos:segundos:quadros)">
              <span className="rf-tc" style={{ fontSize: 21, fontWeight: 600, color: PR.blue, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.4 }}>{tcode(cur)}</span>
              <span style={{ fontSize: 11, color: PR.dim, fontVariantNumeric: 'tabular-nums' }}>/ {tcode(dur)}</span>
              {projectTitle && <span className="rf-tl-hide-sm" style={{ fontSize: 12, color: PR.text, fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 6 }}>{projectTitle}</span>}
            </div>
          )}
          <button data-tour="addcap" onClick={addExtraCap} title="Adicionar uma legenda sua no ponto atual do vídeo — não corta nada"
            style={{ ...toolBtn(false), background: 'rgba(255,107,53,0.16)', border: '1px solid rgba(255,107,53,0.55)', color: '#FFD2BF', fontWeight: 700 }}>
            <Icon name="captions" size={13} strokeWidth={2} /> + Legenda
          </button>
          {['media', 'text', 'vfx', 'trans', 'xcap', 'caption'].includes(selKind) && (
            <button onClick={copySel} style={toolBtn(false)} title={`Copiar ${SEL_LABEL[selKind]} (Ctrl+C) — depois cole no ponto que quiser`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
              <span className="rf-tl-hide-sm">Copiar</span>
            </button>
          )}
          {hasClip && (
            <button onClick={pasteAtPlayhead} style={toolBtn(false)} title="Colar no ponto atual do vídeo (Ctrl+V)">
              <Icon name="download" size={13} strokeWidth={2} /> <span className="rf-tl-hide-sm">Colar</span>
            </button>
          )}
          {!isMobile && (ripple ? gaps.length > 0 : true) && (cuts.length > 0 || segments.some((sg) => sg.words.some((w) => w.removed))) && (
            <button onClick={() => setRipple((v) => !v)} style={toolBtn(false)}
              title={ripple ? 'Os trechos excluídos somem da timeline (como no Premiere). Clique para vê-los no lugar (hachurados) e trazer de volta' : 'Esconder os trechos excluídos e encostar o resto'}>
              <Icon name={ripple ? 'eye' : 'eyeOff'} size={13} strokeWidth={2} /> {ripple ? 'Ver trechos excluídos' : 'Esconder excluídos'}
            </button>
          )}
          {(selKind === 'range' || selKind === 'words') && range && range.b > range.a && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px 3px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(96,165,250,0.5)' }}>
              <span style={{ fontSize: 11.5, color: '#BFDBFE', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                Trecho {tcode(range.a)} → {tcode(range.b)} <b style={{ color: '#fff' }}>({(range.b - range.a).toFixed(1).replace('.', ',')} s)</b>
              </span>
              <button onClick={deleteSelected} title="Corta este trecho do vídeo final: vídeo, áudio e legenda (Delete)" style={{ ...toolBtn(false), background: 'rgba(240,82,107,0.18)', border: '1px solid rgba(240,82,107,0.55)', color: '#FECACA' }}>
                <Icon name="trash" size={13} strokeWidth={2} /> Excluir trecho
              </button>
              <button onClick={clearRange} title="Limpar a seleção (Esc)" style={toolBtn(false)}>×</button>
            </div>
          )}
          {isMobile && <>
          <button onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" style={toolBtn(!canUndo)}>
            <Icon name="undo" size={14} strokeWidth={2} /> <span className="rf-tl-hide-sm">Desfazer</span>
          </button>
          <button onClick={redo} disabled={!canRedo} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" style={toolBtn(!canRedo)}>
            <Icon name="undo" size={14} strokeWidth={2} style={{ transform: 'scaleX(-1)' }} /> <span className="rf-tl-hide-sm">Refazer</span>
          </button>
          <span style={{ width: 1, height: 20, background: C.border, margin: '0 2px' }} />
          <button onClick={splitSelected} disabled={!canSplitSel} title={`Dividir ${SEL_LABEL[selKind]} no playhead (S ou Ctrl+B)`} style={toolBtn(!canSplitSel)}>
            <Icon name="scissors" size={14} strokeWidth={2} /> <span className="rf-tl-hide-sm">Dividir {SEL_LABEL[selKind]}</span>
          </button>
          <button onClick={deleteSelected} disabled={!canDeleteSel} style={toolBtn(!canDeleteSel)}
            title={delTitle}>
            <Icon name="close" size={14} strokeWidth={2} /> <span className="rf-tl-hide-sm">{selKind === 'range' ? 'Excluir trecho' : selKind === 'video' ? 'Cortar pedaço' : 'Excluir'}</span>
          </button>
          </>}
          {selKind === 'media' && selMediaItem && (
            <>
              <button onClick={() => moveLayer(selMediaItem.key, 1)} style={toolBtn(false)} title="Coloca esta mídia por cima da camada de cima">▲ <span className="rf-tl-hide-sm">Subir camada</span></button>
              <button onClick={() => moveLayer(selMediaItem.key, -1)} disabled={!selMediaItem.layer} style={toolBtn(!selMediaItem.layer)} title="Coloca esta mídia por baixo">▼ <span className="rf-tl-hide-sm">Descer camada</span></button>
            </>
          )}
          {isMobile && <span style={{ width: 1, height: 20, background: C.border, margin: '0 2px' }} />}
          {(isMobile || cutStart != null) && <button
            onClick={toggleCutRange}
            style={cutStart == null ? toolBtn(false) : miniBtn(true, false)}
            title="Posicione o playhead, marque o início, mova e feche o corte"
          >
            <Icon name="scissors" size={14} strokeWidth={2} />
            {cutStart == null ? <span className="rf-tl-hide-sm">Cortar deste ponto</span> : `Fechar corte em ${fmtDuration(cur)}`}
          </button>}
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
          <div style={{ display: isMobile ? 'flex' : 'none', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <span className="rf-tl-hide-sm" style={{ fontSize: 11.5, color: C.faint }}>Zoom</span>
            <button onClick={() => zoomTl(-1)} disabled={pps <= fitPps} style={toolBtn(pps <= fitPps)} title="Afastar">−</button>
            <button onClick={() => zoomTl(1)} disabled={pps >= PPS_MAX} style={toolBtn(pps >= PPS_MAX)} title="Aproximar">+</button>
            <button onClick={fitAll} style={toolBtn(false)} title="Ver o vídeo inteiro">Ajustar</button>
          </div>
        </div>

        {/* Timeline: coluna fixa com o nome das faixas + área que rola */}
        <div className="rf-tl-track" style={{ position: 'relative', display: 'flex', border: `1px solid ${isMobile ? C.border : PR.line}`, borderRadius: isMobile ? 16 : 8, background: isMobile ? 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.35))' : PR.track, overflow: 'hidden', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
          {showKeys && !isMobile && (
            <div className="rf-keys" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                <b style={{ fontSize: 12 }}>Atalhos (como no Premiere)</b>
                <button onClick={() => setShowKeys(false)} className="rf-tbtn" style={{ marginLeft: 'auto', width: 22, height: 22 }} aria-label="Fechar">×</button>
              </div>
              {[
                ['V', 'Seleção'], ['C', 'Navalha (clique corta)'], ['R', 'Seleção de trecho'], ['Ctrl+K', 'Dividir no playhead'],
                ['S', 'Dividir o item selecionado'], ['Delete', 'Excluir (fecha o buraco)'], ['Q / W', 'Cortar até o ponto anterior / próximo'],
                ['I / O', 'Entrada / saída do trecho'], ['Ctrl+A', 'Selecionar tudo'], ['Espaço', 'Tocar / pausar'], ['J / K / L', 'Voltar 5 s / pausar / tocar'],
                ['← →', '1 s (Shift: 5 s)'], ['Home / End', 'Começo / fim'], ['= / −', 'Zoom da timeline'], ['\\', 'Ver o vídeo inteiro'],
                ['M', 'Marcador'], ['N', 'Ímã'], ['H', 'Ocultar legenda'], ['Ctrl+D', 'Duplicar'], ['Ctrl+C / V', 'Copiar / colar'], ['Ctrl+Z', 'Desfazer'],
              ].map(([k, d]) => (
                <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
                  <kbd>{k}</kbd><span>{d}</span>
                </div>
              ))}
            </div>
          )}
          {/* celular: cursor fixo no meio, a timeline corre por baixo */}
          {isMobile && <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, background: '#fff', zIndex: 5, pointerEvents: 'none', boxShadow: '0 0 6px rgba(0,0,0,0.6)' }} />}
          {!isMobile && (
            <div style={{ position: 'relative', width: 52, flexShrink: 0, borderRight: `1px solid ${PR.line}`, background: PR.tools }}>
            {/* as ferramentas rolam dentro da altura das faixas (não deixam a timeline mais alta) */}
            <div className="rf-tl-tools" style={{ position: 'absolute', inset: 0, overflowY: 'auto', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 0' }}>
              {/* Ferramentas (como no Premiere): escolha a ferramenta, depois aja na timeline */}
              <ToolIcon title="Seleção (V) — clique para selecionar, arraste para mover" active={!razorTool && !rangeTool} onClick={() => pickTool('select')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 8-6 1.6L10 19z" /></svg>
              </ToolIcon>
              <ToolIcon title="Navalha (C) — clique na timeline para cortar ali (vídeo e legenda)" active={razorTool} onClick={() => pickTool(razorTool ? 'select' : 'razor')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l9-9M13 11l7-7v6l-4 4M8 4l3 3" /><circle cx="6" cy="18" r="2" /></svg>
              </ToolIcon>
              <ToolIcon title="Seleção de trecho (R) — arraste para marcar o trecho em todas as faixas · I/O marcam entrada/saída" active={rangeTool} onClick={() => pickTool(rangeTool ? 'select' : 'range')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 4v16M20 4v16" /><rect x="7.5" y="7" width="9" height="10" rx="1.5" strokeDasharray="2.5 2" /></svg>
              </ToolIcon>
              <span className="rf-tsep" />
              <ToolIcon title={`Dividir no playhead (Ctrl+K · S divide ${SEL_LABEL[selKind]})`} onClick={() => razorCut(cur)}><Icon name="scissors" size={15} strokeWidth={2} /></ToolIcon>
              <ToolIcon title={delTitle} disabled={!canDeleteSel} onClick={deleteSelected}><Icon name="trash" size={15} strokeWidth={2} /></ToolIcon>
              <ToolIcon title="Cortar do ponto anterior até o playhead (Q)" onClick={() => rippleTrim('prev')}><span className="rf-tkey">Q</span></ToolIcon>
              <ToolIcon title="Cortar do playhead até o próximo ponto (W)" onClick={() => rippleTrim('next')}><span className="rf-tkey">W</span></ToolIcon>
              <span className="rf-tsep" />
              <ToolIcon title={snapOn ? 'Ímã ligado: encaixa no playhead, marcadores e pontas (N)' : 'Ímã desligado (N)'} active={snapOn} onClick={toggleSnap}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v8a6 6 0 0 0 12 0V3" /><path d="M6 7h4M14 7h4" /></svg>
              </ToolIcon>
              <ToolIcon title="Marcador no playhead (M) — de novo no mesmo ponto tira" onClick={toggleMarker}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M6 3h12v12l-6 6-6-6z" /></svg>
              </ToolIcon>
              <ToolIcon title="Duplicar o item selecionado (Ctrl+D) · Ctrl+C / Ctrl+V cola no playhead" disabled={!['media', 'text', 'vfx', 'trans', 'xcap', 'caption'].includes(selKind)} onClick={duplicateSel}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
              </ToolIcon>
              <span className="rf-tsep" />
              <ToolIcon title="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Icon name="undo" size={15} strokeWidth={2} /></ToolIcon>
              <ToolIcon title="Refazer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><Icon name="undo" size={15} strokeWidth={2} style={{ transform: 'scaleX(-1)' }} /></ToolIcon>
              <span className="rf-tsep" />
              <ToolIcon title="Ver o vídeo inteiro na timeline (\)" onClick={fitAll}><Icon name="search" size={15} strokeWidth={2} /></ToolIcon>
              <ToolIcon title="Atalhos do teclado (?)" active={showKeys} onClick={() => setShowKeys((v) => !v)}><span className="rf-tkey">?</span></ToolIcon>
            </div>
            </div>
          )}
          <div className="rf-tl-labels" style={{ width: isMobile ? 150 : 140, flexShrink: 0, borderRight: `1px solid ${PR.line}`, background: PR.heads, paddingBottom: 6 }}>
            <div style={{ height: LANE.ruler, borderBottom: `1px solid ${PR.line}`, background: PR.ruler }} />
            {showChapLane && <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('capitulos', e)} onResetSize={() => resetLane('capitulos')} h={LANE.capitulos} gap={4} code="CH" nome="Capítulos" />}
            <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('legenda', e)} onResetSize={() => resetLane('legenda')} h={legH} gap={6} code="C1" nome="Legenda" hidden={cap.captions === false} onEye={() => setCap((c) => ({ ...c, captions: c.captions === false }))} locked={laneLock.leg} onLock={() => togLock('leg')} />
            {extraCaps.length > 0 && <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('xcap', e)} onResetSize={() => resetLane('xcap')} h={LANE.xcap} gap={4} code="C2" nome="Suas legendas" hidden={laneHide.xcap} onEye={() => togHide('xcap')} locked={laneLock.xcap} onLock={() => togLock('xcap')} />}
            {media.length > 0 && Array.from({ length: mediaRows }, (_, r) => mediaRows - 1 - r).map((l) => (
              <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('midias', e)} onResetSize={() => resetLane('midias')} key={l} h={LANE.midias} gap={l === mediaRows - 1 ? 4 : 0} code={`M${l + 1}`} nome={`Camada ${l + 1}`} hidden={laneHide[`m${l}`]} onEye={() => togHide(`m${l}`)} locked={laneLock[`m${l}`]} onLock={() => togLock(`m${l}`)} />
            ))}
            {textLayers.length > 0 && <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('txt', e)} onResetSize={() => resetLane('txt')} h={LANE.txt} gap={4} code="T1" nome="Textos" hidden={laneHide.txt} onEye={() => togHide('txt')} locked={laneLock.txt} onLock={() => togLock('txt')} />}
            {fxMoments.length > 0 && <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('vfx', e)} onResetSize={() => resetLane('vfx')} h={LANE.vfx} gap={4} code="FX" nome="Efeitos" hidden={laneHide.vfx} onEye={() => togHide('vfx')} locked={laneLock.vfx} onLock={() => togLock('vfx')} />}
            {showBrollLane && <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('broll', e)} onResetSize={() => resetLane('broll')} h={LANE.broll} gap={4} code="V2" nome="B-roll" hidden={!brollOn} onEye={() => setBrollOn((v) => !v)} locked={laneLock.broll} onLock={() => togLock('broll')} />}
            {showZoomLane && <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('zoom', e)} onResetSize={() => resetLane('zoom')} h={LANE.zoom} gap={4} code="ZM" nome="Zoom" locked={laneLock.zoom} onLock={() => togLock('zoom')} />}
            {transformKeys.length > 0 && <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('kf', e)} onResetSize={() => resetLane('kf')} h={LANE.kf} gap={4} code="KF" nome="Quadros" locked={laneLock.kf} onLock={() => togLock('kf')} />}
            <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('video', e)} onResetSize={() => resetLane('video')} h={LANE.video} gap={4} code="V1" active nome="Vídeo" locked={laneLock.vid} onLock={() => togLock('vid')} />
            <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('audio', e)} onResetSize={() => resetLane('audio')} h={LANE.audio} gap={4} code="A1" active nome="Áudio" muted={audioMute} onMute={() => setAudioMute((v) => !v)} locked={laneLock.aud} onLock={() => togLock('aud')} />
            <TrackHead onResize={isMobile ? undefined : (e) => startLaneResize('pausas', e)} onResetSize={() => resetLane('pausas')} h={LANE.pausas} gap={4} code="P" nome="Pausas" locked={laneLock.pau} onLock={() => togLock('pau')} />
          </div>
          <div ref={trackRef} onClick={onTrackClick} onScroll={onTrackScroll} onTouchStart={onTrackTouchStart} onTouchMove={onTrackTouchMove} onTouchEnd={onTrackTouchEnd}
            style={{ position: 'relative', overflowX: 'auto', overflowY: 'hidden', flex: 1, minWidth: 0, paddingBottom: 6, ...(isMobile ? { display: 'flex', scrollbarWidth: 'none' } : {}) }}>
            {isMobile && <div style={{ flex: '0 0 50%' }} />}
            <div ref={contentRef} onMouseDown={startMarquee} onDragOver={onTimelineDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropT(null); }} onDrop={onTimelineDrop} style={{ position: 'relative', flex: '0 0 auto', width, height: LANE.ruler + (showChapLane ? 4 + LANE.capitulos : 0) + 6 + legH + (extraCaps.length ? 4 + LANE.xcap : 0) + 4 + LANE.video + (transformKeys.length ? 4 + LANE.kf : 0) + (showZoomLane ? 4 + LANE.zoom : 0) + (showBrollLane ? 4 + LANE.broll : 0) + (textLayers.length ? 4 + LANE.txt : 0) + (fxMoments.length ? 4 + LANE.vfx : 0) + 4 + LANE.audio + (isMobile ? 0 : 4 + LANE.pausas) + (media.length ? 4 + LANE.midias * mediaRows : 0) }}>
            {/* ferramenta de seleção: arrastar em qualquer faixa marca o trecho (todas as faixas) */}
            {razorTool && !isMobile && (
              <div onMouseMove={(e) => setRazorT(timeAtClientX(e.clientX))} onMouseLeave={() => setRazorT(null)}
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                onClick={(e) => { e.stopPropagation(); razorCut(timeAtClientX(e.clientX)); }}
                title="Navalha: clique para cortar aqui (vídeo e legenda) · V volta para a seleção"
                style={{ position: 'absolute', left: 0, right: 0, top: LANE.ruler, bottom: 0, zIndex: 18, cursor: 'crosshair' }} />
            )}
            {razorTool && razorT != null && (
              <div style={{ position: 'absolute', left: X(razorT), top: LANE.ruler, bottom: 0, width: 0, borderLeft: '1.5px dashed #FF6B35', pointerEvents: 'none', zIndex: 19 }} />
            )}
            {rangeTool && !isMobile && (
              <div onMouseDown={(e) => startRangeSel(e)} title="Arraste para selecionar o trecho em todas as faixas · Delete corta vídeo, áudio e legenda · Esc sai"
                style={{ position: 'absolute', left: 0, right: 0, top: LANE.ruler, bottom: 0, zIndex: 18, cursor: 'col-resize', background: 'rgba(59,130,246,0.04)' }} />
            )}
            {(selKind === 'range' || selKind === 'words') && range && range.b > range.a && (
              <>
                {/* como o Premiere: régua clara entre a entrada e a saída, faixas levemente destacadas */}
                <div style={{ position: 'absolute', left: X(range.a), width: Math.max(2, W(range.a, range.b)), top: 0, height: LANE.ruler, zIndex: 4, pointerEvents: 'none', background: 'rgba(255,255,255,0.26)' }} />
                <div style={{ position: 'absolute', left: X(range.a), width: Math.max(2, W(range.a, range.b)), top: LANE.ruler, bottom: 0, zIndex: 19, pointerEvents: 'none',
                  background: 'rgba(255,255,255,0.07)', borderLeft: '1px solid rgba(255,255,255,0.45)', borderRight: '1px solid rgba(255,255,255,0.45)' }} />
                {['a', 'b'].map((edge) => (
                  <div key={edge} onMouseDown={(e) => startRangeSel(e, edge)} title={edge === 'a' ? 'Arraste a entrada do trecho (I no playhead)' : 'Arraste a saída do trecho (O no playhead)'}
                    style={{ position: 'absolute', left: X(range[edge]) - (edge === 'a' ? 1 : 6), top: 0, width: 7, height: LANE.ruler, zIndex: 20, cursor: 'ew-resize',
                      borderTop: '2px solid #E5E7EB', borderBottom: '2px solid #E5E7EB', [edge === 'a' ? 'borderLeft' : 'borderRight']: '2px solid #E5E7EB', boxSizing: 'border-box' }} />
                ))}
              </>
            )}
            {marq && (
              <div style={{ position: 'absolute', left: Math.min(marq.x0, marq.x1), top: Math.min(marq.y0, marq.y1), width: Math.abs(marq.x1 - marq.x0), height: Math.max(2, Math.abs(marq.y1 - marq.y0)), zIndex: 21, pointerEvents: 'none',
                background: 'rgba(59,130,246,0.28)', border: '1px solid rgba(96,165,250,0.9)' }} />
            )}
            <div onMouseDown={(e) => startRangeSel(e)} title={isMobile ? undefined : 'Clique para ir · arraste para selecionar um trecho em todas as faixas'}
              style={{ position: 'relative', height: LANE.ruler, borderBottom: `1px solid ${PR.line}`, cursor: 'crosshair', background: isMobile ? 'transparent' : PR.ruler }}>
              {(() => {
                const step = RULER_STEPS.find((x) => x * pps >= 96) || 60;
                const minor = pps >= 30 ? 1 : step / 5;
                return Array.from({ length: Math.ceil(progDur / minor) + 1 }, (_, i) => +(i * minor).toFixed(3)).map((t) => {
                  const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
                  return (
                    <div key={t} style={{ position: 'absolute', left: t * pps, bottom: 0, height: major ? 12 : 5, borderLeft: `1px solid ${major ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.16)'}` }}>
                      {major && <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 9.5, color: PR.dim, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{isMobile ? mmss(t) : tcode(t)}</span>}
                    </div>
                  );
                });
              })()}
              {markers.map((mk) => {
                const on = selKind === 'marker' && selMarker === mk.key;
                return (
                  <div key={mk.key} title={`Marcador em ${tcode(mk.t)} — clique para ir · Delete apaga · M no mesmo ponto tira`}
                    onClick={(e) => { e.stopPropagation(); seek(mk.t); setSelMarker(mk.key); setSelKind('marker'); }}
                    style={{ position: 'absolute', left: X(mk.t) - 6, top: 2, width: 12, height: 14, zIndex: 7, cursor: 'pointer', background: on ? '#fff' : '#3CC46B', clipPath: 'polygon(0 0, 100% 0, 100% 62%, 50% 100%, 0 62%)' }} />
                );
              })}
            </div>
            {showChapLane && (
              <div style={{ position: 'relative', height: LANE.capitulos, marginTop: 4 }}>
                {chapters.map((c) => (
                  <button key={c.label} onClick={(e) => { e.stopPropagation(); seek(c.start + 0.01); }} title={`${c.label} · ${mmss(c.start)}–${mmss(c.end)}`}
                    style={{ position: 'absolute', left: X(c.start) + 1, width: Math.max(20, W(c.start, c.end) - 2), top: 2, bottom: 2, borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: `linear-gradient(180deg, ${c.color}, ${c.color}cc)`, color: '#fff', fontSize: 11, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', padding: '0 10px', textAlign: 'left', boxShadow: `0 4px 12px -6px ${c.color}` }}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <div style={{ position: 'relative', height: legH, marginTop: 6, ...LANE_ROW, ...(cap.captions === false ? LANE_HIDDEN : null), ...lk('leg') }} onMouseDown={(e) => { e.stopPropagation(); startCapBand(e); }}
              title="Arraste no espaço vazio para selecionar várias legendas">
              {capBand && Math.abs(capBand.b - capBand.a) > 0.02 && (
                <div style={{ position: 'absolute', left: X(Math.min(capBand.a, capBand.b)), width: W(Math.min(capBand.a, capBand.b), Math.max(capBand.a, capBand.b)), top: 2, bottom: 2, background: 'rgba(255,255,255,0.12)', border: '1px dashed #fff', borderRadius: 4, pointerEvents: 'none', zIndex: 3 }} />
              )}
              {segments.map((s0, si) => {
                const s = capSegments[si] || s0; // no tempo da legenda (pode ter sido movida)
                if (ripple && W(s.start, Math.max(s.end, s.start + 0.2)) < 1) return null; // excluída: some da timeline
                const left = X(s.start);
                const fullW = Math.max(10, W(s.start, Math.max(s.end, s.start + 0.2)) - 2);
                const gone = segRemoved(s);
                const isSel = selKind === 'caption' && selCaptions.includes(si);
                const isActive = si === activeIndex;
                const kr = keptRange(s);
                const hid = !gone && segHidden(s);
                return (
                  <div key={si} onMouseDown={(e) => startCapMove(si, e)} onClick={(e) => { e.stopPropagation(); if (capClickBlockRef.current) return; selectCaption(si, e); if (isMobile) setMTool('legenda'); }}
                    title={`${s.words.map((x) => x.word).join(' ')}${hid ? ' (legenda oculta)' : ''} — arraste para mover · pontas mudam quando aparece · Ctrl/Shift+clique seleciona vários`}
                    style={{ opacity: hid ? 0.45 : 1, ...(isMobile ? {
                      // celular: blocos âmbar como no CapCut; o selecionado ganha borda branca
                      position: 'absolute', left, width: fullW, top: 4, height: legH - 8, borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', border: isSel ? '2px solid #fff' : '1px solid rgba(0,0,0,0.25)',
                      background: gone ? 'rgba(240,82,107,0.35)' : '#E8A020', color: gone ? '#fff' : '#2a1800',
                    } : {
                      // computador: como a faixa de texto do CapCut/Premiere — um bloco por
                      // legenda (o cartão que aparece no vídeo), com o ícone de texto
                      position: 'absolute', left, width: fullW, top: 4, height: legH - 8, borderRadius: 5, cursor: 'pointer',
                      outline: isSel ? '2px solid #fff' : hid ? '1px dashed rgba(255,255,255,0.5)' : 'none', outlineOffset: 1, zIndex: isSel ? 2 : 1,
                    }) }}>
                    {/* máscaras das pontas cortadas (trim) */}
                    {kr && !gone && kr[0] > s.start + 0.01 && (
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: W(s.start, kr[0]), background: 'rgba(240,82,107,0.22)', borderRight: `1px dashed ${C.red}` }} />
                    )}
                    {kr && !gone && kr[1] < s.end - 0.01 && (
                      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: W(kr[1], s.end), background: 'rgba(240,82,107,0.22)', borderLeft: `1px dashed ${C.red}` }} />
                    )}
                    {isMobile ? (
                      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textDecoration: gone ? 'line-through' : 'none' }}>
                        <Icon name="captions" size={13} strokeWidth={2} /> {s.words.filter((x) => !x.removed || gone).map((x) => x.word).join(' ')}
                      </span>
                    ) : (
                    capCards(s, gone).map((card, ci) => {
                      const on = isActive && cur >= card.start && cur < card.end;
                      return (
                        <div key={ci} onClick={(e) => pickCard(si, ci, card, e)} style={{
                          position: 'absolute', left: X(card.start) - X(s.start), width: Math.max(4, W(card.start, card.end) - 3), top: 0, bottom: 0,
                          borderRadius: 5, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px',
                          background: gone ? 'rgba(240,82,107,0.28)' : on ? '#D0603F' : '#A9472F', color: gone ? C.red : '#fff',
                          border: `1px solid ${gone ? 'rgba(240,82,107,0.5)' : 'rgba(0,0,0,0.25)'}`, boxShadow: on ? '0 0 0 1px rgba(255,255,255,0.35) inset' : 'none',
                        }}>
                          {W(card.start, card.end) > 26 && (
                            <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: -0.3, background: 'rgba(0,0,0,0.22)', borderRadius: 3, padding: '1px 3px', lineHeight: 1.1 }}>A≡</span>
                          )}
                          <span style={{ minWidth: 0, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: gone ? 'line-through' : 'none' }}>{card.text}</span>
                        </div>
                      );
                    })
                    )}
                    {/* alças de trim (só no bloco principal selecionado) */}
                    {isSel && si === sel && !gone && (
                      <>
                        <div onMouseDown={(e) => { capMoveRef.current = null; startDrag(si, 'left', e); }} onClick={(e) => e.stopPropagation()} style={handleStyle('left')} />
                        <div onMouseDown={(e) => { capMoveRef.current = null; startDrag(si, 'right', e); }} onClick={(e) => e.stopPropagation()} style={handleStyle('right')} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Faixa SUAS LEGENDAS: legendas adicionadas à mão (arraste move, pontas mudam o tempo) */}
            {extraCaps.length > 0 && (
              <div style={{ position: 'relative', height: LANE.xcap, marginTop: 4, ...LANE_ROW, ...(laneHide.xcap || cap.captions === false ? LANE_HIDDEN : null), ...lk('xcap') }}>
                {extraCaps.map((c) => {
                  const on = selKind === 'xcap' && selXcap === c.key;
                  const pick = () => { setSelXcap(c.key); setSelKind('xcap'); };
                  return (
                    <div key={c.key} title={`${c.text} — arraste para mover · pontas mudam o tempo · Ctrl+C / Ctrl+V copia e cola`}
                      onMouseDown={(e) => { pick(); startRangeDrag(setExtraCaps, c, 'move', e); }}
                      onClick={(e) => { e.stopPropagation(); pick(); setTab('legenda'); setCapPane('lista'); if (isMobile) setMTool('legenda'); seek(c.start + 0.05); }}
                      onDoubleClick={(e) => { e.stopPropagation(); pick(); setTab('legenda'); setCapPane('lista'); setXcapFocus(c.key); }}
                      style={{ position: 'absolute', left: X(c.start), width: Math.max(16, W(c.start, c.end) - 1), top: 0, bottom: 0, borderRadius: 5, display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap',
                        border: `1px solid ${on ? '#fff' : '#FF8A5C'}`, background: on ? '#E0663F' : 'rgba(224,102,63,0.55)', fontSize: 10.5, fontWeight: 700, color: '#fff' }}>
                      <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, background: 'rgba(0,0,0,0.22)', borderRadius: 3, padding: '1px 3px', lineHeight: 1.1 }}>A+</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.text}</span>
                      <div onMouseDown={(e) => { pick(); startRangeDrag(setExtraCaps, c, 'left', e); }} style={handleStyle('left')} />
                      <div onMouseDown={(e) => { pick(); startRangeDrag(setExtraCaps, c, 'right', e); }} style={handleStyle('right')} />
                    </div>
                  );
                })}
              </div>
            )}
            {/* Lane das minhas mídias — arraste para mover, pontas para redimensionar */}
            {media.length > 0 && (
              <div style={{ position: 'relative', height: LANE.midias * mediaRows, marginTop: 4 }}>
                {Array.from({ length: mediaRows - 1 }, (_, r) => (
                  <div key={r} style={{ position: 'absolute', left: 0, right: 0, top: (r + 1) * LANE.midias - 1, borderTop: `1px dashed ${C.border}`, pointerEvents: 'none' }} />
                ))}
                {media.map((m) => {
                  const left = X(m.start);
                  const w = Math.max(16, W(m.start, m.start + m.duration) - 1);
                  const col = m.kind === 'audio' ? C.purple : m.kind === 'video' ? C.orange : '#22D3EE';
                  const isSelM = selKind === 'media' && selMedia === m.key;
                  return (
                    <div
                      key={m.key}
                      onMouseDown={(e) => startMediaDrag(m, 'move', e)}
                      onClick={(e) => { e.stopPropagation(); setSelMedia(m.key); setSelKind('media'); seek(m.start); }}
                      title={`${m.filename} — arraste para os lados (tempo) ou para cima/baixo (camada); pontas ajustam a duração`}
                      style={{
                        position: 'absolute', left, top: (mediaRows - 1 - (m.layer || 0)) * LANE.midias, width: w, height: 28, borderRadius: 7, overflow: 'hidden',
                        cursor: 'grab', display: 'flex', alignItems: 'center', gap: 5, padding: '0 9px',
                        background: m.offline ? 'rgba(240,82,107,0.18)' : `${col}2b`, border: m.offline ? `1px dashed ${C.red}` : isSelM ? '1.5px solid #fff' : `1px solid ${col}`, boxShadow: isSelM ? `0 0 0 2px ${col}66` : 'none', color: C.text, userSelect: 'none',
                        ...(laneHide[`m${m.layer || 0}`] ? LANE_HIDDEN : null), ...lk(`m${m.layer || 0}`),
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
            {/* Faixa TEXTOS: textos livres (arraste para mover, pontas mudam o tempo) */}
            {textLayers.length > 0 && (
              <div style={{ position: 'relative', height: LANE.txt, marginTop: 4, ...LANE_ROW, ...(laneHide.txt ? LANE_HIDDEN : null), ...lk('txt') }}>
                {textLayers.map((l) => {
                  const on = selKind === 'text' && selText === l.key;
                  return (
                    <div key={l.key} title={`${l.text} — arraste para mover, pontas mudam o tempo`}
                      onMouseDown={(e) => { setSelText(l.key); setSelKind('text'); startRangeDrag(setTextLayers, l, 'move', e); }}
                      onClick={(e) => { e.stopPropagation(); setSelText(l.key); setSelKind('text'); setTab('texto'); seek(l.start + 0.05); }}
                      style={{ position: 'absolute', left: X(l.start), width: Math.max(16, W(l.start, l.end) - 1), top: 0, bottom: 0, borderRadius: 5, display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap',
                        border: `1px solid ${on ? '#fff' : '#E8A020'}`, background: on ? 'rgba(232,160,32,0.6)' : 'rgba(232,160,32,0.3)', fontSize: 10, fontWeight: 700, color: C.text }}>
                      <Icon name="type" size={10} strokeWidth={2.4} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.text.split('\n')[0]}</span>
                      <div onMouseDown={(e) => startRangeDrag(setTextLayers, l, 'left', e)} style={handleStyle('left')} />
                      <div onMouseDown={(e) => startRangeDrag(setTextLayers, l, 'right', e)} style={handleStyle('right')} />
                    </div>
                  );
                })}
              </div>
            )}
            {/* Faixa EFEITOS: efeitos de vídeo só nesses trechos */}
            {fxMoments.length > 0 && (
              <div style={{ position: 'relative', height: LANE.vfx, marginTop: 4, ...LANE_ROW, ...(laneHide.vfx ? LANE_HIDDEN : null), ...lk('vfx') }}>
                {fxMoments.map((m) => {
                  const on = selKind === 'vfx' && selFx === m.key;
                  return (
                    <div key={m.key} title={`${VIDEO_FX[m.effect]} — arraste para mover, pontas mudam a duração`}
                      onMouseDown={(e) => { setSelFx(m.key); setSelKind('vfx'); startRangeDrag(setFxMoments, m, 'move', e); }}
                      onClick={(e) => { e.stopPropagation(); setSelFx(m.key); setSelKind('vfx'); setTab('efeitos'); seek(m.start + 0.05); }}
                      style={{ position: 'absolute', left: X(m.start), width: Math.max(16, W(m.start, m.end) - 1), top: 0, bottom: 0, borderRadius: 5, display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap',
                        border: `1px solid ${on ? '#fff' : '#A855F7'}`, background: on ? 'rgba(168,85,247,0.6)' : 'rgba(168,85,247,0.3)', fontSize: 10, fontWeight: 700, color: C.text }}>
                      <Icon name="sparkles" size={10} strokeWidth={2.4} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{VIDEO_FX[m.effect]}</span>
                      <div onMouseDown={(e) => startRangeDrag(setFxMoments, m, 'left', e)} style={handleStyle('left')} />
                      <div onMouseDown={(e) => startRangeDrag(setFxMoments, m, 'right', e)} style={handleStyle('right')} />
                    </div>
                  );
                })}
              </div>
            )}
            {/* Faixa B-ROLL: momentos revisados (clique abre o ajuste; arraste move) */}
            {showBrollLane && (
              <div style={{ position: 'relative', height: LANE.broll, marginTop: 4, ...LANE_ROW, opacity: brollOn ? 1 : 0.35, ...lk('broll') }} title={brollOn ? undefined : 'B-roll desligado (aba B-roll)'}>
                {brollReview.moments.map((m, i) => {
                  const isSel = i === selBroll;
                  const th = thumbOf(m);
                  return (
                    <div
                      key={m.key || i}
                      title={`${m.term} — clique para ajustar`}
                      onMouseDown={(e) => { setSelBroll(i); setSelKind('broll'); startRangeDrag(setBrollMoments, m, 'move', e); }}
                      onClick={(e) => { e.stopPropagation(); setSelBroll(i); setSelKind('broll'); setTab('broll'); seek(m.start + 0.05); }}
                      style={{
                        position: 'absolute', left: X(m.start), width: Math.max(16, W(m.start, m.end) - 1), top: 0, bottom: 0, borderRadius: 5,
                        display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px', cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap',
                        border: `1px solid ${isSel ? '#fff' : C.purpleSoft}`, background: m.removed ? 'rgba(255,255,255,0.05)' : isSel ? 'rgba(194,65,12,0.55)' : 'rgba(194,65,12,0.3)',
                        opacity: m.removed ? 0.5 : 1, fontSize: 10, fontWeight: 700, color: C.text,
                      }}
                    >
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setMoment(i, { removed: !m.removed }); }}
                        title={m.removed ? 'Usar este B-roll' : 'Não usar este B-roll'}
                        aria-label={m.removed ? 'Usar este B-roll' : 'Não usar este B-roll'}
                        style={{ width: 16, height: 16, flexShrink: 0, borderRadius: '50%', border: `1.5px solid ${m.removed ? C.faint : '#fff'}`, background: m.removed ? 'transparent' : C.green, padding: 0, cursor: 'pointer' }}
                      />
                      {th && !badThumbs.has(th) && <img src={th} alt="" style={{ height: 20, width: 20, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: m.removed ? 'line-through' : 'none' }}>{m.term}</span>
                      <div onMouseDown={(e) => startRangeDrag(setBrollMoments, m, 'left', e)} style={handleStyle('left')} />
                      <div onMouseDown={(e) => startRangeDrag(setBrollMoments, m, 'right', e)} style={handleStyle('right')} />
                    </div>
                  );
                })}
              </div>
            )}
            {/* Faixa ZOOM: momentos-chave do movimento (editáveis) */}
            {showZoomLane && (
              <div style={{ position: 'relative', height: LANE.zoom, marginTop: 4, ...LANE_ROW, ...lk('zoom') }}>
                {(zoomMoments || []).map((z) => {
                  const isSel = z.key === selZoom;
                  return (
                    <div
                      key={z.key}
                      title={`Zoom ${Number(z.scale || MOTION_Z[fx.motionIntensity] || 1.12).toFixed(2)}× — clique para ajustar, arraste para mover`}
                      onMouseDown={(e) => { setSelZoom(z.key); setSelKind('zoom'); startRangeDrag(setZoomMoments, z, 'move', e); }}
                      onClick={(e) => { e.stopPropagation(); setSelZoom(z.key); setSelKind('zoom'); setTab('efeitos'); seek(z.start); }}
                      style={{
                        position: 'absolute', left: X(z.start), width: Math.max(14, W(z.start, z.end) - 1), top: 0, bottom: 0, borderRadius: 5,
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
            {/* Faixa dos quadros-chave (Transformar): ◆ clique seleciona, arraste move, Delete apaga */}
            {transformKeys.length > 0 && (
              <div style={{ position: 'relative', height: LANE.kf, marginTop: 4, ...LANE_ROW, ...lk('kf') }}>
                {transformKeys.length > 1 && (
                  <div style={{ position: 'absolute', left: X(transformKeys[0].t), width: W(transformKeys[0].t, transformKeys[transformKeys.length - 1].t), top: LANE.kf / 2 - 1, height: 2, background: 'rgba(34,211,238,0.45)' }} />
                )}
                {transformKeys.map((k) => {
                  const on = selKind === 'keyframe' && selKey === k.t;
                  return (
                    <div key={k.t} onMouseDown={(e) => startKeyDrag(k, e)} onClick={(e) => { e.stopPropagation(); setSelKind('keyframe'); setSelKey(k.t); setTab('efeitos'); seek(k.t); }}
                      title={`Quadro-chave em ${fmtDuration(k.t)} · escala ${Math.round(k.scale * 100)}% · X ${Math.round(k.x * 100)} · Y ${Math.round(k.y * 100)} · ${Math.round(k.rot)}° — arraste para mover, Delete apaga`}
                      style={{ position: 'absolute', left: X(k.t) - 7, top: LANE.kf / 2 - 7, width: 14, height: 14, transform: 'rotate(45deg)', borderRadius: 2, cursor: 'grab',
                        background: on ? '#fff' : '#22D3EE', border: `2px solid ${on ? '#22D3EE' : 'rgba(0,0,0,0.5)'}`, boxShadow: on ? '0 0 0 3px rgba(34,211,238,0.35)' : 'none' }} />
                  );
                })}
              </div>
            )}
            {/* Faixa de vídeo: miniaturas + cortes desenhados arrastando */}
            <div
              onMouseDown={startCutDraw}
              title="Arraste para selecionar um trecho (Delete exclui) · clique seleciona o pedaço"
              style={{ position: 'relative', height: LANE.video, marginTop: 4, borderRadius: 6, overflow: 'hidden', border: `1px solid ${isMobile ? C.border : '#3B6FD6'}`, background: 'rgba(0,0,0,0.45)', cursor: 'crosshair', ...lk('vid') }}
            >
              {keptPieces.map(([a, b]) => (
                <div key={a} style={{ position: 'absolute', top: 0, bottom: 0, left: X(a), width: W(a, b), backgroundImage: `url(${filmstripUrl(sourceId)})`, backgroundSize: `${dur * pps}px 100%`, backgroundPosition: `${-a * pps}px 0`, backgroundRepeat: 'no-repeat', boxShadow: gaps.length ? 'inset -1px 0 0 rgba(0,0,0,0.6)' : 'none' }} />
              ))}
              {speedRanges.map((r) => {
                const on = selKind === 'speed' && selSpeed === r.key;
                return (
                  <div key={r.key} title={`Velocidade ${r.speed}× — clique para ajustar (aba Efeitos), Delete volta ao normal`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setSelSpeed(r.key); setSelKind('speed'); setTab('efeitos'); }}
                    style={{ position: 'absolute', left: X(r.start), width: Math.max(14, W(r.start, r.end)), top: 0, height: 15, zIndex: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: '0 5px', overflow: 'hidden', whiteSpace: 'nowrap',
                      background: on ? '#fff' : 'rgba(255,170,0,0.92)', color: '#1a1000', fontSize: 9.5, fontWeight: 800, borderRadius: '0 0 4px 4px' }}>
                    {r.speed < 1 ? '🐢' : '⏩'} {r.speed}×
                  </div>
                );
              })}
              {freezes.map((f) => {
                const on = selKind === 'freeze' && selFreeze === f.key;
                return (
                  <div key={f.key} title={`Congela ${f.dur} s em ${fmtDuration(f.t)} — clique para ajustar, Delete apaga`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setSelFreeze(f.key); setSelKind('freeze'); setTab('efeitos'); seek(f.t); }}
                    style={{ position: 'absolute', left: X(f.t) - 1, bottom: 0, height: 16, zIndex: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, padding: '0 5px', whiteSpace: 'nowrap',
                      background: on ? '#fff' : 'rgba(96,165,250,0.95)', color: '#04122a', fontSize: 9.5, fontWeight: 800, borderRadius: '4px 4px 0 0', borderLeft: '2px solid #fff' }}>
                    ❄ {f.dur}s
                  </div>
                );
              })}
              {ripple && cuts.map((c) => (
                <div key={c.key} title={`Trecho excluído (${fmtDuration(c.start)} → ${fmtDuration(c.end)}, ${(c.end - c.start).toFixed(1).replace('.', ',')} s) — × traz de volta`}
                  onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
                  style={{ position: 'absolute', left: X(c.start) - 1, top: 0, bottom: 0, width: 2, background: C.red, zIndex: 3 }}>
                  <button onClick={(e) => { e.stopPropagation(); setCuts((l) => l.filter((x) => x.key !== c.key)); }} title="Trazer este trecho de volta"
                    style={{ position: 'absolute', top: 2, left: -8, width: 18, height: 16, padding: 0, borderRadius: 4, border: 'none', background: C.red, color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                </div>
              ))}
              {!ripple && cuts.map((c) => (
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
              {/* transições manuais: um marcador por transição (clique seleciona, arraste move) */}
              {transitions.map((tr) => {
                const on = selKind === 'trans' && selTrans === tr.key;
                return (
                  <div key={tr.key} title={`${catalog?.transitions?.find((o) => o.id === tr.type)?.label || tr.type} em ${fmtDuration(tr.t)} — arraste para mover, Delete apaga`}
                    onMouseDown={(e) => { e.stopPropagation(); setSelTrans(tr.key); setSelKind('trans'); transDragRef.current = { key: tr.key, x0: e.clientX, t0: tr.t }; }}
                    onClick={(e) => { e.stopPropagation(); setSelTrans(tr.key); setSelKind('trans'); setTab('efeitos'); }}
                    style={{ position: 'absolute', left: X(tr.t) - 9, top: '50%', marginTop: -9, width: 18, height: 18, borderRadius: 5, zIndex: 3, cursor: 'grab', display: 'grid', placeItems: 'center',
                      background: on ? '#fff' : '#A855F7', border: `2px solid ${on ? '#A855F7' : 'rgba(0,0,0,0.5)'}`, color: on ? '#A855F7' : '#fff', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>⧓</div>
                );
              })}
              {/* pedaço selecionado + divisões (S/Ctrl+B na faixa de vídeo) */}
              {selKind === 'video' && selVideo && (
                <div style={{ position: 'absolute', left: X(selVideo.start), width: W(selVideo.start, selVideo.end), top: 0, bottom: 0, border: '2px solid #fff', borderRadius: 4, boxShadow: `inset 0 0 0 2px ${C.orange}`, pointerEvents: 'none' }} />
              )}
              {vsplits.map((t) => (
                <div key={t} style={{ position: 'absolute', left: X(t) - 1, top: 0, bottom: 0, width: 2, background: '#fff' }}>
                  <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setVsplits((l) => l.filter((x) => x !== t)); setSelVideo(null); }}
                    title="Desfazer esta divisão"
                    style={{ position: 'absolute', top: 1, left: -7, width: 16, height: 14, padding: 0, borderRadius: 4, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                </div>
              ))}
              {cutStart != null && Math.abs(cur - cutStart) > 0.02 && (
                <div style={{ position: 'absolute', left: X(Math.min(cutStart, cur)), width: W(Math.min(cutStart, cur), Math.max(cutStart, cur)), top: 0, bottom: 0, background: 'rgba(240,82,107,0.22)', border: `1px dashed ${C.red}`, pointerEvents: 'none' }} />
              )}
              {drawing && drawing.end > drawing.start && (
                <div style={{ position: 'absolute', left: X(drawing.start), width: W(drawing.start, drawing.end), top: 0, bottom: 0, background: 'rgba(59,130,246,0.3)', border: '1px solid #3B82F6', pointerEvents: 'none' }} />
              )}
            </div>
            {/* Faixa de áudio: forma de onda da fala original */}
            <div style={{ position: 'relative', height: LANE.audio, marginTop: 4, borderRadius: 6, overflow: 'hidden', border: `1px solid ${isMobile ? C.border : 'rgba(52,195,176,0.55)'}`, background: isMobile ? 'rgba(59,130,246,0.08)' : 'rgba(52,195,176,0.12)', ...(audioMute ? LANE_HIDDEN : null), ...lk('aud') }}>
              {/* cortes da faixa de vídeo também tiram o áudio daquele pedaço */}
              {!ripple && cuts.map((c) => (
                <div key={c.key} style={{ position: 'absolute', left: c.start * pps, width: Math.max(2, (c.end - c.start) * pps), top: 0, bottom: 0, zIndex: 2, pointerEvents: 'none',
                  background: 'repeating-linear-gradient(45deg, rgba(240,82,107,0.45), rgba(240,82,107,0.45) 5px, rgba(240,82,107,0.2) 5px, rgba(240,82,107,0.2) 10px)', borderLeft: `1px solid ${C.red}`, borderRight: `1px solid ${C.red}` }} />
              ))}
              {wave && keptPieces.map(([a, b]) => (
                <div key={a} style={{ position: 'absolute', top: 0, left: X(a), width: W(a, b), height: LANE.audio - 2, overflow: 'hidden' }}>
                  <svg width={dur * pps} height={LANE.audio - 2} viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" style={{ display: 'block', marginLeft: -a * pps }}>
                    <path d={wave} fill={isMobile ? '#4F7BFF' : '#34C3B0'} opacity={0.85} />
                  </svg>
                </div>
              ))}
              {gains.map((g) => {
                const left = X(g.start);
                const w = Math.max(16, W(g.start, g.end) - 1);
                const mudo = Number(g.volume) < 0.005;
                return (
                  <div
                    key={g.key}
                    title={`Volume ${mudo ? 'mudo' : `${Number(g.volume).toFixed(2)}×`}`}
                    onMouseDown={(e) => { setSelGain(g.key); setSelKind('gain'); startRangeDrag(setGains, g, 'move', e); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute', left, width: w, top: 0, bottom: 0, borderRadius: 5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab',
                      border: selKind === 'gain' && selGain === g.key ? '1.5px solid #fff' : `1px solid ${mudo ? C.red : C.orange}`,
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
            {!isMobile && <div style={{ position: 'relative', height: LANE.pausas, marginTop: 4, ...LANE_ROW, ...lk('pau') }}>
              {/* tosses/pigarros/estalos achados no áudio: saem do vídeo (como no final) */}
              {cutCoughs && (preciseNow?.noises || []).map((n) => (
                <div key={`n${n.start}`} onClick={(e) => { e.stopPropagation(); toggleNoise(n); }}
                  title={n.kept
                    ? `Som de ${(n.end - n.start).toFixed(1)}s restaurado — fica no vídeo (clique p/ cortar de novo)`
                    : `${n.kind === 'tosse' ? 'Tosse/ruído' : 'Som sem fala (tosse, pigarro, "hum")'} de ${(n.end - n.start).toFixed(1)}s — sai do vídeo (clique p/ restaurar)`}
                  style={{ position: 'absolute', left: X(n.start), width: Math.max(6, W(n.start, n.end)), top: 2, height: Math.max(8, LANE.pausas - 6), borderRadius: 4, cursor: 'pointer', zIndex: 3,
                    background: n.kept ? 'transparent' : 'rgba(240,82,107,0.8)', border: n.kept ? '1.5px dashed #FFB067' : 'none', boxShadow: n.kept ? 'none' : '0 0 0 1px rgba(255,255,255,0.35) inset' }} />
              ))}
              {pauses.map((p, pi) => {
                const cut = isPauseCut(p);
                if (ripple && W(p.start, p.end) < 1) return null;
                const w = Math.max(6, W(p.start, p.end) - 1);
                // parte que sai de verdade (cortes precisos); o resto da pausa tem som de
                // fala e fica
                const real = cut && preciseNow
                  ? preciseNow.pauses.filter((q) => q.end > p.start && q.start < p.end).map((q) => [Math.max(p.start, q.start), Math.min(p.end, q.end)])
                  : null;
                const hatch = 'repeating-linear-gradient(45deg, rgba(240,82,107,0.28), rgba(240,82,107,0.28) 5px, rgba(240,82,107,0.14) 5px, rgba(240,82,107,0.14) 10px)';
                const forced = pauseForcedCut(p);
                const soundy = cut && !forced && pauseHasSound(p);
                return (
                  <div
                    key={pi}
                    onClick={(e) => { e.stopPropagation(); togglePause(p); }}
                    title={`Pausa de ${p.dur.toFixed(1)}s — ${forced ? 'cortada INTEIRA, com o som (tosse/pigarro) — clique p/ manter'
                      : cut ? (soundy ? 'tem som (tosse, pigarro ou fala): só o silêncio sai — clique p/ cortar tudo, com o som' : 'será cortada (clique p/ manter)')
                        : 'mantida (clique p/ cortar)'}`}
                    style={{
                      position: 'absolute', left: X(p.start), top: 0, width: w, height: Math.max(12, LANE.pausas - 2), borderRadius: 6,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                      background: forced ? 'rgba(240,82,107,0.55)' : cut ? (real ? 'rgba(240,82,107,0.06)' : hatch) : 'rgba(255,255,255,0.05)',
                      border: `1px ${cut ? 'solid' : 'dashed'} ${forced ? '#fff' : soundy ? '#FFB067' : cut ? 'rgba(240,82,107,0.55)' : C.border}`,
                      color: cut ? C.red : C.faint,
                    }}
                  >
                    {!forced && real && real.map(([a, b]) => (
                      <span key={a} style={{ position: 'absolute', top: 0, bottom: 0, left: X(a) - X(p.start), width: Math.max(1, W(a, b)), background: hatch, pointerEvents: 'none' }} />
                    ))}
                    {w > 26 && (cut ? <Icon name="scissors" size={11} strokeWidth={2.2} style={{ position: 'relative' }} /> : <span style={{ fontSize: 9.5, fontWeight: 600 }}>{p.dur.toFixed(1)}s</span>)}
                  </div>
                );
              })}
            </div>}
            {markers.map((mk) => (
              <div key={mk.key} style={{ position: 'absolute', left: X(mk.t), top: LANE.ruler, bottom: 0, width: 0, borderLeft: '1px dashed rgba(60,196,107,0.45)', pointerEvents: 'none', zIndex: 5 }} />
            ))}
            {dragFx && dropT != null && (
              <div style={{ position: 'absolute', left: X(dropT), top: 0, bottom: 0, width: 2, marginLeft: -1, background: '#22D3EE', boxShadow: '0 0 8px #22D3EE', pointerEvents: 'none', zIndex: 22 }}>
                <span style={{ position: 'absolute', top: 2, left: 6, whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 700, color: '#04202a', background: '#22D3EE', borderRadius: 5, padding: '1px 6px' }}>{dragFx.label} · {fmtDuration(dropT)}</span>
              </div>
            )}
            {snapLine != null && (
              <div style={{ position: 'absolute', left: X(snapLine), top: 0, bottom: 0, width: 1, marginLeft: -0.5, background: '#FFD43B', boxShadow: '0 0 6px #FFD43B', pointerEvents: 'none', zIndex: 8 }} />
            )}
            {!isMobile && (
            <div style={{ position: 'absolute', left: X(cur), top: 0, bottom: 0, width: 1.5, marginLeft: -0.75, background: PR.blue, boxShadow: `0 0 6px ${PR.blue}aa`, pointerEvents: 'none', zIndex: 6 }}>
              <div style={{ position: 'absolute', top: LANE.ruler - 15, left: -6.25, width: 14, height: 15, background: PR.blue, clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)' }} />
            </div>
            )}
            </div>
            {isMobile && <div style={{ flex: '0 0 50%' }} />}
          </div>
        </div>
        {!isMobile && (
          <div className="rf-tl-zoom" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <span title="Altura das faixas (ou arraste a borda de baixo do nome de cada faixa)" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <span style={{ fontSize: 10.5, color: PR.dim, marginRight: 2 }}>Faixas</span>
              <button onClick={() => scaleLanes(1 / 1.2)} title="Faixas mais baixas" style={zoomBarBtn}>▁</button>
              <button onClick={() => scaleLanes(1.2)} title="Faixas mais altas" style={zoomBarBtn}>▇</button>
              {Object.keys(laneOv).length > 0 && <button onClick={() => saveLaneOv({})} title="Altura padrão das faixas" style={{ ...zoomBarBtn, width: 'auto', padding: '0 6px', fontSize: 10.5 }}>Padrão</button>}
            </span>
            <span style={{ width: 1, height: 16, background: PR.line, flexShrink: 0 }} />
            <button onClick={() => zoomTl(-1)} disabled={pps <= fitPps} title="Afastar" style={{ ...zoomBarBtn, opacity: pps <= fitPps ? 0.35 : 1 }}>−</button>
            <button onClick={fitAll} title="Ver o vídeo inteiro" style={{ ...zoomBarBtn, width: 'auto', padding: '0 8px', fontSize: 11 }}>Vídeo inteiro</button>
            <input type="range" min={fitPps} max={PPS_MAX} step={0.5} value={pps} onChange={(e) => setPps(Number(e.target.value))} aria-label="Zoom da timeline" style={{ flex: 1, accentColor: PR.blue, height: 4 }} />
            <button onClick={() => zoomTl(1)} disabled={pps >= PPS_MAX} title="Aproximar" style={{ ...zoomBarBtn, opacity: pps >= PPS_MAX ? 0.35 : 1 }}>+</button>
            <span style={{ fontSize: 10.5, color: PR.dim, minWidth: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pps <= fitPps + 0.01 ? 'inteiro' : `${Math.round((pps / fitPps) * 100)}%`}</span>
          </div>
        )}
        <details className="rf-tl-help rf-tl-below" style={{ fontSize: 10.5, color: C.faint, marginTop: 5 }}>
          <summary style={{ cursor: 'pointer', fontSize: 10.5, color: C.faint, fontWeight: 600 }}>Atalhos e dicas da timeline</summary>
          <div style={{ marginTop: 4, lineHeight: 1.5 }}>👁 esconde a faixa (some da prévia e do vídeo final) · 🔒 trava a faixa · M (no A1) deixa o áudio mudo · tecla <b>M</b> põe marcador · <b>N</b> liga/desliga o ímã · <b>Ctrl+D</b> duplica · <b>Ctrl+C / Ctrl+V</b> copia e cola no playhead. Faixas, de cima para baixo: <b>legenda</b> (blocos de fala) · <b>vídeo</b> (arraste sobre ele para cortar um trecho)· <b>áudio</b> · a faixa das <span style={{ color: C.red }}>pausas de silêncio</span> (hachuradas serão cortadas — clique para manter) · arraste as pontas dos blocos para aparar{media.length > 0 && <> · a faixa das <span style={{ color: C.purpleSoft }}>minhas mídias</span> pode ser arrastada (mover) e ter as pontas ajustadas (duração)</>}</div>
        </details>

        {/* Resumo + trecho selecionado na timeline (editar palavras) — em tela grande vão para
            a barra da timeline (resumo) e para o painel Legenda (trecho) */}
        <div className="rf-tl-below" style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <Chip label="Palavras" value={stats.total} color={C.text} />
            <Chip label="Cortadas" value={stats.removed} color={C.red} />
            <Chip label="Pausas cortadas" value={pausesCut.length} sub={pauseCutSec > 0.1 ? `−${fmtDuration(pauseCutSec)}` : null} color={C.orangeSoft} />
            <Chip label={speed !== 1 ? `Duração final · ${fmtSpeed(speed)}` : 'Duração final'} value={fmtDuration((stats.keptSec + retimeDelta) / speed)} sub={(stats.removedSec + cortadoSec) > 0.1 ? `−${fmtDuration(stats.removedSec + cortadoSec)}` : null} color={C.green} />
          </div>

          {trechoBlock}
        </div>

        <div className="rf-tl-cost">
        <CostLine
          mode="render"
          sourceId={sourceId}
          options={{ ...options, ...renderOff, ...cap, ...(!brollOn ? { broll: false } : brollReview ? { broll: true, brollPlan: brollPlanForRender() } : {}) }}
          onDisable={disableFeature}
          style={{ marginTop: 18 }}
        />
        </div>
        {renderErr && <div ref={renderErrRef}><RenderError err={renderErr} onDisable={disableFeature} onClose={() => setRenderErr(null)} /></div>}
<div className="rf-tl-below">
        <PrimaryButton onClick={generate} disabled={busy || sending || allGone} style={{ width: '100%', marginTop: 12 }}>
          {allGone ? 'Você cortou tudo — reinclua algo' : busy || sending ? 'Gerando…' : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Icon name="clapper" size={18} strokeWidth={1.9} /> Renderizar vídeo final</span>)}
        </PrimaryButton>
        </div>
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
            { k: 'text', icon: 'edit', label: 'Transcrição', act: () => openSheet('capText') },
            { k: 'style', icon: 'type', label: 'Estilo', act: () => openSheet('capStyle') },
            { k: 'list', icon: 'list', label: 'Editar legendas', act: () => openSheet('capList') },
            { k: 'auto', icon: 'sparkles', label: 'Modelos', act: () => openSheet('capAuto') },
            { k: 'em', icon: 'star', label: 'Destacar', act: () => openSheet('capEm') },
            { k: 'merge', icon: 'merge', label: 'Juntar', act: () => mergeNext(sel), off: sel >= segments.length - 1 },
            { k: 'del', icon: selSeg && segRemoved(selSeg) ? 'undo' : 'trash', label: selSeg && segRemoved(selSeg) ? 'Restaurar' : 'Excluir', act: () => toggleSeg(sel), off: !selSeg },
            { k: 'pauses', icon: 'scissors', label: pausesCut.length === pauses.length && pauses.length ? 'Manter pausas' : 'Remover pausas', act: () => (pausesCut.length === pauses.length ? keepAllPauses() : cutAllPauses()), off: !pauses.length },
          ] : [
            { k: 'cap', icon: 'captions', label: 'Legendas', act: () => setMTool('legenda') },
            { k: 'split', icon: 'scissors', label: 'Dividir', act: splitAtPlayhead, off: !canSplit },
            { k: 'speed', icon: 'clock', label: speed !== 1 ? `Velocidade ${fmtSpeed(speed)}` : 'Velocidade', act: () => openSheet('speed') },
            ...TABS.filter((t) => t.id !== 'legenda').map((t) => ({ k: t.id, icon: t.icon, label: t.id === 'enquadramento' ? 'Formato' : t.id === 'midias' ? 'Mídias' : t.id === 'capa' ? 'Capa' : t.label, act: () => openSheet('tab', t.id) })),
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
        .rf-tl-tools::-webkit-scrollbar{ display: none; }
        .rf-ptool:not(:disabled):hover{ background: rgba(255,255,255,0.09) !important; color: #fff !important; }
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
        /* Computador (como o Premiere): o monitor numa coluna à esquerda, de cima a baixo;
           à direita o painel com abas em cima e a timeline embaixo. */
        @media (min-width: 861px){
          .rf-tl-card:not(.rf-m) .rf-tl-grid{ grid-template-columns: minmax(0, 1fr) minmax(360px, 1.05fr) !important; grid-template-rows: auto 1fr auto; gap: 10px !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-preview{ grid-column: 1; grid-row: 1 / span 2; }
          .rf-tl-card:not(.rf-m) .rf-tl-nav{ grid-column: 2; grid-row: 1; position: static; display: flex !important; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; gap: 2px !important;
            padding: 0 6px !important; border-radius: 10px 10px 0 0 !important; background: #1F2026 !important; border: 1px solid rgba(255,255,255,0.08) !important; border-bottom: none !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-nav::-webkit-scrollbar{ display: none; }
          .rf-tl-card:not(.rf-m) .rf-tl-nav > button{ flex: none; padding: 11px 9px !important; gap: 0 !important; border-radius: 0 !important; background: transparent !important; font-size: 12.5px !important; justify-content: flex-start; }
          .rf-tl-card:not(.rf-m) .rf-tl-nav > button svg{ display: none !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-navlbl{ display: inline !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-navind{ left: 8px !important; right: 8px; top: auto !important; bottom: 0 !important; width: auto !important; height: 2px; border-radius: 2px 2px 0 0 !important; background: #2D8CFF !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-navsep{ display: none; }
          .rf-tl-card:not(.rf-m) .rf-tl-navexp{ display: none !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-adjust{ grid-column: 2; grid-row: 2; position: static !important; top: auto; align-self: stretch !important; margin-top: -10px;
            height: 0; min-height: calc(100% + 10px); max-height: none !important; overflow-y: auto; padding: 12px 12px 12px !important; border: 1px solid rgba(255,255,255,0.08); border-top: none; border-radius: 0 0 10px 10px; background: #18191E; }
          .rf-tl-card:not(.rf-m) .rf-tl-bottom{ grid-column: 1 / span 2; grid-row: 3; }
          .rf-tl-card:not(.rf-m) .rf-tl-pv{ border-radius: 10px !important; background: #0E0F12 !important; border-color: rgba(255,255,255,0.08) !important; }
        }
        /* Tela grande (como o Premiere): o monitor numa coluna à esquerda, de cima a baixo
           (fica parado enquanto a página rola); à direita o painel com abas em cima e a
           timeline embaixo. Notebook/tablet: monitor e painel em cima, timeline embaixo. */
        @media (min-width: 1101px){
          .rf-tl-card:not(.rf-m) .rf-tl-grid{ grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) !important; grid-template-rows: auto auto auto; }
          .rf-tl-card:not(.rf-m) .rf-tl-grid.rf-mon-v{ grid-template-columns: minmax(300px, 0.62fr) minmax(0, 1.7fr) !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-preview{ grid-column: 1; grid-row: 1 / span 3; align-self: start; position: sticky; top: 10px; }
          .rf-tl-card:not(.rf-m) .rf-tl-adjust{ grid-column: 2; grid-row: 2; height: clamp(240px, 38vh, 440px); min-height: 0; }
          .rf-tl-card:not(.rf-m) .rf-tl-bottom{ grid-column: 2; grid-row: 3; min-width: 0; }
        }
        /* Tela grande: editor como app (Premiere) — ocupa a janela, sem rolar a página */
        @media (min-width: 1101px){
          .rf-tl-card:not(.rf-m){ padding: 10px 12px 10px !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-head{ display: none !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-navend{ display: flex; }
          .rf-tl-card:not(.rf-m) .rf-tl-grid{ height: var(--rf-app-h, auto); grid-template-rows: auto var(--rf-panel-h, minmax(190px, 40%)) minmax(0, 1fr) !important; gap: 8px !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-preview{ grid-row: 1 / span 3 !important; align-self: stretch !important; position: relative !important; top: auto !important; display: flex; flex-direction: column; min-height: 0; }
          .rf-tl-card:not(.rf-m) .rf-tl-preview > .rf-tl-pv{ flex: 1; min-height: 0; padding: 6px !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-grid:not(.rf-custom-col){ grid-template-columns: var(--rf-mon-auto, minmax(300px, 0.62fr)) minmax(0, 1fr) !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-zoom{ margin-top: 5px !important; gap: 6px !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-zoom button{ height: 20px !important; min-width: 20px; font-size: 11px !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-adjust{ height: auto !important; min-height: 0 !important; align-self: stretch !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-bottom{ min-height: 0; overflow-y: auto; overflow-x: hidden; align-self: stretch; padding: 6px 8px 8px !important; scrollbar-width: thin; display: flex; flex-direction: column; }
          /* a timeline desce até o fim da janela (sem espaço vazio embaixo), como no Premiere */
          .rf-tl-card:not(.rf-m) .rf-tl-bottom > .rf-tl-track{ flex: 1 0 auto; }
          .rf-tl-card:not(.rf-m) .rf-tl-cost > *{ margin-top: 6px !important; }
          .rf-tl-card:not(.rf-m) .rf-tlbar{ gap: 6px !important; margin-bottom: 6px !important; }
          .rf-tl-card:not(.rf-m) .rf-tlbar button{ padding: 4px 9px !important; font-size: 11.5px !important; border-radius: 7px !important; gap: 5px !important; }
          .rf-tl-card:not(.rf-m) .rf-tc{ font-size: 17px !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-bar{ margin-top: 8px !important; padding: 6px 10px !important; gap: 8px !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-preview{ container-type: inline-size; container-name: rfmon; }
          @container rfmon (max-width: 460px){
            .rf-tl-bar .rf-tb-ext{ display: none; }
            .rf-tl-bar .rf-tbtn{ width: 26px; height: 26px; }
          }
          @container rfmon (max-width: 380px){
            .rf-tl-bar .rf-transport > div:first-child{ display: none; }
          }
        }
        .rf-tl-navend{ display: none; margin-left: auto; position: sticky; right: 0; align-items: center; gap: 6px; padding-left: 10px; background: inherit; flex: none; }
        .rf-tl-navsaved{ font-size: 10.5px; color: #8B9099; white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
        /* janela mais estreita: os botões viram só ícone (o nome aparece ao parar o mouse) e as abas continuam visíveis */
        @media (max-width: 1799px){ .rf-tl-navsaved{ display: none; } }
        @media (max-width: 1699px){ .rf-navlbl2{ display: none; } }
        .rf-tl-navbtn{ display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 11px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #E8EAF0; font: 600 12px inherit; font-family: inherit; cursor: pointer; white-space: nowrap; }
        .rf-tl-navbtn:hover{ background: rgba(255,255,255,0.1); }
        .rf-tl-navbtn--go{ border: none; color: #fff; font-weight: 800; box-shadow: 0 6px 16px -8px rgba(255,107,53,0.8); }
        .rf-tl-navbtn--go:hover{ filter: brightness(1.08); }
        .rf-tl-stats{ display: none; order: 99; margin-left: auto; font-size: 11px; color: #8B9099; white-space: nowrap; }
        .rf-tl-stats b{ color: #E8EAF0; font-weight: 700; }
        .rf-only-app{ display: none; }
        @media (min-width: 1101px){
          .rf-tl-card:not(.rf-m) .rf-tl-below{ display: none !important; }
          .rf-tl-card:not(.rf-m) .rf-tl-stats{ display: inline; }
          .rf-tl-card:not(.rf-m) .rf-only-app{ display: block; }
        }
        .rf-ptool svg{ width: 21px; height: 21px; }
        .rf-ptool .rf-tkey{ font-size: 15px; }
        .rf-tsep{ width: 30px; height: 1px; background: rgba(255,255,255,0.08); margin: 3px 0; flex-shrink: 0; }
        .rf-tkey{ font: 800 12px inherit; font-family: inherit; line-height: 1; }
        .rf-keys{ position: absolute; left: 60px; top: 6px; z-index: 40; width: 300px; max-height: calc(100% - 12px); overflow-y: auto; padding: 10px 12px; border-radius: 10px;
          background: #1C1D23; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 18px 40px -12px rgba(0,0,0,0.8); font-size: 11.5px; color: #D6D8DE; }
        .rf-keys kbd{ min-width: 64px; display: inline-block; text-align: center; padding: 2px 6px; border-radius: 5px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); font: 700 10.5px inherit; font-family: inherit; color: #fff; }
        .rf-lane-rs{ position: absolute; left: 0; right: 0; bottom: 0; height: 5px; cursor: row-resize; z-index: 2; }
        .rf-lane-rs:hover{ background: linear-gradient(transparent, #2D8CFF); }
        .rf-tbtn{ width: 28px; height: 28px; flex-shrink: 0; display: grid; place-items: center; border-radius: 7px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #D6D8DE; cursor: pointer; padding: 0; }
        .rf-tbtn:hover{ background: rgba(255,255,255,0.1); color: #fff; }
        .rf-tbtn.on{ border-color: rgba(255,107,53,0.6); background: rgba(255,107,53,0.16); color: #FF9A6C; }
        /* divisórias arrastáveis (só no computador) */
        .rf-split{ display: none; position: absolute; z-index: 30; }
        .rf-split > span{ position: absolute; border-radius: 3px; background: rgba(125,182,255,0.45); transition: background .15s, box-shadow .15s; }
        .rf-split:hover > span, .rf-show-splits .rf-split > span{ background: #2D8CFF; box-shadow: 0 0 0 3px rgba(45,140,255,0.25); }
        @media (min-width: 861px) and (max-width: 1100px){
          .rf-tl-card:not(.rf-m) .rf-tl-preview{ position: relative; }
        }
        @media (min-width: 861px){
          .rf-tl-card:not(.rf-m) .rf-split--col{ display: block; top: 0; bottom: 0; right: -10px; width: 10px; cursor: col-resize; }
          .rf-tl-card:not(.rf-m) .rf-split--col > span{ left: 3px; top: 50%; width: 4px; height: 80px; margin-top: -40px; }
          .rf-tl-card:not(.rf-m) .rf-tl-grid.rf-custom-col{ grid-template-columns: var(--rf-mon-w) minmax(0, 1fr) !important; }
        }
        @media (min-width: 1101px){
          .rf-tl-card:not(.rf-m) .rf-split--row{ display: block; left: 0; right: 0; top: -10px; height: 10px; cursor: row-resize; }
          .rf-tl-card:not(.rf-m) .rf-split--row > span{ top: 3px; left: 50%; width: 80px; height: 4px; margin-left: -40px; }
          .rf-tl-card:not(.rf-m) .rf-tl-grid.rf-custom-row .rf-tl-adjust{ height: auto !important; }
        }
        /* barra do player quebra a linha quando a coluna do monitor é estreita */
        .rf-tl-bar{ flex-wrap: wrap; row-gap: 8px !important; }
        /* monitor único: o player original fica escondido (continua tocando o som e o tempo) */
        .rf-tl-pv--one .rf-tl-main{ display: none; }
        .rf-tl-pv--one .rf-tl-pv-fmt{ position: relative; }
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

// Ação para desligar cada recurso que o plano pode travar (ids de shared/credits.js).
export const DISABLE_LABEL = {
  ai: 'Desligar limpeza por IA',
  captionStyle: 'Usar legenda simples',
  image: 'Remover B-roll',
};

/** Erro do envio do render, dentro do editor: mensagem do servidor + como resolver. */
function RenderError({ err, onDisable, onClose }) {
  const fixes = (err.locked || []).filter((id) => DISABLE_LABEL[id]);
  const showPlans = err.code === 'PLAN_REQUIRED' || err.code === 'PAYMENT_REQUIRED';
  const btn = { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', borderRadius: 8, padding: '6px 11px' };
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, padding: '11px 13px', borderRadius: 10, background: 'rgba(240,82,107,0.1)', border: `1px solid ${C.red}55`, color: '#FCA5B4', fontSize: 13, lineHeight: 1.5 }}>
      <Icon name={err.code === 'PLAN_REQUIRED' ? 'lock' : 'alert'} size={15} strokeWidth={2} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div><b>Não foi possível renderizar.</b> {err.message}</div>
        <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Suas edições na timeline continuam aqui.</div>
        {(fixes.length > 0 || showPlans) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 9 }}>
            {fixes.map((id) => (
              <button key={id} onClick={() => onDisable(id)} style={{ ...btn, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.text }}>
                {DISABLE_LABEL[id]}
              </button>
            ))}
            {showPlans && (
              <button onClick={openPlans} style={{ ...btn, background: 'none', border: 'none', color: C.orangeSoft, padding: '6px 2px' }}>Ver planos →</button>
            )}
          </div>
        )}
      </div>
      <button onClick={onClose} aria-label="Fechar aviso" style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: '0 2px', fontSize: 17, lineHeight: 1, fontFamily: 'inherit', flexShrink: 0 }}>
        ×
      </button>
    </div>
  );
}

/**
 * Mídias (imagens/vídeos/logos) e textos livres por cima do vídeo, no tempo atual.
 * Editável: arraste para posicionar (PiP e textos) e puxe o canto da mídia para mudar o
 * tamanho — as mesmas frações (px/py/scale, x/y) que o servidor usa no render.
 */
/** Ajustes da camada na prévia (a mesma ideia do eq/hflip do render). */
function layerCss(m) {
  const b = Number(m.bright || 0);
  const c = Number(m.contrast ?? 1);
  const s = Number(m.sat ?? 1);
  const f = [];
  if (Math.abs(b) > 0.005) f.push(`brightness(${(1 + b * 1.2).toFixed(2)})`);
  if (Math.abs(c - 1) > 0.005) f.push(`contrast(${c.toFixed(2)})`);
  if (Math.abs(s - 1) > 0.005) f.push(`saturate(${s.toFixed(2)})`);
  return { ...(f.length ? { filter: f.join(' ') } : {}), ...(m.flip ? { transform: 'scaleX(-1)' } : {}) };
}

function StageLayers({ videoRef, box, cur, media, texts, editable, selMedia, selText, onMedia, onText }) {
  const [aspect, setAspect] = useState({}); // altura/largura de cada mídia (da prévia)
  const [guides, setGuides] = useState(null); // linhas de centralização enquanto arrasta
  const dragRef = useRef(null);
  const cb = useRef({ onMedia, onText, box });
  cb.current = { onMedia, onText, box };
  useEffect(() => {
    const clampC = (v) => +Math.max(-0.5, Math.min(1.5, v)).toFixed(3);
    function move(e) {
      const d = dragRef.current;
      if (!d) return;
      const { box: bx, onMedia: om, onText: ot } = cb.current;
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (d.kind === 'text') {
        // gruda no centro do quadro (com a linha-guia) quando passa perto — igual à legenda
        const sx = snapCenter(Math.max(0, Math.min(1, d.ox + dx / bx.w)), bx.w);
        const sy = snapCenter(Math.max(0, Math.min(1, d.oy + dy / bx.h)), bx.h);
        setGuides({ x: sx.on, y: sy.on });
        ot(d.key, { x: +sx.v.toFixed(3), y: +sy.v.toFixed(3) });
      } else if (d.kind === 'resize') {
        // canto: muda o tamanho mantendo o centro (como no CapCut)
        const sx = d.dir && d.dir[1] === 'w' ? -dx : dx;
        om(d.key, { scale: +Math.max(0.05, Math.min(3, (d.w0 + 2 * sx) / bx.w)).toFixed(3), cx: d.cx, cy: d.cy });
      } else {
        const sx = snapCenter(clampC(d.cx + dx / bx.w), bx.w);
        const sy = snapCenter(clampC(d.cy + dy / bx.h), bx.h);
        setGuides({ x: sx.on, y: sy.on });
        om(d.key, { cx: +sx.v.toFixed(3), cy: +sy.v.toFixed(3) });
      }
    }
    function up() { if (dragRef.current) setGuides(null); dragRef.current = null; document.body.style.userSelect = ''; }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);
  if (!box || box.h < 10) return null;
  const visible = (media || [])
    .filter((m) => m.kind !== 'audio' && m.previewUrl && cur >= m.start && cur < m.start + m.duration)
    .sort((a, b) => (a.layer || 0) - (b.layer || 0));
  const liveTexts = (texts || []).filter((l) => cur >= l.start && cur < l.end);
  if (!visible.length && !liveTexts.length) return null;
  const start = (e, d) => { if (!editable) return; e.preventDefault(); e.stopPropagation(); dragRef.current = { ...d, x0: e.clientX, y0: e.clientY }; document.body.style.userSelect = 'none'; };
  return (
    <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, overflow: 'hidden', pointerEvents: 'none', zIndex: 3 }}>
      {guides && <SnapGuides x={guides.x} y={guides.y} />}
      {visible.map((m) => {
        const adj = layerCss(m);
        const el = (style0) => { const style = { ...style0, ...adj }; return (m.kind === 'video'
          ? <SyncedVideo m={m} mainRef={videoRef} style={style} onAspect={(r) => setAspect((a) => (a[m.key] === r ? a : { ...a, [m.key]: r }))} />
          : <img src={m.previewUrl} alt="" draggable={false} style={style} onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth) setAspect((a) => ({ ...a, [m.key]: i.naturalHeight / i.naturalWidth })); }} />); };
        const ar = aspect[m.key] || 0.5625;
        if (m.mode !== 'pip') {
          // Tela cheia: ao arrastar, vira camada livre do tamanho da tela e segue o mouse.
          return (
            <div key={m.key} onPointerDown={(e) => { if (!editable) return; onMedia(m.key, { mode: 'pip', scale: 1, cx: 0.5, cy: 0.5 }); start(e, { kind: 'move', key: m.key, cx: 0.5, cy: 0.5 }); }}
              title={editable ? 'Arraste para posicionar (vira camada livre)' : undefined}
              style={{ position: 'absolute', inset: 0, opacity: m.opacity ?? 1, pointerEvents: editable ? 'auto' : 'none', cursor: editable ? 'move' : 'default', outline: editable && selMedia === m.key ? '2px solid #22D3EE' : 'none', outlineOffset: -2 }}>
              {el({ width: '100%', height: '100%', objectFit: 'cover', display: 'block' })}
            </div>
          );
        }
        const w = box.w * (m.scale || 0.4);
        const h = w * ar;
        // centro da camada (cx/cy); itens antigos (px/py = canto) são convertidos
        const cx = m.cx ?? ((box.w - w) * (m.px ?? 0.62) + w / 2) / box.w;
        const cy = m.cy ?? ((box.h - h) * (m.py ?? 0.06) + h / 2) / box.h;
        const on = editable && selMedia === m.key;
        return (
          <div key={m.key} onPointerDown={(e) => start(e, { kind: 'move', key: m.key, cx, cy })}
            title={editable ? 'Arraste para posicionar · puxe o canto para mudar o tamanho' : undefined}
            style={{ position: 'absolute', left: cx * box.w - w / 2, top: cy * box.h - h / 2, width: w, height: h, opacity: m.opacity ?? 1, pointerEvents: editable ? 'auto' : 'none', cursor: editable ? 'move' : 'default', outline: on ? '2px solid #22D3EE' : editable ? '1px dashed rgba(255,255,255,0.6)' : 'none' }}>
            {el({ width: '100%', height: '100%', objectFit: 'contain', display: 'block' })}
            {editable && ['nw', 'ne', 'sw', 'se'].map((c) => (
              <div key={c} onPointerDown={(e) => start(e, { kind: 'resize', key: m.key, w0: w, cx, cy, dir: c })}
                style={{ position: 'absolute', [c[0] === 'n' ? 'top' : 'bottom']: -6, [c[1] === 'w' ? 'left' : 'right']: -6, width: 12, height: 12, borderRadius: 3, background: '#22D3EE', border: '2px solid #fff', cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize', transform: c[1] === 'w' ? 'scaleX(-1)' : undefined }} />
            ))}
          </div>
        );
      })}
      {liveTexts.map((l) => {
        const f = fontById(l.font);
        const px = l.size * box.h;
        const on = editable && selText === l.key;
        return (
          <div key={l.key} onPointerDown={(e) => start(e, { kind: 'text', key: l.key, ox: l.x, oy: l.y })}
            style={{ position: 'absolute', left: `${l.x * 100}%`, top: `${l.y * 100}%`, transform: 'translate(-50%, -50%)', whiteSpace: 'pre', textAlign: 'center', lineHeight: 1.15,
              fontFamily: `'${f.family}'`, fontWeight: f.bold === false ? 400 : 700, fontSize: px, color: l.color,
              background: l.box === 'box' ? l.boxColor : 'transparent', padding: l.box === 'box' ? `${px * 0.12}px ${px * 0.28}px` : 0,
              WebkitTextStroke: l.box === 'outline' ? `${Math.max(1, px * 0.07)}px ${l.boxColor}` : undefined, paintOrder: 'stroke fill',
              pointerEvents: editable ? 'auto' : 'none', cursor: editable ? 'move' : 'default', outline: on ? '2px dashed #E8A020' : 'none', outlineOffset: 4 }}>
            {l.text}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Vídeo das "Minhas mídias" na prévia, tocando JUNTO com o vídeo principal: segue o play,
 * a pausa, o arraste do playhead e a velocidade (lê o <video> principal a cada quadro).
 * Se o arquivo não tocar no navegador, usa a cópia H.264 do servidor.
 */
function SyncedVideo({ m, mainRef, style, onAspect }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(m.previewUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setSrc(m.previewUrl); setFailed(false); }, [m.previewUrl]);
  const mRef = useRef(m);
  mRef.current = m;
  useEffect(() => {
    let id;
    const loop = () => {
      const v = ref.current;
      const main = mainRef?.current;
      if (v && main && v.readyState >= 1) {
        const mm = mRef.current;
        const target = Math.max(0, main.currentTime - mm.start + (Number(mm.offset) || 0));
        const vol = Math.max(0, Math.min(1, mm.volume ?? 1));
        if (Math.abs(v.volume - vol) > 0.01) v.volume = vol;
        const muted = main.muted || mm.muted === true || vol < 0.005;
        if (v.muted !== muted) v.muted = muted;
        if (main.paused || main.seeking) {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - target) > 0.04 && !v.seeking) v.currentTime = target;
        } else {
          if (v.playbackRate !== main.playbackRate) v.playbackRate = main.playbackRate;
          if (Math.abs(v.currentTime - target) > 0.3 && !v.seeking) v.currentTime = target;
          if (v.paused && !v.ended) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
        }
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [mainRef]);
  return (
    <video ref={ref} src={src} playsInline preload="auto" style={style}
      onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth) onAspect(v.videoHeight / v.videoWidth); }}
      onError={() => {
        // o original não toca aqui (HEVC, ProRes…): pede a cópia leve ao servidor
        if (!failed && m.mediaId) { setFailed(true); setSrc(mediaPreviewUrl(m.mediaId, 'h264')); }
      }} />
  );
}

/** Ícones do transporte (como os do monitor do Premiere). */
function svgTransport(kind) {
  const P = { start: 'M6 5v14M18 6l-9 6 9 6z', back: 'M15 6l-7 6 7 6', fwd: 'M9 6l7 6-7 6', end: 'M18 5v14M6 6l9 6-9 6z' }[kind];
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={P} /></svg>;
}

// Prévia dos efeitos na biblioteca (ao passar o mouse), como os cards do Animation Composer.
const FX_ANIM_CSS = `
.rf-fxc:hover { border-color: rgba(34,211,238,0.6) !important; }
.rf-fxc .rf-fxi, .rf-fxc .rf-fxo { animation-duration: 1.6s; animation-iteration-count: infinite; animation-play-state: paused; animation-timing-function: ease-in-out; }
.rf-fxc:hover .rf-fxi, .rf-fxc:hover .rf-fxo { animation-play-state: running; }
.a-cam-zoom-in { animation-name: rfZin; } @keyframes rfZin { 0% { transform: scale(1); } 75%, 100% { transform: scale(1.4); } }
.a-cam-zoom-out { animation-name: rfZout; } @keyframes rfZout { 0% { transform: scale(1.4); } 75%, 100% { transform: scale(1); } }
.a-cam-punch { animation-name: rfPunch; animation-timing-function: steps(1) !important; } @keyframes rfPunch { 0% { transform: scale(1); } 35% { transform: scale(1.3); } 80% { transform: scale(1); } }
.a-cam-ken-burns { animation-name: rfKb; } @keyframes rfKb { 0% { transform: scale(1) translate(0, 0); } 100% { transform: scale(1.3) translate(-7%, -5%); } }
.a-cam-pulse { animation-name: rfPulse; } @keyframes rfPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
.a-fx-shake { animation-name: rfShake; animation-duration: 0.4s !important; } @keyframes rfShake { 0%, 100% { transform: translate(0, 0) scale(1.08); } 25% { transform: translate(-4%, 2%) scale(1.08); } 50% { transform: translate(3%, -3%) scale(1.08); } 75% { transform: translate(-2%, -2%) scale(1.08); } }
.a-fx-glitch { animation-name: rfGlitch; animation-duration: 0.6s !important; animation-timing-function: steps(1) !important; } @keyframes rfGlitch { 0% { transform: translate(0); } 20% { transform: translate(-5%, 0) skewX(8deg); } 40% { transform: translate(4%, 0); filter: hue-rotate(90deg) contrast(1.4); } 60% { transform: translate(0); } 80% { transform: translate(-2%, 1%); filter: hue-rotate(-60deg); } }
.a-fx-blur { animation-name: rfBlurIn; } @keyframes rfBlurIn { 0%, 100% { filter: blur(0); } 50% { filter: blur(5px); } }
.a-tr-blur { animation-name: rfTrBlur; } @keyframes rfTrBlur { 0%, 100% { filter: blur(0); } 50% { filter: blur(8px); } }
.a-tr-glow { animation-name: rfTrGlow; } @keyframes rfTrGlow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(2.2) saturate(1.4); } }
.o-tr-flash { background: #fff; opacity: 0; animation-name: rfFlash; } @keyframes rfFlash { 0%, 30%, 70%, 100% { opacity: 0; } 50% { opacity: 1; } }
.o-tr-dip { background: #000; opacity: 0; animation-name: rfFlash; }
.o-fx-strobe { background: #fff; opacity: 0; animation-name: rfStrobe; animation-duration: 0.5s !important; animation-timing-function: steps(1) !important; } @keyframes rfStrobe { 0% { opacity: 0; } 50% { opacity: 0.85; } }
.o-fx-vignette { background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.75) 100%); }
.o-fx-film { border-top: 9px solid #000; border-bottom: 9px solid #000; box-sizing: border-box; }
.o-fx-grain, .o-fx-vhs { background-image: url("${"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.45'/></svg>"}"); mix-blend-mode: overlay; }
.o-fx-pixel { backdrop-filter: blur(2px); background-image: linear-gradient(rgba(0,0,0,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.25) 1px, transparent 1px); background-size: 8px 8px; }
.a-tm-slow { animation-name: rfSlow; animation-duration: 3.2s !important; animation-timing-function: linear !important; } @keyframes rfSlow { 0% { transform: translateX(0) scale(1.15); } 100% { transform: translateX(-6%) scale(1.15); } }
.a-tm-fast { animation-name: rfSlow; animation-duration: 0.6s !important; animation-timing-function: linear !important; }
.o-tm-freeze { background: linear-gradient(135deg, rgba(147,197,253,0.35), transparent 60%); }
`;

// Meia duração de cada transição (igual ao servidor) e textura de grão para a prévia.
const TRANS_HALF = { flash: 0.18, dip: 0.22, glow: 0.3, blur: 0.25 };
const GRAIN_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.35'/></svg>";

/** Primeira camada livre (sem outra mídia no mesmo intervalo de tempo). */
function freeLayer(list, start, duration) {
  const end = start + duration;
  let l = 0;
  while (list.some((m) => (m.layer || 0) === l && m.start < end && m.start + m.duration > start)) l++;
  return l;
}
/** Renumera as camadas em 0, 1, 2… mantendo a ordem (tira as camadas vazias). */
function normalizeLayers(list) {
  const used = [...new Set(list.map((m) => m.layer || 0))].sort((a, b) => a - b);
  if (used.every((l, i) => l === i)) return list;
  return list.map((m) => ({ ...m, layer: used.indexOf(m.layer || 0) }));
}
/** Pedaços da faixa de vídeo entre as divisões (início, divisões, fim). */
function videoParts(splits, dur) {
  const pts = [0, ...splits.filter((t) => t > 0.05 && t < dur - 0.05).sort((a, b) => a - b), dur];
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) if (pts[i + 1] - pts[i] > 0.02) parts.push({ start: pts[i], end: pts[i + 1] });
  return parts;
}
// Altura de cada faixa. A coluna de nomes e as faixas leem daqui, para não
// desalinharem quando uma mudar.
// Visual da timeline no computador (inspirado no Premiere): cinzas escuros e azul de destaque.
const PR = { panel: '#141519', track: '#1A1B20', heads: '#1F2026', tools: '#17181C', ruler: '#202127', line: 'rgba(255,255,255,0.08)', blue: '#2D8CFF', text: '#D6D8DE', dim: '#8B9099' };
const LANE_ROW = { background: 'rgba(255,255,255,0.022)', borderRadius: 4 };
const LANE_HIDDEN = { opacity: 0.28 };
const LANE_LOCKED = { pointerEvents: 'none', filter: 'saturate(0.35)', backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 6px, transparent 6px 12px)' };
const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60];
const SNAP_PX = 8;
/** Encaixa o ponto `t` no ponto mais perto (até 8 px), sem contar o próprio bloco. Puro. */
export function snapPoint(sn, t, ownKey) {
  if (!sn?.on || !sn.pts?.length) return { t, line: null };
  const tol = SNAP_PX / (sn.pps || 64);
  let best = null;
  for (const p of sn.pts) {
    if (ownKey != null && p.key === ownKey) continue;
    const d = Math.abs(p.t - t);
    if (d <= tol && (!best || d < best.d)) best = { d, t: p.t };
  }
  return best ? { t: best.t, line: best.t } : { t, line: null };
}
/** Encaixa um bloco de `len` s pelo começo ou pelo fim (o que estiver mais perto). Puro. */
export function snapSpan(sn, start, len, ownKey) {
  const a = snapPoint(sn, start, ownKey);
  const b = snapPoint(sn, start + len, ownKey);
  const da = a.line == null ? Infinity : Math.abs(a.t - start);
  const db = b.line == null ? Infinity : Math.abs(b.t - (start + len));
  if (da === Infinity && db === Infinity) return { start, line: null };
  return da <= db ? { start: a.t, line: a.line } : { start: b.t - len, line: b.line };
}
const TC_FPS = 30;
/** Timecode no estilo do Premiere: HH:MM:SS:QQ (30 quadros por segundo). */
function tcode(t) {
  const fr = Math.max(0, Math.round((t || 0) * TC_FPS));
  const ff = fr % TC_FPS;
  const sec = Math.floor(fr / TC_FPS);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(sec / 3600))}:${p(Math.floor(sec / 60) % 60)}:${p(sec % 60)}:${p(ff)}`;
}
const zoomBarBtn = { width: 24, height: 24, borderRadius: 6, border: `1px solid ${PR.line}`, background: 'transparent', color: PR.text, cursor: 'pointer', fontSize: 14, lineHeight: 1, fontFamily: 'inherit' };

function ToolIcon({ title, onClick, disabled, active, children }) {
  return (
    <button className="rf-ptool" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 7, border: 'none', padding: 0, display: 'grid', placeItems: 'center', fontFamily: 'inherit',
        background: active ? PR.blue : 'transparent', color: disabled ? 'rgba(255,255,255,0.22)' : active ? '#fff' : '#C9CCD3', cursor: disabled ? 'default' : 'pointer' }}>
      {children}
    </button>
  );
}

const svgEye = (off) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{off && <path d="M3 3l18 18" />}
  </svg>
);
const svgLock = (on) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d={on ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-2'} />
  </svg>
);

/** Cabeçalho da faixa (como no Premiere): código (V1, A1…), nome, cadeado, olho e mudo. */
function TrackHead({ h, gap, code, nome, active, hidden, onEye, locked, onLock, muted, onMute, onResize, onResetSize }) {
  const ib = (on, color) => ({ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: 'none', padding: 0, display: 'grid', placeItems: 'center', cursor: 'pointer', fontFamily: 'inherit',
    background: on ? `${color}2e` : 'transparent', color: on ? color : PR.dim });
  return (
    <div style={{ position: 'relative', height: h, marginTop: gap, padding: '0 4px', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', borderRadius: 4, background: 'rgba(255,255,255,0.02)' }}>
      {onResize && <div className="rf-lane-rs" onMouseDown={onResize} onDoubleClick={onResetSize} title="Arraste para mudar a altura da faixa · clique duplo volta ao padrão" />}
      {onLock ? <button className="rf-ptool" onClick={onLock} title={locked ? 'Destravar a faixa' : 'Travar a faixa (não deixa mexer)'} aria-pressed={!!locked} style={ib(locked, '#F5B13D')}>{svgLock(locked)}</button> : <span style={{ width: 22 }} />}
      <span style={{ flexShrink: 0, minWidth: 26, height: 18, padding: '0 4px', borderRadius: 4, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, letterSpacing: 0.2,
        background: active ? PR.blue : 'rgba(255,255,255,0.08)', color: active ? '#fff' : PR.text }}>{code}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 600, color: hidden || muted ? PR.dim : PR.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</span>
      {onMute && <button className="rf-ptool" onClick={onMute} title={muted ? 'Ligar o som da fala' : 'Deixar a fala muda'} aria-pressed={!!muted} style={{ ...ib(muted, '#F0526B'), fontSize: 10.5, fontWeight: 800 }}>M</button>}
      {onEye && <button className="rf-ptool" onClick={onEye} title={hidden ? 'Mostrar a faixa' : 'Esconder a faixa (some da prévia e do vídeo final)'} aria-pressed={!!hidden} style={ib(hidden, '#F0526B')}>{svgEye(hidden)}</button>}
    </div>
  );
}

const LANE_M = { kf: 20, txt: 24, xcap: 26, vfx: 22, ruler: 26, capitulos: 28, legenda: 36, video: 44, zoom: 24, broll: 26, audio: 34, pausas: 24, midias: 30 };
// Computador: faixas compactas como no Premiere (cabe tudo na janela, sem rolar).
const LANE_D = { ...LANE_M, ruler: 24, capitulos: 22, legenda: 34, video: 48, audio: 38, pausas: 20, zoom: 22, broll: 26, midias: 28 };

const LANE_RESIZABLE = ['capitulos', 'legenda', 'xcap', 'midias', 'txt', 'vfx', 'broll', 'zoom', 'kf', 'video', 'audio', 'pausas'];
const LANE_MIN = { legenda: 22, video: 24, audio: 20, midias: 20, broll: 20 };

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
    background: 'linear-gradient(180deg, #FF8A2A, #C2410C)', opacity: 0.9,
    borderRadius: side === 'left' ? '7px 0 0 7px' : '0 7px 7px 0',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)',
  };
}
const playBtn = { width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #FF8A2A, #C2410C)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 6px 16px -6px rgba(255,107,53,0.6)' };
function toolBtn(disabled) {
  return { display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.05)', color: disabled ? C.faint : C.text, borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'inherit' };
}
function miniBtn(active, disabled) {
  return { display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${active ? C.red : C.border}`, background: active ? 'rgba(240,82,107,0.18)' : 'rgba(255,255,255,0.05)', color: active ? C.red : C.muted, borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, fontFamily: 'inherit' };
}
// Velocidades oferecidas (o servidor aceita de 0,5× a 2×)
/** Interruptor liga/desliga. */
function Switch({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} role="switch" aria-checked={on} style={{ width: 34, height: 20, borderRadius: 20, border: 'none', background: on ? C.green : 'rgba(255,255,255,0.16)', position: 'relative', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  );
}

/** Título por cima da prévia (aproximação do que o servidor desenha com o libass). */
function HeadlineOverlay({ h, box }) {
  const size = Math.max(9, Math.min(box.w, box.h) * 0.068);
  const lum = (() => { const n = parseInt(h.color, 16); return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); })();
  const style = h.style === 'box'
    ? { background: `#${h.color}`, color: lum > 160 ? '#111' : '#fff', padding: `${size * 0.22}px ${size * 0.4}px`, borderRadius: 2 }
    : h.style === 'bar'
      ? { background: 'rgba(0,0,0,0.68)', color: '#fff', padding: `${size * 0.22}px ${size * 0.4}px` }
      : { color: '#fff', textShadow: '0 0 3px #000, 0 2px 4px #000' };
  const top = h.position === 'top' ? box.y + box.h * 0.085 : h.position === 'center' ? box.y + box.h / 2 : null;
  return (
    <div style={{ position: 'absolute', left: box.x + box.w * 0.08, width: box.w * 0.84, pointerEvents: 'none', display: 'flex', justifyContent: 'center', textAlign: 'center',
      ...(top != null ? { top, transform: h.position === 'center' ? 'translateY(-50%)' : 'none' } : { bottom: box.y + box.h * 0.085 }) }}>
      <span style={{ fontFamily: 'Montserrat, Inter, sans-serif', fontWeight: 800, fontSize: size, lineHeight: 1.18, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', ...style }}>{h.text}</span>
    </div>
  );
}

const GoogleMark = () => (
  <svg width="13" height="13" viewBox="0 0 48 48" aria-hidden="true" style={{ background: '#fff', borderRadius: '50%', padding: 1 }}>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5Z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.3 4.5 9.7 8.8 6.3 14.7Z" />
    <path fill="#4CAF50" d="M24 43.5c5.4 0 10.3-2 13.9-5.3l-6.4-5.4C29.4 34.5 26.9 35.5 24 35.5c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.6 39 16.2 43.5 24 43.5Z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.4 5.4C41.4 35.7 43.5 30.3 43.5 24c0-1.2-.1-2.3-.4-3.5Z" />
  </svg>
);

// Qualidade de exportação (lado menor do quadro): Premium.
const QUALITY_OPTS = [
  { id: 'original', label: 'Original', sub: 'padrão', hint: 'Resolução do formato escolhido' },
  { id: '720', label: '720p', sub: 'HD', hint: 'Lado menor com 720 pixels' },
  { id: '1080', label: '1080p', sub: 'Full HD', hint: 'Lado menor com 1080 pixels' },
  { id: '2160', label: '4K', sub: 'Ultra HD', hint: 'Lado menor com 2160 pixels' },
];

const SPEEDS = [0.75, 1, 1.1, 1.2, 1.25, 1.5, 2];
const RANGE_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const FREEZE_DURS = [1, 1.5, 2, 3, 5];
const STICKERS = [
  ['fire', '🔥', 'Fogo'], ['laugh', '😂', 'Rindo'], ['heart', '❤️', 'Coração'], ['clap', '👏', 'Palmas'], ['check', '✅', 'Certo'], ['x', '❌', 'Errado'], ['star', '⭐', 'Estrela'], ['100', '💯', 'Cem'],
  ['party', '🎉', 'Festa'], ['point', '👉', 'Apontando'], ['up', '👆', 'Para cima'], ['warn', '⚠️', 'Atenção'], ['money', '💰', 'Dinheiro'], ['rocket', '🚀', 'Foguete'], ['bulb', '💡', 'Ideia'], ['eyes', '👀', 'Olhos'],
  ['mind', '🤯', 'Explodindo'], ['think', '🤔', 'Pensando'], ['wow', '😱', 'Uau'], ['cool', '😎', 'Óculos'], ['thumb', '👍', 'Joinha'], ['pray', '🙏', 'Mãos'], ['bell', '🔔', 'Sino'], ['arrow', '⬇️', 'Seta'],
].map(([id, ch, label]) => ({ id, ch, label }));
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
const SHEET_TITLE = { speed: 'Velocidade', capText: 'Transcrição', capList: 'Editar legendas', capStyle: 'Estilo da legenda', capEm: 'Destacar palavras', capAuto: 'Legendas automáticas' };

const TABS = [
  { id: 'projeto', label: 'Projeto', icon: 'folder' },
  { id: 'enquadramento', label: 'Enquadramento', icon: 'crop' },
  { id: 'texto', label: 'Texto', icon: 'type' },
  { id: 'broll', label: 'B-roll', icon: 'image' },
  { id: 'audio', label: 'Áudio', icon: 'mic' },
  { id: 'legenda', label: 'Legenda', icon: 'captions' },
  { id: 'midias', label: 'Minhas mídias', icon: 'film' },
  { id: 'efeitos', label: 'Efeitos', icon: 'wand' },
  { id: 'cor', label: 'Cor', icon: 'palette' },
  { id: 'capa', label: 'Capa e título', icon: 'type' },
];

// Formatos do vídeo final (ids iguais aos do servidor) e o desenho do ícone.
const FORMATS = [
  { id: 'original', label: 'Original', w: 22, h: 16, hint: 'Mantém o formato em que foi gravado' },
  { id: '9:16', label: '9:16', w: 13, h: 22, hint: 'Vertical — Reels, Shorts, TikTok' },
  { id: '1:1', label: '1:1', w: 18, h: 18, hint: 'Quadrado — feed' },
  { id: '16:9', label: '16:9', w: 24, h: 14, hint: 'Horizontal — YouTube' },
];
const REFRAME_MODES = [
  { id: 'auto', label: 'Automático · segue o rosto', hint: 'A IA acompanha você no quadro. Com duas pessoas, mostra quem está falando.' },
  { id: 'split', label: 'Tela dividida · podcast', hint: 'Duas pessoas: uma em cima e outra embaixo, cada uma no próprio rosto.' },
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
  { id: 'google', label: 'Google Imagens', hint: 'Imagens contextuais — atenção a direitos autorais' },
];
const SOURCE_LABEL = { google: 'Google', pexels: 'Pexels', pixabay: 'Pixabay', wikimedia: 'Wikimedia' };

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
  // compacto: rótulo e número na mesma linha
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '3px 9px' }}>
      <span style={{ fontSize: 9.5, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color }}>{value}{sub && <span style={{ color: C.faint, fontSize: 10.5, fontWeight: 500 }}> {sub}</span>}</span>
    </div>
  );
}
