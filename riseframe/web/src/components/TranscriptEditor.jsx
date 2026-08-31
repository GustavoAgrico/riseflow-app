import React, { useMemo, useState } from 'react';
import { C, glass, fmtDuration } from '../theme.js';
import { PrimaryButton, GhostButton } from './ui.jsx';

/**
 * Editor de transcrição: editar o vídeo editando o texto.
 * - clique numa palavra → remove/reinclui (o trecho correspondente é cortado do vídeo)
 * - duplo-clique → edita o texto da palavra (muda a legenda, não o tempo)
 */
export default function TranscriptEditor({ transcript, durationSec, onGenerate, onBack, busy }) {
  const [segments, setSegments] = useState(() =>
    (transcript.segments || []).map((s) => ({
      ...s,
      words: (s.words?.length ? s.words : [{ start: s.start, end: s.end, word: s.text }]).map((w) => ({
        ...w,
        removed: false,
      })),
    })),
  );

  const stats = useMemo(() => {
    let total = 0;
    let removed = 0;
    let removedSec = 0;
    for (const s of segments) {
      for (const w of s.words) {
        total++;
        if (w.removed) {
          removed++;
          removedSec += Math.max(0, w.end - w.start);
        }
      }
    }
    return { total, removed, removedSec, keptSec: Math.max(0, (durationSec || 0) - removedSec) };
  }, [segments, durationSec]);

  function toggleWord(si, wi) {
    setSegments((prev) =>
      prev.map((s, i) =>
        i !== si ? s : { ...s, words: s.words.map((w, j) => (j !== wi ? w : { ...w, removed: !w.removed })) },
      ),
    );
  }

  function editWord(si, wi) {
    const current = segments[si].words[wi].word;
    const next = window.prompt('Editar palavra (muda a legenda, não o corte):', current);
    if (next == null) return;
    setSegments((prev) =>
      prev.map((s, i) =>
        i !== si ? s : { ...s, words: s.words.map((w, j) => (j !== wi ? w : { ...w, word: next })) },
      ),
    );
  }

  function toggleSegment(si) {
    setSegments((prev) =>
      prev.map((s, i) => {
        if (i !== si) return s;
        const allRemoved = s.words.every((w) => w.removed);
        return { ...s, words: s.words.map((w) => ({ ...w, removed: !allRemoved })) };
      }),
    );
  }

  function generate() {
    const edited = {
      provider: transcript.provider,
      language: transcript.language,
      segments: segments.map((s) => ({
        start: s.start,
        end: s.end,
        words: s.words.map((w) => ({ start: w.start, end: w.end, word: w.word, removed: !!w.removed })),
      })),
    };
    onGenerate(edited);
  }

  const allGone = stats.removed >= stats.total;

  return (
    <div style={{ ...glass(), padding: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>📝</span>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Editar pela transcrição</div>
        <GhostButton onClick={onBack} disabled={busy} style={{ marginLeft: 'auto' }}>
          ← Voltar
        </GhostButton>
      </div>
      <p style={{ color: C.muted, fontSize: 13, margin: '0 0 18px', lineHeight: 1.55 }}>
        Clique numa palavra para <strong style={{ color: C.orangeSoft }}>cortá-la do vídeo</strong>. Duplo-clique
        para corrigir o texto. Passe o mouse numa linha e use ✕ para cortar a frase inteira.
      </p>

      {/* estatísticas */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <Chip label="Palavras" value={stats.total} color={C.text} />
        <Chip label="Cortadas" value={stats.removed} color={C.red} />
        <Chip
          label="Duração estimada"
          value={fmtDuration(stats.keptSec)}
          sub={stats.removedSec > 0.1 ? `−${fmtDuration(stats.removedSec)}` : null}
          color={C.green}
        />
      </div>

      {/* transcrição */}
      <div
        style={{
          maxHeight: 340,
          overflowY: 'auto',
          background: 'rgba(0,0,0,0.28)',
          borderRadius: 14,
          padding: 18,
          lineHeight: 2.1,
          border: `1px solid ${C.border}`,
        }}
      >
        {segments.map((s, si) => {
          const segGone = s.words.every((w) => w.removed);
          return (
            <div key={si} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 7 }}>
              <button
                onClick={() => toggleSegment(si)}
                title={segGone ? 'Reincluir frase' : 'Cortar frase inteira'}
                style={{
                  flexShrink: 0,
                  marginTop: 5,
                  width: 21,
                  height: 21,
                  borderRadius: 7,
                  cursor: 'pointer',
                  border: `1px solid ${C.border}`,
                  background: segGone ? C.red : 'rgba(255,255,255,0.05)',
                  color: segGone ? '#fff' : C.faint,
                  fontSize: 11,
                  lineHeight: 1,
                  transition: 'all .15s',
                }}
              >
                {segGone ? '↺' : '✕'}
              </button>
              <div style={{ flex: 1 }}>
                {s.words.map((w, wi) => (
                  <span
                    key={wi}
                    onClick={() => toggleWord(si, wi)}
                    onDoubleClick={() => editWord(si, wi)}
                    title={`${w.start.toFixed(1)}s`}
                    style={{
                      display: 'inline-block',
                      margin: '0 3px',
                      padding: '2px 6px',
                      borderRadius: 7,
                      cursor: 'pointer',
                      userSelect: 'none',
                      textDecoration: w.removed ? 'line-through' : 'none',
                      opacity: w.removed ? 0.42 : 1,
                      background: w.removed ? 'rgba(240,82,107,0.14)' : 'transparent',
                      color: w.removed ? C.red : C.text,
                      transition: 'background .12s, opacity .12s',
                    }}
                    onMouseEnter={(e) => {
                      if (!w.removed) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      if (!w.removed) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {w.word}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <PrimaryButton onClick={generate} disabled={busy || allGone} style={{ width: '100%', marginTop: 20 }}>
        {allGone ? 'Você cortou tudo — reinclua algo' : busy ? 'Gerando…' : '🎬  Gerar vídeo editado'}
      </PrimaryButton>
    </div>
  );
}

function Chip({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${C.border}`,
        borderRadius: 11,
        padding: '8px 13px',
      }}
    >
      <div style={{ fontSize: 10.5, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color, marginTop: 2 }}>
        {value} {sub && <span style={{ color: C.faint, fontSize: 12, fontWeight: 500 }}>{sub}</span>}
      </div>
    </div>
  );
}
