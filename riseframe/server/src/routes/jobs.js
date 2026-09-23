import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { queue } from '../queue.js';
import { requireAuth } from './auth.js';
import { getSettings } from '../auth/settings.js';
import { billingStatus, canAfford, charge, refund, allowedFeatures, currentPeriod } from '../auth/billing.js';
import { creditItems, creditTotal, lockedItems, cheapestPlanFor } from '../../../shared/credits.js';
import { registerMedia, resolveMedia } from '../mediaStore.js';
import { probeSummary, runFfmpeg, sdrVf } from '../pipeline/ffmpeg.js';
import { analyze } from '../pipeline/analyze.js';
import { brollCandidates } from '../pipeline/broll.js';
import { sanitizeColorAdjust, colorFilter, manualAdjustVf, fastColorChain } from '../pipeline/color.js';
import { analyzeAndGrade } from '../pipeline/autoColor.js';

/** Opções do job com as chaves salvas do usuário (Pexels/Anthropic) — o servidor manda. */
function optionsForUser(req) {
  const o = parseOptions(req.body?.options);
  const s = getSettings(req.user.id);
  if (s.pexelsKey) o.pexelsKey = s.pexelsKey;
  if (s.anthropicKey) o.anthropicKey = s.anthropicKey;
  // Resolve cada mídia própria (mediaId → caminho do arquivo). O cliente nunca
  // manda caminho; itens cuja mídia não existe/expirou são descartados.
  if (o.userMedia?.length) {
    o.userMedia = o.userMedia
      .map((m) => {
        const found = resolveMedia(m.mediaId);
        if (!found) return null;
        return { ...m, kind: m.kind || found.kind, file: found.path };
      })
      .filter(Boolean);
  }
  // Plano de B-roll: itens com mídia própria (mediaId) viram caminho de arquivo.
  if (o.brollPlan?.length) {
    o.brollPlan = o.brollPlan.map((p) => {
      if (p.mediaId) {
        const found = resolveMedia(p.mediaId);
        if (found) return { ...p, file: found.path, kind: found.kind || p.kind };
        return { ...p, remove: true }; // mídia sumiu → não insere nada torto
      }
      return p;
    });
  }
  return o;
}

export const jobsRouter = Router();

/** Recusa (403) quando o job usa recurso que o plano do usuário não libera. */
function planBlocks(req, res, items) {
  const locked = lockedItems(items, allowedFeatures(req.user));
  if (!locked.length) return false;
  const plan = cheapestPlanFor(locked[0].id, config.billing.plans) || 'superior';
  res.status(403).json({
    code: 'PLAN_REQUIRED',
    locked: locked.map((i) => i.id),
    error: `${locked.map((i) => i.label).join(', ')}: disponível a partir do plano ${plan}. Veja em Planos, no menu, ou desligue o recurso.`,
  });
  return true;
}

function noCredits(req, res, cost) {
  const { credits } = billingStatus(req.user);
  res.status(402).json({
    code: 'PAYMENT_REQUIRED',
    cost,
    credits,
    error: `Este vídeo custa ${cost} créditos e você tem ${credits}. Assine um plano ou faça uma recarga em Planos, no menu.`,
  });
}

// Checagem antes do multer: recurso fora do plano (ex.: clipes) ou sem saldo nem para o
// mínimo → recusa sem receber o upload.
function requireCredits(mode) {
  return (req, res, next) => {
    const items = creditItems(mode, {}, config.billing.costs);
    if (planBlocks(req, res, items)) return;
    const min = creditTotal(items);
    if (canAfford(req.user, min)) return next();
    noCredits(req, res, min);
  };
}

// Créditos cobrados por job ainda em andamento: devolvidos se o processamento falhar.
const heldCredits = new Map();
queue.on('update', (j) => {
  const held = heldCredits.get(j.id);
  if (!held || (j.status !== 'error' && j.status !== 'done')) return;
  heldCredits.delete(j.id);
  if (j.status === 'error') refund(held.userId, held);
});

