import { probeSummary } from './ffmpeg.js';
import { transcribe } from './transcribe/index.js';
import { analyze } from './analyze.js';
import { silenceRemovalRanges } from './silence.js';
import { subtractRanges, keptDuration, remuxByKeepSegments, remapTranscript } from './timeline.js';
import { insertBroll } from './broll.js';
import { burnCaptions } from './captions.js';
import { applyColor } from './color.js';
import { finalRender } from './render.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('pipeline');

/**
 * Plano de etapas por modo, com pesos (etapas desligadas são removidas e o peso
 * redistribuído).
 * - transcribe: sonda + transcreve e para (para o editor de transcrição).
 * - auto/render: pipeline completo. Em render, a transcrição já vem editada do cliente.
 */
function buildPlan(mode, options) {
  let all;
  if (mode === 'transcribe') {
    all = [
      { key: 'probe', label: 'Sondando o vídeo', weight: 5, enabled: true },
      { key: 'transcribe', label: 'Transcrevendo a fala', weight: 95, enabled: true },
    ];
  } else {
    const hasRemoval = options.cutSilence !== false || mode === 'render';
    all = [
      { key: 'probe', label: 'Sondando o vídeo', weight: 2, enabled: true },
      { key: 'transcribe', label: 'Transcrevendo a fala', weight: 15, enabled: mode !== 'render' },
      { key: 'cut', label: 'Aplicando cortes na timeline', weight: 20, enabled: hasRemoval },
      { key: 'analyze', label: 'Analisando temas', weight: 3, enabled: true },
      { key: 'broll', label: 'Inserindo B-roll', weight: 14, enabled: options.broll === true },
      { key: 'captions', label: 'Renderizando legendas dinâmicas', weight: 20, enabled: options.captions !== false },
      { key: 'color', label: 'Aplicando color grade', weight: 11, enabled: (options.colorLook || 'teal-orange') !== 'none' },
      { key: 'render', label: 'Renderização final', weight: 15, enabled: true },
    ].filter((s) => s.enabled);
  }
  const total = all.reduce((a, s) => a + s.weight, 0);
  let acc = 0;
  for (const s of all) {
    s.from = acc / total;
    acc += s.weight;
    s.to = acc / total;
  }
  return all;
}

/** Faixas a remover derivadas das palavras marcadas como removidas na transcrição. */
function transcriptRemovalRanges(transcript, pad = 0.04) {
  const ranges = [];
  for (const seg of transcript?.segments || []) {
    const words = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text, removed: seg.removed }];
    for (const w of words) {
      if (w.removed) ranges.push({ start: Math.max(0, w.start - pad), end: w.end + pad });
    }
  }
  return ranges;
}

/**
 * Executa o pipeline sobre um job.
 * @param {object} job {id, mode, inputPath, workDir, outputsDir, options, editedTranscript?}
 */
