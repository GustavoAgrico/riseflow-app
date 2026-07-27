import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Megaphone, Send, Users, CheckCircle2, AlertTriangle, Rocket, Download, Copy, Trash2, Play, Pause, Loader2 } from 'lucide-react'
import { exportCSV } from '@utils/exportUtils'
import { logger } from '@services/activityLogger'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { CampaignService } from '@services/campaignService'

const STATUS = {
  draft:        { label: 'Rascunho',         color: '#6B7280', bg: '#6B728020' },
  scheduled:    { label: 'Agendada',         color: '#2563EB', bg: '#2563EB20' },
  sending:      { label: 'Enviando',         color: '#D97706', bg: '#D9770620', pulse: true },
  done:         { label: 'Concluída',        color: '#059669', bg: '#05966920' },
  paused:       { label: 'Pausada',          color: '#EF4444', bg: '#EF444420' },
  paused_limit: { label: 'Pausada (limite)', color: '#EF4444', bg: '#EF444420' },
  failed:       { label: 'Falhou',           color: '#D97706', bg: '#D9770620' },
}
const TAGS   = ['VIP', 'Interessado', 'Hot', 'Frio', 'Pago', 'Lead']
const STAGES = ['Novo Lead', 'Qualificado', 'Proposta', 'Negociação', 'Fechado']
// Os Pills de etapa usam o rótulo; clients.stage guarda o id. Mapa rótulo → id (mesmos ids do CRM/Funil).
const STAGE_ID = { 'Novo Lead': 'lead', 'Qualificado': 'qual', 'Proposta': 'prop', 'Negociação': 'neg', 'Fechado': 'closed' }
const VARS   = ['{{nome}}', '{{empresa}}', '{{telefone}}', '{{data_hoje}}']

const onlyDigits = s => String(s ?? '').replace(/\D/g, '')
const isValidEmail = s => /\S+@\S+\.\S+/.test(String(s ?? ''))

// Resolve a audiência (form + contatos do CRM + linhas de CSV) numa lista única de destinatários.
// Canal whatsapp deduplica/valida por telefone; canal email, por email.
const resolveRecipients = (form, contacts, csvRows) => {
  const byEmail = form.channel === 'email'
  let list = []
  if (form.audience === 'csv') list = csvRows.map(r => ({ name: r.name, company: '', phone: byEmail ? '' : r.dest, email: byEmail ? r.dest : '' }))
  else if (form.audience === 'tag') list = contacts.filter(c => (c.tags ?? []).some(t => form.tags.includes(t)))
  else if (form.audience === 'stage') {
    const ids = form.stages.map(s => STAGE_ID[s] ?? s)
    list = contacts.filter(c => ids.includes(c.stage))
  } else list = contacts // 'all'

  if (form.audience !== 'csv' && form.excludeTags?.length)
    list = list.filter(c => !(c.tags ?? []).some(t => form.excludeTags.includes(t)))

  const seen = new Set()
  return list
    .map(c => ({ phone: onlyDigits(c.phone), email: String(c.email ?? '').trim(), name: c.name ?? '', company: c.company ?? '' }))
    .filter(c => {
      const key = byEmail ? c.email.toLowerCase() : c.phone
      if (!key || (byEmail && !isValidEmail(c.email))) return false
      return !seen.has(key) && seen.add(key)
    })
}

// CSV simples: uma linha por contato — "telefone,nome" ou "email,nome" (vírgula ou ponto-e-vírgula).
// A 1ª coluna é o destino (telefone ou email, conforme o canal). Cabeçalho opcional é ignorado.
const parseCSV = (text) => String(text ?? '')
  .split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  .map(line => { const [a, b] = line.split(/[;,]/).map(s => (s ?? '').trim()); return { dest: a, name: b ?? '' } })
  .filter(r => /\d/.test(r.dest) || isValidEmail(r.dest))

