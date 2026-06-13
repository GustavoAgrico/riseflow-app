// Ação: Transferir para humano
import React, { memo } from 'react'
import { Headphones } from 'lucide-react'
import {
  NodeShell, Label, SelectInput, TextArea, T, useUpdateNodeData, useFlowsMeta,
} from './_shared'

export default memo(function ActionTransfer({ id, data }) {
  const update = useUpdateNodeData(id)
  const { agents } = useFlowsMeta()
  const options = [
    { value: '', label: 'Próximo atendente disponível' },
    { value: 'queue', label: '— Fila de atendimento —' },
    ...(agents ?? []).map((a) => ({
      value: a.id ?? a,
      label: a.name ?? a,
    })),
  ]
  return (
    <NodeShell id={id} color={T.orange} Icon={Headphones} title="Ação · Transferir para humano">
      <div>
        <Label>Transferir para</Label>
        <SelectInput value={data.assignTo ?? ''} onChange={(e) => update({ assignTo: e.target.value })} options={options} />
      </div>
      <div>
        <Label>Mensagem de aviso ao contato (opcional)</Label>
        <TextArea placeholder="Aguarde, um atendente irá te ajudar em instantes!"
          value={data.notice ?? ''} onChange={(e) => update({ notice: e.target.value })} style={{ minHeight: 44 }} />
      </div>
    </NodeShell>
  )
})
