import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Calendar, Repeat, Pencil, Ban, Copy, X, Loader2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { sendMessage as evoSend } from '@/services/evolutionApi'
import { usageService } from '@/services/usageService'
import { logger } from '@services/activityLogger'

const C = { bg:'#0F172A', card:'#1E293B', bd:'#334155', tx:'#F8FAFC', mut:'#64748B', pur:'#7C3AED' }
const ST = { agendado:{ l:'Agendado', c:'#2563EB' }, enviado:{ l:'Enviado', c:'#059669' }, cancelado:{ l:'Cancelado', c:'#EF4444' }, falhou:{ l:'Falhou', c:'#D97706' } }
const FREQ = [['diario','Diário'],['semanal','Semanal'],['mensal','Mensal'],['segsex','Seg-Sex']]
const pad = n => String(n).padStart(2,'0')
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const addDays = n => { const d = new Date(); d.setDate(d.getDate()+n); return d }
const fdate = (d,t) => { if(!d) return '—'; const [,m,dd] = d.split('-'); return `${dd}/${m} ${t}` }
const onlyDigits = s => String(s ?? '').replace(/\D/g, '')

const VARS = ['{{nome}}','{{empresa}}']
const EMPTY = { name:'', phone:'', msg:'', date:dstr(addDays(1)), time:'09:00', type:'unica', freq:'diario', end:'', business:false }

// Amostra apenas para modo demo (somente leitura).
const DEMO = [
  { id:'d1', name:'Ana Lima', phone:'5511987654321', msg:'Olá {{nome}}, sua proposta está pronta!', date:dstr(addDays(1)), time:'09:00', type:'unica', freq:'semanal', end:'', status:'agendado', business:false },
  { id:'d2', name:'Carla Souza', phone:'5511998877665', msg:'Obrigado pela compra, {{nome}}!', date:dstr(addDays(-2)), time:'10:30', type:'unica', freq:'semanal', end:'', status:'enviado', business:false },
]

const mapRow = r => ({ id:r.id, name:r.name||'', phone:r.phone||'', msg:r.msg||'', date:r.send_date, time:r.send_time||'09:00',
  type:r.type||'unica', freq:r.freq||'diario', end:r.end_date||'', status:r.status||'agendado', business:!!r.business_hours })

// Substitui variáveis na mensagem.
const substitute = (t, c) => String(t ?? '')
  .replace(/\{+nome\}+/gi, c.name || 'Cliente')
  .replace(/\{+empresa\}+/gi, c.company || '')
  .replace(/\{+telefone\}+/gi, c.phone || '')

// Próxima ocorrência de um recorrente.
const nextDate = (dateStr, freq) => {
  const d = new Date(dateStr + 'T00:00:00')
  if (freq === 'diario') d.setDate(d.getDate() + 1)
  else if (freq === 'semanal') d.setDate(d.getDate() + 7)
  else if (freq === 'mensal') d.setMonth(d.getMonth() + 1)
  else if (freq === 'segsex') { do { d.setDate(d.getDate() + 1) } while (d.getDay() === 0 || d.getDay() === 6) }
  else d.setDate(d.getDate() + 1)
  return dstr(d)
}

