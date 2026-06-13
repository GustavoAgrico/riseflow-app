// Gatilho: Tag aplicada
import React, { memo } from 'react'
import { Tag } from 'lucide-react'
import { NodeShell, Label, SelectInput, T, useUpdateNodeData, useFlowsMeta } from './_shared'

export default memo(function TriggerTag({ id, data }) {
  const update = useUpdateNodeData(id)
  const { tags } = useFlowsMeta()
  const options = [
    { value: '', label: tags?.length ? 'Selecione uma tag…' : 'Nenhuma tag cadastrada' },
    ...(tags ?? []).map((t) => ({ value: t, label: t })),
  ]
  return (
    <NodeShell id={id} color={T.green} Icon={Tag} title="Gatilho · Tag aplicada" hasInput={false}>
      <div>
        <Label>Tag que inicia o funil</Label>
        <SelectInput value={data.tag ?? ''} onChange={(e) => update({ tag: e.target.value })} options={options} />
      </div>
      <p style={{ margin: 0, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
        Quando esta tag for aplicada ao contato, o funil é iniciado.
      </p>
    </NodeShell>
  )
})
