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

export default function Result({ job, onReset, onEditTimeline }) {
  const r = job.report || {};
  const inDur = r.input?.duration;
  const cutSec = r.cut?.removedSeconds;
  const [dlHover, setDlHover] = useState(false);

  return (
    <div style={{ ...glass(), padding: 'clamp(16px, 3vw, 26px)' }}>
      <style>{`@media (max-width: 860px){ .rf-res-grid{ grid-template-columns: 1fr !important; } }`}</style>
      <div className="rf-res-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 330px', gap: 24, alignItems: 'start', marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'center', borderRadius: 18, background: 'radial-gradient(circle at 50% 0%, rgba(255,107,53,0.14), transparent 60%), rgba(0,0,0,0.35)', border: `1px solid ${C.border}`, padding: 12 }}>
          <video
            src={previewUrl(job.id)}
            controls
            playsInline
            style={{ width: '100%', maxHeight: 560, borderRadius: 12, background: '#000', display: 'block', objectFit: 'contain' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${C.green}, #16A34A)`, boxShadow: `0 8px 18px -6px ${C.green}88`, color: '#fff', flexShrink: 0 }}>
              <Icon name="check" size={22} strokeWidth={2.6} />
            </span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: -0.3 }}>Seu vídeo está pronto</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Exporte e publique onde quiser</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>PRONTO PARA</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn']].map(([ic, l]) => (
                <div key={l} style={{ display: 'grid', justifyItems: 'center', gap: 5, padding: '10px 4px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', fontSize: 11, color: C.muted }}>
                  <Icon name={ic} size={19} strokeWidth={1.8} color={C.text} /> {l}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {r.output?.aspect && <span style={chip}><Icon name="crop" size={13} strokeWidth={2} /> {r.output.aspect}</span>}
            {r.output?.width && r.output?.height && <span style={chip}>{Math.min(r.output.width, r.output.height) >= 1080 ? '1080p' : `${Math.min(r.output.width, r.output.height)}p`}</span>}
            {r.output?.sizeBytes > 0 && <span style={chip}>{fmtBytes(r.output.sizeBytes)}</span>}
            <span style={chip}>MP4 · sem marca d'água</span>
          </div>

          <a
            href={downloadUrl(job.id)}
            onMouseEnter={() => setDlHover(true)}
            onMouseLeave={() => setDlHover(false)}
            style={{
              textAlign: 'center', textDecoration: 'none', background: GRAD, color: '#fff', fontWeight: 700, fontSize: 15.5, borderRadius: 14, padding: '15px',
              transform: dlHover ? 'translateY(-2px)' : 'none',
              boxShadow: dlHover ? '0 14px 34px -8px rgba(255,107,53,0.55), 0 6px 18px -6px rgba(124,58,237,0.5)' : '0 8px 22px -8px rgba(255,107,53,0.45)',
              transition: 'transform .18s ease, box-shadow .18s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            }}
          >
            <Icon name="download" size={19} strokeWidth={2} /> Exportar vídeo
          </a>
          {onEditTimeline && (
            <button onClick={onEditTimeline} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, background: 'transparent', border: `1px solid ${C.borderStrong || C.border}`, color: C.text, borderRadius: 14, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Icon name="edit" size={17} strokeWidth={2} /> Ajustar na timeline
            </button>
          )}
          <GhostButton onClick={onReset} style={{ width: '100%' }}>Criar outro vídeo</GhostButton>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>O QUE A IA FEZ</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Stat label="Duração original" value={fmtDuration(inDur)} />
        {cutSec != null && cutSec > 0 && <Stat label="Trechos cortados" value={`−${fmtDuration(cutSec)}`} />}
        {r.autoClean?.removed > 0 && (
          <Stat label="Fala corrigida" value={`${r.autoClean.removed} ${r.autoClean.removed === 1 ? 'palavra' : 'palavras'}${r.autoClean.method === 'IA' ? ' · IA' : ''}`} />
        )}
        {r.voice?.applied && <Stat label="Voz" value="limpa · volume normalizado" />}
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
            background: 'rgba(240,82,107,0.10)',
            border: `1px solid ${C.red}66`,
            color: '#FCA5B4',
            borderRadius: 12,
            padding: '13px 15px',
            fontSize: 12.5,
            marginBottom: 18,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontWeight: 700, color: '#FFB4C0', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="alert" size={16} strokeWidth={2.2} /> Legendas de demonstração (não batem com a fala)
          </div>
          A transcrição real (ASR) não rodou, então as legendas usam texto de exemplo
          e a correção automática da fala fica limitada. Para legendas fiéis à fala,
          instale o Whisper local (uma vez) na pasta do servidor:{' '}
          <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 5 }}>
            pip install -r requirements.txt
          </code>{' '}
          — na 1ª execução ele baixa o modelo e passa a transcrever de verdade.
          <div style={{ marginTop: 6, opacity: 0.8 }}>Motivo técnico: {r.provider.transcribeFallback}</div>
        </div>
      )}

    </div>
  );
}

const chip = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: C.text, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 10px' };
