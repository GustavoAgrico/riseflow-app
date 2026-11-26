import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

// Executa uma ação vinda da URL uma única vez e limpa o parâmetro (replace, sem nova entrada no histórico).
// Ex.: /billing?novo=1 abre o formulário; /crm?abrir=<id> abre o contato.
// `ready` = false adia até os dados da página carregarem.
export function useQueryAction(param, handler, ready = true) {
  const [params, setParams] = useSearchParams()
  const value = params.get(param)
  const fn = useRef(handler)
  fn.current = handler

  useEffect(() => {
    if (!value || !ready) return
    fn.current(value)
    setParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete(param)
      return next
    }, { replace: true })
  }, [value, ready, param, setParams])
}

export default useQueryAction
