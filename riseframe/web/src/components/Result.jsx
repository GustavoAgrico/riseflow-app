import React from 'react';
import { C, fmtBytes, fmtDuration } from '../theme.js';
import { previewUrl, downloadUrl } from '../api.js';

function Stat({ label, value }) {
  return (
    <div style={{ background: C.panel2, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ color: C.faint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default function Result({ job, onReset }) {
  const r = job.report || {};
  const inDur = r.input?.duration;
  const outFromSilence = r.silence?.removedSeconds;

  return (
    <div style={{ background: C.panel, borderRadius: 16, padding: 22, border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>✅</span>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Vídeo pronto</div>
        <button onClick={onReset} style={{
          marginLeft: 'auto', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13,
        }}>
          Editar outro
        </button>
      </div>

      <video
        src={previewUrl(job.id)}
        controls
        style={{ width: '100%', maxHeight: 460, borderRadius: 12, background: '#000', marginBottom: 16 }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
        <Stat label="Duração original" value={fmtDuration(inDur)} />
        {outFromSilence != null && <Stat label="Silêncio cortado" value={`−${fmtDuration(outFromSilence)}`} />}
        {r.captions && <Stat label="Legendas" value={`${r.captions.segments} blocos`} />}
        {r.color && <Stat label="Look" value={r.color.look} />}
        {r.broll && r.broll.inserted > 0 && <Stat label="B-roll" value={`${r.broll.inserted} clipes`} />}
        {r.output && <Stat label="Formato" value={r.output.aspect} />}
        {r.output && <Stat label="Tamanho" value={fmtBytes(r.output.sizeBytes)} />}
        {r.provider?.transcribe && <Stat label="Transcrição" value={r.provider.transcribe} />}
      </div>

      {r.themes?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: C.faint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
            Temas detectados
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {r.themes.map((t) => (
              <span key={t.term} style={{
                background: 'rgba(124,58,237,0.15)', color: '#C4B5FD', border: `1px solid ${C.purple}44`,
                borderRadius: 20, padding: '4px 11px', fontSize: 12,
              }}>
                {t.term}
              </span>
            ))}
          </div>
        </div>
      )}

      {r.provider?.transcribeFallback && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.red}44`, color: '#FCA5A5',
          borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 16,
        }}>
          Transcrição real indisponível, usei o modo mock. Motivo: {r.provider.transcribeFallback}
        </div>
      )}

      <a
        href={downloadUrl(job.id)}
        style={{
          display: 'block', textAlign: 'center', textDecoration: 'none',
          background: `linear-gradient(90deg, ${C.orange}, ${C.purple})`, color: '#fff', fontWeight: 700,
          borderRadius: 12, padding: '14px', fontSize: 15,
        }}
      >
        ⬇ Baixar vídeo final
      </a>
    </div>
  );
}
