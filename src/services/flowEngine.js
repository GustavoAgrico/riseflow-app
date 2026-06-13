import { supabase as defaultSupabase } from '@/lib/supabase'
import { AIService } from '@/services/aiService'
import { usageService } from '@/services/usageService'
import { sendMessage as evoSend } from '@/services/evolutionApi'

/* ─── Variable substitution — handles {var} and {{var}} ─────────────── */
const substituteVars = (text, conv) => {
  const now = new Date()
  const map = {
    'nome':       conv?.contact_name    ?? 'Cliente',
    'telefone':   conv?.contact_phone   ?? '',
    'email':      conv?.contact_email   ?? '',
    'empresa':    conv?.contact_company ?? 'nossa empresa',
    'data_hoje':  now.toLocaleDateString('pt-BR'),
    'data':       now.toLocaleDateString('pt-BR'),
    'hora':       now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
  return Object.entries(map).reduce(
    (acc, [key, val]) => acc.replace(new RegExp(`\\{+${key}\\}+`, 'gi'), val),
    text ?? ''
  )
}

/* ─── Match message against comma-separated values ──────────────────────
   Normaliza acento/caixa: "Olá", "ola" e "OLÁ" casam com a palavra "olá". */
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
const norm = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(DIACRITICS, '').trim()
const containsAny = (msgText, valueStr) => {
  const hay = norm(msgText)
  const vals = (valueStr ?? '').split(',').map(v => norm(v)).filter(Boolean)
  return vals.length > 0 && vals.some(v => hay.includes(v))
}

/* ─── FlowEngine ─────────────────────────────────────────────────────── */
export class FlowEngine {
  /**
   * @param {string} userId
   * @param {{ simulation?: boolean, supabaseClient?: object }} opts
   *   Pass supabaseClient when running server-side (webhook / edge function).
   */
  constructor(userId, { simulation = false, supabaseClient } = {}) {
    this.userId     = userId
    this.simulation = simulation
    this.simLog     = []
    this.flows      = []
    this.db         = supabaseClient ?? defaultSupabase
    this.paused       = false   // ficou parado num nó "Aguardar resposta" (wait)
    this.pausedNodeId = null    // id do nó wait onde parou (p/ retomar na próxima msg)
  }

  /* ── Load active flows from Supabase ── */
  async loadFlows() {
    if (this.simulation) return []
    const { data } = await this.db
      .from('flows')
      .select('*')
      .eq('user_id', this.userId)
      .eq('status', 'active')
    this.flows = data ?? []
    console.log('[FlowEngine] Loaded', this.flows.length, 'active flows')
    return this.flows
  }

  /* ── Entry point: process an incoming message against all active flows ── */
  async processIncomingMessage(message, conversation) {
    console.log('[FlowEngine] Processing:', message.content)

    for (const flow of this.flows) {
      const flowData = flow.flow_data
      if (!flowData?.nodes?.length) continue

      const triggerNode = flowData.nodes.find(n => n.type === 'trigger')
      if (!triggerNode) continue
      if (!(await this.checkTrigger(triggerNode, message, conversation))) continue

      console.log('[FlowEngine] Flow triggered:', flow.name)

      if (!this.simulation) {
        await this.db.from('flows')
          .update({ triggers: (flow.triggers ?? 0) + 1 })
          .eq('id', flow.id)
      }

      await this.executeFromNode(triggerNode.id, flowData, message, conversation)
      break
    }
  }

  /* ── Run a flow directly (used by simulator) ── */
  async runFlow(flowData, message, conversation) {
    const triggerNode = flowData.nodes?.find(n => n.type === 'trigger')
    if (triggerNode) await this.executeFromNode(triggerNode.id, flowData, message, conversation)
  }

  /* ── Retoma um flow pausado num nó "Aguardar resposta" (wait) ──
     Continua a partir da SAÍDA do nó wait, usando a nova mensagem para
     avaliar as condições seguintes. Usado pelo simulador stateful. ── */
  async resumeFromNode(nodeId, flowData, message, conversation) {
    this.paused = false
    this.pausedNodeId = null
    await this.executeFromNode(nodeId, flowData, message, conversation)
  }

  /* ── Trigger evaluation ── (async: 'tag_applied' consulta o banco) */
  async checkTrigger(triggerNode, message, conversation) {
    const data = triggerNode.data ?? {}
    const msgText = (message.content ?? '').toLowerCase().trim()

    switch (data.triggerType) {
      case 'message':
      case 'any_message':
        return true

      case 'keyword':
        return containsAny(msgText, data.keyword ?? data.keywords ?? '')

      case 'new_contact':
      case 'first_contact':
        return (conversation.messages_count ?? 0) <= 1

      case 'contains':
        return containsAny(msgText, data.value ?? '')

      // Horário específico: dispara só se a mensagem chega na janela de horas configurada.
      // (Engine é orientado a mensagem — não é um agendador por relógio.)
      case 'schedule': {
        const h = new Date().getHours()
        const start = Number(data.startHour ?? 8)
        const end = Number(data.endHour ?? 18)
        return start <= end ? (h >= start && h < end) : (h >= start || h < end)
      }

      // Tag aplicada: dispara quando o contato que mandou a mensagem já tem a tag.
      case 'tag_applied': {
        const tag = (data.tag ?? '').toLowerCase().trim()
        if (!tag || !conversation.contact_phone) return false
        const { data: client } = await this.db.from('clients')
          .select('tags')
          .eq('user_id', this.userId)
          .eq('phone', conversation.contact_phone)
          .maybeSingle()
        return (client?.tags ?? []).some(t => String(t).toLowerCase() === tag)
      }

      default:
        return false
    }
  }

  /* ── Traverse edges from a node (non-branching) ── */
  async executeFromNode(nodeId, flowData, message, conversation) {
    if (this.paused) return
    const outEdges = (flowData.edges ?? []).filter(e => e.source === nodeId && !e.sourceHandle)
    for (const edge of outEdges) {
      if (this.paused) return
      const next = (flowData.nodes ?? []).find(n => n.id === edge.target)
      if (next) await this.executeNode(next, flowData, message, conversation)
    }
  }

  /* ── Execute a single node ── */
  async executeNode(node, flowData, message, conversation) {
    if (this.paused) return
    console.log('[FlowEngine] Node:', node.type, '|', node.data?.label ?? '')

    switch (node.type) {
      case 'message':
        await this.executeMessageNode(node, conversation)
        break
      case 'condition':
        await this.executeConditionNode(node, flowData, message, conversation)
        return // condition handles its own branching
      case 'action': {
        const act = node.data?.actionType ?? node.data?.sub
        if (act === 'wait') {
          // Ponto de pausa: para a travessia e marca onde parou. O bot real
          // (flow.ts) persiste isso no banco; o simulador guarda em memória.
          this.paused = true
          this.pausedNodeId = node.id
          if (this.simulation) this.simLog.push({ type: 'wait', label: node.data?.label })
          return
        }
        await this.executeActionNode(node, conversation)
        break
      }
      case 'delay':
        await this.executeDelayNode(node)
        break
      case 'ai':
        await this.executeAiNode(node, message, conversation)
        break
      case 'integration':
        await this.executeIntegrationNode(node, message, conversation)
        break
    }

    await this.executeFromNode(node.id, flowData, message, conversation)
  }

  /* ── Send a message via Evolution API + save to Supabase ── */
  async executeMessageNode(node, conversation) {
    const text = substituteVars(node.data?.text, conversation)
    if (!text) return

    if (this.simulation) {
      this.simLog.push({ type: 'message', text, buttons: node.data?.buttons ?? [] })
      return
    }

    // Respeita o limite do plano antes de enviar.
    try {
      if (this.userId && !(await usageService.canSend(this.userId))) {
        console.log('[FLOW] Limite atingido, flow pausado')
        return
      }
    } catch (e) { console.warn('[FLOW] checagem de limite falhou:', e?.message ?? e) }

    const { data: msg } = await this.db.from('messages').insert({
      conversation_id: conversation.id,
      user_id: this.userId,
      content: text,
      direction: 'outbound',
      status: 'sent',
      channel: conversation.contact_channel ?? 'whatsapp',
    }).select().single()

    await this.db.from('conversations').update({
      last_message: text,
      last_message_at: new Date().toISOString(),
    }).eq('id', conversation.id)

    try {
      const result = await evoSend(conversation.contact_phone, text)
      if (msg?.id && result?.key?.id) {
        await this.db.from('messages').update({ status: 'delivered' }).eq('id', msg.id)
      }
    } catch (e) {
      console.warn('[FlowEngine] WA offline:', e.message)
    }

    // Contabiliza a mensagem enviada no uso do plano.
    try { if (this.userId) await usageService.increment(this.userId) }
    catch (e) { console.warn('[FLOW] increment falhou:', e?.message ?? e) }

    if (node.data?.buttons?.length) {
      const btnText = node.data.buttons.map((b, i) => `${i + 1}. ${b}`).join('\n')
      await this.db.from('messages').insert({
        conversation_id: conversation.id,
        user_id: this.userId,
        content: btnText,
        direction: 'outbound',
        status: 'sent',
        channel: conversation.contact_channel ?? 'whatsapp',
      })
    }
  }

  /* ── Evaluate condition and follow yes/no branch ── */
  async executeConditionNode(node, flowData, message, conversation) {
    const data = node.data ?? {}
    const msgText = (message.content ?? '').toLowerCase().trim()
    let result = false

    switch (data.conditionType ?? data.sub) {
      case 'contains':
      case 'contains_word':
        result = containsAny(msgText, data.value ?? '')
        break

      case 'equals':
        result = msgText === (data.value ?? '').toLowerCase()
        break

      case 'first_time':
      case 'is_first_time':
      case 'new_contact':
        if (this.simulation) {
          result = true
        } else {
          const { count } = await this.db.from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conversation.id)
            .eq('direction', 'inbound')
          result = (count ?? 0) <= 1
        }
        break

      case 'business_hours': {
        const h = new Date().getHours()
        result = h >= 8 && h < 18
        break
      }

      case 'has_tag': {
        if (!this.simulation) {
          const tagToFind = (data.value ?? data.tag ?? '').toLowerCase()
          const { data: client } = await this.db.from('clients')
            .select('tags')
            .eq('user_id', this.userId)
            .eq('phone', conversation.contact_phone)
            .maybeSingle()
          result = (client?.tags ?? []).some(t => t.toLowerCase() === tagToFind)
        }
        break
      }
    }

    console.log('[FlowEngine] Condition', data.conditionType, '=', result)
    if (this.simulation) {
      this.simLog.push({ type: 'condition', label: data.label, conditionType: data.conditionType, result })
    }

    const edges = flowData.edges ?? []
    const branch = result
      ? edges.find(e => e.source === node.id && e.sourceHandle === 'yes')
      : edges.find(e => e.source === node.id && e.sourceHandle === 'no')

    if (branch) {
      const nextNode = (flowData.nodes ?? []).find(n => n.id === branch.target)
      if (nextNode) await this.executeNode(nextNode, flowData, message, conversation)
    }
  }

  /* ── Execute an action ── */
  async executeActionNode(node, conversation) {
    const data = node.data ?? {}
    const actionType = data.actionType ?? data.sub

    if (this.simulation) {
      this.simLog.push({ type: 'action', actionType, label: data.label ?? actionType })
      if (actionType === 'delay') {
        const ms = Math.min((Number(data.delayValue ?? 3)) * 1000, 1500)
        this.simLog.push({ type: 'delay', seconds: Number(data.delayValue ?? 3) })
        await new Promise(r => setTimeout(r, ms))
      }
      return
    }

    switch (actionType) {

      case 'add_tag':
      case 'save_crm': {
        const phone = conversation.contact_phone
        const { data: existing } = await this.db.from('clients')
          .select('tags').eq('user_id', this.userId).eq('phone', phone).maybeSingle()
        const existingTags = existing?.tags ?? []
        const newTag = data.tag
        const tags = newTag && !existingTags.includes(newTag)
          ? [...existingTags, newTag]
          : existingTags
        await this.db.from('clients').upsert({
          user_id: this.userId,
          name: conversation.contact_name,
          phone,
          channel: conversation.contact_channel ?? 'whatsapp',
          status: 'active',
          tags,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,phone' })
        console.log('[FlowEngine] CRM upsert:', phone, '| tags:', tags)
        break
      }

      case 'remove_tag': {
        const phone = conversation.contact_phone
        const { data: existing } = await this.db.from('clients')
          .select('tags').eq('user_id', this.userId).eq('phone', phone).maybeSingle()
        const tags = (existing?.tags ?? []).filter(t => t !== data.tag)
        await this.db.from('clients')
          .update({ tags, updated_at: new Date().toISOString() })
          .eq('user_id', this.userId).eq('phone', phone)
        break
      }

      case 'delay': {
        const val = Number(data.delayValue ?? data.value ?? 3)
        const unit = data.delayUnit ?? 'seconds'
        const ms = unit === 'minutes' ? val * 60_000
                 : unit === 'hours'   ? val * 3_600_000
                 : val * 1_000
        console.log('[FlowEngine] Delay action', val, unit)
        await new Promise(r => setTimeout(r, ms))
        break
      }

      case 'human':
      case 'transfer_human':
        await this.db.from('conversations')
          .update({ status: 'waiting_human', updated_at: new Date().toISOString() })
          .eq('id', conversation.id)
        console.log('[FlowEngine] Transferred to human')
        break
    }
  }

  /* ── Wait (standalone delay node) ── */
  async executeDelayNode(node) {
    const val  = Number(node.data?.delayValue ?? node.data?.value ?? 3)
    const unit = node.data?.delayUnit ?? 'seconds'
    const ms   = unit === 'minutes' ? val * 60_000 : unit === 'hours' ? val * 3_600_000 : val * 1_000

    if (this.simulation) {
      this.simLog.push({ type: 'delay', seconds: val })
      await new Promise(r => setTimeout(r, Math.min(ms, 1500)))
      return
    }
    console.log('[FlowEngine] Delay node', val, unit)
    await new Promise(r => setTimeout(r, ms))
  }

  /* ── AI node: calls AIService with conversation history ── */
  async executeAiNode(node, message, conversation) {
    const data         = node.data ?? {}
    const provider     = data.provider     ?? 'OpenAI GPT-4o-mini'
    const systemPrompt = substituteVars(data.systemPrompt ?? '', conversation)
    const fallback     = data.fallback     || 'Desculpe, estou com dificuldades. Um atendente vai te ajudar em breve!'

    if (this.simulation) {
      this.simLog.push({ type: 'ai', provider, label: data.label ?? provider })
      this.simLog.push({ type: 'message', text: `[Resposta ${provider} — "${systemPrompt.slice(0, 40)}…"]`, buttons: [] })
      return
    }

    const aiService = new AIService(this.db)
    const history   = await aiService.getConversationHistory(conversation.contact_phone)

    const result = await aiService.chat({
      provider,
      systemPrompt,
      userMessage:         message.content,
      temperature:         data.temperature,
      maxTokens:           data.maxTokens,
      userId:              this.userId,
      conversationHistory: history,
    })

    const responseText = result.success
      ? result.response
      : (fallback || `[AI indisponível: ${result.error}]`)

    if (!result.success) {
      console.warn('[FlowEngine] AI fallback:', result.error)
    }

    await this.executeMessageNode({ data: { text: responseText } }, conversation)
  }

  /* ── Integrations: AI (OpenAI / Claude), Webhook, CRM ── */
  async executeIntegrationNode(node, message, conversation) {
    const data  = node.data ?? {}
    const itype = data.integrationType ?? data.sub

    if (this.simulation) {
      this.simLog.push({ type: 'integration', integrationType: itype, label: data.label })
      if (itype === 'ai') {
        this.simLog.push({ type: 'message', text: `[Resposta IA — "${(data.prompt ?? '').slice(0, 50)}..."]`, buttons: [] })
      }
      return
    }

    if (itype === 'ai') {
      // Unificado com o nó "ai": usa o AIService (chaves de settings + fallback
      // automático OpenAI↔Claude), em vez de uma chave avulsa da tabela integrations.
      const aiService = new AIService(this.db)
      const history   = await aiService.getConversationHistory(conversation.contact_phone)
      const result    = await aiService.chat({
        provider:            data.provider, // undefined → tenta OpenAI e cai p/ Claude
        systemPrompt:        substituteVars(data.prompt ?? 'Você é um assistente de atendimento.', conversation),
        userMessage:         message.content,
        userId:              this.userId,
        conversationHistory: history,
      })
      if (result.success && result.response) {
        await this.executeMessageNode({ data: { text: result.response } }, conversation)
      } else {
        console.warn('[FlowEngine] Integração IA falhou:', result.error)
      }
    }

    if (itype === 'webhook' && data.webhookUrl) {
      try {
        await fetch(data.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact:  conversation.contact_name,
            phone:    conversation.contact_phone,
            channel:  conversation.contact_channel,
            message:  message.content,
            timestamp: new Date().toISOString(),
          }),
        })
        console.log('[FlowEngine] Webhook sent to', data.webhookUrl)
      } catch (e) {
        console.error('[FlowEngine] Webhook error:', e.message)
      }
    }

    if (itype === 'crm') {
      await this.executeActionNode({ data: { actionType: 'save_crm' } }, conversation)
    }
  }
}
