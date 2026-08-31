import React, { useMemo, useState } from 'react';
import { C, fmtDuration } from '../theme.js';

/**
 * Editor de transcrição: editar o vídeo editando o texto.
 * - clique numa palavra → remove/reinclui (o trecho correspondente é cortado do vídeo)
 * - duplo-clique → edita o texto da palavra (muda a legenda, não o tempo)
 */
export default function TranscriptEditor({ transcript, durationSec, onGenerate, onBack, busy }) {
  // Estado local: cópia editável dos segmentos.
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
    // Envia apenas o essencial (start/end/word/removed).
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
    <div style={{ background: C.panel, borderRadius: 16, padding: 22, border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 20 }}>📝</span>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Editar pela transcrição</div>
        <button
          onClick={onBack}
          disabled={busy}
          style={{
            marginLeft: 'auto', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '7px 12px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13,
          }}
        >
          ← Voltar
        </button>
      </div>
      <p style={{ color: C.muted, fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
        Clique numa palavra para <strong style={{ color: C.orange }}>cortá-la do vídeo</strong>. Duplo-clique
        para corrigir o texto. Passe o mouse numa linha e use ✕ para cortar a frase inteira.
      </p>

      {/* barra de estatísticas */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: 13 }}>
        <span style={{ color: C.muted }}>
          Palavras: <strong style={{ color: C.text }}>{stats.total}</strong>
        </span>
        <span style={{ color: C.muted }}>
          Cortadas: <strong style={{ color: C.red }}>{stats.removed}</strong>
        </span>
        <span style={{ color: C.muted }}>
          Duração estimada:{' '}
          <strong style={{ color: C.green }}>{fmtDuration(stats.keptSec)}</strong>{' '}
          {stats.removedSec > 0.1 && <span style={{ color: C.faint }}>(−{fmtDuration(stats.removedSec)})</span>}
        </span>
      </div>

      {/* transcrição */}
      <div
        style={{
          maxHeight: 340, overflowY: 'auto', background: C.bg, borderRadius: 12,
          padding: 16, lineHeight: 2, border: `1px solid ${C.border}`,
        }}
      >
        {segments.map((s, si) => {
          const segGone = s.words.every((w) => w.removed);
          return (
            <div
              key={si}
              className="rf-seg"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}
            >
              <button
                onClick={() => toggleSegment(si)}
                title={segGone ? 'Reincluir frase' : 'Cortar frase inteira'}
                style={{
                  flexShrink: 0, marginTop: 4, width: 20, height: 20, borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${C.border}`, background: segGone ? C.red : C.panel2,
                  color: segGone ? '#fff' : C.faint, fontSize: 11, lineHeight: 1,
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
                      display: 'inline-block', margin: '0 3px', padding: '1px 5px', borderRadius: 6,
                      cursor: 'pointer', userSelect: 'none',
                      textDecoration: w.removed ? 'line-through' : 'none',
                      opacity: w.removed ? 0.4 : 1,
                      background: w.removed ? 'rgba(239,68,68,0.12)' : 'transparent',
                      color: w.removed ? C.red : C.text,
                    }}
                    onMouseEnter={(e) => {
                      if (!w.removed) e.currentTarget.style.background = C.panel2;
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

      <button
        onClick={generate}
        disabled={busy || allGone}
        style={{
          marginTop: 18, width: '100%', border: 'none', borderRadius: 12, padding: '15px', fontSize: 15,
          fontWeight: 700, cursor: busy || allGone ? 'not-allowed' : 'pointer',
          background: busy || allGone ? C.panel2 : `linear-gradient(90deg, ${C.orange}, ${C.purple})`,
          color: busy || allGone ? C.faint : '#fff',
        }}
      >
        {allGone ? 'Você cortou tudo — reinclua algo' : busy ? 'Gerando…' : '🎬 Gerar vídeo editado'}
      </button>
    </div>
  );
}
