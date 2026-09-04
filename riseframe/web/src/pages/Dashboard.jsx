import React, { useMemo } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY, fmtDuration } from '../theme.js';
import Icon from '../components/Icon.jsx';
import { listJobs } from '../history.js';

const MODE_LABEL = { auto: 'Edição automática', render: 'Editado na timeline', clips: 'Clipes curtos', transcribe: 'Transcrição' };
const fmtDate = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

function StatCard({ icon, label, value, tint }) {
  return (
    <div style={{ ...glass({ padding: 18 }), position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -30, right: -20, width: 90, height: 90, background: `radial-gradient(circle, ${tint}22, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: `${tint}1e`, border: `1px solid ${tint}44`, color: tint, marginBottom: 12 }}>
        <Icon name={icon} size={18} strokeWidth={1.9} />
      </div>
      <div style={{ fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.6, marginTop: 3 }}>{value}</div>
    </div>
  );
}

export default function Dashboard({ user, onNewVideo, onLibrary, onSettings }) {
  const first = (user?.name || '').split(' ')[0] || 'você';
  const jobs = useMemo(() => listJobs(), []);
  const stats = useMemo(() => {
    const now = Date.now();
    const monthAgo = now - 30 * 864e5;
    const thisMonth = jobs.filter((j) => j.at >= monthAgo).length;
    const savedSec = jobs.reduce((s, j) => s + (j.savedSec || 0), 0);
    const captions = jobs.reduce((s, j) => s + (j.captions || 0), 0);
    return { total: jobs.length, thisMonth, savedSec, captions };
  }, [jobs]);
  const recent = jobs.slice(0, 6);

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 28px 90px', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-12%', right: '2%', width: 460, height: 460, borderRadius: '50%', background: C.purple, filter: 'blur(190px)', opacity: 0.12 }} />
        <div style={{ position: 'absolute', top: '20%', left: '-6%', width: 340, height: 340, borderRadius: '50%', background: C.orange, filter: 'blur(180px)', opacity: 0.09 }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <p style={{ color: C.orangeSoft, fontWeight: 600, fontSize: 14, margin: '0 0 6px' }}>Olá, {first} 👋</p>
        <h1 style={{ fontSize: 'clamp(26px,4.5vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1.1, margin: '0 0 26px' }}>
          Sua <span style={gradientText}>produtividade</span>
        </h1>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 26 }}>
          <StatCard icon="film" label="Vídeos editados" value={stats.total} tint={C.orange} />
          <StatCard icon="sparkles" label="Nos últimos 30 dias" value={stats.thisMonth} tint={C.purple} />
          <StatCard icon="scissors" label="Tempo economizado" value={fmtDuration(stats.savedSec)} tint={C.green} />
          <StatCard icon="captions" label="Legendas geradas" value={stats.captions} tint={C.cyan || '#22D3EE'} />
        </div>

        {/* Conteúdo + rail */}
        <div className="rf-dash-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 22, alignItems: 'start' }}>
          {/* Vídeos recentes */}
          <div style={{ ...glass({ padding: 0 }) }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '18px 20px 14px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Vídeos recentes</div>
              {jobs.length > 0 && (
                <button onClick={onLibrary} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.orangeSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
                  Ver todos <Icon name="chevron" size={14} strokeWidth={2.4} />
                </button>
              )}
            </div>

            {recent.length === 0 ? (
              <div style={{ padding: '46px 24px', textAlign: 'center' }}>
                <div style={{ width: 50, height: 50, margin: '0 auto 14px', borderRadius: 14, background: C.panel2, display: 'grid', placeItems: 'center', color: C.muted }}>
                  <Icon name="film" size={23} strokeWidth={1.7} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum vídeo ainda</div>
                <div style={{ color: C.faint, fontSize: 13, marginTop: 5, maxWidth: 340, marginInline: 'auto', lineHeight: 1.5 }}>Edite seu primeiro vídeo e ele aparece aqui para baixar ou reabrir.</div>
                <button onClick={onNewVideo} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 8px 22px -8px rgba(255,107,53,0.5)' }}>
                  <Icon name="sparkles" size={16} strokeWidth={2} /> Criar o primeiro vídeo
                </button>
              </div>
            ) : (
              <div>
                {recent.map((j, i) => (
                  <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 20px', borderBottom: i < recent.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: C.panel2, display: 'grid', placeItems: 'center', color: C.orangeSoft, flexShrink: 0 }}>
                      <Icon name={j.mode === 'clips' ? 'film' : 'clapper'} size={18} strokeWidth={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</div>
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.green }}><Icon name="check" size={12} strokeWidth={2.6} /> Finalizado</span>
                        · {MODE_LABEL[j.mode] || j.mode}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: C.faint, flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtDate(j.at)}</div>
                    {j.downloadUrl && j.mode !== 'clips' && (
                      <a href={j.downloadUrl} title="Baixar" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center', color: C.muted, textDecoration: 'none' }}>
                        <Icon name="download" size={15} strokeWidth={2} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rail: Ações rápidas + turbine */}
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ ...glass({ padding: 18 }) }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Ações rápidas</div>
              <button onClick={onNewVideo} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: '13px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10, boxShadow: '0 8px 20px -8px rgba(255,107,53,0.5)' }}>
                <Icon name="upload" size={17} strokeWidth={2} /> Novo vídeo
              </button>
              <button onClick={onLibrary} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.04)', color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Icon name="folder" size={17} strokeWidth={1.9} /> Ver biblioteca
              </button>
            </div>

            <div style={{ ...glass({ padding: 18 }), background: 'linear-gradient(180deg, rgba(124,58,237,0.1), rgba(255,255,255,0.015))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.35)', display: 'grid', placeItems: 'center', color: C.purpleSoft }}>
                  <Icon name="wand" size={17} strokeWidth={1.9} />
                </span>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Turbine com IA</div>
              </div>
              <div style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, marginBottom: 14 }}>
                Conecte a chave do <b style={{ color: C.text }}>Pexels</b> (B-roll grátis) e da <b style={{ color: C.text }}>Anthropic</b> (correção por IA) nas Configurações.
              </div>
              <button onClick={() => onSettings?.()} style={{ width: '100%', background: 'transparent', border: `1px solid ${C.borderStrong || C.border}`, color: C.text, borderRadius: 11, padding: '10px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Abrir Configurações →
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 860px){ .rf-dash-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
