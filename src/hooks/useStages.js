// Etapas do funil, compartilhadas por CRM, Painel ao vivo, Dashboard e Funil.
// Fonte: tabela pipeline_stages (por conta). Sem linhas → usa DEFAULT_STAGES.
// `key` casa com clients.stage. `kind`: open|won|lost. `probability` 0-100.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'

export const DEFAULT_STAGES = [
  { key: 'lead',   label: 'Novo Lead',   color: '#7C3AED', kind: 'open', probability: 10 },
  { key: 'qual',   label: 'Qualificado', color: '#2563EB', kind: 'open', probability: 30 },
  { key: 'prop',   label: 'Proposta',    color: '#D97706', kind: 'open', probability: 50 },
  { key: 'neg',    label: 'Negociação',  color: '#0891B2', kind: 'open', probability: 70 },
  { key: 'closed', label: 'Fechado',     color: '#059669', kind: 'won',  probability: 100 },
  { key: 'lost',   label: 'Perdido',     color: '#EF4444', kind: 'lost', probability: 0 },
]

export const newStageKey = () => 's_' + Math.random().toString(36).slice(2, 8)

const normalize = (r) => ({
  key: r.key,
  label: r.label,
  color: r.color || '#7C3AED',
  kind: r.kind || 'open',
  probability: typeof r.probability === 'number' ? r.probability : (r.kind === 'won' ? 100 : r.kind === 'lost' ? 0 : 20),
})

export function useStages() {
  const { ownerUserId, isDemoMode } = useAuth()
  const [stages, setStages] = useState(DEFAULT_STAGES)
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (isDemoMode || !ownerUserId) { setStages(DEFAULT_STAGES); setLoaded(true); return }
    try {
      const { data } = await supabase.from('pipeline_stages').select('*').eq('user_id', ownerUserId).order('position', { ascending: true })
      setStages(data && data.length ? data.map(normalize) : DEFAULT_STAGES)
    } catch { setStages(DEFAULT_STAGES) }
    setLoaded(true)
  }, [ownerUserId, isDemoMode])

  useEffect(() => { reload() }, [reload])
  return { stages, loaded, reload }
}

// Persiste a lista inteira (substitui as etapas da conta) e reatribui os leads
// cujas etapas foram removidas para a primeira etapa restante.
export async function saveStages(ownerUserId, list, prevKeys = []) {
  if (!ownerUserId) throw new Error('sem conta')
  const clean = list
    .filter(s => (s.label || '').trim())
    .map((s, i) => ({
      user_id: ownerUserId,
      key: s.key || newStageKey(),
      label: s.label.trim(),
      color: s.color || '#7C3AED',
      position: i,
      kind: s.kind || 'open',
      probability: Math.max(0, Math.min(100, Number(s.probability) || 0)),
    }))
  const newKeys = clean.map(s => s.key)
  const removed = prevKeys.filter(k => !newKeys.includes(k))
  // Reatribui leads das etapas removidas para a primeira etapa
  if (removed.length && clean.length) {
    await supabase.from('clients').update({ stage: clean[0].key }).eq('user_id', ownerUserId).in('stage', removed)
  }
  // Substitui o conjunto de etapas
  await supabase.from('pipeline_stages').delete().eq('user_id', ownerUserId)
  const { error } = await supabase.from('pipeline_stages').insert(clean)
  if (error) throw error
  return clean
}
