// Ação: Aguardar resposta (2 saídas: Respondeu / Não respondeu - timeout)
import React, { memo } from 'react'
import { Hourglass } from 'lucide-react'
import {
  NodeShell, Label, TextInput, SelectInput, T, useUpdateNodeData,
} from './_shared'

const UNITS = [
  { value: 'minutes', label: 'minutos' },
  { value: 'hours', label: 'horas' },
  { value: 'days', label: 'dias' },
]

export default memo(function ActionWaitReply({ id, data }) {
  const update = useUpdateNodeData(id)
  return (
    <NodeShell id={id} color={T.blue} Icon={Hourglass} title="Ação · Aguardar resposta"
      outputs={[
        { id: 'replied', color: T.green, label: 'Respondeu' },
        { id: 'timeout', color: T.red, label: 'Não respondeu (timeout)' },
      ]}>
      <div>
        <Label>Tempo máximo de espera</Label>
        <div style={{ display: 'flex', gap: 6 }}>
          <TextInput type="number" min={1} placeholder="24"
            value={data.waitValue ?? 24} onChange={(e) => update({ waitValue: e.target.value })}
            style={{ width: 70 }} />
          <SelectInput value={data.waitUnit ?? 'hours'} onChange={(e) => update({ waitUnit: e.target.value })}
            options={UNITS} style={{ flex: 1 }} />
        </div>
      </div>
      <div>
        <Label>Salvar resposta como variável</Label>
        <TextInput placeholder="resposta_cliente"
          value={data.saveAs ?? ''} onChange={(e) => update({ saveAs: e.target.value })} />
      </div>
      <p style={{ margin: 0, fontSize: 10.5, color: T.muted, lineHeight: 1.5 }}>
        Se não responder no prazo, o fluxo segue pela saída <strong style={{ color: T.red }}>timeout</strong>.
      </p>
    </NodeShell>
  )
})
