import React, { useMemo, useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY, fmtDuration } from '../theme.js';
import Icon from '../components/Icon.jsx';
import ProjectCard from '../components/ProjectCard.jsx';
import { listJobs } from '../history.js';
import { FORMATS } from '../formats.js';

function Stat({ icon, label, value, tint }) {
  return (
    <div style={{ ...glass({ padding: '14px 16px' }), display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: `${tint}1c`, border: `1px solid ${tint}40`, color: tint, flexShrink: 0 }}>
        <Icon name={icon} size={18} strokeWidth={1.9} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.5, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

const QUICK = ['reels', 'tiktok', 'shorts', 'youtube', 'cortes'];

export default function Dashboard({ user, onNewVideo, onLibrary, onTemplates, onOpen, onFormat }) {
  const first = (user?.name || '').split(' ')[0];
  const jobs = useMemo(() => listJobs(), []);
  const [tab, setTab] = useState('todos');
  const stats = useMemo(() => ({
    total: jobs.length,
    month: jobs.filter((j) => j.at >= Date.now() - 30 * 864e5).length,
    saved: jobs.reduce((s, j) => s + (j.savedSec || 0), 0),
    captions: jobs.reduce((s, j) => s + (j.captions || 0), 0),
  }), [jobs]);
  const shown = (tab === 'recentes' ? jobs.filter((j) => j.at >= Date.now() - 7 * 864e5) : tab === 'cortes' ? jobs.filter((j) => j.mode === 'clips') : jobs).slice(0, 8);

  return (
    <div className="rf-page" style={{ maxWidth: 1180, margin: 0, padding: '36px 32px 90px', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-12%', right: '2%', width: 460, height: 460, borderRadius: '50%', background: C.purple, filter: 'blur(190px)', opacity: 0.12 }} />
        <div style={{ position: 'absolute', top: '20%', left: '-6%', width: 340, height: 340, borderRadius: '50%', background: C.orange, filter: 'blur(180px)', opacity: 0.08 }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Boas-vindas + criar */}
        <div style={{ ...glass({ padding: 'clamp(20px, 3vw, 30px)' }), position: 'relative', overflow: 'hidden', marginBottom: 22 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 100% 0%, rgba(255,107,53,0.18), transparent 45%), radial-gradient(circle at 0% 120%, rgba(124,58,237,0.2), transparent 50%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <h1 style={{ fontSize: 'clamp(24px, 3.6vw, 34px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 6px' }}>
                Olá{first ? `, ${first}` : ''}! Vamos criar algo <span style={gradientText}>incrível</span> hoje?
              </h1>
              <p style={{ color: C.muted, fontSize: 15, margin: 0 }}>Transforme seus vídeos em conteúdos prontos para publicar.</p>
            </div>
            <button onClick={onNewVideo} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, border: 'none', borderRadius: 14, background: GRAD, color: '#fff', padding: '15px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 14px 30px -12px rgba(255,107,53,0.7)' }}>
              <Icon name="plus" size={18} strokeWidth={2.4} /> Criar vídeo
            </button>
          </div>
          {/* atalhos de formato */}
          <div style={{ position: 'relative', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
            {FORMATS.filter((f) => QUICK.includes(f.id)).map((f) => (
              <button key={f.id} onClick={() => onFormat(f.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '8px 14px 8px 9px', border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ width: 24, height: 24, borderRadius: 8, display: 'grid', placeItems: 'center', background: `${f.tint}22`, color: f.tint }}><Icon name={f.icon} size={14} strokeWidth={2} /></span>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* números */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 26 }}>
          <Stat icon="film" label="Vídeos editados" value={stats.total} tint={C.orange} />
          <Stat icon="sparkles" label="Nos últimos 30 dias" value={stats.month} tint={C.purpleSoft} />
          <Stat icon="clock" label="Tempo cortado" value={fmtDuration(stats.saved)} tint={C.green} />
          <Stat icon="captions" label="Legendas geradas" value={stats.captions} tint="#22D3EE" />
        </div>

        {/* projetos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, fontFamily: FONT_DISPLAY, margin: 0 }}>Seus projetos</h2>
          <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 11, background: 'rgba(255,255,255,0.05)' }}>
            {[{ id: 'todos', label: 'Todos' }, { id: 'recentes', label: 'Recentes' }, { id: 'cortes', label: 'Cortes' }].map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: tab === t.id ? 'rgba(255,255,255,0.12)' : 'transparent', color: tab === t.id ? C.text : C.muted }}>{t.label}</button>
            ))}
          </div>
          {jobs.length > 8 && (
            <button onClick={onLibrary} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.orangeSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
              Ver todos <Icon name="chevron" size={14} strokeWidth={2.4} />
            </button>
          )}
        </div>

        {shown.length === 0 ? (
          <div style={{ ...glass({ padding: '44px 24px' }), textAlign: 'center', border: `1px dashed ${C.border}` }}>
            <div style={{ width: 52, height: 52, margin: '0 auto 14px', borderRadius: 15, background: C.panel2, display: 'grid', placeItems: 'center', color: C.muted }}>
              <Icon name="film" size={24} strokeWidth={1.7} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>{jobs.length ? 'Nada por aqui neste filtro' : 'Seu primeiro vídeo começa aqui'}</div>
            <div style={{ color: C.faint, fontSize: 13.5, marginTop: 6, maxWidth: 360, marginInline: 'auto', lineHeight: 1.5 }}>
              Envie um vídeo bruto: a IA corta, legenda e entrega pronto para postar.
            </div>
            {!jobs.length && (
              <button onClick={onNewVideo} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Icon name="plus" size={16} strokeWidth={2.4} /> Criar vídeo
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {shown.map((j) => <ProjectCard key={j.id} job={j} onOpen={onOpen} />)}
          </div>
        )}

        {/* atalhos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 26 }}>
          <button onClick={onTemplates} style={{ ...glass({ padding: 18 }), textAlign: 'left', color: C.text, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', gap: 14, alignItems: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', background: GRAD, flexShrink: 0 }}><Icon name="layers" size={21} strokeWidth={1.9} color="#fff" /></span>
            <span><b style={{ fontSize: 15 }}>Templates por nicho</b><span style={{ display: 'block', fontSize: 12.5, color: C.muted, marginTop: 3 }}>Estilos prontos para empresário, médico, advogado, podcast…</span></span>
          </button>
          <button onClick={onLibrary} style={{ ...glass({ padding: 18 }), textAlign: 'left', color: C.text, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', gap: 14, alignItems: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.07)', flexShrink: 0 }}><Icon name="folder" size={21} strokeWidth={1.9} color={C.orangeSoft} /></span>
            <span><b style={{ fontSize: 15 }}>Meus projetos</b><span style={{ display: 'block', fontSize: 12.5, color: C.muted, marginTop: 3 }}>Baixe de novo ou continue editando na timeline.</span></span>
          </button>
        </div>
      </div>
    </div>
  );
}
