// @menções nas notas internas do chat.
// Uma "pessoa" é { id, name }: membros da equipe (team_members.id) e o dono
// da conta (id 'owner').

export const OWNER_ID = 'owner'

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Termo que está sendo digitado depois do último "@" (ou null se não há menção em andamento). */
export function mentionQuery(text) {
  const m = /(?:^|\s)@([^\s@]*)$/.exec(String(text ?? ''))
  return m ? m[1] : null
}

/** Pessoas cujo nome casa com o termo digitado (sem acento, sem caixa). */
export function filterPeople(people, query) {
  const q = norm(query)
  return (people || []).filter(p => p?.name && norm(p.name).includes(q)).slice(0, 8)
}

/** Troca o "@termo" final pelo nome completo, pronto para continuar digitando. */
export function insertMention(text, person) {
  return String(text ?? '').replace(/@([^\s@]*)$/, `@${person.name} `)
}

/**
 * Pessoas mencionadas no texto. Casa o nome completo depois de "@", ignorando
 * acento e caixa; prefere o nome mais longo ("@Ana Paula" não vira só "@Ana").
 */
export function extractMentions(text, people) {
  const t = norm(text)
  const sorted = [...(people || [])].filter(p => p?.name).sort((a, b) => b.name.length - a.name.length)
  const found = []
  let rest = t
  for (const p of sorted) {
    const tag = '@' + norm(p.name)
    let idx = rest.indexOf(tag)
    let hit = false
    while (idx !== -1) {
      const after = rest[idx + tag.length]
      if (after === undefined || !/[a-z0-9]/.test(after)) { hit = true; break }
      idx = rest.indexOf(tag, idx + 1)
    }
    if (hit) {
      found.push({ id: p.id, name: p.name })
      rest = rest.split(tag).join(' ') // evita que "@Ana" case dentro de "@Ana Paula"
    }
  }
  return found
}

/** Divide o texto em pedaços { text, mention } para destacar as menções na tela. */
export function splitMentions(text, mentions) {
  const src = String(text ?? '')
  const names = (mentions || []).map(m => m?.name).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!names.length) return [{ text: src, mention: false }]
  const esc = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(@(?:${esc.join('|')}))`, 'i')
  // Com grupo de captura, o split alterna: [texto, menção, texto, menção, ...].
  return src.split(re).map((part, i) => ({ text: part, mention: i % 2 === 1 })).filter(p => p.text)
}
