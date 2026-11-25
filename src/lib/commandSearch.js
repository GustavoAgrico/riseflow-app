// Busca da paleta de comandos (Ctrl+K): páginas, ações de criação e contatos.
// Funções puras — a paleta só monta a lista e decide o que abrir.

// Minúsculas e sem acento: "Cobranças" casa com "cobrancas".
export const fold = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim()

const digits = (s) => String(s ?? '').replace(/\D/g, '')

// Pontua um texto contra a busca: começo do texto > começo de palavra > contém.
// Todas as palavras da busca precisam aparecer; 0 = não casa.
export function score(text, query) {
  const t = fold(text)
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  let total = 0
  for (const w of words) {
    const i = t.indexOf(w)
    if (i < 0) return 0
    total += i === 0 ? 3 : /[\s\-_/(.]/.test(t[i - 1]) ? 2 : 1
  }
  return total
}

// Ações do menu "Criar". `path` com ?novo=1 abre o formulário da página.
export const CREATE_ACTIONS = [
  { id: 'novo-contato', label: 'Novo contato no CRM', path: '/crm?novo=1', icon: 'UserPlus', keywords: 'lead cliente negocio deal' },
  { id: 'nova-reuniao', label: 'Nova reunião', path: '/agenda?novo=1', icon: 'CalendarPlus', keywords: 'agenda compromisso evento' },
  { id: 'nova-proposta', label: 'Nova proposta', path: '/proposals?novo=1', icon: 'FileText', keywords: 'orcamento' },
  { id: 'novo-projeto', label: 'Novo projeto', path: '/projetos?novo=1', icon: 'FolderPlus', keywords: 'implantacao checklist onboarding pos-venda' },
  { id: 'nova-cobranca', label: 'Nova cobrança', path: '/billing?novo=1', icon: 'Receipt', keywords: 'fatura parcela mensalidade boleto' },
  // O modal de fluxo vive no Layout: abre na tela de Fluxos (algumas telas, como o CRM, não usam o Layout).
  { id: 'novo-fluxo', label: 'Novo fluxo de automação', path: '/flows', action: 'new-flow', icon: 'GitBranch', keywords: 'funil bot automacao' },
]

// Atalhos "G e depois letra". Só aparecem os que o cargo pode abrir.
export const GO_KEYS = {
  d: '/dashboard', h: '/hoje', m: '/chat', c: '/crm', l: '/clients',
  f: '/funnel', a: '/agenda', p: '/projetos', v: '/vendas-ia', b: '/billing', r: '/reports', s: '/settings',
}

export function pageItems(navGroups, canAccess = () => true) {
  return navGroups.flatMap(g => g.items
    .filter(i => canAccess(i.path))
    .map(i => ({ kind: 'page', id: `page:${i.path}`, label: i.label, hint: g.label, path: i.path, icon: i.icon })))
}

export function createItems(canAccess = () => true) {
  return CREATE_ACTIONS
    .filter(a => !a.path || canAccess(a.path.split('?')[0]))
    .map(a => ({ kind: 'create', ...a, id: `create:${a.id}` }))
}

function rank(items, query, textOf, limit) {
  if (!fold(query)) return items.slice(0, limit)
  return items
    .map(it => ({ it, s: score(textOf(it), query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.it)
}

// Contato casa por nome, empresa, e-mail ou telefone (só dígitos).
export function searchContacts(contacts, query, limit = 6) {
  const q = fold(query)
  if (!q) return []
  const qd = digits(query)
  const out = []
  for (const c of contacts || []) {
    let s = score(`${c.name || ''} ${c.company || ''} ${c.email || ''}`, query)
    if (!s && qd.length >= 4 && digits(c.phone).includes(qd)) s = 1
    if (s) out.push({ c, s })
  }
  return out.sort((a, b) => b.s - a.s).slice(0, limit).map(({ c }) => ({
    kind: 'contact', id: `contact:${c.id}`, label: c.name || c.phone || 'Sem nome',
    hint: [c.company, c.phone].filter(Boolean).join(' · '), path: `/crm?abrir=${encodeURIComponent(c.id)}`,
  }))
}

// Monta os grupos da paleta. mode 'create' mostra só as ações de criar.
export function buildSections({ query, mode, pages, creates, contacts }) {
  if (mode === 'create') {
    return [{ id: 'create', title: 'Criar', items: rank(creates, query, a => `${a.label} ${a.keywords || ''}`, 10) }]
      .filter(s => s.items.length)
  }
  const q = fold(query)
  return [
    { id: 'contacts', title: 'Contatos', items: searchContacts(contacts, query) },
    { id: 'pages', title: 'Páginas', items: rank(pages, query, p => `${p.label} ${p.hint}`, q ? 6 : 8) },
    { id: 'create', title: 'Criar', items: rank(creates, query, a => `${a.label} ${a.keywords || ''}`, q ? 3 : 5) },
  ].filter(s => s.items.length)
}

// Alvo de digitação ou diálogo aberto: atalhos de uma tecla não podem disparar.
export function isTypingTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}
