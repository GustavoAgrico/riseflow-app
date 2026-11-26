// Cálculos da tela de Cobranças. Funções puras sobre as linhas de `invoices`.
// Regra: faturamento (o que venceu/foi cobrado) e recebimento (o que entrou no caixa)
// são séries diferentes — não confundir com receita ganha no funil (clients.won_at).

export const localDay = (d = new Date()) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

const amount = (r) => Number(r?.amount) || 0
const daysBetween = (fromDay, toDay) =>
  Math.round((new Date(toDay + 'T00:00:00') - new Date(fromDay + 'T00:00:00')) / 86400000)

export const isPaid = (r) => r?.status === 'paid'
export const isOverdue = (r, today = localDay()) => !isPaid(r) && Boolean(r?.due_date) && r.due_date < today
export const daysLate = (r, today = localDay()) => (isOverdue(r, today) ? daysBetween(r.due_date, today) : 0)

export const AGING_BUCKETS = [
  { id: 'current', label: 'A vencer', min: -Infinity, max: 0 },
  { id: '1-30', label: '1–30 dias', min: 1, max: 30 },
  { id: '31-60', label: '31–60 dias', min: 31, max: 60 },
  { id: '61-90', label: '61–90 dias', min: 61, max: 90 },
  { id: '90+', label: '+90 dias', min: 91, max: Infinity },
]

export const bucketOf = (r, today = localDay()) => {
  if (isPaid(r)) return null
  const late = daysLate(r, today)
  return AGING_BUCKETS.find(b => late >= b.min && late <= b.max)?.id ?? null
}

// Idade dos valores em aberto. Sem vencimento conta como "a vencer".
export function aging(rows, today = localDay()) {
  const out = AGING_BUCKETS.map(b => ({ ...b, total: 0, count: 0 }))
  for (const r of rows || []) {
    const id = bucketOf(r, today)
    if (!id) continue
    const b = out.find(x => x.id === id)
    b.total += amount(r); b.count += 1
  }
  return out
}

const monthKey = (iso) => String(iso || '').slice(0, 7)
const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Últimos `months` meses (inclui o atual): faturado por vencimento × recebido por paid_at.
export function cashFlow(rows, months = 6, today = localDay()) {
  const [y, m] = today.split('-').map(Number)
  const series = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    series.push({ key, label: MONTHS_PT[d.getMonth()], billed: 0, received: 0 })
  }
  const byKey = Object.fromEntries(series.map(s => [s.key, s]))
  for (const r of rows || []) {
    const billed = byKey[monthKey(r.due_date)]
    if (billed) billed.billed += amount(r)
    if (isPaid(r)) {
      const received = byKey[monthKey(r.paid_at ? localDay(r.paid_at) : r.due_date)]
      if (received) received.received += amount(r)
    }
  }
  return series
}

// Recebido no mês corrente (por paid_at), para o KPI do topo.
export function collectedThisMonth(rows, today = localDay()) {
  const key = today.slice(0, 7)
  return (rows || []).filter(r => isPaid(r) && monthKey(r.paid_at ? localDay(r.paid_at) : r.due_date) === key)
    .reduce((a, r) => a + amount(r), 0)
}

