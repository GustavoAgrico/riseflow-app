import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Loader2, MapPin, Star, PhoneCall, Download, ExternalLink, CheckSquare, Square, AlertTriangle,
  Mail, Instagram, Globe, MessageCircle, Linkedin, Facebook, Sparkles, Target, ChevronDown, ChevronUp, Upload, FileText, Building2,
} from 'lucide-react'
import { Layout } from '@components/Layout/Layout'
import { CountUp, Segmented } from '@components/motion'
import api from '@services/api'
import { useAuth } from '@context/AuthContext'
import { DEFAULT_PROFILE, scoreLead, TIER_COLORS } from '@lib/icp'
import { parseLeadList } from '@lib/leadList'

// Aquisição de leads:
//   - busca de empresas por segmento e cidade no Google Maps (servidor → Apify, só crédito grátis);
//   - importação de listas (planilha CSV ou texto colado);
//   - enriquecimento por fontes públicas (site da empresa + CNPJ na BrasilAPI): e-mail, Instagram,
//     redes, WhatsApp, situação do CNPJ e sócios — sem custo;
//   - classificação pelo perfil de cliente ideal (nota 0–100, Tier A/B/C com motivos);
//   - importa para o CRM e, se pedido, coloca na fila de ligações da IA.
const ACTIVE = ['queued', 'dialing', 'initiated', 'in-progress', 'processing']
const STATUS = { queued: 'Na fila', dialing: 'Discando…', initiated: 'Chamando…', 'in-progress': 'Em ligação', processing: 'Processando', done: 'Concluída', failed: 'Falhou', canceled: 'Cancelada' }
const RESULT = { answered: 'atendeu', voicemail: 'caixa postal', busy: 'ocupado', no_answer: 'não atendeu', failed: 'falhou' }
const TEMP = { hot: ['Quente', '#FF6B35'], warm: ['Morno', '#EAB308'], cold: ['Frio', '#38BDF8'] }
const PROFILE_KEY = 'rf.icp.profile'

