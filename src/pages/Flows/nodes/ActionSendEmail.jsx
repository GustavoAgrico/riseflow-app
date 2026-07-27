// Ação: Enviar Email (SMTP)
// Envia um email pela integração SMTP do dono do funil (server/flowEngine.js →
// actionSendEmail). O destinatário aceita endereço literal ou {{variavel}}
// (ex.: um email capturado antes por "Aguardar resposta" e salvo numa variável).
import React, { memo } from 'react'
import { Mail } from 'lucide-react'
import {
  NodeShell, Label, TextInput, TextArea, Slider, Toggle, VarChips, T,
  useUpdateNodeData, useInsertAtCursor,
} from './_shared'

const VARS = ['{{nome}}', '{{telefone}}', '{{data}}']

export default memo(function ActionSendEmail({ id, data }) {
  const update = useUpdateNodeData(id)
  const { ref, insert } = useInsertAtCursor(update, 'body')
  const delay = data.delay ?? 0
  const asHtml = data.asHtml ?? false

  return (
    <NodeShell id={id} color={T.orange} Icon={Mail} title="Ação · Enviar Email">
      <div>
        <Label>Destinatário</Label>
        <TextInput placeholder="cliente@email.com ou {{email}}"
          value={data.to ?? ''} onChange={(e) => update({ to: e.target.value })} />
      </div>
      <div>
        <Label>Assunto</Label>
        <TextInput placeholder="Olá {{nome}}, tudo bem?"
          value={data.subject ?? ''} onChange={(e) => update({ subject: e.target.value })} />
      </div>
      <div>
        <Label>Mensagem</Label>
        <TextArea ref={ref} placeholder={asHtml ? '<p>Olá {{nome}}!</p>' : 'Olá {{nome}}!\n\nObrigado pelo contato.'}
          value={data.body ?? ''} onChange={(e) => update({ body: e.target.value })} />
      </div>
      <div>
        <Label>Variáveis (inserem na mensagem)</Label>
        <VarChips vars={VARS} onInsert={insert} />
      </div>
      <div>
        <Toggle checked={asHtml} onChange={(v) => update({ asHtml: v })} labelOn="Corpo em HTML" labelOff="Corpo em texto" />
      </div>
      <div>
        <Label>Delay antes de enviar</Label>
        <Slider value={delay} onChange={(v) => update({ delay: v })} min={0} max={60} suffix="s" />
      </div>
      <p style={{ fontSize: 10, color: T.dim, lineHeight: 1.4, margin: 0 }}>
        Requer o canal <strong style={{ color: T.muted }}>Email (SMTP)</strong> conectado em Integrações.
      </p>
    </NodeShell>
  )
})
