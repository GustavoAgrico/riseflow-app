import React, { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { NewFlowModal } from '@components/modals/NewFlowModal'
import { AgentDock } from '@components/Agents/AgentDock'
import { useApp } from '@context/AppContext'
import { useIsMobile } from '@hooks/useIsMobile'
import clsx from 'clsx'

export const Layout = ({ children, title, subtitle }) => {
  const { sidebarOpen, newFlowModalOpen, setNewFlowModalOpen, onFlowCreated } = useApp()
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen bg-dark-900 flex">
      <Sidebar mobile={isMobile} drawerOpen={drawerOpen} onNavigate={() => setDrawerOpen(false)} />
      {isMobile && drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} className="fixed inset-0 bg-black/50 z-40" />
      )}
      <div className={clsx('flex-1 min-w-0 flex flex-col transition-all duration-300 overflow-x-hidden', isMobile ? 'ml-0' : (sidebarOpen ? 'ml-64' : 'ml-20'))}>
        <Topbar title={title} subtitle={subtitle} onMenu={isMobile ? () => setDrawerOpen(true) : null} />
        {/* No celular a aba de agentes fica fixa no rodapé: pb-24 evita que ela cubra o conteúdo. */}
        <main className={clsx('flex-1 p-4 sm:p-6 overflow-y-auto overflow-x-hidden animate-fade-in', isMobile && 'pb-24')}>
          {children}
        </main>
      </div>

      {/* Aba de agentes (docs/AGENTES_ABA_E_MASCOTES.md): trilho à direita no desktop, barra inferior no celular. */}
      <AgentDock />

      {newFlowModalOpen && (
        <NewFlowModal
          onClose={() => setNewFlowModalOpen(false)}
          onCreated={onFlowCreated}
        />
      )}
    </div>
  )
}
