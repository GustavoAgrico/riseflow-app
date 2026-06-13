import React, { useState } from 'react'
import { Calendar, Repeat, Pencil, Ban, Copy, X } from 'lucide-react'

const C = { bg:'#0F172A', card:'#1E293B', bd:'#334155', tx:'#F8FAFC', mut:'#64748B', pur:'#7C3AED' }
const ST = { agendado:{ l:'Agendado', c:'#2563EB' }, enviado:{ l:'Enviado', c:'#059669' }, cancelado:{ l:'Cancelado', c:'#EF4444' }, falhou:{ l:'Falhou', c:'#D97706' } }
const FREQ = [['diario','Diário'],['semanal','Semanal'],['mensal','Mensal'],['segsex','Seg-Sex']]
const pad = n => String(n).padStart(2,'0')
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const addDays = n => { const d = new Date(); d.setDate(d.getDate()+n); return d }
const fdate = (d,t) => { const [,m,dd] = d.split('-'); return `${dd}/${m} ${t}` }

const CONTACTS = [
  { name:'Ana Lima', phone:'5511987654321' }, { name:'Bruno Martins', phone:'5511912345678' },
  { name:'Carla Souza', phone:'5511998877665' }, { name:'Diego Costa', phone:'5511955443322' },
]
const mk = (name, phone, msg, off, time, status, type) => ({ id:name.split(' ')[0].toLowerCase()+off, name, phone, msg, date:dstr(addDays(off)), time, status, type, freq:'semanal', end:'' })
const MOCK = [
  mk('Ana Lima','5511987654321','Olá {{nome}}, sua proposta da {{empresa}} está pronta!',1,'09:00','agendado','unica'),
  mk('Bruno Martins','5511912345678','Lembrete: nossa reunião é amanhã às 14h.',2,'14:00','agendado','recorrente'),
  mk('Carla Souza','5511998877665','Obrigado pela compra, {{nome}}! Volte sempre.',-2,'10:30','enviado','unica'),
  mk('Diego Costa','5511955443322','Seu boleto vence hoje. Evite juros!',3,'08:00','falhou','unica'),
  mk('Elena Rocha','5511933221100','Novidades da semana chegando pra você 🚀',4,'18:00','agendado','recorrente'),
  mk('Felipe Santos','5511977665544','Promoção exclusiva: 20% off só hoje.',5,'12:00','cancelado','unica'),
  mk('Gabriela Dias','5511944332211','{{nome}}, agendamos sua avaliação gratuita.',7,'15:30','agendado','unica'),
  mk('Hugo Alves','5511966554433','Recebemos seu pagamento. Obrigado!',-1,'11:00','enviado','unica'),
  mk('Isabela Nunes','5511922110099','Resumo mensal da {{empresa}} disponível.',10,'09:30','agendado','recorrente'),
  mk('João Pereira','5511988776655','Confirmando sua consulta para o dia 15.',14,'16:00','agendado','unica'),
]
const VARS = ['{{nome}}','{{empresa}}']
const EMPTY = { name:'', phone:'', msg:'', date:dstr(addDays(1)), time:'09:00', type:'unica', freq:'diario', end:'', business:false }

