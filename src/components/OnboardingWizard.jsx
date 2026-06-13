import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Zap, Smartphone, Target, Users, PartyPopper, Check, Minus, ChevronLeft } from 'lucide-react'

const C = { bg: '#0F172A', card: '#1E293B', bd: '#334155', tx: '#F8FAFC', mut: '#94A3B8', pur: '#7C3AED' }
const F = 'DM Sans, sans-serif'
const btn = (bg, color = '#fff') => ({ background: bg, color, border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F })
const ghost = { ...btn('transparent', C.mut), border: `1px solid ${C.bd}` }
const field = { width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '11px 14px', color: C.tx, fontSize: 14, fontFamily: F, outline: 'none', marginTop: 10 }
const row = { display: 'flex', gap: 10, marginTop: 20 }
const mini = { display: 'flex', alignItems: 'center', gap: 12, background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '10px 14px', marginBottom: 8, fontSize: 14 }
const miniDot = { width: 24, height: 24, borderRadius: '50%', background: C.pur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }
const cardTpl = { background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer' }

const Header = ({ icon: Icon, title, text, pulse }) => (
  <div style={{ textAlign: 'center', marginBottom: 24 }}>
    <div style={{ marginBottom: 12, display: 'inline-flex', animation: pulse ? 'opulse 1.2s ease-in-out infinite' : 'none' }}><Icon size={48} color={C.pur} /></div>
    <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800 }}>{title}</h2>
    {text && <p style={{ margin: 0, fontSize: 14, color: C.mut }}>{text}</p>}
  </div>
)

