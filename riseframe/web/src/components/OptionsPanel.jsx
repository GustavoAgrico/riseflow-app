import React from 'react';
import { C, GRAD } from '../theme.js';

function Row({ label, hint, children }) {
  return (
    <div style={{ padding: '15px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
          {hint && <div style={{ color: C.faint, fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
        </div>
        <div style={{ flexShrink: 0 }}>{children}</div>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      style={{
        width: 48,
        height: 27,
        borderRadius: 20,
        border: 'none',
        background: on ? GRAD : 'rgba(255,255,255,0.1)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background .2s',
        boxShadow: on ? '0 4px 12px -3px rgba(255,107,53,0.6)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 24 : 3,
          width: 21,
          height: 21,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .2s cubic-bezier(.22,1,.36,1)',
          boxShadow: '0 2px 5px rgba(0,0,0,0.35)',
        }}
      />
    </button>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 11, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '6px 13px',
              fontSize: 12.5,
              cursor: 'pointer',
              transition: 'all .15s ease',
              background: on ? GRAD : 'transparent',
              color: on ? '#fff' : C.muted,
              fontWeight: on ? 600 : 500,
              boxShadow: on ? '0 4px 12px -4px rgba(255,107,53,0.5)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Select({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: '#13131B',
        color: C.text,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '9px 12px',
        fontSize: 13,
        minWidth: 210,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Swatches({ value, options, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            title={o.label}
            style={{
              width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
              background: o.hex,
              border: on ? '2px solid #fff' : '2px solid rgba(255,255,255,0.15)',
              boxShadow: on ? `0 0 0 2px ${o.hex}, 0 0 10px ${o.hex}88` : 'none',
              transition: 'all .12s',
            }}
          />
        );
      })}
    </div>
  );
}

export default function OptionsPanel({ catalog, options, onChange, disabled }) {
  const set = (patch) => onChange({ ...options, ...patch });
  const caps = catalog?.capabilities || {};

  return (
    <div style={{ opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <Row label="Cortar pausas e silêncios" hint="Remove trechos sem fala e remonta a timeline">
        <Toggle on={options.cutSilence} onChange={(v) => set({ cutSilence: v })} />
      </Row>

      {options.cutSilence && (
        <Row label="Sensibilidade do silêncio" hint={`Ruído < ${options.silenceNoiseDb} dB por ${options.silenceMinDuration}s`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 190 }}>
            <input type="range" min={-50} max={-15} value={options.silenceNoiseDb}
              onChange={(e) => set({ silenceNoiseDb: Number(e.target.value) })} />
            <input type="range" min={0.2} max={2} step={0.1} value={options.silenceMinDuration}
              onChange={(e) => set({ silenceMinDuration: Number(e.target.value) })} />
          </div>
        </Row>
      )}

      <Row
        label="Corrigir a fala automaticamente"
        hint="Remove muletas e hesitações (é..., hã, hmm) e gagueiras (palavras repetidas). Requer transcrição real (ASR) — no modo demonstração o efeito é limitado."
      >
        <Toggle on={options.autoClean !== false} onChange={(v) => set({ autoClean: v })} />
      </Row>

      <Row label="Legendas dinâmicas" hint="Transcrição queimada no vídeo, palavra-a-palavra">
        <Toggle on={options.captions} onChange={(v) => set({ captions: v })} />
      </Row>

      {options.captions && (
        <>
          <Row label="Estilo da legenda" hint="Look + movimento das legendas">
            <Select value={options.captionTemplate} options={catalog.captionTemplates} onChange={(v) => set({ captionTemplate: v })} />
          </Row>
          <Row label="Cor de destaque" hint="Padrão branco">
            <Swatches value={options.captionColor} options={catalog.captionColors} onChange={(v) => set({ captionColor: v })} />
          </Row>
        </>
      )}

      <Row
        label="Color grade cinematográfico"
        hint={
          options.colorLook === 'auto'
            ? 'A IA analisa o vídeo e calcula a correção + o look'
            : 'O diferencial de acabamento do Riseframe'
        }
      >
        <Select value={options.colorLook} options={catalog.colorLooks} onChange={(v) => set({ colorLook: v })} />
      </Row>

      <Row
        label="B-roll automático (Pexels)"
        hint={caps.brollReady ? 'Insere imagens de apoio de banco gratuito' : 'Requer PEXELS_API_KEY no servidor'}
      >
        <Toggle on={options.broll} onChange={(v) => set({ broll: v })} disabled={!caps.brollReady} />
      </Row>

      <Row label="Formato de saída" hint="Reframe automático para a plataforma">
        <Select value={options.aspect} options={catalog.aspects} onChange={(v) => set({ aspect: v })} />
      </Row>

      {options.aspect !== 'original' && (
        <Row label="Seguir o sujeito (tracking)" hint="A IA mantém o rosto/sujeito no quadro em vez de crop central">
          <Toggle on={options.reframeTrack !== false} onChange={(v) => set({ reframeTrack: v })} />
        </Row>
      )}
    </div>
  );
}
