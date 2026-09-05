import React, { useMemo, useState } from 'react';
import { C, GRAD, glass, FONT_DISPLAY, fmtBytes, fmtDuration } from '../theme.js';
import Icon from '../components/Icon.jsx';
import { listJobs, clearJobs } from '../history.js';

const MODE_LABEL = { auto: 'Automático', render: 'Timeline', clips: 'Clipes curtos', transcribe: 'Transcrição' };
const fmtDate = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Library({ onNewVideo }) {
  const [jobs, setJobs] = useState(() => listJobs());
  const [filter, setFilter] = useState('all');
  const shown = useMemo(() => (filter === 'all' ? jobs : jobs.filter((j) => j.mode === filter)), [jobs, filter]);

  const filters = [
    { id: 'all', label: 'Todos' },
    { id: 'auto', label: 'Automático' },
    { id: 'render', label: 'Timeline' },
    { id: 'clips', label: 'Clipes' },
  ];

  return (
    <div style={{ maxWidth: 1180, margin: 0, padding: '40px 32px 90px', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', right: '4%', width: 420, height: 420, borderRadius: '50%', background: C.purple, filter: 'blur(190px)', opacity: 0.1 }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 4px' }}>Biblioteca</h1>
            <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Seus vídeos editados neste dispositivo</p>
          </div>
          <button onClick={onNewVideo} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 8px 22px -8px rgba(255,107,53,0.5)' }}>
            <Icon name="upload" size={16} strokeWidth={2} /> Novo vídeo
          </button>
        </div>

        {jobs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {filters.map((f) => {
              const on = filter === f.id;
              return (
                <button key={f.id} onClick={() => setFilter(f.id)} style={{ border: `1px solid ${on ? 'transparent' : C.border}`, background: on ? GRAD : 'transparent', color: on ? '#fff' : C.muted, borderRadius: 20, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{f.label}</button>
              );
            })}
            <button onClick={() => { clearJobs(); setJobs([]); }} style={{ marginLeft: 'auto', border: `1px solid ${C.border}`, background: 'transparent', color: C.faint, borderRadius: 20, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Limpar histórico</button>
          </div>
        )}

        {shown.length === 0 ? (
          <div style={{ ...glass({ padding: 0 }), border: `1px dashed ${C.border}`, background: 'rgba(255,255,255,0.015)', textAlign: 'center', padding: '56px 24px' }}>
            <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 15, background: C.panel2, display: 'grid', placeItems: 'center', color: C.muted }}>
              <Icon name="folder" size={26} strokeWidth={1.7} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{jobs.length === 0 ? 'Sua biblioteca está vazia' : 'Nenhum vídeo neste filtro'}</div>
            <div style={{ color: C.faint, fontSize: 13.5, marginTop: 6, maxWidth: 380, marginInline: 'auto', lineHeight: 1.5 }}>
              {jobs.length === 0 ? 'Edite um vídeo para começar — ele fica salvo aqui para baixar de novo.' : 'Tente outro filtro acima.'}
            </div>
            {jobs.length === 0 && (
              <button onClick={onNewVideo} style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 8, background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 8px 22px -8px rgba(255,107,53,0.5)' }}>
                <Icon name="sparkles" size={16} strokeWidth={2} /> Criar meu primeiro vídeo
              </button>
            )}
          </div>
        ) : (
          <div style={{ ...glass({ padding: 0 }), overflow: 'hidden' }}>
            {/* cabeçalho da tabela (desktop) */}
            <div className="rf-lib-head" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: `1px solid ${C.border}`, color: C.faint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
              <span style={{ flex: 1 }}>Vídeo</span>
              <span style={{ width: 110 }}>Modo</span>
              <span style={{ width: 90 }}>Data</span>
              <span style={{ width: 80 }}>Tamanho</span>
              <span style={{ width: 44 }} />
            </div>
            {shown.map((j, i) => (
              <div key={j.id} className="rf-lib-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < shown.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: C.panel2, display: 'grid', placeItems: 'center', color: C.orangeSoft, flexShrink: 0 }}>
                    <Icon name={j.mode === 'clips' ? 'film' : 'clapper'} size={19} strokeWidth={1.8} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</div>
                    <div style={{ fontSize: 12, color: C.green, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icon name="check" size={12} strokeWidth={2.6} /> Finalizado
                      {j.mode === 'clips' && j.clips > 0 && <span style={{ color: C.faint }}>· {j.clips} clipes</span>}
                      {j.aspect && <span style={{ color: C.faint }}>· {j.aspect}</span>}
                    </div>
                  </div>
                </div>
                <span className="rf-lib-col" style={{ width: 110, fontSize: 13, color: C.muted }}>{MODE_LABEL[j.mode] || j.mode}</span>
                <span className="rf-lib-col" style={{ width: 90, fontSize: 13, color: C.muted }}>{fmtDate(j.at)}</span>
                <span className="rf-lib-col" style={{ width: 80, fontSize: 13, color: C.muted }}>{j.sizeBytes ? fmtBytes(j.sizeBytes) : '—'}</span>
                <span style={{ width: 44, display: 'flex', justifyContent: 'flex-end' }}>
                  {j.downloadUrl && j.mode !== 'clips' ? (
                    <a href={j.downloadUrl} title="Baixar" style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center', color: C.muted, textDecoration: 'none' }}>
                      <Icon name="download" size={16} strokeWidth={2} />
                    </a>
                  ) : (
                    <span style={{ width: 36 }} />
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {jobs.length > 0 && (
          <p style={{ color: C.faint, fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
            O histórico fica salvo só neste navegador. Os arquivos ficam disponíveis para download enquanto o servidor os mantém.
          </p>
        )}
      </div>

      <style>{`@media (max-width: 720px){ .rf-lib-head{ display:none !important; } .rf-lib-col{ display:none !important; } }`}</style>
    </div>
  );
}