const errMsg = e => e?.response?.data?.error || (e?.code === 'ECONNABORTED' ? 'A busca demorou demais. Tente com menos resultados.' : e?.message) || 'Erro inesperado'
const usd = v => 'US$ ' + v.toFixed(2).replace('.', ',')
const when = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const day = t => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const selectable = p => Boolean(p.phone || p.whatsapp) && !p.inCrm
const loadProfile = () => { try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') } } catch { return DEFAULT_PROFILE } }

const input = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, outline: 'none', color: 'var(--ink-1)', background: 'var(--card)', fontFamily: 'inherit' }
const label = { display: 'block', fontSize: 11, color: 'var(--ink-3)', marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }
const btn = (bg, color = '#fff') => ({ background: bg, color, border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7 })
const chip = (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color, background: color + '1A', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' })
const th = { padding: '0 10px 10px', fontSize: 11, color: 'var(--ink-4)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }
const td = { padding: '10px', borderTop: '1px solid var(--border)', fontSize: 13, verticalAlign: 'middle' }

const ContactIcon = ({ href, Icon, label: l, color, text }) => {
  const style = { width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: href || text ? color + '1f' : 'transparent', border: `1px solid ${href || text ? color + '55' : 'var(--border)'}`, color: href || text ? color : 'var(--ink-4)', opacity: href || text ? 1 : 0.4 }
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" title={l} aria-label={l} style={style}><Icon size={13} /></a>
  return <span title={text ? `${l}: ${text}` : `Sem ${l.toLowerCase()}`} aria-label={text ? l : `Sem ${l.toLowerCase()}`} style={style}><Icon size={13} /></span>
}

export const Prospecting = () => {
  const { isDemoMode } = useAuth()
  const [source, setSource] = useState('maps') // maps | lista
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('São Paulo, Brasil')
  const [max, setMax] = useState(20)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null) // [{ key, ...lead }]
  const [resultSource, setResultSource] = useState('maps')
  const [enriched, setEnriched] = useState({}) // key → dados do site/CNPJ
  const [enriching, setEnriching] = useState(null) // { done, total }
  const [sel, setSel] = useState(() => new Set())
  const [tierFilter, setTierFilter] = useState('all')
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [importing, setImporting] = useState(false)
  const [confirmCall, setConfirmCall] = useState(false)
  const [queue, setQueue] = useState([])
  const [credit, setCredit] = useState(null)
  const [profile, setProfile] = useState(loadProfile)
  const [showProfile, setShowProfile] = useState(false)
  const [listText, setListText] = useState('')
  const fileRef = useRef(null)

  useEffect(() => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)) } catch { /* sem storage */ } }, [profile])
  const setP = (k, v) => setProfile(p => ({ ...p, [k]: v }))

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

  // Lista final: dados da busca/lista + enriquecimento + nota de cliente ideal, da melhor para a pior.
  const rows = useMemo(() => (results || []).map(p => {
    const e = enriched[p.key] || {}
    const lead = {
      ...p,
      email: p.email || e.emails?.[0] || '',
      instagram: p.instagram || e.instagram || '', facebook: e.facebook || '', linkedin: e.linkedin || '',
      whatsapp: p.whatsapp || e.whatsapp || '', cnpj: p.cnpj || e.cnpj || '', company: e.company || null,
      enrichedAt: enriched[p.key] ? true : false, enrichError: e.error || null,
    }
    const icp = scoreLead(lead, profile)
    return { ...lead, icpScore: icp.score, tier: icp.tier, icpReasons: icp.reasons }
  }).sort((a, b) => b.icpScore - a.icpScore), [results, enriched, profile])
  const visible = tierFilter === 'all' ? rows : rows.filter(r => r.tier === tierFilter)

  const resetResults = (list, src) => {
    setResults(list); setResultSource(src); setEnriched({}); setTierFilter('all'); setConfirmCall(false)
    setSel(new Set(list.filter(selectable).map(p => p.key)))
  }

  const search = async (e) => {
    e?.preventDefault()
    if (!query.trim() || !location.trim() || searching) return
    setSearching(true); setErr(''); setNotice(''); setResults(null)
    try {
      const { data } = await api.post('/prospecting/search', { query, location, max }, { timeout: 300000 })
      resetResults((data?.results || []).map((p, i) => ({ ...p, key: p.placeId || `maps-${i}-${p.name}` })), 'maps')
      if (data?.credit) setCredit(data.credit)
      if (data?.allowed < data?.requested) setNotice(`A busca foi limitada a ${data.allowed} empresas para caber no crédito grátis do mês.`)
    } catch (e2) {
      setErr(errMsg(e2))
      if (e2?.response?.data?.credit) setCredit(e2.response.data.credit)
    }
    setSearching(false)
  }

  const loadList = (text) => {
    setErr(''); setNotice('')
    const { leads, skipped } = parseLeadList(text)
    if (!leads.length) { setErr('Não encontrei leads nessa lista. Use uma coluna de nome e outra de telefone (ou cole uma empresa por linha).'); return }
    resetResults(leads.map((l, i) => ({ ...l, key: `lista-${i}-${l.name}` })), 'lista')
    setNotice(`${leads.length} lead${leads.length !== 1 ? 's' : ''} lido${leads.length !== 1 ? 's' : ''} da lista${skipped ? ` · ${skipped} linha(s) ignorada(s)` : ''}. Clique em "Enriquecer" para achar e-mail, Instagram e dados do CNPJ.`)
  }
  const onFile = async (ev) => {
    const f = ev.target.files?.[0]
    ev.target.value = ''
    if (!f) return
    if (f.size > 2_000_000) { setErr('Arquivo grande demais (máx. 2 MB). Divida a lista.'); return }
    const text = await f.text()
    setListText(text.slice(0, 20000))
    loadList(text)
  }

  // Enriquecimento: só quem tem site ou CNPJ e ainda não foi visitado; 20 por vez.
  const enrichAll = async () => {
    if (isDemoMode) { setNotice('Modo demo: o enriquecimento roda na sua conta.'); return }
    const todo = rows.filter(r => !enriched[r.key] && (r.website || r.cnpj)).map(r => ({ key: r.key, website: r.website, cnpj: r.cnpj }))
    if (!todo.length) { setNotice('Nenhum lead com site ou CNPJ para enriquecer.'); return }
    setErr(''); setEnriching({ done: 0, total: todo.length })
    for (let i = 0; i < todo.length; i += 20) {
      try {
        const { data } = await api.post('/prospecting/enrich', { leads: todo.slice(i, i + 20) }, { timeout: 120000 })
        setEnriched(m => { const n = { ...m }; for (const r of data.results || []) n[r.key] = r; return n })
      } catch (e) { setErr(errMsg(e)); break }
      setEnriching({ done: Math.min(i + 20, todo.length), total: todo.length })
    }
    setEnriching(null)
  }

  const toggle = (k) => setSel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const valid = visible.filter(selectable)
  const allOn = valid.length > 0 && valid.every(p => sel.has(p.key))
  const toggleAll = () => setSel(s => { const n = new Set(s); valid.forEach(p => (allOn ? n.delete(p.key) : n.add(p.key))); return n })
  const selectTierA = () => setSel(new Set(rows.filter(r => r.tier === 'A' && selectable(r)).map(r => r.key)))
  const chosen = rows.filter(p => sel.has(p.key) && selectable(p))

  const importLeads = async (call) => {
    if (!chosen.length || importing) return
    setImporting(true); setErr(''); setNotice('')
    try {
      const payload = chosen.map(p => ({ ...p, phone: p.phone || p.whatsapp, icpReasons: p.icpReasons.map(r => r.text) }))
      const { data } = await api.post('/prospecting/import', { leads: payload, call, source: resultSource === 'lista' ? 'lista' : 'google_maps' }, { timeout: 60000 })
      const parts = [`${data.imported} importado${data.imported !== 1 ? 's' : ''} para o CRM`]
      if (data.skipped) parts.push(`${data.skipped} já existia${data.skipped !== 1 ? 'm' : ''} ou sem telefone`)
      if (call) parts.push(`${data.queued} na fila de ligações`)
      if (data.notQueued) parts.push(`${data.notQueued} fora da fila (modo teste)`)
      setNotice(parts.join(' · ') + '.')
      const done = new Set(chosen.map(p => p.key))
      setResults(list => list.map(p => (done.has(p.key) ? { ...p, inCrm: true } : p)))
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
  const stats = {
    total: rows.length,
    phone: rows.filter(r => r.phone || r.whatsapp).length,
    email: rows.filter(r => r.email).length,
    instagram: rows.filter(r => r.instagram).length,
    tierA: rows.filter(r => r.tier === 'A').length,
  }
  const canEnrich = rows.some(r => !enriched[r.key] && (r.website || r.cnpj))

  return (
    <Layout title="Prospecção com IA" subtitle="Encontre, enriqueça e classifique leads; traga os melhores para o CRM">
      {isDemoMode && (
        <p style={{ margin: '0 0 16px', padding: '10px 14px', background: '#7C3AED22', border: '1px solid #7C3AED55', borderRadius: 10, color: '#C4B5FD', fontSize: 13 }}>
          Indisponível no modo demo.
        </p>
      )}

      {/* ── Origem dos leads ── */}
      <div className="rf-panel" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <h3 className="rf-section-title">Encontrar leads</h3>
          <span style={{ marginLeft: 'auto' }}>
            <Segmented label="De onde vêm os leads" size="sm" accent="#FF6B35" options={[['maps', 'Google Maps'], ['lista', 'Importar lista']]} value={source} onChange={setSource} />
          </span>
        </div>

        {source === 'maps' ? (
          <form onSubmit={search}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={label} htmlFor="q-seg">Segmento</label>
                <input id="q-seg" value={query} onChange={e => setQuery(e.target.value)} placeholder="clínica odontológica, contabilidade…" style={input} />
              </div>
              <div>
                <label style={label} htmlFor="q-loc">Localização</label>
                <input id="q-loc" value={location} onChange={e => setLocation(e.target.value)} placeholder="São Paulo, Brasil" style={input} />
              </div>
              <div>
                <label style={label} htmlFor="q-max">Quantidade</label>
                <select id="q-max" value={max} onChange={e => setMax(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
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
                {searching ? 'Procurando no Google Maps. Isso leva de 10 segundos a 3 minutos.'
                  : noCredit ? 'O crédito grátis do mês acabou. A busca volta quando ele renovar.'
                  : 'Busque pelo tipo de negócio (ex.: "escritório de contabilidade"), não por pessoas.'}
              </span>
            </div>
          </form>
        ) : (
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
              Envie uma planilha <b>CSV</b> (Excel → "Salvar como CSV") ou cole a lista. Colunas reconhecidas: nome/empresa, telefone/WhatsApp, e-mail, site, Instagram, cidade, UF, segmento e CNPJ.
            </p>
            <textarea value={listText} onChange={e => setListText(e.target.value)} rows={5} placeholder={'Nome;Telefone;Site;Cidade\nClínica Sorriso;(11) 98765-4321;sorriso.com.br;São Paulo'}
              aria-label="Lista de leads" style={{ ...input, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => loadList(listText)} disabled={!listText.trim()} style={{ ...btn('#FF6B35'), opacity: !listText.trim() ? 0.55 : 1 }}>
                <FileText size={15} /> Ler lista
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} style={{ ...btn('transparent', 'var(--ink-1)'), border: '1px solid var(--border)' }}>
                <Upload size={15} /> Enviar arquivo CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} style={{ display: 'none' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Perfil de cliente ideal ── */}
      <div className="rf-panel" style={{ padding: '14px 20px', marginBottom: 16 }}>
        <button type="button" onClick={() => setShowProfile(s => !s)} aria-expanded={showProfile}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink-1)', fontFamily: 'inherit', textAlign: 'left' }}>
          <Target size={17} color="#22C55E" />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>Perfil de cliente ideal</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {profile.segments ? `Segmentos: ${profile.segments}` : 'Qualquer segmento'}{profile.cities ? ` · Região: ${profile.cities}` : ''} · nota mín. {profile.minRating || '—'} · {profile.minReviews}+ avaliações
            </span>
          </span>
          {showProfile ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showProfile && (
          <div className="rf-pop" style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
              <div>
                <label style={label} htmlFor="icp-seg">Segmentos-alvo</label>
                <input id="icp-seg" value={profile.segments} onChange={e => setP('segments', e.target.value)} placeholder="odontologia, estética, clínica" style={input} />
              </div>
              <div>
                <label style={label} htmlFor="icp-city">Cidades / UF</label>
                <input id="icp-city" value={profile.cities} onChange={e => setP('cities', e.target.value)} placeholder="São Paulo, Campinas, SP" style={input} />
              </div>
              <div>
                <label style={label} htmlFor="icp-rating">Nota mínima no Google</label>
                <select id="icp-rating" value={profile.minRating} onChange={e => setP('minRating', Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
                  {[0, 3.5, 4, 4.3, 4.5].map(n => <option key={n} value={n}>{n ? `${String(n).replace('.', ',')}+` : 'Não considerar'}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="icp-rev">Avaliações mínimas</label>
                <select id="icp-rev" value={profile.minReviews} onChange={e => setP('minReviews', Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
                  {[0, 10, 30, 100].map(n => <option key={n} value={n}>{n ? `${n}+` : 'Não considerar'}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...label, margin: 0 }}>Obrigatório:</span>
              {[['needPhone', 'Telefone'], ['needEmail', 'E-mail'], ['needInstagram', 'Instagram'], ['needSite', 'Site']].map(([k, l]) => (
                <button key={k} type="button" role="switch" aria-checked={profile[k]} onClick={() => setP(k, !profile[k])} className="rf-press"
                  style={{ ...chip(profile[k] ? '#22C55E' : '#94A3B8'), border: `1px solid ${profile[k] ? '#22C55E66' : 'var(--border)'}`, cursor: 'pointer', fontFamily: 'inherit', padding: '5px 12px' }}>
                  {profile[k] ? '✓ ' : ''}{l}
                </button>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-4)' }}>A nota vai de 0 a 100: Tier A (70+) é prioridade, B (45–69) vale testar, C fica por último. Fica salvo neste navegador.</p>
          </div>
        )}
      </div>

      {err && <p style={{ margin: '0 0 16px', padding: '10px 14px', borderRadius: 10, background: '#EF444418', border: '1px solid #EF444455', color: '#F87171', fontSize: 13 }}>{err}</p>}
      {notice && <p style={{ margin: '0 0 16px', padding: '10px 14px', borderRadius: 10, background: '#10B98118', border: '1px solid #10B98155', color: '#34D399', fontSize: 13 }}>{notice}</p>}

      {/* ── Resultados ── */}
      {results && (
        <div className="rf-panel" style={{ padding: 20, marginBottom: 20 }}>
          <div className="rf-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              ['Encontrados', stats.total, '#94A3B8', Building2], ['Com telefone', stats.phone, '#22C55E', PhoneCall],
              ['Com e-mail', stats.email, '#38BDF8', Mail], ['Com Instagram', stats.instagram, '#E1306C', Instagram], ['Tier A', stats.tierA, TIER_COLORS.A, Target],
            ].map(([l, v, c, Icon]) => (
              <div key={l} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-3)' }}><Icon size={12} color={c} /> {l}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink-1)', fontVariantNumeric: 'tabular-nums' }}><CountUp value={v} /></div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <h3 className="rf-section-title">{resultSource === 'lista' ? 'Leads da lista' : 'Empresas encontradas'}</h3>
            <Segmented label="Filtrar por Tier" size="sm" accent="#22C55E" options={[['all', 'Todos'], ['A', `Tier A`], ['B', 'Tier B'], ['C', 'Tier C']]} value={tierFilter} onChange={setTierFilter} />
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={enrichAll} disabled={!!enriching || !canEnrich}
                title="Visita o site de cada empresa e consulta o CNPJ em fonte pública para achar e-mail, Instagram, WhatsApp e sócios"
                style={{ ...btn('linear-gradient(135deg, #38BDF8, #7C3AED)'), opacity: enriching || !canEnrich ? 0.55 : 1 }}>
                {enriching ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {enriching ? `Enriquecendo ${enriching.done}/${enriching.total}…` : canEnrich ? 'Enriquecer contatos (grátis)' : Object.keys(enriched).length ? 'Contatos enriquecidos' : 'Nenhum site para enriquecer'}
              </button>
              {stats.tierA > 0 && <button type="button" onClick={selectTierA} style={{ ...btn('transparent', TIER_COLORS.A), border: `1px solid ${TIER_COLORS.A}66` }}><Target size={14} /> Selecionar Tier A</button>}
            </span>
          </div>

          {rows.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-4)' }}>Nenhuma empresa encontrada. Tente outro termo ou uma região maior.</p>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 32 }}>
                        <button type="button" onClick={toggleAll} title="Selecionar todos" aria-label="Selecionar todos" style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                          {allOn ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </th>
                      {['Cliente ideal', 'Empresa', 'Contatos', 'Telefone', 'Cidade', 'Avaliação', ''].map(h => <th key={h} style={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => {
                      const can = selectable(p)
                      const tc = TIER_COLORS[p.tier]
                      const plus = p.icpReasons.filter(r => r.ok).slice(0, 2)
                      const minus = p.icpReasons.filter(r => !r.ok).slice(0, 1)
                      return (
                        <tr key={p.key} style={{ opacity: can ? 1 : 0.55 }}>
                          <td style={td}>
                            <button type="button" disabled={!can} onClick={() => toggle(p.key)} aria-label={`Selecionar ${p.name}`} style={{ background: 'none', border: 'none', color: sel.has(p.key) ? '#FF6B35' : 'var(--ink-4)', cursor: can ? 'pointer' : 'default', padding: 0, display: 'flex' }}>
                              {sel.has(p.key) ? <CheckSquare size={16} /> : <Square size={16} />}
                            </button>
                          </td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }} title={p.icpReasons.map(r => `${r.ok ? '+' : '−'} ${r.text}`).join('\n')}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 15, color: '#fff', background: `linear-gradient(135deg, ${tc}, ${tc}99)`, boxShadow: `0 4px 14px ${tc}55` }}>{p.tier}</span>
                              <b style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{p.icpScore}</b>
                            </span>
                          </td>
                          <td style={{ ...td, color: 'var(--ink-1)', minWidth: 220 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                              {p.name}
                              {p.mapsUrl && <a href={p.mapsUrl} target="_blank" rel="noreferrer" title="Abrir no Google Maps" style={{ color: 'var(--ink-4)', display: 'flex' }}><ExternalLink size={13} /></a>}
                            </span>
                            <div style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{p.category || p.company?.atividade || '—'}</div>
                            {p.company?.socios?.length > 0 && <div style={{ fontSize: 11.5, color: '#A78BFA', marginTop: 2 }}>Dono: {p.company.socios[0].nome}{p.company.socios.length > 1 ? ` +${p.company.socios.length - 1}` : ''}</div>}
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                              {plus.map(r => <span key={r.text} style={{ fontSize: 10.5, color: '#22C55E' }}>+ {r.text}</span>)}
                              {minus.map(r => <span key={r.text} style={{ fontSize: 10.5, color: '#F87171' }}>− {r.text}</span>)}
                            </div>
                          </td>
                          <td style={td}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <ContactIcon Icon={Globe} label="Site" color="#94A3B8" href={p.website ? (p.website.startsWith('http') ? p.website : `https://${p.website}`) : null} />
                              <ContactIcon Icon={Mail} label="E-mail" color="#38BDF8" text={p.email} href={p.email ? `mailto:${p.email}` : null} />
                              <ContactIcon Icon={Instagram} label="Instagram" color="#E1306C" href={p.instagram || null} />
                              <ContactIcon Icon={MessageCircle} label="WhatsApp" color="#22C55E" href={p.whatsapp ? `https://wa.me/${p.whatsapp}` : null} />
                              {(p.linkedin || p.facebook) && <ContactIcon Icon={p.linkedin ? Linkedin : Facebook} label={p.linkedin ? 'LinkedIn' : 'Facebook'} color="#3B82F6" href={p.linkedin || p.facebook} />}
                            </div>
                            {p.enrichError && <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 3 }}>site: {p.enrichError}</div>}
                          </td>
                          <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{p.phoneDisplay || p.phone || (p.whatsapp ? `+${p.whatsapp}` : '—')}</td>
                          <td style={{ ...td, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                            {p.city ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} />{p.city}{p.state ? `, ${p.state}` : ''}</span> : '—'}
                          </td>
                          <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--ink-3)' }}>
                            {p.rating != null ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Star size={12} color="#EAB308" fill="#EAB308" />{p.rating.toFixed(1)} · {p.reviews}</span> : '—'}
                          </td>
                          <td style={td}>
                            {p.inCrm ? <span style={chip('#10B981')}>Já no CRM</span> : !(p.phone || p.whatsapp) ? <span style={chip('#94A3B8')}>Sem telefone</span> : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{chosen.length} selecionado{chosen.length !== 1 ? 's' : ''}</span>
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
              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-4)' }}>
                Na importação, e-mail, Instagram, redes, CNPJ, sócios e o Tier ficam salvos na ficha do lead (com etiqueta "Tier A/B/C").
              </p>

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

export default Prospecting
