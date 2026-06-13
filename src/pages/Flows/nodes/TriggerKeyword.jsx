// Gatilho: Palavra-chave
import React, { memo } from 'react'
import { Key } from 'lucide-react'
import { NodeShell, Label, TextInput, Toggle, T, useUpdateNodeData } from './_shared'

export default memo(function TriggerKeyword({ id, data }) {
  const update = useUpdateNodeData(id)
  return (
    <NodeShell id={id} color={T.green} Icon={Key} title="Gatilho · Palavra-chave" hasInput={false}>
      <div>
        <Label>Palavras-chave (separadas por vírgula)</Label>
        <TextInput placeholder="oi, olá, quero saber, informações"
          value={data.keywords ?? ''} onChange={(e) => update({ keywords: e.target.value })} />
      </div>
      <Toggle checked={data.exactMatch ?? false} onChange={(v) => update({ exactMatch: v })}
        labelOn="Correspondência exata" labelOff="Contém a palavra" />
      <Toggle checked={data.ignoreCase ?? true} onChange={(v) => update({ ignoreCase: v })}
        labelOn="Ignora maiúsc./minúsc." labelOff="Diferencia maiúsc./minúsc." />
    </NodeShell>
  )
})
