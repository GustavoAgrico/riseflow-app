import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Loader2, MapPin, Star, PhoneCall, Download, ExternalLink, CheckSquare, Square, AlertTriangle } from 'lucide-react'
import { Layout } from '@components/Layout/Layout'
import api from '@services/api'
import { useAuth } from '@context/AuthContext'

// Prospecção com IA: busca empresas no Google Maps (servidor → Apify), importa os
// escolhidos para o CRM e, se pedido, coloca na fila de ligações da IA (ElevenLabs).
// A busca é sem custo: o servidor limita cada busca ao crédito grátis mensal do Apify.
const ACTIVE = ['queued', 'dialing', 'initiated', 'in-progress', 'processing']
const STATUS = { queued: 'Na fila', dialing: 'Discando…', initiated: 'Chamando…', 'in-progress': 'Em ligação', processing: 'Processando', done: 'Concluída', failed: 'Falhou', canceled: 'Cancelada' }
const RESULT = { answered: 'atendeu', voicemail: 'caixa postal', busy: 'ocupado', no_answer: 'não atendeu', failed: 'falhou' }
const TEMP = { hot: ['Quente', '#FF6B35'], warm: ['Morno', '#EAB308'], cold: ['Frio', '#38BDF8'] }

const errMsg = e => e?.response?.data?.error || (e?.code === 'ECONNABORTED' ? 'A busca demorou demais. Tente com menos resultados.' : e?.message) || 'Erro inesperado'
const usd = v => 'US$ ' + v.toFixed(2).replace('.', ',')
const when = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const day = t => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const keyOf = (p, i) => p.placeId || `${p.name}-${i}`
const selectable = p => Boolean(p.phone) && !p.inCrm