const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') }
const S = {
  page:  { minHeight:'100vh', background:'#0F172A', fontFamily:'DM Sans,sans-serif', color:'#F8FAFC', padding:24 },
  card:  { background:'#1E293B', border:'1px solid #334155', borderRadius:12, padding:20 },
  input: { width:'100%', boxSizing:'border-box', background:'#0F172A', border:'1px solid #334155', borderRadius:8, padding:'8px 12px', color:'#F8FAFC', fontSize:13, outline:'none', fontFamily:'DM Sans,sans-serif' },
  label: { display:'block', fontSize:11, color:'#94A3B8', marginBottom:4, fontWeight:600, letterSpacing:'.04em', textTransform:'uppercase' },
  btn:   (bg, color='#F8FAFC', border='none') => ({ background:bg, color, border, borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif', whiteSpace:'nowrap' }),
  th:    { padding:'10px 14px', textAlign:'left', fontSize:10, color:'#64748B', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', borderBottom:'1px solid #334155' },
  td:    { padding:'11px 14px', fontSize:13, color:'#CBD5E1', borderBottom:'1px solid #1E293B' },
}

const CampaignModal = ({ onClose, onCreate, contacts, emailConnected }) => {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name:'', channel:'whatsapp', subject:'', type:'text', message:'', mediaUrl:'', audience:'all', tags:[], stages:[], excludeTags:[], schedule:'now', date:'', time:'', interval:'3', businessHours:false })
  const [csvRows, setCsvRows] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const msgRef = useRef(null)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const tog = (k, v) => set(k, form[k].includes(v) ? form[k].filter(x => x !== v) : [...form[k], v])
  const ins = v => { const el = msgRef.current; if (!el) return set('message', form.message + v); const s = el.selectionStart, e = el.selectionEnd; set('message', form.message.slice(0, s) + v + form.message.slice(e)) }
  const recipients = useMemo(() => resolveRecipients(form, contacts, csvRows), [form, contacts, csvRows])
  const count = recipients.length
  const onFile = e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setCsvRows(parseCSV(r.target.result)); r.readAsText(f) }
  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    try { await onCreate(form, recipients); onClose() }
    finally { setSubmitting(false) }
  }
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
              <label style={S.label}>Canal</label>
              <div style={{ display:'flex', gap:8 }}>
                {[['whatsapp','WhatsApp'],['email','Email (SMTP)']].map(([val,lbl]) => (
                  <button key={val} onClick={() => set('channel', val)} style={{ ...S.btn(form.channel===val?'#7C3AED':'#0F172A', form.channel===val?'#fff':'#94A3B8', `1px solid ${form.channel===val?'#7C3AED':'#334155'}`), flex:1 }}>{lbl}</button>
                ))}
              </div>
              {form.channel==='email' && !emailConnected && (
                <p style={{ fontSize:11, color:'#EAB308', marginTop:6, display:'flex', alignItems:'center', gap:5 }}><AlertTriangle size={12} /> Canal Email não conectado — configure o SMTP em Integrações antes de disparar.</p>
              )}
            </div>
            {form.channel==='email' && (
              <div style={{ marginBottom:14 }}><label style={S.label}>Assunto</label><input value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="Ex: {{nome}}, temos uma oferta pra você" style={S.input} /></div>
            )}
            {form.channel==='whatsapp' && <div style={{ marginBottom:14 }}>
              <label style={S.label}>Tipo de mensagem</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={S.input}>
                {[['text','Texto'],['image','Imagem + texto'],['document','Documento'],['list','Lista interativa']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>}
            {form.channel==='whatsapp' && (form.type==='image'||form.type==='document') && <div style={{ marginBottom:14 }}><label style={S.label}>URL da mídia</label><input value={form.mediaUrl} onChange={e => set('mediaUrl', e.target.value)} placeholder="https://..." style={S.input} /></div>}
            <div style={{ marginBottom:8 }}>
              <label style={S.label}>Mensagem <span style={{ color:'#475569', textTransform:'none', fontWeight:400 }}>{form.message.length}/1024 caracteres</span></label>
              <textarea ref={msgRef} value={form.message} onChange={e => set('message', e.target.value)} placeholder="Olá {{nome}}, temos algo especial para você! 🎉" rows={5} maxLength={1024} style={{ ...S.input, resize:'vertical' }} />
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {[...VARS, ...(form.channel==='email' ? ['{{email}}'] : [])].map(v => <button key={v} onClick={() => ins(v)} style={{ ...S.btn('#7C3AED22','#A78BFA','1px solid #7C3AED44'), fontSize:11, padding:'3px 8px' }}>{v}</button>)}
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
            {form.audience==='csv'   && <div style={{ marginBottom:12 }}><label style={S.label}>{form.channel==='email' ? 'Upload CSV (email, nome)' : 'Upload CSV (telefone, nome)'}</label><input type="file" accept=".csv,.txt" onChange={onFile} style={{ ...S.input, padding:'6px' }} />{csvRows.length > 0 && <p style={{ fontSize:11, color:'#059669', marginTop:6 }}>{csvRows.length} contato(s) lido(s) do arquivo.</p>}</div>}
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
          <button
            onClick={step<3 ? () => setStep(s => s+1) : submit}
            disabled={submitting || (step===3 && count===0)}
            title={step===3 && count===0 ? 'Nenhum destinatário selecionado' : undefined}
            style={{ ...S.btn(step<3?'#7C3AED':'#059669'), display:'inline-flex', alignItems:'center', gap:6, opacity:(submitting || (step===3 && count===0))?0.6:1, cursor:(submitting || (step===3 && count===0))?'not-allowed':'pointer' }}>
            {step<3 ? 'Próximo' : submitting ? <><Loader2 size={15} className="animate-spin" /> Criando...</> : <><Rocket size={15} /> Criar Campanha</>}
          </button>
        </div>
      </div>
    </div>
  )
}