/** Cobra o job e cria na fila; responde 402 (e apaga o upload) se faltar saldo. */
function chargeAndQueue(req, res, mode, jobInput) {
  const items = creditItems(mode, jobInput.options, config.billing.costs);
  const dropUpload = () => req.file && fs.unlink(req.file.path, () => {});
  if (planBlocks(req, res, items)) return dropUpload();
  const cost = creditTotal(items);
  const until = currentPeriod(req.user.id);
  const charged = charge(req.user, cost);
  if (charged === null) {
    dropUpload();
    return noCredits(req, res, cost);
  }
  const job = queue.create({ mode, ...jobInput });
  if (charged.total) heldCredits.set(job.id, { userId: req.user.id, monthly: charged.monthly, extra: charged.extra, until });
  res.status(201).json({ ...queue.public(job), creditsCharged: charged.total });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.paths.uploads),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `${nanoid(12)}${ext}`);
  },
});

const ALLOWED = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED.has(ext)) cb(null, true);
    else cb(new Error(`formato não suportado: ${ext || 'desconhecido'}`));
  },
});

// Mídias próprias do usuário para a timeline (imagens, vídeos e músicas).
const MEDIA_IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const MEDIA_VIDEO = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);
const MEDIA_AUDIO = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
function mediaKind(ext) {
  if (MEDIA_IMAGE.has(ext)) return 'image';
  if (MEDIA_VIDEO.has(ext)) return 'video';
  if (MEDIA_AUDIO.has(ext)) return 'audio';
  return null;
}

const uploadMedia = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (mediaKind(ext)) cb(null, true);
    else cb(new Error(`formato de mídia não suportado: ${ext || 'desconhecido'}`));
  },
});

function clampNum(v, min, max, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// Parâmetros de detecção de silêncio por "força do corte". Quanto mais forte,
// menor a pausa mínima e mais permissivo o piso de ruído → enxuga mais o vídeo.
// noiseDb = piso fixo (fallback). headroom = distância abaixo do PICO no modo
// adaptativo (maior = corta menos). min = pausa mínima. pad = folga nas bordas.
function silenceParamsFor(strength) {
  if (strength === 'suave') return { noiseDb: -34, headroom: 34, min: 0.6, pad: 0.1 };
  if (strength === 'forte') return { noiseDb: -26, headroom: 26, min: 0.28, pad: 0.05 };
  return { noiseDb: -30, headroom: 30, min: 0.45, pad: 0.08 }; // equilibrado
}

// Sanitiza a lista de cortes de silêncio escolhidos manualmente na timeline.
function sanitizeSilenceCuts(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    const s = Number(c?.start);
    const e = Number(c?.end);
    if (Number.isFinite(s) && Number.isFinite(e) && e - s > 0.02 && s >= 0) {
      out.push({ start: s, end: e });
    }
    if (out.length >= 1000) break; // teto de segurança
  }
  return out;
}

// Sanitiza a lista de mídias próprias colocadas na timeline. Cada item referencia
// uma mídia já enviada (mediaId); o caminho do arquivo é resolvido no servidor.
function sanitizeUserMedia(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw) {
    if (!m || typeof m.mediaId !== 'string' || !m.mediaId) continue;
    const kind = ['image', 'video', 'audio'].includes(m.kind) ? m.kind : null;
    const item = {
      mediaId: m.mediaId,
      kind,
      start: clampNum(m.start, 0, 100000, 0),
      duration: clampNum(m.duration, 0.2, 100000, kind === 'image' ? 4 : 5),
      mode: ['cover', 'pip'].includes(m.mode) ? m.mode : 'cover',
      px: clampNum(m.px, 0, 1, 0.62),
      py: clampNum(m.py, 0, 1, 0.06),
      scale: clampNum(m.scale, 0.15, 0.95, 0.4),
      opacity: clampNum(m.opacity, 0.1, 1, 1),
      volume: clampNum(m.volume, 0, 2, 0.35),
    };
    out.push(item);
    if (out.length >= 40) break; // teto de segurança
  }
  return out;
}

