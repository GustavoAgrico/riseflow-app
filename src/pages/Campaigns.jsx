import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Megaphone, Send, CheckCircle2, Eye, MessageCircle, AlertTriangle, Rocket, Download, Copy, Trash2 } from 'lucide-react'
import { exportCSV } from '@utils/exportUtils'
import { logger } from '@services/activityLogger'

const STATUS = {
  draft:     { label: 'Rascunho',  color: '#6B7280', bg: '#6B728020' },
  scheduled: { label: 'Agendada',  color: '#2563EB', bg: '#2563EB20' },
  sending:   { label: 'Enviando',  color: '#D97706', bg: '#D9770620', pulse: true },
  done:      { label: 'Concluída', color: '#059669', bg: '#05966920' },
  paused:    { label: 'Pausada',   color: '#EF4444', bg: '#EF444420' },
}
const TAGS   = ['VIP', 'Interessado', 'Hot', 'Frio', 'Pago', 'Lead']
const STAGES = ['Novo Lead', 'Qualificado', 'Proposta', 'Negociação', 'Fechado']
const VARS   = ['{{nome}}', '{{empresa}}', '{{telefone}}', '{{data_hoje}}']
const initCampaigns = [
  { id:'1', name:'Black Friday 2024',   status:'done',      recipients:1240, sent:1240, delivered:1198, read:892,  replied:143, date:'29/11/2024' },
  { id:'2', name:'Reativação de Leads', status:'paused',    recipients:380,  sent:215,  delivered:208,  read:156,  replied:28,  date:'15/01/2025' },
  { id:'3', name:'Boas-vindas Novos',   status:'sending',   recipients:542,  sent:310,  delivered:298,  read:187,  replied:42,  date:'30/05/2025' },
  { id:'4', name:'Promoção Janeiro',    status:'scheduled', recipients:890,  sent:0,    delivered:0,    read:0,    replied:0,   date:'05/06/2025' },
  { id:'5', name:'Pesquisa NPS Q1',     status:'draft',     recipients:0,    sent:0,    delivered:0,    read:0,    replied:0,   date:'—'          },
]
const KPI = [
  { Icon: Send,         label:'Total Enviadas',   value:'3.187', sub:'mensagens'          },
  { Icon: CheckCircle2, label:'Taxa de Entrega',  value:'96.8%', sub:'+2.1% vs mês ant.'  },
  { Icon: Eye,          label:'Taxa de Leitura',  value:'71.4%', sub:'acima da média'     },
  { Icon: MessageCircle,label:'Taxa de Resposta', value:'12.3%', sub:'conversas iniciadas' },
]
const S = {
  page:  { minHeight:'100vh', background:'#0F172A', fontFamily:'DM Sans,sans-serif', color:'#F8FAFC', padding:24 },
  card:  { background:'#1E293B', border:'1px solid #334155', borderRadius:12, padding:20 },
  input: { width:'100%', boxSizing:'border-box', background:'#0F172A', border:'1px solid #334155', borderRadius:8, padding:'8px 12px', color:'#F8FAFC', fontSize:13, outline:'none', fontFamily:'DM Sans,sans-serif' },
  label: { display:'block', fontSize:11, color:'#94A3B8', marginBottom:4, fontWeight:600, letterSpacing:'.04em', textTransform:'uppercase' },
  btn:   (bg, color='#F8FAFC', border='none') => ({ background:bg, color, border, borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif', whiteSpace:'nowrap' }),
  th:    { padding:'10px 14px', textAlign:'left', fontSize:10, color:'#64748B', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', borderBottom:'1px solid #334155' },
  td:    { padding:'11px 14px', fontSize:13, color:'#CBD5E1', borderBottom:'1px solid #1E293B' },
}

const CampaignModal = ({ onClose, onCreate }) => {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name:'', type:'text', message:'', mediaUrl:'', audience:'all', tags:[], stages:[], excludeTags:[], schedule:'now', date:'', time:'', interval:'3', businessHours:false })
  const msgRef = useRef(null)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const tog = (k, v) => set(k, form[k].includes(v) ? form[k].filter(x => x !== v) : [...form[k], v])
  const ins = v => { const el = msgRef.current; if (!el) return set('message', form.message + v); const s = el.selectionStart, e = el.selectionEnd; set('message', form.message.slice(0, s) + v + form.message.slice(e)) }
  const count = form.audience==='all' ? 1240 : form.audience==='tag' ? form.tags.length*180 : form.stages.length*240
  const Pill = ({ k, v, activeColor='#7C3AED' }) => { const on = form[k].includes(v); return <button onClick={() => tog(k, v)} style={{ ...S.btn(on ? activeColor : '#0F172A', on ? '#fff' : '#94A3B8', `1px solid ${on ? activeColor : '#334155'}`), fontSize:11, padding:'4px 10px' }}>{v}</button> }

  return (
    <div style={{ position:'fixed', inset:0, background:'#000a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }} onClick={onClose}>
      <div style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:16, width:560, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #334155', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <p style={{ fontSize:15, fontWeight:700, margin:'0 0 6px', display:'flex', alignItems:'center', gap:8 }}><Megaphone size={16} color="#7C3AED" /> Nova Campanha</p>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              {[1,2,3].map(s => <div key={s} style={{ width:s===step?20:8, height:8, borderRadius:4, background:s===step?'#7C3AED':s<step?'#059669':'#334155', transition:'all .2s' }} />)}
              <span style={{ fontSize:11, color:'#64748B', marginLeft:4 }}>Passo {step} de 3</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#64748B', cursor:'pointer', fontSize:22, lineHeight:1 }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
          {step === 1 && <>
            <div style={{ marginBottom:14 }}><label style={S.label}>Nome da campanha</label><input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Black Friday 2025" style={S.input} /></div>
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Tipo de mensagem</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={S.input}>
                {[['text','Texto'],['image','Imagem + texto'],['document','Documento'],['list','Lista interativa']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {(form.type==='image'||form.type==='document') && <div style={{ marginBottom:14 }}><label style={S.label}>URL da mídia</label><input value={form.mediaUrl} onChange={e => set('mediaUrl', e.target.value)} placeholder="https://..." style={S.input} /></div>}
            <div style={{ marginBottom:8 }}>
              <label style={S.label}>Mensagem <span style={{ color:'#475569', textTransform:'none', fontWeight:400 }}>{form.message.length}/1024 caracteres</span></label>
              <textarea ref={msgRef} value={form.message} onChange={e => set('message', e.target.value)} placeholder="Olá {{nome}}, temos algo especial para você! 🎉" rows={5} maxLength={1024} style={{ ...S.input, resize:'vertical' }} />
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {VARS.map(v => <button key={v} onClick={() => ins(v)} style={{ ...S.btn('#7C3AED22','#A78BFA','1px solid #7C3AED44'), fontSize:11, padding:'3px 8px' }}>{v}</button>)}
            </div>
          </>}

          {step === 2 && <>
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Audiência</label>
              {[['all','Todos os contatos'],['tag','Por tag'],['stage','Por etapa CRM'],['csv','Importar CSV']].map(([val,lbl]) => (
                <label key={val} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:form.audience===val?'#7C3AED22':'#0F172A', border:`1px solid ${form.audience===val?'#7C3AED55':'#334155'}`, borderRadius:8, marginBottom:6, cursor:'pointer', fontSize:13 }}>
                  <input type="radio" name="aud" value={val} checked={form.audience===val} onChange={() => set('audience', val)} style={{ accentColor:'#7C3AED' }} />{lbl}
                </label>
              ))}
            </div>
            {form.audience==='tag'   && <div style={{ marginBottom:12 }}><label style={S.label}>Selecionar tags</label><div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>{TAGS.map(t => <Pill key={t} k="tags" v={t} />)}</div></div>}
            {form.audience==='stage' && <div style={{ marginBottom:12 }}><label style={S.label}>Etapas CRM</label><div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>{STAGES.map(s => <Pill key={s} k="stages" v={s} />)}</div></div>}
            {form.audience==='csv'   && <div style={{ marginBottom:12 }}><label style={S.label}>Upload CSV (telefone, nome)</label><input type="file" accept=".csv" style={{ ...S.input, padding:'6px' }} /></div>}
            <div style={{ background:'#7C3AED18', border:'1px solid #7C3AED33', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
              <span style={{ color:'#A78BFA', fontWeight:700 }}>{count.toLocaleString('pt-BR')}</span>
              <span style={{ color:'#64748B', marginLeft:6 }}>contatos selecionados</span>
            </div>
            <div><label style={S.label}>Excluir contatos com tag</label><div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>{TAGS.map(t => <Pill key={t} k="excludeTags" v={t} activeColor="#EF4444" />)}</div></div>
          </>}

          {step === 3 && <>
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Quando enviar</label>
              {[['now','Enviar agora'],['later','Agendar data/hora']].map(([val,lbl]) => (
                <label key={val} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:form.schedule===val?'#7C3AED22':'#0F172A', border:`1px solid ${form.schedule===val?'#7C3AED55':'#334155'}`, borderRadius:8, marginBottom:6, cursor:'pointer', fontSize:13 }}>
                  <input type="radio" name="sched" value={val} checked={form.schedule===val} onChange={() => set('schedule', val)} style={{ accentColor:'#7C3AED' }} />{lbl}
                </label>
              ))}
            </div>
            {form.schedule==='later' && (
              <div style={{ display:'flex', gap:12, marginBottom:14 }}>
                <div style={{ flex:1 }}><label style={S.label}>Data</label><input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={S.input} /></div>
                <div style={{ flex:1 }}><label style={S.label}>Hora</label><input type="time" value={form.time} onChange={e => set('time', e.target.value)} style={S.input} /></div>
              </div>
            )}
            <div style={{ marginBottom:16 }}>
              <label style={S.label}>Intervalo entre mensagens</label>
              <select value={form.interval} onChange={e => set('interval', e.target.value)} style={S.input}>
                {[['1','1 segundo (risco alto)'],['3','3 segundos (recomendado)'],['5','5 segundos (seguro)'],['10','10 segundos (muito seguro)'],['30','30 segundos (máxima segurança)']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <p style={{ fontSize:11, color:'#64748B', marginTop:5, display:'flex', alignItems:'center', gap:5 }}><AlertTriangle size={12} /> Intervalos curtos podem gerar bloqueio temporário do número.</p>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
              <input type="checkbox" checked={form.businessHours} onChange={e => set('businessHours', e.target.checked)} style={{ accentColor:'#7C3AED', width:16, height:16 }} />
              <span style={{ color:'#CBD5E1' }}>Não enviar fora do horário comercial (8h–18h)</span>
            </label>
          </>}
        </div>

        <div style={{ padding:'14px 24px', borderTop:'1px solid #334155', display:'flex', justifyContent:'space-between' }}>
          <button onClick={step===1 ? onClose : () => setStep(s => s-1)} style={S.btn('#0F172A','#94A3B8','1px solid #334155')}>
            {step===1 ? 'Cancelar' : 'Voltar'}
          </button>
          <button onClick={step<3 ? () => setStep(s => s+1) : () => { onCreate(form); onClose() }} style={{ ...S.btn(step<3?'#7C3AED':'#059669'), display:'inline-flex', alignItems:'center', gap:6 }}>
            {step<3 ? 'Próximo' : <><Rocket size={15} /> Criar Campanha</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Campaigns() {
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState(initCampaigns)
  const [modal, setModal] = useState(false)

  const create = form => {
    const typeMap = { text:'Texto', image:'Imagem', document:'Documento', list:'Lista' }
    const c = { id:String(Date.now()), name:form.name||'Nova Campanha', status:form.schedule==='now'?'sending':'scheduled', recipients:0, sent:0, delivered:0, read:0, replied:0, date:form.schedule==='now'?new Date().toLocaleDateString('pt-BR'):form.date, type:typeMap[form.type] }
    setCampaigns(p => [c, ...p])
    logger.log(null, 'campaign_sent', { category: 'messages', description: 'Campanha criada: ' + c.name })
  }

  return (
    <div style={S.page}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <button onClick={() => navigate('/dashboard')} style={{ background:'none', border:'none', color:'#64748B', cursor:'pointer', padding:'4px 8px', lineHeight:1, display:'inline-flex', alignItems:'center' }}><ArrowLeft size={20} /></button>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 2px', display:'flex', alignItems:'center', gap:8 }}><Megaphone size={20} color="#7C3AED" /> Campanhas</h1>
            <p style={{ fontSize:12, color:'#64748B', margin:0 }}>Disparos em massa pelo WhatsApp</p>
          </div>
          <span style={{ background:'#7C3AED22', color:'#A78BFA', borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700 }}>{campaigns.length}</span>
        </div>
        <button onClick={() => setModal(true)} style={S.btn('#7C3AED')}>+ Nova Campanha</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        {KPI.map(k => (
          <div key={k.label} style={S.card}>
            <div style={{ marginBottom:8 }}><k.Icon size={22} color="#7C3AED" /></div>
            <p style={{ fontSize:26, fontWeight:800, margin:'0 0 2px' }}>{k.value}</p>
            <p style={{ fontSize:12, color:'#94A3B8', margin:'0 0 2px', fontWeight:600 }}>{k.label}</p>
            <p style={{ fontSize:10, color:'#475569', margin:0 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:780 }}>
            <thead>
              <tr>{['Status','Nome da Campanha','Destinatários','Enviadas','Entregues','Lidas','Respostas','Data de envio','Ações'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {campaigns.map(c => {
                const st = STATUS[c.status]
                return (
                  <tr key={c.id}>
                    <td style={S.td}>
                      <span style={{ background:st.bg, color:st.color, borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600, display:'inline-flex', alignItems:'center', gap:5 }}>
                        {st.pulse && <span style={{ width:6, height:6, borderRadius:'50%', background:st.color, display:'inline-block', animation:'pulse 1.5s ease-in-out infinite' }} />}
                        {st.label}
                      </span>
                    </td>
                    <td style={{ ...S.td, fontWeight:600, color:'#F8FAFC' }}>{c.name}</td>
                    <td style={S.td}>{c.recipients.toLocaleString('pt-BR')}</td>
                    <td style={S.td}>{c.sent.toLocaleString('pt-BR')}</td>
                    <td style={S.td}>{c.delivered.toLocaleString('pt-BR')}</td>
                    <td style={S.td}>{c.read.toLocaleString('pt-BR')}</td>
                    <td style={S.td}>{c.replied.toLocaleString('pt-BR')}</td>
                    <td style={{ ...S.td, color:'#64748B' }}>{c.date}</td>
                    <td style={S.td}>
                      <div style={{ display:'flex', gap:6 }}>
                        <button title="Exportar relatório (CSV)" onClick={() => exportCSV([{ Nome:c.name, Status:STATUS[c.status]?.label ?? c.status, Destinatários:c.recipients, Enviadas:c.sent, Entregues:c.delivered, Lidas:c.read, Respostas:c.replied, 'Data de envio':c.date }], `campanha-${c.name}`)} style={{ ...S.btn('#334155','#94A3B8'), padding:'6px 9px', display:'inline-flex', alignItems:'center' }}><Download size={15} /></button>
                        <button title="Duplicar" onClick={() => setCampaigns(p => [{ ...c, id:String(Date.now()), name:c.name+' (cópia)', status:'draft', sent:0, delivered:0, read:0, replied:0 }, ...p])} style={{ ...S.btn('#334155','#94A3B8'), padding:'6px 9px', display:'inline-flex', alignItems:'center' }}><Copy size={15} /></button>
                        <button title="Excluir" onClick={() => setCampaigns(p => p.filter(x => x.id!==c.id))} style={{ ...S.btn('#EF444415','#F87171','1px solid #EF444430'), padding:'6px 9px', display:'inline-flex', alignItems:'center' }}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <CampaignModal onClose={() => setModal(false)} onCreate={create} />}
    </div>
  )
}
