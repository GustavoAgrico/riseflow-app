// Leituras visuais do pipeline (CRM e Painel ao vivo). Funções puras.
// Complementa src/lib/metrics.js (valores/conversão): aqui ficam ritmo, alcance por etapa e saúde.
import { stageOf } from './metrics'

const DAY = 86400000
const dayKey = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

// Leads que entraram por dia nos últimos `days` dias (inclui hoje).
export function leadsPerDay(rows, days = 14, now = new Date()) {
  const out = []
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * DAY)
    out.push({ key: dayKey(d), label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), count: 0 })
  }
  const idx = Object.fromEntries(out.map((o, i) => [o.key, i]))
  for (const r of rows || []) {
    const t = r.created_at || r.createdAt
    if (!t) continue
    const i = idx[dayKey(t)]
    if (i != null) out[i].count += 1
  }
  return out
}

// Alcance por etapa: quantos negócios chegaram ATÉ cada etapa aberta/ganha (supõe avanço em ordem).
// Perdidos ficam de fora do alcance. conv = % que passou da etapa anterior para esta.
export function stageReach(rows, stages) {
  const flow = stages.filter(s => s.kind !== 'lost')
  const pos = Object.fromEntries(flow.map((s, i) => [s.key, i]))
  const at = flow.map(() => 0)
  let lost = 0
  for (const r of rows || []) {
    const k = stageOf(r, stages)
    if (pos[k] == null) { lost += 1; continue }
    at[pos[k]] += 1
  }
  const reach = flow.map((_, i) => at.slice(i).reduce((a, n) => a + n, 0))
  return {
    lost,
    steps: flow.map((s, i) => ({
      key: s.key, label: s.label, color: s.color, here: at[i], reached: reach[i],
      conv: i === 0 ? null : reach[i - 1] ? Math.round((reach[i] / reach[i - 1]) * 1000) / 10 : 0,
    })),
  }
}

// Saúde: negócios abertos parados (sem mudança/sem entrada há N dias), sem valor, sem telefone.
export function pipelineHealth(rows, stages, { staleDays = 7, now = Date.now() } = {}) {
  const open = (rows || []).filter(r => {
    const s = stages.find(x => x.key === stageOf(r, stages))
    return !s || s.kind === 'open'
  })
  const ageDays = (r) => {
    const t = r.updated_at || r.created_at || r.createdAt
    return t ? Math.floor((now - new Date(t).getTime()) / DAY) : null
  }
  return {
    open: open.length,
    stale: open.filter(r => (ageDays(r) ?? 0) >= staleDays).length,
    noValue: open.filter(r => !(Number(r.value) > 0)).length,
    noPhone: open.filter(r => !String(r.phone || '').replace(/\D/g, '')).length,
    newToday: (rows || []).filter(r => { const a = ageDays({ created_at: r.created_at || r.createdAt }); return a === 0 }).length,
  }
}

// Idade → cor do selo no card: verde (novo), âmbar (esfriando), vermelho (parado).
export function ageTone(createdOrUpdated, now = Date.now()) {
  if (!createdOrUpdated) return null
  const d = Math.floor((now - new Date(createdOrUpdated).getTime()) / DAY)
  const label = d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `${d}d`
  return { days: d, label, color: d <= 2 ? '#22C55E' : d <= 13 ? '#EAB308' : '#EF4444' }
}

// Diferenças entre duas leituras do pipeline (feed "ao vivo"): entradas e mudanças de etapa.
export function diffPipeline(prev, next, stages) {
  if (!prev) return []
  const before = new Map(prev.map(r => [r.id, r]))
  const label = (k) => stages.find(s => s.key === k)?.label || k
  const color = (k) => stages.find(s => s.key === k)?.color || '#7C3AED'
  const events = []
  for (const r of next) {
    const p = before.get(r.id)
    if (!p) events.push({ id: `${r.id}:new`, dealId: r.id, kind: 'new', name: r.name, text: `entrou em ${label(stageOf(r, stages))}`, color: color(stageOf(r, stages)) })
    else if (stageOf(p, stages) !== stageOf(r, stages)) {
      const to = stageOf(r, stages)
      const kind = stages.find(s => s.key === to)?.kind
      events.push({ id: `${r.id}:${to}`, dealId: r.id, kind: kind === 'won' ? 'won' : kind === 'lost' ? 'lost' : 'move', name: r.name, text: `${label(stageOf(p, stages))} → ${label(to)}`, color: color(to) })
    }
  }
  return events
}