// Sanitiza o plano de B-roll travado na tela de revisão. Cada item fixa o que
// entra num momento: uma URL do banco (candidato escolhido), uma mídia própria
// (mediaId) ou a marcação de remover. Sem isso, o servidor volta a escolher sozinho.
/** Momentos de zoom (punch-in) editados na timeline: [{start,end,scale?}]. null = automático. */
function sanitizeZoomMoments(raw) {
  if (!Array.isArray(raw)) return undefined;
  const out = [];
  for (const m of raw) {
    const start = Number(m?.start);
    const end = Number(m?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.15) continue;
    const item = { start: Math.max(0, start), end: Math.min(start + 30, end) };
    if (Number.isFinite(Number(m.scale))) item.scale = clampNum(m.scale, 1.01, 1.6, 1.12);
    out.push(item);
    if (out.length >= 60) break;
  }
  return out;
}

function sanitizeBrollPlan(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw) {
    if (!p) continue;
    const start = Number(p.start);
    const end = Number(p.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const item = {
      start: Math.max(0, start),
      end,
      kind: p.kind === 'video' ? 'video' : 'image',
      remove: p.remove === true,
      query: typeof p.query === 'string' ? p.query.slice(0, 80) : '',
    };
    // URL do banco: só http(s) de imagem/vídeo (o download roda no pipeline).
    if (typeof p.url === 'string' && /^https:\/\/[^\s]+$/i.test(p.url)) item.url = p.url;
    if (typeof p.mediaId === 'string' && p.mediaId) item.mediaId = p.mediaId;
    // Ajuste do quadro do B-roll: zoom 1–2.5 e ponto de foco X/Y (0–1) dentro da imagem.
    item.zoom = clampNum(p.zoom, 1, 2.5, 1);
    item.fx = clampNum(p.fx, 0, 1, 0.5);
    item.fy = clampNum(p.fy, 0, 1, 0.5);
    out.push(item);
    if (out.length >= 40) break;
  }
  return out;
}

// Looks permitidos via API pública. O caminho `lut:<arquivo>` NÃO é exposto ao
// cliente (evita injeção de filtro/leitura de caminho no filtergraph do ffmpeg);
// LUTs ficam a cargo de configuração do servidor, não da requisição.
const ALLOWED_LOOKS = new Set(['auto', 'none', 'clean', 'teal-orange', 'warm', 'cold', 'vibrant', 'moody']);

