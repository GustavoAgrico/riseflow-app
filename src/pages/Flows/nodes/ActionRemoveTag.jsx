import React from 'react'
import { Tags as TagsIcon } from 'lucide-react'
import { NodeShell, Label, TagMultiSelect, useUpdateNodeData, T } from './_shared'

export default function ActionRemoveTag({ id, data = {} }) {
  const update = useUpdateNodeData(id)
  return (
    <NodeShell id={id} color="#EF4444" Icon={TagsIcon} title="Remover tag">
      <Label>Tags a remover</Label>
      <TagMultiSelect selected={data.tags ?? []} onChange={tags => update({ tags })} />
    </NodeShell>
  )
}
