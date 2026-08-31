import React, { useEffect, useState } from 'react';
import { C } from './theme.js';
import { getOptions, getHealth, createJob, subscribeJob } from './api.js';
import Uploader from './components/Uploader.jsx';
import OptionsPanel from './components/OptionsPanel.jsx';
import Pipeline from './components/Pipeline.jsx';
import Result from './components/Result.jsx';

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [health, setHealth] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [file, setFile] = useState(null);
  const [options, setOptions] = useState(null);
  const [phase, setPhase] = useState('setup'); // setup|uploading|processing|done|error
  const [uploadPct, setUploadPct] = useState(0);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, h] = await Promise.all([getOptions(), getHealth()]);
        setCatalog(c);
        setHealth(h);
        setOptions(c.defaults);
      } catch (e) {
        setLoadError(e.message);
      }
    })();
  }, []);

  async function start() {
    if (!file || !options) return;
    setError(null);
    setPhase('uploading');
    setUploadPct(0);
    try {
      const created = await createJob(file, options, setUploadPct);
      setJob(created);
      setPhase('processing');
      subscribeJob(created.id, (update) => {
        setJob(update);
        if (update.status === 'done') setPhase('done');
        if (update.status === 'error') {
          setError(update.error);
          setPhase('error');
        }
      });
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  }

  function reset() {
    setFile(null);
    setJob(null);
    setError(null);
    setUploadPct(0);
    setPhase('setup');
    if (catalog) setOptions(catalog.defaults);
  }

  if (loadError) {
    return (
      <Shell>
        <div style={{ background: C.panel, borderRadius: 16, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔌</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Servidor indisponível</div>
          <div style={{ color: C.muted, fontSize: 14 }}>
            Inicie a API do Riseframe (<code>npm run dev</code>). Detalhe: {loadError}
          </div>
        </div>
      </Shell>
    );
  }
  if (!catalog || !options) {
    return (
      <Shell>
        <div style={{ color: C.muted, textAlign: 'center', padding: 40 }}>Carregando…</div>
      </Shell>
    );
  }

  return (
    <Shell health={health}>
      {phase === 'setup' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <Uploader file={file} onFile={setFile} />
          <div style={{ background: C.panel, borderRadius: 16, padding: '4px 22px 18px', border: `1px solid ${C.border}` }}>
            <h3 style={{ fontSize: 13, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              O que fazer com o vídeo
            </h3>
            <OptionsPanel catalog={catalog} options={options} onChange={setOptions} />
          </div>
          <button
            onClick={start}
            disabled={!file}
            style={{
              background: file ? `linear-gradient(90deg, ${C.orange}, ${C.purple})` : C.panel2,
              color: file ? '#fff' : C.faint, border: 'none', borderRadius: 12, padding: '16px',
              fontSize: 16, fontWeight: 700, cursor: file ? 'pointer' : 'not-allowed',
            }}
          >
            ✨ Editar com IA
          </button>
        </div>
      )}

      {phase === 'uploading' && (
        <div style={{ background: C.panel, borderRadius: 16, padding: 28, textAlign: 'center', border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⬆️</div>
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Enviando vídeo… {Math.round(uploadPct * 100)}%</div>
          <div style={{ height: 8, background: C.panel2, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${uploadPct * 100}%`, background: C.orange, transition: 'width .2s' }} />
          </div>
        </div>
      )}

      {phase === 'processing' && job && <Pipeline job={job} />}

      {phase === 'done' && job && <Result job={job} onReset={reset} />}

      {phase === 'error' && (
        <div style={{ background: C.panel, borderRadius: 16, padding: 28, textAlign: 'center', border: `1px solid ${C.red}44` }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Algo deu errado</div>
          <div style={{ color: C.muted, fontSize: 14, marginBottom: 18 }}>{error}</div>
          <button onClick={reset} style={{
            background: C.orange, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 22px',
            cursor: 'pointer', fontWeight: 600,
          }}>
            Tentar de novo
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, health }) {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: `linear-gradient(135deg, ${C.orange}, ${C.purple})`,
          display: 'grid', placeItems: 'center', fontSize: 18,
        }}>▶</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.3 }}>Riseframe</div>
          <div style={{ fontSize: 11, color: C.faint }}>Editor de vídeo com IA</div>
        </div>
        {health && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 11, color: C.faint }}>
            <Badge on={health.ffmpeg} label="FFmpeg" />
            <Badge on={health.capabilities?.transcribeReady} label={`ASR: ${health.capabilities?.transcribeProvider}`} />
            <Badge on={health.capabilities?.brollReady} label="Pexels" />
          </div>
        )}
      </header>
      <main style={{ maxWidth: 720, width: '100%', margin: '0 auto', padding: '28px 20px 60px', flex: 1 }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 26, margin: '0 0 6px', letterSpacing: -0.5 }}>
            Do bruto ao pronto, automático.
          </h1>
          <p style={{ color: C.muted, margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Suba um vídeo. O Riseframe corta as pausas, gera legendas dinâmicas, insere B-roll
            e aplica um color grade cinematográfico — e devolve o arquivo pronto para publicar.
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}

function Badge({ on, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20,
      background: C.panel, border: `1px solid ${C.border}`,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? C.green : C.faint }} />
      {label}
    </span>
  );
}
