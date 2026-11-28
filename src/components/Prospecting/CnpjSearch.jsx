// Formulário da busca na base do CNPJ (Receita Federal, importada na VM):
// setor (CNAE) + estado/cidade + porte/MEI + telefone/e-mail + idade da empresa.
// Só monta os filtros; quem busca é a página (onSearch).
import React, { useEffect, useRef, useState } from 'react'
import { Search, Loader2, X, Database } from 'lucide-react'
import api from '@services/api'

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']
export const AGES = { any: ['Qualquer idade', {}], novas: ['Abertas há menos de 1 ano', { maxYears: 1 }], jovens: ['1 a 5 anos', { minYears: 1, maxYears: 5 }], maduras: ['Mais de 5 anos', { minYears: 5 }], antigas: ['Mais de 10 anos', { minYears: 10 }] }
const PORTES = [[1, 'Micro (ME)'], [3, 'Pequena (EPP)'], [5, 'Média/grande']]
const fmtN = (n) => Number(n || 0).toLocaleString('pt-BR')
const cnaeCode = (c) => String(c).replace(/^(\d{4})(\d)(\d{2})$/, '$1-$2/$3')

const input = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, outline: 'none', color: 'var(--ink-1)', background: 'var(--card)', fontFamily: 'inherit' }
const label = { display: 'block', fontSize: 11, color: 'var(--ink-3)', marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }
const chipBtn = (on, color = '#FF6B35') => ({ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', color: on ? color : 'var(--ink-3)', background: on ? color + '1A' : 'transparent', border: `1px solid ${on ? color + '66' : 'var(--border)'}` })

// Lista de sugestões com teclado (setas + Enter).
function Suggest({ id, labelText, placeholder, fetcher, render, onPick, disabled }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const seq = useRef(0)
  useEffect(() => {
    const text = q.trim()
    if (text.length < 2) { setItems([]); return }
    const my = ++seq.current
    const t = setTimeout(async () => {
      try { const list = await fetcher(text); if (my === seq.current) { setItems(list || []); setHi(0); setOpen(true) } } catch { /* sem base */ }
    }, 250)
    return () => clearTimeout(t)
  }, [q, fetcher])
  const pick = (it) => { onPick(it); setQ(''); setItems([]); setOpen(false) }
  return (
    <div style={{ position: 'relative' }}>
      <label style={label} htmlFor={id}>{labelText}</label>
      <input id={id} value={q} disabled={disabled} placeholder={placeholder} autoComplete="off" style={input}
        role="combobox" aria-expanded={open && items.length > 0} aria-controls={`${id}-list`}
        onChange={e => setQ(e.target.value)} onFocus={() => items.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (!open || !items.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, items.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
          if (e.key === 'Enter') { e.preventDefault(); pick(items[hi]) }
          if (e.key === 'Escape') setOpen(false)
        }} />
      {open && items.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="rf-pop" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', marginTop: 4, padding: 4, listStyle: 'none', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,.25)', maxHeight: 260, overflowY: 'auto' }}>
          {items.map((it, i) => (
            <li key={i} role="option" aria-selected={i === hi} onMouseDown={e => { e.preventDefault(); pick(it) }} onMouseEnter={() => setHi(i)}
              style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: i === hi ? 'var(--surface-1)' : 'transparent' }}>
              {render(it)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CnpjSearch({ onSearch, searching, disabled }) {
  const [status, setStatus] = useState(null)
  const [cnaes, setCnaes] = useState([]) // [{ code, name }]
  const [uf, setUf] = useState('')
  const [cidade, setCidade] = useState(null) // { code, name, uf }
  const [portes, setPortes] = useState([])
  const [mei, setMei] = useState('exclude')
  const [phone, setPhone] = useState('mobile')
  const [email, setEmail] = useState(false)
  const [matriz, setMatriz] = useState(true)
  const [age, setAge] = useState('any')
  const [limit, setLimit] = useState(50)

  useEffect(() => {
    if (disabled) return
    api.get('/prospecting/cnpj/status').then(({ data }) => setStatus(data)).catch(() => setStatus({ ready: false }))
  }, [disabled])

  const fetchCnaes = React.useCallback(async (q) => (await api.get('/prospecting/cnpj/cnaes', { params: { q } })).data, [])
  const fetchCidades = React.useCallback(async (q) => (await api.get('/prospecting/cnpj/cidades', { params: { q, uf } })).data, [uf])

  const ready = status?.ready
  const canSearch = ready && !searching && !disabled && (cnaes.length > 0 || cidade)
  const submit = (e) => {
    e?.preventDefault()
    if (!canSearch) return
    const params = {
      cnaes: cnaes.map(c => c.code), uf: uf || undefined, cidade: cidade?.code, portes, mei, phone, email, matriz, limit,
      ...AGES[age][1],
    }
    const label = cnaes.length ? cnaes.map(c => c.name).join(', ') : 'Todos os setores'
    const locationLabel = cidade ? `${cidade.name}, ${cidade.uf}` : uf || 'Brasil'
    onSearch(params, { label, locationLabel })
  }

  return (
    <form onSubmit={submit} aria-label="Busca na base de CNPJ">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12.5, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
        <Database size={14} color="#38BDF8" />
        {status === null ? 'Verificando a base…'
          : ready ? <>Base da Receita Federal · competência <b style={{ color: 'var(--ink-1)' }}>{status.competencia}</b> · {fmtN(status.estabelecimentos)} empresas ativas · busca grátis e ilimitada</>
          : <>A base de CNPJ ainda está sendo importada para o servidor. Volte em alguns minutos.</>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, alignItems: 'end' }}>
        <Suggest id="cnpj-cnae" labelText="Setor (CNAE)" placeholder="odontologia, contabilidade, academia…" fetcher={fetchCnaes} disabled={!ready || cnaes.length >= 5}
          render={c => <span><b>{c.name}</b> <span style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>{cnaeCode(c.code)} · {fmtN(c.total)} empresas</span></span>}
          onPick={c => setCnaes(list => (list.some(x => x.code === c.code) ? list : [...list, c]))} />
        <div>
          <label style={label} htmlFor="cnpj-uf">Estado</label>
          <select id="cnpj-uf" value={uf} disabled={!ready} onChange={e => { setUf(e.target.value); setCidade(null) }} style={{ ...input, cursor: 'pointer' }}>
            <option value="">Brasil todo</option>
            {UFS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {cidade ? (
          <div>
            <span style={label}>Cidade</span>
            <button type="button" onClick={() => setCidade(null)} style={{ ...chipBtn(true, '#38BDF8'), padding: '8px 12px' }} aria-label={`Remover cidade ${cidade.name}`}>
              {cidade.name}, {cidade.uf} <X size={12} />
            </button>
          </div>
        ) : (
          <Suggest id="cnpj-cidade" labelText="Cidade" placeholder={uf ? 'Digite a cidade' : 'Escolha o estado primeiro'} fetcher={fetchCidades} disabled={!ready || !uf}
            render={c => <span><b>{c.name}</b> <span style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>{c.uf} · {fmtN(c.total)} empresas</span></span>}
            onPick={c => setCidade(c)} />
        )}
        <div>
          <label style={label} htmlFor="cnpj-age">Idade da empresa</label>
          <select id="cnpj-age" value={age} disabled={!ready} onChange={e => setAge(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
            {Object.entries(AGES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>

      {cnaes.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {cnaes.map(c => (
            <button key={c.code} type="button" onClick={() => setCnaes(list => list.filter(x => x.code !== c.code))} style={chipBtn(true)} aria-label={`Remover setor ${c.name}`}>
              {c.name} <X size={12} />
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
        <span style={{ ...label, margin: 0 }}>Porte:</span>
        {PORTES.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={portes.includes(v)} disabled={!ready} onClick={() => setPortes(p => (p.includes(v) ? p.filter(x => x !== v) : [...p, v]))} style={chipBtn(portes.includes(v))}>{l}</button>
        ))}
        <select aria-label="MEI" value={mei} disabled={!ready} onChange={e => setMei(e.target.value)} style={{ ...input, width: 'auto', padding: '5px 10px', fontSize: 12 }}>
          <option value="exclude">Sem MEI</option>
          <option value="any">Com MEI</option>
          <option value="only">Só MEI</option>
        </select>
        <span style={{ ...label, margin: '0 0 0 6px' }}>Contato:</span>
        <select aria-label="Telefone" value={phone} disabled={!ready} onChange={e => setPhone(e.target.value)} style={{ ...input, width: 'auto', padding: '5px 10px', fontSize: 12 }}>
          <option value="mobile">Só com celular</option>
          <option value="has">Com telefone</option>
          <option value="any">Qualquer</option>
        </select>
        <button type="button" aria-pressed={email} disabled={!ready} onClick={() => setEmail(v => !v)} style={chipBtn(email, '#38BDF8')}>Com e-mail</button>
        <button type="button" aria-pressed={matriz} disabled={!ready} onClick={() => setMatriz(v => !v)} style={chipBtn(matriz, '#A78BFA')}>Só matriz</button>
        <select aria-label="Quantidade" value={limit} disabled={!ready} onChange={e => setLimit(Number(e.target.value))} style={{ ...input, width: 'auto', padding: '5px 10px', fontSize: 12, marginLeft: 'auto' }}>
          {[25, 50, 100].map(n => <option key={n} value={n}>{n} por vez</option>)}
        </select>
        <button type="submit" disabled={!canSearch}
          style={{ background: '#FF6B35', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: canSearch ? 'pointer' : 'default', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7, opacity: canSearch ? 1 : 0.55 }}>
          {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {searching ? 'Buscando…' : 'Buscar na base'}
        </button>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.5 }}>
        Dados públicos do cadastro na Receita: telefone e e-mail são os informados pela empresa (às vezes são do contador). Use "Validar WhatsApp" e "Enriquecer" para confirmar.
      </p>
    </form>
  )
}

export default CnpjSearch
