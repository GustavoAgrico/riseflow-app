import React, { useEffect, useRef, useState } from 'react';
import { C, GRAD } from '../theme.js';
import Icon from './Icon.jsx';
import { getMyQueue, controlJob } from '../api.js';
import { SHORT } from './Processing.jsx';

// Fila de renderização da conta: os vídeos processando, na fila, pausados e os que
// terminaram há pouco — com Pausar/Retomar e Cancelar. Usada na tela de processamento e
// na aba "Renderizando".

/** Lista da fila desta conta, atualizada a cada `every` ms. */
export function useMyQueue({ hours = 0, every = 3000 } = {}) {
  const [data, setData] = useState({ jobs: [], othersAhead: { processing: false, queued: 0 }, loaded: false });
  const refreshRef = useRef(() => {});
  const lastRef = useRef('');
  useEffect(() => {
    let alive = true;
    let t = 0;
    const tick = async () => {
      try {
        const d = await getMyQueue(hours);
        const key = JSON.stringify(d);
        // só re-renderiza quando algo mudou
        if (alive && key !== lastRef.current) {
          lastRef.current = key;
          setData({ jobs: d.jobs || [], othersAhead: d.othersAhead || { processing: false, queued: 0 }, loaded: true });
        }
      } catch { /* sem a lista agora: tenta de novo */ }
      if (alive) t = setTimeout(tick, every);
    };
    refreshRef.current = () => { clearTimeout(t); tick(); };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, [hours, every]);
  return { ...data, refresh: () => refreshRef.current() };
}

/** Só o número de vídeos ativos (o contador do menu não re-renderiza a tela a cada %). */
export function useRenderingCount(every = 5000) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    let t = 0;
    const tick = async () => {
      try {
        const d = await getMyQueue();
        if (alive) setCount(activeJobs(d.jobs || []).length);
      } catch { /* tenta de novo */ }
      if (alive) t = setTimeout(tick, every);
    };
    tick();
    return () => { alive = false; clearTimeout(t); };
  }, [every]);
  return count;
}

export const activeJobs = (jobs) => jobs.filter((j) => ['queued', 'processing', 'paused'].includes(j.status));

