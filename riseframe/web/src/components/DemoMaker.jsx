import React, { useEffect, useRef, useState } from 'react';
import { C, GRAD } from '../theme.js';
import { Spinner } from './ui.jsx';
import { adminSetShowcase, adminShowcase, createJob, subscribeJob } from '../api.js';

// Edição com TODOS os recursos ligados — o que a página inicial vai mostrar.
const ALL_FEATURES = {
  cutSilence: true,
  cutStrength: 'forte',
  autoClean: true,
  captions: true,
  captionTemplate: 'clean',
  colorLook: 'auto',
  videoMotion: 'dynamic',
  motionIntensity: 'medio',
  broll: true,
  brollLayout: 'fullscreen',
  imageSource: 'mix',
  soundEffects: true,
  aspect: '9:16',
  reframeMode: 'auto',
};

/**
 * Admin: escolhe um vídeo bruto (gravado no celular, com fala) e o Riseframe edita
 * com tudo ligado e já coloca como demonstração "antes e depois" da página inicial.
 */
export default function DemoMaker() {
  const [status, setStatus] = useState(null); // resposta de /admin/showcase
  const [step, setStep] = useState(''); // '', uploading, editing, building, done
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    adminShowcase().then(setStatus).catch(() => {});
    return () => clearInterval(pollRef.current);
  }, []);

  function waitShowcase() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await adminShowcase();
        setStatus(s);
        if (!s.building) {
          clearInterval(pollRef.current);
          if (s.meta?.error && !s.meta?.ready) {
            setErr(`a demonstração falhou: ${s.meta.error}`);
            setStep('');
          } else {
            setStep('done');
            setMsg('Pronto! A demonstração já aparece na página inicial (abra o site deslogado para ver).');
          }
        }
      } catch {
        /* tenta de novo */
      }
    }, 4000);
  }

  async function start(file) {
    if (!file) return;
    setErr('');
    setMsg('');
    setPct(0);
    setStep('uploading');
    try {
      const job = await createJob(file, ALL_FEATURES, (p) => setPct(p));
      setStep('editing');
      const stop = subscribeJob(job.id, async (u) => {
        setPct((u.progress ?? 0) / 100);
        setMsg(u.stageLabel || '');
        if (u.status === 'error') {
          stop?.();
          setErr(`a edição falhou: ${u.error}`);
          setStep('');
        }
        if (u.status === 'done') {
          stop?.();
          setStep('building');
          setMsg('Preparando a demonstração (cópia leve do antes e do depois)…');
          try {
            await adminSetShowcase(job.id);
            waitShowcase();
          } catch (e) {
            setErr(e.message);
            setStep('');
          }
        }
      });
    } catch (e) {
      setErr(e.message);
      setStep('');
    }
  }

  const busy = step === 'uploading' || step === 'editing' || step === 'building';
  const label = step === 'uploading' ? `Enviando o vídeo… ${Math.round(pct * 100)}%`
    : step === 'editing' ? `Editando com todos os recursos… ${Math.round(pct * 100)}%`
      : step === 'building' ? 'Montando a demonstração…' : '';
  const ready = status?.meta?.ready;

  return (
    <div>
      <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.55, margin: '6px 0 12px' }}>
        Escolha um vídeo <b>bruto</b> seu (gravado no celular, você falando, de 30 s a 1 min). O Riseframe edita com
        <b> tudo ligado</b> — cortes, limpeza da fala, legenda, cor, zoom, B-roll, efeitos e formato 9:16 — e coloca o
        antes e depois na <b>página inicial</b>, tocando sozinho para quem abrir o site.
      </p>
      {ready && !busy && (
        <div style={{ fontSize: 12.5, color: C.green, marginBottom: 10 }}>
          ✓ Demonstração no ar{status.meta.filename ? `: ${status.meta.filename}` : ''}. Escolher outro vídeo troca a atual.
        </div>
      )}
      <input ref={inputRef} type="file" accept="video/*,.mp4,.mov,.m4v,.webm" style={{ display: 'none' }} onChange={(e) => { start(e.target.files?.[0]); e.target.value = ''; }} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        style={{ minHeight: 46, padding: '0 20px', background: busy ? 'transparent' : GRAD, border: busy ? `1px solid ${C.border}` : 'none', color: busy ? C.muted : '#fff', borderRadius: 11, fontSize: 14.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 9 }}
      >
        {busy && <Spinner size={14} color={C.muted} />}
        {busy ? label : ready ? 'Trocar o vídeo da demonstração' : 'Escolher vídeo e criar a demonstração'}
      </button>
      {busy && msg && <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>{msg}</div>}
      {busy && (
        <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginTop: 10, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round((step === 'building' ? 1 : pct) * 100)}%`, height: '100%', background: GRAD, transition: 'width .4s' }} />
        </div>
      )}
      {step === 'done' && msg && <div style={{ fontSize: 13, color: C.green, marginTop: 10 }}>{msg}</div>}
      {err && <div style={{ fontSize: 13, color: '#FCA5B4', marginTop: 10 }}>{err}</div>}
    </div>
  );
}
