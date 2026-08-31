import React, { useEffect, useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from './theme.js';
import { getOptions, getHealth, createJob, transcribe, renderEdited, subscribeJob } from './api.js';
import { PrimaryButton, Card, Spinner } from './components/ui.jsx';
import Uploader from './components/Uploader.jsx';
import OptionsPanel from './components/OptionsPanel.jsx';
import Pipeline from './components/Pipeline.jsx';
import Result from './components/Result.jsx';
import TranscriptEditor from './components/TranscriptEditor.jsx';

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [health, setHealth] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [file, setFile] = useState(null);
  const [options, setOptions] = useState(null);
  const [editMode, setEditMode] = useState('auto');

  const [phase, setPhase] = useState('setup');
  const [uploadPct, setUploadPct] = useState(0);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);

  const [sourceId, setSourceId] = useState(null);
  const [transcriptData, setTranscriptData] = useState(null);
  const [durationSec, setDurationSec] = useState(0);

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

  function fail(msg) {
    setError(msg);
    setPhase('error');
  }

  function watchRender(created) {
    setJob(created);
    setPhase('processing');
    subscribeJob(created.id, (u) => {
      setJob(u);
      if (u.status === 'done') setPhase('done');
      if (u.status === 'error') fail(u.error);
    });
  }

  async function start() {
    if (!file || !options) return;
    setError(null);
    setUploadPct(0);
    setPhase('uploading');
    try {
      if (editMode === 'editor') {
        const t = await transcribe(file, options, setUploadPct);
        setPhase('transcribing');
        setJob(t);
        subscribeJob(t.id, (u) => {
          setJob(u);
          if (u.status === 'done') {
            const tr = u.report?.transcript;
            if (!tr?.segments?.length) return fail('não foi possível obter a transcrição');
            setSourceId(u.report.sourceId || u.id);
            setTranscriptData(tr);
            setDurationSec(u.report?.input?.duration || 0);
            setPhase('editing');
          }
          if (u.status === 'error') fail(u.error);
        });
      } else {
        const created = await createJob(file, options, setUploadPct);
        watchRender(created);
      }
    } catch (e) {
      fail(e.message);
    }
  }

  async function generateFromEdits(editedTranscript) {
    setPhase('processing');
    try {
      const created = await renderEdited(sourceId, editedTranscript, options);
      watchRender(created);
    } catch (e) {
      fail(e.message);
    }
  }

  function reset() {
    setFile(null);
    setJob(null);
    setError(null);
    setUploadPct(0);
    setSourceId(null);
    setTranscriptData(null);
    setDurationSec(0);
    setPhase('setup');
    if (catalog) setOptions(catalog.defaults);
  }

  if (loadError) {
    return (
      <Shell>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🔌</div>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 17 }}>Servidor indisponível</div>
          <div style={{ color: C.muted, fontSize: 14 }}>
            Inicie a API do Riseframe (<code style={codeStyle}>npm run dev</code>). Detalhe: {loadError}
          </div>
        </Card>
      </Shell>
    );
  }
  if (!catalog || !options) {
    return (
      <Shell>
        <div style={{ color: C.muted, textAlign: 'center', padding: 60 }}>
          <Spinner size={22} color={C.orange} />
          <div style={{ marginTop: 14 }}>Carregando…</div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell health={health}>
      {phase === 'setup' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="rf-anim">
            <Uploader file={file} onFile={setFile} />
          </div>

          <div className="rf-anim" style={{ animationDelay: '0.05s' }}>
            <ModeChooser value={editMode} onChange={setEditMode} />
          </div>

          {editMode === 'auto' && (
            <Card delay={0.1} style={{ padding: '6px 24px 20px' }}>
              <h3 style={sectionLabel}>O que fazer com o vídeo</h3>
              <OptionsPanel catalog={catalog} options={options} onChange={setOptions} />
            </Card>
          )}

          <div className="rf-anim" style={{ animationDelay: '0.15s' }}>
            <PrimaryButton onClick={start} disabled={!file} style={{ width: '100%', padding: '17px' }}>
              {editMode === 'editor' ? '📝  Transcrever para editar' : '✨  Editar com IA'}
            </PrimaryButton>
            {!file && (
              <p style={{ textAlign: 'center', color: C.faint, fontSize: 12.5, marginTop: 10 }}>
                Envie um vídeo para começar
              </p>
            )}
          </div>
        </div>
      )}

      {phase === 'uploading' && (
        <Loading title={`Enviando vídeo… ${Math.round(uploadPct * 100)}%`} pct={uploadPct} icon="⬆️" />
      )}

      {phase === 'transcribing' && (
        <Loading
          title="Transcrevendo a fala…"
          subtitle="Assim que ficar pronto, você poderá cortar o vídeo editando o texto."
          pct={(job?.progress ?? 0) / 100}
          icon="📝"
          spin
        />
      )}

      {phase === 'editing' && transcriptData && (
        <div className="rf-anim">
          <TranscriptEditor
            transcript={transcriptData}
            durationSec={durationSec}
            onGenerate={generateFromEdits}
            onBack={reset}
          />
        </div>
      )}

      {phase === 'processing' && job && (
        <div className="rf-anim">
          <Pipeline job={job} />
        </div>
      )}

      {phase === 'done' && job && (
        <div className="rf-anim">
          <Result job={job} onReset={reset} />
        </div>
      )}

      {phase === 'error' && (
        <Card style={{ textAlign: 'center', borderColor: `${C.red}55` }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 17 }}>Algo deu errado</div>
          <div style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>{error}</div>
          <PrimaryButton onClick={reset} style={{ padding: '12px 26px' }}>
            Tentar de novo
          </PrimaryButton>
        </Card>
      )}
    </Shell>
  );
}

