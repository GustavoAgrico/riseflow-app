import React, { useEffect, useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from '../theme.js';
import { Spinner } from '../components/ui.jsx';
import { getSettings, saveSettings } from '../api.js';

function StatusDot({ on }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: on ? C.green : C.faint }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? C.green : C.faint, boxShadow: on ? `0 0 8px ${C.green}` : 'none' }} />
      {on ? 'Ativo' : 'Inativo'}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div style={glass({ padding: 26, marginBottom: 20 })}>
      <h2 style={{ fontSize: 17, fontWeight: 700, fontFamily: FONT_DISPLAY, margin: '0 0 4px' }}>{title}</h2>
      {children}
    </div>
  );
}

export default function Settings({ onNewVideo }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [pexelsKey, setPexelsKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await getSettings();
        setPexelsKey(data.settings.pexelsKey || '');
        setStatus(data.status);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const keyValid = /^[A-Za-z0-9]{20,80}$/.test(pexelsKey.trim());
  const canSave = pexelsKey.trim() === '' || keyValid;

  async function save() {
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const data = await saveSettings({ pexelsKey: pexelsKey.trim() });
      setStatus(data.status);
      setPexelsKey(data.settings.pexelsKey || '');
      setSavedMsg('Salvo!');
      setTimeout(() => setSavedMsg(''), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: C.muted }}>
        <Spinner size={24} color={C.orange} />
        <div style={{ marginTop: 14 }}>Carregando configurações…</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '44px 24px 80px' }}>
      <h1 style={{ fontSize: 'clamp(26px,5vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 6px' }}>
        <span style={gradientText}>Configurações</span>
      </h1>
      <p style={{ color: C.muted, fontSize: 15, margin: '0 0 30px' }}>Integrações e chaves de API — salvas na sua conta.</p>

      {/* Pexels */}
      <Section title="B-roll · Pexels">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <StatusDot on={status?.broll} />
          {status?.brollFromServer && <span style={{ fontSize: 12, color: C.faint }}>(chave também configurada no servidor)</span>}
        </div>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.55, margin: '0 0 16px' }}>
          O B-roll insere vídeos de apoio do Pexels nos momentos certos da fala. Crie uma
          chave gratuita em{' '}
          <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer" style={{ color: C.orangeSoft, fontWeight: 600 }}>
            pexels.com/api
          </a>{' '}
          e cole abaixo.
        </p>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 7 }}>Chave da API do Pexels</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="password"
            value={pexelsKey}
            onChange={(e) => setPexelsKey(e.target.value.trim())}
            placeholder="Cole a chave aqui"
            spellCheck={false}
            autoComplete="off"
            style={{ flex: 1, minWidth: 220, boxSizing: 'border-box', background: '#13131B', color: C.text, border: `1px solid ${pexelsKey && !keyValid ? `${C.red}66` : keyValid ? '#2ED47A66' : C.border}`, borderRadius: 11, padding: '12px 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
          />
          <button
            onClick={save}
            disabled={saving || !canSave}
            style={{ background: GRAD, border: 'none', color: '#fff', borderRadius: 11, padding: '0 22px', fontSize: 14, fontWeight: 700, cursor: saving || !canSave ? 'not-allowed' : 'pointer', opacity: canSave ? 1 : 0.5, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}
          >
            {saving && <Spinner size={14} color="#fff" />}
            Salvar
          </button>
        </div>
        {pexelsKey && !keyValid && (
          <p style={{ color: '#FCA5B4', fontSize: 12.5, marginTop: 8 }}>A chave parece inválida (esperado: 20–80 caracteres alfanuméricos).</p>
        )}
        {savedMsg && (
          <p style={{ color: C.green, fontSize: 13, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 800 }}>✓</span> {savedMsg}
          </p>
        )}
        {error && <p style={{ color: '#FCA5B4', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </Section>

      {/* Status do sistema */}
      <Section title="Status do sistema">
        <div style={{ display: 'grid', gap: 12 }}>
          <Row label="Transcrição (Whisper local)" value={<StatusDot on={status?.whisperReady} />} hint={`Provedor: ${status?.transcribeProvider || '—'}`} />
          <Row label="B-roll (Pexels)" value={<StatusDot on={status?.broll} />} />
        </div>
      </Section>

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button
          onClick={onNewVideo}
          style={{ background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text, borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Ir para o editor →
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{hint}</div>}
      </div>
      {value}
    </div>
  );
}
