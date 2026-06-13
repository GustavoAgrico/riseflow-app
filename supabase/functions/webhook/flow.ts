// Runner stateful do FlowBuilder para o bot 24/7 (server-side, Deno).
//
// Porta a lógica do FlowEngine (src/services/flowEngine.js) para a Edge Function,
// com ESTADO por conversa: quando o flow atinge a ação "Aguardar resposta" (wait),
// ele salva onde parou (conversations.flow_id + flow_node_id) e para. Na próxima
// mensagem recebida, retoma a partir da saída do nó wait, usando a resposta do
// cliente para avaliar as condições seguintes.
//
// O envio de mensagem, a IA e a config são injetados via `deps` (definidos no
// index.ts) para reaproveitar callAI / sendBaileys / buildSystemPrompt.

export interface FlowConv {
  id: string
  user_id: string
  contact_phone: string
  contact_name?: string
  contact_channel?: string
  contact_email?: string
  contact_company?: string
  flow_id?: string | null
  flow_node_id?: string | null
  flow_vars?: Record<string, unknown> | null
}

export interface FlowDeps {
  supabase: any
  userId: string
  /** Envia texto via servidor Baileys + grava outbound em messages + atualiza preview da conversa. */
  sendText: (conv: FlowConv, text: string) => Promise<void>
  /** Gera resposta de IA para um nó `ai`/`integration:ai` (usa niche + histórico). */
  aiReply: (conv: FlowConv, node: any) => Promise<string>
}

type FlowData = { nodes?: any[]; edges?: any[] }