function parseOptions(raw) {
  let o = {};
  if (raw) {
    try {
      o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      o = {};
    }
  }
  const cutStrength = ['suave', 'equilibrado', 'forte'].includes(o.cutStrength) ? o.cutStrength : 'forte';
  const sp = silenceParamsFor(cutStrength);
  return {
    cutSilence: o.cutSilence !== false,
    cutStrength, // suave | equilibrado | forte (define agressividade do corte automático)
    voiceEnhance: o.voiceEnhance === true, // denoise + normalização de volume
    voiceIntensity: ['suave', 'medio', 'forte'].includes(o.voiceIntensity) ? o.voiceIntensity : 'medio',
    autoClean: o.autoClean === true, // corta muletas/hesitações e gagueiras da fala
    soundEffects: o.soundEffects === true, // pop na legenda + whoosh no B-roll
    sfxIntensity: ['suave', 'medio', 'forte'].includes(o.sfxIntensity) ? o.sfxIntensity : 'medio',
    captions: o.captions !== false,
    captionTemplate: ['clean', 'pop', 'hormozi', 'box', 'neon', 'bounce', 'keyword'].includes(o.captionTemplate) ? o.captionTemplate : 'clean',
    captionColor: ['white', 'yellow', 'orange', 'purple', 'green', 'cyan', 'pink', 'red'].includes(o.captionColor) ? o.captionColor : 'white',
    captionFont: ['auto', 'montserrat', 'gotham', 'helvetica', 'poppins', 'inter', 'opensans', 'anton', 'bebas', 'archivo', 'garamond', 'luckiest'].includes(o.captionFont) ? o.captionFont : 'auto',
    captionAnimation: ['auto', 'fade', 'pop', 'bounce', 'zoom', 'pop-rot', 'shake', 'none'].includes(o.captionAnimation) ? o.captionAnimation : 'auto',
    captionBackground: ['auto', 'shadow', 'box', 'bar', 'glow', 'none', 'clean'].includes(o.captionBackground) ? o.captionBackground : 'auto',
    captionPosition: ['auto', 'top', 'center', 'bottom'].includes(o.captionPosition) ? o.captionPosition : 'auto',
    // Modo de exibição: auto (do estilo) | word (palavra por vez) | phrase (frase inteira).
    captionMode: ['auto', 'word', 'phrase'].includes(o.captionMode) ? o.captionMode : 'auto',
    captionScale: clampNum(o.captionScale, 0.6, 1.6, 1),
    colorLook: ALLOWED_LOOKS.has(o.colorLook) ? o.colorLook : 'auto',
    // Ajuste manual de cor (brilho, contraste, saturação, temperatura: -100..100).
    colorAdjust: sanitizeColorAdjust(o.colorAdjust),
    videoMotion: ['none', 'dynamic', 'zoom-in', 'zoom-out', 'ken-burns', 'pulse'].includes(o.videoMotion) ? o.videoMotion : 'none',
    motionIntensity: ['suave', 'medio', 'forte'].includes(o.motionIntensity) ? o.motionIntensity : 'medio',
    broll: o.broll === true,
    // Layout do B-roll: tela cheia OU tela dividida (metade a metade) com o vídeo
    // da pessoa em cima/baixo e o B-roll na outra metade.
    brollLayout: ['fullscreen', 'top', 'bottom'].includes(o.brollLayout) ? o.brollLayout : 'fullscreen',
    // Posição vertical da pessoa na tela dividida (fallback quando não há enquadramento).
    personCrop: ['top', 'center', 'bottom'].includes(o.personCrop) ? o.personCrop : 'center',
    // Enquadramento no rosto (tela dividida): foco X/Y em 0–1 e zoom 1–2.5. Sem foco
    // definido, o servidor detecta o rosto automaticamente pelo rastreador.
    personFocusX: Number.isFinite(Number(o.personFocusX)) ? clampNum(o.personFocusX, 0, 1, undefined) : undefined,
    personFocusY: Number.isFinite(Number(o.personFocusY)) ? clampNum(o.personFocusY, 0, 1, undefined) : undefined,
    personZoom: clampNum(o.personZoom, 1, 2.5, 1),
    // Fonte das imagens de B-roll: openverse (CC, sem chave) | pexels (livre) | google (contextual, ver copyright).
    imageSource: ['openverse', 'pexels', 'google', 'mix'].includes(o.imageSource) ? o.imageSource : 'openverse',
    niche: ['auto', 'leadership', 'mentor', 'medical', 'fitness', 'finance', 'business', 'marketing', 'education', 'tech', 'mindset', 'law', 'realestate'].includes(o.niche) ? o.niche : 'auto',
    // Chave do Pexels vinda da interface (opcional). Sanitiza: só o formato esperado
    // (alfanumérico, 20–80 chars) é aceito; qualquer outra coisa é descartada.
    pexelsKey: typeof o.pexelsKey === 'string' && /^[A-Za-z0-9]{20,80}$/.test(o.pexelsKey.trim()) ? o.pexelsKey.trim() : '',
    brollEverySec: clampNum(o.brollEverySec, 4, 30, 8),
    brollMax: clampNum(o.brollMax, 1, 12, 6),
    brollPlan: sanitizeBrollPlan(o.brollPlan),
    zoomMoments: sanitizeZoomMoments(o.zoomMoments),
    // ── Restaurados (tinham sumido numa atualização e o servidor descartava: cortes da
    // timeline, volume, formato, força do corte de silêncio, clipes e minhas mídias).
    // Volume da fala: geral, mudo e trechos com volume próprio (tempo original).
    audioMute: o.audioMute === true,
    audioVolume: clampNum(o.audioVolume, 0, 4, 1),
    audioGains: Array.isArray(o.audioGains)
      ? o.audioGains
          .filter((g) => g && Number(g.end) > Number(g.start))
          .slice(0, 40)
          .map((g) => ({ start: Math.max(0, Number(g.start)), end: Number(g.end), volume: clampNum(g.volume, 0, 4, 1) }))
      : [],
    brollMoments: Array.isArray(o.brollMoments)
      ? o.brollMoments
          .filter((m) => m && Number.isFinite(Number(m.start)) && Number(m.end) > Number(m.start))
          .slice(0, 24)
          .map((m) => ({ start: Math.max(0, Number(m.start)), end: Number(m.end), query: typeof m.query === 'string' ? m.query.slice(0, 120) : '' }))
      : null,
    aspect: ['original', '9:16', '16:9', '1:1'].includes(o.aspect) ? o.aspect : 'original',
    reframeTrack: o.reframeTrack !== false, // seguir o sujeito no reframe
    silenceNoiseDb: clampNum(o.silenceNoiseDb, -60, -10, sp.noiseDb),
    silenceMinDuration: clampNum(o.silenceMinDuration, 0.2, 3, sp.min),
    silencePadding: clampNum(o.silencePadding, 0, 0.5, sp.pad),
    // Piso de ruído adaptativo (mede o áudio). Padrão ligado; corta melhor em
    // qualquer gravação. silenceHeadroomDb = distância abaixo do pico (por força).
    silenceAdaptive: o.silenceAdaptive !== false,
    silenceHeadroomDb: clampNum(o.silenceHeadroomDb, 16, 44, sp.headroom),
    // Cortes de silêncio escolhidos manualmente na timeline (modo render). Quando
    // manualSilence=true, o pipeline usa exatamente estes trechos em vez de detectar.
    manualSilence: o.manualSilence === true,
    silenceCuts: sanitizeSilenceCuts(o.silenceCuts),
    // Trechos cortados à mão na faixa de vídeo (tempo original), independentes do silêncio.
    videoCuts: sanitizeSilenceCuts(o.videoCuts),
    // clipes curtos
    clipsCount: clampNum(o.clipsCount, 1, 8, 3),
    clipAspect: ['original', '9:16', '16:9', '1:1'].includes(o.clipAspect) ? o.clipAspect : '9:16',
    clipMin: clampNum(o.clipMin, 5, 60, 15),
    clipMax: clampNum(o.clipMax, 15, 120, 50),
    // Mídias próprias do usuário na timeline (imagens/vídeos/músicas). Resolvidas
    // para caminhos de arquivo no servidor (ver optionsForUser).
    userMedia: sanitizeUserMedia(o.userMedia),
  };
}