const sectionLabel = {
  fontSize: 11,
  color: C.faint,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  fontWeight: 600,
  margin: '18px 0 4px',
};
const codeStyle = {
  background: C.panel2,
  padding: '2px 6px',
  borderRadius: 6,
  fontSize: 12.5,
  fontFamily: 'ui-monospace, monospace',
};

function ModeChooser({ value, onChange }) {
  const opts = [
    { id: 'auto', icon: '✨', title: 'Automático', desc: 'A IA corta, legenda e finaliza sozinha' },
    { id: 'editor', icon: '📝', title: 'Editor de transcrição', desc: 'Corte o vídeo editando o texto' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {opts.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              position: 'relative',
              borderRadius: 16,
              padding: '16px 18px',
              transition: 'all .18s ease',
              background: on
                ? 'linear-gradient(180deg, rgba(255,107,53,0.14), rgba(124,58,237,0.10))'
                : 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015))',
              border: `1px solid ${on ? 'transparent' : C.border}`,
              boxShadow: on ? `0 0 0 1.5px ${C.orange}88, 0 10px 30px -12px rgba(255,107,53,0.4)` : 'none',
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                display: 'grid',
                placeItems: 'center',
                fontSize: 19,
                marginBottom: 10,
                background: on ? GRAD : C.panel2,
                boxShadow: on ? '0 6px 16px -6px rgba(255,107,53,0.6)' : 'none',
              }}
            >
              {o.icon}
            </div>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: on ? C.text : C.muted }}>{o.title}</div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 3, lineHeight: 1.4 }}>{o.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

function Loading({ title, subtitle, pct, icon, spin }) {
  return (
    <Card style={{ textAlign: 'center', padding: 34 }}>
      <div style={{ position: 'relative', width: 68, height: 68, margin: '0 auto 16px' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: GRAD,
            filter: 'blur(14px)',
            opacity: 0.5,
            animation: 'rf-pulse-glow 2s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'relative',
            width: 68,
            height: 68,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            fontSize: 30,
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${C.border}`,
            animation: spin ? 'rf-float 2.4s ease-in-out infinite' : 'none',
          }}
        >
          {icon}
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: subtitle ? 6 : 18 }}>{title}</div>
      {subtitle && <div style={{ color: C.muted, fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>{subtitle}</div>}
      <ProgressBar pct={pct} />
    </Card>
  );
}

export function ProgressBar({ pct }) {
  return (
    <div style={{ height: 9, background: 'rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${Math.max(3, Math.round((pct || 0) * 100))}%`,
          borderRadius: 8,
          background: `linear-gradient(90deg, ${C.orange}, ${C.purple}), linear-gradient(90deg, rgba(255,255,255,0.4), transparent)`,
          backgroundSize: '100% 100%, 200% 100%',
          backgroundBlendMode: 'overlay',
          animation: 'rf-shimmer 1.6s linear infinite',
          transition: 'width .3s ease',
        }}
      />
    </div>
  );
}

function Shell({ children, health }) {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          padding: '15px 24px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(8,8,12,0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <Logo />
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.3, fontFamily: FONT_DISPLAY }}>
            Riseframe
          </div>
          <div style={{ fontSize: 10.5, color: C.faint, letterSpacing: 0.3 }}>Editor de vídeo com IA</div>
        </div>
        {health && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 7, fontSize: 11, color: C.faint, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Badge on={health.ffmpeg} label="FFmpeg" />
            <Badge on={health.capabilities?.transcribeReady} label={`ASR: ${health.capabilities?.transcribeProvider}`} />
            <Badge on={health.capabilities?.brollReady} label="Pexels" />
          </div>
        )}
      </header>

      <main style={{ maxWidth: 760, width: '100%', margin: '0 auto', padding: '40px 20px 80px', flex: 1 }}>
        <div className="rf-anim" style={{ marginBottom: 30 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 500,
              color: C.orangeSoft,
              background: 'rgba(255,107,53,0.1)',
              border: `1px solid rgba(255,107,53,0.25)`,
              marginBottom: 18,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.orange, boxShadow: `0 0 8px ${C.orange}` }} />
            Processamento na nuvem · FFmpeg + IA
          </div>
          <h1
            style={{
              fontSize: 40,
              lineHeight: 1.08,
              margin: '0 0 12px',
              letterSpacing: -1.2,
              fontWeight: 800,
              fontFamily: FONT_DISPLAY,
            }}
          >
            Do bruto ao pronto,{' '}
            <span style={gradientText}>automático.</span>
          </h1>
          <p style={{ color: C.muted, margin: 0, fontSize: 15.5, lineHeight: 1.6, maxWidth: 560 }}>
            Suba um vídeo. O Riseframe corta as pausas, gera legendas dinâmicas, insere B-roll
            e aplica um color grade cinematográfico — ou deixe você mesmo cortar editando a transcrição.
          </p>
        </div>
        {children}
      </main>

      <footer style={{ textAlign: 'center', padding: '20px', color: C.faint, fontSize: 12, borderTop: `1px solid ${C.border}` }}>
        Riseframe · MVP do editor de vídeo com IA
      </footer>
    </div>
  );
}

function Logo() {
  return (
    <div style={{ position: 'relative', width: 36, height: 36 }}>
      <div
        style={{
          position: 'absolute',
          inset: -3,
          borderRadius: 12,
          background: GRAD,
          filter: 'blur(9px)',
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: 10,
          background: GRAD,
          display: 'grid',
          placeItems: 'center',
          fontSize: 17,
          color: '#fff',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      >
        ▶
      </div>
    </div>
  );
}

function Badge({ on, label }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 20,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${C.border}`,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: on ? C.green : C.faint,
          boxShadow: on ? `0 0 7px ${C.green}` : 'none',
        }}
      />
      {label}
    </span>
  );
}
