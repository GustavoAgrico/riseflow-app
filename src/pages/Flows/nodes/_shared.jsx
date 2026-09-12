// Infra compartilhada dos nós customizados do builder de funis (/flows-novo).
// Tema dark do RiseFlow, casca padrão do nó (handles, header colorido, botão X,
// largura fixa 280px) e primitivas de campo reutilizáveis.
import React, { createContext, useContext, useCallback, useRef, useState, forwardRef } from 'react'
import { Handle, Position, useReactFlow } from 'reactflow'
import { X, Plus, Trash2 } from 'lucide-react'

export const T = {
  body: '#111827', border: '#334155', text: '#E2E8F0', muted: '#94A3B8', dim: '#64748B',
  field: '#0B1220', orange: '#FF6B35', green: '#10B981', blue: '#3B82F6', red: '#EF4444', gray: '#64748B',
}
export const NODE_W = 280
const F = 'DM Sans, sans-serif'

const handleStyle = (color) => ({ width: 12, height: 12, background: color, border: '2px solid #111827' })

/* ─── Metadados do funil (tags e atendentes) compartilhados com os nós ─── */
export const FlowsMetaContext = createContext({ tags: [], agents: [], addTag: () => {} })
export const useFlowsMeta = () => useContext(FlowsMetaContext)

/* ─── Atualiza os dados do próprio nó ─── */
export const useUpdateNodeData = (id) => {
  const { setNodes } = useReactFlow()
  return useCallback(
    (patch) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
    [id, setNodes]
  )
}

/* ─── Casca padrão de todo nó ─── */
export const NodeShell = ({ id, color, Icon, title, children, hasInput = true, outputs }) => {
  const { setNodes, setEdges } = useReactFlow()
  const outs = outputs ?? [{ color: T.orange }]
  const del = () => {
    setNodes((ns) => ns.filter((n) => n.id !== id))
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
  }
  return (
    <div style={{ width: NODE_W, borderRadius: 12, background: T.body, border: `1px solid ${color}66`,
      boxShadow: '0 4px 16px rgba(0,0,0,.35)', fontFamily: F }}>
      {hasInput && <Handle type="target" position={Position.Top} style={handleStyle(T.gray)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        background: color + '22', borderBottom: `1px solid ${color}33`, borderRadius: '12px 12px 0 0' }}>
        {Icon && <Icon size={15} color={color} style={{ flexShrink: 0 }} />}
        <span style={{ fontSize: 12.5, fontWeight: 700, color, flex: 1, lineHeight: 1.2 }}>{title}</span>
        <button className="nodrag" onClick={del} title="Excluir nó"
          style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', display: 'flex', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>{children}</div>

      {outs.map((o, i) => (
        <Handle key={o.id ?? i} type="source" position={Position.Bottom} id={o.id}
          style={{ ...handleStyle(o.color ?? T.orange),
            left: outs.length > 1 ? `${(100 / (outs.length + 1)) * (i + 1)}%` : '50%' }} />
      ))}
      {outs.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: 4, padding: '0 8px 9px' }}>
          {outs.map((o, i) => (
            <span key={i} style={{ fontSize: 9.5, fontWeight: 600, color: o.color ?? T.muted, textAlign: 'center', flex: 1 }}>
              {o.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Primitivas de campo (todas com .nodrag p/ não arrastar o nó) ─── */
export const Label = ({ children }) => (
  <span style={{ fontSize: 10, color: T.muted, fontWeight: 600, display: 'block', marginBottom: 3 }}>{children}</span>
)

const inputBase = {
  width: '100%', boxSizing: 'border-box', background: T.field, border: `1px solid ${T.border}`,
  borderRadius: 8, padding: '7px 9px', color: T.text, fontSize: 12, outline: 'none', fontFamily: F,
}

export const TextInput = (props) => (
  <input {...props} className="nodrag" style={{ ...inputBase, ...(props.style || {}) }} />
)

export const TextArea = forwardRef((props, ref) => (
  <textarea ref={ref} {...props} className="nodrag nowheel" style={{ ...inputBase, resize: 'vertical', minHeight: 60, ...(props.style || {}) }} />
))

export const SelectInput = ({ options = [], ...props }) => (
  <select {...props} className="nodrag" style={{ ...inputBase, cursor: 'pointer', ...(props.style || {}) }}>
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
)

export const Toggle = ({ checked, onChange, labelOn, labelOff }) => (
  <button className="nodrag" onClick={() => onChange(!checked)}
    style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
    <span style={{ width: 32, height: 18, borderRadius: 10, background: checked ? T.orange : T.border,
      position: 'relative', transition: 'background .15s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14, borderRadius: '50%',
        background: '#fff', transition: 'left .15s' }} />
    </span>
    <span style={{ fontSize: 11.5, color: T.text }}>{checked ? labelOn : labelOff}</span>
  </button>
)

export const Slider = ({ value, onChange, min = 0, max = 60, suffix = 's' }) => (
  <div>
    <input className="nodrag" type="range" min={min} max={max} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: '100%', accentColor: T.orange, cursor: 'pointer' }} />
    <span style={{ fontSize: 11, color: T.muted }}>{value}{suffix}</span>
  </div>
)

/* Chips clicáveis que inseram variáveis no textarea referenciado. */
export const VarChips = ({ vars, onInsert }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
    {vars.map((v) => (
      <button key={v} className="nodrag" onClick={() => onInsert(v)}
        style={{ background: T.orange + '22', color: T.orange, border: `1px solid ${T.orange}44`, borderRadius: 6,
          padding: '2px 7px', fontSize: 10.5, cursor: 'pointer', fontFamily: F }}>
        {v}
      </button>
    ))}
  </div>
)

/* Editor de pares chave/valor (headers do webhook). */
export const KeyValueEditor = ({ rows = [], onChange }) => {
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const add = () => onChange([...rows, { key: '', value: '' }])
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <TextInput placeholder="Header" value={r.key} onChange={(e) => update(i, { key: e.target.value })} style={{ flex: 1 }} />
          <TextInput placeholder="Valor" value={r.value} onChange={(e) => update(i, { value: e.target.value })} style={{ flex: 1 }} />
          <button className="nodrag" onClick={() => remove(i)}
            style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', display: 'flex', padding: 2 }}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button className="nodrag" onClick={add}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: `1px dashed ${T.border}`,
          borderRadius: 7, padding: '5px', color: T.muted, fontSize: 11, cursor: 'pointer', fontFamily: F, justifyContent: 'center' }}>
        <Plus size={12} /> Adicionar header
      </button>
    </div>
  )
}

