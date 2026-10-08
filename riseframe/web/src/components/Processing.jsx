import React from 'react';
import { C, GRAD, glass, FONT_DISPLAY } from '../theme.js';
import Icon from './Icon.jsx';

// Nomes amigáveis de cada etapa do servidor.
const SHORT = {
  probe: 'Analisando o vídeo',
  voice: 'Tratando a voz',
  gain: 'Ajustando o volume',
  transcribe: 'Transcrevendo a fala',
  voicefx: 'Aplicando o efeito de voz',
  cut: 'Cortando pausas',
  analyze: 'Encontrando os momentos-chave',
  motion: 'Aplicando o zoom',
  broll: 'Inserindo imagens de apoio',
  frame: 'Reenquadrando',
  usermedia: 'Aplicando suas mídias',
  aspect: 'Ajustando o formato',
  captions: 'Criando as legendas',
  watermark: 'Aplicando o seu logo',
  sfx: 'Adicionando efeitos sonoros',
  color: 'Corrigindo luz e cor',
  clips: 'Montando os cortes',
  render: 'Finalizando o vídeo',
};

/** Anel de progresso com o gradiente da marca. */
export function Ring({ pct = 0, size = 168, stroke = 11, label }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{ position: 'absolute', inset: 18, borderRadius: '50%', background: GRAD, filter: 'blur(34px)', opacity: 0.32, animation: 'rf-pulse-glow 2.4s ease-in-out infinite' }} />
      <svg width={size} height={size} style={{ position: 'relative', transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="rfRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={C.orange} />
            <stop offset="1" stopColor={C.purple} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#rfRing)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={len} strokeDashoffset={len * (1 - p)} style={{ transition: 'stroke-dashoffset .45s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ fontSize: size * 0.2, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>
          {label ?? `${Math.round(p * 100)}%`}
        </div>
      </div>
    </div>
  );
}

/**
 * Tela "A IA está editando seu vídeo": anel de progresso + etapas (feitas ✓, a atual,
 * as próximas). `job` = o job do servidor (etapas reais); sem job, use `pct` e `steps`.
 */
export default function Processing({ job, title = 'A IA está editando seu vídeo', subtitle = 'Isso leva só alguns minutos. Pode deixar esta tela aberta.', pct, steps }) {
  const flow = steps || (job?.steps?.length ? job.steps.map((s) => ({ key: s.key, label: SHORT[s.key] || s.label })) : []);
  const order = flow.map((s) => s.key);
  const cur = job?.stage === 'done' ? order.length : order.indexOf(job?.stage);
  const value = pct ?? (job?.progress ?? 0) / 100;

  return (
    <div style={{ ...glass({ padding: 'clamp(24px, 4vw, 40px)' }), position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 80% 110%, rgba(124,58,237,0.22), transparent 55%), radial-gradient(circle at 10% -10%, rgba(255,107,53,0.14), transparent 50%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <h2 style={{ fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.6, margin: '0 0 6px' }}>{title}</h2>
        <p style={{ color: C.muted, fontSize: 14.5, margin: '0 0 26px' }}>{subtitle}</p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
          <Ring pct={value} />
        </div>
        {job?.stageLabel && <div style={{ fontSize: 14, fontWeight: 600, color: C.orangeSoft, marginBottom: 18 }}>{job.stageLabel}…</div>}
        {flow.length > 0 && (
          <div style={{ display: 'inline-grid', gap: 10, textAlign: 'left', minWidth: 'min(320px, 100%)' }}>
            {flow.map((s, i) => {
              const done = i < cur;
              const active = i === cur;
              return (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14, color: done || active ? C.text : C.faint, fontWeight: active ? 650 : 500 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: done ? C.green : 'transparent', border: done ? 'none' : `1.5px solid ${active ? C.orange : C.borderStrong}`,
                    boxShadow: done ? `0 0 10px ${C.green}55` : active ? `0 0 0 4px rgba(255,107,53,0.14)` : 'none',
                  }}>
                    {done ? <Icon name="check" size={13} strokeWidth={3} color="#fff" /> : active ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: GRAD, animation: 'rf-pulse-glow 1.2s ease-in-out infinite' }} /> : null}
                  </span>
                  {s.label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
