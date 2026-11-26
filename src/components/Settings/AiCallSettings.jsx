import React, { useState, useEffect, useCallback, useRef } from 'react'
import { PhoneCall, Loader2, CheckCircle2, AlertTriangle, Copy, Check, ChevronDown, ChevronUp, RefreshCw, ExternalLink, KeyRound } from 'lucide-react'
import api from '@services/api'
import { useAuth } from '@context/AuthContext'

// Configurações → Ligações com IA. A chave da ElevenLabs vai para o servidor, que
// guarda cifrada e nunca a devolve: a tela só sabe se existe e os 4 últimos caracteres.
const FIRST_MESSAGE = 'Olá, {{lead_name}}? Aqui é a Clara, assistente virtual da {{business_name}}. Você tem dois minutinhos para conversarmos?'
const SYSTEM_PROMPT = `Você é Clara, assistente virtual da {{business_name}}, ligando para {{lead_name}} da empresa {{lead_company}}.
Nicho atendido: {{niche}}. Cliente ideal: {{ideal_customer}}.

Objetivo: entender se a pessoa tem interesse e perfil para uma conversa com um consultor.

Regras:
- Fale português do Brasil, de forma simpática, curta e natural. Uma pergunta por vez.
- Se perguntarem, confirme que você é uma assistente virtual.
- Se a pessoa não puder falar agora, pergunte o melhor horário e encerre.
- Se não tiver interesse ou pedir para não ligar mais, agradeça, diga que não vai ligar de novo e encerre.
- Faça estas perguntas de qualificação, adaptando à conversa: {{questions}}
- Se a lista de perguntas estiver vazia, pergunte: qual o principal desafio hoje, quem decide a compra e para quando precisam resolver.
- Nunca prometa preço, desconto ou prazo. Não peça CPF, cartão ou senha.
- No fim, diga que um consultor vai entrar em contato, agradeça e encerre a ligação.
- Se cair na caixa postal, encerre sem deixar recado.`

const ACTIVE = ['queued', 'dialing', 'initiated', 'in-progress', 'processing']
const STATUS = { queued: 'Na fila', dialing: 'Discando…', initiated: 'Chamando…', 'in-progress': 'Em ligação', processing: 'Processando', done: 'Concluída', failed: 'Falhou', canceled: 'Cancelada' }
const RESULT = { answered: 'atendeu', voicemail: 'caixa postal', busy: 'ocupado', no_answer: 'não atendeu', failed: 'falhou' }
const DAYS = [['1-5', 'Segunda a sexta'], ['1-6', 'Segunda a sábado'], ['0-6', 'Todos os dias']]

const errMsg = e => e?.response?.data?.error || e?.message || 'Erro inesperado'
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, outline: 'none', color: 'var(--ink-1)', background: 'var(--card)', fontFamily: 'inherit' }
const label = { display: 'block', fontSize: 12, color: 'var(--ink-2)', marginBottom: 6, fontWeight: 600 }
const hint = { margin: '5px 0 0', fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.45 }
const btn = (bg, color = '#fff') => ({ background: bg, color, border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7 })
const ghost = { ...btn('transparent', 'var(--ink-2)'), border: '1px solid var(--border)' }
const card = { border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--surface-1)', marginBottom: 16 }
const chip = (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color, background: color + '1A', borderRadius: 999, padding: '3px 10px' })

const CopyBox = ({ title, text }) => {
  const [ok, setOk] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* sem permissão de cópia */ } }
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{title}</span>
        <button type="button" onClick={copy} style={{ ...ghost, padding: '4px 10px', fontSize: 12, marginLeft: 'auto' }}>{ok ? <Check size={13} /> : <Copy size={13} />}{ok ? 'Copiado' : 'Copiar'}</button>
      </div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, maxHeight: 220, overflowY: 'auto', fontFamily: 'ui-monospace, monospace' }}>{text}</pre>
    </div>
  )
}

