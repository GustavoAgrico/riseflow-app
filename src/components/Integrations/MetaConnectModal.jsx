import React, { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useAuth } from '@context/AuthContext'
import { runMetaOauth, connectMeta, metaErrorMessage } from '@services/metaService'
import { ModalBase, Steps } from './ModalBase'

/* Modal compartilhado dos canais Meta (Messenger/Instagram DM).
   Dois caminhos para o Page Access Token:
   1) OAuth (recomendado): popup de login da Meta → lista de páginas → escolher;
   2) Manual: colar um Page Access Token gerado no painel de developers.
   Nos dois casos o proxy valida o token na Graph antes de confirmar. */
export const MetaConnectModal = ({ channel, title, icon, iconBg, onClose, onSuccess }) => {
  const { user } = useAuth()
  const [pageToken, setPageToken] = useState('')
  const [pages, setPages] = useState(null)   // páginas retornadas pelo OAuth
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const finishConnect = async (token, page = {}) => {
    setBusy(true)
    setError('')
    try {
      const { page: connected } = await connectMeta(user.id, channel, token, page)
      onSuccess({ page_id: connected?.id, page_name: connected?.name })
    } catch (err) {
      setError('Falha ao conectar: ' + metaErrorMessage(err))
      setBusy(false)
    }
  }

  const handleOauth = async () => {
    setBusy(true)
    setError('')
    try {
      const { pages: list } = await runMetaOauth(user.id)
      if (list.length === 1) return finishConnect(list[0].access_token, list[0])
      setPages(list) // mais de uma página → usuário escolhe
      setBusy(false)
    } catch (err) {
      setError(metaErrorMessage(err))
      setBusy(false)
    }
  }

  const handleManual = () => {
    if (!pageToken.trim()) { setError('Cole o Page Access Token'); return }
    finishConnect(pageToken.trim())
  }

  return (
    <ModalBase onClose={onClose} title={title} icon={icon} iconBg={iconBg}>
      {pages ? (
        <>
          <p className="text-xs text-slate-400 mb-3">Escolha a página para conectar:</p>
          <div className="space-y-2 mb-3">
            {pages.map((p) => (
              <button
                key={p.id}
                onClick={() => finishConnect(p.access_token, p)}
                disabled={busy}
                className="w-full py-2.5 px-3 rounded-xl glass text-sm text-slate-200 hover:text-white hover:border-white/20 text-left transition-all disabled:opacity-50"
              >
                {p.name} <span className="text-slate-500 text-xs font-mono">({p.id})</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <Steps items={[
            'Crie um app em developers.facebook.com (ver META_SETUP.md no projeto)',
            'Adicione o produto Messenger (e Instagram, se for o caso) ao app',
            'Conecte com o login da Meta abaixo — ou cole um Page Access Token',
            channel === 'instagram'
              ? 'A conta do Instagram deve ser profissional e vinculada à página do Facebook'
              : 'Escolha a página do Facebook que vai receber as mensagens',
          ]} />

          <button
            onClick={handleOauth}
            disabled={busy}
            className="btn-primary w-full flex items-center justify-center gap-2 mb-4 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={13} />}
            {busy ? 'Aguardando login...' : 'Entrar com a Meta'}
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">ou token manual</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="mb-3">
            <label className="block text-xs text-slate-400 mb-1.5">Page Access Token</label>
            <input
              value={pageToken}
              onChange={(e) => setPageToken(e.target.value)}
              placeholder="EAAxxxxxx..."
              className="input-field font-mono text-xs w-full"
            />
            <p className="text-[10px] text-slate-600 mt-1">
              Meta Developers → seu app → Messenger → Tokens de acesso
            </p>
          </div>

          <button
            onClick={handleManual}
            disabled={busy}
            className="w-full py-2 rounded-xl glass text-sm text-slate-300 hover:text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Conectar com token
          </button>
        </>
      )}

      {error && <p className="text-xs text-red-400 mt-3 px-1">{error}</p>}
    </ModalBase>
  )
}
