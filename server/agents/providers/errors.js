// Classificação de falhas de provedor para a troca automática de modelo.
// Troca: 5xx, 429, timeout/conexão, chave inválida ou sem permissão.
// Não troca: pedido inválido (400) — o erro se repetiria no próximo provedor.

class ProviderError extends Error {
  constructor(message, { switchable = false, retryable = false, status = null, provider = null } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.switchable = switchable
    this.retryable = retryable // vale tentar de novo mais tarde (fila com espera)
    this.status = status
    this.provider = provider
  }
}

// Sem nenhuma chave de IA configurada na conta: não adianta tentar de novo.
class NoProviderError extends Error {
  constructor(message = 'Nenhuma chave de IA configurada.') {
    super(message)
    this.name = 'NoProviderError'
  }
}

function classifyStatus(status) {
  if (status === 429 || (status >= 500 && status < 600)) return { switchable: true, retryable: true }
  if (status === 401 || status === 403) return { switchable: true, retryable: false }
  return { switchable: false, retryable: false }
}

module.exports = { ProviderError, NoProviderError, classifyStatus }
