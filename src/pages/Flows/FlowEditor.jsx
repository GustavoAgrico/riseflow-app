// Editor (canvas) de um funil — usado pela página Flows.
// Envolto em <ReactFlowProvider> para que useFlow/useReactFlow funcionem.
import React, { useState, useCallback, useRef, useMemo } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap, ReactFlowProvider, useReactFlow,
  MarkerType, BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { ArrowLeft, Save, Check, Loader2, Zap, ZapOff, AlertTriangle } from 'lucide-react'
import { nodeTypes, NODE_CATALOG } from './nodes'
import { FlowsMetaContext, T } from './nodes/_shared'
import { useFlow, canActivate } from '@hooks/useFlow'
import { flowsService } from '@services/flowsService'

const EDGE_DEF = {
  type: 'smoothstep', animated: true,
  style: { stroke: T.orange, strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: T.orange },
}

/* ── Paleta lateral: arrasta nós para o canvas ── */
function Palette() {
  const onDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type)
    e.dataTransfer.effectAllowed = 'move'
  }
  return (
    <div style={{ width: 200, flexShrink: 0, background: '#0B1220', borderRight: `1px solid ${T.border}`,
      overflowY: 'auto', padding: 12, fontFamily: 'DM Sans, sans-serif' }}>
      {NODE_CATALOG.map((g) => (
        <div key={g.group} style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: g.color, textTransform: 'uppercase',
            letterSpacing: '0.06em', margin: '0 0 8px' }}>{g.group}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.items.map(({ type, Icon, label }) => (
              <div key={type} draggable onDragStart={(e) => onDragStart(e, type)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9,
                  background: '#111827', border: `1px solid ${g.color}33`, color: T.text, fontSize: 12,
                  cursor: 'grab', userSelect: 'none' }}>
                <Icon size={14} color={g.color} style={{ flexShrink: 0 }} /> {label}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Indicador de estado de salvamento ── */
function SaveStatus({ isSaving, hasChanges, lastSaved }) {
  let color = T.muted, label = 'Salvo'
  if (isSaving) { color = T.blue; label = 'Salvando…' }
  else if (hasChanges) { color = '#F59E0B'; label = 'Alterações não salvas' }
  else if (!lastSaved) { color = T.dim; label = 'Não salvo' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

function EditorInner({ flowId, onBack }) {
  const flow = useFlow(flowId)
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow()
  const [tags, setTags] = useState([])
  const [agents] = useState([])
  const [activateError, setActivateError] = useState('')
  const wrapRef = useRef(null)

  const addTag = useCallback((t) => setTags((prev) => (prev.includes(t) ? prev : [...prev, t])), [])
  const meta = useMemo(() => ({ tags, agents, addTag }), [tags, agents, addTag])

  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }, [])
  const onDrop = useCallback((e) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow')
    if (!type) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    flow.addNode({ id: `${type}-${Date.now()}`, type, position, data: {} })
  }, [screenToFlowPosition, flow])

  const handleSave = async () => {
    try { await flow.saveFlow() }
    catch (e) { window.alert('Erro ao salvar:\n' + (e?.message ?? e)) }
  }

  const handleToggleActive = async () => {
    setActivateError('')
    try {
      // Garante que o funil está salvo (precisa de id p/ alternar status).
      let id = flow.getId()
      if (!id || flow.hasChanges) id = await flow.saveFlow()
      // Para ATIVAR, valida: ao menos 1 gatilho conectado a 1 ação.
      if (flow.status !== 'active' && !canActivate(getNodes(), getEdges())) {
        setActivateError('Conecte ao menos 1 gatilho a 1 ação antes de ativar o funil.')
        return
      }
      const updated = await flowsService.toggleFlowStatus(id)
      flow.setStatus(updated.status)
    } catch (e) {
      window.alert('Erro ao alterar status:\n' + (e?.message ?? e))
    }
  }

  if (flow.loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-900">
        <Loader2 size={24} className="text-brand-orange animate-spin" />
      </div>
    )
  }

  const active = flow.status === 'active'

  return (
    <div className="flex flex-col h-screen bg-dark-900 overflow-hidden">
      {/* Topbar */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-dark-400 bg-dark-800 flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
            <ArrowLeft size={16} /> Funis
          </button>
          <input value={flow.name} onChange={(e) => flow.setName(e.target.value)}
            className="font-display font-bold text-white bg-transparent border-b border-transparent hover:border-dark-400 focus:border-brand-orange/60 outline-none text-sm px-1 min-w-[140px] transition-colors" />
          <SaveStatus isSaving={flow.isSaving} hasChanges={flow.hasChanges} lastSaved={flow.lastSaved} />
        </div>
        <div className="flex items-center gap-2">
          {activateError && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-400 max-w-[260px]">
              <AlertTriangle size={13} className="flex-shrink-0" /> {activateError}
            </span>
          )}
          <button onClick={handleToggleActive}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
              active ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-dark-600 text-slate-400 border-dark-400'}`}>
            {active ? <Zap size={13} /> : <ZapOff size={13} />} {active ? 'Ativo' : 'Pausado'}
          </button>
          <button onClick={handleSave} disabled={flow.isSaving} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
            {flow.isSaving ? <Loader2 size={13} className="animate-spin" /> : flow.hasChanges ? <Save size={13} /> : <Check size={13} />}
            {flow.isSaving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <Palette />
        <div ref={wrapRef} className="flex-1 relative" style={{ background: '#0A0E1A' }}>
          <FlowsMetaContext.Provider value={meta}>
            <ReactFlow
              nodes={flow.nodes} edges={flow.edges}
              onNodesChange={flow.onNodesChange} onEdgesChange={flow.onEdgesChange}
              onConnect={flow.onConnect}
              onDrop={onDrop} onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={EDGE_DEF}
              snapToGrid snapGrid={[15, 15]}
              fitView fitViewOptions={{ padding: 0.3 }}
              deleteKeyCode="Delete"
              zoomOnDoubleClick={false}
              style={{ background: '#0A0E1A' }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1E2435" />
              <Controls style={{ background: '#111827', border: `1px solid ${T.border}`, borderRadius: 10 }} />
              <MiniMap
                nodeColor={(n) => (n.type?.startsWith('trigger') ? T.green : T.orange)}
                style={{ background: '#111827', border: `1px solid ${T.border}`, borderRadius: 10 }}
                maskColor="rgba(10,14,26,0.75)"
              />
              {flow.nodes.length === 0 && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', pointerEvents: 'none' }}>
                  <div className="text-center glass rounded-2xl px-10 py-8 max-w-xs">
                    <div className="flex justify-center mb-3"><Zap size={36} className="text-brand-orange" /></div>
                    <p className="font-display font-bold text-white text-sm mb-1">Canvas vazio</p>
                    <p className="text-slate-500 text-xs leading-relaxed">Arraste gatilhos e ações da barra lateral para montar seu funil</p>
                  </div>
                </div>
              )}
            </ReactFlow>
          </FlowsMetaContext.Provider>
        </div>
      </div>
    </div>
  )
}

export default function FlowEditor({ flowId, onBack }) {
  return (
    <ReactFlowProvider>
      <EditorInner flowId={flowId} onBack={onBack} />
    </ReactFlowProvider>
  )
}
