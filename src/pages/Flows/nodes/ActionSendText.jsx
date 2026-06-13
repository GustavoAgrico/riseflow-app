// Ação: Enviar texto
import React, { memo } from 'react'
import { MessageSquare } from 'lucide-react'
import {
  NodeShell, Label, TextArea, Slider, VarChips, T,
  useUpdateNodeData, useInsertAtCursor,
} from './_shared'

const VARS = ['{{nome}}', '{{telefone}}', '{{data}}']

/* Substitui as variáveis por valores de exemplo só para o preview. */
const renderPreview = (text) =>
  (text || '')
    .replace(/\{\{nome\}\}/g, 'Maria')
    .replace(/\{\{telefone\}\}/g, '(11) 99999-0000')
    .replace(/\{\{data\}\}/g, new Date().toLocaleDateString('pt-BR'))

export default memo(function ActionSendText({ id, data }) {
  const update = useUpdateNodeData(id)
  const { ref, insert } = useInsertAtCursor(update, 'text')
  const delay = data.delay ?? 0
  const preview = renderPreview(data.text)

  return (
    <NodeShell id={id} color={T.orange} Icon={MessageSquare} title="Ação · Enviar texto">
      <div>
        <Label>Mensagem</Label>
        <TextArea ref={ref} placeholder="Olá {{nome}}! 👋 Tudo bem?"
          value={data.text ?? ''} onChange={(e) => update({ text: e.target.value })} />
      </div>
      <div>
        <Label>Variáveis disponíveis</Label>
        <VarChips vars={VARS} onInsert={insert} />
      </div>
      <div>
        <Label>Delay antes de enviar</Label>
        <Slider value={delay} onChange={(v) => update({ delay: v })} min={0} max={60} suffix="s" />
      </div>
      <div>
        <Label>Preview</Label>
        <div style={{ background: T.field, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px',
          fontSize: 11.5, color: preview ? T.text : T.dim, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {preview || 'A mensagem aparecerá aqui…'}
        </div>
      </div>
    </NodeShell>
  )
})