const DEMO_CAMPAIGNS = [
  { id:'d1', name:'Black Friday (exemplo)', status:'done',    total:1240, sent:1240, delivered:0, read:0, replied:0, created_at:'2024-11-29' },
  { id:'d2', name:'Reativação (exemplo)',   status:'paused',  total:380,  sent:215,  delivered:0, read:0, replied:0, created_at:'2025-01-15' },
]

export function Campaigns() {
  const navigate = useNavigate()
  const { user, isDemoMode } = useAuth()
  const service = useMemo(() => new CampaignService(supabase), [])

  const [campaigns, setCampaigns] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [modal, setModal] = useState(false)
  const [emailConnected, setEmailConnected] = useState(false)

  const load = useCallback(async () => {
    if (!user || isDemoMode) return
    const [{ data: camps }, { data: cli }, { data: emailInt }] = await Promise.all([
      supabase.from('campaigns').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name,phone,email,company,tags,stage').eq('user_id', user.id),
      supabase.from('integrations').select('status').eq('user_id', user.id).eq('type', 'email').maybeSingle(),
    ])
    setCampaigns(camps ?? [])
    setContacts(cli ?? [])
    setEmailConnected(emailInt?.status === 'connected')
    setLoading(false)
  }, [user, isDemoMode])

  useEffect(() => {
    if (isDemoMode) { setCampaigns(DEMO_CAMPAIGNS); setLoading(false); return }
    load()
  }, [user, isDemoMode, load])

  // Enquanto houver campanha enviando, atualiza o progresso periodicamente.
  useEffect(() => {
    if (isDemoMode || !campaigns.some(c => c.status === 'sending')) return
    const iv = setInterval(load, 2500)
    return () => clearInterval(iv)
  }, [campaigns, isDemoMode, load])

  const create = async (form, recipients) => {
    if (isDemoMode) { window.alert('Modo demo: crie uma conta para enviar campanhas reais.'); return }
    if (!user || !recipients.length) { window.alert('Nenhum destinatário selecionado.'); return }

    const scheduledAt = form.schedule === 'later' && form.date
      ? new Date(`${form.date}T${form.time || '09:00'}`).toISOString() : null

    const isEmail = form.channel === 'email'
    const { data: camp, error } = await supabase.from('campaigns').insert({
      user_id: user.id,
      name: form.name?.trim() || 'Nova Campanha',
      channel: form.channel ?? 'whatsapp',
      subject: isEmail ? (form.subject?.trim() || form.name?.trim() || '') : null,
      message: form.message ?? '',
      media_url: form.mediaUrl ?? '',
      message_type: isEmail ? 'text' : (form.type ?? 'text'),
      audience_type: form.audience,
      audience_filter: { tags: form.tags, stages: form.stages, excludeTags: form.excludeTags },
      status: form.schedule === 'later' ? 'scheduled' : 'draft',
      scheduled_at: scheduledAt,
      interval_seconds: Number(form.interval) || 3,
      total: recipients.length,
    }).select().single()
    if (error) { window.alert('Erro ao criar campanha:\n' + error.message + '\n\n(Rode supabase/campaigns.sql se ainda não rodou.)'); return }

    const rows = recipients.map(r => ({ campaign_id: camp.id, contact_name: r.name, contact_company: r.company, phone: r.phone || null, email: r.email || null, status: 'pending' }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e2 } = await supabase.from('campaign_messages').insert(rows.slice(i, i + 500))
      if (e2) { window.alert('Erro ao gravar destinatários:\n' + e2.message); break }
    }

    logger.log(user.id, 'campaign_sent', { category: 'messages', description: 'Campanha criada: ' + camp.name })
    if (form.schedule !== 'later') await service.sendCampaign(camp.id)
    await load()
  }

  const sendNow  = async (c) => { setBusyId(c.id); try { await service.sendCampaign(c.id); await load() } finally { setBusyId(null) } }
  const pause    = async (c) => { setBusyId(c.id); try { await service.pauseCampaign(c.id); await load() } finally { setBusyId(null) } }
  const remove   = async (c) => { if (!window.confirm(`Excluir a campanha "${c.name}"?`)) return; await supabase.from('campaigns').delete().eq('id', c.id); await load() }
  const duplicate = async (c) => {
    const { data: copy } = await supabase.from('campaigns').insert({
      user_id: user.id, name: c.name + ' (cópia)', channel: c.channel ?? 'whatsapp', subject: c.subject,
      message: c.message, media_url: c.media_url,
      message_type: c.message_type, audience_type: c.audience_type, audience_filter: c.audience_filter,
      status: 'draft', interval_seconds: c.interval_seconds, total: c.total,
    }).select().single()
    if (copy) {
      const { data: msgs } = await supabase.from('campaign_messages').select('contact_name,contact_company,phone,email').eq('campaign_id', c.id)
      const rows = (msgs ?? []).map(m => ({ campaign_id: copy.id, contact_name: m.contact_name, contact_company: m.contact_company, phone: m.phone, email: m.email, status: 'pending' }))
      for (let i = 0; i < rows.length; i += 500) await supabase.from('campaign_messages').insert(rows.slice(i, i + 500))
    }
    await load()
  }

  const kpis = useMemo(() => {
    const totalSent = campaigns.reduce((a, c) => a + (c.sent || 0), 0)
    const totalRecipients = campaigns.reduce((a, c) => a + (c.total || 0), 0)
    const active = campaigns.filter(c => c.status === 'sending').length
    const done = campaigns.filter(c => c.status === 'done').length
    return [
      { Icon: Send,         label:'Total Enviadas', value: totalSent.toLocaleString('pt-BR'),       sub:'mensagens'  },
      { Icon: Users,        label:'Destinatários',  value: totalRecipients.toLocaleString('pt-BR'), sub:'na fila/enviados' },
      { Icon: Rocket,       label:'Ativas Agora',   value: String(active),                          sub:'enviando'   },
      { Icon: CheckCircle2, label:'Concluídas',     value: String(done),                            sub:'finalizadas' },
    ]
  }, [campaigns])

  return (
    <div style={S.page}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <button onClick={() => navigate('/dashboard')} style={{ background:'none', border:'none', color:'#64748B', cursor:'pointer', padding:'4px 8px', lineHeight:1, display:'inline-flex', alignItems:'center' }}><ArrowLeft size={20} /></button>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 2px', display:'flex', alignItems:'center', gap:8 }}><Megaphone size={20} color="#7C3AED" /> Campanhas</h1>
            <p style={{ fontSize:12, color:'#64748B', margin:0 }}>Disparos em massa por WhatsApp ou Email</p>
          </div>
          <span style={{ background:'#7C3AED22', color:'#A78BFA', borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700 }}>{campaigns.length}</span>
        </div>
        <button onClick={() => setModal(true)} style={S.btn('#7C3AED')}>+ Nova Campanha</button>
      </div>

      {isDemoMode && (
        <div style={{ ...S.card, marginBottom:16, borderColor:'#EAB30844', background:'#EAB30810', color:'#EAB308', fontSize:13 }}>
          Modo demo — campanhas abaixo são apenas exemplo. Crie uma conta para criar e disparar campanhas reais.
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        {kpis.map(k => (
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
              <tr>{['Status','Nome da Campanha','Destinatários','Enviadas','Entregues','Lidas','Respostas','Data','Ações'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ ...S.td, textAlign:'center', color:'#64748B', padding:'32px' }}><Loader2 size={18} className="animate-spin" style={{ display:'inline' }} /> Carregando…</td></tr>
              ) : campaigns.length === 0 ? (
                <tr><td colSpan={9} style={{ ...S.td, textAlign:'center', color:'#64748B', padding:'32px' }}>Nenhuma campanha ainda. Clique em <strong style={{ color:'#A78BFA' }}>+ Nova Campanha</strong> para começar.</td></tr>
              ) : campaigns.map(c => {
                const st = STATUS[c.status] ?? STATUS.draft
                const isBusy = busyId === c.id
                const canSend = ['draft','scheduled','paused','paused_limit','failed'].includes(c.status) && (c.sent || 0) < (c.total || 0)
                return (
                  <tr key={c.id}>
                    <td style={S.td}>
                      <span style={{ background:st.bg, color:st.color, borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600, display:'inline-flex', alignItems:'center', gap:5 }}>
                        {st.pulse && <span style={{ width:6, height:6, borderRadius:'50%', background:st.color, display:'inline-block', animation:'pulse 1.5s ease-in-out infinite' }} />}
                        {st.label}
                      </span>
                    </td>
                    <td style={{ ...S.td, fontWeight:600, color:'#F8FAFC' }}>
                      {c.name}
                      {c.channel === 'email' && <span style={{ marginLeft:8, background:'#2563EB22', color:'#60A5FA', borderRadius:5, padding:'2px 7px', fontSize:10, fontWeight:700, verticalAlign:'middle' }}>EMAIL</span>}
                    </td>
                    <td style={S.td}>{(c.total || 0).toLocaleString('pt-BR')}</td>
                    <td style={S.td}>{(c.sent || 0).toLocaleString('pt-BR')}</td>
                    <td style={S.td}>{(c.delivered || 0).toLocaleString('pt-BR')}</td>
                    <td style={S.td}>{(c.read || 0).toLocaleString('pt-BR')}</td>
                    <td style={S.td}>{(c.replied || 0).toLocaleString('pt-BR')}</td>
                    <td style={{ ...S.td, color:'#64748B' }}>{fmtDate(c.scheduled_at || c.created_at)}</td>
                    <td style={S.td}>
                      <div style={{ display:'flex', gap:6 }}>
                        {!isDemoMode && c.status === 'sending' && (
                          <button title="Pausar" onClick={() => pause(c)} disabled={isBusy} style={{ ...S.btn('#EF444415','#F87171','1px solid #EF444430'), padding:'6px 9px', display:'inline-flex', alignItems:'center', opacity:isBusy?0.5:1 }}><Pause size={15} /></button>
                        )}
                        {!isDemoMode && canSend && (
                          <button title="Enviar agora" onClick={() => sendNow(c)} disabled={isBusy} style={{ ...S.btn('#05966915','#34D399','1px solid #05966930'), padding:'6px 9px', display:'inline-flex', alignItems:'center', opacity:isBusy?0.5:1 }}>{isBusy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}</button>
                        )}
                        <button title="Exportar relatório (CSV)" onClick={() => exportCSV([{ Nome:c.name, Status:st.label, Destinatários:c.total||0, Enviadas:c.sent||0, Entregues:c.delivered||0, Lidas:c.read||0, Respostas:c.replied||0, Data:fmtDate(c.scheduled_at || c.created_at) }], `campanha-${c.name}`)} style={{ ...S.btn('#334155','#94A3B8'), padding:'6px 9px', display:'inline-flex', alignItems:'center' }}><Download size={15} /></button>
                        {!isDemoMode && <button title="Duplicar" onClick={() => duplicate(c)} style={{ ...S.btn('#334155','#94A3B8'), padding:'6px 9px', display:'inline-flex', alignItems:'center' }}><Copy size={15} /></button>}
                        {!isDemoMode && <button title="Excluir" onClick={() => remove(c)} style={{ ...S.btn('#EF444415','#F87171','1px solid #EF444430'), padding:'6px 9px', display:'inline-flex', alignItems:'center' }}><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <CampaignModal onClose={() => setModal(false)} onCreate={create} contacts={contacts} emailConnected={emailConnected} />}
    </div>
  )
}
