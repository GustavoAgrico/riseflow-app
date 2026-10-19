import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../theme.js';
import { adminCustomers } from '../api.js';
import { Spinner } from './ui.jsx';

const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBR = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

const STATUS = {
  'vence em breve': { color: '#FBBF24', bg: 'rgba(251,191,36,0.14)' },
  ativo: { color: '#2ED47A', bg: 'rgba(46,212,122,0.14)' },
  vencido: { color: '#F0526B', bg: 'rgba(240,82,107,0.14)' },
  'teste grátis': { color: '#7DB6FF', bg: 'rgba(45,140,255,0.14)' },
  'sem plano': { color: '#9CA3AF', bg: 'rgba(255,255,255,0.06)' },
  ilimitado: { color: '#C4B5FD', bg: 'rgba(124,58,237,0.16)' },
};
const FILTERS = [
  ['todos', 'Todos'], ['ativo', 'Ativos'], ['vence em breve', 'Vencem em 7 dias'], ['vencido', 'Vencidos'], ['teste grátis', 'Teste grátis'], ['sem plano', 'Sem plano'],
];

/** Tabela de clientes do admin: plano, vencimento (dias que faltam), pagamentos e contato. */
export default function AdminCustomers() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('todos');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError('');
    try {
      setRows((await adminCustomers()).customers || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const c = {};
    for (const r of rows || []) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((r) => (filter === 'todos' || r.status === filter || (filter === 'ativo' && r.status === 'vence em breve'))
      && (!t || [r.name, r.email, r.contactEmail, r.phone].some((v) => String(v || '').toLowerCase().includes(t))));
  }, [rows, filter, q]);
  const revenue = useMemo(() => (rows || []).reduce((s, r) => s + (r.paidTotalCents || 0), 0), [rows]);

  function exportCsv() {
    const head = ['Nome', 'E-mail da conta', 'E-mail de contato', 'WhatsApp', 'Situação', 'Plano', 'Vence em', 'Dias restantes', 'Último pagamento', 'Valor', 'Pagamentos', 'Total pago', 'Cadastro'];
    const q2 = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = shown.map((r) => [r.name, r.email, r.contactEmail, r.phone, r.status, r.plan?.name || '', r.plan ? dateBR(r.plan.until) : '', r.daysLeft ?? '', r.lastPaid ? dateBR(r.lastPaid.at) : '', r.lastPaid ? brl(r.lastPaid.priceCents) : '', r.paidCount, brl(r.paidTotalCents || 0), dateBR(r.createdAt)].map(q2).join(';'));
    const blob = new Blob([`﻿${[head.map(q2).join(';'), ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clientes-riseframe-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const th = { textAlign: 'left', padding: '9px 10px', fontSize: 11.5, fontWeight: 700, color: C.faint, letterSpacing: 0.3, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#14141B' };
  const td = { padding: '10px', fontSize: 13, borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' };
  const chip = (on) => ({ minHeight: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? C.orange : C.border}`, background: on ? 'rgba(255,107,53,0.16)' : 'transparent', color: on ? '#FFD2BF' : C.muted, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' });

  return (
    <section style={{ margin: '0 0 24px', padding: 18, borderRadius: 18, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.025)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Clientes e prazos</div>
          <div style={{ fontSize: 12.5, color: C.faint }}>Só você (admin) vê. Quem vence primeiro aparece no topo.{rows ? ` · ${rows.length} contas · ${brl(revenue)} recebidos (Pix confirmados)` : ''}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={busy} style={chip(false)}>{busy ? 'Atualizando…' : 'Atualizar'}</button>
          <button onClick={exportCsv} disabled={!shown.length} style={chip(false)}>Baixar planilha (CSV)</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {FILTERS.map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={chip(filter === id)}>
            {label}{id === 'todos' ? '' : ` · ${(counts[id] || 0) + (id === 'ativo' ? counts['vence em breve'] || 0 : 0)}`}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome, e-mail ou WhatsApp"
          style={{ marginLeft: 'auto', minWidth: 220, height: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.3)', color: C.text, fontSize: 12.5, fontFamily: 'inherit' }} />
      </div>
      {error && <div style={{ color: '#FCA5B4', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {!rows && !error ? (
        <div style={{ padding: 24, textAlign: 'center' }}><Spinner size={18} color={C.orange} /></div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: 520, borderRadius: 12, border: `1px solid ${C.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
            <thead>
              <tr>{['Cliente', 'Contato', 'Situação', 'Plano · vence', 'Último pagamento', 'Total pago', 'Cadastro'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = STATUS[r.status] || STATUS['sem plano'];
                return (
                  <tr key={r.id}>
                    <td style={td}><div style={{ fontWeight: 700 }}>{r.name || '—'}</div><div style={{ color: C.faint, fontSize: 12 }}>{r.email}</div></td>
                    <td style={td}>
                      {r.phone ? <a href={`https://wa.me/55${r.phone.replace(/\D/g, '').replace(/^55/, '')}`} target="_blank" rel="noreferrer" style={{ color: '#7EE2A8' }}>{r.phone}</a> : <span style={{ color: C.faint }}>—</span>}
                      {r.contactEmail && <div style={{ color: C.faint, fontSize: 12 }}>{r.contactEmail}</div>}
                    </td>
                    <td style={td}>
                      <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 999, background: st.bg, color: st.color, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.status}</span>
                      {r.pending && <div style={{ color: '#FBBF24', fontSize: 11.5, marginTop: 4 }}>Pix a confirmar ({brl(r.pending.priceCents)})</div>}
                      {r.status === 'teste grátis' && <div style={{ color: C.faint, fontSize: 11.5, marginTop: 4 }}>{r.freeEditsLeft} edições grátis restantes</div>}
                    </td>
                    <td style={td}>
                      {r.plan ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{r.plan.name}{r.autoRenew ? ' · renova sozinho' : ''}</div>
                          <div style={{ color: r.daysLeft != null && r.daysLeft < 0 ? '#F0526B' : r.daysLeft != null && r.daysLeft <= 7 ? '#FBBF24' : C.muted, fontSize: 12 }}>
                            {dateBR(r.plan.until)} · {r.daysLeft == null ? '' : r.daysLeft < 0 ? `venceu há ${-r.daysLeft} dia(s)` : r.daysLeft === 0 ? 'vence hoje' : `faltam ${r.daysLeft} dia(s)`}
                          </div>
                        </>
                      ) : <span style={{ color: C.faint }}>—</span>}
                    </td>
                    <td style={td}>{r.lastPaid ? <><div>{brl(r.lastPaid.priceCents)}</div><div style={{ color: C.faint, fontSize: 12 }}>{dateBR(r.lastPaid.at)}</div></> : <span style={{ color: C.faint }}>—</span>}</td>
                    <td style={td}>{r.paidCount ? <><div>{brl(r.paidTotalCents)}</div><div style={{ color: C.faint, fontSize: 12 }}>{r.paidCount} pagamento(s)</div></> : <span style={{ color: C.faint }}>—</span>}</td>
                    <td style={{ ...td, color: C.muted, whiteSpace: 'nowrap' }}>{dateBR(r.createdAt)}</td>
                  </tr>
                );
              })}
              {!shown.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>Nenhum cliente neste filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
