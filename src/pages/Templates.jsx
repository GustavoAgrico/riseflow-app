import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hand, DollarSign, Wrench, Receipt, Repeat, Flame, FileText, Copy, Trash2, Image, CheckCheck, Check, Loader2 } from 'lucide-react'
import { useAuth } from '@context/AuthContext'
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, incrementTemplateUse } from '@services/templatesService'

const C = { bg:'#0F172A', card:'#1E293B', bd:'#334155', tx:'#F8FAFC', mut:'#94A3B8', pur:'#7C3AED' }
const CATS = { 'Saudação':Hand, 'Vendas':DollarSign, 'Suporte':Wrench, 'Cobrança':Receipt, 'Follow-up':Repeat, 'Reativação':Flame }
const TYPES = ['Texto','Imagem','Lista']
const VARS = ['{{nome}}','{{telefone}}','{{empresa}}','{{link}}','{{valor}}']
const EX = { '{{nome}}':'João', '{{telefone}}':'11999998888', '{{empresa}}':'Acme Ltda', '{{link}}':'acme.com/promo', '{{valor}}':'R$ 1.250,00' }
const fill = m => m.replace(/\{\{(\w+)\}\}/g, (s) => EX[s] || s)

const EMPTY = { name:'', cat:'Saudação', type:'Texto', msg:'', media:'', opts:'' }

// Amostra apenas para modo demo (somente leitura).
const DEMO = [
  { id:'d1', name:'Boas-vindas', cat:'Saudação', type:'Texto', msg:'Olá {{nome}}! Bem-vindo à {{empresa}}! Como posso ajudar?', media:'', opts:'', uses:128 },
  { id:'d2', name:'Orçamento enviado', cat:'Vendas', type:'Texto', msg:'{{nome}}, segue o orçamento no valor de {{valor}}. Qualquer dúvida estou à disposição!', media:'', opts:'', uses:47 },
  { id:'d3', name:'Cobrança gentil', cat:'Cobrança', type:'Texto', msg:'Oi {{nome}}, o pagamento de {{valor}} está pendente. Pode regularizar pelo link: {{link}}', media:'', opts:'', uses:33 },
]

const renderMsg = (txt) => txt.split(/(\{\{\w+\}\})/g).map((p,i) =>
  /\{\{\w+\}\}/.test(p) ? <span key={i} style={{ color:C.pur, fontWeight:700 }}>{p}</span> : p)

