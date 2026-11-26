// Aviso no rodapé com "Desfazer". Uso:
//   const { toastEl, showToast } = useUndoToast()
//   showToast('Passo removido.', () => restaurar())
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export function useUndoToast({ undoMs = 6000, plainMs = 2500 } = {}) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const showToast = useCallback((text, undo) => {
    clearTimeout(timer.current)
    setToast({ text, undo, key: Date.now() })
    timer.current = setTimeout(() => setToast(null), undo ? undoMs : plainMs)
  }, [undoMs, plainMs])

  const toastEl = toast && (
    <div key={toast.key} role="status" className="rf-toast" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 1001, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--ink-1)', maxWidth: 'calc(100vw - 32px)' }}>
      <span>{toast.text}</span>
      {toast.undo && (
        <button onClick={() => { const u = toast.undo; clearTimeout(timer.current); setToast(null); u() }}
          style={{ background: 'none', border: 'none', color: '#FF6B35', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Desfazer</button>
      )}
      <button onClick={() => setToast(null)} aria-label="Fechar aviso" style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
    </div>
  )
  return { toastEl, showToast }
}

export default useUndoToast