export const OnboardingWizard = ({ isOpen, onComplete }) => {
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [niche, setNiche] = useState('')
  const [ideal, setIdeal] = useState('')
  const [emails, setEmails] = useState([])
  const [email, setEmail] = useState('')
  const [done, setDone] = useState({ whatsapp: false, flow: false })
  if (!isOpen) return null

  const next = () => setStep(s => Math.min(5, s + 1))
  const back = () => setStep(s => Math.max(0, s - 1))
  const addEmail = () => { const e = email.trim(); if (e && !emails.includes(e)) { setEmails([...emails, e]); setEmail('') } }

  const finish = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && niche.trim()) await supabase.from('niche_config').upsert({ user_id: user.id, niche: niche.trim(), ideal_customer: ideal.trim() }, { onConflict: 'user_id' })
    } catch (e) { console.warn('[Onboarding] nicho não salvo:', e?.message ?? e) }
    try { await onComplete() } catch (e) { console.warn('[Onboarding] erro ao concluir:', e?.message ?? e) }
    nav('/dashboard')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0F172Aee', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, fontFamily: F, color: C.tx, padding: 20 }}>
      <style>{`@keyframes ofade{from{opacity:0}to{opacity:1}}@keyframes opulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}`}</style>
      <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 18, padding: 28, width: 440, maxWidth: '100%' }}>
        <div style={{ height: 3, background: C.bd, borderRadius: 2, marginBottom: 24, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: (step / 5 * 100) + '%', background: C.pur, transition: 'width .3s' }} />
        </div>

        <div key={step} style={{ animation: 'ofade .3s ease' }}>
          {step === 0 && <div>
            <div style={{ width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px', background: 'linear-gradient(135deg,#7C3AED,#2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={30} color="#fff" /></div>
            <h2 style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 24, fontWeight: 800 }}>Bem-vindo ao RiseFlow!</h2>
            <p style={{ textAlign: 'center', margin: '0 0 24px', fontSize: 14, color: C.mut }}>Vamos configurar tudo em 5 minutos</p>
            <button onClick={next} style={{ ...btn(C.pur), width: '100%' }}>Começar</button>
          </div>}
          {step === 1 && <div>
            <Header icon={Smartphone} title="Conecte seu WhatsApp" text="Vincule seu número para enviar e receber mensagens" />
            {[['1', 'Acesse Integrações'], ['2', 'Escaneie o QR Code'], ['3', 'Pronto!']].map(([n, t]) => <div key={n} style={mini}><span style={miniDot}>{n}</span>{t}</div>)}
            <div style={row}>
              <button onClick={next} style={{ ...ghost, flex: 1 }}>Pular</button>
              <button onClick={() => { setDone(d => ({ ...d, whatsapp: true })); nav('/settings') }} style={{ ...btn(C.pur), flex: 1 }}>Ir para Integrações</button>
            </div>
          </div>}
          {step === 2 && <div>
            <Header icon={Target} title="Defina seu nicho" text="A IA vai qualificar leads automaticamente baseado no seu negócio" />
            <input value={niche} onChange={e => setNiche(e.target.value)} placeholder="Ex: Agência de marketing digital" style={field} />
            <textarea value={ideal} onChange={e => setIdeal(e.target.value)} placeholder="Ex: Empresas B2B com 10-500 funcionários..." rows={3} style={{ ...field, resize: 'vertical' }} />
            <div style={row}>
              <button onClick={next} style={{ ...ghost, flex: 1 }}>Pular</button>
              <button onClick={next} style={{ ...btn(C.pur), flex: 1 }}>Próximo</button>
            </div>
          </div>}
          {step === 3 && <div>
            <Header icon={Zap} title="Crie sua primeira automação" text="Automatize respostas e qualifique leads no piloto automático" />
            {[['Boas-vindas automático', 'responde novos contatos'], ['Qualificação de lead', 'pergunta e classifica'], ['Suporte FAQ', 'responde perguntas frequentes']].map(([t, d]) => (
              <div key={t} onClick={() => { setDone(x => ({ ...x, flow: true })); nav('/flow-builder') }} style={cardTpl}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{t}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: C.mut }}>{d}</p>
              </div>
            ))}
            <div style={row}>
              <button onClick={next} style={{ ...ghost, flex: 1 }}>Pular</button>
              <button onClick={() => { setDone(x => ({ ...x, flow: true })); nav('/flow-builder') }} style={{ ...btn(C.pur), flex: 1 }}>Criar flow</button>
            </div>
          </div>}
          {step === 4 && <div>
            <Header icon={Users} title="Convide sua equipe" text="Adicione atendentes para distribuir conversas" />
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addEmail()} placeholder="email@empresa.com" style={{ ...field, marginTop: 0, flex: 1 }} />
              <button onClick={addEmail} style={btn(C.pur)}>+ Convidar</button>
            </div>
            <div style={{ marginTop: 10 }}>
              {emails.map(e => (
                <div key={e} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
                  {e}<button onClick={() => setEmails(emails.filter(x => x !== e))} style={{ background: 'none', border: 'none', color: C.mut, cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              ))}
            </div>
            <div style={row}>
              <button onClick={next} style={{ ...ghost, flex: 1 }}>Pular</button>
              <button onClick={next} style={{ ...btn(C.pur), flex: 1 }}>Próximo</button>
            </div>
          </div>}
          {step === 5 && <div>
            <Header icon={PartyPopper} title="Tudo pronto!" pulse />
            {[['WhatsApp conectado', done.whatsapp], ['Nicho configurado', !!niche.trim()], ['Primeiro flow', done.flow], ['Equipe convidada', emails.length > 0]].map(([t, ok]) => (
              <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', fontSize: 14 }}>{ok ? <Check size={16} color="#22C55E" /> : <Minus size={16} color={C.mut} />}{t}{!ok && <span style={{ color: C.mut, fontSize: 12 }}>(pulado)</span>}</div>
            ))}
            <p style={{ fontSize: 13, color: C.mut, margin: '14px 0' }}>Seu plano: Gratuito (50 mensagens/mês) · <a href="/plans" style={{ color: C.pur }}>Ver planos</a></p>
            <button onClick={finish} style={{ ...btn(C.pur), width: '100%', padding: 14 }}>Ir para o Dashboard</button>
          </div>}
        </div>

        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, position: 'relative' }}>
          {step > 0 && <button onClick={back} style={{ ...ghost, position: 'absolute', left: 0, padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={14} /> Voltar</button>}
          {[0, 1, 2, 3, 4, 5].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === step ? C.pur : C.bd }} />)}
        </div>
      </div>
    </div>
  )
}
