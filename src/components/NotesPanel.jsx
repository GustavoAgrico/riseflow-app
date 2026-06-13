import React, { useState, useEffect } from 'react'
import { notesService } from '@/services/notesService'
import { logger } from '@/services/activityLogger'
import { StickyNote, Phone, Mail, Star, Activity, Pin, Pencil, Trash2 } from 'lucide-react'

const C = { bg:'#0F172A', card:'#1E293B', bd:'#334155', tx:'#F8FAFC', mut:'#64748B', pur:'#7C3AED' }
const TYPES = [['note', StickyNote, 'Nota'], ['call', Phone, 'Ligação'], ['email', Mail, 'Email'], ['important', Star, 'Importante']]
const ICON = { note: StickyNote, call: Phone, email: Mail, important: Star, activity: Activity }
const ago = t => { const m = Math.max(1, Math.round((Date.now() - new Date(t)) / 60000)); return m < 60 ? `há ${m}min` : m < 1440 ? `há ${Math.round(m / 60)}h` : `há ${Math.round(m / 1440)}d` }
const tableMissing = e => /does not exist|schema cache|42P01/i.test(e?.message || e?.code || '')

export const NotesPanel = ({ contactId, userId }) => {
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [type, setType] = useState('note')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [showAct, setShowAct] = useState(false)

  const load = async () => {
    if (!contactId) return
    setLoading(true); setErr('')
    try { const data = await notesService.getNotes(contactId); setNotes(data); console.log(`[Notes] ${data.length} notas carregadas`) }
    catch (e) { tableMissing(e) ? setErr('Configure as notas rodando o SQL') : console.warn('[Notes] erro ao carregar:', e?.message ?? e); setNotes([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [contactId])

  const save = async () => {
    const c = newNote.trim(); if (!c) return
    try { await notesService.addNote(userId, contactId, c, type); logger.log(userId, 'note_added', { category: 'crm', description: 'Nota adicionada ao contato' }); setNewNote(''); console.log('[Notes] Nota adicionada'); load() }
    catch (e) { tableMissing(e) ? setErr('Configure as notas rodando o SQL') : console.warn('[Notes] erro ao salvar:', e?.message ?? e) }
  }
  const saveEdit = async (id) => { try { await notesService.updateNote(id, editText); setEditingId(null); load() } catch (e) { console.warn('[Notes] erro ao editar:', e?.message ?? e) } }
  const del = async (id) => { if (!window.confirm('Excluir esta nota?')) return; try { await notesService.deleteNote(id); load() } catch (e) { console.warn('[Notes] erro ao excluir:', e?.message ?? e) } }
  const pin = async (n) => { try { await notesService.togglePin(n.id, n.pinned); load() } catch (e) { console.warn('[Notes] erro ao fixar:', e?.message ?? e) } }

  const visible = notes.filter(n => showAct ? true : n.type !== 'activity')
  const count = notes.filter(n => n.type !== 'activity').length
  const box = { background:C.card, border:`1px solid ${C.bd}`, borderRadius:12, padding:16, color:C.tx, fontFamily:'DM Sans,sans-serif', marginTop:14 }
  const iBtn = { background:'none', border:'none', cursor:'pointer', fontSize:13, padding:2, lineHeight:1 }

  return (
    <div style={box}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <span style={{ fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6 }}><StickyNote size={14} /> Notas</span>
        <span style={{ background:C.bd, borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700 }}>{count}</span>
        <label style={{ marginLeft:'auto', fontSize:11, color:C.mut, display:'flex', alignItems:'center', gap:4, cursor:'pointer' }}>
          <input type="checkbox" checked={showAct} onChange={e => setShowAct(e.target.checked)} style={{ accentColor:C.pur }} />Mostrar atividades
        </label>
      </div>
      {err ? <p style={{ fontSize:12, color:'#EAB308', textAlign:'center', margin:'8px 0' }}>{err}</p> : <>
        <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Adicionar nota..." rows={3}
          style={{ width:'100%', boxSizing:'border-box', background:C.bg, border:`1px solid ${C.bd}`, borderRadius:8, padding:'8px 10px', color:C.tx, fontSize:12, resize:'vertical', fontFamily:'inherit', outline:'none' }} />
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, margin:'8px 0' }}>
          {TYPES.map(([k, Ic, lb]) => { const on = type === k; return (
            <button key={k} onClick={() => setType(k)} style={{ ...iBtn, fontSize:11, fontWeight:600, padding:'4px 9px', borderRadius:12, background:on ? C.pur + '22' : C.bg, color:on ? '#A78BFA' : C.mut, border:`1px solid ${on ? C.pur + '66' : C.bd}`, display:'inline-flex', alignItems:'center', gap:5 }}><Ic size={12} /> {lb}</button>
          )})}
        </div>
        <button onClick={save} disabled={!newNote.trim()} style={{ width:'100%', background:C.pur, border:'none', borderRadius:8, padding:'9px', color:'#fff', fontWeight:700, fontSize:12, cursor:newNote.trim() ? 'pointer' : 'default', opacity:newNote.trim() ? 1 : .5, fontFamily:'inherit' }}>Salvar</button>
        <div style={{ maxHeight:300, overflowY:'auto', marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
          {loading ? <p style={{ fontSize:12, color:C.mut, textAlign:'center' }}>Carregando...</p>
          : visible.length === 0 ? <p style={{ fontSize:12, color:C.mut, textAlign:'center', margin:'12px 0' }}>Nenhuma nota ainda</p>
          : visible.map(n => { const act = n.type === 'activity'; return (
            <div key={n.id} style={{ background:n.pinned ? C.pur + '10' : C.bg, borderLeft:n.pinned ? `3px solid ${C.pur}` : '3px solid transparent', borderRadius:8, padding:'8px 10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                {(() => { const Ic = ICON[n.type] || StickyNote; return <Ic size={12} color={C.mut} /> })()}
                <span style={{ fontSize:10, color:C.mut }}>{ago(n.created_at)}</span>
                {!act && <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
                  <button title="Fixar" onClick={() => pin(n)} style={{ ...iBtn, color:n.pinned ? C.pur : C.mut, display:'inline-flex' }}><Pin size={13} /></button>
                  <button title="Editar" onClick={() => { setEditingId(n.id); setEditText(n.content) }} style={{ ...iBtn, color:C.mut, display:'inline-flex' }}><Pencil size={13} /></button>
                  <button title="Excluir" onClick={() => del(n.id)} style={{ ...iBtn, color:C.mut, display:'inline-flex' }}><Trash2 size={13} /></button>
                </div>}
              </div>
              {editingId === n.id ? <div>
                <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2} style={{ width:'100%', boxSizing:'border-box', background:C.card, border:`1px solid ${C.bd}`, borderRadius:6, padding:6, color:C.tx, fontSize:12, fontFamily:'inherit', resize:'vertical' }} />
                <div style={{ display:'flex', gap:6, marginTop:6 }}>
                  <button onClick={() => saveEdit(n.id)} style={{ ...iBtn, flex:1, background:C.pur, color:'#fff', borderRadius:6, padding:'5px', fontSize:11, fontWeight:600 }}>Salvar</button>
                  <button onClick={() => setEditingId(null)} style={{ ...iBtn, flex:1, background:C.bd, color:C.tx, borderRadius:6, padding:'5px', fontSize:11 }}>Cancelar</button>
                </div>
              </div>
              : <p style={{ margin:0, fontSize:12, color:act ? C.mut : C.tx, whiteSpace:'pre-wrap', lineHeight:1.4 }}>{n.content}</p>}
            </div>
          )})}
        </div>
      </>}
    </div>
  )
}
