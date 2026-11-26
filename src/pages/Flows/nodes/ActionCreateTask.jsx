// Ação: Criar tarefa no CRM para o contato (crm_tasks). Se o contato ainda não
// é cliente, o servidor cria o lead antes. Executada em server/crmActions.js.
import React, { memo } from 'react'
import { ListTodo } from 'lucide-react'
import { NodeShell, Label, TextInput, SelectInput, VarChips, T, useUpdateNodeData } from './_shared'

const DUE = [
  { value: '', label: 'Sem prazo' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'amanha', label: 'Amanhã' },
  { value: '+3', label: 'Em 3 dias' },
  { value: '+7', label: 'Em 7 dias' },
]

export default memo(function ActionCreateTask({ id, data = {} }) {
  const update = useUpdateNodeData(id)
  return (
    <NodeShell id={id} color={T.blue} Icon={ListTodo} title="Ação · Criar tarefa">
      <div>
        <Label>Título da tarefa</Label>
        <TextInput placeholder="Ligar para {{nome}}" value={data.title ?? ''} onChange={e => update({ title: e.target.value })} />
        <VarChips vars={['{{nome}}', '{{telefone}}', '{{data}}']} onInsert={v => update({ title: `${data.title ?? ''}${v}` })} />
      </div>
      <div>
        <Label>Prazo</Label>
        <SelectInput options={DUE} value={data.due ?? ''} onChange={e => update({ due: e.target.value })} />
      </div>
      <span style={{ fontSize: 10, color: T.dim }}>Aparece em Hoje e no CRM do cliente. Cria o lead se o contato ainda não existir.</span>
    </NodeShell>
  )
})
