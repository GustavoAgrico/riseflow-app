// Hook do editor de funil: estado de nodes/edges, save manual e auto-save (30s).
// Deve ser usado DENTRO de um <ReactFlowProvider> (usa useReactFlow).
import { useState, useCallback, useEffect, useRef } from 'react'
import { useNodesState, useEdgesState, useReactFlow, addEdge } from 'reactflow'
import { flowsService } from '@services/flowsService'

const AUTOSAVE_MS = 30000

const isTrigger = (t) => typeof t === 'string' && t.startsWith('trigger')
const isAction = (t) => typeof t === 'string' && t.startsWith('action')

/* Funil pode ativar se houver ao menos 1 gatilho conectado a 1 ação. */
export function canActivate(nodes = [], edges = []) {
  const byId = {}
  nodes.forEach((n) => { byId[n.id] = n })
  return edges.some((e) => isTrigger(byId[e.source]?.type) && isAction(byId[e.target]?.type))
}

/* Ignora mudanças de seleção/dimensão (não contam como "alteração não salva"). */
const meaningful = (changes) => changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')

export function useFlow(flowId) {
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState([])
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState([])
  const [name, setNameState] = useState('Novo Funil')
  const [status, setStatus] = useState('paused')
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [loading, setLoading] = useState(!!flowId)

  const { getNodes, getEdges } = useReactFlow()

  // Refs com os valores mais recentes — usados no intervalo de auto-save.
  const idRef = useRef(flowId ?? null)
  const nameRef = useRef(name)
  const hasChangesRef = useRef(false)
  const savingRef = useRef(false)
  useEffect(() => { nameRef.current = name }, [name])
  useEffect(() => { hasChangesRef.current = hasChanges }, [hasChanges])
  useEffect(() => { savingRef.current = isSaving }, [isSaving])

  /* Carrega o funil existente ao montar. */
  useEffect(() => {
    let cancelled = false
    if (!flowId) { setLoading(false); return }
    setLoading(true)
    flowsService.getFlow(flowId)
      .then((f) => {
        if (cancelled || !f) return
        idRef.current = f.id
        setNameState(f.name ?? 'Novo Funil')
        setStatus(f.status ?? 'paused')
        setNodes(f.nodes ?? [])
        setEdges(f.edges ?? [])
        setLastSaved(f.updated_at ? new Date(f.updated_at) : null)
        setHasChanges(false)
      })
      .catch((e) => console.error('[useFlow] erro ao carregar:', e?.message ?? e))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [flowId, setNodes, setEdges])

  /* Handlers do React Flow que também marcam "alterações não salvas". */
  const onNodesChange = useCallback((c) => { onNodesChangeRaw(c); if (meaningful(c)) setHasChanges(true) }, [onNodesChangeRaw])
  const onEdgesChange = useCallback((c) => { onEdgesChangeRaw(c); if (meaningful(c)) setHasChanges(true) }, [onEdgesChangeRaw])
  const onConnect = useCallback((p) => { setEdges((e) => addEdge(p, e)); setHasChanges(true) }, [setEdges])
  const addNode = useCallback((node) => { setNodes((n) => [...n, node]); setHasChanges(true) }, [setNodes])
  const setName = useCallback((v) => { setNameState(v); setHasChanges(true) }, [])

  /* Salva (cria na primeira vez, atualiza nas seguintes). Lê os nós atuais do React Flow. */
  const saveFlow = useCallback(async () => {
    if (savingRef.current) return idRef.current
    setIsSaving(true); savingRef.current = true
    try {
      const payload = { name: nameRef.current, nodes: getNodes(), edges: getEdges() }
      if (idRef.current) {
        await flowsService.updateFlow(idRef.current, payload)
      } else {
        const created = await flowsService.createFlow(payload)
        idRef.current = created.id
      }
      setHasChanges(false)
      setLastSaved(new Date())
      return idRef.current
    } catch (e) {
      console.error('[useFlow] erro ao salvar:', e?.message ?? e)
      throw e
    } finally {
      setIsSaving(false); savingRef.current = false
    }
  }, [getNodes, getEdges])

  /* Auto-save a cada 30s, somente se houver alterações pendentes. */
  useEffect(() => {
    const t = setInterval(() => {
      if (hasChangesRef.current && !savingRef.current) saveFlow().catch(() => {})
    }, AUTOSAVE_MS)
    return () => clearInterval(t)
  }, [saveFlow])

  return {
    nodes, edges, setNodes, setEdges,
    onNodesChange, onEdgesChange, onConnect, addNode,
    name, setName, status, setStatus,
    isSaving, lastSaved, hasChanges, loading,
    saveFlow, getId: () => idRef.current,
  }
}

export default useFlow
