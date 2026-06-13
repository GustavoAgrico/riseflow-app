// Gatilho: Primeiro contato (sem campos)
import React, { memo } from 'react'
import { UserPlus } from 'lucide-react'
import { NodeShell, T } from './_shared'

export default memo(function TriggerFirstContact({ id }) {
  return (
    <NodeShell id={id} color={T.green} Icon={UserPlus} title="Gatilho · Primeiro contato" hasInput={false}>
      <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
        Ativa quando um novo contato envia a primeira mensagem.
      </p>
    </NodeShell>
  )
})