// POST /api/jobs  (multipart: file + options) → pipeline automático completo
jobsRouter.post('/jobs', requireAuth, requireCredits('auto'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  chargeAndQueue(req, res, 'auto', {
    filename: req.file.originalname,
    inputPath: req.file.path,
    options: optionsForUser(req),
  });
});

// POST /api/transcribe  (multipart: file) → transcreve e para; o upload fica salvo
// para depois ser reusado por /api/render com a transcrição editada.
jobsRouter.post('/transcribe', requireAuth, requireCredits('transcribe'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  chargeAndQueue(req, res, 'transcribe', {
    filename: req.file.originalname,
    inputPath: req.file.path,
    options: optionsForUser(req),
  });
});

// POST /api/clips  (multipart: file) → gera vários clipes curtos do vídeo longo
jobsRouter.post('/clips', requireAuth, requireCredits('clips'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  chargeAndQueue(req, res, 'clips', {
    filename: req.file.originalname,
    inputPath: req.file.path,
    options: optionsForUser(req),
  });
});

// POST /api/render  (JSON: sourceId + editedTranscript + options) → aplica a edição
// por transcrição ao vídeo já enviado e roda o restante do pipeline.
jobsRouter.post('/render', requireAuth, (req, res) => {
  const { sourceId, editedTranscript } = req.body || {};
  if (!sourceId) return res.status(400).json({ error: 'sourceId ausente' });
  const source = queue.get(sourceId);
  if (!source) return res.status(404).json({ error: 'transcrição de origem não encontrada' });
  if (!fs.existsSync(source.inputPath)) {
    return res.status(410).json({ error: 'o vídeo de origem expirou; reenvie' });
  }
  if (!editedTranscript?.segments?.length) {
    return res.status(400).json({ error: 'editedTranscript inválido' });
  }
  chargeAndQueue(req, res, 'render', {
    filename: source.filename,
    inputPath: source.inputPath,
    options: optionsForUser(req),
    editedTranscript,
  });
});