/** Botões Pausar/Retomar e Cancelar de um vídeo da fila. */
export function JobControls({ job, small = false, onDone }) {
  const [busy, setBusy] = useState('');
  if (!job?.id || !['queued', 'processing', 'paused'].includes(job.status)) return null;
  const stopping = /Cancelando|Pausando/.test(job.stageLabel || '');
  async function act(action) {
    if (action === 'cancel' && !window.confirm(job.status === 'processing'
      ? 'Cancelar este vídeo agora? O processamento para e os créditos voltam para a sua conta.'
      : 'Cancelar este vídeo? Os créditos voltam para a sua conta.')) return;
    setBusy(action);
    try { await controlJob(job.id, action); onDone?.(); } catch (e) { window.alert(e.message); } finally { setBusy(''); }
  }
  const btn = (primary) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: small ? 28 : 36, padding: small ? '0 10px' : '0 16px', borderRadius: 999,
    border: `1px solid ${primary ? 'rgba(255,107,53,0.5)' : C.borderStrong}`, background: primary ? 'rgba(255,107,53,0.12)' : 'rgba(255,255,255,0.04)',
    color: C.text, fontSize: small ? 11.5 : 13, fontWeight: 650, fontFamily: 'inherit', cursor: busy || stopping ? 'default' : 'pointer', opacity: busy || stopping ? 0.55 : 1, whiteSpace: 'nowrap',
  });
  return (
    <div style={{ display: 'inline-flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
      {job.status === 'paused'
        ? <button disabled={!!busy} onClick={() => act('resume')} style={btn(true)} title="Volta para a fila (recomeça do início)"><Icon name="play" size={small ? 11 : 13} strokeWidth={2.4} /> Retomar</button>
        : <button disabled={!!busy || stopping} onClick={() => act('pause')} style={btn(false)} title={job.status === 'processing' ? 'Para agora; ao retomar, recomeça do início' : 'Sai da vez na fila até você retomar'}><Icon name="pause" size={small ? 11 : 13} strokeWidth={2.4} /> Pausar</button>}
      <button disabled={!!busy || stopping} onClick={() => act('cancel')} style={btn(false)} title="Para e devolve os créditos"><Icon name="close" size={small ? 11 : 13} strokeWidth={2.4} /> Cancelar</button>
    </div>
  );
}

const MODE_LABEL = { auto: 'Edição automática', transcribe: 'Preparando para a timeline', render: 'Vídeo final', clips: 'Cortes curtos' };
const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`; };

/** Uma linha da fila. */
function QueueRow({ j, cur, onChange, big }) {
  const pct = j.status === 'done' ? 100 : Math.max(0, Math.min(100, j.progress || 0));
  const state = j.status === 'paused' ? 'Pausado' : j.status === 'queued' ? `Na fila${j.queuePosition > 0 ? ` (${j.queuePosition}º)` : ''}`
    : j.status === 'processing' ? `${pct}% · ${/Cancelando|Pausando/.test(j.stageLabel || '') ? j.stageLabel : SHORT[j.stage] || j.stageLabel || 'Processando'}`
      : j.status === 'done' ? `Pronto ✓${j.finishedAt ? ` · ${ago(j.finishedAt)}` : ''}` : j.stage === 'canceled' ? 'Cancelado' : 'Falhou';
  const color = j.status === 'done' ? C.green : j.stage === 'canceled' ? C.faint : j.status === 'error' ? C.red : j.status === 'processing' ? C.orangeSoft : C.muted;
  return (
    <div style={{ display: 'grid', gap: 6, padding: big ? '14px 16px' : '10px 12px', borderRadius: 12, background: cur ? 'rgba(255,107,53,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${cur ? 'rgba(255,107,53,0.35)' : C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
        <Icon name={j.mode === 'clips' ? 'film' : 'clapper'} size={big ? 17 : 15} strokeWidth={2} color={cur || j.status === 'processing' ? C.orangeSoft : C.muted} />
        <div style={{ minWidth: 0, flex: '1 1 200px', textAlign: 'left' }}>
          <div style={{ fontSize: big ? 14 : 13, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.filename || 'Vídeo'}{cur ? ' · este' : ''}</div>
          <div style={{ fontSize: 11.5, color: C.faint }}>{MODE_LABEL[j.mode] || 'Vídeo'}{j.error && j.status === 'error' && j.stage !== 'canceled' ? ` — ${j.error}` : ''}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 650, color, whiteSpace: 'nowrap' }}>{state}</span>
        {!cur && <JobControls job={j} small onDone={onChange} />}
      </div>
      {(j.status === 'processing' || j.status === 'queued') && (
        <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: GRAD, transition: 'width .4s ease' }} />
        </div>
      )}
    </div>
  );
}

/** Linha "vídeo de outra conta na frente" (sem nome — só para explicar a espera). */
function OthersRow({ othersAhead }) {
  if (!othersAhead?.processing && !othersAhead?.queued) return null;
  const parts = [];
  if (othersAhead.processing) parts.push('1 vídeo de outra conta processando agora');
  if (othersAhead.queued) parts.push(`${othersAhead.queued} na fila antes do seu`);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1px dashed ${C.border}`, color: C.muted, fontSize: 12.5, textAlign: 'left' }}>
      <Icon name="users" size={15} strokeWidth={2} /> {parts.join(' · ')} — o servidor faz um vídeo por vez.
    </div>
  );
}

/** Lista da fila dentro da tela de processamento (só aparece com mais de um vídeo). */
export function MyQueue({ currentId, onSelf }) {
  const { jobs, othersAhead, refresh } = useMyQueue();
  useEffect(() => { onSelf?.(jobs.find((j) => j.id === currentId) || null); }, [jobs, currentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const others = jobs.filter((j) => j.id !== currentId);
  if (!others.length && !othersAhead.processing && !othersAhead.queued) return null;
  return (
    <div style={{ marginTop: 26, textAlign: 'left' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: C.faint, marginBottom: 10 }}>Seus vídeos renderizando ({jobs.length})</div>
      <div style={{ display: 'grid', gap: 8 }}>
        <OthersRow othersAhead={othersAhead} />
        {jobs.map((j) => <QueueRow key={j.id} j={j} cur={j.id === currentId} onChange={refresh} />)}
      </div>
    </div>
  );
}

/** Lista completa (aba "Renderizando"). */
export function RenderQueueList({ hours = 12 }) {
  const { jobs, othersAhead, refresh, loaded } = useMyQueue({ hours });
  const active = activeJobs(jobs);
  const finished = jobs.filter((j) => !active.includes(j)).reverse();
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <OthersRow othersAhead={othersAhead} />
      {active.map((j) => <QueueRow key={j.id} j={j} onChange={refresh} big />)}
      {loaded && !active.length && (
        <div style={{ padding: '26px 18px', borderRadius: 14, border: `1px dashed ${C.border}`, color: C.muted, fontSize: 14, textAlign: 'center' }}>
          Nenhum vídeo renderizando agora.
        </div>
      )}
      {finished.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: C.faint, margin: '14px 0 2px' }}>Terminados nas últimas {hours} h</div>
          {finished.map((j) => <QueueRow key={j.id} j={j} onChange={refresh} big />)}
        </>
      )}
    </div>
  );
}
