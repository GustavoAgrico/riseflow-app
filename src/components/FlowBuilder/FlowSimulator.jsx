import React, { useState, useRef, useEffect } from 'react'
import { X, Send, RefreshCw, Loader2 } from 'lucide-react'
import { FlowEngine } from '@/services/flowEngine'
import { useAuth } from '@context/AuthContext'

const MOCK_CONV = {
  id: 'sim-conv',
  contact_name: 'Testador',
  contact_phone: '5511999999999',
  contact_channel: 'whatsapp',
  messages_count: 0,
}

export const FlowSimulator = ({ flowData, onClose }) => {
  const { user } = useAuth()
  const [chat, setChat]       = useState([])
  const [input, setInput]     = useState('')
  const [running, setRunning] = useState(false)
  const endRef = useRef(null)
  // Estado persistente entre mensagens: onde o flow pausou (wait) + a conversa
  // mock (messages_count cresce a cada turno p/ "primeira vez" funcionar).
  const simRef = useRef({ pausedNodeId: null, conv: { ...MOCK_CONV } })

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  const reset = () => {
    setChat([])
    simRef.current = { pausedNodeId: null, conv: { ...MOCK_CONV } }
  }

  const sendMsg = async () => {
    const text = input.trim()
    if (!text || running) return
    setInput('')
    setRunning(true)

    const userMsg = { id: Date.now(), from: 'user', text }
    setChat(prev => [...prev, userMsg])

    try {
      const engine = new FlowEngine(user?.id ?? 'sim', { simulation: true })
      engine.flows = [{ name: 'Simulação', flow_data: flowData }]

      const conv = simRef.current.conv
      conv.messages_count = (conv.messages_count ?? 0) + 1
      const mockMsg = { content: text, direction: 'inbound' }
      const resuming = !!simRef.current.pausedNodeId

      if (resuming) {
        // Retoma a partir da saída do nó "Aguardar resposta" onde parou.
        await engine.resumeFromNode(simRef.current.pausedNodeId, flowData, mockMsg, conv)
      } else {
        await engine.processIncomingMessage(mockMsg, conv)
      }

      // Atualiza o estado de pausa para o próximo turno.
      simRef.current.pausedNodeId = engine.paused ? engine.pausedNodeId : null

      // Render each simulation log entry
      const entries = engine.simLog
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        await new Promise(r => setTimeout(r, 400))

        if (entry.type === 'message') {
          setChat(prev => [...prev, { id: Date.now() + i, from: 'bot', text: entry.text }])
          if (entry.buttons?.length) {
            setChat(prev => [...prev, { id: Date.now() + i + 0.5, from: 'buttons', buttons: entry.buttons }])
          }
        } else if (entry.type === 'delay') {
          setChat(prev => [...prev, { id: Date.now() + i, from: 'system', text: `⏱️ Aguardando ${entry.seconds}s...` }])
        } else if (entry.type === 'wait') {
          setChat(prev => [...prev, { id: Date.now() + i, from: 'system', text: '⏸️ Aguardando resposta — envie a próxima mensagem' }])
        } else if (entry.type === 'condition') {
          setChat(prev => [...prev, {
            id: Date.now() + i,
            from: 'system',
            text: `🔀 Condição "${entry.label ?? ''}" → ${entry.result ? '✅ Sim' : '❌ Não'}`,
          }])
        } else if (entry.type === 'action') {
          const labels = { add_tag: '🏷️ Tag adicionada', human: '👨‍💼 Transferido', save_crm: '💾 Salvo no CRM' }
          setChat(prev => [...prev, {
            id: Date.now() + i,
            from: 'system',
            text: labels[entry.actionType] ?? `⚙️ Ação: ${entry.label ?? entry.actionType}`,
          }])
        } else if (entry.type === 'integration') {
          setChat(prev => [...prev, {
            id: Date.now() + i,
            from: 'system',
            text: `🔌 Integração: ${entry.integrationType}`,
          }])
        }
      }

      if (entries.length === 0) {
        setChat(prev => [...prev, {
          id: Date.now() + 99,
          from: 'system',
          text: resuming
            ? '⚠️ A resposta não encaixou em nenhuma ramificação após o "Aguardar resposta".'
            : '⚠️ Nenhum nó respondeu a essa mensagem. Verifique o tipo de trigger e as condições.',
        }])
      }
    } catch (err) {
      console.error('[Simulator]', err)
      setChat(prev => [...prev, { id: Date.now() + 99, from: 'system', text: `❌ Erro: ${err.message}` }])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-sm animate-fade-in flex flex-col" style={{ height: '600px' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-400 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-orange to-brand-blue flex items-center justify-center text-white text-xs font-bold">T</div>
            <div>
              <p className="text-sm font-medium text-white">Testador</p>
              <p className="text-[10px] text-green-400">● Simulação ativa</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={reset} title="Reiniciar" className="p-1.5 hover:bg-dark-600 rounded-lg transition-colors">
              <RefreshCw size={14} className="text-slate-400" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-dark-600 rounded-lg transition-colors">
              <X size={14} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.015) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}>
          {chat.length === 0 && (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <p className="text-slate-400 text-sm mb-1">Simulador de Fluxo</p>
                <p className="text-slate-600 text-xs">Digite uma mensagem para testar o fluxo</p>
              </div>
            </div>
          )}

          {chat.map(msg => {
            if (msg.from === 'user') return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[80%] bg-brand-orange text-white text-sm px-3.5 py-2 rounded-2xl rounded-br-md">
                  {msg.text}
                </div>
              </div>
            )
            if (msg.from === 'bot') return (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-[80%] bg-[#1E2435] text-slate-100 text-sm px-3.5 py-2 rounded-2xl rounded-bl-md border border-dark-400/50 whitespace-pre-wrap">
                  {msg.text}
                </div>
              </div>
            )
            if (msg.from === 'buttons') return (
              <div key={msg.id} className="flex flex-wrap gap-2 px-1">
                {msg.buttons.map((b, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(b); }}
                    className="text-xs text-brand-orange border border-brand-orange/40 bg-brand-orange/10 hover:bg-brand-orange/20 px-3 py-1.5 rounded-xl transition-all"
                  >
                    {b}
                  </button>
                ))}
              </div>
            )
            if (msg.from === 'system') return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-[10px] text-slate-500 bg-dark-700 px-2.5 py-1 rounded-full">{msg.text}</span>
              </div>
            )
            return null
          })}

          {running && (
            <div className="flex justify-start">
              <div className="bg-[#1E2435] px-4 py-2.5 rounded-2xl rounded-bl-md border border-dark-400/50">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-dark-400 flex-shrink-0">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMsg()}
            placeholder="Digite uma mensagem..."
            className="flex-1 bg-dark-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-brand-orange/30"
          />
          <button
            onClick={sendMsg}
            disabled={!input.trim() || running}
            className="p-2.5 bg-brand-orange rounded-xl text-white disabled:opacity-40 transition-all hover:bg-orange-600"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}
