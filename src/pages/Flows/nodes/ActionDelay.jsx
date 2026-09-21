import React from 'react'
import { Timer } from 'lucide-react'
import { NodeShell, Label, TextInput, SelectInput, useUpdateNodeData, T } from './_shared'

const UNITS = [
  { value: 'seconds', label: 'Segundos' },
  { value: 'minutes', label: 'Minutos' },
  { value: 'hours', label: 'Horas' },
  { value: 'days', label: 'Dias' },
]

export default function ActionDelay({ id, data = {} }) {
  const update = useUpdateNodeData(id)
  return (
    <NodeShell id={id} color={T.orange} Icon={Timer} title="Delay / Pausa">
      <Label>Duração</Label>
      <div style={{ display: 'flex', gap: 6 }}>
        <TextInput type="number" min={1} placeholder="5" value={data.value ?? ''} onChange={e => update({ value: e.target.value })} style={{ flex: 1 }} />
        <SelectInput options={UNITS} value={data.unit || 'minutes'} onChange={e => update({ unit: e.target.value })} style={{ flex: 1 }} />
      </div>
    </NodeShell>
  )
}
