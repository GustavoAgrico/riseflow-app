import React, { useState } from 'react';
import { C, GRAD, glass, fmtDuration } from '../theme.js';
import { GhostButton, Spinner } from './ui.jsx';
import Icon from './Icon.jsx';
import { clipPreviewUrl, clipDownloadUrl } from '../api.js';

export default function ClipsResult({ job, onReset, onEdit }) {
  const clips = job.report?.clips || [];
  const [opening, setOpening] = useState(null);
  const [editError, setEditError] = useState('');
  async function edit(index) {
    if (!onEdit || opening != null) return;
    setOpening(index);
    setEditError('');
    try {
      await onEdit(index);
    } catch (e) {
      setEditError(e.message);
      setOpening(null);
    }
  }
  return (
    <div style={{ ...glass(), padding: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
        <span
          style={{
            width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center',
            background: GRAD, color: '#fff', boxShadow: '0 6px 16px -6px rgba(255,107,53,0.6)',
          }}
        >
          <Icon name="film" size={19} />
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{clips.length} clipes prontos</div>
          <div style={{ fontSize: 12, color: C.faint }}>
            dos melhores trechos de {fmtDuration(job.report?.input?.duration)}
          </div>
        </div>
        <GhostButton onClick={onReset} style={{ marginLeft: 'auto' }}>
          Novo vídeo
        </GhostButton>
      </div>

      {editError && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.red}55`, background: 'rgba(240,82,107,0.08)', fontSize: 13 }}>
          Não deu para abrir o clipe: {editError}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 14,
          marginTop: 16,
        }}
      >
        {clips.map((c) => (
          <div
            key={c.index}
            style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}
          >
            <div style={{ position: 'relative', background: '#000' }}>
              <video
                src={clipPreviewUrl(job.id, c.index)}
                controls
                preload="metadata"
                style={{ width: '100%', display: 'block', maxHeight: 320, background: '#000' }}
              />
              <span
                style={{
                  position: 'absolute', top: 8, left: 8, fontSize: 11, fontWeight: 700, color: '#fff',
                  background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 7px',
                }}
              >
                #{c.index + 1} · {fmtDuration(c.durationSec)}
              </span>
            </div>
            <div style={{ padding: '11px 12px' }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 3, lineHeight: 1.3 }}>{c.title}</div>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 10 }}>
                {fmtTime(c.start)}–{fmtTime(c.end)} · {c.aspect}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {onEdit && (
                  <button
                    onClick={() => edit(c.index)}
                    disabled={opening != null}
                    title="Abrir este clipe na timeline: cortes, legenda, cor, zoom, B-roll…"
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      fontSize: 13, fontWeight: 600, color: C.text, fontFamily: 'inherit',
                      background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: '9px',
                      cursor: opening != null ? 'wait' : 'pointer', opacity: opening != null && opening !== c.index ? 0.5 : 1,
                    }}
                  >
                    {opening === c.index ? <Spinner size={14} color={C.orange} /> : <Icon name="edit" size={15} />} Editar
                  </button>
                )}
                <a
                  href={clipDownloadUrl(job.id, c.index)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    textDecoration: 'none', fontSize: 13, fontWeight: 600, color: '#fff',
                    background: GRAD, borderRadius: 10, padding: '9px',
                  }}
                >
                  <Icon name="download" size={15} /> Baixar
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