const input = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, outline: 'none', color: 'var(--ink-1)', background: 'var(--card)', fontFamily: 'inherit' }
const label = { display: 'block', fontSize: 11, color: 'var(--ink-3)', marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }
const btn = (bg, color = '#fff') => ({ background: bg, color, border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7 })
const chip = (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color, background: color + '1A', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' })
const th = { padding: '0 10px 10px', fontSize: 11, color: 'var(--ink-4)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }
const td = { padding: '10px', borderTop: '1px solid var(--border)', fontSize: 13, verticalAlign: 'middle' }

export const Prospecting = () => {
  const { isDemoMode } = useAuth()
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('São Paulo, Brasil')
  const [max, setMax] = useState(20)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [sel, setSel] = useState(() => new Set())
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [importing, setImporting] = useState(false)
  const [confirmCall, setConfirmCall] = useState(false)
  const [queue, setQueue] = useState([])
  const [credit, setCredit] = useState(null)

  const loadQueue = useCallback(async () => {
    if (isDemoMode) return
    try { const { data } = await api.get('/prospecting/queue'); setQueue(data || []) } catch { /* tabela ainda não criada */ }
  }, [isDemoMode])
  const loadCredit = useCallback(async () => {
    if (isDemoMode) return
    try { const { data } = await api.get('/prospecting/credit'); setCredit(data) } catch { setCredit(null) }
  }, [isDemoMode])
  useEffect(() => { loadQueue(); loadCredit() }, [loadQueue, loadCredit])

  const queueActive = queue.some(c => ACTIVE.includes(c.status) || (c.status === 'done' && c.score == null && !c.error))
  useEffect(() => {
    if (!queueActive) return
    const t = setInterval(loadQueue, 10000)
    return () => clearInterval(t)
  }, [queueActive, loadQueue])

  const search = async (e) => {
    e?.preventDefault()
    if (!query.trim() || !location.trim() || searching) return
    setSearching(true); setErr(''); setNotice(''); setResults(null); setConfirmCall(false)
    try {
      const { data } = await api.post('/prospecting/search', { query, location, max }, { timeout: 300000 })
      const list = data?.results || []
      setResults(list)
      setSel(new Set(list.map((p, i) => (selectable(p) ? keyOf(p, i) : null)).filter(Boolean)))
      if (data?.credit) setCredit(data.credit)
      if (data?.allowed < data?.requested) setNotice(`A busca foi limitada a ${data.allowed} empresas para caber no crédito grátis do mês.`)
    } catch (e2) {
      setErr(errMsg(e2))
      if (e2?.response?.data?.credit) setCredit(e2.response.data.credit)
    }
    setSearching(false)
  }

  const toggle = (k) => setSel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const valid = (results || []).map((p, i) => [p, keyOf(p, i)]).filter(([p]) => selectable(p))
  const allOn = valid.length > 0 && valid.every(([, k]) => sel.has(k))
  const toggleAll = () => setSel(allOn ? new Set() : new Set(valid.map(([, k]) => k)))
  const chosen = (results || []).filter((p, i) => sel.has(keyOf(p, i)) && selectable(p))

  const importLeads = async (call) => {
    if (!chosen.length || importing) return
    setImporting(true); setErr(''); setNotice('')
    try {
      const { data } = await api.post('/prospecting/import', { leads: chosen, call }, { timeout: 60000 })
      const parts = [`${data.imported} importado${data.imported !== 1 ? 's' : ''} para o CRM`]
      if (data.skipped) parts.push(`${data.skipped} já existia${data.skipped !== 1 ? 'm' : ''}`)
      if (call) parts.push(`${data.queued} na fila de ligações`)
      if (data.notQueued) parts.push(`${data.notQueued} fora da fila (modo teste)`)
      setNotice(parts.join(' · ') + '.')
      const done = new Set(chosen.map(p => p.phone))
      setResults(list => list.map(p => (done.has(p.phone) ? { ...p, inCrm: true } : p)))
      setSel(new Set())
      setConfirmCall(false)
      loadQueue()
    } catch (e) { setErr(errMsg(e)) }
    setImporting(false)
  }

  const cancel = async (id) => {
    try { await api.post(`/prospecting/queue/${id}/cancel`); loadQueue() } catch (e) { setErr(errMsg(e)) }
  }

  const noCredit = Boolean(credit) && credit.maxPlaces < 5
  const withPhone = (results || []).filter(p => p.phone).length
  const inCrm = (results || []).filter(p => p.inCrm).length

  return (
    <Layout title="Prospecção com IA" subtitle="Encontre empresas no Google Maps, traga para o CRM e deixe a IA ligar e qualificar">
      {isDemoMode && (
        <p style={{ margin: '0 0 16px', padding: '10px 14px', background: '#7C3AED22', border: '1px solid #7C3AED55', borderRadius: 10, color: '#C4B5FD', fontSize: 13 }}>
          Indisponível no modo demo.
        </p>
      )}

      {/* ── Busca ── */}
      <form onSubmit={search} className="rf-panel" style={{ padding: 20, marginBottom: 20 }}>
        <h3 className="rf-section-title" style={{ marginBottom: 14 }}>Buscar leads</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={label}>O que buscar</label>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="clínica odontológica" style={input} />
          </div>
          <div>
            <label style={label}>Onde</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="São Paulo, Brasil" style={input} />
          </div>
          <div>
            <label style={label}>Quantidade</label>
            <select value={max} onChange={e => setMax(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
              {[10, 20, 50].map(n => <option key={n} value={n}>{n} empresas</option>)}
            </select>
          </div>
          <button type="submit" disabled={searching || isDemoMode || noCredit || !query.trim() || !location.trim()}
            style={{ ...btn('#FF6B35'), justifyContent: 'center', opacity: (searching || isDemoMode || noCredit || !query.trim() || !location.trim()) ? 0.55 : 1 }}>
            {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {searching ? 'Buscando…' : 'Buscar grátis'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {credit && (
            <span style={chip(noCredit ? '#EF4444' : '#10B981')}>
              Crédito grátis: {usd(credit.remainingUsd)} de {usd(credit.limitUsd)} · ≈ {credit.maxPlaces} empresas
              {credit.renewsAt ? ` · renova ${day(credit.renewsAt)}` : ''}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>
            {searching ? 'Procurando no Google Maps. Isso leva de 1 a 3 minutos.'
              : noCredit ? 'O crédito grátis do mês acabou. A busca volta quando ele renovar.'
              : 'Sem custo: cada busca usa só o crédito grátis mensal do Apify e nunca passa dele.'}
          </span>
        </div>
      </form>

      {err && <p style={{ margin: '0 0 16px', padding: '10px 14px', borderRadius: 10, background: '#EF444418', border: '1px solid #EF444455', color: '#F87171', fontSize: 13 }}>{err}</p>}
      {notice && <p style={{ margin: '0 0 16px', padding: '10px 14px', borderRadius: 10, background: '#10B98118', border: '1px solid #10B98155', color: '#34D399', fontSize: 13 }}>{notice}</p>}

      {/* ── Resultados ── */}
      {results && (
        <div className="rf-panel" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <h3 className="rf-section-title">Resultados</h3>
            <span className="rf-chip">{results.length} empresas</span>
            <span className="rf-chip">{withPhone} com telefone</span>
            {inCrm > 0 && <span className="rf-chip">{inCrm} já no CRM</span>}
          </div>

          {results.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-4)' }}>Nenhuma empresa encontrada. Tente outro termo ou uma região maior.</p>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 32 }}>
                        <button type="button" onClick={toggleAll} title="Selecionar todos" style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                          {allOn ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </th>
                      {['Empresa', 'Categoria', 'Cidade', 'Telefone', 'Avaliação', ''].map(h => <th key={h} style={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((p, i) => {
                      const k = keyOf(p, i)
                      const can = selectable(p)
                      return (
                        <tr key={k} style={{ opacity: can ? 1 : 0.55 }}>
                          <td style={td}>
                            <button type="button" disabled={!can} onClick={() => toggle(k)} style={{ background: 'none', border: 'none', color: sel.has(k) ? '#FF6B35' : 'var(--ink-4)', cursor: can ? 'pointer' : 'default', padding: 0, display: 'flex' }}>
                              {sel.has(k) ? <CheckSquare size={16} /> : <Square size={16} />}
                            </button>
                          </td>
                          <td style={{ ...td, fontWeight: 700, color: 'var(--ink-1)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {p.name}
                              {p.mapsUrl && <a href={p.mapsUrl} target="_blank" rel="noreferrer" title="Abrir no Google Maps" style={{ color: 'var(--ink-4)', display: 'flex' }}><ExternalLink size={13} /></a>}
                            </span>
                          </td>
                          <td style={{ ...td, color: 'var(--ink-3)' }}>{p.category || '—'}</td>
                          <td style={{ ...td, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                            {p.city ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} />{p.city}{p.state ? `, ${p.state}` : ''}</span> : '—'}
                          </td>
                          <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{p.phoneDisplay || p.phone || '—'}</td>
                          <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--ink-3)' }}>
                            {p.rating != null ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Star size={12} color="#EAB308" fill="#EAB308" />{p.rating.toFixed(1)} · {p.reviews}</span> : '—'}
                          </td>
                          <td style={td}>
                            {p.inCrm ? <span style={chip('#10B981')}>Já no CRM</span> : !p.phone ? <span style={chip('#94A3B8')}>Sem telefone</span> : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{chosen.length} selecionada{chosen.length !== 1 ? 's' : ''}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => importLeads(false)} disabled={!chosen.length || importing}
                    style={{ ...btn('transparent', 'var(--ink-1)'), border: '1px solid var(--border)', opacity: (!chosen.length || importing) ? 0.5 : 1 }}>
                    {importing ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Importar para o CRM
                  </button>
                  <button type="button" onClick={() => setConfirmCall(true)} disabled={!chosen.length || importing}
                    style={{ ...btn('linear-gradient(135deg, #FF6B35, #7C3AED)'), opacity: (!chosen.length || importing) ? 0.5 : 1 }}>
                    <PhoneCall size={15} /> Importar e ligar com IA
                  </button>
                </div>
              </div>

              {confirmCall && (
                <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: '#7C3AED14', border: '1px solid #7C3AED55' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.5 }}>
                    A IA vai ligar para <b>{chosen.length} empresa{chosen.length !== 1 ? 's' : ''}</b>, uma por vez, em dias úteis das 9h às 18h (Brasília). Cada ligação é qualificada e o resultado aparece no lead.
                  </p>
                  <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--ink-3)', display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 1.45 }}>
                    <AlertTriangle size={13} color="#EAB308" style={{ flexShrink: 0, marginTop: 2 }} />
                    Ligação ativa de oferta no Brasil exige prefixo 0303, respeito à lista Não Me Perturbe e base legal na LGPD.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => importLeads(true)} disabled={importing} style={btn('#7C3AED')}>
                      {importing ? <Loader2 size={14} className="animate-spin" /> : <PhoneCall size={14} />} Confirmar
                    </button>
                    <button type="button" onClick={() => setConfirmCall(false)} disabled={importing} style={{ ...btn('transparent', 'var(--ink-3)'), border: '1px solid var(--border)' }}>Cancelar</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Fila de ligações ── */}
      <div className="rf-panel" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <h3 className="rf-section-title">Fila de ligações</h3>
          {queueActive && <span style={chip('#7C3AED')}><Loader2 size={11} className="animate-spin" /> atualizando</span>}
          <Link to="/settings?secao=calls" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#FF6B35', textDecoration: 'none' }}>Configurar ligações →</Link>
        </div>
        {queue.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-4)' }}>Nenhuma ligação ainda. Busque leads e escolha "Importar e ligar com IA".</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {queue.map(c => {
              const tp = TEMP[c.temperature]
              const active = ACTIVE.includes(c.status)
              return (
                <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-1)' }}>{c.clients?.name || c.to_number}</span>
                      <span style={chip(c.status === 'failed' ? '#EF4444' : c.status === 'canceled' ? '#94A3B8' : active ? '#7C3AED' : '#10B981')}>
                        {active && <Loader2 size={10} className="animate-spin" />}{STATUS[c.status] || c.status}
                      </span>
                      {c.call_result && <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{RESULT[c.call_result] || c.call_result}</span>}
                      <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{when(c.created_at)}</span>
                    </div>
                    {c.summary && <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>{c.summary}</p>}
                    {c.error && <p style={{ margin: '5px 0 0', fontSize: 12, color: '#EAB308' }}>{c.error}</p>}
                  </div>
                  {c.score != null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {tp && <span style={chip(tp[1])}>{tp[0]}</span>}
                      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-1)', fontVariantNumeric: 'tabular-nums' }}>{c.score}</span>
                    </div>
                  )}
                  {c.status === 'queued' && (
                    <button type="button" onClick={() => cancel(c.id)} style={{ ...btn('transparent', 'var(--ink-3)'), border: '1px solid var(--border)', padding: '5px 10px', fontSize: 12, flexShrink: 0 }}>Cancelar</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
