import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Bot, PhoneCall, Loader2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import api from '@services/api'
import { useAuth } from '@context/AuthContext'

// Ligação por IA (ElevenLabs + Twilio) no detalhe do lead. O servidor dispara a
// chamada e, ao fim, qualifica a transcrição; aqui só acompanhamos por polling.
const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', pur: '#7C3AED' }
const ACTIVE = ['queued', 'dialing', 'initiated', 'in-progress', 'processing']
const STATUS = { queued: 'Na fila', dialing: 'Discando…', initiated: 'Chamando…', 'in-progress': 'Em ligação', processing: 'Processando', done: 'Concluída', failed: 'Falhou', canceled: 'Cancelada' }
const RESULT = { answered: 'atendeu', voicemail: 'caixa postal', busy: 'ocupado', no_answer: 'não atendeu', failed: 'falhou' }
const TEMP = { hot: ['Quente', '#FF6B35'], warm: ['Morno', '#EAB308'], cold: ['Frio', '#38BDF8'] }
const POLL_MS = 5000
const POLL_LIMIT_MS = 20 * 60000

const errMsg = e => e?.response?.data?.error || e?.message || 'Erro inesperado'
const dur = s => (s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
const when = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const isPending = c => ACTIVE.includes(c.status) || (c.status === 'done' && c.score == null && !c.error)

export const AiCallPanel = ({ clientId, phone, onQualified }) => {
  const { isDemoMode } = useAuth()
  const [calls, setCalls] = useState([])
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null)
  const pollStart = useRef(Date.now())

  const load = useCallback(async () => {
    if (isDemoMode || !clientId) return
    try {
      const { data } = await api.get('/ai-calls', { params: { client_id: clientId } })
      setCalls(data || [])
    } catch { /* tabela ainda não criada ou servidor sem configuração: o botão mostra o erro ao tentar */ }
  }, [clientId, isDemoMode])
  useEffect(() => { load() }, [load])

  const pendingKey = calls.filter(isPending).map(c => c.id).join(',')
  useEffect(() => {
    if (!pendingKey) return
    const ids = pendingKey.split(',')
    const t = setInterval(async () => {
      if (Date.now() - pollStart.current > POLL_LIMIT_MS) return
      for (const id of ids) {
        try {
          const { data } = await api.post(`/ai-calls/${id}/refresh`)
          setCalls(list => list.map(x => (x.id === data.id ? data : x)))
          if (data.score != null) onQualified?.()
        } catch { /* tenta de novo no próximo ciclo */ }
      }
    }, POLL_MS)
    return () => clearInterval(t)
  }, [pendingKey, onQualified])

  const start = async () => {
    setBusy(true); setErr('')
    try {
      const { data } = await api.post('/ai-calls', { client_id: clientId })
      pollStart.current = Date.now()
      setCalls(list => [data, ...list])
      setConfirm(false)
    } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }

  const calling = calls.some(c => ACTIVE.includes(c.status))
  const disabled = !phone || isDemoMode || busy || calling
  const box = { background: C.card, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 16, color: C.tx, fontFamily: 'DM Sans,sans-serif', marginTop: 14 }
  const btn = (bg, color = '#fff') => ({ background: bg, color, border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 })

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Bot size={16} color={C.pur} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, flex: 1 }}>Ligação com IA</p>
        {!confirm && (
          <button onClick={() => setConfirm(true)} disabled={disabled} style={{ ...btn(C.pur), opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
            {calling ? <Loader2 size={13} className="animate-spin" /> : <PhoneCall size={13} />} {calling ? 'Na fila / em ligação' : 'Ligar com IA'}
          </button>
        )}
      </div>

      {!phone && <p style={{ margin: '0 0 8px', fontSize: 12, color: C.mut }}>Cadastre um telefone para a IA poder ligar.</p>}
      {isDemoMode && <p style={{ margin: '0 0 8px', fontSize: 12, color: C.mut }}>Indisponível no modo demo.</p>}

      {confirm && (
        <div style={{ background: C.pur + '14', border: `1px solid ${C.pur}55`, borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.45 }}>
            A assistente virtual vai ligar agora para <b>{phone}</b> e fazer as perguntas de qualificação do seu nicho. Ligue só para quem autorizou o contato.
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={start} disabled={busy} style={btn(C.pur)}>{busy ? <Loader2 size={13} className="animate-spin" /> : <PhoneCall size={13} />} Confirmar ligação</button>
            <button onClick={() => setConfirm(false)} disabled={busy} style={{ ...btn('transparent', C.mut), border: `1px solid ${C.bd}` }}>Cancelar</button>
          </div>
        </div>
      )}

      {err && <p style={{ margin: '0 0 8px', fontSize: 12, color: '#F87171' }}>{err}</p>}

      {calls.length === 0 && !confirm && phone && !isDemoMode && (
        <p style={{ margin: 0, fontSize: 12, color: C.mut }}>A IA liga, faz as perguntas do nicho e qualifica o lead com base na conversa.</p>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {calls.map(c => {
          const tp = TEMP[c.temperature]
          const active = ACTIVE.includes(c.status)
          const expanded = open === c.id
          return (
            <div key={c.id} style={{ background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '9px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: c.status === 'failed' ? '#F87171' : c.status === 'canceled' ? C.mut : active ? C.pur : '#10B981' }}>
                  {active && <Loader2 size={11} className="animate-spin" />}{STATUS[c.status] || c.status}
                </span>
                <span style={{ color: C.mut }}>· {when(c.created_at)}</span>
                {c.call_result && <span style={{ color: C.mut }}>· {RESULT[c.call_result] || c.call_result}</span>}
                {c.duration_secs != null && <span style={{ color: C.mut }}>· {dur(c.duration_secs)}</span>}
                {c.score != null && (
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    {tp && <span style={{ background: tp[1] + '22', color: tp[1], borderRadius: 6, padding: '1px 7px', fontWeight: 700 }}>{tp[0]}</span>}
                    <span style={{ fontWeight: 800, color: C.tx }}>{c.score}</span>
                  </span>
                )}
              </div>
              {c.summary && <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.45 }}>{c.summary}</p>}
              {c.error && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#EAB308', display: 'flex', gap: 5, alignItems: 'flex-start' }}><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{c.error}</p>}
              {c.transcript?.length > 0 && (
                <button onClick={() => setOpen(expanded ? null : c.id)} style={{ ...btn('transparent', C.mut), padding: '6px 0 0', fontWeight: 600 }}>
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {expanded ? 'Ocultar transcrição' : 'Ver transcrição'}
                </button>
              )}
              {expanded && (
                <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 4 }}>
                  {c.transcript.map((t, i) => (
                    <p key={i} style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>
                      <b style={{ color: t.role === 'agent' ? C.pur : '#10B981' }}>{t.role === 'agent' ? 'IA' : 'Lead'}:</b> {t.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
