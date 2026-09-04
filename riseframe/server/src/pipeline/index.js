import { config } from '../config.js';
import { probeSummary } from './ffmpeg.js';
import { transcribe } from './transcribe/index.js';
import { analyze } from './analyze.js';
import { silenceRemovalRanges } from './silence.js';
import { subtractRanges, keptDuration, remuxByKeepSegments, remapTranscript } from './timeline.js';
import { insertBroll } from './broll.js';
import { applyMotion } from './motion.js';
import { enhanceVoice } from './voice.js';
import { markFillers } from './cleanup.js';
import { cleanupWithClaude } from './cleanupLLM.js';
import { burnCaptions } from './captions.js';
import { applyColor } from './color.js';
import { finalRender } from './render.js';
import { generateClips } from './clips.js';
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
  } else if (mode === 'clips') {
    all = [
      { key: 'probe', label: 'Sondando o vídeo', weight: 3, enabled: true },
      { key: 'transcribe', label: 'Transcrevendo a fala', weight: 22, enabled: true },
      { key: 'clips', label: 'Gerando clipes curtos', weight: 75, enabled: true },
    ];
  } else {
    const hasRemoval = options.cutSilence !== false || options.autoClean === true || mode === 'render';
    all = [
      { key: 'probe', label: 'Sondando o vídeo', weight: 2, enabled: true },
      { key: 'voice', label: 'Corrigindo a voz (áudio)', weight: 10, enabled: options.voiceEnhance === true },
      { key: 'transcribe', label: 'Transcrevendo a fala', weight: 15, enabled: mode !== 'render' },
      { key: 'cut', label: 'Aplicando cortes na timeline', weight: 20, enabled: hasRemoval },
      { key: 'analyze', label: 'Analisando temas', weight: 3, enabled: true },
      { key: 'motion', label: 'Aplicando movimento (zoom)', weight: 12, enabled: Boolean(options.videoMotion) && options.videoMotion !== 'none' },
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

/** Remove palavras marcadas (removed) da transcrição sem remapear tempos. */
function dropRemovedWords(transcript) {
  const segments = [];
  for (const seg of transcript?.segments || []) {
    const words = (seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }])
      .filter((w) => !w.removed);
    if (!words.length) continue;
    segments.push({ ...seg, start: words[0].start, end: words[words.length - 1].end, text: words.map((w) => w.word).join(' '), words });
  }
  return { ...transcript, segments };
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

  // Fonte "limpa" para o tracker de reframe (antes de legendas/B-roll). Atualizada
  // após o corte de timeline (mesma geometria/timeline do vídeo final).
  let trackInput = input;
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

  // 1b. Correção de voz (áudio): denoise + normalização de volume. Antes da
  // transcrição — a ASR também se beneficia do áudio limpo. Fonte limpa p/ tracker.
  if (has('voice')) {
    const st = enter('voice');
    const r = await enhanceVoice(input, work, meta, options, st.onProgress);
    if (r.applied) {
      input = r.output;
      trackInput = r.output;
      report.voice = { applied: true, intensity: options.voiceIntensity || 'medio' };
    }
    st.onProgress(1);
  }

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

  // Modo clips: encontra os melhores trechos e gera vários clipes curtos.
  if (mode === 'clips') {
    const st = enter('clips');
    const clips = await generateClips(
      { source: input, work, outputsDir: job.outputsDir, jobId: job.id, transcript, meta, options },
      st.onProgress,
    );
    report.clips = clips;
    report.provider.transcribe = transcript.provider;
    emit({ progress: 100, stage: 'done', stageLabel: 'Clipes prontos' });
    log.ok(`${clips.length} clipes gerados para job ${job.id}`);
    return report;
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

    // Limpeza automática da fala: marca muletas/hesitações, gagueiras e — com a
    // chave da Anthropic do usuário — também falsos começos e autocorreções (IA).
    if (options.autoClean) {
      // 1) Heurística SEMPRE (garante o óbvio: muletas, repetições, gagueiras).
      const h = markFillers(transcript);
      let cleaned = h;
      let method = 'heurística';
      let total = h.removedCount;
      // 2) IA POR CIMA (com a chave): pega falsos começos e autocorreções sutis,
      //    preservando o que a heurística já marcou.
      if (options.anthropicKey) {
        try {
          const ai = await cleanupWithClaude(h, { anthropicKey: options.anthropicKey, model: config.analyze.model });
          cleaned = ai;
          method = 'heurística + IA';
          total = h.removedCount + ai.removedCount; // ai conta só as NOVAS (preserva as da heurística)
        } catch (err) {
          log.warn(`limpeza por IA falhou (${err.message}); mantendo heurística`);
        }
      }
      transcript = cleaned;
      report.autoClean = { removed: total, method };
      if (total) log.info(`limpeza automática (${method}): ${total} palavras marcadas`);
    }

    const removals = [];
    if (options.cutSilence !== false) removals.push(...(await silenceRemovalRanges(input, meta, options)));
    // Palavras marcadas como removidas: edição manual do cliente (render) e/ou limpeza automática.
    removals.push(...transcriptRemovalRanges(transcript));

    const keep = subtractRanges(meta.duration, removals);
    if (!keep.length) throw new Error('todos os trechos foram removidos — nada para renderizar');

    const removedSeconds = Math.max(0, meta.duration - keptDuration(keep));
    if (removedSeconds > 0.15) {
      const r = await remuxByKeepSegments(input, work, meta, keep, st.onProgress, 'cut');
      input = r.output;
      trackInput = input; // fonte limpa (pós-corte, pré-legendas/B-roll) para o tracker
      transcript = remapTranscript(transcript, keep); // sincroniza legendas com a nova timeline
      meta = { ...meta, ...(await probeSummary(input)) };
      report.cut = { removedSeconds: Math.round(removedSeconds * 10) / 10, kept: keep.length };
    } else {
      // Nada relevante para recortar. Ainda assim, se a limpeza automática marcou
      // palavras, tira-as das legendas (sem remapear tempos — o vídeo não foi cortado).
      if (options.autoClean) transcript = dropRemovedWords(transcript);
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
    if (analysis.niche) report.niche = analysis.niche;
    st.record({ themes: analysis.themes.length, brollMoments: analysis.brollMoments.length });
    st.onProgress(1);
  }

  // 5. Movimento (zoom/pan) — sobre o vídeo base, antes de B-roll/legendas para não
  // ampliar as legendas junto. Atualiza também o trackInput (fonte limpa do reframe).
  if (has('motion')) {
    const st = enter('motion');
    const r = await applyMotion(input, work, meta, options, st.onProgress);
    input = r.output;
    trackInput = r.output;
    report.motion = { effect: r.motion, intensity: options.motionIntensity || 'medio' };
    st.record(report.motion);
    st.onProgress(1);
  }

  // 6. B-roll
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
      template: options.captionTemplate || 'clean',
      color: options.captionColor || 'white',
      font: options.captionFont || 'auto', // tipografia (auto = padrão do estilo)
      mode: options.captionMode, // compat legado
      fontScale: options.captionScale || 1,
    };
    const r = await burnCaptions(input, work, meta, transcript, style, st.onProgress);
    input = r.output;
    report.captions = { segments: r.count, template: style.template, color: style.color };
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
    const r = await finalRender(input, job.outputsDir, job.id, meta, { ...options, trackInput }, st.onProgress);
    report.output = { file: `${job.id}.mp4`, aspect: r.aspect, sizeBytes: r.sizeBytes, reframe: r.reframe };
    st.record({ aspect: r.aspect });
    st.onProgress(1);
  }

  emit({ progress: 100, stage: 'done', stageLabel: 'Concluído' });
  log.ok(`pipeline (${mode}) concluído para job ${job.id}`);
  return report;
}
