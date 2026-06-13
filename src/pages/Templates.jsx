import React, { useState } from 'react'
import { Hand, DollarSign, Wrench, Receipt, Repeat, Flame, FileText, Copy, Trash2, Image, CheckCheck, Check } from 'lucide-react'

const C = { bg:'#0F172A', card:'#1E293B', bd:'#334155', tx:'#F8FAFC', mut:'#94A3B8', pur:'#7C3AED' }
const CATS = { 'Saudação':Hand, 'Vendas':DollarSign, 'Suporte':Wrench, 'Cobrança':Receipt, 'Follow-up':Repeat, 'Reativação':Flame }
const TYPES = ['Texto','Imagem','Lista']
const VARS = ['{{nome}}','{{telefone}}','{{empresa}}','{{link}}','{{valor}}']
const EX = { '{{nome}}':'João', '{{telefone}}':'11999998888', '{{empresa}}':'Acme Ltda', '{{link}}':'acme.com/promo', '{{valor}}':'R$ 1.250,00' }
const fill = m => m.replace(/\{\{(\w+)\}\}/g, (s) => EX[s] || s)

const T = (id, name, cat, type, msg, uses) => ({ id, name, cat, type, msg, uses, media:'', opts:'' })
const MOCK = [
  T('1','Boas-vindas','Saudação','Texto','Olá {{nome}}! Bem-vindo à {{empresa}}! Como posso ajudar?',128),
  T('2','Orçamento enviado','Vendas','Texto','{{nome}}, segue o orçamento solicitado no valor de {{valor}}. Qualquer dúvida estou à disposição!',47),
  T('3','Cobrança gentil','Cobrança','Texto','Oi {{nome}}, notamos que o pagamento de {{valor}} está pendente. Pode regularizar pelo link: {{link}}',33),
  T('4','Follow-up 3 dias','Follow-up','Texto','{{nome}}, passando para saber se teve tempo de avaliar nossa proposta. Posso ajudar em algo?',61),
  T('5','Reativação','Reativação','Texto','{{nome}}, faz tempo que não conversamos! Temos novidades na {{empresa}} que vão te interessar 🎉',19),
  T('6','Catálogo de produtos','Vendas','Imagem','{{nome}}, confira nosso catálogo atualizado! Acesse: {{link}}',24),
  T('7','Opções de atendimento','Suporte','Lista','Olá {{nome}}! Como podemos ajudar hoje? Escolha uma opção:',55),
  T('8','Lembrete de pagamento','Cobrança','Texto','{{nome}}, seu boleto de {{valor}} vence amanhã. Evite juros pagando em dia!',42),
  T('9','Pesquisa de satisfação','Suporte','Texto','{{nome}}, sua opinião é importante! Como foi seu atendimento na {{empresa}}? Responda: {{link}}',38),
]
const EMPTY = { name:'', cat:'Saudação', type:'Texto', msg:'', media:'', opts:'' }

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
  const [items, setItems] = useState(MOCK)
  const [search, setSearch] = useState('')
  const [fCat, setFCat] = useState('all')
  const [fType, setFType] = useState('all')
  const [modal, setModal] = useState(false)
  const [hover, setHover] = useState(null)
  const [toast, setToast] = useState('')
  const [f, setF] = useState(EMPTY)
  const set = (k,v) => setF(p => ({ ...p, [k]:v }))

  const flash = m => { setToast(m); setTimeout(()=>setToast(''), 1800) }
  const use = t => { navigator.clipboard?.writeText(t.msg); setItems(p => p.map(x => x.id===t.id ? { ...x, uses:x.uses+1 } : x)); flash('Copiado!') }
  const dup = t => setItems(p => [{ ...t, id:String(Date.now()), name:t.name+' (Cópia)', uses:0 }, ...p])
  const del = id => setItems(p => p.filter(x => x.id!==id))
  const save = () => { if(!f.name||!f.msg) return; setItems(p => [{ ...f, id:String(Date.now()), uses:0 }, ...p]); setModal(false); setF(EMPTY) }

  const list = items.filter(t =>
    (!search || t.name.toLowerCase().includes(search.toLowerCase())) &&
    (fCat==='all' || t.cat===fCat) && (fType==='all' || t.type===fType))

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.tx, fontFamily:'DM Sans,sans-serif' }}>
      <div style={S.top}>
        <a href="/dashboard" style={{ ...S.ghost, textDecoration:'none' }}>← Voltar</a>
        <span style={{ fontSize:18, fontWeight:800, display:'inline-flex', alignItems:'center', gap:8 }}><FileText size={18} color={C.pur} /> Templates</span>
        <span style={S.badge(C.pur)}>{items.length} templates</span>
        <button onClick={()=>{ setF(EMPTY); setModal(true) }} style={{ ...S.btn(), marginLeft:'auto' }}>+ Novo Template</button>
      </div>

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
        {list.map(t => (
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
              <button onClick={()=>use(t)} style={{ ...S.btn(), flex:1, padding:'6px' }}>Usar</button>
              <button onClick={()=>flash('Edição em breve')} style={S.ia}>Editar</button>
              <button onClick={()=>dup(t)} title="Duplicar" style={{ ...S.ia, display:'inline-flex', alignItems:'center' }}><Copy size={14} /></button>
              <button onClick={()=>del(t.id)} title="Excluir" style={{ ...S.ia, color:'#F87171', borderColor:'#EF444440', display:'inline-flex', alignItems:'center' }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {list.length===0 && <div style={{ gridColumn:'1/-1', textAlign:'center', color:C.mut, padding:40 }}>Nenhum template encontrado.</div>}
      </div>

      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }} onClick={()=>setModal(false)}>
          <div style={{ background:C.card, borderRadius:16, padding:24, width:760, maxHeight:'90vh', overflowY:'auto', border:`1px solid ${C.bd}`, display:'flex', gap:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ flex:1 }}>
              <h3 style={{ margin:'0 0 4px', fontSize:17, fontWeight:800 }}>Novo Template</h3>
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
                <button onClick={save} style={S.btn()}>Salvar Template</button>
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
