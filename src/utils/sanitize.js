// Sanitização de mensagens recebidas antes de renderizar como HTML.
// Estratégia (a ordem importa para a segurança):
//   1. Escapa TODO HTML primeiro  → neutraliza qualquer <script>/atributo malicioso.
//   2. Tokeniza por URL           → URLs viram <a> e NÃO recebem formatação
//                                    (evita quebrar links com _ no caminho).
//   3. Formata *negrito*/_itálico_/~tachado~ e quebras de linha no texto comum.

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// Aplica formatação estilo WhatsApp em um trecho de texto JÁ escapado (sem URLs).
const formatText = (s) =>
  s
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<del>$1</del>')
    .replace(/```([^`]+)```/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')

// Captura http(s)://… e www.…  (até espaço ou início de tag escapada).
const URL_RE = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/g

/**
 * Converte o texto recebido em HTML seguro e formatado.
 * @param {string} text
 * @returns {string} HTML pronto para dangerouslySetInnerHTML.
 */
export const sanitizeMessage = (text) => {
  const escaped = escapeHtml(text)

  let out = ''
  let last = 0
  let match
  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(escaped)) !== null) {
    const raw = match[0]
    const start = match.index

    // Não engole pontuação final colada à URL (ex.: "veja http://x.com.").
    const trimmed = raw.replace(/[.,;:!?)]+$/, '')
    const trailing = raw.slice(trimmed.length)

    out += formatText(escaped.slice(last, start))

    const href = (trimmed.startsWith('http') ? trimmed : `https://${trimmed}`).replace(/&amp;/g, '&')
    out += `<a href="${href}" target="_blank" rel="noopener noreferrer">${trimmed}</a>${trailing}`

    last = start + raw.length
  }
  out += formatText(escaped.slice(last))

  return out
}

export default sanitizeMessage
