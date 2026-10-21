import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Target, Package, Plus, Trash2, Check, Trophy } from 'lucide-react'
import { Layout } from '@components/Layout/Layout'
import { GoalPanel } from '@components/Goals/GoalPanel'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { monthKey } from '@hooks/useGoalProgress'
import { brl } from '@lib/metrics'

const C = { card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-4)', org: '#FF6B35', grn: '#10B981', red: '#EF4444' }
const input = { width: '100%', background: 'var(--bg)', border: `1px solid ${C.bd}`, borderRadius: 8, padding: '9px 12px', color: C.tx, fontSize: 14, outline: 'none', fontFamily: 'inherit' }
const btn = (bg) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: bg, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' })
const label = { fontSize: 11, color: C.mut, marginBottom: 4, display: 'block' }
const monthLabel = (m) => new Date(m + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
// Aceita "1.500,50", "50.000", "99.90" e "50000".
const toNumber = (v) => {
  let s = String(v).trim().replace(/[R$\s]/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  return Number(s) || 0
}

export const Goals = () => {
  const { ownerUserId, isDemoMode } = useAuth()
  const [goals, setGoals] = useState([])
  const [products, setProducts] = useState([])
  const [wonDeals, setWonDeals] = useState([])
  const [month, setMonth] = useState(monthKey().slice(0, 7))
  const [target, setTarget] = useState('')
  const [prodForm, setProdForm] = useState({ name: '', price: '' })
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    if (isDemoMode || !ownerUserId) return
    const since = new Date(); since.setMonth(since.getMonth() - 12); since.setDate(1)
    const [g, p, w] = await Promise.all([
      supabase.from('sales_goals').select('*').eq('user_id', ownerUserId).order('month', { ascending: false }).limit(24),
      supabase.from('products').select('*').eq('user_id', ownerUserId).order('created_at', { ascending: true }),
      supabase.from('clients').select('value, won_at').eq('user_id', ownerUserId).gte('won_at', since.toISOString()),
    ])
    if (g.error || p.error) setMsg({ err: true, text: 'Não foi possível carregar. Rode supabase/sales_goals.sql se ainda não rodou.' })
    setGoals(g.data ?? []); setProducts(p.data ?? []); setWonDeals(w.data ?? [])
  }, [ownerUserId, isDemoMode])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const existing = goals.find(g => g.month === `${month}-01`)
    setTarget(existing ? String(existing.target) : '')
  }, [month, goals])

  const soldByMonth = useMemo(() => {
    const m = {}
    for (const d of wonDeals) {
      const k = monthKey(new Date(d.won_at))
      m[k] = (m[k] || 0) + (Number(d.value) || 0)
    }
    return m
  }, [wonDeals])

  const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4000) }

  const saveGoal = async () => {
    const value = toNumber(target)
    if (value <= 0) return flash('Informe um valor de meta maior que zero.', true)
    const { error } = await supabase.from('sales_goals').upsert(
      { user_id: ownerUserId, month: `${month}-01`, target: value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,month' })
    if (error) return flash('Erro ao salvar a meta: ' + error.message, true)
    flash(`Meta de ${monthLabel(`${month}-01`)} salva: ${brl(value)}`)
    load()
  }

  const deleteGoal = async (g) => {
    if (!window.confirm(`Remover a meta de ${monthLabel(g.month)}?`)) return
    await supabase.from('sales_goals').delete().eq('id', g.id)
    load()
  }

  const addProduct = async () => {
    const name = prodForm.name.trim()
    const price = toNumber(prodForm.price)
    if (!name || price <= 0) return flash('Informe nome e preço do produto.', true)
    const { error } = await supabase.from('products').insert({ user_id: ownerUserId, name, price })
    if (error) return flash('Erro ao salvar o produto: ' + error.message, true)
    setProdForm({ name: '', price: '' })
    load()
  }

  const updateProduct = async (id, fields) => {
    setProducts(ps => ps.map(p => p.id === id ? { ...p, ...fields } : p))
    await supabase.from('products').update(fields).eq('id', id)
  }

  const deleteProduct = async (p) => {
    if (!window.confirm(`Remover o produto "${p.name}"?`)) return
    await supabase.from('products').delete().eq('id', p.id)
    load()
  }

  const section = { background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20, marginBottom: 20 }

  return (
    <Layout title="Metas e produtos" subtitle="Metas de venda e catálogo usados no Dashboard">
      {isDemoMode && <p style={{ color: C.mut }}>Disponível com conta ativa.</p>}
      {msg && <p style={{ margin: '0 0 16px', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: (msg.err ? C.red : C.grn) + '18', color: msg.err ? C.red : C.grn }}>{msg.text}</p>}

      <div style={{ marginBottom: 20 }}><GoalPanel /></div>

      <div style={section}>
        <p className="rf-section-title" style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}><Target size={16} color={C.org} /> Definir meta mensal</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={label}>Mês</label>
            <input type="month" style={input} value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          <div style={{ flex: '2 1 200px' }}>
            <label style={label}>Meta de vendas (R$)</label>
            <input inputMode="decimal" style={input} value={target} onChange={e => setTarget(e.target.value)} placeholder="Ex: 50000" onKeyDown={e => e.key === 'Enter' && saveGoal()} />
          </div>
          <button onClick={saveGoal} style={btn(C.org)}><Check size={15} /> Salvar meta</button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: C.mut }}>
          Conta como venda todo negócio que entra numa etapa de "ganho" do funil no mês (data do fechamento), com o valor do negócio.
        </p>

        {goals.length > 0 && (
          <div style={{ marginTop: 18, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460, fontSize: 13 }}>
              <thead><tr>{['Mês', 'Meta', 'Vendido', 'Resultado', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.mut, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>
                {goals.map(g => {
                  const sold = soldByMonth[g.month] || 0
                  const hit = sold >= Number(g.target)
                  return (
                    <tr key={g.id} style={{ borderTop: `1px solid ${C.bd}` }}>
                      <td style={{ padding: '10px 8px', textTransform: 'capitalize' }}>{monthLabel(g.month)}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 700 }}>{brl(g.target)}</td>
                      <td style={{ padding: '10px 8px' }}>{brl(sold)}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 700, color: hit ? C.grn : C.mut }}>
                        {hit ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Trophy size={13} /> Batida</span> : `${((sold / Number(g.target)) * 100).toFixed(0)}%`}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <button onClick={() => deleteGoal(g)} title="Remover meta" style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer' }}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={section}>
        <p className="rf-section-title" style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}><Package size={16} color="#7C3AED" /> Produtos</p>
        <p style={{ margin: '-6px 0 14px', fontSize: 12, color: C.mut }}>O Dashboard mostra quantas unidades de cada produto ativo faltam para bater a meta.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <div style={{ flex: '2 1 200px' }}>
            <label style={label}>Nome</label>
            <input style={input} value={prodForm.name} onChange={e => setProdForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Plano mensal" />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label style={label}>Preço (R$)</label>
            <input inputMode="decimal" style={input} value={prodForm.price} onChange={e => setProdForm(f => ({ ...f, price: e.target.value }))} placeholder="0" onKeyDown={e => e.key === 'Enter' && addProduct()} />
          </div>
          <button onClick={addProduct} style={btn('#7C3AED')}><Plus size={15} /> Adicionar</button>
        </div>

        {products.length === 0 ? (
          <p style={{ fontSize: 13, color: C.mut, margin: 0 }}>Nenhum produto cadastrado.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {products.map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', border: `1px solid ${C.bd}`, borderRadius: 10, padding: '8px 10px', opacity: p.active ? 1 : 0.55 }}>
                <input style={{ ...input, flex: '2 1 160px' }} defaultValue={p.name}
                  onBlur={e => e.target.value.trim() && e.target.value.trim() !== p.name && updateProduct(p.id, { name: e.target.value.trim() })} />
                <input style={{ ...input, flex: '1 1 100px' }} inputMode="decimal" defaultValue={String(p.price)}
                  onBlur={e => { const v = toNumber(e.target.value); if (v > 0 && v !== Number(p.price)) updateProduct(p.id, { price: v }) }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.mut, cursor: 'pointer' }}>
                  <input type="checkbox" checked={p.active} onChange={e => updateProduct(p.id, { active: e.target.checked })} /> Ativo
                </label>
                <button onClick={() => deleteProduct(p)} title="Remover produto" style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', padding: 4 }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
