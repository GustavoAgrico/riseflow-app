import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@services/activityLogger'

const AuthContext = createContext(null)

const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@riseflow.app',
  user_metadata: { full_name: 'Usuário Demo' },
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(false)
  // Ref lets the onAuthStateChange closure see the live value without re-subscribing
  const isDemoRef = useRef(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then((result) => {
      if (!mounted || isDemoRef.current) return
      const s = result?.data?.session ?? null
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)
    }).catch(() => {
      if (mounted && !isDemoRef.current) setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted || isDemoRef.current) return
      setSession(s ?? null)
      setUser(s?.user ?? null)
      setLoading(false)
    })

    return () => {
      mounted = false
      data?.subscription?.unsubscribe()
    }
  }, [])

  const signUp = async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error
    return data
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    logger.log(data?.user?.id, 'login', { category: 'auth', description: 'Login realizado' })
    return data
  }

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }

  const loginDemo = () => {
    isDemoRef.current = true
    setIsDemoMode(true)
    setUser(DEMO_USER)
    setSession(null)
    setLoading(false)
  }

  const signOut = async () => {
    logger.log(user?.id, 'logout', { category: 'auth', description: 'Logout realizado' })
    if (isDemoRef.current) {
      isDemoRef.current = false
      setIsDemoMode(false)
      setUser(null)
      setSession(null)
      localStorage.clear()
      sessionStorage.clear()
      return
    }
    await supabase.auth.signOut()
    localStorage.clear()
    sessionStorage.clear()
    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{
      user, session, loading, isDemoMode,
      signUp, signIn, signOut, signInWithGoogle, resetPassword, loginDemo,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
