// Dicas dos agentes: balão que um mascote "fala" ao lado do trilho e painel "Seu dia".
// As dicas vêm de src/lib/coach.js; os números, de useCoachData.
import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { X, ArrowRight, RefreshCw, Zap, TrendingUp, Compass, Sparkles } from 'lucide-react'
import { RiserAvatar } from './RiserAvatar'

const F = 'DM Sans, sans-serif'
const MUT_C = 'var(--ink-3)'
const ORANGE = 'linear-gradient(135deg,#FF9A2E,#FF6A1F)'

// Preferências por navegador (só conveniência): dicas vistas hoje e pausa do dia.
const todayKey = () => new Date().toISOString().slice(0, 10)
const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v) } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sem storage */ } }
export const coachPrefs = {
  seen: () => read(`rf.coach.seen.${todayKey()}`, []),
  markSeen: (id) => { const l = coachPrefs.seen(); if (!l.includes(id)) write(`rf.coach.seen.${todayKey()}`, [...l, id]) },
  paused: () => read('rf.coach.paused', '') === todayKey(),
  pause: () => write('rf.coach.paused', todayKey()),
  resume: () => write('rf.coach.paused', ''),
}

const KIND_META = {
  acao: { label: 'Fazer agora', Icon: Zap, color: '#FF6B35' },
  desempenho: { label: 'Desempenho', Icon: TrendingUp, color: '#22C55E' },
  processo: { label: 'Nesta tela', Icon: Compass, color: '#53BDEB' },
}

function TipCta({ tip, onGo, compact }) {
  if (!tip.cta) return null
  return (
    <Link to={tip.cta.to} onClick={onGo} className="rf-press" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: compact ? 30 : 34, padding: '0 12px', borderRadius: 9,
      background: ORANGE, color: '#1A0B02', fontWeight: 700, fontSize: 12.5, textDecoration: 'none', whiteSpace: 'nowrap',
    }}>{tip.cta.label} <ArrowRight size={13} /></Link>
  )
}

// Balão: desktop ao lado do trilho, na altura do mascote; celular acima da barra inferior.
export function CoachBubble({ tip, agent, anchorY, mobile, onClose, onNext, onPause, hasNext, onGo, onPrompt }) {
  const hover = useRef(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Some sozinho depois de 16 s (espera o mouse sair se a pessoa estiver lendo).
  useEffect(() => {
    const t = setInterval(() => { if (!hover.current) closeRef.current('timeout') }, 16000)
    return () => clearInterval(t)
  }, [tip.id])

  const pos = mobile
    ? { left: 12, right: 12, bottom: 84 }
    : { right: 64 + 14, top: Math.max(76, Math.min((anchorY || 120) - 46, window.innerHeight - 260)), width: 320 }
  const meta = KIND_META[tip.kind] || KIND_META.acao
  return (
    <div role="status" aria-live="polite" className={mobile ? 'rf-bubble-up' : 'rf-bubble'}
      onMouseEnter={() => { hover.current = true }} onMouseLeave={() => { hover.current = false }}
      style={{
        position: 'fixed', zIndex: 46, ...pos, fontFamily: F, color: 'var(--ink-1)',
        background: 'var(--panel)', border: '1px solid rgba(255,107,53,0.35)', borderRadius: 16,
        boxShadow: '0 18px 50px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset', padding: '14px 14px 12px',
      }}>
      {/* seta apontando para o mascote */}
      {!mobile && <span aria-hidden="true" style={{ position: 'absolute', right: -7, top: 38, width: 12, height: 12, background: 'var(--panel)', borderRight: '1px solid rgba(255,107,53,0.35)', borderTop: '1px solid rgba(255,107,53,0.35)', transform: 'rotate(45deg)' }} />}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <RiserAvatar kind={agent?.kind || tip.agent} size={36} motion="talk" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: meta.color, letterSpacing: 0.3 }}>
            <meta.Icon size={12} /> {(agent?.name || 'Agente')} · {meta.label}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 3 }}>{tip.title}</div>
          <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2, var(--ink-1))' }}>{tip.text}</p>
        </div>
        <button type="button" onClick={() => onClose('close')} aria-label="Fechar dica" style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', display: 'flex', padding: 2 }}><X size={15} /></button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <TipCta tip={tip} onGo={onGo} compact />
        {tip.prompts?.length > 0 && onPrompt && tip.prompts.map(p => (
          <button key={p} type="button" onClick={() => onPrompt(tip, p)} className="rf-press"
            style={{ minHeight: 30, maxWidth: '100%', padding: '0 11px', borderRadius: 9, border: '1px solid rgba(255,107,53,.45)', background: 'rgba(255,107,53,.1)', color: 'var(--ink-1)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: F, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p}
          </button>
        ))}
        {hasNext && (
          <button type="button" onClick={onNext} className="rf-press" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 30, padding: '0 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-1)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
            <RefreshCw size={12} /> Outra dica
          </button>
        )}
        <button type="button" onClick={onPause} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 11.5, cursor: 'pointer', fontFamily: F, textDecoration: 'underline' }}>Pausar hoje</button>
      </div>
    </div>
  )
}

