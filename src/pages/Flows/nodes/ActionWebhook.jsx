// Ação: Chamar webhook
import React, { memo } from 'react'
import { Webhook } from 'lucide-react'
import {
  NodeShell, Label, TextInput, TextArea, SelectInput, Toggle, KeyValueEditor, T, useUpdateNodeData,
} from './_shared'

const METHODS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
]

export default memo(function ActionWebhook({ id, data }) {
  const update = useUpdateNodeData(id)
  const method = data.method ?? 'POST'
  return (
    <NodeShell id={id} color={T.blue} Icon={Webhook} title="Ação · Chamar webhook">
      <div>
        <Label>URL do webhook</Label>
        <TextInput placeholder="https://api.exemplo.com/hook"
          value={data.url ?? ''} onChange={(e) => update({ url: e.target.value })} />
      </div>
      <div>
        <Label>Método</Label>
        <SelectInput value={method} onChange={(e) => update({ method: e.target.value })} options={METHODS} />
      </div>
      <div>
        <Label>Headers customizados</Label>
        <KeyValueEditor rows={data.headers ?? []} onChange={(headers) => update({ headers })} />
      </div>
      {method === 'POST' && (
        <div>
          <Label>Body (JSON)</Label>
          <TextArea spellCheck={false} placeholder={'{\n  "nome": "{{nome}}",\n  "telefone": "{{telefone}}"\n}'}
            value={data.body ?? ''} onChange={(e) => update({ body: e.target.value })}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, minHeight: 70 }} />
        </div>
      )}
      <Toggle checked={data.waitResponse ?? false} onChange={(v) => update({ waitResponse: v })}
        labelOn="Aguarda resposta do webhook" labelOff="Continua sem aguardar" />
    </NodeShell>
  )
})
