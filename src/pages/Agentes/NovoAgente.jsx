// Placeholder de "Criar agente" (botão + da aba de agentes).
// A tela real (função, mascote, permissões e aprovação) vem na fase 3 da arquitetura dos agentes.
import React from 'react'
import { Layout } from '@components/Layout/Layout'
import { RiserAvatar, RISER_KINDS } from '@components/Agents/RiserAvatar'

export default function NovoAgente() {
  return (
    <Layout title="Criar agente" subtitle="Monte um assistente para o seu time">
      <div className="rf-panel" style={{ padding: 32, maxWidth: 640 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          {RISER_KINDS.map((k) => <RiserAvatar key={k} kind={k} size={52} />)}
        </div>
        <h1 style={{ color: 'var(--ink-1)', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Criar agente</h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 14, margin: 0 }}>Em breve: escolha a função, o mascote e as permissões.</p>
      </div>
    </Layout>
  )
}
