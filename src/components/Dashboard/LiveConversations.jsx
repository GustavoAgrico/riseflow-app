// Conversas ao vivo — cards em tempo real no Dashboard (pessoa ↔ atendente).
// Escopo por ownerUserId (dono OU membro da conta, via RLS). Atualiza por:
//   • realtime do Supabase (postgres_changes em conversations)
//   • socket 'new_message' (mensagem chegando)
//   • refetch periódico de segurança
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, UserRound, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { socket } from '@services/socket'
import { useAuth } from '@context/AuthContext'

const ini = (n = '') => n.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?'
const rel = (d) => {
  if (!d) return ''
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000))
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  if (m < 1440) return `${Math.round(m / 60)}h`
  return `${Math.round(m / 1440)}d`
}
const isOpen = (s) => !['closed', 'resolved', 'done', 'finished', 'encerrada'].includes(String(s || '').toLowerCase())

const now = Date.now()
const DEMO = [
  { id: 'c1', contact_name: 'Ana Lima', assigned_to: 'Você', last_message: 'Perfeito, pode enviar a proposta!', unread_count: 2, last_message_at: new Date(now - 2 * 60000).toISOString(), status: 'active' },
  { id: 'c2', contact_name: 'Bruno Martins', assigned_to: 'Carlos Eduardo', last_message: 'Qual o prazo de entrega?', unread_count: 0, last_message_at: new Date(now - 18 * 60000).toISOString(), status: 'active' },
  { id: 'c3', contact_name: 'Loja BestPay', assigned_to: null, last_message: 'Olá, gostaria de saber mais…', unread_count: 3, last_message_at: new Date(now - 5 * 60000).toISOString(), status: 'active' },
  { id: 'c4', contact_name: 'Diego Costa', assigned_to: 'Mariana Oliveira', last_message: '🎵 Mensagem de voz', unread_count: 1, last_message_at: new Date(now - 42 * 60000).toISOString(), status: 'active' },
]

export function LiveConversations() {
  const { ownerUserId, isDemoMode, loading: authLoading } = useAuth()
  const [rows, setRows] = useState([])
  const [pulse, setPulse] = useState(false)

  const load = useCallback(async () => {
    if (isDemoMode) { setRows(DEMO); return }
    if (!ownerUserId) return
    const { data } = await supabase
      .from('conversations')
      .select('id,contact_name,contact_phone,assigned_to,last_message,last_message_at,unread_count,status')
      .eq('user_id', ownerUserId)
      .order('last_message_at', { ascending: false })
      .limit(12)
    setRows((data || []).filter(c => isOpen(c.status)))
    setPulse(true); setTimeout(() => setPulse(false), 800)
  }, [ownerUserId, isDemoMode])

  useEffect(() => {
    if (authLoading) return
    load()
    if (isDemoMode || !ownerUserId) return
    let deb
    const bump = () => { clearTimeout(deb); deb = setTimeout(load, 500) }
    const ch = supabase
      .channel('dash_convs_' + ownerUserId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${ownerUserId}` }, bump)
      .subscribe()
    socket.on('new_message', bump)
    const iv = setInterval(load, 20000)
    return () => { clearTimeout(deb); clearInterval(iv); socket.off('new_message', bump); try { supabase.removeChannel(ch) } catch {} }
  }, [authLoading, ownerUserId, isDemoMode, load])

  const totalUnread = useMemo(() => rows.reduce((a, c) => a + (Number(c.unread_count) || 0), 0), [rows])

  const card = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
    padding: 14, textDecoration: 'none', color: 'var(--ink-1)', display: 'block',
    transition: 'border-color .2s, transform .2s',
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Cabeçalho da seção */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ width: 4, height: 18, borderRadius: 2, background: 'var(--accent)' }} />
        <h3 className="font-display" style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--ink-1)' }}>Conversas ao vivo</h3>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', boxShadow: pulse ? '0 0 0 5px #22C55E33' : '0 0 0 0 #22C55E00', transition: 'box-shadow .5s' }} />
          {isDemoMode ? 'demo' : 'tempo real'}
        </span>
        {totalUnread > 0 && (
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-soft, rgba(255,107,53,0.12))', borderRadius: 999, padding: '2px 9px' }}>
            {totalUnread} não lida{totalUnread !== 1 ? 's' : ''}
          </span>
        )}
        <Link to="/chat" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Abrir Chat <ArrowRight size={13} />
        </Link>
      </div>

      {rows.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, padding: 28 }}>
          <MessageSquare size={20} style={{ opacity: .5, marginBottom: 6 }} /><br />
          Nenhuma conversa ainda. Quando alguém enviar mensagem, ela aparece aqui em tempo real.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {rows.map(c => {
            const agent = c.assigned_to || null
            const unread = Number(c.unread_count) || 0
            return (
              <Link
                key={c.id}
                to="/chat"
                style={{ ...card, borderColor: unread > 0 ? 'rgba(255,107,53,0.4)' : 'var(--border)' }}
              >
                {/* topo: pessoa + tempo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', color: '#fff', fontWeight: 700, fontSize: 13, display: 'grid', placeItems: 'center' }}>
                    {ini(c.contact_name || c.contact_phone)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.contact_name || c.contact_phone || 'Sem nome'}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-3)' }}>{rel(c.last_message_at)}</p>
                  </div>
                  {unread > 0 && (
                    <span style={{ flexShrink: 0, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center' }}>
                      {unread}
                    </span>
                  )}
                </div>

                {/* última mensagem */}
                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.last_message || '—'}
                </p>

                {/* rodapé: quem está atendendo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>
                  <UserRound size={13} style={{ color: agent ? '#22C55E' : 'var(--ink-4)' }} />
                  {agent
                    ? <span>Atendido por <b style={{ color: 'var(--ink-1)' }}>{agent}</b></span>
                    : <span style={{ color: '#3B82F6', fontWeight: 600 }}>Não atribuído</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default LiveConversations
