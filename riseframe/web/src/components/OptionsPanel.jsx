import React from 'react';
import { C } from '../theme.js';

function Row({ label, hint, children }) {
  return (
    <div style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
          {hint && <div style={{ color: C.faint, fontSize: 12, marginTop: 2 }}>{hint}</div>}
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
        width: 46, height: 26, borderRadius: 20, border: 'none',
        background: on ? C.orange : C.border, position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'background .15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20,
        borderRadius: '50%', background: '#fff', transition: 'left .15s',
      }} />
    </button>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: C.panel2, padding: 4, borderRadius: 10, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          style={{
            border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
            background: value === o.id ? C.orange : 'transparent',
            color: value === o.id ? '#fff' : C.muted, fontWeight: value === o.id ? 600 : 400,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Select({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: C.panel2, color: C.text, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: '8px 10px', fontSize: 13, minWidth: 200,
      }}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
            <input type="range" min={-50} max={-15} value={options.silenceNoiseDb}
              onChange={(e) => set({ silenceNoiseDb: Number(e.target.value) })} />
            <input type="range" min={0.2} max={2} step={0.1} value={options.silenceMinDuration}
              onChange={(e) => set({ silenceMinDuration: Number(e.target.value) })} />
          </div>
        </Row>
      )}

      <Row label="Legendas dinâmicas" hint="Transcrição queimada no vídeo, palavra-a-palavra">
        <Toggle on={options.captions} onChange={(v) => set({ captions: v })} />
      </Row>

      {options.captions && (
        <>
          <Row label="Estilo da legenda">
            <Segmented value={options.captionMode} options={catalog.captionModes} onChange={(v) => set({ captionMode: v })} />
          </Row>
          <Row label="Cor de destaque">
            <Segmented value={options.captionPreset} options={catalog.captionPresets} onChange={(v) => set({ captionPreset: v })} />
          </Row>
        </>
      )}

      <Row label="Color grade cinematográfico" hint="O diferencial de acabamento do Riseframe">
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
    </div>
  );
}
