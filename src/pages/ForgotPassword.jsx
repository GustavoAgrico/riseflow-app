import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ArrowLeft, Mail, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError('Erro ao enviar email. Verifique o endereço e tente novamente.')
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

          {sent ? (
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-brand-orange/20 border border-brand-orange/40 flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={32} className="text-brand-orange" />
              </div>
              <h1 className="font-display font-bold text-2xl text-white mb-3">Email enviado!</h1>
              <p className="text-slate-400 mb-2">
                Verifique sua caixa de entrada.
              </p>
              <p className="text-slate-500 text-sm mb-8">
                Enviamos um link de recuperação para{' '}
                <span className="text-brand-orange">{email}</span>
              </p>
              <Link
                to="/login"
                className="btn-primary inline-flex justify-center gap-2 px-8 py-3 text-base"
              >
                <ArrowLeft size={16} />
                Voltar para o login
              </Link>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-brand-orange/20 border border-brand-orange/40 flex items-center justify-center mb-6">
                <Mail size={26} className="text-brand-orange" />
              </div>

              <h1 className="font-display font-bold text-3xl text-white mb-2">Recuperar senha</h1>
              <p className="text-slate-400 mb-8">
                Digite seu email e enviaremos um link para criar uma nova senha.
              </p>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-brand-red/10 border border-brand-red/30 text-brand-red text-sm animate-fade-in">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-field"
                    placeholder="seu@email.com"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full justify-center py-3 text-base disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Enviar link de recuperação'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft size={14} />
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
            <Mail size={36} className="text-brand-orange" />
          </div>
          <h2 className="font-display font-bold text-3xl text-white mb-4">
            Recupere seu<br />
            <span className="gradient-text">acesso agora.</span>
          </h2>
          <p className="text-slate-400 max-w-xs mx-auto text-sm leading-relaxed">
            Em menos de 2 minutos você terá acesso novamente à sua conta e poderá continuar automatizando suas vendas.
          </p>
        </div>
      </div>
    </div>
  )
}