const S = {
  top:{ display:'flex',alignItems:'center',gap:14,padding:'16px 24px',borderBottom:`1px solid ${C.bd}`,background:C.card },
  btn:(bg=C.pur)=>({ background:bg,border:'none',borderRadius:8,padding:'9px 16px',color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit' }),
  ghost:{ background:'none',border:`1px solid ${C.bd}`,borderRadius:8,padding:'8px 12px',color:C.tx,cursor:'pointer',fontFamily:'inherit',fontSize:13 },
  inp:{ background:C.bg,border:`1px solid ${C.bd}`,borderRadius:8,padding:'9px 12px',color:C.tx,fontSize:13,outline:'none',fontFamily:'inherit',width:'100%',boxSizing:'border-box' },
  th:{ textAlign:'left',padding:'10px 12px',fontSize:11,color:C.mut,fontWeight:600,textTransform:'uppercase',letterSpacing:'.04em',borderBottom:`1px solid ${C.bd}` },
  td:{ padding:'12px',fontSize:13,borderBottom:`1px solid ${C.bd}`,color:C.tx },
  badge:c=>({ background:c+'22',color:c,borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:700,whiteSpace:'nowrap' }),
  ia:{ background:'none',border:'none',cursor:'pointer',fontSize:15,padding:'2px 5px',color:C.tx },
  lbl:{ fontSize:12,color:C.mut,fontWeight:600,display:'block',marginBottom:6,marginTop:14 },
  cell:(t,s)=>({ minHeight:74,border:`${t?2:1}px solid ${t?C.pur:C.bd}`,borderRadius:8,padding:8,cursor:'pointer',background:s?C.pur+'22':C.card }),
}

export const Schedules = () => {
  const { user, isDemoMode } = useAuth()
  const [items, setItems]   = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView]     = useState('lista')
  const [fStatus, setFStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [selDay, setSelDay] = useState(null)
  const [modal, setModal]   = useState(false)
  const [editId, setEditId] = useState(null)
  const [busy, setBusy]     = useState(false)
  const [f, setF]           = useState(EMPTY)
  const set = (k,v) => setF(p => ({ ...p, [k]:v }))

  const load = useCallback(async () => {
    if (!user || isDemoMode) return
    const [{ data: rows }, { data: cli }] = await Promise.all([
      supabase.from('schedules').select('*').eq('user_id', user.id).order('send_date', { ascending: true }),
      supabase.from('clients').select('name,phone,company').eq('user_id', user.id),
    ])
    setItems((rows ?? []).map(mapRow))
    setContacts(cli ?? [])
    setLoading(false)
  }, [user, isDemoMode])

  useEffect(() => {
    if (isDemoMode) { setItems(DEMO); setLoading(false); return }
    load()
  }, [user, isDemoMode, load])

  // ── Despachante client-side ──────────────────────────────────────────────
  // Sem cron no servidor: enquanto a aba estiver aberta, verifica a cada 30s os
  // agendamentos vencidos e dispara pela Evolution. Recorrentes reagendam sozinhos.
  const dispatchDue = useCallback(async () => {
    if (!user || isDemoMode) return
    const { data } = await supabase.from('schedules').select('*').eq('user_id', user.id).eq('status', 'agendado')
    const now = new Date()
    const due = (data ?? []).map(mapRow).filter(s => {
      const dt = new Date(`${s.date}T${s.time || '00:00'}`)
      if (isNaN(dt) || dt > now) return false
      if (s.business) { const h = now.getHours(); if (h < 8 || h >= 18) return false }
      return true
    })
    if (!due.length) return
    let changed = false
    for (const s of due) {
      try {
        if (user?.id && !(await usageService.canSend(user.id))) continue
        const ctx = contacts.find(c => onlyDigits(c.phone) === onlyDigits(s.phone)) ?? {}
        await evoSend(onlyDigits(s.phone), substitute(s.msg, { name: s.name, phone: s.phone, company: ctx.company }))
        try { await usageService.increment(user.id) } catch {}
        if (s.type === 'recorrente') {
          const nd = nextDate(s.date, s.freq)
          if (s.end && nd > s.end) await supabase.from('schedules').update({ status: 'enviado', last_sent_at: now.toISOString() }).eq('id', s.id)
          else await supabase.from('schedules').update({ send_date: nd, last_sent_at: now.toISOString() }).eq('id', s.id)
        } else {
          await supabase.from('schedules').update({ status: 'enviado', last_sent_at: now.toISOString() }).eq('id', s.id)
        }
        logger.log(user.id, 'schedule_sent', { category: 'messages', description: 'Agendamento enviado: ' + (s.name || s.phone) })
      } catch {
        await supabase.from('schedules').update({ status: 'falhou' }).eq('id', s.id)
      }
      changed = true
    }
    if (changed) await load()
  }, [user, isDemoMode, contacts, load])

  useEffect(() => {
    if (isDemoMode || !user) return
    dispatchDue()
    const iv = setInterval(dispatchDue, 30000)
    return () => clearInterval(iv)
  }, [user, isDemoMode, dispatchDue])

  // ── Ações ────────────────────────────────────────────────────────────────
  const guardDemo = () => { if (isDemoMode) { window.alert('Modo demo: crie uma conta para agendar mensagens reais.'); return true } return false }

  const cancel = async id => { if (guardDemo()) return; await supabase.from('schedules').update({ status: 'cancelado' }).eq('id', id); await load() }
  const del = async id => {
    if (guardDemo()) return
    if (!window.confirm('Excluir este agendamento permanentemente?')) return
    await supabase.from('schedules').delete().eq('id', id)
    await load()
  }
  const dup = async s => {
    if (guardDemo()) return
    await supabase.from('schedules').insert({ user_id: user.id, name: s.name, phone: onlyDigits(s.phone), msg: s.msg,
      send_date: dstr(addDays(1)), send_time: s.time, type: s.type, freq: s.freq, end_date: s.end || null, business_hours: s.business, status: 'agendado' })
    await load()
  }
  const openEdit = s => { setF({ ...EMPTY, ...s }); setEditId(s.id); setModal(true) }
  const save = async () => {
    if (guardDemo()) return
    if ((!f.name && !f.phone) || busy) return
    const phone = onlyDigits(f.phone)
    if (!phone) { window.alert('Informe um telefone válido.'); return }
    setBusy(true)
    try {
      const row = { name: f.name || 'Contato', phone, msg: f.msg, send_date: f.date, send_time: f.time,
        type: f.type, freq: f.freq, end_date: f.end || null, business_hours: !!f.business, status: 'agendado' }
      if (editId) {
        await supabase.from('schedules').update(row).eq('id', editId)
      } else {
        const { error } = await supabase.from('schedules').insert({ ...row, user_id: user.id })
        if (error) { window.alert('Erro ao agendar:\n' + error.message + '\n\n(Rode supabase/schedules.sql se ainda não rodou.)'); return }
      }
      setModal(false); setEditId(null); setF(EMPTY)
      await load()
    } finally { setBusy(false) }
  }

  const list = useMemo(() => items
    .filter(s => (fStatus==='all' || s.status===fStatus) && (!search || s.name.toLowerCase().includes(search.toLowerCase())) && (!selDay || s.date===selDay))
    .sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time)), [items, fStatus, search, selDay])

  const base = new Date(); base.setHours(0,0,0,0); base.setDate(base.getDate()-base.getDay())
  const cells = Array.from({ length:35 }, (_,i) => { const d = new Date(base); d.setDate(base.getDate()+i); return d })
  const today = dstr(new Date()), mo = new Date().getMonth()

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.tx, fontFamily:'DM Sans,sans-serif' }}>
      <div style={S.top}>
        <a href="/dashboard" style={{ ...S.ghost, textDecoration:'none' }}>← Voltar</a>
        <span style={{ fontSize:18, fontWeight:800, display:'inline-flex', alignItems:'center', gap:8 }}><Calendar size={18} color={C.pur} /> Agendamentos</span>
        <span style={S.badge(C.pur)}>{items.filter(s => s.status==='agendado').length} ativos</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {[['lista','Lista'],['cal','Calendário']].map(([v,l]) => (
            <button key={v} onClick={()=>setView(v)} style={{ ...S.ghost, background:view===v?C.pur+'22':'none', color:view===v?'#A78BFA':C.tx }}>{l}</button>
          ))}
          <button onClick={()=>{ if(guardDemo())return; setF(EMPTY); setEditId(null); setModal(true) }} style={S.btn()}>+ Agendar Mensagem</button>
        </div>
      </div>

      {isDemoMode && (
        <div style={{ margin:'16px 24px 0', padding:'12px 16px', borderRadius:10, background:'rgba(234,179,8,0.06)', border:'1px solid rgba(234,179,8,0.27)', color:'#EAB308', fontSize:13 }}>
          Modo demo — os agendamentos abaixo são apenas exemplo. Crie uma conta para agendar e disparar de verdade.
        </div>
      )}

      {view==='cal' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6, padding:24 }}>
          {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => <div key={d} style={{ textAlign:'center', fontSize:11, color:C.mut, fontWeight:600 }}>{d}</div>)}
          {cells.map((d,i) => {
            const ds = dstr(d), cnt = items.filter(s => s.date===ds && s.status!=='cancelado').length
            return (
              <div key={i} onClick={()=>setSelDay(selDay===ds?null:ds)} style={S.cell(ds===today, selDay===ds)}>
                <div style={{ fontSize:12, color:d.getMonth()===mo?C.tx:C.mut }}>{d.getDate()}</div>
                {cnt>0 && <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:4 }}><span style={{ width:7,height:7,borderRadius:'50%',background:C.pur }} /><span style={{ fontSize:10, color:C.mut }}>{cnt} msg</span></div>}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ padding:'0 24px 24px' }}>
        <div style={{ display:'flex', gap:10, alignItems:'center', padding:'16px 0' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome..." style={{ ...S.inp, width:240 }} />
          <select value={fStatus} onChange={e=>setFStatus(e.target.value)} style={{ ...S.inp, width:160 }}>
            <option value="all">Todos status</option>
            {Object.entries(ST).map(([k,v]) => <option key={k} value={k}>{v.l}</option>)}
          </select>
          {selDay && <button onClick={()=>setSelDay(null)} style={{ ...S.ghost, display:'inline-flex', alignItems:'center', gap:5 }}>Limpar dia: {fdate(selDay,'').trim()} <X size={13} /></button>}
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', background:C.card, borderRadius:12, overflow:'hidden' }}>
          <thead><tr>{['Status','Destinatário','Mensagem','Data/Hora','Tipo','Ações'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...S.td, textAlign:'center', color:C.mut, padding:32 }}><Loader2 size={18} className="animate-spin" style={{ display:'inline' }} /> Carregando…</td></tr>
            ) : list.map(s => (
              <tr key={s.id}>
                <td style={S.td}><span style={S.badge(ST[s.status]?.c ?? C.mut)}>{ST[s.status]?.l ?? s.status}</span></td>
                <td style={S.td}><div style={{ fontWeight:600 }}>{s.name}</div><div style={{ fontSize:11, color:C.mut }}>+{s.phone}</div></td>
                <td style={{ ...S.td, color:C.mut }}>{s.msg.length>40 ? s.msg.slice(0,40)+'…' : s.msg}</td>
                <td style={S.td}>{fdate(s.date, s.time)}</td>
                <td style={S.td}>{s.type==='recorrente' ? <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}><Repeat size={13} /> Recorrente</span> : 'Única'}</td>
                <td style={S.td}>
                  <button onClick={()=>openEdit(s)} style={{ ...S.ia, display:'inline-flex', alignItems:'center' }} title="Editar"><Pencil size={14} /></button>
                  <button onClick={()=>cancel(s.id)} disabled={s.status==='cancelado'} style={{ ...S.ia, opacity:s.status==='cancelado'?.3:1, display:'inline-flex', alignItems:'center' }} title="Cancelar"><Ban size={14} /></button>
                  <button onClick={()=>dup(s)} style={{ ...S.ia, display:'inline-flex', alignItems:'center' }} title="Duplicar"><Copy size={14} /></button>
                  <button onClick={()=>del(s.id)} style={{ ...S.ia, display:'inline-flex', alignItems:'center', color:'#EF4444' }} title="Excluir"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {!loading && list.length===0 && <tr><td colSpan={6} style={{ ...S.td, textAlign:'center', color:C.mut }}>Nenhum agendamento encontrado.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }} onClick={()=>setModal(false)}>
          <div style={{ background:C.card, borderRadius:16, padding:24, width:480, maxHeight:'90vh', overflowY:'auto', border:`1px solid ${C.bd}` }} onClick={e=>e.stopPropagation()}>
            <h3 style={{ margin:'0 0 4px', fontSize:17, fontWeight:800 }}>{editId ? 'Editar Agendamento' : 'Agendar Mensagem'}</h3>
            <label style={S.lbl}>Destinatário</label>
            <select onChange={e=>{ const c = contacts.find(x=>x.name===e.target.value); if(c){ set('name',c.name); set('phone',c.phone) } }} value={f.name} style={{ ...S.inp, marginBottom:8 }}>
              <option value="">{contacts.length ? 'Selecione um contato…' : 'Nenhum contato no CRM — digite abaixo'}</option>
              {contacts.map(c => <option key={c.phone} value={c.name}>{c.name}</option>)}
            </select>
            <input value={f.phone} onChange={e=>set('phone',e.target.value)} placeholder="ou digite o telefone (5511…)" style={S.inp} />
            <label style={S.lbl}>Mensagem</label>
            <textarea value={f.msg} onChange={e=>set('msg',e.target.value)} rows={3} placeholder="Digite a mensagem…" style={{ ...S.inp, resize:'vertical' }} />
            <div style={{ display:'flex', gap:6, marginTop:6 }}>
              {VARS.map(v => <button key={v} onClick={()=>set('msg', f.msg+' '+v)} style={{ ...S.ghost, fontSize:11, padding:'4px 8px', color:'#A78BFA' }}>{v}</button>)}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <div style={{ flex:1 }}><label style={S.lbl}>Data</label><input type="date" value={f.date} onChange={e=>set('date',e.target.value)} style={S.inp} /></div>
              <div style={{ flex:1 }}><label style={S.lbl}>Hora</label><input type="time" value={f.time} onChange={e=>set('time',e.target.value)} style={S.inp} /></div>
            </div>
            <label style={S.lbl}>Tipo</label>
            <div style={{ display:'flex', gap:16 }}>
              {[['unica','Única'],['recorrente','Recorrente']].map(([v,l]) => (
                <label key={v} style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                  <input type="radio" checked={f.type===v} onChange={()=>set('type',v)} />{l}
                </label>
              ))}
            </div>
            {f.type==='recorrente' && (
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ flex:1 }}><label style={S.lbl}>Frequência</label><select value={f.freq} onChange={e=>set('freq',e.target.value)} style={S.inp}>{FREQ.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div style={{ flex:1 }}><label style={S.lbl}>Termina em</label><input type="date" value={f.end} onChange={e=>set('end',e.target.value)} style={S.inp} /></div>
              </div>
            )}
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, marginTop:16, cursor:'pointer' }}>
              <input type="checkbox" checked={f.business} onChange={e=>set('business',e.target.checked)} />Não enviar fora do horário comercial (8h–18h)
            </label>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:22 }}>
              <button onClick={()=>setModal(false)} style={S.ghost}>Cancelar</button>
              <button onClick={save} disabled={busy} style={{ ...S.btn(), opacity:busy?0.6:1, display:'inline-flex', alignItems:'center', gap:6 }}>{busy && <Loader2 size={14} className="animate-spin" />}{editId ? 'Salvar' : 'Agendar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