/* Multi-seleção de tags com criação inline. */
export const TagMultiSelect = ({ selected = [], onChange, allowCreate = true }) => {
  const { tags, addTag } = useFlowsMeta()
  const [newTag, setNewTag] = useState('')
  const toggle = (t) => onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t])
  const create = () => {
    const v = newTag.trim()
    if (!v) return
    addTag(v)
    if (!selected.includes(v)) onChange([...selected, v])
    setNewTag('')
  }
  const all = Array.from(new Set([...(tags || []), ...selected]))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {all.length === 0 && <span style={{ fontSize: 11, color: T.dim }}>Nenhuma tag ainda</span>}
        {all.map((t) => {
          const on = selected.includes(t)
          return (
            <button key={t} className="nodrag" onClick={() => toggle(t)}
              style={{ background: on ? T.blue + '33' : T.field, color: on ? '#93C5FD' : T.muted,
                border: `1px solid ${on ? T.blue : T.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 10.5,
                cursor: 'pointer', fontFamily: F }}>
              {t}
            </button>
          )
        })}
      </div>
      {allowCreate && (
        <div style={{ display: 'flex', gap: 4 }}>
          <TextInput placeholder="Nova tag" value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()} style={{ flex: 1 }} />
          <button className="nodrag" onClick={create}
            style={{ background: T.blue, border: 'none', borderRadius: 7, padding: '0 9px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Plus size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

/* Hook utilitário para inserir texto na posição do cursor de um textarea. */
export const useInsertAtCursor = (update, key = 'text') => {
  const ref = useRef(null)
  const insert = (token) => {
    const el = ref.current
    const cur = el?.value ?? ''
    const start = el?.selectionStart ?? cur.length
    const end = el?.selectionEnd ?? cur.length
    const next = cur.slice(0, start) + token + cur.slice(end)
    update({ [key]: next })
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }
  return { ref, insert }
}
