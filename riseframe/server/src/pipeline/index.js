import { probeSummary } from './ffmpeg.js';
import { transcribe } from './transcribe/index.js';
import { analyze } from './analyze.js';
import { cutSilences } from './silence.js';
import { insertBroll } from './broll.js';
import { burnCaptions } from './captions.js';
import { applyColor } from './color.js';
import { finalRender } from './render.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('pipeline');

/**
 * Plano de etapas com pesos (soma ~1). Etapas desativadas pelas opções são
 * removidas e o peso é redistribuído proporcionalmente.
 */
function buildPlan(options) {
  const all = [
    { key: 'probe', label: 'Sondando o vídeo', weight: 2, enabled: true },
    { key: 'transcribe', label: 'Transcrevendo a fala', weight: 15, enabled: true },
    { key: 'analyze', label: 'Analisando temas', weight: 3, enabled: true },
    { key: 'silence', label: 'Cortando pausas e silêncios', weight: 20, enabled: options.cutSilence !== false },
    { key: 'broll', label: 'Inserindo B-roll', weight: 14, enabled: options.broll === true },
    { key: 'captions', label: 'Renderizando legendas dinâmicas', weight: 20, enabled: options.captions !== false },
    { key: 'color', label: 'Aplicando color grade', weight: 11, enabled: (options.colorLook || 'teal-orange') !== 'none' },
    { key: 'render', label: 'Renderização final', weight: 15, enabled: true },
  ].filter((s) => s.enabled);

  const total = all.reduce((a, s) => a + s.weight, 0);
  let acc = 0;
  for (const s of all) {
    s.from = acc / total;
    acc += s.weight;
    s.to = acc / total;
  }
  return all;
}

/**
 * Executa o pipeline completo sobre um job.
 * @param {object} job  {id, inputPath, workDir, outputsDir, options}
 * @param {(patch:object)=>void} onUpdate  chamado a cada mudança de progresso/etapa
 * @returns {Promise<object>} relatório
 */
export async function runPipeline(job, onUpdate = () => {}) {
  const plan = buildPlan(job.options);
  const options = job.options;
  const work = job.workDir;
  let input = job.inputPath;

  const report = { stages: [], provider: {}, options };
  const stageByKey = Object.fromEntries(plan.map((s) => [s.key, s]));

  const emit = (patch) => onUpdate(patch);

  // Progresso: base da etapa + fração * span da etapa.
  function stageProgress(key) {
    const s = stageByKey[key];
    return (pct) => {
      const overall = s.from + Math.max(0, Math.min(1, pct)) * (s.to - s.from);
      emit({ progress: Math.round(overall * 100), stage: key, stageLabel: s.label });
    };
  }
  function enter(key) {
    const s = stageByKey[key];
    log.info(`▶ ${s.label}`);
    emit({ progress: Math.round(s.from * 100), stage: key, stageLabel: s.label });
    return { onProgress: stageProgress(key), record: (data) => report.stages.push({ key, ...data }) };
  }
  const has = (key) => Boolean(stageByKey[key]);

  // 1. Probe
  {
    enter('probe');
    var meta = await probeSummary(input);
    report.input = meta;
    if (!meta.duration || meta.duration < 0.3) throw new Error('vídeo inválido ou muito curto');
  }

  // 2. Transcrição
  let transcript = { segments: [], text: '' };
  {
    const st = enter('transcribe');
    transcript = await transcribe(input, work, meta);
    report.provider.transcribe = transcript.provider;
    if (transcript.fallbackFrom) report.provider.transcribeFallback = transcript.fallbackReason;
    st.record({ segments: transcript.segments.length, provider: transcript.provider });
    st.onProgress(1);
  }

  // 3. Análise
  let analysis = { themes: [], brollMoments: [] };
  {
    const st = enter('analyze');
    analysis = await analyze(transcript, meta, options);
    report.themes = analysis.themes;
    st.record({ themes: analysis.themes.length, brollMoments: analysis.brollMoments.length });
    st.onProgress(1);
  }

  // 4. Corte de silêncios
  if (has('silence')) {
    const st = enter('silence');
    const r = await cutSilences(input, work, meta, options, st.onProgress);
    input = r.output;
    report.silence = { removedSeconds: Math.round(r.removedSeconds * 10) / 10, kept: r.keepSegments.length };
    st.record(report.silence);
    // Re-sondar para atualizar a duração após o corte (afeta progresso das próximas etapas).
    meta = { ...meta, ...(await probeSummary(input)) };
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

  // 6. Legendas
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
    report.color = { look: r.look };
    st.record(report.color);
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
  log.ok(`pipeline concluído para job ${job.id}`);
  return report;
}
