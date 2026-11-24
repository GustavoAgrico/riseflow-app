// Executor de ferramentas de um turno.
//   - valida a entrada contra o esquema (campos desconhecidos são descartados);
//   - aplica approval_policy do agente por risco: 'auto' roda, 'ask' cria pedido de aprovação, 'deny' recusa;
//   - memoriza (ferramenta + entrada) no turno: se a troca de provedor refizer o turno,
//     a mesma chamada devolve o resultado anterior em vez de agir de novo.
// O resultado volta ao modelo como dado; erro vira { error } para o modelo explicar ao usuário.

const DEFAULT_POLICY = { baixo: 'auto', medio: 'auto', alto: 'ask' }
const RESULT_CHARS = 6000

function typeOk(schema, v) {
  switch (schema.type) {
    case 'string': return typeof v === 'string'
    case 'integer': return Number.isInteger(v)
    case 'number': return typeof v === 'number' && Number.isFinite(v)
    case 'boolean': return typeof v === 'boolean'
    case 'array': return Array.isArray(v)
    case 'object': return v && typeof v === 'object' && !Array.isArray(v)
    default: return true
  }
}

// Validação mínima de JSON Schema (o que o catálogo usa). Devolve { value } ou { error }.
function validate(schema, input, path = 'entrada') {
  if (input === undefined || input === null) {
    return schema.type === 'object' ? validate(schema, {}, path) : { error: `${path} ausente` }
  }
  if (schema.type === 'integer' && typeof input === 'string' && /^-?\d+$/.test(input)) input = Number(input)
  if (!typeOk(schema, input)) return { error: `${path} deveria ser ${schema.type}` }
  if (schema.enum && !schema.enum.includes(input)) return { error: `${path} deve ser um de: ${schema.enum.join(', ')}` }
  if (schema.type === 'string' && schema.maxLength && input.length > schema.maxLength) input = input.slice(0, schema.maxLength)
  if ((schema.type === 'integer' || schema.type === 'number')) {
    if (schema.minimum != null && input < schema.minimum) input = schema.minimum
    if (schema.maximum != null && input > schema.maximum) input = schema.maximum
  }
  if (schema.type === 'array') {
    const items = schema.maxItems ? input.slice(0, schema.maxItems) : input
    const out = []
    for (let i = 0; i < items.length; i++) {
      const r = schema.items ? validate(schema.items, items[i], `${path}[${i}]`) : { value: items[i] }
      if (r.error) return r
      out.push(r.value)
    }
    return { value: out }
  }
  if (schema.type === 'object' && schema.properties) {
    const out = {}
    for (const key of schema.required || []) {
      if (input[key] === undefined || input[key] === null || input[key] === '') return { error: `${path}.${key} é obrigatório` }
    }
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (input[key] === undefined || input[key] === null) continue
      const r = validate(sub, input[key], `${path}.${key}`)
      if (r.error) return r
      out[key] = r.value
    }
    return { value: out }
  }
  return { value: input }
}

const stable = (v) => JSON.stringify(v, Object.keys(v || {}).sort())
const clip = (result) => {
  const s = JSON.stringify(result ?? null)
  return s.length > RESULT_CHARS ? { truncated: true, preview: s.slice(0, RESULT_CHARS) } : result
}

// tools: saída de toolsForAgent; requestApproval(tool, input) → { id, summary }.
// recall(callKey) → resultado já gravado de uma tentativa anterior do mesmo item da fila
// (retentativa do worker não repete a ação); logEvent({ callKey, ... }) grava o resultado.
function createExecutor({ ctx, tools, policy, requestApproval, recall = async () => null, logEvent = async () => {} }) {
  const byName = Object.fromEntries(tools.map(t => [t.name, t]))
  const rules = { ...DEFAULT_POLICY, ...(policy || {}) }
  const memo = new Map()
  const log = { calls: [], approvals: [] }

  async function execute(name, rawInput) {
    const key = `${name}:${stable(rawInput || {})}`
    if (memo.has(key)) return memo.get(key)
    const previous = await recall(key).catch(() => null)
    if (previous) {
      memo.set(key, previous)
      if (previous.pending_approval) log.approvals.push({ id: previous.approval_id, summary: previous.summary })
      return previous
    }

    const tool = byName[name]
    let out
    if (!tool) {
      out = { error: `A ferramenta ${name} não está disponível para este agente.` }
    } else {
      const v = validate(tool.schema, rawInput || {})
      if (v.error) {
        out = { error: `Entrada inválida: ${v.error}.` }
      } else {
        const rule = rules[tool.risk] || 'ask'
        if (rule === 'deny') {
          out = { error: 'Esta ação está proibida para este agente pelas configurações da conta.' }
        } else if (rule === 'ask') {
          try {
            const approval = await requestApproval(tool, v.value)
            log.approvals.push(approval)
            out = { pending_approval: true, approval_id: approval.id, summary: approval.summary,
              note: 'Pedido de aprovação criado. A ação só acontece quando o dono aprovar no cartão da conversa. Avise o usuário.' }
          } catch (e) {
            out = { error: e?.expected ? e.message : `Não consegui pedir aprovação: ${e?.message || e}` }
          }
        } else {
          try {
            out = clip(await tool.run(ctx, v.value))
          } catch (e) {
            out = { error: e?.expected || e?.status ? e.message : `Falha ao executar ${name}: ${e?.message || e}` }
          }
        }
      }
    }

    memo.set(key, out)
    log.calls.push({ name, ok: !out?.error, pending: Boolean(out?.pending_approval) })
    await logEvent({ callKey: key, tool: name, input: rawInput || {}, ok: !out?.error, pending: Boolean(out?.pending_approval), result: out }).catch(() => {})
    return out
  }

  return { execute, log }
}

module.exports = { createExecutor, validate, DEFAULT_POLICY }
