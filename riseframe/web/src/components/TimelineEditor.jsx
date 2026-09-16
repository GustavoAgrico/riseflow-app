import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C, glass, fmtDuration } from '../theme.js';
import { PrimaryButton, GhostButton } from './ui.jsx';
import Icon from './Icon.jsx';
import { sourceUrl } from '../api.js';
import { APP_VERSION } from '../version.js';

const PPS = 64; // pixels por segundo na timeline

/**
 * Editor em timeline (fase 2): pré-visualiza o vídeo original, mostra as legendas
 * como blocos numa linha do tempo sincronizada com o player e deixa:
 * - navegar (clique na régua) e selecionar trechos
 * - CORTAR arrastando as bordas do bloco (trim), palavra a palavra ou trecho inteiro
 * - DIVIDIR um trecho no playhead e JUNTAR com o próximo
 * - corrigir o texto (duplo-clique na palavra)
 * "Renderizar" reprocessa com a transcrição editada.
 */
export default function TimelineEditor({ transcript, durationSec, sourceId, onGenerate, onBack, busy }) {
  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const previewBoxRef = useRef(null);
  const panRef = useRef(null); // arraste na prévia: {startX,startY,fx,fy,w,h,zoom}
  const trackRef = useRef(null);
  const dragRef = useRef(null); // { si, edge: 'left'|'right' }
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState(0);

  // Enquadramento no rosto (tela dividida): 'auto' detecta o rosto no servidor;
  // 'manual' usa o foco (arrastável) + zoom escolhidos aqui.
  const [framingMode, setFramingMode] = useState('manual');
  const [focus, setFocus] = useState({ x: 0.5, y: 0.4 });
  const [zoom, setZoom] = useState(1);
  const [personSide, setPersonSide] = useState('top'); // só p/ a prévia da composição
  const framingBoxRef = useRef(null);
  const focusDragRef = useRef(false);

  const [segments, setSegments] = useState(() =>
    (transcript.segments || []).map((s) => ({
      ...s,
      words: (s.words?.length ? s.words : [{ start: s.start, end: s.end, word: s.text }]).map((w) => ({ ...w, removed: !!w.removed })),
    })),
  );

  const dur = durationSec || segments.reduce((m, s) => Math.max(m, s.end || 0), 0) || 1;
  const width = Math.max(320, Math.round(dur * PPS));

  // ── Pausas de silêncio (gaps entre palavras mantidas). O usuário decide, na
  // timeline, quais cortar. Por padrão TODA pausa visível é cortada (o cliente
  // reclamou que sobrava silêncio); clicar numa pausa a preserva.
  const MIN_PAUSE = 0.35; // só mostra/oferece corte a partir daqui
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

  function timeAtClientX(clientX) {
    const el = trackRef.current;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(dur, (clientX - r.left + el.scrollLeft) / PPS));
  }

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const x = cur * PPS;
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
  const stats = useMemo(() => {
    let total = 0, removed = 0, removedSec = 0;
    for (const s of segments) for (const w of s.words) { total++; if (w.removed) { removed++; removedSec += Math.max(0, w.end - w.start); } }
    const keptSec = Math.max(0, dur - removedSec - pauseCutSec);
    return { total, removed, removedSec, keptSec };
  }, [segments, dur, pauseCutSec]);
  const segRemoved = (s) => s.words.every((w) => w.removed);
  const canSplit = segments.some((s) => cur > s.start + 0.05 && cur < s.end - 0.05);

  function toggleSeg(si) { setSegments((prev) => prev.map((s, i) => { if (i !== si) return s; const gone = segRemoved(s); return { ...s, words: s.words.map((w) => ({ ...w, removed: !gone })) }; })); }
  function toggleWord(si, wi) { setSegments((prev) => prev.map((s, i) => (i !== si ? s : { ...s, words: s.words.map((w, j) => (j !== wi ? w : { ...w, removed: !w.removed })) }))); }
  function editWord(si, wi) {
    const next = window.prompt('Corrigir a palavra (muda a legenda, não o corte):', segments[si].words[wi].word);
    if (next == null) return;
    setSegments((prev) => prev.map((s, i) => (i !== si ? s : { ...s, words: s.words.map((w, j) => (j !== wi ? w : { ...w, word: next })) })));
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 300px) 1fr', gap: 18, alignItems: 'start' }}>
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

          {/* Enquadramento na tela dividida */}
          <div style={{ marginTop: 14, background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
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
        </div>

        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Chip label="Palavras" value={stats.total} color={C.text} />
            <Chip label="Cortadas" value={stats.removed} color={C.red} />
            <Chip label="Pausas cortadas" value={pausesCut.length} sub={pauseCutSec > 0.1 ? `−${fmtDuration(pauseCutSec)}` : null} color={C.orangeSoft} />
            <Chip label="Duração final" value={fmtDuration(stats.keptSec)} sub={(stats.removedSec + pauseCutSec) > 0.1 ? `−${fmtDuration(stats.removedSec + pauseCutSec)}` : null} color={C.green} />
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
      </div>

      {/* Timeline */}
      <div ref={trackRef} onClick={onTrackClick} style={{ position: 'relative', overflowX: 'auto', overflowY: 'hidden', border: `1px solid ${C.border}`, borderRadius: 12, background: 'rgba(0,0,0,0.3)', paddingBottom: 6 }}>
        <div style={{ position: 'relative', width, height: 124 }}>
          <div style={{ position: 'relative', height: 20, borderBottom: `1px solid ${C.border}`, cursor: 'crosshair' }}>
            {Array.from({ length: Math.ceil(dur) + 1 }).map((_, s) => (
              <div key={s} style={{ position: 'absolute', left: s * PPS, top: 0, height: 20, borderLeft: `1px solid ${s % 5 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'}` }}>
                {s % 5 === 0 && <span style={{ position: 'absolute', left: 3, top: 3, fontSize: 9.5, color: C.faint }}>{s}s</span>}
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', height: 64, marginTop: 6 }}>
            {segments.map((s, si) => {
              const left = s.start * PPS;
              const fullW = Math.max(10, (Math.max(s.end, s.start + 0.2) - s.start) * PPS - 2);
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
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (kr[0] - s.start) * PPS, background: 'rgba(240,82,107,0.22)', borderRight: `1px dashed ${C.red}` }} />
                  )}
                  {kr && !gone && kr[1] < s.end - 0.01 && (
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: (s.end - kr[1]) * PPS, background: 'rgba(240,82,107,0.22)', borderLeft: `1px dashed ${C.red}` }} />
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
          {/* Lane de pausas (silêncio entre palavras) — clique alterna cortar/manter */}
          <div style={{ position: 'relative', height: 24, marginTop: 4 }}>
            {pauses.map((p, pi) => {
              const cut = isPauseCut(p);
              const w = Math.max(6, p.dur * PPS - 1);
              return (
                <div
                  key={pi}
                  onClick={(e) => { e.stopPropagation(); togglePause(p); }}
                  title={`Pausa de ${p.dur.toFixed(1)}s — ${cut ? 'será cortada (clique p/ manter)' : 'mantida (clique p/ cortar)'}`}
                  style={{
                    position: 'absolute', left: p.start * PPS, top: 0, width: w, height: 22, borderRadius: 6,
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
          <div style={{ position: 'absolute', left: cur * PPS, top: 0, bottom: 0, width: 2, background: C.orange, boxShadow: `0 0 8px ${C.orange}`, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: -1, left: -4, width: 10, height: 10, borderRadius: '50%', background: C.orange }} />
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 7 }}>Blocos = fala · a faixa de baixo são as <span style={{ color: C.red }}>pausas de silêncio</span> (hachuradas serão cortadas — clique para manter) · arraste as pontas dos blocos para aparar</div>

      <PrimaryButton onClick={generate} disabled={busy || allGone} style={{ width: '100%', marginTop: 18 }}>
        {allGone ? 'Você cortou tudo — reinclua algo' : busy ? 'Gerando…' : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Icon name="clapper" size={18} strokeWidth={1.9} /> Renderizar vídeo final</span>)}
      </PrimaryButton>
    </div>
  );
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
function framingTab(active) {
  return { flex: 1, border: `1px solid ${active ? C.orange : C.border}`, background: active ? 'rgba(255,107,53,0.16)' : 'rgba(255,255,255,0.05)', color: active ? C.orange : C.muted, borderRadius: 9, padding: '7px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
}
const zoomBtn = { width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.06)', color: C.text, fontSize: 16, fontWeight: 700, lineHeight: 1, cursor: 'pointer', display: 'grid', placeItems: 'center', fontFamily: 'inherit' };
function Chip({ label, value, sub, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 11, padding: '7px 12px' }}>
      <div style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color, marginTop: 2 }}>{value} {sub && <span style={{ color: C.faint, fontSize: 11.5, fontWeight: 500 }}>{sub}</span>}</div>
    </div>
  );
}
