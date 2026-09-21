import React from 'react'
import { Sparkles } from 'lucide-react'
import { NodeShell, Label, TextArea, Toggle, useUpdateNodeData, useInsertAtCursor, VarChips, T } from './_shared'

const VARS = ['{{nome}}', '{{telefone}}', '{{data}}']

export default function ActionAIReply({ id, data = {} }) {
  const update = useUpdateNodeData(id)
  const { ref, insert } = useInsertAtCursor(update, 'instructions')

  return (
    <NodeShell id={id} color="#7C3AED" Icon={Sparkles} title="Resposta com IA">
      <Label>Instruções extras (opcional)</Label>
      <TextArea ref={ref} placeholder="Responda como um vendedor gentil…" value={data.instructions ?? ''} onChange={e => update({ instructions: e.target.value })} />
      <VarChips vars={VARS} onInsert={insert} />

      <Toggle checked={!!data.useSavedConfig} onChange={v => update({ useSavedConfig: v })} labelOn="Usar config IA da conta" labelOff="Prompt próprio" />

      <Label>Máx. tokens de resposta</Label>
      <input className="nodrag" type="number" min={50} max={2000} value={data.maxTokens ?? 500}
        onChange={e => update({ maxTokens: Number(e.target.value) })}
        style={{ width: '100%', boxSizing: 'border-box', background: T.field, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 9px', color: T.text, fontSize: 12, outline: 'none', fontFamily: 'DM Sans, sans-serif' }} />
    </NodeShell>
  )
}
