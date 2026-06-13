import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { native } from './services/nativeService'
import { AppProvider, useApp } from '@context/AppContext'
import { AuthProvider, useAuth } from '@context/AuthContext'
import { NotificationToast } from '@components/NotificationToast'
import { InstallPrompt } from '@components/InstallPrompt'
import { PrivateRoute } from '@components/PrivateRoute'
import { Dashboard } from '@pages/Dashboard'
import { Clients } from '@pages/Clients'
import { CRM } from '@pages/CRM'
import { Integrations } from '@pages/Integrations'
import { Analytics } from '@pages/Analytics'
import { Funnel } from '@pages/Funnel'
import { Automation } from '@pages/Automation'
import { Campaigns } from '@pages/Campaigns'
import { Schedules } from '@pages/Schedules'
import { Teams } from '@pages/Teams'
import { Settings } from '@pages/Settings'
import { Login } from '@pages/Login'
import { Register } from '@pages/Register'
import { ForgotPassword } from '@pages/ForgotPassword'
import { ResetPassword } from '@pages/ResetPassword'
import { Chat } from '@pages/Chat'
import { SmartAttendant } from '@pages/SmartAttendant'
import { FlowBuilder } from '@pages/FlowBuilder'
import Flows from '@pages/Flows'
import { Templates } from '@pages/Templates'
import { Plans } from '@pages/Plans'
import { PlanDetails } from '@pages/PlanDetails'
import { ActivityLogs } from '@pages/ActivityLogs'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[RiseFlow] Erro capturado:', error.message, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0A0E1A', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif',
          padding: '2rem'
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,107,53,0.4)',
            borderRadius: '16px', padding: '2rem', maxWidth: '560px', width: '100%'
          }}>
            <h2 style={{ color: '#FF6B35', marginBottom: '1rem', fontSize: '1.2rem' }}>
              Erro na aplicação
            </h2>
            <pre style={{
              color: '#94A3B8', fontSize: '0.8rem', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', background: 'rgba(0,0,0,0.3)',
              padding: '1rem', borderRadius: '8px'
            }}>
              {this.state.error.message}
            </pre>
            <p style={{ color: '#64748B', fontSize: '0.8rem', marginTop: '1rem' }}>
              Verifique o console do browser (F12) para mais detalhes.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '1rem', background: '#FF6B35', color: 'white',
                border: 'none', borderRadius: '8px', padding: '0.6rem 1.2rem',
                cursor: 'pointer', fontWeight: 600
              }}
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Toasts globais (fora do router) — consomem o estado compartilhado do AppContext.
function GlobalToasts() {
  const { toasts, dismissToast } = useApp()
  return <NotificationToast notifications={toasts} onDismiss={dismissToast} />
}

// Raiz: redireciona para /dashboard se logado, /login caso contrário.
function RootRedirect() {
  const { user, loading, isDemoMode } = useAuth()
  if (loading) return null
  return <Navigate to={user || isDemoMode ? '/dashboard' : '/login'} replace />
}

function App() {
  useEffect(() => { native.init() }, [])

  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppProvider>
          <GlobalToasts />
          <InstallPrompt />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Root: redireciona conforme estado de login */}
              <Route path="/" element={<RootRedirect />} />

              {/* Protected routes */}
              <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
              <Route path="/smart-attendant" element={<PrivateRoute><SmartAttendant /></PrivateRoute>} />
              <Route path="/flow-builder" element={<PrivateRoute><FlowBuilder /></PrivateRoute>} />
              <Route path="/flow-builder/:id" element={<PrivateRoute><FlowBuilder /></PrivateRoute>} />
              <Route path="/flows" element={<PrivateRoute><FlowBuilder /></PrivateRoute>} />
              <Route path="/flows/:id" element={<PrivateRoute><FlowBuilder /></PrivateRoute>} />
              <Route path="/flows-novo" element={<PrivateRoute><Flows /></PrivateRoute>} />
              <Route path="/crm" element={<PrivateRoute><CRM /></PrivateRoute>} />
              <Route path="/clients" element={<PrivateRoute><Clients /></PrivateRoute>} />
              <Route path="/campaigns" element={<PrivateRoute><Campaigns /></PrivateRoute>} />
              <Route path="/schedules" element={<PrivateRoute><Schedules /></PrivateRoute>} />
              <Route path="/teams" element={<PrivateRoute><Teams /></PrivateRoute>} />
              <Route path="/integrations" element={<PrivateRoute><Integrations /></PrivateRoute>} />
              <Route path="/automation" element={<PrivateRoute><Automation /></PrivateRoute>} />
              <Route path="/analytics" element={<PrivateRoute><Analytics /></PrivateRoute>} />
              <Route path="/funnel" element={<PrivateRoute><Funnel /></PrivateRoute>} />
              <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
              <Route path="/activity-logs" element={<PrivateRoute><ActivityLogs /></PrivateRoute>} />
              <Route path="/templates" element={<PrivateRoute><Templates /></PrivateRoute>} />
              <Route path="/plans" element={<PrivateRoute><Plans /></PrivateRoute>} />
              <Route path="/plans/:planId" element={<PrivateRoute><PlanDetails /></PrivateRoute>} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App