export async function runPipeline(job, onUpdate = () => {}) {
  const mode = job.mode || 'auto';
  const plan = buildPlan(mode, job.options);
  const options = job.options;
  const work = job.workDir;
  let input = job.inputPath;

  const report = { mode, stages: [], provider: {}, options };
  const stageByKey = Object.fromEntries(plan.map((s) => [s.key, s]));
  const emit = (patch) => onUpdate(patch);
  const has = (key) => Boolean(stageByKey[key]);

  function progressFor(key) {
    const s = stageByKey[key];
    return (pct) => emit({ progress: Math.round((s.from + Math.max(0, Math.min(1, pct)) * (s.to - s.from)) * 100), stage: key, stageLabel: s.label });
  }
  function enter(key) {
    const s = stageByKey[key];
    log.info(`▶ ${s.label}`);
    emit({ progress: Math.round(s.from * 100), stage: key, stageLabel: s.label });
    return { onProgress: progressFor(key), record: (data) => report.stages.push({ key, ...data }) };
  }

  // 1. Probe
  enter('probe');
  let meta = await probeSummary(input);
  report.input = meta;
  if (!meta.duration || meta.duration < 0.3) throw new Error('vídeo inválido ou muito curto');

  // 2. Transcrição (ASR no auto/transcribe; já vem do cliente no render)
  let transcript;
  if (mode === 'render') {
    transcript = job.editedTranscript || { segments: [], text: '' };
    report.provider.transcribe = 'edited';
  } else {
    const st = enter('transcribe');
    transcript = await transcribe(input, work, meta);
    report.provider.transcribe = transcript.provider;
    if (transcript.fallbackFrom) report.provider.transcribeFallback = transcript.fallbackReason;
    st.record({ segments: transcript.segments.length, provider: transcript.provider });
    st.onProgress(1);
  }

  // Modo transcribe: devolve a transcrição e para (o upload é preservado para o render).
  if (mode === 'transcribe') {
    report.transcript = transcript;
    report.sourceId = job.id;
    emit({ progress: 100, stage: 'done', stageLabel: 'Transcrição pronta' });
    log.ok(`transcrição pronta para job ${job.id} (${transcript.segments.length} segmentos)`);
    return report;
  }

  // 3. Cortes na timeline: silêncio (auto/render, se ligado) + palavras removidas (render)
  if (has('cut')) {
    const st = enter('cut');
    const removals = [];
    if (options.cutSilence !== false) removals.push(...(await silenceRemovalRanges(input, meta, options)));
    if (mode === 'render') removals.push(...transcriptRemovalRanges(transcript));

    const keep = subtractRanges(meta.duration, removals);
    if (!keep.length) throw new Error('todos os trechos foram removidos — nada para renderizar');

    const removedSeconds = Math.max(0, meta.duration - keptDuration(keep));
    if (removedSeconds > 0.15) {
      const r = await remuxByKeepSegments(input, work, meta, keep, st.onProgress, 'cut');
      input = r.output;
      transcript = remapTranscript(transcript, keep); // sincroniza legendas com a nova timeline
      meta = { ...meta, ...(await probeSummary(input)) };
      report.cut = { removedSeconds: Math.round(removedSeconds * 10) / 10, kept: keep.length };
    } else {
      report.cut = { removedSeconds: 0, kept: keep.length };
    }
    st.record(report.cut);
    st.onProgress(1);
  }

  // 4. Análise (sobre a transcrição já remapeada)
  let analysis = { themes: [], brollMoments: [] };
  {
    const st = enter('analyze');
    analysis = await analyze(transcript, meta, options);
    report.themes = analysis.themes;
    st.record({ themes: analysis.themes.length, brollMoments: analysis.brollMoments.length });
    st.onProgress(1);
  }

  // 5. B-roll
  if (has('broll')) {
    const st = enter('broll');
    const r = await insertBroll(input, work, meta, analysis, options, st.onProgress);
    input = r.output;
    report.broll = { inserted: r.inserted };
    st.record(report.broll);
    st.onProgress(1);
  }

  // 6. Legendas (transcrição sincronizada)
  if (has('captions')) {
    const st = enter('captions');
    const style = {
      mode: options.captionMode || 'karaoke',
      preset: options.captionPreset || 'laranja',
      fontScale: options.captionScale || 1,
    };
    const r = await burnCaptions(input, work, meta, transcript, style, st.onProgress);
    input = r.output;
    report.captions = { segments: r.count, mode: style.mode, preset: style.preset };
    st.record(report.captions);
  }

  // 7. Color grade
  if (has('color')) {
    const st = enter('color');
    const r = await applyColor(input, work, meta, options, st.onProgress);
    input = r.output;
    report.color = { look: r.look, ai: r.ai || null };
    st.record({ look: r.look });
  }

  // 8. Render final
  {
    const st = enter('render');
    const r = await finalRender(input, job.outputsDir, job.id, meta, options, st.onProgress);
    report.output = { file: `${job.id}.mp4`, aspect: r.aspect, sizeBytes: r.sizeBytes };
    st.record({ aspect: r.aspect });
    st.onProgress(1);
  }

  emit({ progress: 100, stage: 'done', stageLabel: 'Concluído' });
  log.ok(`pipeline (${mode}) concluído para job ${job.id}`);
  return report;
}
