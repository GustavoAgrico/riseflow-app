// Projetos de implantação / pós-venda com checklist. Funções puras sobre linhas de `projects`
// (supabase/projects.sql). O checklist vive em `steps` (jsonb) na própria linha.
// Regras:
//   - status é escolhido pela pessoa; o checklist só SUGERE (não conclui sozinho);
//   - o primeiro passo marcado tira o projeto de "Planejamento" para "Em andamento";
//   - com todos os passos feitos, a tela oferece mover para revisão/concluir.

export const STATUSES = [
  { id: 'planning', label: 'Planejamento', color: '#94A3B8' },
  { id: 'active', label: 'Em andamento', color: '#3B82F6' },
  { id: 'review', label: 'Em revisão', color: '#EAB308' },
  { id: 'done', label: 'Concluído', color: '#22C55E' },
]
export const statusOf = (id) => STATUSES.find(s => s.id === id) || STATUSES[0]

// Modelo inicial de um projeto novo (pode ser editado depois).
export const DEFAULT_STEPS = [
  'Reunião de início com o cliente',
  'Acessos e integrações liberados',
  'Configuração do CRM e do WhatsApp',
  'Treinamento da equipe',
  'Revisão final e entrada no ar',
]

let seq = 0
export const newStepId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
export const makeSteps = (titles = DEFAULT_STEPS) => titles.map(title => ({ id: newStepId(), title, done: false, done_at: null }))

export const localDay = (d = new Date()) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

const stepsOf = (p) => (Array.isArray(p?.steps) ? p.steps : [])

export function progress(p) {
  const steps = stepsOf(p)
  const done = steps.filter(s => s.done).length
  return { done, total: steps.length, pct: steps.length ? Math.round((done / steps.length) * 100) : 0 }
}

export const nextStep = (p) => stepsOf(p).find(s => !s.done) || null
export const isLate = (p, today = localDay()) => p?.status !== 'done' && Boolean(p?.due_date) && p.due_date < today
export const daysLeft = (p, today = localDay()) => {
  if (!p?.due_date) return null
  return Math.round((new Date(p.due_date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000)
}

// Marca/desmarca um passo. Devolve { steps, status } — status pode avançar de planning → active.
export function toggleStep(p, stepId, now = new Date().toISOString()) {
  const steps = stepsOf(p).map(s => (s.id === stepId ? { ...s, done: !s.done, done_at: s.done ? null : now } : s))
  const anyDone = steps.some(s => s.done)
  const status = p.status === 'planning' && anyDone ? 'active' : p.status
  return { steps, status }
}

export function addStep(p, title) {
  const t = String(title || '').trim().slice(0, 160)
  if (!t) return stepsOf(p)
  return [...stepsOf(p), { id: newStepId(), title: t, done: false, done_at: null }]
}

export const removeStep = (p, stepId) => stepsOf(p).filter(s => s.id !== stepId)
export const renameStep = (p, stepId, title) => stepsOf(p).map(s => (s.id === stepId ? { ...s, title: String(title).trim().slice(0, 160) || s.title } : s))

// Todos os passos feitos e o projeto ainda não está em revisão/concluído → oferecer o próximo status.
export function completionOffer(p) {
  const { done, total } = progress(p)
  if (!total || done < total) return null
  if (p.status === 'planning' || p.status === 'active') return 'review'
  if (p.status === 'review') return 'done'
  return null
}

// Ao mudar o status: concluído guarda completed_at; sair de concluído limpa.
export function statusPatch(p, status, now = new Date().toISOString()) {
  return { status, completed_at: status === 'done' ? (p.completed_at || now) : null }
}

export function filterProjects(list, { status = 'all', query = '' } = {}) {
  const q = query.trim().toLowerCase()
  return (list || []).filter(p => {
    if (status !== 'all' && p.status !== status) return false
    if (!q) return true
    return `${p.name || ''} ${p.client_name || ''} ${p.lead_name || ''}`.toLowerCase().includes(q)
  })
}

// Ordem da grade: atrasados primeiro, depois por prazo; concluídos no fim.
export function sortProjects(list, today = localDay()) {
  const rank = (p) => (p.status === 'done' ? 2 : isLate(p, today) ? 0 : 1)
  return [...(list || [])].sort((a, b) =>
    rank(a) - rank(b) || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) || String(a.name).localeCompare(String(b.name)))
}

export function summary(list, today = localDay()) {
  const month = today.slice(0, 7)
  const counts = Object.fromEntries(STATUSES.map(s => [s.id, 0]))
  let late = 0, doneThisMonth = 0
  for (const p of list || []) {
    counts[p.status] = (counts[p.status] || 0) + 1
    if (isLate(p, today)) late += 1
    if (p.status === 'done' && String(p.completed_at || '').slice(0, 7) === month) doneThisMonth += 1
  }
  return { counts, late, doneThisMonth, open: (list || []).filter(p => p.status !== 'done').length, all: (list || []).length }
}

// Validação do formulário de novo projeto. Devolve mensagem de erro ou null.
export function validateNew({ name, due_date }) {
  if (!String(name || '').trim()) return 'Dê um nome ao projeto.'
  if (!due_date) return 'Escolha o prazo de entrega.'
  return null
}
