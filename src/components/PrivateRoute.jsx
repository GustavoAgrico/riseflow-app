import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'

export const PrivateRoute = ({ children }) => {
  const { user, loading, isDemoMode } = useAuth()

  if (loading) return null

  if (!user && !isDemoMode) {
    return <Navigate to="/login" replace />
  }

  return children
}
