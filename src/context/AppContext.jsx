import React, { createContext, useContext, useState, useCallback } from 'react'
import { useNotifications } from '@hooks/useNotifications'

const AppContext = createContext(null)

export const AppProvider = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [newFlowModalOpen, setNewFlowModalOpen] = useState(false)
  const [flowsVersion, setFlowsVersion] = useState(0)
  // Paleta de comandos: null (fechada) | 'search' (Ctrl+K) | 'create' (N) | 'help' (?)
  const [command, setCommand] = useState(null)

  // Notificações em tempo real (sino da topbar + toasts globais)
  const notif = useNotifications()

  const onFlowCreated = useCallback(() => {
    setNewFlowModalOpen(false)
    setFlowsVersion(v => v + 1)
  }, [])

  return (
    <AppContext.Provider value={{
      sidebarOpen, setSidebarOpen,
      ...notif,
      newFlowModalOpen, setNewFlowModalOpen,
      flowsVersion, onFlowCreated,
      command, setCommand,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