// POST /api/broll/plan  (JSON: sourceId + editedTranscript + options) → devolve os
// momentos de B-roll planejados COM candidatos (miniaturas) para o usuário revisar
// e trocar antes de renderizar. Não baixa nem renderiza nada.
jobsRouter.post('/broll/plan', requireAuth, async (req, res) => {
  try {
    const { sourceId, editedTranscript } = req.body || {};
    const source = sourceId && queue.get(sourceId);
    if (!source || !fs.existsSync(source.inputPath)) {
      return res.status(410).json({ error: 'o vídeo de origem expirou; reenvie' });
    }
    const transcript = editedTranscript?.segments?.length ? editedTranscript : source.report?.transcript;
    if (!transcript?.segments?.length) return res.status(400).json({ error: 'transcrição ausente' });

    const options = optionsForUser(req);
    const meta = await probeSummary(source.inputPath);
    const analysis = await analyze(transcript, meta, options);
    const moments = (analysis.brollMoments || []).slice(0, options.brollMax ?? 6);

    const orientation = (meta.height || 1920) >= (meta.width || 1080) ? 'portrait' : 'landscape';
    const apiKey = options.pexelsKey || config.broll.pexelsKey;
    const google = { key: config.broll.googleImagesKey, cx: config.broll.googleImagesCx, unrestricted: config.broll.googleImagesUnrestricted };
    const src = options.imageSource === 'mix' ? 'mix'
      : options.imageSource === 'google' && google.key && google.cx ? 'google'
        : options.imageSource === 'openverse' || !apiKey ? 'openverse' : 'pexels';

    const out = [];
    for (const m of moments) {
      const candidates = await brollCandidates(m.query, {
        source: src, apiKey, google, orientation,
        targetH: Math.round((meta.height || 1920) / (src === 'pexels' || src === 'mix' ? 1 : 2)),
        limit: 6, unrestricted: google.unrestricted,
      });
      out.push({ start: m.start, end: m.end, term: m.term || m.query, query: m.query, candidates });
    }
    res.json({ source: src, moments: out });
  } catch (err) {
    res.status(500).json({ error: err.message || 'falha ao planejar o B-roll' });
  }
});

// POST /api/media  (multipart: file) → sobe uma mídia própria (imagem/vídeo/música)
// para usar na timeline. Devolve { id, kind, filename, durationSec }.
jobsRouter.post('/media', requireAuth, uploadMedia.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  const ext = path.extname(req.file.filename).toLowerCase();
  const kind = mediaKind(ext);
  if (!kind) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'formato de mídia não suportado' });
  }
  let durationSec = null;
  if (kind !== 'image') {
    try {
      const meta = await probeSummary(req.file.path);
      durationSec = Number.isFinite(meta.duration) ? Math.round(meta.duration * 100) / 100 : null;
    } catch {
      durationSec = null;
    }
  }
  const id = path.parse(req.file.filename).name; // já é um nanoid gerado no storage
  const pub = registerMedia({
    id,
    filePath: req.file.path,
    kind,
    originalname: req.file.originalname,
    durationSec,
  });
  res.status(201).json(pub);
});

// (removido) GET /api/jobs — não expomos a listagem global de jobs: ela vazava os
// nomes de arquivo de todos os usuários. O acesso é por id (capability URL).

// GET /api/jobs/:id → status de um job
jobsRouter.get('/jobs/:id', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job não encontrado' });
  res.json(queue.public(job));
});

// GET /api/jobs/:id/events → SSE de progresso em tempo real
jobsRouter.get('/jobs/:id/events', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job não encontrado' });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send(queue.public(job));
  if (job.status === 'done' || job.status === 'error') return res.end();

  const onUpdate = (pub) => {
    if (pub.id !== job.id) return;
    send(pub);
    if (pub.status === 'done' || pub.status === 'error') {
      queue.off('update', onUpdate);
      res.end();
    }
  };
  queue.on('update', onUpdate);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    queue.off('update', onUpdate);
  });
});

// GET /api/jobs/:id/download → baixa o render final
jobsRouter.get('/jobs/:id/download', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job || job.status !== 'done' || job.mode === 'transcribe') {
    return res.status(404).json({ error: 'render não disponível' });
  }
  const file = path.join(config.paths.outputs, `${job.id}.mp4`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'arquivo não encontrado' });
  const base = path.parse(job.filename).name.replace(/[^\w.-]+/g, '_');
  res.download(file, `riseframe_${base}.mp4`);
});