export const AiCallSettings = () => {
  const { isDemoMode } = useAuth()
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(null)
  const [form, setForm] = useState({ agentId: '', phoneNumberId: '', businessName: '', callDays: '1-5', callStart: '09:00', callEnd: '18:00', testNumbers: '', enabled: true })
  const [newKey, setNewKey] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [res, setRes] = useState(null)
  const [resLoading, setResLoading] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testCall, setTestCall] = useState(null)
  const [testing, setTesting] = useState(false)
  const pollStart = useRef(0)

  const applyView = (v) => {
    setView(v)
    setForm({ agentId: v.agentId || '', phoneNumberId: v.phoneNumberId || '', businessName: v.businessName || '', callDays: v.callDays || '1-5', callStart: v.callStart || '09:00', callEnd: v.callEnd || '18:00', testNumbers: v.testNumbers || '', enabled: v.enabled !== false })
    if (!testPhone && v.testNumbers) setTestPhone(v.testNumbers.split(',')[0].trim())
    setGuideOpen(g => g || !v.configured)
  }

  const load = useCallback(async () => {
    if (isDemoMode) { setLoading(false); return }
    try { const { data } = await api.get('/ai-call-settings'); applyView(data) }
    catch (e) { setMsg({ ok: false, text: errMsg(e) }) }
    setLoading(false)
  }, [isDemoMode]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async (extra = {}) => {
    setSaving(true); setMsg(null)
    try {
      const body = { ...form, ...extra }
      if (newKey.trim()) body.apiKey = newKey.trim()
      const { data } = await api.put('/ai-call-settings', body)
      applyView(data)
      setNewKey(''); setEditingKey(false)
      setMsg({ ok: true, text: 'Configuração salva.' })
    } catch (e) { setMsg({ ok: false, text: errMsg(e) }) }
    setSaving(false)
  }

  const loadResources = async () => {
    setResLoading(true); setMsg(null)
    try { const { data } = await api.get('/ai-call-settings/resources', { timeout: 30000 }); setRes(data) }
    catch (e) { setMsg({ ok: false, text: errMsg(e) }) }
    setResLoading(false)
  }

  const startTest = async () => {
    setTesting(true); setMsg(null); setTestCall(null)
    try {
      const { data } = await api.post('/ai-call-settings/test', { phone: testPhone }, { timeout: 30000 })
      pollStart.current = Date.now()
      setTestCall(data)
    } catch (e) { setMsg({ ok: false, text: errMsg(e) }) }
    setTesting(false)
  }

  const testPending = testCall && (ACTIVE.includes(testCall.status) || (testCall.status === 'done' && !testCall.summary && !testCall.error))
  useEffect(() => {
    if (!testPending) return
    const t = setInterval(async () => {
      if (Date.now() - pollStart.current > 10 * 60000) return
      try { const { data } = await api.post(`/ai-calls/${testCall.id}/refresh`); setTestCall(data) } catch { /* tenta de novo */ }
    }, 5000)
    return () => clearInterval(t)
  }, [testPending, testCall?.id])

  if (isDemoMode) return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Indisponível no modo demo.</p>
  if (loading) return <p style={{ fontSize: 13, color: 'var(--ink-3)', display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={15} className="animate-spin" /> Carregando…</p>

  const configured = view?.configured
  const showKeyInput = !view?.apiKeySet || editingKey

  return (
    <div style={{ color: 'var(--ink-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Ligações com IA</h2>
        {configured
          ? <span style={chip('#10B981')}><CheckCircle2 size={13} /> Pronto para ligar</span>
          : <span style={chip('#EAB308')}><AlertTriangle size={13} /> Configuração incompleta</span>}
        {view && !view.enabled && <span style={chip('#94A3B8')}>Desativadas</span>}
      </div>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        A assistente virtual liga para o lead, faz as perguntas do seu nicho e qualifica a conversa. Usa a sua conta da ElevenLabs com um número do Twilio; as ligações são cobradas por minuto por esses serviços.
      </p>

      {msg && (
        <p style={{ margin: '0 0 16px', padding: '10px 14px', borderRadius: 10, fontSize: 13, background: (msg.ok ? '#10B981' : '#EF4444') + '18', border: `1px solid ${(msg.ok ? '#10B981' : '#EF4444')}55`, color: msg.ok ? '#34D399' : '#F87171' }}>{msg.text}</p>
      )}

      {/* ── Guia ── */}
      <div style={card}>
        <button type="button" onClick={() => setGuideOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--ink-1)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8, width: '100%', fontFamily: 'inherit', fontSize: 14, fontWeight: 700 }}>
          Como configurar (4 passos) {guideOpen ? <ChevronUp size={16} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={16} style={{ marginLeft: 'auto' }} />}
        </button>
        {guideOpen && (
          <ol style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            <li style={{ marginBottom: 10 }}>
              <b>Twilio:</b> crie a conta, compre um número com voz, libere ligações para o Brasil em <i>Voice → Settings → Geo permissions</i> e crie uma <i>API Key</i> (guarde o SID e o Secret). Em conta trial, verifique o número que vai receber o teste.{' '}
              <a href="https://console.twilio.com" target="_blank" rel="noreferrer" style={{ color: '#FF6B35' }}>Abrir Twilio <ExternalLink size={11} /></a>
            </li>
            <li style={{ marginBottom: 10 }}>
              <b>ElevenLabs – agente:</b> crie um agente em <i>Agents Platform</i>, idioma Português, voz pt-BR, ative a ferramenta <i>End call</i> e cole a mensagem inicial e o roteiro abaixo.{' '}
              <a href="https://elevenlabs.io/app/agents" target="_blank" rel="noreferrer" style={{ color: '#FF6B35' }}>Abrir ElevenLabs <ExternalLink size={11} /></a>
              <CopyBox title="Mensagem inicial (First message)" text={FIRST_MESSAGE} />
              <CopyBox title="Roteiro (System prompt)" text={SYSTEM_PROMPT} />
            </li>
            <li style={{ marginBottom: 10 }}>
              <b>ElevenLabs – número:</b> em <i>Phone Numbers → Import number → Twilio</i>, informe o número e a API Key do Twilio (SID + Secret) e atribua o número ao agente.
            </li>
            <li>
              <b>Aqui:</b> cole a chave da API da ElevenLabs (<i>Developers → API Keys</i>), salve, clique em <i>Buscar na ElevenLabs</i> para escolher agente e número e faça uma ligação de teste.
            </li>
          </ol>
        )}
      </div>

      {/* ── Conta ElevenLabs ── */}
      <div style={card}>
        <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>Conta ElevenLabs</p>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>Chave da API</label>
          {showKeyInput ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="password" autoComplete="off" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="sk_…" style={{ ...input, flex: 1 }} />
              {view?.apiKeySet && <button type="button" onClick={() => { setEditingKey(false); setNewKey('') }} style={ghost}>Cancelar</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={chip('#10B981')}><KeyRound size={13} /> Chave salva {view.apiKeyHint}</span>
              <button type="button" onClick={() => setEditingKey(true)} style={{ ...ghost, padding: '5px 10px', fontSize: 12 }}>Trocar</button>
              <button type="button" onClick={() => save({ clearApiKey: true })} disabled={saving} style={{ ...ghost, padding: '5px 10px', fontSize: 12, color: '#F87171' }}>Remover</button>
            </div>
          )}
          <p style={hint}>Fica guardada no servidor{view?.encrypted ? ', cifrada,' : ''} e nunca volta para o navegador.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={loadResources} disabled={!view?.apiKeySet || resLoading} style={{ ...ghost, opacity: (!view?.apiKeySet || resLoading) ? 0.5 : 1 }}>
            {resLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Buscar na ElevenLabs
          </button>
          {!view?.apiKeySet && <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Salve a chave para buscar agentes e números.</span>}
        </div>
        {res?.errors?.length > 0 && <p style={{ ...hint, color: '#EAB308', marginBottom: 10 }}>{res.errors.join(' · ')}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label style={label}>Agente</label>
            {res?.agents?.length ? (
              <select value={form.agentId} onChange={e => set('agentId', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                <option value="">Escolha o agente…</option>
                {res.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            ) : (
              <input value={form.agentId} onChange={e => set('agentId', e.target.value)} placeholder="ID do agente" style={input} />
            )}
          </div>
          <div>
            <label style={label}>Número de saída</label>
            {res?.numbers?.length ? (
              <select value={form.phoneNumberId} onChange={e => set('phoneNumberId', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                <option value="">Escolha o número…</option>
                {res.numbers.map(n => <option key={n.id} value={n.id}>{n.number}{n.label ? ` · ${n.label}` : ''}{n.agentName ? ` → ${n.agentName}` : ''}</option>)}
              </select>
            ) : (
              <input value={form.phoneNumberId} onChange={e => set('phoneNumberId', e.target.value)} placeholder="ID do número importado" style={input} />
            )}
          </div>
        </div>
      </div>

      {/* ── Como a IA liga ── */}
      <div style={card}>
        <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>Como a IA liga</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label}>Nome da empresa</label>
            <input value={form.businessName} onChange={e => set('businessName', e.target.value)} placeholder="Como a assistente apresenta a empresa" style={input} />
          </div>
          <div>
            <label style={label}>Dias</label>
            <select value={form.callDays} onChange={e => set('callDays', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {DAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Das</label>
            <input type="time" value={form.callStart} onChange={e => set('callStart', e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>Até</label>
            <input type="time" value={form.callEnd} onChange={e => set('callEnd', e.target.value)} style={input} />
          </div>
        </div>
        <p style={hint}>Horário de Brasília. A fila só liga dentro dessa janela; o botão "Ligar com IA" do lead liga na hora.</p>

        <div style={{ marginTop: 14 }}>
          <label style={label}>Números de teste</label>
          <input value={form.testNumbers} onChange={e => set('testNumbers', e.target.value)} placeholder="+5524999999999, +5511988887777" style={input} />
          <p style={hint}>Com números aqui, a IA <b>só</b> liga para eles (modo teste). Deixe vazio para ligar para qualquer lead.</p>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#FF6B35' }} />
          Ligações com IA ativadas
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button type="button" onClick={() => save()} disabled={saving} style={{ ...btn('#FF6B35'), opacity: saving ? 0.6 : 1 }}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar configuração
        </button>
      </div>

      {/* ── Teste ── */}
      <div style={card}>
        <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700 }}>Ligação de teste</p>
        <p style={{ ...hint, margin: '0 0 12px' }}>Liga agora para o número informado com dados de exemplo. Use um número seu.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+55DDDNÚMERO" style={{ ...input, flex: '1 1 200px', width: 'auto' }} />
          <button type="button" onClick={startTest} disabled={!configured || testing || !testPhone.trim() || testPending}
            style={{ ...btn('#7C3AED'), opacity: (!configured || testing || !testPhone.trim() || testPending) ? 0.5 : 1 }}>
            {testing || testPending ? <Loader2 size={15} className="animate-spin" /> : <PhoneCall size={15} />} Ligar agora
          </button>
        </div>
        {!configured && <p style={{ ...hint, color: '#EAB308' }}>Salve a chave, o agente e o número antes de testar.</p>}
        {testCall && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 13 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>
              {STATUS[testCall.status] || testCall.status}
              {testCall.call_result ? ` · ${RESULT[testCall.call_result] || testCall.call_result}` : ''}
              {testCall.duration_secs != null ? ` · ${testCall.duration_secs}s` : ''}
              {testCall.cost_usd != null ? ` · US$ ${Number(testCall.cost_usd).toFixed(2)}` : ''}
            </p>
            {testCall.summary && <p style={{ margin: '6px 0 0', color: 'var(--ink-2)' }}>{testCall.summary}</p>}
            {testCall.error && <p style={{ margin: '6px 0 0', color: '#EAB308' }}>{testCall.error}</p>}
            {testCall.transcript?.length > 0 && (
              <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', display: 'grid', gap: 4 }}>
                {testCall.transcript.map((t, i) => (
                  <p key={i} style={{ margin: 0, fontSize: 12 }}><b style={{ color: t.role === 'agent' ? '#A78BFA' : '#34D399' }}>{t.role === 'agent' ? 'IA' : 'Você'}:</b> {t.message}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
