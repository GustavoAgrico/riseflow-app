import React, { useState } from 'react';
import { C, GRAD, glass, fmtBytes, fmtDuration } from '../theme.js';
import { GhostButton } from './ui.jsx';
import Icon from './Icon.jsx';
import { previewUrl, downloadUrl } from '../api.js';

// +X% / −X% em relação a 1.0 (ganho neutro)
const fmtGain = (g) => `${g >= 1 ? '+' : '−'}${Math.abs(Math.round((g - 1) * 100))}%`;
const fmtx = (v) => `${Number(v).toFixed(2)}×`;

function Stat({ label, value }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '11px 13px',
      }}
    >
      <div style={{ color: C.faint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 700, marginTop: 3 }}>{value}</div>
    </div>
  );
}

export default function Result({ job, onReset }) {
  const r = job.report || {};
  const inDur = r.input?.duration;
  const cutSec = r.cut?.removedSeconds;
  const [dlHover, setDlHover] = useState(false);

  return (
    <div style={{ ...glass(), padding: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            fontSize: 18,
            background: `linear-gradient(135deg, ${C.green}, #16A34A)`,
            boxShadow: `0 6px 16px -6px ${C.green}88`,
            color: '#fff',
          }}
        >
          <Icon name="check" size={19} strokeWidth={2.4} />
        </span>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Vídeo pronto</div>
        <GhostButton onClick={onReset} style={{ marginLeft: 'auto' }}>
          Editar outro
        </GhostButton>
      </div>

      <video
        src={previewUrl(job.id)}
        controls
        style={{
          width: '100%',
          maxHeight: 470,
          borderRadius: 14,
          background: '#000',
          marginBottom: 18,
          border: `1px solid ${C.border}`,
        }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Stat label="Duração original" value={fmtDuration(inDur)} />
        {cutSec != null && cutSec > 0 && <Stat label="Trechos cortados" value={`−${fmtDuration(cutSec)}`} />}
        {r.captions && <Stat label="Legendas" value={`${r.captions.segments} blocos`} />}
        {r.color && <Stat label="Look" value={r.color.ai ? `IA · ${r.color.look}` : r.color.look} />}
        {r.broll && r.broll.inserted > 0 && <Stat label="B-roll" value={`${r.broll.inserted} clipes`} />}
        {r.output && <Stat label="Formato" value={r.output.aspect} />}
        {r.output?.reframe?.tracked && (
          <Stat label="Enquadramento" value={`IA · segue ${r.output.reframe.source === 'face' ? 'rosto' : 'sujeito'}`} />
        )}
        {r.output && <Stat label="Tamanho" value={fmtBytes(r.output.sizeBytes)} />}
        {r.provider?.transcribe && <Stat label="Transcrição" value={r.provider.transcribe} />}
      </div>

      {r.color?.ai && (
        <div
          style={{
            marginBottom: 18,
            background: 'linear-gradient(180deg, rgba(255,107,53,0.08), rgba(124,58,237,0.05))',
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <Icon name="palette" size={15} color={C.orangeSoft} />
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Color grade por IA</span>
            <span style={{ fontSize: 11, color: C.faint }}>· look {r.color.ai.look}</span>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: C.muted }}>
            <span>Balanço de branco <b style={{ color: C.text }}>
              R{fmtGain(r.color.ai.whiteBalance.rGain)} G{fmtGain(r.color.ai.whiteBalance.gGain)} B{fmtGain(r.color.ai.whiteBalance.bGain)}
            </b></span>
            <span>Contraste <b style={{ color: C.text }}>{fmtx(r.color.ai.contrast)}</b></span>
            <span>Saturação <b style={{ color: C.text }}>{fmtx(r.color.ai.saturation)}</b></span>
            {r.color.ai.gamma !== 1 && <span>Gamma <b style={{ color: C.text }}>{fmtx(r.color.ai.gamma)}</b></span>}
          </div>
        </div>
      )}

      {r.themes?.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: C.faint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, fontWeight: 600 }}>
            Temas detectados
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {r.themes.map((t) => (
              <span
                key={t.term}
                style={{
                  background: 'rgba(124,58,237,0.16)',
                  color: '#C4B5FD',
                  border: `1px solid ${C.purple}44`,
                  borderRadius: 20,
                  padding: '4px 12px',
                  fontSize: 12,
                }}
              >
                {t.term}
              </span>
            ))}
          </div>
        </div>
      )}

      {r.provider?.transcribeFallback && (
        <div
          style={{
            background: 'rgba(240,82,107,0.08)',
            border: `1px solid ${C.red}44`,
            color: '#FCA5B4',
            borderRadius: 12,
            padding: '11px 14px',
            fontSize: 12.5,
            marginBottom: 18,
            lineHeight: 1.5,
          }}
        >
          Transcrição real indisponível, usei o modo mock. Motivo: {r.provider.transcribeFallback}
        </div>
      )}

      <a
        href={downloadUrl(job.id)}
        onMouseEnter={() => setDlHover(true)}
        onMouseLeave={() => setDlHover(false)}
        style={{
          display: 'block',
          textAlign: 'center',
          textDecoration: 'none',
          background: GRAD,
          color: '#fff',
          fontWeight: 700,
          fontSize: 15,
          borderRadius: 14,
          padding: '15px',
          transform: dlHover ? 'translateY(-2px)' : 'none',
          boxShadow: dlHover
            ? '0 14px 34px -8px rgba(255,107,53,0.55), 0 6px 18px -6px rgba(124,58,237,0.5)'
            : '0 8px 22px -8px rgba(255,107,53,0.45)',
          transition: 'transform .18s ease, box-shadow .18s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
        }}
      >
        <Icon name="download" size={19} strokeWidth={2} /> Baixar vídeo final
      </a>
    </div>
  );
}