const S = {
  top:{ display:'flex',alignItems:'center',gap:14,padding:'16px 24px',borderBottom:`1px solid ${C.bd}`,background:C.card },
  btn:(bg=C.pur)=>({ background:bg,border:'none',borderRadius:8,padding:'9px 16px',color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit' }),
  ghost:{ background:'none',border:`1px solid ${C.bd}`,borderRadius:8,padding:'8px 12px',color:C.tx,cursor:'pointer',fontFamily:'inherit',fontSize:13 },
  inp:{ background:C.bg,border:`1px solid ${C.bd}`,borderRadius:8,padding:'9px 12px',color:C.tx,fontSize:13,outline:'none',fontFamily:'inherit',width:'100%',boxSizing:'border-box' },
  badge:c=>({ background:c+'22',color:c,borderRadius:6,padding:'3px 9px',fontSize:11,fontWeight:700,whiteSpace:'nowrap' }),
  ia:{ background:'none',border:`1px solid ${C.bd}`,borderRadius:6,cursor:'pointer',fontSize:12,padding:'5px 9px',color:C.tx,fontFamily:'inherit' },
  lbl:{ fontSize:12,color:C.mut,fontWeight:600,display:'block',marginBottom:6,marginTop:14 },
}

export const Templates = () => {
  const { user, isDemoMode } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fCat, setFCat] = useState('all')
  const [fType, setFType] = useState('all')
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState(null)
  const [toast, setToast] = useState('')
  const [f, setF] = useState(EMPTY)
  const set = (k,v) => setF(p => ({ ...p, [k]:v }))

  const load = useCallback(async () => {
    if (!user || isDemoMode) return
    setItems(await listTemplates(user.id))
    setLoading(false)
  }, [user, isDemoMode])

  useEffect(() => {
    if (isDemoMode) { setItems(DEMO); setLoading(false); return }
    load()
  }, [user, isDemoMode, load])

  const flash = m => { setToast(m); setTimeout(()=>setToast(''), 1800) }
  const guardDemo = () => { if (isDemoMode) { flash('Modo demo — crie uma conta'); return true } return false }

  const use = async t => {
    navigator.clipboard?.writeText(t.msg)
    flash('Copiado!')
    if (isDemoMode) return
    setItems(p => p.map(x => x.id===t.id ? { ...x, uses:x.uses+1 } : x)) // otimista
    await incrementTemplateUse(t.id, t.uses)
  }
  const dup = async t => {
    if (guardDemo()) return
    await createTemplate(user.id, { ...t, name: t.name + ' (Cópia)' })
    await load()
  }
  const del = async id => {
    if (guardDemo()) return
    if (!window.confirm('Excluir este template?')) return
    await deleteTemplate(id)
    await load()
  }
  const openNew  = () => { setF(EMPTY); setEditId(null); setModal(true) }
  const openEdit = t => { setF({ name:t.name, cat:t.cat, type:t.type, msg:t.msg, media:t.media||'', opts:t.opts||'' }); setEditId(t.id); setModal(true) }
  const save = async () => {
    if (guardDemo()) return
    if (!f.name || !f.msg || busy) return
    setBusy(true)
    try {
      if (editId) { await updateTemplate(editId, f) }
      else {
        const { error } = await createTemplate(user.id, f)
        if (error) { window.alert('Erro ao salvar template:\n' + error.message + '\n\n(Rode supabase/templates.sql se ainda não rodou.)'); return }
      }
      setModal(false); setEditId(null); setF(EMPTY)
      await load()
    } finally { setBusy(false) }
  }

  const list = items.filter(t =>
    (!search || t.name.toLowerCase().includes(search.toLowerCase())) &&
    (fCat==='all' || t.cat===fCat) && (fType==='all' || t.type===fType))

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.tx, fontFamily:'DM Sans,sans-serif' }}>
      <div style={S.top}>
        <button onClick={() => navigate(-1)} style={S.ghost}>← Voltar</button>
        <span style={{ fontSize:18, fontWeight:800, display:'inline-flex', alignItems:'center', gap:8 }}><FileText size={18} color={C.pur} /> Templates</span>
        <span style={S.badge(C.pur)}>{items.length} templates</span>
        <button onClick={()=>{ if(guardDemo())return; openNew() }} style={{ ...S.btn(), marginLeft:'auto' }}>+ Novo Template</button>
      </div>

      {isDemoMode && (
        <div style={{ margin:'16px 24px 0', padding:'12px 16px', borderRadius:10, background:'rgba(234,179,8,0.06)', border:'1px solid rgba(234,179,8,0.27)', color:'#EAB308', fontSize:13 }}>
          Modo demo — os templates abaixo são apenas exemplo. Crie uma conta para salvar e usar os seus.
        </div>
      )}

      <div style={{ display:'flex', gap:10, padding:'16px 24px' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome..." style={{ ...S.inp, width:260 }} />
        <select value={fCat} onChange={e=>setFCat(e.target.value)} style={{ ...S.inp, width:170 }}>
          <option value="all">Todas categorias</option>
          {Object.keys(CATS).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fType} onChange={e=>setFType(e.target.value)} style={{ ...S.inp, width:150 }}>
          <option value="all">Todos os tipos</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, padding:'0 24px 24px' }}>
        {loading ? (
          <div style={{ gridColumn:'1/-1', textAlign:'center', color:C.mut, padding:40 }}><Loader2 size={20} className="animate-spin" style={{ display:'inline' }} /> Carregando…</div>
        ) : list.map(t => (
          <div key={t.id} onMouseEnter={()=>setHover(t.id)} onMouseLeave={()=>setHover(null)}
            style={{ background:C.card, borderRadius:12, padding:16, border:`1px solid ${hover===t.id?C.pur:C.bd}`, boxShadow:hover===t.id?'0 6px 20px rgba(124,58,237,.18)':'none', transition:'all .15s' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              {(() => { const Ic = CATS[t.cat]; return Ic ? <Ic size={16} color={C.pur} /> : null })()}
              <span style={{ fontWeight:700, fontSize:14, flex:1 }}>{t.name}</span>
              <span style={S.badge('#2563EB')}>{t.type}</span>
            </div>
            <div style={{ fontSize:12, color:C.mut, lineHeight:1.5, height:54, overflow:'hidden', marginBottom:12 }}>{renderMsg(t.msg)}</div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={S.badge(C.pur)}>{t.cat}</span>
              <span style={{ fontSize:11, color:C.mut, marginLeft:'auto' }}>Usado {t.uses}x</span>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={()=>use(t)} style={{ ...S.btn(), flex:1, padding:'6px' }}>Copiar</button>
              <button onClick={()=>{ if(guardDemo())return; openEdit(t) }} style={S.ia}>Editar</button>
              <button onClick={()=>dup(t)} title="Duplicar" style={{ ...S.ia, display:'inline-flex', alignItems:'center' }}><Copy size={14} /></button>
              <button onClick={()=>del(t.id)} title="Excluir" style={{ ...S.ia, color:'#F87171', borderColor:'#EF444440', display:'inline-flex', alignItems:'center' }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {!loading && list.length===0 && <div style={{ gridColumn:'1/-1', textAlign:'center', color:C.mut, padding:40 }}>Nenhum template encontrado.</div>}
      </div>

      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }} onClick={()=>setModal(false)}>
          <div style={{ background:C.card, borderRadius:16, padding:24, width:760, maxHeight:'90vh', overflowY:'auto', border:`1px solid ${C.bd}`, display:'flex', gap:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ flex:1 }}>
              <h3 style={{ margin:'0 0 4px', fontSize:17, fontWeight:800 }}>{editId ? 'Editar Template' : 'Novo Template'}</h3>
              <label style={S.lbl}>Nome do template</label>
              <input value={f.name} onChange={e=>set('name',e.target.value)} placeholder="Ex: Boas-vindas" style={S.inp} />
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ flex:1 }}>
                  <label style={S.lbl}>Categoria</label>
                  <select value={f.cat} onChange={e=>set('cat',e.target.value)} style={S.inp}>{Object.keys(CATS).map(c => <option key={c} value={c}>{c}</option>)}</select>
                </div>
              </div>
              <label style={S.lbl}>Tipo</label>
              <div style={{ display:'flex', gap:16 }}>
                {[['Texto','Texto'],['Imagem','Imagem + texto'],['Lista','Lista interativa']].map(([v,l]) => (
                  <label key={v} style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                    <input type="radio" checked={f.type===v} onChange={()=>set('type',v)} />{l}
                  </label>
                ))}
              </div>
              <label style={S.lbl}>Mensagem <span style={{ color:f.msg.length>4096?'#F87171':C.mut, fontWeight:400 }}>({f.msg.length}/4096)</span></label>
              <textarea value={f.msg} maxLength={4096} onChange={e=>set('msg',e.target.value)} rows={4} placeholder="Digite a mensagem…" style={{ ...S.inp, resize:'vertical' }} />
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                {VARS.map(v => <button key={v} onClick={()=>set('msg', f.msg+v)} style={{ ...S.ghost, fontSize:11, padding:'4px 8px', color:'#A78BFA' }}>{v}</button>)}
              </div>
              {f.type==='Imagem' && (<><label style={S.lbl}>URL da mídia</label><input value={f.media} onChange={e=>set('media',e.target.value)} placeholder="https://…" style={S.inp} /></>)}
              {f.type==='Lista' && (<><label style={S.lbl}>Opções (uma por linha)</label><textarea value={f.opts} onChange={e=>set('opts',e.target.value)} rows={3} placeholder="Opção 1&#10;Opção 2" style={{ ...S.inp, resize:'vertical' }} /></>)}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:22 }}>
                <button onClick={()=>setModal(false)} style={S.ghost}>Cancelar</button>
                <button onClick={save} disabled={busy} style={{ ...S.btn(), opacity:busy?0.6:1, display:'inline-flex', alignItems:'center', gap:6 }}>{busy && <Loader2 size={14} className="animate-spin" />}{editId ? 'Salvar' : 'Salvar Template'}</button>
              </div>
            </div>
            <div style={{ width:280, flexShrink:0 }}>
              <label style={S.lbl}>Preview</label>
              <div style={{ background:C.bg, borderRadius:12, padding:16, minHeight:300 }}>
                <div style={{ background:C.card, borderRadius:16, padding:'12px 14px', fontSize:13, lineHeight:1.5, color:C.tx, boxShadow:'0 2px 8px rgba(0,0,0,.3)' }}>
                  {f.type==='Imagem' && <div style={{ background:C.bd, borderRadius:10, height:120, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:8 }}><Image size={28} color={C.mut} /></div>}
                  {fill(f.msg) || <span style={{ color:C.mut }}>Sua mensagem aparecerá aqui…</span>}
                  {f.type==='Lista' && f.opts && <div style={{ marginTop:10, borderTop:`1px solid ${C.bd}`, paddingTop:8 }}>{f.opts.split('\n').filter(Boolean).map((o,i) => <div key={i} style={{ color:'#A78BFA', padding:'4px 0', fontSize:12 }}>▸ {o}</div>)}</div>}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:3, fontSize:10, color:C.mut, marginTop:6 }}>12:34 <CheckCheck size={12} color="#53BDEB" /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:C.pur, color:'#fff', padding:'10px 20px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:60, display:'flex', alignItems:'center', gap:6 }}><Check size={14} /> {toast}</div>}
    </div>
  )
}
