import React from 'react';
import { C } from '../theme.js';
import { Row as WideRow, Toggle, Select } from './OptionsPanel.jsx';

const FALLBACK = {
  voiceNoises: [{ id: 'off', label: 'Não remover' }, { id: 'suave', label: 'Suave' }, { id: 'medio', label: 'Médio' }, { id: 'forte', label: 'Forte' }, { id: 'ia', label: 'IA (forte, para fala) ✨' }],
  voicePresets: [{ id: 'natural', label: 'Natural' }],
  voiceEffects: [{ id: 'none', label: 'Nenhum' }],
};

/** As opções de voz (para estado/envio ao servidor). */
export const VOICE_KEYS = ['voiceEnhance', 'voiceNoise', 'voicePreset', 'voiceDeEss', 'voiceEffect', 'voicePitch'];
export function voiceOf(o = {}) {
  return {
    voiceEnhance: o.voiceEnhance === true,
    voiceNoise: o.voiceNoise || o.voiceIntensity || 'medio',
    voicePreset: o.voicePreset || 'natural',
    voiceDeEss: o.voiceDeEss !== false,
    voiceEffect: o.voiceEffect || 'none',
    voicePitch: Number(o.voicePitch) || 0,
  };
}

/**
 * Tratamento e modificadores da voz: remover ruído (inclusive com IA), equalização pronta
 * (natural, podcast, clara, locutor, suave), chiado do "S", tom e efeitos (robô, telefone…).
 * `onPreview` (opcional) mostra o botão "Ouvir prévia".
 */
export default function VoicePanel({ catalog, value, onChange, onPreview, previewBusy, previewNote, stacked = false }) {
  const v = voiceOf(value);
  // Painel estreito (timeline): título e dica em cima, controle embaixo, largura toda.
  const Row = stacked ? StackRow : WideRow;
  const set = (patch) => onChange({ ...v, ...patch });
  const cat = { ...FALLBACK, ...catalog };
  const pitchLabel = v.voicePitch === 0 ? 'original' : `${v.voicePitch > 0 ? '+' : ''}${v.voicePitch} ${Math.abs(v.voicePitch) === 1 ? 'semitom' : 'semitons'} (${v.voicePitch > 0 ? 'mais aguda' : 'mais grave'})`;
  return (
    <div>
      <Row label="Tratamento da voz" hint="Remove ruído de fundo, equaliza a fala e deixa o volume no padrão das redes">
        <Toggle on={v.voiceEnhance} onChange={(on) => set({ voiceEnhance: on })} />
      </Row>
      {v.voiceEnhance && (
        <>
          <Row label="Remover ruídos" hint={v.voiceNoise === 'ia' ? 'IA treinada em fala: tira ventilador, ar-condicionado, rua e chiado mantendo a voz' : 'Quanto do ruído de fundo tirar (forte demais pode deixar a voz artificial)'}>
            <Select value={v.voiceNoise} options={cat.voiceNoises} onChange={(x) => set({ voiceNoise: x })} />
          </Row>
          <Row label="Aprimorar a voz" hint="Equalização e compressão prontas para cada estilo de fala">
            <Select value={v.voicePreset} options={cat.voicePresets} onChange={(x) => set({ voicePreset: x })} />
          </Row>
          <Row label="Reduzir o chiado do “S”" hint="Suaviza os sons sibilantes (s, x, ch) que incomodam no fone">
            <Toggle on={v.voiceDeEss} onChange={(on) => set({ voiceDeEss: on })} />
          </Row>
        </>
      )}
      <Row label="Modificador de voz" hint="Efeito na voz: robô, telefone, rádio, megafone, eco, reverb, esquilo, monstro">
        <Select value={v.voiceEffect} options={cat.voiceEffects} onChange={(x) => set({ voiceEffect: x })} />
      </Row>
      <Row label="Tom da voz" hint={`${pitchLabel} — muda a altura sem acelerar a fala`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 190 }}>
          <input type="range" min={-8} max={8} step={1} value={v.voicePitch} onChange={(e) => set({ voicePitch: Number(e.target.value) })} style={{ flex: 1 }} />
          {v.voicePitch !== 0 && (
            <button type="button" onClick={() => set({ voicePitch: 0 })} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: '3px 8px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>Zerar</button>
          )}
        </div>
      </Row>
      {onPreview && (
        <div style={{ padding: '10px 0 4px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onPreview} disabled={previewBusy}
            style={{ minHeight: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.05)', color: C.text, fontWeight: 700, fontSize: 13, cursor: previewBusy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
            {previewBusy ? 'Gerando a prévia…' : '▶ Ouvir prévia da voz (8 s)'}
          </button>
          {previewNote && <span style={{ fontSize: 11.5, color: C.faint }}>{previewNote}</span>}
        </div>
      )}
    </div>
  );
}

function StackRow({ label, hint, children }) {
  return (
    <div style={{ padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
      {hint && <div style={{ fontSize: 11.5, color: C.muted, margin: '2px 0 7px', lineHeight: 1.4 }}>{hint}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>{children}</div>
    </div>
  );
}
