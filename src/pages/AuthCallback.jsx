import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { supabase } from '@/lib/supabase'

export const AuthCallback = () => {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const timedOut = useRef(false)
  const handled = useRef(false)
  // Prevents error-redirect while setSession/exchange is still resolving
  const isHandlingImplicit = useRef(false)
  const isHandlingPkce = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const search = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))

    const errorParam = search.get('error') || hash.get('error')
    const errorDesc = search.get('error_description') || hash.get('error_description')
    if (errorParam || errorDesc) {
      const msg = errorDesc || errorParam || 'Erro ao autenticar com Google'
      navigate(`/login?oauth_error=${encodeURIComponent(msg)}`, { replace: true })
      return
    }

    // Implicit flow: #access_token=... in hash
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')
    if (accessToken && refreshToken) {
      // Block the error-navigation below until this resolves
      isHandlingImplicit.current = true
      // Clear tokens from URL immediately
      window.history.replaceState({}, '', window.location.pathname)

      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error: sessErr }) => {
          if (sessErr) {
            isHandlingImplicit.current = false
            navigate(`/login?oauth_error=${encodeURIComponent(sessErr.message)}`, { replace: true })
          }
          // Success: onAuthStateChange fires → AuthContext sets user → loading/user effect redirects
        })
        .catch((e) => {
          isHandlingImplicit.current = false
          navigate(`/login?oauth_error=${encodeURIComponent(e?.message || 'Falha ao criar sessão')}`, { replace: true })
        })
      return
    }

    // PKCE flow: ?code=... — troca EXPLÍCITA do código por sessão. Bloqueia o
    // error-redirect abaixo até resolver (no mobile a troca é mais lenta e havia
    // corrida que devolvia pro login). Em erro, mostra a mensagem real.
    const code = search.get('code')
    if (code) {
      isHandlingPkce.current = true
      supabase.auth.exchangeCodeForSession(code)
        .then(({ data, error: exErr }) => {
          if (exErr) {
            console.error('[auth] exchangeCodeForSession erro:', exErr)
            isHandlingPkce.current = false
            navigate(`/login?oauth_error=${encodeURIComponent(exErr.message)}`, { replace: true })
          } else if (data?.session) {
            navigate('/dashboard', { replace: true })   // sessão criada — vai direto pro painel
          } else {
            isHandlingPkce.current = false
            navigate('/login?oauth_error=Sess%C3%A3o%20n%C3%A3o%20criada', { replace: true })
          }
        })
        .catch((e) => {
          console.error('[auth] exchangeCodeForSession exceção:', e)
          isHandlingPkce.current = false
          navigate(`/login?oauth_error=${encodeURIComponent(e?.message || 'Falha ao trocar o código do Google')}`, { replace: true })
        })
    }
  }, [navigate])

  // Redirect once auth resolves — but never on error if implicit flow is still in progress
  useEffect(() => {
    if (loading) return
    if (user) {
      navigate('/dashboard', { replace: true })
      return
    }
    if (isHandlingImplicit.current || isHandlingPkce.current) return   // troca em andamento, aguarda
    if (!timedOut.current) {
      navigate('/login?oauth_error=N%C3%A3o%20foi%20poss%C3%ADvel%20autenticar.%20Tente%20novamente.', { replace: true })
    }
  }, [loading, user, navigate])

  // Safety timeout (30 s)
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
        <p style={{ fontSize: 14 }}>Entrando...</p>
      </div>
    </div>
  )
}
