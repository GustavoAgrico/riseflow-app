import React from 'react'
import { X, HelpCircle, ChevronDown, ExternalLink } from 'lucide-react'

export const ModalBase = ({ onClose, title, icon, iconBg, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
    <div className="glass-solid rounded-2xl w-full max-w-md relative animate-fade-in">
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

/* Accordion de auto-ajuda colapsável — aparece em todos os modais de integração */
export const HelpAccordion = ({ title = 'Como fazer?', steps = [], links = [] }) => {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mb-4 rounded-xl border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-all"
      >
        <span className="flex items-center gap-2">
          <HelpCircle size={12} className="text-brand-orange shrink-0" />
          <span className="font-medium">{title}</span>
        </span>
        <ChevronDown size={12} className={`transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-white/10">
          <div className="space-y-2 mt-3">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-4 h-4 rounded-full bg-brand-orange/20 text-brand-orange text-[9px] flex items-center justify-center font-bold shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-brand-orange hover:text-orange-400 underline underline-offset-2 transition-colors"
                >
                  <ExternalLink size={10} />
                  {l.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
