import React, { useState } from 'react';
import { C, GRAD, fmtDuration } from '../theme.js';
import Icon from './Icon.jsx';
import { previewUrl } from '../api.js';

export const MODE_LABEL = { auto: 'Edição automática', render: 'Editado na timeline', clips: 'Cortes curtos', transcribe: 'Transcrição' };
const fmtWhen = (ms) => {
  const d = new Date(ms);
  const today = new Date();
  const days = Math.floor((today.setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 864e5);
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (days <= 0) return `Hoje, ${hm}`;
  if (days === 1) return `Ontem, ${hm}`;
  if (days < 7) return `${days} dias atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Cartão de um projeto (vídeo já editado): miniatura do resultado (enquanto o servidor
 * guarda o arquivo), formato, duração e as ações — continuar editando na timeline e baixar.
 */
export default function ProjectCard({ job, onOpen, extra }) {
  const [thumbOk, setThumbOk] = useState(job.mode !== 'clips');
  const canEdit = Boolean(job.sourceId) && job.mode !== 'clips';
  const vertical = job.aspect === '9:16';
  return (
    <div className="rf-proj" style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}`, background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 10', background: 'radial-gradient(circle at 30% 20%, rgba(255,107,53,0.25), transparent 60%), radial-gradient(circle at 80% 90%, rgba(124,58,237,0.3), transparent 55%), #101018', overflow: 'hidden' }}>
        {thumbOk && (
          <video
            src={`${previewUrl(job.id)}#t=0.8`}
            muted
            playsInline
            preload="metadata"
            onError={() => setThumbOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: vertical ? 'contain' : 'cover', background: vertical ? 'rgba(0,0,0,0.35)' : 'transparent' }}
          />
        )}
        {!thumbOk && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.75)' }}>
            <Icon name={job.mode === 'clips' ? 'film' : 'clapper'} size={30} strokeWidth={1.6} />
          </div>
        )}
        <div style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', gap: 6 }}>
          {job.aspect && <span style={badge}>{job.aspect}</span>}
          {job.mode === 'clips' && job.clips > 0 && <span style={badge}>{job.clips} cortes</span>}
        </div>
        {job.durationSec > 0 && <span style={{ ...badge, position: 'absolute', right: 8, bottom: 8 }}>{fmtDuration(Math.max(0, job.durationSec - (job.savedSec || 0)))}</span>}
      </div>
      <div style={{ padding: '12px 13px 13px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.title}</div>
        <div style={{ fontSize: 12, color: C.faint }}>{MODE_LABEL[job.mode] || job.mode} · {fmtWhen(job.at)}</div>
        <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
          {canEdit || job.mode === 'clips' ? (
            <button onClick={() => onOpen?.(job)} style={{ flex: 1, minHeight: 34, borderRadius: 10, border: `1px solid ${C.borderStrong}`, background: 'rgba(255,255,255,0.05)', color: C.text, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {job.mode === 'clips' ? 'Ver e editar cortes' : 'Continuar editando'}
            </button>
          ) : <span style={{ flex: 1 }} />}
          {job.downloadUrl && job.mode !== 'clips' && (
            <a href={job.downloadUrl} title="Baixar" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: GRAD, color: '#fff', textDecoration: 'none', flexShrink: 0 }}>
              <Icon name="download" size={15} strokeWidth={2.2} />
            </a>
          )}
          {extra}
        </div>
      </div>
    </div>
  );
}

const badge = { fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', borderRadius: 7, padding: '3px 7px' };
