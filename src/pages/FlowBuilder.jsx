import React, { useState, useCallback, useRef, memo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { supabase } from '@/lib/supabase'
import ReactFlow, {
  Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState,
  Handle, Position, MarkerType, BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Save, Check, Zap, ZapOff, Loader2, ArrowLeft, LayoutTemplate, X, Hand, Target, Bot, ShoppingCart, Star, Rocket } from 'lucide-react'
import clsx from 'clsx'
import { NodePalette } from '@components/FlowBuilder/NodePalette'
import { useIsMobile } from '@hooks/useIsMobile'
import { ConfigPanel } from '@components/FlowBuilder/ConfigPanel'
import { NODE_DEFS } from '@components/FlowBuilder/nodeDefs'
import { logger } from '@services/activityLogger'

const EDGE_DEF = {
  type: 'smoothstep', animated: true,
  style: { stroke: '#FF6B35', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#FF6B35' },
}
const EYES = { ...EDGE_DEF, style: { stroke: '#10B981', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' } }
const ENO  = { ...EDGE_DEF, style: { stroke: '#EF4444',  strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#EF4444'  } }

const TEMPLATES = [
  {
    id: 'welcome-menu',
    label: 'Boas-vindas com Menu',
    Icon: Hand,
    desc: 'Recebe o contato, apresenta opções e roteia automaticamente para suporte ou vendas',
    nodes: [
      { id: 'n1', type: 'trigger',   position: { x: 250, y: 40  }, data: { triggerType: 'new_contact', keyword: '' } },
      { id: 'n2', type: 'message',   position: { x: 250, y: 200 }, data: { text: 'Olá, {{nome}}! Bem-vindo(a) à {{empresa}} 👋\n\nComo posso te ajudar?\n\n1️⃣ Suporte técnico\n2️⃣ Falar com vendas\n3️⃣ Horários e informações' } },
      { id: 'n3', type: 'condition', position: { x: 250, y: 390 }, data: { conditionType: 'contains', value: '1,suporte,problema' } },
      { id: 'n4', type: 'action',    position: { x: 50,  y: 560 }, data: { actionType: 'add_tag', tag: 'suporte' } },
      { id: 'n5', type: 'message',   position: { x: 50,  y: 720 }, data: { text: '🔧 Conectando você ao suporte técnico...\nUm atendente estará com você em instantes!' } },
      { id: 'n6', type: 'message',   position: { x: 450, y: 560 }, data: { text: '💼 Nosso time de vendas vai te atender!\n\nEnquanto isso, qual produto te interessa? Assim já agilizamos! 😊' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', ...EDGE_DEF },
      { id: 'e2', source: 'n2', target: 'n3', ...EDGE_DEF },
      { id: 'e3', source: 'n3', target: 'n4', sourceHandle: 'yes', ...EYES },
      { id: 'e4', source: 'n3', target: 'n6', sourceHandle: 'no',  ...ENO  },
      { id: 'e5', source: 'n4', target: 'n5', ...EDGE_DEF },
    ],
  },
  {
    id: 'lead-qualify',
    label: 'Qualificação de Lead B2B',
    Icon: Target,
    desc: 'Identifica perfil do lead, segmenta entre B2B e B2C e direciona para o time certo',
    nodes: [
      { id: 'n1', type: 'trigger',   position: { x: 250, y: 40  }, data: { triggerType: 'keyword', keyword: 'orçamento,preço,valor,comprar,plano' } },
      { id: 'n2', type: 'message',   position: { x: 250, y: 200 }, data: { text: 'Que ótimo que você entrou em contato! 🎯\n\nPara te passar o melhor orçamento:\n\n📦 Qual produto/serviço te interessa?\n🏢 Você representa uma empresa ou é pessoa física?' } },
      { id: 'n3', type: 'condition', position: { x: 250, y: 390 }, data: { conditionType: 'contains', value: 'empresa,cnpj,funcionário,corporativo,b2b' } },
      { id: 'n4', type: 'action',    position: { x: 50,  y: 560 }, data: { actionType: 'add_tag', tag: 'lead-b2b' } },
      { id: 'n5', type: 'action',    position: { x: 450, y: 560 }, data: { actionType: 'add_tag', tag: 'lead-b2c' } },
      { id: 'n6', type: 'message',   position: { x: 50,  y: 720 }, data: { text: '🏢 Perfeito! Nossa equipe B2B vai preparar uma proposta personalizada.\n\nUm consultor especializado entrará em contato em até 2 horas! ⚡' } },
      { id: 'n7', type: 'message',   position: { x: 450, y: 720 }, data: { text: '👤 Ótimo! Aqui estão nossos planos para pessoas físicas:\n\n✅ Starter — R$ 97/mês\n✅ Pro — R$ 197/mês\n\nQual se encaixa melhor no seu perfil?' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', ...EDGE_DEF },
      { id: 'e2', source: 'n2', target: 'n3', ...EDGE_DEF },
      { id: 'e3', source: 'n3', target: 'n4', sourceHandle: 'yes', ...EYES },
      { id: 'e4', source: 'n3', target: 'n5', sourceHandle: 'no',  ...ENO  },
      { id: 'e5', source: 'n4', target: 'n6', ...EDGE_DEF },
      { id: 'e6', source: 'n5', target: 'n7', ...EDGE_DEF },
    ],
  },
  {
    id: 'ai-support',
    label: 'Suporte 24/7 com IA',
    Icon: Bot,
    desc: 'IA responde instantaneamente, detecta insatisfação e escala para humano quando necessário',
    nodes: [
      { id: 'n1', type: 'trigger',     position: { x: 250, y: 40  }, data: { triggerType: 'message' } },
      { id: 'n2', type: 'integration', position: { x: 250, y: 200 }, data: { integrationType: 'ai', prompt: 'Você é um assistente de suporte da empresa. Seja educado, objetivo e resolva o problema do cliente. Se não souber, diga que vai verificar. Nunca invente informações. Se o cliente pedir atendente humano ou estiver muito insatisfeito, diga que vai encaminhar.' } },
      { id: 'n3', type: 'condition',   position: { x: 250, y: 390 }, data: { conditionType: 'contains', value: 'humano,atendente,pessoa,gerente,não resolveu,absurdo,horrível' } },
      { id: 'n4', type: 'action',      position: { x: 50,  y: 560 }, data: { actionType: 'add_tag', tag: 'escalado-humano' } },
      { id: 'n5', type: 'action',      position: { x: 50,  y: 720 }, data: { actionType: 'human' } },
      { id: 'n6', type: 'message',     position: { x: 450, y: 560 }, data: { text: 'Fico feliz em ter ajudado! 😊\n\nCaso precise de mais alguma coisa, é só falar. Estou disponível 24 horas!' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', ...EDGE_DEF },
      { id: 'e2', source: 'n2', target: 'n3', ...EDGE_DEF },
      { id: 'e3', source: 'n3', target: 'n4', sourceHandle: 'yes', ...EYES },
      { id: 'e4', source: 'n3', target: 'n6', sourceHandle: 'no',  ...ENO  },
      { id: 'e5', source: 'n4', target: 'n5', ...EDGE_DEF },
    ],
  },
  {
    id: 'cart-recovery',
    label: 'Recuperação de Interesse',
    Icon: ShoppingCart,
    desc: 'Reativa leads que demonstraram interesse mas não finalizaram — oferece incentivo automático',
    nodes: [
      { id: 'n1', type: 'trigger',   position: { x: 250, y: 40  }, data: { triggerType: 'keyword', keyword: 'quero,interesse,produto,comprar,ver' } },
      { id: 'n2', type: 'message',   position: { x: 250, y: 200 }, data: { text: 'Que ótimo que você tem interesse! 🎉\n\nPosso te ajudar a avançar agora? É bem rápido e sem compromisso!' } },
      { id: 'n3', type: 'action',    position: { x: 250, y: 370 }, data: { actionType: 'delay', delayValue: '300' } },
      { id: 'n4', type: 'condition', position: { x: 250, y: 540 }, data: { conditionType: 'contains', value: 'sim,quero,ok,vamos,pode,claro' } },
      { id: 'n5', type: 'message',   position: { x: 50,  y: 710 }, data: { text: '✅ Perfeito! Aqui está tudo que você precisa:\n\n📋 Detalhes do produto: [link]\n💳 Para pagar: [link checkout]\n\nQualquer dúvida, estou aqui! 💪' } },
      { id: 'n6', type: 'message',   position: { x: 450, y: 710 }, data: { text: '⏰ Ei, ainda está pensando? Totalmente normal!\n\n🎁 Que tal um desconto especial de 15%?\nUse o código AGORA15 — válido só hoje!\n\nPosso ajudar com alguma dúvida?' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', ...EDGE_DEF },
      { id: 'e2', source: 'n2', target: 'n3', ...EDGE_DEF },
      { id: 'e3', source: 'n3', target: 'n4', ...EDGE_DEF },
      { id: 'e4', source: 'n4', target: 'n5', sourceHandle: 'yes', ...EYES },
      { id: 'e5', source: 'n4', target: 'n6', sourceHandle: 'no',  ...ENO  },
    ],
  },
  {
    id: 'satisfaction-nps',
    label: 'Pesquisa NPS Automática',
    Icon: Star,
    desc: 'Coleta nota do atendimento, age sobre promotores e detratores com mensagens personalizadas',
    nodes: [
      { id: 'n1', type: 'trigger',   position: { x: 250, y: 40  }, data: { triggerType: 'keyword', keyword: 'obrigado,resolvido,encerrar,ok,até' } },
      { id: 'n2', type: 'message',   position: { x: 250, y: 200 }, data: { text: 'Foi um prazer te atender! 😊\n\nDe 1 a 5, como você avalia nosso atendimento?\n\n1⭐ Péssimo  2⭐ Ruim  3⭐ Regular\n4⭐ Bom  5⭐ Excelente' } },
      { id: 'n3', type: 'condition', position: { x: 250, y: 390 }, data: { conditionType: 'contains', value: '4,5,excelente,ótimo,muito bom,perfeito' } },
      { id: 'n4', type: 'action',    position: { x: 50,  y: 560 }, data: { actionType: 'add_tag', tag: 'promotor-nps' } },
      { id: 'n5', type: 'message',   position: { x: 50,  y: 720 }, data: { text: '🌟 Uau, que nota incrível! Muito obrigado!\n\nVocê toparia nos ajudar deixando uma avaliação no Google? É rapidinho e ajuda muito!\n\n👉 [link avaliação Google]' } },
      { id: 'n6', type: 'action',    position: { x: 450, y: 560 }, data: { actionType: 'add_tag', tag: 'detrator-nps' } },
      { id: 'n7', type: 'message',   position: { x: 450, y: 720 }, data: { text: 'Sentimos muito pela experiência 😔\n\nCan você nos contar o que aconteceu? Queremos entender e garantir que isso não se repita.\n\nUm supervisor vai te contatar em instantes.' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', ...EDGE_DEF },
      { id: 'e2', source: 'n2', target: 'n3', ...EDGE_DEF },
      { id: 'e3', source: 'n3', target: 'n4', sourceHandle: 'yes', ...EYES },
      { id: 'e4', source: 'n3', target: 'n6', sourceHandle: 'no',  ...ENO  },
      { id: 'e5', source: 'n4', target: 'n5', ...EDGE_DEF },
      { id: 'e6', source: 'n6', target: 'n7', ...EDGE_DEF },
    ],
  },
  {
    id: 'onboarding',
    label: 'Onboarding de Novo Cliente',
    Icon: Rocket,
    desc: 'Sequência de ativação automática: boas-vindas → primeiros passos → IA personalizada',
    nodes: [
      { id: 'n1', type: 'trigger',     position: { x: 250, y: 40  }, data: { triggerType: 'new_contact', keyword: '' } },
      { id: 'n2', type: 'message',     position: { x: 250, y: 200 }, data: { text: '🚀 Seja muito bem-vindo(a), {{nome}}!\n\nEstou aqui para garantir que você aproveite ao máximo tudo que temos a oferecer. Vamos começar!' } },
      { id: 'n3', type: 'action',      position: { x: 250, y: 370 }, data: { actionType: 'add_tag', tag: 'novo-cliente' } },
      { id: 'n4', type: 'action',      position: { x: 250, y: 530 }, data: { actionType: 'delay', delayValue: '60' } },
      { id: 'n5', type: 'message',     position: { x: 250, y: 700 }, data: { text: '💡 Primeiros passos:\n\n✅ 1. Acesse seu painel: [link]\n✅ 2. Complete seu perfil\n✅ 3. Configure suas preferências\n\nDigite AJUDA a qualquer momento para suporte!' } },
      { id: 'n6', type: 'integration', position: { x: 250, y: 880 }, data: { integrationType: 'ai', prompt: 'Você é um especialista de onboarding. Pergunte de forma amigável quais são os principais objetivos do cliente para personalizar completamente a experiência dele na plataforma.' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', ...EDGE_DEF },
      { id: 'e2', source: 'n2', target: 'n3', ...EDGE_DEF },
      { id: 'e3', source: 'n3', target: 'n4', ...EDGE_DEF },
      { id: 'e4', source: 'n4', target: 'n5', ...EDGE_DEF },
      { id: 'e5', source: 'n5', target: 'n6', ...EDGE_DEF },
    ],
  },
]

/* ── NodeCard genérico — definido FORA do componente para evitar re-registro ── */
const NodeCard = memo(({ data, selected, type }) => {
  const def = NODE_DEFS[type] ?? NODE_DEFS.message
  const preview = def.preview?.(data) ?? ''
  return (
    <div style={{
      minWidth: 200, maxWidth: 240, borderRadius: 12, background: '#111827', overflow: 'hidden',
      border: `1.5px solid ${selected ? '#FF6B35' : def.color + '44'}`,
      boxShadow: selected
        ? '0 0 0 3px rgba(255,107,53,0.22), 0 8px 24px rgba(0,0,0,0.5)'
        : '0 4px 16px rgba(0,0,0,0.35)',
      transition: 'box-shadow .15s, border-color .15s',
    }}>
      {type !== 'trigger' && (
        <Handle type="target" position={Position.Top}
          style={{ width: 10, height: 10, background: def.color, border: '2px solid #111827' }} />
      )}
      <div style={{ background: def.color + '22', borderBottom: `1px solid ${def.color}33`, padding: '7px 12px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: def.color, letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {def.Icon && <def.Icon size={12} />} {def.label}
        </span>
      </div>
      <div style={{ padding: '9px 12px', fontSize: 12, lineHeight: 1.45, minHeight: 38,
        color: preview ? '#e2e8f0' : '#475569', fontStyle: preview ? 'normal' : 'italic' }}>
        {preview ? (preview.length > 65 ? preview.slice(0, 65) + '…' : preview) : 'Clique para configurar…'}
      </div>
      {(def.sources ?? [{}]).map((src, i) => (
        <Handle key={src.id ?? i} type="source" position={Position.Bottom} id={src.id}
          style={{ width: 10, height: 10, border: '2px solid #111827',
            background: src.color ?? def.color,
            ...(src.left ? { left: src.left, transform: 'translate(-50%, 50%)' } : {}) }}
        />
      ))}
    </div>
  )
})

const NODE_TYPES = Object.fromEntries(Object.keys(NODE_DEFS).map(t => [t, NodeCard]))

const makeData = (type, sub, label) => {
  const data = { label }
  ;(NODE_DEFS[type]?.fields ?? []).forEach((f, i) => {
    data[f.key] = i === 0 && f.type === 'select' && sub ? sub : ''
  })
  return data
}

/* ── FlowBuilder ─────────────────────────────────────────────────────────── */
export function FlowBuilder() {
  const { id: flowId } = useParams()
  const { user, ownerUserId } = useAuth()
  const navigate = useNavigate()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode]   = useState(null)
  const [flowName, setFlowName]           = useState('Novo Fluxo')
  const isMobile = useIsMobile()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [channel, setChannel]             = useState('whatsapp')
  const [active, setActive]               = useState(false)
  const [saving, setSaving]               = useState(false)
  const [saveStatus, setSaveStatus]       = useState('') // '' | 'saved'
  const [loading, setLoading]             = useState(!!flowId)
  const [editingName, setEditingName]     = useState(false)
  const [showTemplates, setShowTemplates] = useState(!flowId)
  const rfInstance = useRef(null)

  React.useEffect(() => {
    if (!flowId || !ownerUserId) return
    supabase.from('flows').select('*').eq('id', flowId).eq('user_id', ownerUserId).single()
      .then(({ data }) => {
        if (!data) return
        setFlowName(data.name ?? 'Fluxo')
        setChannel(data.channel ?? 'whatsapp')
        setActive(data.status === 'active')
        const fd = data.flow_data ?? { nodes: [], edges: [] }
        setNodes(fd.nodes ?? [])
        setEdges(fd.edges ?? [])
      })
      .finally(() => setLoading(false))
  }, [flowId, ownerUserId])

  const onConnect   = useCallback(p => setEdges(e => addEdge({ ...p, ...EDGE_DEF }, e)), [setEdges])
  const onDragOver  = useCallback(e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }, [])
  const onNodeClick = useCallback((_e, node) => setSelectedNode(node), [])
  const onPaneClick = useCallback(() => setSelectedNode(null), [])

  const onDrop = useCallback(e => {
    e.preventDefault()
    const type  = e.dataTransfer.getData('application/reactflow/type')
    const sub   = e.dataTransfer.getData('application/reactflow/sub')
    const label = e.dataTransfer.getData('application/reactflow/label')
    if (!type || !rfInstance.current) return
    const pos = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setNodes(n => [...n, { id: `${type}-${Date.now()}`, type, position: pos, data: makeData(type, sub, label) }])
  }, [setNodes])

  // Mobile: toque adiciona o nó no centro do canvas (touch não tem drag nativo).
  const addNodeAtCenter = useCallback((item) => {
    if (!rfInstance.current) return
    const pos = rfInstance.current.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    setNodes(n => [...n, { id: `${item.type}-${Date.now()}`, type: item.type, position: pos, data: makeData(item.type, item.sub, item.label) }])
    setPaletteOpen(false)
  }, [setNodes])

  const onConfigChange = useCallback((id, newData) => {
    setNodes(n => n.map(nd => nd.id === id ? { ...nd, data: newData } : nd))
    setSelectedNode(p => p?.id === id ? { ...p, data: newData } : p)
  }, [setNodes])

  const loadTemplate = tpl => { setNodes(tpl.nodes); setEdges(tpl.edges); setFlowName(tpl.label); setShowTemplates(false) }

  /* Mensagem amigável quando o erro é "tabela flows não existe". */
  const friendlySaveError = (msg = '') =>
    /relation .*flows.* does not exist|could not find the table|schema cache|does not exist/i.test(msg)
      ? 'A tabela "flows" não existe (ou está sem colunas) no banco.\n\nRode o SQL supabase/flows_table.sql no Supabase Dashboard → SQL Editor.'
      : 'Erro ao salvar o fluxo:\n' + msg

  const handleSave = async () => {
    if (!user || saving) return
    setSaving(true)
    try {
      const payload = {
        user_id: ownerUserId, name: flowName, channel,
        status: active ? 'active' : 'paused',
        flow_data: { nodes, edges },
        updated_at: new Date().toISOString(),
      }
      let savedId = flowId
      if (flowId) {
        const { error } = await supabase.from('flows').update(payload).eq('id', flowId)
        if (error) throw error
        console.log('[FlowBuilder] Flow atualizado:', flowId)
      } else {
        const { data: created, error } = await supabase.from('flows').insert(payload).select('id').single()
        if (error) throw error
        savedId = created?.id
        console.log('[FlowBuilder] Flow criado:', savedId)
      }
      logger.log(user.id, 'flow_updated', { category: 'flows', description: 'Flow atualizado: ' + flowName })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(''), 2000)
      if (!flowId && savedId) navigate(`/flows/${savedId}`, { replace: true })
    } catch (e) {
      console.error('[FlowBuilder] Erro ao salvar:', e?.message ?? e)
      window.alert(friendlySaveError(e?.message ?? String(e)))
    } finally { setSaving(false) }
  }

  /* Liga/desliga o flow. Persiste no banco na hora SE o flow já foi salvo —
     assim "Ativo" realmente grava status='active' e o webhook passa a executá-lo. */
  const handleToggleActive = async () => {
    const next = !active
    setActive(next)
    logger.log(user?.id, next ? 'flow_activated' : 'flow_deactivated',
      { category: 'flows', description: (next ? 'Flow ativado: ' : 'Flow desativado: ') + flowName })
    if (!flowId) return // flow novo: persiste no próximo "Salvar"
    try {
      const { error } = await supabase.from('flows')
        .update({ status: next ? 'active' : 'paused', updated_at: new Date().toISOString() })
        .eq('id', flowId)
      if (error) throw error
      console.log('[FlowBuilder] Status:', flowId, next ? 'ATIVO' : 'PAUSADO')
    } catch (e) {
      console.error('[FlowBuilder] Erro ao alternar status:', e?.message ?? e)
      setActive(!next) // reverte se falhou
      window.alert(friendlySaveError(e?.message ?? String(e)))
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <Loader2 size={24} className="text-brand-orange animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-dark-900 overflow-hidden">

      {/* ── Topbar ── */}
      <div className="min-h-[3.5rem] flex items-center justify-between flex-wrap gap-2 px-4 py-2 border-b border-dark-400 bg-dark-800 flex-shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm flex-shrink-0">
            <ArrowLeft size={16} /> {!isMobile && 'Voltar'}
          </button>
          {isMobile && (
            <button onClick={() => setPaletteOpen(true)} className="text-xs bg-brand-orange/15 text-brand-orange border border-brand-orange/30 rounded-lg px-2.5 py-1 flex-shrink-0 whitespace-nowrap">+ Nós</button>
          )}
          {editingName
            ? <input autoFocus value={flowName}
                onChange={e => setFlowName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={e => e.key === 'Enter' && setEditingName(false)}
                className="font-display font-bold text-white bg-transparent border-b border-brand-orange/60 outline-none text-sm px-1 min-w-[120px]" />
            : <button onClick={() => setEditingName(true)}
                className="font-display font-bold text-white hover:text-brand-orange transition-colors text-sm">
                {flowName}
              </button>
          }
          <select value={channel} onChange={e => setChannel(e.target.value)}
            className="text-[11px] text-slate-400 bg-dark-700 border border-dark-400 rounded-lg px-2.5 py-1.5 appearance-none cursor-pointer hover:border-dark-300 transition-colors outline-none">
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="telegram">Telegram</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-xl text-xs text-slate-300 hover:text-white transition-all">
            <LayoutTemplate size={13} /> Templates
          </button>
          <button onClick={handleToggleActive}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border',
              active ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-dark-600 text-slate-400 border-dark-400')}>
            {active ? <Zap size={13} /> : <ZapOff size={13} />} {active ? 'Ativo' : 'Pausado'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : saveStatus === 'saved' ? <Check size={13} /> : <Save size={13} />}
            {saving ? 'Salvando…' : saveStatus === 'saved' ? '✅ Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Paleta de nodes */}
        <NodePalette mobile={isMobile} open={paletteOpen} onClose={() => setPaletteOpen(false)} onPick={addNodeAtCenter} />

        {/* Canvas ReactFlow */}
        <div className="flex-1 relative" style={{ background: '#0A0E1A' }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick} onPaneClick={onPaneClick}
            onDrop={onDrop} onDragOver={onDragOver}
            onInit={inst => { rfInstance.current = inst }}
            nodeTypes={NODE_TYPES}
            defaultEdgeOptions={EDGE_DEF}
            snapToGrid snapGrid={[15, 15]}
            fitView fitViewOptions={{ padding: 0.25 }}
            deleteKeyCode="Delete"
            panOnDrag panOnScroll={false}
            zoomOnScroll zoomOnPinch zoomOnDoubleClick={false}
            style={{ background: '#0A0E1A' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1E2435" />
            <Controls style={{ background: '#111827', border: '1px solid #1E2435', borderRadius: 10 }} />
            <MiniMap
              nodeColor={n => NODE_DEFS[n.type]?.color ?? '#FF6B35'}
              style={{ background: '#111827', border: '1px solid #1E2435', borderRadius: 10 }}
              maskColor="rgba(10,14,26,0.75)"
            />

            {/* Empty state */}
            {nodes.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div className="text-center glass rounded-2xl px-10 py-8 max-w-xs">
                  <div className="flex justify-center mb-3"><Zap size={36} className="text-brand-orange" /></div>
                  <p className="font-display font-bold text-white text-sm mb-1">Canvas vazio</p>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    Arraste componentes da barra lateral ou carregue um template para começar
                  </p>
                  <button onClick={() => setShowTemplates(true)}
                    className="mt-4 btn-primary text-xs pointer-events-auto">
                    <LayoutTemplate size={13} /> Ver templates
                  </button>
                </div>
              </div>
            )}
          </ReactFlow>
        </div>

        {/* Config panel lateral */}
        {selectedNode && (
          <ConfigPanel node={selectedNode} onChange={onConfigChange} onClose={() => setSelectedNode(null)} />
        )}
      </div>

      {/* ── Modal de templates ── */}
      {showTemplates && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6 backdrop-blur-sm"
          onClick={() => setShowTemplates(false)}>
          <div className="glass rounded-2xl p-6 w-full max-w-4xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-display font-bold text-white text-lg">Templates de fluxo</h2>
                <p className="text-xs text-slate-400 mt-0.5">{TEMPLATES.length} fluxos prontos para usar — escolha e personalize</p>
              </div>
              <button onClick={() => setShowTemplates(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4 max-h-[60vh] overflow-y-auto pr-1 no-scrollbar">
              {TEMPLATES.map(tpl => (
                <button key={tpl.id} onClick={() => loadTemplate(tpl)}
                  className="glass rounded-xl p-4 text-left hover:border-brand-orange/40 transition-all group">
                  <div className="mb-2 text-brand-orange">{tpl.Icon && <tpl.Icon size={24} />}</div>
                  <p className="text-sm font-semibold text-white mb-1.5 group-hover:text-brand-orange transition-colors leading-tight">{tpl.label}</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed mb-3">{tpl.desc}</p>
                  <div className="flex gap-2">
                    <span className="text-[10px] text-slate-600 glass rounded px-1.5 py-0.5">{tpl.nodes.length} nós</span>
                    <span className="text-[10px] text-slate-600 glass rounded px-1.5 py-0.5">{tpl.edges.length} conexões</span>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setNodes([]); setEdges([]); setShowTemplates(false) }}
              className="w-full py-2.5 glass rounded-xl text-sm text-slate-300 hover:text-white transition-all">
              Começar do zero (canvas vazio)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