const csvCell = (v) => {
  const s = String(v ?? '')
  // Evita fórmula ao abrir no Excel/Sheets (=, +, -, @ no início).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

// CSV com ";" (padrão do Excel em pt-BR) e vírgula decimal.
export function invoicesCsv(rows, today = localDay()) {
  const head = ['Cliente', 'Descrição', 'Valor', 'Vencimento', 'Status', 'Dias em atraso', 'Pago em', 'Recorrente']
  const status = (r) => (isPaid(r) ? 'Pago' : isOverdue(r, today) ? 'Atrasado' : 'Pendente')
  const lines = (rows || []).map(r => [
    r.client_name || '', r.description || '', amount(r).toFixed(2).replace('.', ','),
    r.due_date || '', status(r), daysLate(r, today) || '', r.paid_at ? localDay(r.paid_at) : '', r.recurring ? 'sim' : 'não',
  ].map(csvCell).join(';'))
  return '﻿' + [head.join(';'), ...lines].join('\r\n')
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

// Documento de cobrança em HTML (o navegador imprime ou salva como PDF).
// Não é nota fiscal nem boleto: é um demonstrativo para enviar ao cliente.
export function invoiceDocument(r, { company = 'Minha empresa', today = localDay() } = {}) {
  const money = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const date = (d) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('pt-BR') : '—')
  const status = isPaid(r) ? `Pago em ${date(r.paid_at || r.due_date)}` : isOverdue(r, today) ? `Em atraso há ${daysLate(r, today)} dia(s)` : 'Em aberto'
  const ref = String(r.id || '').slice(0, 8).toUpperCase()
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cobrança ${esc(ref)}</title>
<style>
  body{font-family:'DM Sans',system-ui,sans-serif;color:#1a1a2e;margin:0;padding:48px;background:#fff}
  .doc{max-width:720px;margin:0 auto}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #7C3AED;padding-bottom:18px}
  h1{margin:0;font-size:26px} .muted{color:#6b7280;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:28px} th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #e5e7eb;font-size:14px}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280} td.v{text-align:right;font-variant-numeric:tabular-nums}
  .total{display:flex;justify-content:flex-end;gap:24px;margin-top:18px;font-size:18px;font-weight:700}
  .tag{display:inline-block;margin-top:10px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#f3e8ff;color:#7C3AED}
  footer{margin-top:40px;font-size:12px;color:#6b7280}
  @media print{body{padding:0}.noprint{display:none}}
</style></head><body><div class="doc">
<header><div><h1>${esc(company)}</h1><div class="muted">Demonstrativo de cobrança</div></div>
<div style="text-align:right"><div class="muted">Referência</div><strong>${esc(ref)}</strong><div class="muted" style="margin-top:6px">Emitido em ${date(today)}</div></div></header>
<p style="margin-top:24px"><span class="muted">Cliente</span><br><strong style="font-size:16px">${esc(r.client_name || '—')}</strong></p>
<table><thead><tr><th>Descrição</th><th>Vencimento</th><th style="text-align:right">Valor</th></tr></thead>
<tbody><tr><td>${esc(r.description || 'Cobrança')}${r.recurring ? ' (mensal)' : ''}</td><td>${date(r.due_date)}</td><td class="v">${money(r.amount)}</td></tr></tbody></table>
<div class="total"><span>Total</span><span>${money(r.amount)}</span></div>
<span class="tag">${esc(status)}</span>
<footer>Documento gerado pelo RiseFlow. Não substitui nota fiscal ou boleto.</footer>
<p class="noprint" style="margin-top:28px"><button onclick="window.print()" style="padding:10px 18px;border:0;border-radius:8px;background:#7C3AED;color:#fff;font-weight:600;cursor:pointer">Imprimir / salvar PDF</button></p>
</div></body></html>`
}

// Texto de lembrete para colar no WhatsApp/e-mail — o CRM não envia sozinho.
export function reminderText(r, { brl, company } = {}) {
  const fmt = brl || ((n) => `R$ ${amount({ amount: n }).toFixed(2).replace('.', ',')}`)
  const due = r.due_date ? new Date(r.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : null
  const who = r.client_name ? `Olá, ${r.client_name.split(' ')[0]}!` : 'Olá!'
  const what = r.description ? ` referente a "${r.description}"` : ''
  const when = due ? (isOverdue(r) ? `, vencida em ${due}` : `, com vencimento em ${due}`) : ''
  const sign = company ? `\n\n${company}` : ''
  return `${who} Passando para lembrar da cobrança de ${fmt(r.amount)}${what}${when}. Qualquer dúvida, é só responder esta mensagem.${sign}`
}
