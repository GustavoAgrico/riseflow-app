import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'

export const PrivateRoute = ({ children }) => {
  const { user, loading, isDemoMode, canAccess } = useAuth()
  const location = useLocation()

  if (loading) return null

  // Allow video routes without authentication for testing
  const videoRoutes = ['/video-dashboard', '/video-editor', '/broll-manager']
  const isVideoRoute = videoRoutes.some(route => location.pathname.startsWith(route))

  if (!user && !isDemoMode && !isVideoRoute) {
    return <Navigate to="/login" replace />
  }

  // Guarda por cargo: um membro que digitar uma rota fora do seu acesso
  // (ex.: /billing) é levado de volta ao painel. O dono passa sempre.
  if (!isDemoMode && !canAccess(location.pathname) && !isVideoRoute) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
