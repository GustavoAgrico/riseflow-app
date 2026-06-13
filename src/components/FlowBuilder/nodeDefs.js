import { Zap, MessageSquare, GitFork, Settings, Bot, Plug } from 'lucide-react'

export const NODE_DEFS = {
  trigger: {
    color: '#10B981', Icon: Zap, label: 'Gatilho',
    preview: d => {
      if (d.triggerType === 'schedule') return `Horário ${d.startHour ?? '8'}h–${d.endHour ?? '18'}h`
      if (d.triggerType === 'tag_applied') return d.tag ? `Tag: ${d.tag}` : 'Tag aplicada'
      return d.keyword || d.triggerType
    },
    fields: [
      { key: 'triggerType', type: 'select', label: 'Tipo de gatilho', options: [
        { value: 'keyword',     label: 'Palavra-chave' },
        { value: 'new_contact', label: 'Primeiro contato' },
        { value: 'schedule',    label: 'Horário específico' },
        { value: 'tag_applied', label: 'Tag aplicada' },
        { value: 'message',     label: 'Qualquer mensagem' },
      ]},
      { key: 'keyword', type: 'input', label: 'Palavra-chave', placeholder: 'oi, olá, começar',
        when: d => !d.triggerType || d.triggerType === 'keyword' },
      { key: 'startHour', type: 'input', label: 'Hora início (0–23)', placeholder: '8',
        when: d => d.triggerType === 'schedule' },
      { key: 'endHour', type: 'input', label: 'Hora fim (0–23)', placeholder: '18',
        when: d => d.triggerType === 'schedule' },
      { key: 'tag', type: 'input', label: 'Tag necessária no contato', placeholder: 'lead-quente',
        when: d => d.triggerType === 'tag_applied' },
    ],
  },
  message: {
    color: '#FF6B35', Icon: MessageSquare, label: 'Mensagem',
    preview: d => d.text,
    fields: [
      { key: 'text', type: 'textarea', label: 'Mensagem', placeholder: 'Digite a mensagem...' },
    ],
  },
  condition: {
    color: '#3B82F6', Icon: GitFork, label: 'Condição',
    preview: d => d.value || d.conditionType,
    sources: [
      { id: 'yes', left: '30%', color: '#10B981' },
      { id: 'no',  left: '70%', color: '#EF4444' },
    ],
    fields: [
      { key: 'conditionType', type: 'select', label: 'Tipo de condição', options: [
        { value: 'contains',        label: 'Mensagem contém' },
        { value: 'first_time',      label: 'Primeira interação' },
        { value: 'has_tag',         label: 'Contato tem tag' },
        { value: 'business_hours',  label: 'Horário comercial (8h–18h)' },
      ]},
      { key: 'value', type: 'input', label: 'Palavra / frase', placeholder: 'sim, comprar',
        when: d => !d.conditionType || d.conditionType === 'contains' },
    ],
  },
  action: {
    color: '#8B5CF6', Icon: Settings, label: 'Ação',
    preview: d => d.tag || d.actionType,
    fields: [
      { key: 'actionType', type: 'select', label: 'Tipo de ação', options: [
        { value: 'add_tag',    label: 'Adicionar tag ao contato' },
        { value: 'remove_tag', label: 'Remover tag do contato' },
        { value: 'wait',       label: 'Aguardar resposta do contato' },
        { value: 'delay',      label: 'Aguardar tempo' },
        { value: 'human',      label: 'Transferir para humano' },
        { value: 'save_crm',   label: 'Salvar no CRM' },
      ]},
      { key: 'tag',        type: 'input', label: 'Tag',            placeholder: 'nome-da-tag', when: d => d.actionType === 'add_tag' || d.actionType === 'remove_tag' },
      { key: 'delayValue', type: 'input', label: 'Tempo (segundos)', placeholder: '30',          when: d => !d.actionType || d.actionType === 'delay' },
    ],
  },
  ai: {
    color: '#8B5CF6', Icon: Bot, label: 'Chat IA',
    preview: d => d.provider ? `${d.provider} — ${(d.systemPrompt ?? '').slice(0, 28)}…` : (d.systemPrompt ?? '').slice(0, 40),
    fields: [
      { key: 'provider', type: 'select', label: 'Provedor de IA', options: [
        { value: 'OpenAI GPT-4o-mini', label: 'OpenAI GPT-4o Mini (rápido)' },
        { value: 'OpenAI GPT-4o',     label: 'OpenAI GPT-4o (avançado)'    },
        { value: 'Claude Sonnet',     label: 'Claude Sonnet (Anthropic)'   },
        { value: 'Claude Haiku',      label: 'Claude Haiku (Anthropic, rápido)' },
      ]},
      { key: 'systemPrompt', type: 'textarea', label: 'Prompt do sistema (personalidade e regras)', placeholder: 'Você é um assistente de vendas amigável da {{empresa}}. Seja objetivo e empático.' },
      { key: 'temperature',  type: 'input',    label: 'Temperatura (0.0 a 1.0)',  placeholder: '0.7' },
      { key: 'maxTokens',    type: 'input',    label: 'Máximo de tokens',         placeholder: '500' },
      { key: 'fallback',     type: 'input',    label: 'Mensagem se IA falhar',    placeholder: 'Desculpe, estou com dificuldades. Um atendente vai te ajudar em breve!' },
    ],
  },
  integration: {
    color: '#EC4899', Icon: Plug, label: 'Integração',
    preview: d => d.prompt?.slice(0, 50) || d.webhookUrl?.slice(0, 50),
    fields: [
      { key: 'integrationType', type: 'select', label: 'Tipo', options: [
        { value: 'ai',      label: 'Chamar IA' },
        { value: 'webhook', label: 'Webhook externo' },
      ]},
      { key: 'prompt',     type: 'textarea', label: 'Prompt',          placeholder: 'Responda como assistente...',
        when: d => !d.integrationType || d.integrationType === 'ai' },
      { key: 'webhookUrl', type: 'input',    label: 'URL do Webhook',  placeholder: 'https://...',
        when: d => d.integrationType === 'webhook' },
    ],
  },
}
