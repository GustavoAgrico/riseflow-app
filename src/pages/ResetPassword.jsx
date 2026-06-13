import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, Eye, EyeOff, Lock, CheckCircle, AlertCircle, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export const ResetPassword = () => {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase v2 fires PASSWORD_RECOVERY when the magic link is opened
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setSessionReady(true)
      }
    })

    // Handles case where page is refreshed after the hash is already processed
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 8) { setError('Senha deve ter no mínimo 8 caracteres'); return }
    if (password !== confirmPassword) { setError('As senhas não coincidem'); return }

    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setError(err.message || 'Erro ao atualizar senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex">
      {/* Left - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-slide-up">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-orange to-brand-blue flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <span className="font-display font-bold text-2xl gradient-text">RiseFlow</span>
          </div>

          {success ? (
            /* ── Success state ── */
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-brand-green/20 border border-brand-green/40 flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={32} className="text-brand-green" />
              </div>
              <h1 className="font-display font-bold text-2xl text-white mb-3">Senha atualizada!</h1>
              <p className="text-slate-400 text-sm mb-2">Sua senha foi alterada com sucesso.</p>
              <p className="text-slate-500 text-xs mb-8">Redirecionando para o login…</p>
              <Link to="/login" className="btn-primary inline-flex justify-center px-8 py-3 text-base">
                Ir para o login
              </Link>
            </div>

          ) : !sessionReady ? (
            /* ── Waiting for magic link session ── */
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-brand-orange/20 border border-brand-orange/40 flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={32} className="text-brand-orange" />
              </div>
              <h1 className="font-display font-bold text-2xl text-white mb-3">Link inválido ou expirado</h1>
              <p className="text-slate-400 text-sm mb-8">
                Este link de recuperação não é mais válido. Solicite um novo link pelo formulário.
              </p>
              <Link to="/forgot-password" className="btn-primary inline-flex justify-center px-8 py-3 text-base">
                Solicitar novo link
              </Link>
            </div>

          ) : (
            /* ── New password form ── */
            <>
              <div className="w-14 h-14 rounded-2xl bg-brand-orange/20 border border-brand-orange/40 flex items-center justify-center mb-6">
                <Lock size={26} className="text-brand-orange" />
              </div>

              <h1 className="font-display font-bold text-3xl text-white mb-2">Nova senha</h1>
              <p className="text-slate-400 mb-8 text-sm">
                Escolha uma senha forte para proteger sua conta.
              </p>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-brand-red/10 border border-brand-red/30 text-brand-red text-sm animate-fade-in">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Nova senha</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="input-field pr-10"
                      placeholder="Mínimo 8 caracteres"
                      required
                      autoFocus
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-1.5 flex gap-1">
                      {[8, 12, 16].map((len, i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${password.length >= len ? 'bg-brand-orange' : 'bg-dark-400'}`} />
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-2">Confirmar nova senha</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="input-field pr-10"
                      placeholder="Repita a senha"
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirmPassword && (
                    <p className={`text-xs mt-1 flex items-center gap-1 ${password === confirmPassword ? 'text-brand-green' : 'text-brand-red'}`}>
                      {password === confirmPassword ? <CheckCircle size={13} /> : <XCircle size={13} />} {password === confirmPassword ? 'Senhas coincidem' : 'Senhas diferentes'}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !password || !confirmPassword}
                  className="btn-primary w-full justify-center py-3 text-base disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Salvar nova senha'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link to="/login" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Voltar para o login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right - Visual */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-dark-800 to-dark-900 items-center justify-center p-12 border-l border-dark-400 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-brand-orange/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-brand-blue/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="relative text-center">
          <div className="w-20 h-20 rounded-2xl glass-orange flex items-center justify-center mx-auto mb-6 animate-float glow-orange">
            <Lock size={36} className="text-brand-orange" />
          </div>
          <h2 className="font-display font-bold text-3xl text-white mb-4">
            Sua segurança<br />
            <span className="gradient-text">é prioridade.</span>
          </h2>
          <p className="text-slate-400 max-w-xs mx-auto text-sm leading-relaxed">
            Use uma senha forte com letras, números e símbolos para manter sua conta protegida.
          </p>
        </div>
      </div>
    </div>
  )
}
