// Ação: Mover o cliente para uma etapa do funil de vendas (clients.stage).
// As etapas vêm de pipeline_stages (ou das 6 padrão). Executada em server/crmActions.js.
import React, { memo } from 'react'
import { MoveRight } from 'lucide-react'
import { NodeShell, Label, SelectInput, T, useUpdateNodeData } from './_shared'
import { useStages } from '@hooks/useStages'

export default memo(function ActionMoveStage({ id, data = {} }) {
  const update = useUpdateNodeData(id)
  const { stages } = useStages()
  const options = [{ value: '', label: 'Escolha a etapa' }, ...stages.map(s => ({ value: s.key, label: s.label }))]
  const won = stages.find(s => s.key === data.stage)?.kind === 'won'
  return (
    <NodeShell id={id} color={T.blue} Icon={MoveRight} title="Ação · Mover etapa do funil">
      <div>
        <Label>Mover o cliente para</Label>
        <SelectInput options={options} value={data.stage ?? ''} onChange={e => update({ stage: e.target.value })} />
      </div>
      <span style={{ fontSize: 10, color: T.dim }}>
        {won ? 'Etapa de ganho: conta como venda nas metas.' : 'Cria o lead se o contato ainda não existir.'}
      </span>
    </NodeShell>
  )
})
