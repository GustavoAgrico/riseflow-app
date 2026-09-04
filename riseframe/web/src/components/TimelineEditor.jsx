import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C, glass, fmtDuration } from '../theme.js';
import { PrimaryButton, GhostButton } from './ui.jsx';
import Icon from './Icon.jsx';
import { sourceUrl } from '../api.js';

const PPS = 64; // pixels por segundo na timeline

/**
 * Editor em timeline (fase 1 do editor completo): pré-visualiza o vídeo original,
 * mostra as legendas como blocos numa linha do tempo sincronizada com o vídeo, e
 * deixa cortar/corrigir cada trecho. "Gerar" reprocessa com a transcrição editada.
 */
export default function TimelineEditor({ transcript, durationSec, sourceId, onGenerate, onBack, busy }) {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState(0);

  const [segments, setSegments] = useState(() =>
    (transcript.segments || []).map((s) => ({
      ...s,
      words: (s.words?.length ? s.words : [{ start: s.start, end: s.end, word: s.text }]).map((w) => ({ ...w, removed: false })),
    })),
  );

  const dur = durationSec || segments.reduce((m, s) => Math.max(m, s.end || 0), 0) || 1;
  const width = Math.max(320, Math.round(dur * PPS));

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
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, []);

  // mantém o trecho corrente visível na timeline
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const x = cur * PPS;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
    }
  }, [cur]);

  function seek(t) {
    const v = videoRef.current;
    const clamped = Math.max(0, Math.min(dur, t));
    if (v) v.currentTime = clamped;
    setCur(clamped);
  }
  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }
  function onTrackClick(e) {
    const el = trackRef.current;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft;
    seek(x / PPS);
  }

  const activeIndex = useMemo(() => segments.findIndex((s) => cur >= s.start && cur < (s.end || s.start + 0.1)), [segments, cur]);

  const stats = useMemo(() => {
    let total = 0, removed = 0, removedSec = 0;
    for (const s of segments) for (const w of s.words) { total++; if (w.removed) { removed++; removedSec += Math.max(0, w.end - w.start); } }
    return { total, removed, removedSec, keptSec: Math.max(0, dur - removedSec) };
  }, [segments, dur]);

  const segRemoved = (s) => s.words.every((w) => w.removed);

  function toggleSeg(si) {
    setSegments((prev) => prev.map((s, i) => {
      if (i !== si) return s;
      const gone = segRemoved(s);
      return { ...s, words: s.words.map((w) => ({ ...w, removed: !gone })) };
    }));
  }
  function toggleWord(si, wi) {
    setSegments((prev) => prev.map((s, i) => (i !== si ? s : { ...s, words: s.words.map((w, j) => (j !== wi ? w : { ...w, removed: !w.removed })) })));
  }
  function editWord(si, wi) {
    const current = segments[si].words[wi].word;
    const next = window.prompt('Corrigir a palavra (muda a legenda, não o corte):', current);
    if (next == null) return;
    setSegments((prev) => prev.map((s, i) => (i !== si ? s : { ...s, words: s.words.map((w, j) => (j !== wi ? w : { ...w, word: next })) })));
  }

  function generate() {
    onGenerate({
      provider: transcript.provider,
      language: transcript.language,
      segments: segments.map((s) => ({
        start: s.start, end: s.end,
        words: s.words.map((w) => ({ start: w.start, end: w.end, word: w.word, removed: !!w.removed })),
      })),
    });
  }

  const allGone = stats.removed >= stats.total;
  const selSeg = segments[sel];

  return (
    <div style={{ ...glass(), padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
        <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name="film" size={20} strokeWidth={1.9} /></span>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Timeline · editar antes de renderizar</div>
        <GhostButton onClick={onBack} disabled={busy} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="arrowLeft" size={14} strokeWidth={2} /> Voltar
        </GhostButton>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 300px) 1fr', gap: 18, alignItems: 'start' }}>
        {/* Preview do vídeo */}
        <div>
          <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}`, background: '#000' }}>
            <video
              ref={videoRef}
              src={sourceUrl(sourceId)}
              style={{ width: '100%', display: 'block', maxHeight: 420, objectFit: 'contain', background: '#000' }}
              onClick={togglePlay}
              playsInline
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <button onClick={togglePlay} style={playBtn}>
              <Icon name={playing ? 'pause' : 'play'} size={16} strokeWidth={2} />
            </button>
            <div style={{ fontSize: 12.5, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
              {fmtDuration(cur)} <span style={{ color: C.faint }}>/ {fmtDuration(dur)}</span>
            </div>
          </div>
        </div>

        {/* Coluna direita: stats + trecho selecionado */}
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Chip label="Palavras" value={stats.total} color={C.text} />
            <Chip label="Cortadas" value={stats.removed} color={C.red} />
            <Chip label="Duração final" value={fmtDuration(stats.keptSec)} sub={stats.removedSec > 0.1 ? `−${fmtDuration(stats.removedSec)}` : null} color={C.green} />
          </div>

          {selSeg && (
            <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, letterSpacing: 0.4 }}>
                  TRECHO {sel + 1}/{segments.length} · {fmtDuration(selSeg.start)}
                </div>
                <button onClick={() => toggleSeg(sel)} style={{ marginLeft: 'auto', ...miniBtn(segRemoved(selSeg)) }}>
                  <Icon name={segRemoved(selSeg) ? 'undo' : 'close'} size={12} strokeWidth={2.2} />
                  {segRemoved(selSeg) ? 'Reincluir' : 'Cortar trecho'}
                </button>
              </div>
              <div style={{ lineHeight: 2 }}>
                {selSeg.words.map((w, wi) => (
                  <span
                    key={wi}
                    onClick={() => toggleWord(sel, wi)}
                    onDoubleClick={() => editWord(sel, wi)}
                    title={`${w.start.toFixed(1)}s — clique corta, 2 cliques edita`}
                    style={{
                      display: 'inline-block', margin: '0 3px', padding: '2px 6px', borderRadius: 7, cursor: 'pointer', userSelect: 'none',
                      textDecoration: w.removed ? 'line-through' : 'none', opacity: w.removed ? 0.42 : 1,
                      background: w.removed ? 'rgba(240,82,107,0.14)' : 'transparent', color: w.removed ? C.red : C.text,
                    }}
                  >
                    {w.word}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
                Clique numa palavra para cortá-la do vídeo · duplo-clique para corrigir o texto
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ marginTop: 16 }}>
        <div
          ref={trackRef}
          onClick={onTrackClick}
          style={{ position: 'relative', overflowX: 'auto', overflowY: 'hidden', border: `1px solid ${C.border}`, borderRadius: 12, background: 'rgba(0,0,0,0.3)', cursor: 'crosshair', paddingBottom: 6 }}
        >
          <div style={{ position: 'relative', width, height: 96 }}>
            {/* régua de segundos */}
            <div style={{ position: 'relative', height: 20, borderBottom: `1px solid ${C.border}` }}>
              {Array.from({ length: Math.ceil(dur) + 1 }).map((_, s) => (
                <div key={s} style={{ position: 'absolute', left: s * PPS, top: 0, height: 20, borderLeft: `1px solid ${s % 5 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'}` }}>
                  {s % 5 === 0 && <span style={{ position: 'absolute', left: 3, top: 3, fontSize: 9.5, color: C.faint }}>{s}s</span>}
                </div>
              ))}
            </div>
            {/* blocos de legenda */}
            <div style={{ position: 'relative', height: 64, marginTop: 6 }}>
              {segments.map((s, si) => {
                const left = s.start * PPS;
                const w = Math.max(10, (Math.max(s.end, s.start + 0.2) - s.start) * PPS - 2);
                const gone = segRemoved(s);
                const isSel = si === sel;
                const isActive = si === activeIndex;
                return (
                  <button
                    key={si}
                    onClick={(e) => { e.stopPropagation(); setSel(si); seek(s.start); }}
                    title={s.words.map((x) => x.word).join(' ')}
                    style={{
                      position: 'absolute', left, width: w, top: 6, height: 52, textAlign: 'left',
                      borderRadius: 8, padding: '5px 7px', overflow: 'hidden', cursor: 'pointer',
                      border: isSel ? `1.5px solid ${C.orange}` : `1px solid ${gone ? 'rgba(240,82,107,0.5)' : C.border}`,
                      background: gone
                        ? 'rgba(240,82,107,0.16)'
                        : isActive ? 'linear-gradient(180deg, rgba(255,107,53,0.32), rgba(124,58,237,0.22))' : 'rgba(255,255,255,0.06)',
                      color: gone ? C.red : C.text,
                      boxShadow: isSel ? `0 0 0 2px ${C.orange}33` : 'none',
                      transition: 'background .12s',
                    }}
                  >
                    <span style={{ fontSize: 10.5, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textDecoration: gone ? 'line-through' : 'none' }}>
                      {s.words.map((x) => x.word).join(' ')}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* playhead */}
            <div style={{ position: 'absolute', left: cur * PPS, top: 0, bottom: 0, width: 2, background: C.orange, boxShadow: `0 0 8px ${C.orange}`, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: -1, left: -4, width: 10, height: 10, borderRadius: '50%', background: C.orange }} />
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 7 }}>
          Clique na régua para navegar · clique num bloco para selecionar e corrigir · trechos vermelhos serão cortados
        </div>
      </div>

      <PrimaryButton onClick={generate} disabled={busy || allGone} style={{ width: '100%', marginTop: 18 }}>
        {allGone ? 'Você cortou tudo — reinclua algo' : busy ? 'Gerando…' : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <Icon name="clapper" size={18} strokeWidth={1.9} /> Renderizar vídeo final
          </span>
        )}
      </PrimaryButton>
    </div>
  );
}

const playBtn = {
  width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, #FF6B35, #7C3AED)', color: '#fff', display: 'grid', placeItems: 'center',
  boxShadow: '0 6px 16px -6px rgba(255,107,53,0.6)',
};
function miniBtn(active) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${active ? C.red : C.border}`,
    background: active ? 'rgba(240,82,107,0.18)' : 'rgba(255,255,255,0.05)', color: active ? C.red : C.muted,
    borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  };
}
function Chip({ label, value, sub, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 11, padding: '7px 12px' }}>
      <div style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color, marginTop: 2 }}>
        {value} {sub && <span style={{ color: C.faint, fontSize: 11.5, fontWeight: 500 }}>{sub}</span>}
      </div>
    </div>
  );
}