// Clipes: download/preview por índice (outputs/<jobId>_clip<index>.mp4)
function clipFile(job, index) {
  const clip = job?.report?.clips?.find((c) => String(c.index) === String(index));
  if (!clip) return null;
  const file = path.join(config.paths.outputs, clip.file);
  return fs.existsSync(file) ? { file, clip } : null;
}

jobsRouter.get('/jobs/:id/clips/:index/download', (req, res) => {
  const job = queue.get(req.params.id);
  const found = job && job.status === 'done' ? clipFile(job, req.params.index) : null;
  if (!found) return res.status(404).json({ error: 'clipe não disponível' });
  const base = path.parse(job.filename).name.replace(/[^\w.-]+/g, '_');
  res.download(found.file, `riseframe_${base}_clipe${Number(req.params.index) + 1}.mp4`);
});

jobsRouter.get('/jobs/:id/clips/:index/preview', (req, res) => {
  const job = queue.get(req.params.id);
  const found = job && job.status === 'done' ? clipFile(job, req.params.index) : null;
  if (!found) return res.status(404).json({ error: 'clipe não disponível' });
  res.sendFile(found.file);
});

// GET /api/jobs/:id/preview → stream inline (para <video>)
jobsRouter.get('/jobs/:id/preview', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job || job.status !== 'done' || job.mode === 'transcribe') {
    return res.status(404).json({ error: 'preview não disponível' });
  }
  const file = path.join(config.paths.outputs, `${job.id}.mp4`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'arquivo não encontrado' });
  res.sendFile(file);
});

// GET /api/jobs/:id/source → stream do vídeo ORIGINAL enviado (para o editor/timeline
// pré-visualizar e sincronizar as legendas). Só existe enquanto o upload não expira.
const MIME_BY_EXT = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
  '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
};
// Miniaturas e forma de onda da timeline. Gerados uma vez com ffmpeg e guardados
// em data/cache (o TTL da limpeza leva junto). Um Map evita duas gerações do mesmo
// arquivo quando o cliente pede as duas faixas ao mesmo tempo.
const FRAMES = 120;
const inFlight = new Map();
function once(key, fn) {
  if (!inFlight.has(key)) inFlight.set(key, fn().finally(() => inFlight.delete(key)));
  return inFlight.get(key);
}

/** Job com o vídeo de origem ainda no disco, ou null. */
function sourceJob(id) {
  const job = queue.get(id);
  if (!job?.inputPath || !fs.existsSync(job.inputPath)) return null;
  return job;
}

async function buildFilmstrip(job, out) {
  const dur = Math.max(1, job.report?.input?.duration || (await probeSummary(job.inputPath)).duration || 1);
  await runFfmpeg(
    ['-y', '-i', job.inputPath, '-vf', `fps=${FRAMES}/${dur},scale=80:45:force_original_aspect_ratio=increase,crop=80:45,tile=${FRAMES}x1`, '-frames:v', '1', '-q:v', '6', out],
    { label: 'filmstrip' },
  );
}

