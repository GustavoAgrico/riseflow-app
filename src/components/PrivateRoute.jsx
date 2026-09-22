import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'

export const PrivateRoute = ({ children }) => {
  const { user, loading, isDemoMode, canAccess } = useAuth()
  const location = useLocation()

  if (loading) return null

  if (!user && !isDemoMode) {
    return <Navigate to="/login" replace />
  }

  // Guarda por cargo: um membro que digitar uma rota fora do seu acesso
  // (ex.: /billing) é levado de volta ao painel. O dono passa sempre.
  if (!isDemoMode && !canAccess(location.pathname)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
