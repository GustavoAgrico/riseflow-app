import React, { useEffect, useMemo, useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from './theme.js';
import { getOptions, getHealth, getSettings, createJob, transcribe, generateClips, renderEdited, subscribeJob, sampleFile, getJob, editClip } from './api.js';
import { PrimaryButton, Card, Spinner } from './components/ui.jsx';
import Icon, { Logo } from './components/Icon.jsx';
import OptionsPanel, { Row, Toggle, Select, Swatches } from './components/OptionsPanel.jsx';
import Result from './components/Result.jsx';
import ClipsResult from './components/ClipsResult.jsx';
import TimelineEditor from './components/TimelineEditor.jsx';
import CreateWizard from './components/CreateWizard.jsx';
import Processing from './components/Processing.jsx';
import { presetPatch } from './components/CaptionGallery.jsx';
import { brandOptions, brandWatermark } from './brandKit.js';
import { formatById } from './formats.js';
import CaptionGallery from './components/CaptionGallery.jsx';
import { recordJob, listJobs } from './history.js';
import CostLine from './components/CostLine.jsx';
import { useAuth } from './AuthContext.jsx';

export default function App({ embedded = false, onHome, onSettings, intent = null, template = null, reopen = null } = {}) {
  const { refreshBilling } = useAuth();
  const [catalog, setCatalog] = useState(null);
  const [health, setHealth] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [file, setFile] = useState(null);
  // Endereço local do vídeo escolhido: a prévia da legenda roda nele antes de editar.
  const videoUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  const [options, setOptions] = useState(null);
  const [editMode, setEditMode] = useState(intent === 'editor' ? 'editor' : template?.format === 'cortes' ? 'clips' : 'auto');
  // Formato escolhido no passo 1 do Criar vídeo (Reels, TikTok, YouTube…).
  const [formatId, setFormatId] = useState(template?.format || null);

  const [phase, setPhase] = useState('setup');
  const [uploadPct, setUploadPct] = useState(0);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);

  const [sourceId, setSourceId] = useState(null);
  const [transcriptData, setTranscriptData] = useState(null);
  const [durationSec, setDurationSec] = useState(0);
  const [loadingSample, setLoadingSample] = useState(false);
  const [reopening, setReopening] = useState('');
  const [reopenError, setReopenError] = useState('');
  // Cortes de onde veio o clipe aberto na timeline: o "voltar" do editor volta para eles.
  const [clipsJob, setClipsJob] = useState(null);
  const reeditable = useMemo(() => listJobs().filter((j) => j.sourceId).slice(0, 5), []);

  async function useExample() {
    setLoadingSample(true);
    try {
      setFile(await sampleFile());
    } catch (e) {
      alert('Não foi possível carregar o exemplo: ' + e.message);
    } finally {
      setLoadingSample(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // O servidor pode levar alguns segundos para subir (checagens de inicialização).
      // Tenta algumas vezes antes de desistir, para não mostrar "falha ao carregar
      // opções" só porque a porta ainda não abriu.
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let lastErr;
      for (let attempt = 0; attempt < 15 && !cancelled; attempt++) {
        try {
          const [c, h] = await Promise.all([getOptions(), getHealth()]);
          if (cancelled) return;
          setCatalog(c);
          setHealth(h);
          // Chave do Pexels vem das Configurações do usuário (servidor).
          let savedKey = '';
          try {
            const s = await getSettings();
            savedKey = s?.settings?.pexelsKey || '';
          } catch {
            savedKey = '';
          }
          if (cancelled) return;
          // Padrões do app + Brand Kit (estilo da legenda da marca) + template escolhido.
          const tpl = template ? { ...template.options, ...presetPatch(template.preset) } : null;
          // Formato já escolhido (atalho do Início ou do template): Reels → 9:16 etc.
          const fmt = formatById(template?.format);
          const fmtOpts = fmt ? (fmt.clips ? { clipAspect: fmt.aspect } : { aspect: fmt.aspect }) : null;
          setOptions({ ...c.defaults, ...brandOptions(), ...tpl, ...fmtOpts, pexelsKey: savedKey, ...(intent === 'broll' ? { broll: true } : null) });
          setLoadError(null);
          return;
        } catch (e) {
          lastErr = e;
          await sleep(1500);
        }
      }
      if (!cancelled) setLoadError(lastErr?.message || 'não foi possível conectar ao servidor');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Aberto a partir de "Continuar editando" (Início / Meus projetos): vai direto para a timeline.
  const reopened = React.useRef(false);
  useEffect(() => {
    if (!(reopen?.sourceId || reopen?.mode === 'clips') || !catalog || !options || reopened.current) return;
    reopened.current = true;
    if (reopen.mode === 'clips') reopenClips(reopen);
    else reopenFromHistory(reopen);
  }, [reopen, catalog, options]);

    function fail(msg) {
    setError(msg);
    setPhase('error');
    refreshBilling();
  }

  function watchRender(created) {
    refreshBilling();
    setJob(created);
    setPhase('processing');
    subscribeJob(created.id, (u) => {
      setJob(u);
      if (u.status === 'done') {
        setPhase('done');
        // Guarda no histórico local (alimenta a Produtividade e a Biblioteca).
        const rep = u.report || {};
        recordJob({
          id: u.id,
          title: u.filename || 'vídeo',
          mode: u.mode,
          at: Date.now(),
          durationSec: rep.input?.duration || 0,
          savedSec: rep.cut?.removedSeconds || 0,
          captions: rep.captions?.segments || 0,
          aspect: rep.output?.aspect || null,
          sizeBytes: rep.output?.sizeBytes || 0,
          clips: rep.clips?.length || 0,
          downloadUrl: u.downloadUrl || null,
          sourceId: rep.sourceId || null,
        });
      }
      if (u.status === 'error') fail(u.error);
    });
  }

  // Logo do Brand Kit (marca d'água): sobe a imagem e junta às opções do vídeo.
  async function withBrand(opts) {
    try {
      const watermark = await brandWatermark();
      return watermark ? { ...opts, watermark } : opts;
    } catch {
      return opts; // sem o logo, o vídeo sai do mesmo jeito
    }
  }

  async function start() {
    if (!file || !options) return;
    setError(null);
    setUploadPct(0);
    setPhase('uploading');
    try {
      const opts = editMode === 'editor' ? options : await withBrand(options);
      if (editMode === 'clips') {
        const created = await generateClips(file, opts, setUploadPct);
        watchRender(created);
      } else if (editMode === 'editor') {
        const t = await transcribe(file, options, setUploadPct);
        refreshBilling();
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
        const created = await createJob(file, opts, setUploadPct);
        watchRender(created);
      }
    } catch (e) {
      fail(e.message);
    }
  }

  // Abre a timeline a partir de um resultado já processado (qualquer modo), usando
  // a transcrição da timeline original que o pipeline devolveu no relatório.
  function openTimeline(doneJob) {
    const tr = doneJob?.report?.editorTranscript;
    const sid = doneJob?.report?.sourceId;
    if (!tr?.segments?.length || !sid) return;
    setSourceId(sid);
    setTranscriptData(tr);
    setDurationSec(doneJob?.report?.input?.duration || 0);
    setPhase('editing');
  }

  // Reabre na timeline um vídeo já processado: o servidor guarda a transcrição e o
  // upload original, então basta buscar o job pelo id salvo no histórico.
  async function reopenFromHistory(entry) {
    setReopening(entry.sourceId);
    setReopenError('');
    try {
      const j = await getJob(entry.sourceId);
      if (!j?.report?.editorTranscript?.segments?.length) {
        throw new Error('este vídeo não tem transcrição guardada');
      }
      openTimeline(j);
    } catch (e) {
      setReopenError(`Não deu para reabrir “${entry.title}”: ${e.message}.`);
    } finally {
      setReopening('');
    }
  }

  // Abre de novo a lista de cortes (Meus projetos → Ver e editar cortes).
  async function reopenClips(entry) {
    setReopening(entry.id);
    setReopenError('');
    try {
      const j = await getJob(entry.id);
      if (j?.status !== 'done' || !j.report?.clips?.length) throw new Error('os cortes não estão mais disponíveis');
      setJob(j);
      setPhase('done');
    } catch (e) {
      setReopenError(`Não deu para abrir os cortes de “${entry.title}”: ${e.message === 'o vídeo de origem não está mais disponível' ? 'os arquivos expiraram' : e.message}.`);
    } finally {
      setReopening('');
    }
  }

  // "Editar" de um clipe: o servidor recorta o trecho do vídeo original (sem legenda
  // queimada) e o clipe abre na timeline com o formato e o estilo de legenda dele.
  async function editClipInTimeline(cj, index) {
    const clip = cj.report?.clips?.find((c) => c.index === index);
    const j = await editClip(cj.id, index);
    setClipsJob(cj);
    setOptions((o) => ({
      ...o,
      aspect: clip?.aspect || cj.options?.clipAspect || o.aspect,
      captionTemplate: cj.options?.captionTemplate || 'pop',
    }));
    openTimeline(j);
  }

  function backFromEditor() {
    if (clipsJob) {
      setJob(clipsJob);
      setClipsJob(null);
      setPhase('done');
    } else reset();
  }

  async function generateFromEdits(editedTranscript, extra = {}) {
    setPhase('processing');
    try {
      // extra traz os cortes de silêncio escolhidos na timeline (manualSilence + silenceCuts).
      const created = await renderEdited(sourceId, editedTranscript, await withBrand({ ...options, ...extra }));
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
    setClipsJob(null);
    setPhase('setup');
    setFormatId(null);
    if (catalog) setOptions({ ...catalog.defaults, ...brandOptions() });
  }

  if (loadError) {
    return (
      <Shell embedded={embedded}>
        <Card style={{ textAlign: 'center' }}>
          <IconBadge name="plug" tone={C.red} />
          <div style={{ fontWeight: 700, margin: '12px 0 6px', fontSize: 17 }}>Servidor indisponível</div>
          <div style={{ color: C.muted, fontSize: 14 }}>
            Inicie a API do Riseframe (<code style={codeStyle}>npm run dev</code>). Detalhe: {loadError}
          </div>
        </Card>
      </Shell>
    );
  }
  if (!catalog || !options) {
    return (
      <Shell embedded={embedded}>
        <div style={{ color: C.muted, textAlign: 'center', padding: 60 }}>
          <Spinner size={22} color={C.orange} />
          <div style={{ marginTop: 14 }}>Carregando…</div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell health={health} embedded={embedded} compact={phase !== 'setup'} wide={phase === 'editing'}>
      {phase === 'setup' && reopen && reopening && (
        <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
          <Spinner size={22} color={C.orange} />
          <div style={{ marginTop: 14 }}>Abrindo “{reopen.title}”{reopen.mode === 'clips' ? '…' : ' na timeline…'}</div>
        </div>
      )}

      {phase === 'setup' && reopen && reopenError && !reopening && (
        <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.red}55`, background: 'rgba(240,82,107,0.08)', color: C.text, fontSize: 13.5 }}>
          {reopenError} Envie o vídeo de novo abaixo.
        </div>
      )}

      {phase === 'setup' && !(reopen && reopening) && (
        <CreateWizard
          catalog={catalog}
          options={options}
          onOptions={setOptions}
          mode={editMode}
          onMode={setEditMode}
          file={file}
          onFile={setFile}
          videoUrl={videoUrl}
          formatId={formatId}
          onFormat={setFormatId}
          onStart={start}
          onExample={useExample}
          loadingExample={loadingSample}
          recent={reeditable}
          onReopen={reopenFromHistory}
          reopening={reopening}
          reopenError={reopenError}
          renderAdvanced={() => (editMode === 'clips'
            ? <ClipsOptions catalog={catalog} options={options} onChange={setOptions} />
            : <OptionsPanel catalog={catalog} options={options} onChange={setOptions} videoUrl={videoUrl} />)}
        />
      )}

      {phase === 'uploading' && (
        <Processing title="Enviando seu vídeo" subtitle="Pode levar um pouco em arquivos grandes. Não feche esta tela." pct={uploadPct} />
      )}

      {phase === 'transcribing' && (
        <Processing job={job} title="Preparando o editor" subtitle="Transcrevendo a fala — depois você corta o vídeo editando o texto." />
      )}

      {phase === 'editing' && transcriptData && (
        <div className="rf-anim">
          <TimelineEditor
            transcript={transcriptData}
            durationSec={durationSec}
            sourceId={sourceId}
            catalog={catalog}
            options={options}
            onGenerate={generateFromEdits}
            onBack={backFromEditor}
            onSettings={onSettings}
          />
        </div>
      )}

      {phase === 'processing' && job && (
        <div className="rf-anim">
          <Processing job={job} title={job.mode === 'clips' ? 'A IA está criando seus cortes' : 'A IA está editando seu vídeo'} />
        </div>
      )}

      {phase === 'done' && job && (
        <div className="rf-anim">
          {job.mode === 'clips' ? <ClipsResult job={job} onReset={reset} onEdit={(i) => editClipInTimeline(job, i)} /> : <Result job={job} onReset={reset} onEditTimeline={job.report?.editorTranscript ? () => openTimeline(job) : null} />}
        </div>
      )}

      {phase === 'error' && (
        <Card style={{ textAlign: 'center', borderColor: `${C.red}55` }}>
          <IconBadge name="alert" tone={C.red} />
          <div style={{ fontWeight: 700, margin: '12px 0 6px', fontSize: 17 }}>Algo deu errado</div>
          <div style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>{error}</div>
          <PrimaryButton onClick={reset} style={{ padding: '12px 26px' }}>
            Tentar de novo
          </PrimaryButton>
        </Card>
      )}
    </Shell>
  );
}

const codeStyle = {
  background: C.panel2,
  padding: '2px 6px',
  borderRadius: 6,
  fontSize: 12.5,
  fontFamily: 'ui-monospace, monospace',
};

function ClipsOptions({ catalog, options, onChange }) {
  const set = (patch) => onChange({ ...options, ...patch });
  const count = options.clipsCount ?? 3;
  const aspect = options.clipAspect ?? '9:16';
  const cap = catalog || {};
  const captionsOn = options.captions !== false;
  const aspects = [
    { id: '9:16', label: 'Vertical 9:16' },
    { id: '1:1', label: 'Quadrado' },
    { id: '16:9', label: 'Horizontal' },
    { id: 'original', label: 'Original' },
  ];
  return (
    <div>
      <div style={{ padding: '15px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Quantidade de clipes</div>
          <div style={{ color: C.faint, fontSize: 12, marginTop: 3 }}>Os {count} melhores trechos</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="range" min={1} max={6} value={count} onChange={(e) => set({ clipsCount: Number(e.target.value) })} />
          <span style={{ fontWeight: 700, width: 18, textAlign: 'center' }}>{count}</span>
        </div>
      </div>

      <div style={{ padding: '15px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Formato dos clipes</div>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 11, flexWrap: 'wrap' }}>
          {aspects.map((a) => {
            const on = aspect === a.id;
            return (
              <button
                key={a.id}
                onClick={() => set({ clipAspect: a.id })}
                style={{
                  border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer',
                  background: on ? GRAD : 'transparent', color: on ? '#fff' : C.muted, fontWeight: on ? 600 : 500,
                }}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Duração de cada clipe (mín/máx) */}
      <div style={{ padding: '15px 0', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Duração de cada clipe</div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.muted }}>
            Mínimo
            <input type="range" min={5} max={60} value={options.clipMin ?? 15} onChange={(e) => set({ clipMin: Number(e.target.value) })} />
            <span style={{ fontWeight: 700, width: 34, textAlign: 'right' }}>{options.clipMin ?? 15}s</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.muted }}>
            Máximo
            <input type="range" min={15} max={120} value={options.clipMax ?? 50} onChange={(e) => set({ clipMax: Number(e.target.value) })} />
            <span style={{ fontWeight: 700, width: 34, textAlign: 'right' }}>{options.clipMax ?? 50}s</span>
          </label>
        </div>
      </div>

      {/* Legenda — igual ao modo automático */}
      <Row label="Legendas nos clipes" hint="Transcrição queimada no vídeo (palavra a palavra por padrão)">
        <Toggle on={captionsOn} onChange={(v) => set({ captions: v })} />
      </Row>
      {captionsOn && cap.captionTemplates && (
        <>
          <div style={{ padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Modelo da legenda</div>
            <CaptionGallery options={{ ...options, captionTemplate: options.captionTemplate || 'pop' }} onApply={set} />
          </div>
          {cap.captionFonts && (
            <Row label="Tipografia (fonte)" hint="Fonte premium embutida — igual em qualquer máquina">
              <Select value={options.captionFont || 'auto'} options={cap.captionFonts} onChange={(v) => set({ captionFont: v })} />
            </Row>
          )}
          {cap.captionModes && (
            <Row label="Modo da legenda" hint="Palavra por palavra ou frase inteira">
              <Select value={options.captionMode || 'auto'} options={cap.captionModes} onChange={(v) => set({ captionMode: v })} />
            </Row>
          )}
          <Row label="Destacar palavra falada" hint="Desligado: legenda normal. Ligado: realça a palavra que está sendo dita">
            <Toggle on={options.captionHighlight === true} onChange={(v) => set({ captionHighlight: v })} />
          </Row>
          {cap.captionColors && (
            <Row label="Cor da legenda" hint="Padrão branco">
              <Swatches value={options.captionColor || 'white'} options={cap.captionColors} onChange={(v) => set({ captionColor: v })} />
            </Row>
          )}
        </>
      )}

      {/* Cor — igual ao modo automático */}
      {cap.colorLooks && (
        <Row label="Color grade" hint="Acabamento de cor cinematográfico (automático analisa o vídeo)">
          <Select value={options.colorLook || 'auto'} options={cap.colorLooks} onChange={(v) => set({ colorLook: v })} />
        </Row>
      )}
    </div>
  );
}

/** Ícone grande num disco de vidro (para telas de estado: erro, servidor off). */
function IconBadge({ name, tone = C.orange }) {
  return (
    <div style={{ position: 'relative', width: 58, height: 58, margin: '0 auto' }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 16, background: tone, filter: 'blur(16px)', opacity: 0.28 }} />
      <div
        style={{
          position: 'relative',
          width: 58,
          height: 58,
          borderRadius: 16,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${C.border}`,
          color: tone,
        }}
      >
        <Icon name={name} size={26} strokeWidth={1.9} />
      </div>
    </div>
  );
}

function Shell({ children, health, embedded, compact = false, wide = false }) {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {!embedded && (
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
          <div style={{ position: 'relative', width: 36, height: 36 }}>
            <div style={{ position: 'absolute', inset: -4, borderRadius: 12, background: C.orange, filter: 'blur(11px)', opacity: 0.45 }} />
            <div style={{ position: 'relative' }}>
              <Logo size={36} />
            </div>
          </div>
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
      )}

      <main className="rf-page" style={{ maxWidth: wide ? 1560 : 1000, width: '100%', minWidth: 0, margin: 0, padding: wide ? '28px 24px 80px' : '40px 32px 80px', flex: 1 }}>
        {!embedded && <div className={`rf-anim rf-hero${compact ? ' rf-hero-compact' : ''}`} style={{ position: 'relative', marginBottom: 30 }}>
          {/* halo suave atrás do título */}
          <div style={{ position: 'absolute', top: -60, left: -20, width: 280, height: 200, background: 'radial-gradient(circle, rgba(255,107,53,0.14), transparent 65%)', pointerEvents: 'none', filter: 'blur(4px)' }} />
          <div
            style={{
              position: 'relative',
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
            className="rf-hero-title"
            style={{
              position: 'relative',
              fontSize: 42,
              lineHeight: 1.06,
              margin: '0 0 12px',
              letterSpacing: -1.3,
              fontWeight: 800,
              fontFamily: FONT_DISPLAY,
            }}
          >
            Do bruto ao pronto,{' '}
            <span style={gradientText}>automático.</span>
          </h1>
          <p style={{ position: 'relative', color: C.muted, margin: 0, fontSize: 15.5, lineHeight: 1.6, maxWidth: 560 }}>
            Suba um vídeo. O Riseframe corta as pausas, gera legendas dinâmicas, insere B-roll
            e aplica um color grade cinematográfico — ou ajuste tudo você mesmo na timeline.
          </p>
          {/* chips das capacidades */}
          <div className="rf-hero-chips" style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            {[
              { icon: 'scissors', label: 'Corta pausas' },
              { icon: 'captions', label: 'Legendas dinâmicas' },
              { icon: 'image', label: 'B-roll automático' },
              { icon: 'palette', label: 'Color grade' },
              { icon: 'crop', label: 'Reframe 9:16' },
            ].map((f) => (
              <span key={f.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 20, padding: '6px 12px' }}>
                <span style={{ color: C.orangeSoft, display: 'flex' }}><Icon name={f.icon} size={13} strokeWidth={2} /></span>
                {f.label}
              </span>
            ))}
          </div>
        </div>}
        {children}
      </main>

      {!embedded && (
        <footer style={{ textAlign: 'center', padding: '20px', color: C.faint, fontSize: 12, borderTop: `1px solid ${C.border}` }}>
          Riseframe · editor de vídeo com IA
        </footer>
      )}
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
