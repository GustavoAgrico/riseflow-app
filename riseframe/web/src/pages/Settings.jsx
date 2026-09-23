import React, { useEffect, useState } from 'react';
import { C, gradientText, glass, FONT_DISPLAY } from '../theme.js';
import { Spinner } from '../components/ui.jsx';
import { getSettings } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { openPlans } from '../components/CostLine.jsx';

function StatusDot({ on, onLabel = 'Ativo', offLabel = 'Inativo' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: on ? C.green : C.faint, whiteSpace: 'nowrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? C.green : C.faint, boxShadow: on ? `0 0 8px ${C.green}` : 'none' }} />
      {on ? onLabel : offLabel}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div style={glass({ padding: 24, marginBottom: 20 })}>
      <h2 style={{ fontSize: 17, fontWeight: 700, fontFamily: FONT_DISPLAY, margin: '0 0 4px' }}>{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{hint}</div>}
      </div>
      {value}
    </div>
  );
}

const PROVIDERS = { 'whisper-local': 'Whisper local', deepgram: 'Deepgram', openai: 'OpenAI', assemblyai: 'AssemblyAI', mock: 'Exemplo (mock)' };
const btn = { minHeight: 44, padding: '0 18px', background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text, borderRadius: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

export default function Settings({ onNewVideo, onLogout }) {
  const { user, billing } = useAuth();
  // Status do servidor: só para o dono (admin) ou enquanto os pagamentos não estão ligados.
  const showServer = Boolean(billing && (billing.admin || !billing.enabled));
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!showServer) return;
    getSettings()
      .then((d) => setStatus(d.status))
      .catch((e) => setError(e.message));
  }, [showServer]);

  const planLabel = !billing ? '' : billing.unlimited ? 'Uso ilimitado' : billing.plan ? `Plano ${billing.plan.name}` : 'Sem plano';

  return (
    <div className="rf-page" style={{ maxWidth: 720, margin: '0 auto', padding: '44px 24px 80px' }}>
      <h1 style={{ fontSize: 'clamp(26px,5vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 24px' }}>
        <span style={gradientText}>Conta</span>
      </h1>

      <Section title="Seus dados">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{user?.name || 'Você'}</div>
            <div style={{ fontSize: 13, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
          </div>
          {onLogout && <button onClick={onLogout} style={btn}>Sair da conta</button>}
        </div>
      </Section>

      {billing && (
        <Section title="Plano">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{planLabel}</div>
              {!billing.unlimited && <div style={{ fontSize: 13, color: C.faint }}>{billing.credits.toLocaleString('pt-BR')} créditos disponíveis</div>}
            </div>
            <button onClick={openPlans} style={btn}>Ver planos</button>
          </div>
        </Section>
      )}

      {showServer && (
        <Section title="Status do servidor">
          <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.55, margin: '6px 0 6px' }}>
            Só você vê isto. As chaves ficam nas variáveis de ambiente do servidor
            (<code>PEXELS_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>) e valem para todos os usuários — ninguém precisa colar chave.
          </p>
          {error && <p style={{ color: '#FCA5B4', fontSize: 13 }}>{error}</p>}
          {!status && !error && <div style={{ padding: 16, textAlign: 'center' }}><Spinner size={18} color={C.orange} /></div>}
          {status && (
            <div style={{ display: 'grid' }}>
              <Row label="Transcrição (legendas)" hint={PROVIDERS[status.transcribeProvider] || status.transcribeProvider} value={<StatusDot on={status.transcribeReady} />} />
              <Row label="B-roll · Openverse" hint="Imagens Creative Commons, sem chave" value={<StatusDot on={status.openverse} />} />
              <Row label="B-roll · Pexels" hint="PEXELS_API_KEY — vídeos e fotos livres" value={<StatusDot on={status.brollFromServer} offLabel="Sem chave" />} />
              <Row label="IA · Anthropic (Claude)" hint="ANTHROPIC_API_KEY — B-roll mais relevante e limpeza de fala" value={<StatusDot on={status.aiFromServer} offLabel="Sem chave" />} />
              <Row label="Pagamentos · AbacatePay" hint="ABACATE_PAY_API_KEY — sem ela, uso liberado para todos" value={<StatusDot on={billing.enabled} offLabel="Desligado" />} />
            </div>
          )}
        </Section>
      )}

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={onNewVideo} style={{ ...btn, padding: '12px 24px' }}>Ir para o editor →</button>
      </div>
    </div>
  );
}