/* ─── Substituição de variáveis {var} / {{var}} ───────────────────────── */
const substituteVars = (text: string, conv: FlowConv): string => {
  const now = new Date()
  const map: Record<string, string> = {
    nome:      conv?.contact_name    ?? 'Cliente',
    telefone:  conv?.contact_phone   ?? '',
    email:     conv?.contact_email   ?? '',
    empresa:   conv?.contact_company ?? 'nossa empresa',
    data_hoje: now.toLocaleDateString('pt-BR'),
    data:      now.toLocaleDateString('pt-BR'),
    hora:      now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
  return Object.entries(map).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{+${k}\\}+`, 'gi'), v),
    text ?? '',
  )
}

// Normaliza p/ comparar: minúsculas, sem acento, sem espaços nas pontas.
// (assim "Olá", "ola" e "OLÁ" casam com a palavra-chave "olá")
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
const norm = (s: string): string => (s ?? '').toLowerCase().normalize('NFD').replace(DIACRITICS, '').trim()

const containsAny = (msgText: string, valueStr: string): boolean => {
  const hay = norm(msgText)
  const vals = (valueStr ?? '').split(',').map(v => norm(v)).filter(Boolean)
  return vals.length > 0 && vals.some(v => hay.includes(v))
}

/* ─── Avaliação de gatilho ──────────────────────────────────────────────
   async: 'tag_applied' consulta o banco (clients.tags). */
const checkTrigger = async (
  triggerNode: any,
  msgText: string,
  inboundCount: number,
  deps: FlowDeps,
  conv: FlowConv,
): Promise<boolean> => {
  const data = triggerNode?.data ?? {}
  const t = data.triggerType ?? data.sub
  switch (t) {
    case 'message':
    case 'any_message':
      return true
    case 'keyword':
      return containsAny(msgText, data.keyword ?? data.keywords ?? '')
    case 'new_contact':
    case 'first_contact':
      return inboundCount <= 1
    case 'contains':
      return containsAny(msgText, data.value ?? '')

    // Horário específico: dispara só se a mensagem chega na janela de horas configurada.
    // (Engine orientado a mensagem — não é agendador por relógio. getHours() = UTC no Deno.)
    case 'schedule': {
      const h = new Date().getHours()
      const start = Number(data.startHour ?? 8)
      const end = Number(data.endHour ?? 18)
      return start <= end ? (h >= start && h < end) : (h >= start || h < end)
    }

    // Tag aplicada: dispara quando o contato que enviou a mensagem já tem a tag.
    case 'tag_applied': {
      const tag = (data.tag ?? '').toLowerCase().trim()
      if (!tag || !conv.contact_phone) return false
      const { data: client } = await deps.supabase.from('clients')
        .select('tags').eq('user_id', deps.userId).eq('phone', conv.contact_phone).maybeSingle()
      return (client?.tags ?? []).some((x: string) => String(x).toLowerCase() === tag)
    }

    default:
      return false
  }
}

/* ─── Estado: salvar pausa / limpar ───────────────────────────────────── */
const saveState = async (deps: FlowDeps, conv: FlowConv, flowId: string, nodeId: string) => {
  conv.flow_id = flowId
  conv.flow_node_id = nodeId
  await deps.supabase.from('conversations')
    .update({ flow_id: flowId, flow_node_id: nodeId })
    .eq('id', conv.id)
}

const clearState = async (deps: FlowDeps, conv: FlowConv) => {
  conv.flow_id = null
  conv.flow_node_id = null
  await deps.supabase.from('conversations')
    .update({ flow_id: null, flow_node_id: null })
    .eq('id', conv.id)
}

/* ─── Limite curto de delay (edge function tem timeout) ───────────────── */
const DELAY_CAP_MS = 4000

/* ─── Nós ─────────────────────────────────────────────────────────────── */
class Runner {
  constructor(
    private deps: FlowDeps,
    private conv: FlowConv,
    private flowData: FlowData,
    private msgText: string,
    private inboundCount: number,
  ) {}

  stopped = false

  /** Executa os filhos (saídas sem handle yes/no) de um nó. */
  async traverseChildren(nodeId: string) {
    if (this.stopped) return
    const edges = (this.flowData.edges ?? []).filter(e => e.source === nodeId && !e.sourceHandle)
    if (edges.length === 0) console.log(`[Flow] nó ${nodeId} não tem próximo nó conectado (sem linha de saída)`)
    for (const edge of edges) {
      if (this.stopped) return
      const next = (this.flowData.nodes ?? []).find(n => n.id === edge.target)
      if (next) await this.executeNode(next)
    }
  }

  async executeNode(node: any) {
    if (this.stopped) return
    switch (node.type) {
      case 'message':
        await this.messageNode(node)
        break
      case 'condition':
        await this.conditionNode(node) // cuida da própria ramificação
        return
      case 'action': {
        const act = node.data?.actionType ?? node.data?.sub
        if (act === 'wait') {
          // PONTO DE PAUSA: salva onde parou e encerra. Retoma na próxima mensagem.
          await saveState(this.deps, this.conv, this.conv.flow_id as string, node.id)
          this.stopped = true
          return
        }
        await this.actionNode(node, act)
        break
      }
      case 'delay':
        await this.delayNode(node)
        break
      case 'ai':
        await this.aiNode(node)
        break
      case 'integration':
        await this.integrationNode(node)
        break
    }
    await this.traverseChildren(node.id)
  }

  async messageNode(node: any) {
    const text = substituteVars(node.data?.text ?? '', this.conv)
    if (text) {
      console.log(`[Flow] → enviando mensagem: "${text.slice(0, 50)}"`)
      try { await this.deps.sendText(this.conv, text) }
      catch (e) { console.error('[Flow] ✗ falha ao enviar mensagem:', (e as Error).message) }
    } else {
      console.log('[Flow] ⚠ nó message sem texto — nada enviado')
    }

    const buttons: string[] = node.data?.buttons ?? []
    if (buttons.length) {
      const btnText = buttons.map((b, i) => `${i + 1}. ${b}`).join('\n')
      try { await this.deps.sendText(this.conv, btnText) } catch (e) { console.error('[Flow] ✗ falha ao enviar botões:', (e as Error).message) }
    }
  }

  async conditionNode(node: any) {
    const result = await this.evalCondition(node)
    const handle = result ? 'yes' : 'no'
    const branch = (this.flowData.edges ?? []).find(e => e.source === node.id && e.sourceHandle === handle)
    if (branch) {
      const next = (this.flowData.nodes ?? []).find(n => n.id === branch.target)
      if (next) await this.executeNode(next)
    }
  }

  async evalCondition(node: any): Promise<boolean> {
    const data = node.data ?? {}
    const msgText = (this.msgText ?? '').toLowerCase().trim()
    switch (data.conditionType ?? data.sub) {
      case 'contains':
      case 'contains_word':
        return containsAny(msgText, data.value ?? '')
      case 'equals':
        return msgText === (data.value ?? '').toLowerCase()
      case 'first_time':
      case 'is_first_time':
      case 'new_contact':
        return this.inboundCount <= 1
      case 'business_hours': {
        const h = new Date().getHours()
        return h >= 8 && h < 18
      }
      case 'has_tag': {
        const tag = (data.value ?? data.tag ?? '').toLowerCase()
        const { data: client } = await this.deps.supabase.from('clients')
          .select('tags').eq('user_id', this.deps.userId).eq('phone', this.conv.contact_phone).maybeSingle()
        return (client?.tags ?? []).some((t: string) => t.toLowerCase() === tag)
      }
      default:
        return false
    }
  }

  async actionNode(node: any, act: string) {
    const data = node.data ?? {}
    const phone = this.conv.contact_phone
    switch (act) {
      case 'add_tag':
      case 'save_crm': {
        const { data: existing } = await this.deps.supabase.from('clients')
          .select('tags').eq('user_id', this.deps.userId).eq('phone', phone).maybeSingle()
        const existingTags: string[] = existing?.tags ?? []
        const tags = data.tag && !existingTags.includes(data.tag) ? [...existingTags, data.tag] : existingTags
        await this.deps.supabase.from('clients').upsert({
          user_id: this.deps.userId,
          name: this.conv.contact_name,
          phone,
          channel: this.conv.contact_channel ?? 'whatsapp',
          status: 'active',
          tags,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,phone' })
        break
      }
      case 'remove_tag': {
        const { data: existing } = await this.deps.supabase.from('clients')
          .select('tags').eq('user_id', this.deps.userId).eq('phone', phone).maybeSingle()
        const tags = (existing?.tags ?? []).filter((t: string) => t !== data.tag)
        await this.deps.supabase.from('clients')
          .update({ tags, updated_at: new Date().toISOString() })
          .eq('user_id', this.deps.userId).eq('phone', phone)
        break
      }
      case 'delay':
        await this.delayNode(node)
        break
      case 'human':
      case 'transfer_human':
        await this.deps.supabase.from('conversations')
          .update({ status: 'waiting_human', updated_at: new Date().toISOString() })
          .eq('id', this.conv.id)
        break
    }
  }

  async delayNode(node: any) {
    const val  = Number(node.data?.delayValue ?? node.data?.value ?? 3)
    const unit = node.data?.delayUnit ?? 'seconds'
    const ms = unit === 'minutes' ? val * 60_000 : unit === 'hours' ? val * 3_600_000 : val * 1_000
    await new Promise(r => setTimeout(r, Math.min(ms, DELAY_CAP_MS)))
  }

  async aiNode(node: any) {
    // IA nunca derruba o flow: se falhar (sem créditos/erro), pula e continua.
    let text = ''
    try {
      text = await this.deps.aiReply(this.conv, node)
    } catch (e) {
      console.warn('[Flow] IA indisponível, pulando node:', (e as Error).message)
      text = node.data?.fallback || '' // só manda fallback se o nó tiver um configurado
    }
    if (text) {
      try { await this.deps.sendText(this.conv, text) }
      catch (e) { console.error('[Flow] ✗ falha ao enviar resposta IA:', (e as Error).message) }
    } else {
      console.log('[Flow] node IA sem resposta — seguindo o flow')
    }
  }

  async integrationNode(node: any) {
    const data = node.data ?? {}
    const itype = data.integrationType ?? data.sub
    if (itype === 'ai') {
      await this.aiNode(node)
    } else if (itype === 'webhook' && data.webhookUrl) {
      try {
        await fetch(data.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact:   this.conv.contact_name,
            phone:     this.conv.contact_phone,
            channel:   this.conv.contact_channel,
            message:   this.msgText,
            timestamp: new Date().toISOString(),
          }),
        })
      } catch (e) {
        console.error('[Flow] webhook error:', (e as Error).message)
      }
    } else if (itype === 'crm') {
      await this.actionNode({ data: {} }, 'save_crm')
    }
  }
}

/* ─── Entry point ─────────────────────────────────────────────────────────
   Processa UMA mensagem recebida contra os flows. Retorna `true` se um flow
   tratou a mensagem (iniciou, retomou ou estava em andamento) — nesse caso o
   index.ts NÃO chama o autoReply genérico. Retorna `false` se nenhum flow
   casou (cai no fallback de IA). ─────────────────────────────────────────── */
export async function runFlowForMessage(
  deps: FlowDeps,
  conv: FlowConv,
  msgText: string,
  inboundCount: number,
): Promise<boolean> {
  let flowData: FlowData | undefined
  let startNodeId: string | undefined
  let resuming = false

  console.log(`[Flow] msg de ${conv.contact_phone}: "${(msgText ?? '').slice(0, 60)}" | user=${deps.userId} | meio-de-flow=${!!(conv.flow_id && conv.flow_node_id)}`)

  // 1) Está no meio de um flow? Tenta retomar a partir do nó wait salvo.
  if (conv.flow_id && conv.flow_node_id) {
    const { data: flow } = await deps.supabase.from('flows')
      .select('id, status, flow_data, triggers').eq('id', conv.flow_id).maybeSingle()
    const waitNode = flow?.status === 'active'
      ? (flow.flow_data?.nodes ?? []).find((n: any) => n.id === conv.flow_node_id)
      : null
    if (waitNode) {
      flowData = flow.flow_data
      startNodeId = waitNode.id // retoma da SAÍDA do wait (traverseChildren pula o próprio nó)
      resuming = true
    } else {
      // flow foi desativado/editado e o nó sumiu → limpa e tenta começar do zero
      await clearState(deps, conv)
    }
  }

  // 2) Não estava em flow: procura um flow ativo cujo gatilho case.
  if (!resuming) {
    const { data: flows, error } = await deps.supabase.from('flows')
      .select('id, status, flow_data, triggers').eq('user_id', deps.userId).eq('status', 'active')
    if (error) console.warn('[Flow] erro ao buscar flows ativos:', error.message)
    console.log(`[Flow] flows ativos do usuário: ${flows?.length ?? 0}`)
    for (const flow of flows ?? []) {
      const fd: FlowData = flow.flow_data
      const trigger = (fd?.nodes ?? []).find((n: any) => n.type === 'trigger')
      const nNodes = fd?.nodes?.length ?? 0
      if (!trigger) { console.log(`[Flow] flow ${flow.id}: SEM nó trigger (nós=${nNodes}) — pulando`); continue }
      const tType = trigger.data?.triggerType ?? trigger.data?.sub
      const matched = await checkTrigger(trigger, (msgText ?? '').toLowerCase().trim(), inboundCount, deps, conv)
      console.log(`[Flow] flow ${flow.id}: trigger=${tType} keyword="${trigger.data?.keyword ?? trigger.data?.keywords ?? ''}" nós=${nNodes} → ${matched ? 'CASOU ✅' : 'não casou'}`)
      if (matched) {
        flowData = fd
        startNodeId = trigger.id
        conv.flow_id = flow.id
        await deps.supabase.from('flows').update({ triggers: (flow.triggers ?? 0) + 1 }).eq('id', flow.id)
        break
      }
    }
  }

  if (!flowData || !startNodeId) {
    console.log('[Flow] ❌ nenhum flow casou — cai no fallback de IA (se ligado)')
    return false // nenhum flow tratou → fallback IA
  }

  console.log(`[Flow] ▶ executando flow a partir de ${startNodeId} (resumindo=${resuming})`)

  const runner = new Runner(deps, conv, flowData, msgText, inboundCount)
  await runner.traverseChildren(startNodeId)

  // Chegou ao fim sem pausar num wait → encerra a sessão do flow.
  if (!runner.stopped) await clearState(deps, conv)
  return true
}
