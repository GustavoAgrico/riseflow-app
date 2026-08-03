import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export const AuthCallback = () => {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const errorParam = params.get('error')
    const errorDesc = params.get('error_description')

    if (errorParam || errorDesc) {
      const msg = errorDesc || errorParam || 'Erro ao autenticar com Google'
      navigate(`/login?oauth_error=${encodeURIComponent(msg)}`, { replace: true })
      return
    }

    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error: exchErr }) => {
          if (exchErr) {
            navigate(`/login?oauth_error=${encodeURIComponent(exchErr.message)}`, { replace: true })
          } else {
            navigate('/', { replace: true })
          }
        })
        .catch((e) => {
          navigate(`/login?oauth_error=${encodeURIComponent(e?.message || 'Falha na troca do código')}`, { replace: true })
        })
      return
    }

    // No code or error — redirect to login
    navigate('/login', { replace: true })
  }, [navigate])

  if (error) return null

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
        <p style={{ fontSize: 14 }}>Autenticando...</p>
      </div>
    </div>
  )
}