const S = {
  top:{ display:'flex',alignItems:'center',gap:14,padding:'16px 24px',borderBottom:`1px solid ${C.bd}`,background:C.card },
  btn:(bg=C.pur)=>({ background:bg,border:'none',borderRadius:8,padding:'9px 16px',color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit' }),
  ghost:{ background:'none',border:`1px solid ${C.bd}`,borderRadius:8,padding:'8px 12px',color:C.tx,cursor:'pointer',fontFamily:'inherit',fontSize:13 },
  inp:{ background:C.bg,border:`1px solid ${C.bd}`,borderRadius:8,padding:'9px 12px',color:C.tx,fontSize:13,outline:'none',fontFamily:'inherit',width:'100%',boxSizing:'border-box' },
  th:{ textAlign:'left',padding:'10px 12px',fontSize:11,color:C.mut,fontWeight:600,textTransform:'uppercase',letterSpacing:'.04em',borderBottom:`1px solid ${C.bd}` },
  td:{ padding:'12px',fontSize:13,borderBottom:`1px solid ${C.bd}`,color:C.tx },
  badge:c=>({ background:c+'22',color:c,borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:700,whiteSpace:'nowrap' }),
  ia:{ background:'none',border:'none',cursor:'pointer',fontSize:15,padding:'2px 5px' },
  lbl:{ fontSize:12,color:C.mut,fontWeight:600,display:'block',marginBottom:6,marginTop:14 },
  cell:(t,s)=>({ minHeight:74,border:`${t?2:1}px solid ${t?C.pur:C.bd}`,borderRadius:8,padding:8,cursor:'pointer',background:s?C.pur+'22':C.card }),
}

export const Schedules = () => {
  const [items, setItems]   = useState(MOCK)
  const [view, setView]     = useState('lista')
  const [fStatus, setFStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [selDay, setSelDay] = useState(null)
  const [modal, setModal]   = useState(false)
  const [editId, setEditId] = useState(null)
  const [f, setF]           = useState(EMPTY)
  const set = (k,v) => setF(p => ({ ...p, [k]:v }))

  const cancel = id => setItems(p => p.map(s => s.id===id ? { ...s, status:'cancelado' } : s))
  const dup = s => { const d = new Date(s.date); d.setDate(d.getDate()+1); setItems(p => [...p, { ...s, id:String(Date.now()), date:dstr(d), status:'agendado' }]) }
  const openEdit = s => { setF({ ...EMPTY, ...s }); setEditId(s.id); setModal(true) }
  const save = () => {
    if (!f.name && !f.phone) return
    const rec = { name:f.name || 'Contato', phone:f.phone, msg:f.msg, date:f.date, time:f.time, type:f.type, freq:f.freq, end:f.end, status:'agendado' }
    setItems(p => editId ? p.map(s => s.id===editId ? { ...s, ...rec } : s) : [...p, { ...rec, id:String(Date.now()) }])
    setModal(false); setEditId(null); setF(EMPTY)
  }

  const list = items
    .filter(s => (fStatus==='all' || s.status===fStatus) && (!search || s.name.toLowerCase().includes(search.toLowerCase())) && (!selDay || s.date===selDay))
    .sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time))
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
          <button onClick={()=>{ setF(EMPTY); setEditId(null); setModal(true) }} style={S.btn()}>+ Agendar Mensagem</button>
        </div>
      </div>

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
            {list.map(s => (
              <tr key={s.id}>
                <td style={S.td}><span style={S.badge(ST[s.status].c)}>{ST[s.status].l}</span></td>
                <td style={S.td}><div style={{ fontWeight:600 }}>{s.name}</div><div style={{ fontSize:11, color:C.mut }}>+{s.phone}</div></td>
                <td style={{ ...S.td, color:C.mut }}>{s.msg.length>40 ? s.msg.slice(0,40)+'…' : s.msg}</td>
                <td style={S.td}>{fdate(s.date, s.time)}</td>
                <td style={S.td}>{s.type==='recorrente' ? <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}><Repeat size={13} /> Recorrente</span> : 'Única'}</td>
                <td style={S.td}>
                  <button onClick={()=>openEdit(s)} style={{ ...S.ia, display:'inline-flex', alignItems:'center' }} title="Editar"><Pencil size={14} /></button>
                  <button onClick={()=>cancel(s.id)} disabled={s.status==='cancelado'} style={{ ...S.ia, opacity:s.status==='cancelado'?.3:1, display:'inline-flex', alignItems:'center' }} title="Cancelar"><Ban size={14} /></button>
                  <button onClick={()=>dup(s)} style={{ ...S.ia, display:'inline-flex', alignItems:'center' }} title="Duplicar"><Copy size={14} /></button>
                </td>
              </tr>
            ))}
            {list.length===0 && <tr><td colSpan={6} style={{ ...S.td, textAlign:'center', color:C.mut }}>Nenhum agendamento encontrado.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }} onClick={()=>setModal(false)}>
          <div style={{ background:C.card, borderRadius:16, padding:24, width:480, maxHeight:'90vh', overflowY:'auto', border:`1px solid ${C.bd}` }} onClick={e=>e.stopPropagation()}>
            <h3 style={{ margin:'0 0 4px', fontSize:17, fontWeight:800 }}>{editId ? 'Editar Agendamento' : 'Agendar Mensagem'}</h3>
            <label style={S.lbl}>Destinatário</label>
            <select onChange={e=>{ const c = CONTACTS.find(x=>x.name===e.target.value); if(c){ set('name',c.name); set('phone',c.phone) } }} value={f.name} style={{ ...S.inp, marginBottom:8 }}>
              <option value="">Selecione um contato…</option>
              {CONTACTS.map(c => <option key={c.phone} value={c.name}>{c.name}</option>)}
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
              <input type="checkbox" checked={f.business} onChange={e=>set('business',e.target.checked)} />Não enviar fora do horário comercial
            </label>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:22 }}>
              <button onClick={()=>setModal(false)} style={S.ghost}>Cancelar</button>
              <button onClick={save} style={S.btn()}>{editId ? 'Salvar' : 'Agendar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
