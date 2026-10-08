import React, { useEffect, useMemo, useState } from 'react';
import { C, GRAD, glass, FONT_DISPLAY, fmtBytes, fmtDuration } from '../theme.js';
import Icon from '../components/Icon.jsx';
import ProjectCard from '../components/ProjectCard.jsx';
import { listJobs, clearJobs } from '../history.js';
import { useAuth } from '../AuthContext.jsx';
import { adminDownloadShowcase, adminRemoveShowcase, adminSetShowcase, adminShowcase } from '../api.js';

const MODE_LABEL = { auto: 'Automático', render: 'Timeline', clips: 'Clipes curtos', transcribe: 'Transcrição' };
const fmtDate = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Library({ onNewVideo, onOpen }) {
  const [jobs, setJobs] = useState(() => listJobs());
  const [filter, setFilter] = useState('all');
  // Admin: escolher um vídeo editado como demonstração "antes e depois" da página inicial.
  const { billing } = useAuth();
  const admin = Boolean(billing?.admin);
  const [show, setShow] = useState(null);
  const [showMsg, setShowMsg] = useState('');
  useEffect(() => {
    if (!admin) return undefined;
    let alive = true;
    const load = () => adminShowcase().then((r) => { if (alive) setShow(r); }).catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [admin]);
  async function useAsDemo(j) {
    if (!window.confirm(`Usar "${j.filename || 'este vídeo'}" como demonstração antes/depois na página inicial? O vídeo original e o editado ficam públicos no site.`)) return;
    setShowMsg('');
    try {
      await adminSetShowcase(j.id);
      setShowMsg('Preparando a demonstração… em 1 a 2 minutos ela aparece na página inicial.');
      setShow((s) => ({ ...(s || {}), building: true }));
    } catch (e) {
      setShowMsg(e.message);
    }
  }
  async function removeDemo() {
    if (!window.confirm('Tirar a demonstração da página inicial?')) return;
    setShow(await adminRemoveShowcase());
    setShowMsg('Demonstração removida.');
  }
  const shown = useMemo(() => (filter === 'all' ? jobs : jobs.filter((j) => j.mode === filter)), [jobs, filter]);

  const filters = [
    { id: 'all', label: 'Todos' },
    { id: 'auto', label: 'Automático' },
    { id: 'render', label: 'Timeline' },
    { id: 'clips', label: 'Clipes' },
  ];

  return (
    <div className="rf-page" style={{ maxWidth: 1180, margin: 0, padding: '40px 32px 90px', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', right: '4%', width: 420, height: 420, borderRadius: '50%', background: C.purple, filter: 'blur(190px)', opacity: 0.1 }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 4px' }}>Meus projetos</h1>
            <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Seus vídeos editados neste navegador — baixe de novo ou continue editando</p>
          </div>
          <button onClick={onNewVideo} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 8px 22px -8px rgba(255,107,53,0.5)' }}>
            <Icon name="plus" size={16} strokeWidth={2.4} /> Criar vídeo
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {shown.map((j) => (
              <ProjectCard
                key={j.id}
                job={j}
                onOpen={onOpen}
                extra={admin && j.downloadUrl && ['auto', 'render'].includes(j.mode) ? (
                  <button onClick={() => useAsDemo(j)} title="Usar como demonstração na página inicial" disabled={show?.building}
                    style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', display: 'grid', placeItems: 'center', color: C.orangeSoft, cursor: show?.building ? 'wait' : 'pointer', flexShrink: 0 }}>
                    <Icon name="star" size={15} strokeWidth={2} />
                  </button>
                ) : null}
              />
            ))}
          </div>
        )}

        {admin && (
          <div style={{ ...glass({ padding: '14px 16px' }), marginTop: 16, fontSize: 13, color: C.muted, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Icon name="sparkles" size={16} color={C.orangeSoft} />
            <span style={{ flex: 1, minWidth: 220 }}>
              <b style={{ color: C.text }}>Demonstração da página inicial: </b>
              {show?.building
                ? 'preparando…'
                : show?.info
                  ? show.info.bundled
                    ? 'ativa (permanente, guardada no site). Para trocar, clique na estrela de outro vídeo.'
                    : `ativa${show.meta?.filename ? ` (${show.meta.filename})` : ''}. Ela some se o servidor reiniciar — baixe o pacote para deixá-la permanente.`
                  : 'nenhuma. Clique na estrela de um vídeo editado (Automático ou Timeline) para mostrar o antes e depois.'}
              {show?.meta?.error && !show?.building && <span style={{ color: '#FCA5B4' }}> Último erro: {show.meta.error}</span>}
              {showMsg && <span style={{ display: 'block', marginTop: 4, color: C.orangeSoft }}>{showMsg}</span>}
            </span>
            {show?.info && !show.info.external && !show.info.bundled && (
              <button onClick={() => adminDownloadShowcase().catch((e) => setShowMsg(e.message))} title="Para a demo ficar permanente: mande este arquivo para colocar no projeto"
                style={{ border: `1px solid ${C.border}`, background: 'transparent', color: C.text, borderRadius: 9, padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>Baixar pacote da demo</button>
            )}
            {show?.info && !show.info.external && (
              <button onClick={removeDemo} style={{ border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, borderRadius: 9, padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>Remover</button>
            )}
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
