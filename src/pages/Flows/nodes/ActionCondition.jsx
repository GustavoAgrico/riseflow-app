import React from 'react'
import { GitFork } from 'lucide-react'
import { NodeShell, Label, TextInput, SelectInput, useUpdateNodeData, T } from './_shared'

const OPERATORS = [
  { value: 'hasTag', label: 'Contato tem tag' },
  { value: 'noTag', label: 'Contato NÃO tem tag' },
  { value: 'varEquals', label: 'Variável = valor' },
  { value: 'varContains', label: 'Variável contém' },
  { value: 'replied', label: 'Respondeu (qualquer texto)' },
]

export default function ActionCondition({ id, data = {} }) {
  const update = useUpdateNodeData(id)
  const op = data.operator || 'hasTag'
  const needsVar = op === 'varEquals' || op === 'varContains'
  const needsTag = op === 'hasTag' || op === 'noTag'

  return (
    <NodeShell id={id} color="#EAB308" Icon={GitFork} title="Condição"
      outputs={[
        { id: 'yes', label: 'Sim ✓', color: '#22C55E' },
        { id: 'no', label: 'Não ✗', color: '#EF4444' },
      ]}>
      <Label>Operador</Label>
      <SelectInput options={OPERATORS} value={op} onChange={e => update({ operator: e.target.value })} />

      {needsTag && (<>
        <Label>Tag</Label>
        <TextInput placeholder="nome-da-tag" value={data.tag ?? ''} onChange={e => update({ tag: e.target.value })} />
      </>)}

      {needsVar && (<>
        <Label>Variável</Label>
        <TextInput placeholder="{{resposta}}" value={data.varName ?? ''} onChange={e => update({ varName: e.target.value })} />
        <Label>Valor esperado</Label>
        <TextInput placeholder="sim" value={data.varValue ?? ''} onChange={e => update({ varValue: e.target.value })} />
      </>)}
    </NodeShell>
  )
}
