import React, { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { NewFlowModal } from '@components/modals/NewFlowModal'
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
      <div className={clsx('flex-1 flex flex-col transition-all duration-300', isMobile ? 'ml-0' : (sidebarOpen ? 'ml-64' : 'ml-20'))}>
        <Topbar title={title} subtitle={subtitle} onMenu={isMobile ? () => setDrawerOpen(true) : null} />
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto overflow-x-hidden animate-fade-in">
          {children}
        </main>
      </div>

      {newFlowModalOpen && (
        <NewFlowModal
          onClose={() => setNewFlowModalOpen(false)}
          onCreated={onFlowCreated}
        />
      )}
    </div>
  )
}
