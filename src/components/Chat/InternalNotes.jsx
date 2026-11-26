// Peças visuais das notas internas do chat: o balão da nota no meio da
// conversa e a lista de pessoas para @menção no composer.
import React from 'react'
import { Lock, Trash2 } from 'lucide-react'
import { splitMentions } from '@lib/mentions'

export const NOTE = { bg: 'rgba(234,179,8,.10)', border: 'rgba(234,179,8,.45)', text: '#FDE68A', accent: '#EAB308' }
const F = 'DM Sans, sans-serif'
const hm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export const NoteBubble = ({ note, mine, onDelete }) => (
  <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
    <div style={{ width: '100%', maxWidth: 520, background: NOTE.bg, border: `1px dashed ${NOTE.border}`, borderRadius: 12, padding: '8px 12px', fontFamily: F }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: NOTE.accent, fontWeight: 700, marginBottom: 4 }}>
        <Lock size={12} />
        <span>Nota interna</span>
        <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>· {note.author_name || 'Equipe'} · {hm(note.created_at)}</span>
        {mine && onDelete && (
          <button onClick={() => onDelete(note)} title="Excluir nota"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--ink-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {splitMentions(note.content, note.mentions).map((p, i) => p.mention
          ? <span key={i} style={{ color: NOTE.accent, fontWeight: 700 }}>{p.text}</span>
          : <React.Fragment key={i}>{p.text}</React.Fragment>)}
      </p>
    </div>
  </div>
)

export const MentionPicker = ({ people, onPick }) => (
  <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, width: 240, maxHeight: 240, overflowY: 'auto', background: 'var(--card)', border: `1px solid ${NOTE.border}`, borderRadius: 12, padding: '6px 0', zIndex: 30, boxShadow: '0 8px 24px rgba(0,0,0,.45)', fontFamily: F }}>
    <p style={{ margin: '2px 14px 6px', fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>Mencionar</p>
    {people.length === 0
      ? <p style={{ margin: '6px 14px', fontSize: 12, color: 'var(--ink-4)' }}>Ninguém com esse nome. Adicione pessoas em Equipes.</p>
      : people.map(p => (
        // onMouseDown (e não onClick) para não tirar o foco do input antes de inserir.
        <button key={p.id} onMouseDown={e => { e.preventDefault(); onPick(p) }}
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--ink-1)', fontSize: 13, padding: '7px 14px', cursor: 'pointer', fontFamily: F }}>
          @{p.name}{p.role && <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 6 }}>{p.role}</span>}
        </button>
      ))}
  </div>
)
