// Ação: Aplicar tag (multi-select com criação inline)
import React, { memo } from 'react'
import { Tags } from 'lucide-react'
import { NodeShell, Label, TagMultiSelect, T, useUpdateNodeData } from './_shared'

export default memo(function ActionApplyTag({ id, data }) {
  const update = useUpdateNodeData(id)
  return (
    <NodeShell id={id} color={T.blue} Icon={Tags} title="Ação · Aplicar tag">
      <div>
        <Label>Tags a aplicar no contato</Label>
        <TagMultiSelect selected={data.tags ?? []} onChange={(tags) => update({ tags })} allowCreate />
      </div>
    </NodeShell>
  )
})
