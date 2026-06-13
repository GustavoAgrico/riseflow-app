import React from 'react'
import { X } from 'lucide-react'

export const ModalBase = ({ onClose, title, icon, iconBg, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
    <div className="glass rounded-2xl w-full max-w-md relative animate-fade-in">
      <div className="flex items-center justify-between p-6 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ background: iconBg ?? 'rgba(255,107,53,0.15)' }}
          >
            {icon}
          </div>
          <h2 className="font-display font-bold text-lg text-brand-orange">{title}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <X size={16} />
        </button>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </div>
  </div>
)

export const Steps = ({ items }) => (
  <div className="space-y-2.5 mb-5">
    {items.map((s, i) => (
      <div key={i} className="flex items-start gap-3">
        <div className="w-5 h-5 rounded-full bg-brand-orange/20 text-brand-orange text-[10px] flex items-center justify-center font-bold shrink-0 mt-0.5">
          {i + 1}
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{s}</p>
      </div>
    ))}
  </div>
)
