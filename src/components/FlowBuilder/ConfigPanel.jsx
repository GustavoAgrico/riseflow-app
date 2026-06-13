import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { NODE_DEFS } from '@components/FlowBuilder/nodeDefs'

const renderField = (field, data, update) => {
  if (field.when && !field.when(data)) return null
  const val = data[field.key] ?? ''
  const base = { value: val, onChange: e => update({ [field.key]: e.target.value }), className: 'input-field w-full text-sm', placeholder: field.placeholder }
  return (
    <div key={field.key} className="mb-3">
      <p className="text-[10px] text-slate-400 mb-1.5 font-medium">{field.label}</p>
      {field.type === 'textarea'
        ? <textarea {...base} rows={4} className="input-field w-full text-sm resize-none" />
        : field.type === 'select'
        ? <select {...base}>{field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : <input {...base} />}
    </div>
  )
}

export const ConfigPanel = ({ node, onChange, onClose }) => {
  const [data, setData] = useState(node.data)
  useEffect(() => setData(node.data), [node.id])
  const def = NODE_DEFS[node.type] ?? NODE_DEFS.message
  const update = patch => { const next = { ...data, ...patch }; setData(next); onChange(node.id, next) }

  return (
    <div className="w-72 flex-shrink-0 border-l border-dark-400 flex flex-col bg-dark-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-dark-400 flex items-center justify-between">
        <span style={{ color: def.color }} className="text-xs font-semibold">{def.icon} {def.label}</span>
        <button onClick={onClose} className="p-1.5 hover:bg-dark-600 rounded-lg transition-colors">
          <X size={14} className="text-slate-400" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar p-4">
        {(def.fields ?? []).map(f => renderField(f, data, update))}
        <div className="mt-4 pt-4 border-t border-dark-400">
          <p className="text-[10px] text-slate-400 mb-1.5 font-medium">Nome do nó</p>
          <input value={data.label ?? ''} onChange={e => update({ label: e.target.value })} placeholder="Ex: Boas-vindas" className="input-field w-full text-sm" />
        </div>
      </div>
    </div>
  )
}
