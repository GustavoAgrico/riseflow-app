// Utilitários de exportação — sem dependências (Blob para CSV, window.print para PDF).

/* Exporta um array de objetos como CSV (UTF-8 com BOM para acentos no Excel). */
export function exportCSV(data, filename) {
  if (!data || data.length === 0) return alert('Nenhum dado para exportar')
  const headers = Object.keys(data[0])
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      const val = row[h] ?? ''
      return typeof val === 'string' && (val.includes(',') || val.includes('"'))
        ? '"' + val.replace(/"/g, '""') + '"'
        : val
    }).join(',')),
  ].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename + '_' + new Date().toISOString().slice(0, 10) + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/* ─── PDF premium (sem libs) ────────────────────────────────────────────── */

const PDF_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family:'DM Sans',Arial,sans-serif; color:#0F172A; margin:0; background:#fff; }
  .page { padding:48px 52px; max-width:900px; margin:0 auto; }
  .header { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #FF6B35; padding-bottom:18px; }
  .brand { display:flex; align-items:center; gap:12px; }
  .logo { width:42px; height:42px; border-radius:11px; background:linear-gradient(135deg,#FF6B35,#E55100); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:21px; }
  .brand-name { font-size:20px; font-weight:800; line-height:1.1; }
  .brand-sub { font-size:12px; color:#64748B; }
  .meta { text-align:right; font-size:11px; color:#64748B; line-height:1.5; }
  h1 { font-size:26px; font-weight:800; margin:26px 0 2px; }
  .subtitle { color:#64748B; font-size:14px; margin:0 0 26px; }
  .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:13px; margin-bottom:30px; }
  .kpi { border:1px solid #E5E7EB; border-radius:14px; padding:15px 17px; border-left:4px solid #FF6B35; }
  .kpi-label { font-size:11px; color:#64748B; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
  .kpi-value { font-size:25px; font-weight:800; color:#0F172A; margin-top:6px; }
  section { margin-bottom:24px; page-break-inside:avoid; }
  h2 { font-size:14px; font-weight:700; margin:0 0 10px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#F8FAFC; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#64748B; text-align:left; padding:9px 12px; border-bottom:2px solid #E5E7EB; }
  td { font-size:13px; padding:9px 12px; border-bottom:1px solid #F1F5F9; }
  tr:nth-child(even) td { background:#FAFAFC; }
  .empty { text-align:center; color:#94A3B8; padding:18px; }
  .footer { margin-top:34px; padding-top:14px; border-top:1px solid #E5E7EB; font-size:11px; color:#94A3B8; display:flex; justify-content:space-between; }
  @page { margin:14mm; }
`

const fullDate = () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

const headerBlock = (sub) => `
  <div class="header">
    <div class="brand"><div class="logo">R</div><div><div class="brand-name">RiseFlow</div><div class="brand-sub">${sub}</div></div></div>
    <div class="meta">Gerado em<br><strong>${fullDate()}</strong></div>
  </div>`

const footerBlock = () => `<div class="footer"><span>RiseFlow · Automação de vendas no WhatsApp</span><span>${fullDate()}</span></div>`

const tableBlock = (t) => `
  <section>
    <h2>${t.title}</h2>
    <table>
      <thead><tr>${t.columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${(t.rows && t.rows.length)
        ? t.rows.map(r => `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')
        : `<tr><td class="empty" colspan="${t.columns.length}">Sem dados neste período</td></tr>`}
      </tbody>
    </table>
  </section>`

const openPrint = (filename, bodyHtml) => {
  const w = window.open('', '_blank')
  if (!w) return alert('Permita pop-ups para exportar o PDF.')
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title><style>${PDF_STYLES}</style></head><body><div class="page">${bodyHtml}</div></body></html>`)
  w.document.close()
  setTimeout(() => { w.print(); w.close() }, 700)
}

/* Relatório premium genérico: { filename, title, subtitle, kpis:[{label,value}], tables:[{title,columns,rows}] } */
export function exportPremiumPDF({ filename, title, subtitle = '', kpis = [], tables = [] }) {
  const kpiCards = kpis.map(k => `<div class="kpi"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div>`).join('')
  const body = headerBlock('Relatório de Performance')
    + `<h1>${title}</h1>`
    + (subtitle ? `<p class="subtitle">${subtitle}</p>` : '')
    + (kpis.length ? `<div class="kpis">${kpiCards}</div>` : '')
    + tables.map(tableBlock).join('')
    + footerBlock()
  openPrint(filename, body)
}

/* PDF premium de uma fatura individual. */
export function downloadInvoicePDF(fatura) {
  const body = headerBlock('Fatura')
    + `<h1>Fatura ${fatura.id ?? ''}</h1>`
    + `<p class="subtitle">Documento gerado automaticamente pelo RiseFlow.</p>`
    + tableBlock({
        title: 'Detalhes da fatura',
        columns: ['Campo', 'Valor'],
        rows: [
          ['Número', fatura.id ?? '—'],
          ['Data', fatura.date ?? '—'],
          ['Descrição', fatura.description ?? 'Assinatura RiseFlow'],
          ['Valor', fatura.amount ?? '—'],
          ['Status', fatura.status ?? '—'],
        ],
      })
    + footerBlock()
  openPrint(`Fatura ${fatura.id ?? ''}`, body)
}