async function buildPeaks(job, out) {
  const pcm = `${out}.pcm`;
  try {
    await runFfmpeg(['-y', '-i', job.inputPath, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', pcm], { label: 'peaks' });
    const buf = fs.readFileSync(pcm);
    const total = Math.floor(buf.length / 2);
    const buckets = 1200;
    const per = Math.max(1, Math.floor(total / buckets));
    const peaks = [];
    for (let b = 0; b < buckets && b * per < total; b++) {
      let max = 0;
      for (let i = b * per; i < Math.min((b + 1) * per, total); i++) {
        const v = Math.abs(buf.readInt16LE(i * 2));
        if (v > max) max = v;
      }
      peaks.push(max / 32768);
    }
    // Normaliza pelo pico do próprio áudio: gravação baixa também preenche a faixa.
    const loudest = Math.max(0.02, ...peaks);
    fs.writeFileSync(out, JSON.stringify({ peaks: peaks.map((v) => Math.round((v / loudest) * 100) / 100) }));
  } catch {
    fs.writeFileSync(out, JSON.stringify({ peaks: [] })); // vídeo sem áudio
  } finally {
    fs.rmSync(pcm, { force: true });
  }
}

// GET /api/jobs/:id/filmstrip → tira de miniaturas (JPEG) da faixa de vídeo
jobsRouter.get('/jobs/:id/filmstrip', async (req, res) => {
  const job = sourceJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'vídeo de origem indisponível' });
  const out = path.join(config.paths.cache, `${job.id}.strip.jpg`);
  try {
    if (!fs.existsSync(out)) await once(out, () => buildFilmstrip(job, out));
    res.type('image/jpeg').sendFile(path.resolve(out));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id/peaks → picos de áudio normalizados (0..1) da forma de onda
jobsRouter.get('/jobs/:id/peaks', async (req, res) => {
  const job = sourceJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'vídeo de origem indisponível' });
  const out = path.join(config.paths.cache, `${job.id}.peaks.json`);
  try {
    if (!fs.existsSync(out)) await once(out, () => buildPeaks(job, out));
    res.type('application/json').send(fs.readFileSync(out, 'utf8'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id/color-frame?t=&look=&b=&c=&s=&tp= → um quadro do vídeo original com
// EXATAMENTE a mesma cadeia de cor do render final (look + ajuste manual). A prévia de cor
// no navegador é aproximada; esta imagem é a referência fiel. (Público como /source: o id
// do job não é adivinhável e a <img> não manda cabeçalho.)
const autoGradeCache = new Map(); // id → vf do grade automático (a análise lê o vídeo todo)
const sourceMetaCache = new Map(); // id → metadados do vídeo original (HDR?)
jobsRouter.get('/jobs/:id/color-frame', async (req, res) => {
  try {
    const job = queue.get(req.params.id);
    if (!job?.inputPath || !fs.existsSync(job.inputPath)) return res.status(404).json({ error: 'vídeo não encontrado' });
    const look = ALLOWED_LOOKS.has(String(req.query.look)) ? String(req.query.look) : 'auto';
    const adj = sanitizeColorAdjust({ brightness: req.query.b, contrast: req.query.c, saturation: req.query.s, temperature: req.query.tp });
    const t = Math.max(0, Math.min(100000, Number(req.query.t) || 0));

    let vf;
    if (look === 'auto') {
      if (!autoGradeCache.has(job.id)) autoGradeCache.set(job.id, (await analyzeAndGrade(job.inputPath)).vf);
      vf = fastColorChain([autoGradeCache.get(job.id), manualAdjustVf(adj)].filter(Boolean).join(','));
    } else {
      vf = (await colorFilter(job.inputPath, { colorLook: look, colorAdjust: adj })).vf;
    }

    // Vídeo HDR (iPhone): mesma conversão para cor normal que o render faz no início.
    if (!sourceMetaCache.has(job.id)) sourceMetaCache.set(job.id, await probeSummary(job.inputPath));
    const toSdr = sdrVf(sourceMetaCache.get(job.id));
    if (toSdr) vf = [toSdr, vf].filter(Boolean).join(',');

    const dir = path.join(config.paths.cache, 'colorframes');
    fs.mkdirSync(dir, { recursive: true });
    const key = `${job.id}_${Math.round(t * 10)}_${look}_${adj.brightness}_${adj.contrast}_${adj.saturation}_${adj.temperature}`;
    const out = path.join(dir, `${key.replace(/[^A-Za-z0-9_-]/g, '')}.jpg`);
    if (!fs.existsSync(out)) {
      await runFfmpeg([
        '-ss', t.toFixed(2), '-i', job.inputPath, '-frames:v', '1',
        '-vf', [vf, 'scale=-2:720'].filter(Boolean).join(','),
        '-q:v', '4', '-y', out,
      ], { label: 'color-frame' });
    }
    res.set('Cache-Control', 'private, max-age=600');
    res.type('image/jpeg').sendFile(path.resolve(out));
  } catch (err) {
    res.status(500).json({ error: err.message || 'falha na prévia de cor' });
  }
});

jobsRouter.get('/jobs/:id/source', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job não encontrado' });
  if (!job.inputPath || !fs.existsSync(job.inputPath)) {
    return res.status(410).json({ error: 'o vídeo de origem expirou' });
  }
  const ext = path.extname(job.inputPath).toLowerCase();
  res.type(MIME_BY_EXT[ext] || 'application/octet-stream');
  res.sendFile(path.resolve(job.inputPath)); // sendFile suporta Range (scrubbing)
});
