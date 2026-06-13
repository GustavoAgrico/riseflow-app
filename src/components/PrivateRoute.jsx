import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { Sparkles } from 'lucide-react'

export const PrivateRoute = ({ children }) => {
  const { user, loading, isDemoMode } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-orange to-brand-blue flex items-center justify-center glow-orange animate-pulse-slow">
            <Sparkles size={22} className="text-white" />
          </div>
          <div className="w-8 h-8 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!user && !isDemoMode) {
    return <Navigate to="/login" replace />
  }

  return children
}