// Painel "Seu dia": todas as dicas agrupadas, cada uma com o mascote que fala dela.
export function CoachPanel({ tips, headline, agentFor, onClose, onGo, paused, onTogglePause, mobile, onAsk, topSlot }) {
  const groups = ['acao', 'desempenho', 'processo']
    .map(k => ({ k, ...KIND_META[k], items: tips.filter(t => t.kind === k) }))
    .filter(g => g.items.length)
  return (
    <section aria-label="Seu dia" style={{
      width: mobile ? '100%' : 380, height: mobile ? '70vh' : '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--card)', borderLeft: mobile ? 'none' : '1px solid var(--border)', borderTop: mobile ? '1px solid var(--border)' : 'none',
      fontFamily: F, color: 'var(--ink-1)', boxSizing: 'border-box',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'radial-gradient(ellipse at 0% 0%, rgba(255,107,53,0.14), transparent 70%)' }}>
        <div style={{ display: 'flex' }}>
          {['comercial', 'agenda', 'metas'].map((k, i) => (
            <span key={k} style={{ marginLeft: i ? -12 : 0 }}><RiserAvatar kind={k} size={34} motion="idle" delay={i * 0.4} /></span>
          ))}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Seu dia</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>{headline}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar Seu dia" style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer' }}><X size={18} /></button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gap: 16, alignContent: 'start' }}>
        {topSlot}
        {!tips.length && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Carregando seus números…</p>}
        {groups.map(g => (
          <div key={g.k}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: g.color, marginBottom: 8 }}>
              <g.Icon size={13} /> {g.label}
            </div>
            <div className="rf-cards" style={{ display: 'grid', gap: 8 }}>
              {g.items.map(t => {
                const a = agentFor(t.agent)
                return (
                  <div key={t.id} className="rf-lift" style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <RiserAvatar kind={a?.kind || t.agent} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>{a?.name || 'Agente'}</div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 1 }}>{t.title}</div>
                      <p style={{ margin: '3px 0 8px', fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2, var(--ink-1))' }}>{t.text}</p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <TipCta tip={t} onGo={onGo} compact />
                        {a && onAsk && (
                          <button type="button" onClick={() => onAsk(a, t)} style={{ minHeight: 30, padding: '0 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-1)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
                            Perguntar a {a.name}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <footer style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1 }}>{paused ? 'Balões de dica pausados hoje.' : 'Os agentes mostram uma dica ao trocar de tela.'}</span>
        <button type="button" onClick={onTogglePause} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--ink-1)', fontSize: 12, padding: '5px 10px', cursor: 'pointer', fontFamily: F }}>
          {paused ? 'Retomar dicas' : 'Pausar hoje'}
        </button>
      </footer>
    </section>
  )
}

// Faixa de dicas do agente aberto, acima da conversa.
export function AgentTips({ tips, onGo }) {
  if (!tips.length) return null
  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gap: 8, background: 'rgba(255,107,53,0.05)' }}>
      {tips.slice(0, 2).map(t => (
        <div key={t.id} className="rf-pop" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>💡 {t.title}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>{t.text}</div>
          </div>
          <TipCta tip={t} onGo={onGo} compact />
        </div>
      ))}
    </div>
  )
}

// ── Ações sugeridas pelos agentes (só executam com aprovação) ────────────────
const RISK = {
  baixo: { label: 'conversa', color: '#53BDEB' },
  medio: { label: 'muda dados no CRM', color: '#EAB308' },
  alto: { label: 'envia para fora', color: '#FF6B35' },
}
const dismissKey = () => `rf.coach.dismissed.${todayKey()}`
export const suggestionPrefs = {
  dismissed: () => read(dismissKey(), []),
  dismiss: (id) => { const l = suggestionPrefs.dismissed(); if (!l.includes(id)) write(dismissKey(), [...l, id]) },
}

function SuggestionCard({ s, agent, state, onApprove, onAsk, onDismiss, compact }) {
  const [open, setOpen] = React.useState(!compact)
  const risk = RISK[s.risk] || RISK.medio
  const isAsk = !s.actions && s.prompt
  const busy = state === 'running'
  return (
    <div className="rf-feed-in" style={{ padding: 12, borderRadius: 14, border: `1px solid ${s.on_page ? 'rgba(255,107,53,.45)' : 'var(--border)'}`, background: s.on_page ? 'linear-gradient(135deg, rgba(255,107,53,.10), transparent 70%), var(--bg)' : 'var(--bg)', fontFamily: F, color: 'var(--ink-1)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <RiserAvatar kind={agent?.kind || s.agent_kind} size={32} motion={busy ? 'think' : undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: MUT_C, fontWeight: 700 }}>{agent?.name || s.agent_name || 'Agente'} sugere</span>
            {s.on_page && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#FF8A3D', border: '1px solid rgba(255,107,53,.45)', borderRadius: 20, padding: '0 6px' }}>NESTA TELA</span>}
            <span title="O que esta ação faz" style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, color: risk.color, background: risk.color + '18', borderRadius: 20, padding: '1px 7px' }}>{risk.label}</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 13.5, marginTop: 2 }}>{s.title}</div>
          <p style={{ margin: '3px 0 0', fontSize: 12, lineHeight: 1.45, color: 'var(--ink-2, var(--ink-1))' }}>{s.why}</p>
          {s.preview?.length > 0 && (
            <>
              <button type="button" onClick={() => setOpen(o => !o)} style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, color: MUT_C, fontSize: 11.5, cursor: 'pointer', fontFamily: F, textDecoration: 'underline' }}>
                {open ? 'Esconder detalhes' : isAsk ? 'Como funciona' : `Ver o que será feito (${s.preview.length})`}
              </button>
              {open && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-2, var(--ink-1))' }}>
                  {s.preview.slice(0, 8).map(p => <li key={p}>{p}</li>)}
                </ul>
              )}
            </>
          )}
          {state && state !== 'running' && (
            <p role="status" style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, color: state.ok ? '#22C55E' : '#EF4444' }}>{state.text}</p>
          )}
          {(!state || state === 'running') && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {isAsk ? (
                <button type="button" onClick={() => onAsk(s)} className="rf-press" style={{ minHeight: 32, padding: '0 12px', borderRadius: 9, border: 'none', background: ORANGE, color: '#1A0B02', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: F }}>
                  Conversar com {agent?.name || s.agent_name || 'o agente'}
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => onApprove(s)} className="rf-press" style={{ minHeight: 32, padding: '0 12px', borderRadius: 9, border: 'none', background: ORANGE, color: '#1A0B02', fontWeight: 800, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', fontFamily: F, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {busy ? 'Fazendo…' : `Aprovar e fazer${s.actions > 1 ? ` (${s.actions})` : ''}`}
                </button>
              )}
              <button type="button" onClick={() => onDismiss(s)} disabled={busy} style={{ minHeight: 32, padding: '0 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-1)', fontSize: 12, cursor: 'pointer', fontFamily: F }}>Agora não</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function SuggestionList({ items, agentFor, states = {}, onApprove, onAsk, onDismiss, compact = false, title = true }) {
  if (!items.length) return null
  return (
    <div>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: '#FF8A3D', marginBottom: 8 }}>
          <Sparkles size={13} /> Ações sugeridas · com sua aprovação
        </div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(s => <SuggestionCard key={s.id} s={s} agent={agentFor(s.agent_kind)} state={states[s.id]} onApprove={onApprove} onAsk={onAsk} onDismiss={onDismiss} compact={compact} />)}
      </div>
    </div>
  )
}

// Atalhos de pergunta da tela atual, na conversa com o agente.
export function PromptChips({ prompts, onPick }) {
  if (!prompts?.length) return null
  return (
    <div className="rf-swipe" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 16px 0' }} aria-label="Perguntas sugeridas para esta tela">
      {prompts.map(p => (
        <button key={p} type="button" onClick={() => onPick(p)} className="rf-press"
          style={{ flex: '0 0 auto', maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '6px 11px', borderRadius: 20, border: '1px solid rgba(255,107,53,.4)', background: 'rgba(255,107,53,.08)', color: 'var(--ink-1)', fontSize: 12, cursor: 'pointer', fontFamily: F }}>
          {p}
        </button>
      ))}
    </div>
  )
}
