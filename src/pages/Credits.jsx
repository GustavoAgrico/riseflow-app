import React, { useState } from 'react'
import { ArrowLeft, Zap, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@services/api'
import { useApp } from '@context/AppContext'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    tokens: 500,
    price: 29.90,
    color: '#FF6B35',
  },
  {
    id: 'pro',
    name: 'Pro',
    tokens: 2000,
    price: 99.90,
    color: '#7C3AED',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tokens: 5000,
    price: 249.90,
    color: '#06B6D4',
  },
]

const PAYMENT_METHODS = [
  { id: 'pix', label: 'PIX', icon: '⚡', desc: 'Instantâneo', color: '#06B6D4' },
  { id: 'credit_card', label: 'Cartão de Crédito', icon: '💳', desc: 'Parcelado até 12x', color: '#FF6B35' },
  { id: 'boleto', label: 'Boleto', icon: '📄', desc: '2-3 dias úteis', color: '#7C3AED' },
]

export const Credits = () => {
  const navigate = useNavigate()
  const { toast } = useApp()
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('pix')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleBuy = (planId) => {
    setSelectedPlan(planId)
    setShowPaymentModal(true)
  }

  const handleProcessPayment = async () => {
    if (!selectedPlan) return

    setLoading(true)
    try {
      const response = await api.post('/payments/abacate', {
        planId: selectedPlan,
        paymentMethod: selectedPaymentMethod,
      })

      const { transactionId, redirectUrl, status } = response.data

      if (redirectUrl) {
        // Redirecionar para AbacatePay
        window.location.href = redirectUrl
      } else {
        // Sucesso em dev mode
        toast.success(`Pagamento iniciado! ID: ${transactionId}`)
        setShowPaymentModal(false)
      }
    } catch (error) {
      toast.error('Erro ao processar pagamento. Tente novamente.')
      console.error('Payment error:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectedPlanData = PLANS.find(p => p.id === selectedPlan)

  return (
    <div className="min-h-screen bg-dark-900 pt-20 pb-12">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft size={18} />
            Voltar
          </button>
          <h1 className="text-4xl font-bold text-white mb-2">Comprar Créditos</h1>
          <p className="text-slate-400">Escolha o plano que melhor se adequa às suas necessidades</p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {PLANS.map(plan => (
            <div
              key={plan.id}
              className="rounded-2xl p-6 border-2 transition-all duration-200 cursor-pointer"
              style={{
                borderColor: selectedPlan === plan.id ? plan.color : 'rgba(148, 163, 184, 0.2)',
                backgroundColor: selectedPlan === plan.id ? `${plan.color}10` : 'rgba(15, 23, 42, 0.5)',
              }}
              onClick={() => handleBuy(plan.id)}
            >
              {/* Badge */}
              {plan.id === 'pro' && (
                <div className="inline-block mb-4 px-3 py-1 rounded-full bg-brand-orange/20 text-brand-orange text-xs font-semibold">
                  Mais Popular
                </div>
              )}

              {/* Title */}
              <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>

              {/* Tokens */}
              <div className="flex items-center gap-2 mb-4">
                <Zap size={18} style={{ color: plan.color }} />
                <span className="text-lg font-semibold text-white">{plan.tokens.toLocaleString()} tokens</span>
              </div>

              {/* Price */}
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">
                  R$ {plan.price.toFixed(2)}
                </span>
                <p className="text-sm text-slate-400 mt-1">
                  {(plan.price / plan.tokens * 100).toFixed(2)}¢ por token
                </p>
              </div>

              {/* Button */}
              <button
                className="w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: selectedPlan === plan.id ? plan.color : `${plan.color}20`,
                  color: selectedPlan === plan.id ? '#fff' : plan.color,
                }}
              >
                {selectedPlan === plan.id ? (
                  <>
                    <Check size={18} />
                    Selecionado
                  </>
                ) : (
                  'Selecionar'
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Payment History (placeholder) */}
        <div className="rounded-2xl p-6 border border-dark-400 bg-dark-800/50">
          <h2 className="text-xl font-bold text-white mb-4">Histórico de Transações</h2>
          <p className="text-slate-400">Nenhuma transação encontrada</p>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedPlanData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-2xl p-8 max-w-md w-full animate-in fade-in slide-in-from-bottom-4">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Confirmar Compra</h2>
              <p className="text-slate-400">Revise os detalhes antes de pagar</p>
            </div>

            {/* Order Summary */}
            <div className="bg-dark-700 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-slate-400">Plano</span>
                <span className="font-semibold text-white">{selectedPlanData.name}</span>
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-slate-400">Tokens</span>
                <span className="font-semibold text-white">{selectedPlanData.tokens.toLocaleString()}</span>
              </div>
              <div className="border-t border-dark-500 pt-4 flex items-center justify-between">
                <span className="text-slate-400">Valor Total</span>
                <span className="text-2xl font-bold" style={{ color: selectedPlanData.color }}>
                  R$ {selectedPlanData.price.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment Methods */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Método de Pagamento
              </label>
              <div className="space-y-2">
                {PAYMENT_METHODS.map(method => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPaymentMethod(method.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                      selectedPaymentMethod === method.id
                        ? 'border-current bg-current/10'
                        : 'border-dark-500 hover:border-dark-400'
                    }`}
                    style={{
                      borderColor: selectedPaymentMethod === method.id ? method.color : undefined,
                      backgroundColor: selectedPaymentMethod === method.id ? `${method.color}15` : undefined,
                    }}
                  >
                    <span className="text-xl">{method.icon}</span>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-white">{method.label}</p>
                      <p className="text-xs text-slate-400">{method.desc}</p>
                    </div>
                    {selectedPaymentMethod === method.id && (
                      <Check size={18} style={{ color: method.color }} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 px-4 py-3 rounded-lg bg-dark-700 text-white font-semibold hover:bg-dark-600 transition-colors"
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                onClick={handleProcessPayment}
                className="flex-1 px-4 py-3 rounded-lg text-white font-semibold transition-all"
                style={{ backgroundColor: selectedPlanData.color }}
                disabled={loading}
              >
                {loading ? 'Processando...' : 'Pagar Agora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
