// Protocolo de ações da IA no CRM — parte pura (sem banco), testável.
//
// Os provedores usados pelo atendente (Gemini, Groq, OpenAI, Claude) não têm o
// mesmo formato de tool-calling, então a IA pede ações com marcadores no texto,
// no mesmo espírito do [TRANSFERIR] que já existia:
//
//   [[ACAO tipo="criar_tarefa" titulo="Enviar orçamento" prazo="amanha"]]
//   [[ACAO tipo="mover_etapa" etapa="Proposta"]]
//   [[ACAO tipo="agendar" data="2026-11-25" hora="14:30" titulo="Visita técnica"]]
//
// O servidor tira os marcadores antes de enviar a resposta ao contato.

const ACTION_TYPES = {
  criar_tarefa: { label: 'Criar tarefa', required: ['titulo'] },
  mover_etapa: { label: 'Mover etapa do funil', required: ['etapa'] },
  agendar: { label: 'Agendar reunião', required: ['data'] },
}
const MAX_ACTIONS = 3

const TAG_RE = /\[\[\s*A[CÇ][AÃ]O\b([^\]]*)\]\]/gi
const ATTR_RE = /([a-zA-Z_]+)\s*=\s*"([^"]*)"/g

/** Separa a resposta ao contato das ações pedidas. Ações inválidas são descartadas. */
function parseActions(raw) {
  const text = String(raw ?? '')
  const actions = []
  for (const m of text.matchAll(TAG_RE)) {
    const attrs = {}
    for (const a of m[1].matchAll(ATTR_RE)) attrs[a[1].toLowerCase()] = a[2].trim()
    const def = ACTION_TYPES[attrs.tipo]
    if (!def) continue
    if (def.required.some(k => !attrs[k])) continue
    const { tipo, ...params } = attrs
    actions.push({ type: tipo, params })
    if (actions.length >= MAX_ACTIONS) break
  }
  const clean = text.replace(TAG_RE, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text: clean, actions }
}

/** Resumo curto em português de uma ação, para a fila de aprovação e os logs. */
function describeAction(action) {
  const p = action?.params || {}
  if (action?.type === 'criar_tarefa') return `Criar tarefa "${p.titulo}"${p.prazo ? ` (prazo: ${p.prazo})` : ''}`
  if (action?.type === 'mover_etapa') return `Mover para a etapa "${p.etapa}"`
  if (action?.type === 'agendar') return `Agendar ${p.titulo ? `"${p.titulo}" ` : ''}em ${p.data}${p.hora ? ` às ${p.hora}` : ''}`
  return 'Ação desconhecida'
}

/** Trecho do prompt que ensina a IA a pedir ações. */
function actionsPrompt({ stages = [], today, mode }) {
  const stageList = stages.map(s => s.label).join(', ')
  return `
AÇÕES NO CRM (use só quando a conversa pedir; no máximo ${MAX_ACTIONS}):
- Escreva a resposta ao cliente normalmente e, em linhas separadas no fim, os marcadores abaixo. O cliente NÃO vê os marcadores.
- Criar tarefa para o time: [[ACAO tipo="criar_tarefa" titulo="..." prazo="hoje|amanha|+N|AAAA-MM-DD"]]
- Mover o cliente no funil de vendas: [[ACAO tipo="mover_etapa" etapa="<uma de: ${stageList || 'Novo Lead, Qualificado, Proposta, Negociação, Fechado, Perdido'}>"]]
- Agendar reunião ou visita combinada com o cliente: [[ACAO tipo="agendar" data="AAAA-MM-DD" hora="HH:MM" titulo="..."]]
- Hoje é ${today}. Só agende data e hora que o cliente confirmou.${mode === 'approve'
    ? '\n- Não confirme ao cliente que a ação foi feita: um humano ainda vai aprovar. Diga, por exemplo, "vou registrar" ou "vou confirmar a agenda".'
    : ''}`
}

module.exports = { ACTION_TYPES, MAX_ACTIONS, parseActions, describeAction, actionsPrompt }
