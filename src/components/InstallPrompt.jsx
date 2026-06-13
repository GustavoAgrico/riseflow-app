import React, { useState, useEffect } from 'react'
import { Zap } from 'lucide-react'

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream

export const InstallPrompt = () => {
  const [deferred, setDeferred] = useState(null)
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('pwa_dismissed') || window.matchMedia('(display-mode: standalone)').matches) return
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); setShow(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    if (isIOS()) { setIos(true); setShow(true) }
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const close = () => { setShow(false); localStorage.setItem('pwa_dismissed', '1') }
  const install = async () => { if (deferred) { deferred.prompt(); await deferred.userChoice } close() }
  if (!show) return null

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#1E293B', borderTop: '1px solid #334155', fontFamily: "'DM Sans',sans-serif" }}>
      <Zap size={20} color="#FF6B35" />
      <span style={{ flex: 1, color: '#F8FAFC', fontSize: 14 }}>{ios ? 'Toque em Compartilhar → Adicionar à Tela Inicial' : 'Instalar RiseFlow como app'}</span>
      {!ios && <button onClick={install} style={{ background: '#FF6B35', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Instalar</button>}
      <button onClick={close} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>
  )
}
