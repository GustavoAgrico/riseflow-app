import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@components/Layout/Layout'
import {
  MessageSquare, Bot, GitBranch, Users, Megaphone, Calendar, BarChart3, UserCog,
  Instagram, Facebook, Send, Mail, MessageCircle, ShieldCheck, Zap, Plug, ArrowRight,
} from 'lucide-react'

/* Canais suportados (caixa de entrada unificada). */
const CHANNELS = [
  { name: 'WhatsApp',  Icon: MessageCircle, color: '#25D366', note: 'API Oficial (Cloud)' },
  { name: 'Instagram', Icon: Instagram,     color: '#E1306C', note: 'Direct (DM)' },
  { name: 'Facebook',  Icon: Facebook,      color: '#1877F2', note: 'Messenger' },
  { name: 'Telegram',  Icon: Send,          color: '#2AABEE', note: 'Bot' },
  { name: 'E-mail',    Icon: Mail,          color: '#F59E0B', note: 'SMTP' },
]

/* Funcionalidades principais. */
const FEATURES = [
  { Icon: MessageSquare, title: 'Caixa de entrada unificada', desc: 'Todas as conversas de todos os canais em um só Chat — responda, transfira e acompanhe sem trocar de app.' },
  { Icon: Bot,           title: 'Atendimento com IA 24/7',    desc: 'A IA qualifica, responde e resolve automaticamente, com a personalidade e a base de conhecimento do seu negócio.' },
  { Icon: GitBranch,     title: 'Funis e automações visuais', desc: 'Monte fluxos de atendimento arrastando blocos: gatilhos, mensagens, condições, tags, transferência e webhooks.' },
  { Icon: Users,         title: 'CRM Pipeline',               desc: 'Acompanhe cada lead por etapa (novo → qualificado → proposta → fechado) com valor, tags e histórico.' },
  { Icon: Megaphone,     title: 'Campanhas em massa',         desc: 'Dispare mensagens e e-mails segmentados para listas de contatos, com acompanhamento de entregues e lidos.' },
  { Icon: Calendar,      title: 'Agendamentos',               desc: 'Programe envios pontuais ou recorrentes, respeitando horário comercial.' },
  { Icon: BarChart3,     title: 'Analytics e relatórios',     desc: 'Mensagens enviadas/recebidas, taxa de resposta, tempo médio, conversões e desempenho dos funis.' },
  { Icon: UserCog,       title: 'Equipe e filas',             desc: 'Adicione atendentes, defina papéis e filas, e transfira conversas para a pessoa certa.' },
]

/* Diferenciais. */
const DIFFERENTIATORS = [
  { Icon: Plug,        title: 'Multi-canal de verdade', desc: 'WhatsApp, Instagram, Facebook, Telegram e e-mail no mesmo lugar — o contato é o mesmo em qualquer canal.' },
  { Icon: Zap,         title: 'IA + automação juntas',  desc: 'A IA cede para o funil quando há um fluxo, e assume quando não há — sem resposta dupla.' },
  { Icon: ShieldCheck, title: 'Dados isolados por conta', desc: 'Cada empresa vê e opera apenas os próprios dados (isolamento por dono no runtime e no banco).' },
]

const STEPS = [
  { n: '01', title: 'Conecte seus canais', desc: 'WhatsApp API Oficial, Instagram, Facebook, Telegram e e-mail — em minutos, pela tela de Integrações.' },
  { n: '02', title: 'Automatize com funis e IA', desc: 'Crie fluxos visuais e ative a IA para qualificar e responder no seu tom, 24 horas por dia.' },
  { n: '03', title: 'Atenda e acompanhe', desc: 'Sua equipe responde na caixa unificada; você acompanha tudo no CRM e nos relatórios.' },
]

export const Product = () => {
  const nav = useNavigate()

  return (
    <Layout title="Produto" subtitle="O que o RiseFlow faz">
      <div className="space-y-10 animate-fade-in pb-10">

        {/* HERO */}
        <section className="glass rounded-3xl p-8 md:p-12 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-brand-orange/10 blur-3xl pointer-events-none" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-brand-orange bg-brand-orange/10 border border-brand-orange/20 rounded-full px-3 py-1">
              <Zap size={13} /> Atendimento + automação com IA
            </span>
            <h1 className="mt-4 text-3xl md:text-4xl font-display font-bold text-white leading-tight text-balance">
              Todo o atendimento da sua empresa em um só lugar — automatizado e com IA.
            </h1>
            <p className="mt-4 text-slate-300 text-base md:text-lg max-w-2xl">
              O RiseFlow reúne WhatsApp, Instagram, Facebook, Telegram e e-mail numa caixa de entrada única,
              com atendimento por IA, funis de automação, CRM e campanhas — para vender e atender 24 horas por dia.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => nav('/integrations')} className="btn-primary flex items-center gap-2">
                Conectar um canal <ArrowRight size={16} />
              </button>
              <button onClick={() => nav('/plans')} className="btn-secondary">Ver planos</button>
            </div>
          </div>
        </section>

        {/* CANAIS */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Canais em uma caixa de entrada só</h2>
          <div className="flex flex-wrap gap-3">
            {CHANNELS.map(c => (
              <div key={c.name} className="glass rounded-2xl px-4 py-3 flex items-center gap-3 flex-1 min-w-[150px]">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: c.color + '22' }}>
                  <c.Icon size={20} style={{ color: c.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                  <p className="text-xs text-slate-500 truncate">{c.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FUNCIONALIDADES */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Tudo o que você precisa para atender e vender</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div key={f.title} className="glass rounded-2xl p-5 hover:border-brand-orange/30 transition-all">
                <div className="w-11 h-11 rounded-xl bg-brand-orange/15 flex items-center justify-center mb-3">
                  <f.Icon size={20} className="text-brand-orange" />
                </div>
                <h3 className="font-display font-bold text-white text-[15px]">{f.title}</h3>
                <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section className="glass rounded-3xl p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-6">Como funciona</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative">
                <div className="text-brand-orange/40 font-display font-bold text-3xl mb-2">{s.n}</div>
                <h3 className="font-display font-bold text-white">{s.title}</h3>
                <p className="text-slate-400 text-sm mt-1.5">{s.desc}</p>
                {i < STEPS.length - 1 && <ArrowRight size={18} className="hidden md:block absolute top-3 -right-4 text-slate-700" />}
              </div>
            ))}
          </div>
        </section>

        {/* DIFERENCIAIS */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Por que RiseFlow</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DIFFERENTIATORS.map(d => (
              <div key={d.title} className="glass rounded-2xl p-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <d.Icon size={18} className="text-brand-green" />
                  <h3 className="font-display font-bold text-white text-sm">{d.title}</h3>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="glass-solid rounded-3xl p-8 md:p-10 text-center border border-brand-orange/20">
          <h2 className="text-2xl font-display font-bold text-white">Pronto para automatizar seu atendimento?</h2>
          <p className="text-slate-400 mt-2 max-w-xl mx-auto">Conecte seus canais, ative a IA e coloque sua equipe para atender melhor — em minutos.</p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <button onClick={() => nav('/integrations')} className="btn-primary flex items-center gap-2">Começar agora <ArrowRight size={16} /></button>
            <button onClick={() => nav('/teams')} className="btn-secondary">Configurar a equipe</button>
          </div>
        </section>

      </div>
    </Layout>
  )
}
