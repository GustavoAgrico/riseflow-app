import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { supabase } from '@/lib/supabase'

export const AuthCallback = () => {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const timedOut = useRef(false)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const search = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))

    // OAuth error from Supabase/Google
    const errorParam = search.get('error') || hash.get('error')
    const errorDesc = search.get('error_description') || hash.get('error_description')
    if (errorParam || errorDesc) {
      const msg = errorDesc || errorParam || 'Erro ao autenticar com Google'
      navigate(`/login?oauth_error=${encodeURIComponent(msg)}`, { replace: true })
      return
    }

    // Implicit flow: Supabase returned #access_token=... in the hash
    // Set the session manually to avoid the _getUser fetch bug
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')
    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error: sessErr }) => {
          if (sessErr) {
            navigate(`/login?oauth_error=${encodeURIComponent(sessErr.message)}`, { replace: true })
          }
          // onAuthStateChange fires → user gets set → loading=false effect handles redirect
        })
        .catch((e) => {
          navigate(`/login?oauth_error=${encodeURIComponent(e?.message || 'Falha ao criar sessão')}`, { replace: true })
        })
      // Clear the hash from the URL so the tokens don't stay visible
      window.history.replaceState({}, '', window.location.pathname)
      return
    }

    // PKCE flow: Supabase returned ?code=... — handled automatically by getSession()
    // Just wait for AuthContext to resolve (loading=false effect below)
  }, [navigate])

  // Once auth resolves, redirect based on result
  useEffect(() => {
    if (loading) return
    if (user) {
      navigate('/', { replace: true })
    } else if (!timedOut.current) {
      navigate('/login?oauth_error=N%C3%A3o%20foi%20poss%C3%ADvel%20autenticar.%20Tente%20novamente.', { replace: true })
    }
  }, [loading, user, navigate])

  // Safety timeout
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
