import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'

export const AuthCallback = () => {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const timedOut = useRef(false)

  // Check for OAuth error params immediately (before Supabase processes anything)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    const errorDesc = params.get('error_description')
    if (errorParam || errorDesc) {
      const msg = errorDesc || errorParam || 'Erro ao autenticar com Google'
      navigate(`/login?oauth_error=${encodeURIComponent(msg)}`, { replace: true })
    }
  }, [navigate])

  // Once auth resolves (loading=false), redirect based on result
  useEffect(() => {
    if (loading) return
    if (user) {
      navigate('/', { replace: true })
    } else if (!timedOut.current) {
      navigate('/login?oauth_error=N%C3%A3o%20foi%20poss%C3%ADvel%20autenticar.%20Tente%20novamente.', { replace: true })
    }
  }, [loading, user, navigate])

  // Safety timeout: if loading never resolves in 30s, give up
  useEffect(() => {
    const id = setTimeout(() => {
      timedOut.current = true
      navigate('/login?oauth_error=Tempo%20esgotado.%20Tente%20novamente.', { replace: true })
    }, 30000)
    return () => clearTimeout(id)
  }, [navigate])

  return (
    <div style={{
      minHeight: '100vh', background: '#0F172A', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans',sans-serif",
    }}>
      <div style={{ textAlign: 'center', color: '#94A3B8' }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #334155',
          borderTopColor: '#FF6B35', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ fontSize: 14 }}>Autenticando com Google...</p>
      </div>
    </div>
  )
}
