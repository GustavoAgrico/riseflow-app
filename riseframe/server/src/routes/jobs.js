import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { queue } from '../queue.js';
import { requireAuth, requireVerified } from './auth.js';
import { getSettings } from '../auth/settings.js';
import { billingStatus, canAfford, charge, refund, allowedFeatures, currentPeriod, trialCovers, useFreeEdit, refundFreeEdit, holdRemote, releaseRemote, appAccess, hadTrial } from '../auth/billing.js';
import { remoteAccount, remoteCheck, remoteCharge, holdRemoteCharge, settleRemoteCharge, sendAccountError, rememberJobToken, accountFetch } from '../account.js';
import { creditItems, creditTotal, lockedItems, cheapestPlanFor } from '../../../shared/credits.js';
import { registerMedia, resolveMedia, relinkMedia, mediaStatus, listLibrary, removeFromLibrary } from '../mediaStore.js';
import { formatBytes, freeDiskBytes } from '../storage.js';
import { startUpload, uploadStatus, receiveChunk, fromChunkedUpload } from '../chunkedUpload.js';
import { saveCustomFont, listCustomFonts, resolveCustomFont, deleteCustomFont } from '../customFonts.js';
import { probeSummary, runFfmpeg, sdrVf } from '../pipeline/ffmpeg.js';
import { analyze } from '../pipeline/analyze.js';
import { remuxByKeepSegments, remapTranscript, snapKeep } from '../pipeline/timeline.js';
import { markFillers } from '../pipeline/cleanup.js';
import { preciseRemovals, audioAnalysis, detectNoises } from '../pipeline/cutRefine.js';
import { CLIP_GOALS } from '../pipeline/clipSelect.js';
import { sanitizeHeadline, sanitizeCover, makeCover } from '../pipeline/headline.js';
import { outputTarget } from '../pipeline/render.js';
import { brollCandidates, resolveSource, googleConfig, googleReady } from '../pipeline/broll.js';
import { freesoundKey, searchFreesound, okSfxUrl, onlineSfxFile } from '../pipeline/sfxOnline.js';
import { sanitizeColorAdjust, colorFilter, manualAdjustVf, fastColorChain } from '../pipeline/color.js';
import { analyzeAndGrade } from '../pipeline/autoColor.js';
import { CAPTION_TEMPLATES, CAPTION_FONTS } from '../pipeline/captions.js';
import { isCaptionColor, HIGHLIGHT_IDS, isFontStyle } from '../../../shared/captionStyle.js';
import { VOICE_NOISE, VOICE_PRESETS, VOICE_EFFECTS, previewVoice } from '../pipeline/voice.js';

const CAPTION_TEMPLATE_IDS = Object.keys(CAPTION_TEMPLATES);
import { CAPTION_LANGUAGES } from '../pipeline/translate.js';
import { MOMENT_EFFECTS, cleanKeys } from '../../../shared/transform.js';
import { cleanTextLayers, cleanFxMoments } from '../../../shared/textLayers.js';
import { cleanExtraCaptions } from '../../../shared/extraCaptions.js';
import { brandIn, entityQuery } from '../pipeline/entities.js';
import { LAYER_ANIMATIONS, BLEND_MODES } from '../pipeline/overlay.js';
import { cleanCrop, cleanCropRanges, cleanBlanks } from '../pipeline/frame.js';
import { transcribeRange } from '../pipeline/seqTranscript.js';
import { editSourceStatus, editSourcePath } from '../pipeline/editSource.js';
import { cleanLayerKf, cleanVolKeys } from '../../../shared/layerKeys.js';
import { SFX_LIBRARY } from '../pipeline/sfx.js';
import { TRANSITIONS, TRANSITION_TARGETS } from '../pipeline/transitions.js';

/** Tipo de SFX válido da biblioteca, 'none' ou o padrão. */
const sfxType = (v, def) => (v === 'none' || Object.hasOwn(SFX_LIBRARY, v) ? v : def);

/** Opções do job com as chaves salvas do usuário (Pexels/Anthropic) — o servidor manda. */
/**
 * Nome do arquivo com acento: o navegador manda em UTF-8, mas o multer lê como latin1
 * ("CrianÃ§a", "vocÃª"). Se o nome volta a ser UTF-8 válido, usa a versão corrigida.
 */
export function fixName(name) {
  const s = String(name || '');
  if (!/[\u0080-\u00ff]/.test(s) || /[^\u0000-\u00ff]/.test(s)) return s;
  const fixed = Buffer.from(s, 'latin1').toString('utf8');
  return fixed.includes('\ufffd') ? s : fixed;
}

function optionsForUser(req) {
  const o = parseOptions(req.body?.options);
  // Fonte própria: só a do próprio usuário (o cliente nunca manda caminho).
  if (String(o.captionFont).startsWith('custom:')) {
    const f = resolveCustomFont(req.user.id, o.captionFont.slice(7));
    if (f) {
      o.captionFontFile = f.path;
      o.captionFontFamily = f.family;
    } else o.captionFont = 'auto';
  }
  // Textos com fonte própria: o arquivo dela (só do próprio usuário) vai junto para o render
  for (const l of Array.isArray(o.textLayers) ? o.textLayers : []) {
    if (!String(l.font).startsWith('custom:')) continue;
    const f = resolveCustomFont(req.user.id, l.font.slice(7));
    if (f) { l.fontFile = f.path; l.fontFamily = f.family; } else l.font = 'poppins';
  }
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
  // Logo do Brand Kit: só vale se a mídia existe e é imagem.
  if (o.watermark) {
    const found = resolveMedia(o.watermark.mediaId);
    o.watermark = found && found.kind === 'image' ? { ...o.watermark, file: found.path } : null;
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

/** Corpo da recusa (403) quando o job usa recurso que o plano do usuário não libera. */
function planBlockBody(locked) {
  const plan = cheapestPlanFor(locked[0].id, config.billing.plans) || 'superior';
  return {
    code: 'PLAN_REQUIRED',
    locked: locked.map((i) => i.id),
    error: `${locked.map((i) => i.label).join(', ')}: disponível a partir do plano ${plan}. Veja em Planos, no menu, ou desligue o recurso.`,
  };
}

/** Corpo da recusa (402) por falta de créditos. */
function noCreditsBody(user, cost) {
  const { credits, plan, freeEditsTotal } = billingStatus(user);
  return {
    code: 'PAYMENT_REQUIRED',
    cost,
    credits,
    error: !plan && !credits && freeEditsTotal
      ? `Suas ${freeEditsTotal} edições grátis acabaram. Para continuar, assine um plano em Planos, no menu.`
      : `Este vídeo custa ${cost} créditos e você tem ${credits}. Assine um plano ou faça uma recarga em Planos, no menu.`,
  };
}

/**
 * Pré-checagem (antes de receber o vídeo): recurso fora do plano ou sem saldo nem para
 * o mínimo. → null se pode seguir, ou { status, body } da recusa.
 */
function precheck(user, mode) {
  if (trialCovers(user, mode)) return null; // edição grátis de teste
  const items = creditItems(mode, {}, config.billing.costs);
  const locked = lockedItems(items, allowedFeatures(user));
  if (locked.length) return { status: 403, body: planBlockBody(locked) };
  const min = creditTotal(items);
  return canAfford(user, min) ? null : { status: 402, body: noCreditsBody(user, min) };
}

/**
 * Decide e faz a cobrança do job. → { ok: true, trial } | { ok: true, charged, until } |
 * { ok: false, status, body }. Usado pelos jobs daqui e pelos do app de PC/Mac
 * (POST /billing/remote/charge).
 */
function gateCharge(user, mode, options, sourceId) {
  if (trialCovers(user, mode, sourceId)) return { ok: true, trial: true };
  const items = creditItems(mode, options, config.billing.costs);
  const locked = lockedItems(items, allowedFeatures(user));
  if (locked.length) return { ok: false, status: 403, body: planBlockBody(locked) };
  const cost = creditTotal(items);
  const until = currentPeriod(user.id);
  const charged = charge(user, cost);
  if (charged === null) return { ok: false, status: 402, body: noCreditsBody(user, cost) };
  return { ok: true, charged, until };
}

// Checagem antes do multer: recurso fora do plano (ex.: clipes) ou sem saldo nem para o
// mínimo → recusa sem receber o upload. App de PC/Mac: quem decide é a conta do site.
function requireCredits(mode) {
  return (req, res, next) => {
    if (remoteAccount()) {
      return remoteCheck(req, mode).then(() => next(), (err) => sendAccountError(res, err));
    }
    const no = precheck(req.user, mode);
    if (no) return res.status(no.status).json(no.body);
    next();
  };
}

// Créditos cobrados por job ainda em andamento: devolvidos se o processamento falhar.
const heldCredits = new Map();
// Jobs que usaram uma edição grátis: devolvida se o processamento falhar.
const heldTrial = new Map();
queue.on('update', (j) => {
  const t = heldTrial.get(j.id);
  if (t && (j.status === 'error' || j.status === 'done')) {
    heldTrial.delete(j.id);
    if (j.status === 'error') refundFreeEdit(t, j.id);
  }
});

queue.on('update', (j) => {
  const held = heldCredits.get(j.id);
  if (!held || (j.status !== 'error' && j.status !== 'done')) return;
  heldCredits.delete(j.id);
  if (j.status === 'error') refund(held.userId, held);
});

// Job que voltou para a fila depois de um reinício do servidor: a cobrança guardada vale
// de novo (devolve se falhar). Se não deu para retomar, já devolve agora.
queue.on('restored', (j) => {
  if (j.hold?.credits) {
    if (j.status === 'error') refund(j.hold.credits.userId, j.hold.credits);
    else heldCredits.set(j.id, j.hold.credits);
  }
  if (j.hold?.trial) {
    if (j.status === 'error') refundFreeEdit(j.hold.trial, j.id);
    else heldTrial.set(j.id, j.hold.trial);
  }
});

// App de PC/Mac: job que falhou devolve a cobrança feita na conta do site.
queue.on('update', (j) => { settleRemoteCharge(j); });

/** Só o que entra no preço (sem chaves de API nem caminhos de arquivo) — vai para o site. */
function pricingOptions(o = {}) {
  return {
    captions: o.captions,
    captionTemplate: o.captionTemplate,
    autoClean: o.autoClean,
    broll: o.broll,
    brollMax: o.brollMax,
    brollPlan: Array.isArray(o.brollPlan) ? o.brollPlan.map((p) => ({ remove: Boolean(p?.remove) })) : undefined,
  };
}

/** Cobra o job e cria na fila; responde 402 (e apaga o upload) se faltar saldo. */
function chargeAndQueue(req, res, mode, jobInput, { sourceId } = {}) {
  // arquivo original do computador (app de PC) nunca é apagado — só cópias enviadas
  const dropUpload = () => req.file && !req.file.linked && fs.unlink(req.file.path, () => {});
  if (remoteAccount()) {
    // App de PC/Mac: cobra na conta do site; o vídeo é processado aqui.
    const id = nanoid(12);
    return remoteCharge(req, { mode, options: pricingOptions(jobInput.options), sourceId, jobId: id }).then(
      (r) => {
        const job = queue.create({ id, mode, ...jobInput, ownerId: req.user?.id || null });
        holdRemoteCharge(job.id, req, r.chargeId);
        rememberJobToken(job.id, req); // transcrição pela conta do site, se precisar
        res.status(201).json({ ...queue.public(job), creditsCharged: r.creditsCharged || 0, ...(r.freeEdit ? { freeEdit: true, freeEditsLeft: r.freeEditsLeft } : {}) });
      },
      (err) => {
        dropUpload();
        sendAccountError(res, err);
      },
    );
  }
  const g = gateCharge(req.user, mode, jobInput.options, sourceId);
  if (!g.ok) {
    dropUpload();
    return res.status(g.status).json(g.body);
  }
  const job = queue.create({ mode, ...jobInput, ownerId: req.user?.id || null });
  // Edição grátis de teste: todos os recursos, sem gastar créditos.
  if (g.trial) {
    let freeEditsLeft = billingStatus(req.user).freeEdits;
    if (mode !== 'render') {
      freeEditsLeft = useFreeEdit(req.user.id, job.id);
      heldTrial.set(job.id, req.user.id);
      queue.setHold(job.id, { trial: req.user.id });
    }
    return res.status(201).json({ ...queue.public(job), creditsCharged: 0, freeEdit: true, freeEditsLeft });
  }
  if (g.charged.total) {
    const held = { userId: req.user.id, monthly: g.charged.monthly, extra: g.charged.extra, until: g.until };
    heldCredits.set(job.id, held);
    queue.setHold(job.id, { credits: held });
  }
  res.status(201).json({ ...queue.public(job), creditsCharged: g.charged.total });
}

// ── Cobrança dos apps de PC/Mac (conta central) ──
// O app processa o vídeo no computador do usuário e cobra aqui, na conta do site.
const REMOTE_MODES = ['auto', 'transcribe', 'clips', 'render'];
const validMode = (m) => (REMOTE_MODES.includes(m) ? m : null);

// App de PC/Mac: teste grátis e depois só com plano mensal ativo (BILLING_APP_REQUIRES_PLAN).
// Os vídeos do teste continuam renderizando (e usando as APIs) mesmo depois do teste.
function requireAppPlan(req, res, next) {
  if (appAccess(req.user)) return next();
  const { mode, sourceId } = req.body || {};
  const billingRoute = req.path.startsWith('/billing/');
  if (billingRoute ? mode === 'render' && trialCovers(req.user, 'render', sourceId) : hadTrial(req.user)) return next();
  res.status(402).json({
    code: 'PAYMENT_REQUIRED',
    appPlanRequired: true,
    error: 'Seu teste grátis acabou. O app de computador é liberado com um plano mensal ativo — assine ou renove em Planos para continuar.',
  });
}

// POST /api/billing/remote/check { mode } → { ok } | 402/403 (mesmo corpo do site)
jobsRouter.post('/billing/remote/check', requireAuth, requireVerified, requireAppPlan, (req, res) => {
  const mode = validMode(req.body?.mode);
  if (!mode) return res.status(400).json({ error: 'modo inválido' });
  const no = precheck(req.user, mode);
  if (no) return res.status(no.status).json(no.body);
  res.json({ ok: true });
});

// POST /api/billing/remote/charge { mode, options, sourceId, jobId } → { chargeId, creditsCharged, freeEdit, freeEditsLeft }
jobsRouter.post('/billing/remote/charge', requireAuth, requireVerified, requireAppPlan, (req, res) => {
  const { sourceId, jobId } = req.body || {};
  const mode = validMode(req.body?.mode);
  if (!mode) return res.status(400).json({ error: 'modo inválido' });
  if (!/^[\w-]{6,40}$/.test(String(jobId || ''))) return res.status(400).json({ error: 'jobId inválido' });
  const src = /^[\w-]{6,40}$/.test(String(sourceId || '')) ? sourceId : undefined;
  const g = gateCharge(req.user, mode, parseOptions(req.body?.options), src);
  if (!g.ok) return res.status(g.status).json(g.body);
  if (g.trial) {
    if (mode === 'render') return res.json({ chargeId: null, creditsCharged: 0, freeEdit: true, freeEditsLeft: billingStatus(req.user).freeEdits });
    const freeEditsLeft = useFreeEdit(req.user.id, jobId);
    return res.json({ chargeId: holdRemote(req.user.id, { trial: true, jobId }), creditsCharged: 0, freeEdit: true, freeEditsLeft });
  }
  const chargeId = g.charged.total
    ? holdRemote(req.user.id, { monthly: g.charged.monthly, extra: g.charged.extra, until: g.until, jobId })
    : null;
  res.json({ chargeId, creditsCharged: g.charged.total });
});

// POST /api/billing/remote/refund { chargeId } → devolve a cobrança de um job que falhou
jobsRouter.post('/billing/remote/refund', requireAuth, (req, res) => {
  const hold = releaseRemote(req.user.id, String(req.body?.chargeId || ''));
  if (!hold) return res.status(404).json({ error: 'cobrança não encontrada, expirada ou limite de devoluções do dia' });
  if (hold.trial) refundFreeEdit(req.user.id, hold.jobId);
  else refund(req.user.id, hold);
  res.json({ ok: true });
});

// Antes de receber o vídeo: recusa na hora o que passa do limite ou não cabe no disco
// (em vez de o usuário esperar horas de upload para descobrir no fim).
const DISK_MARGIN = 2 * 1024 ** 3; // folga para os arquivos intermediários começarem
function checkUploadSize(req, res, next) {
  const size = Number(req.headers['content-length']) || 0;
  if (config.maxUploadBytes && size > config.maxUploadBytes + 1024 ** 2) {
    return res.status(413).json({ error: `arquivo maior que o limite (${formatBytes(config.maxUploadBytes)})` });
  }
  if (!size) return next();
  freeDiskBytes(config.paths.uploads).then((free) => {
    if (free !== null && size + DISK_MARGIN > free) {
      return res.status(507).json({
        error: `sem espaço em disco para este vídeo (${formatBytes(size)}; livre: ${formatBytes(free)}). Libere espaço e tente de novo.`,
      });
    }
    next();
  }, () => next());
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
  limits: config.maxUploadBytes ? { fileSize: config.maxUploadBytes } : {},
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
  limits: config.maxUploadBytes ? { fileSize: config.maxUploadBytes } : {},
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

/** Velocidade do vídeo: 0,5× a 2×, em passos de 0,05 (1 = normal). Exportado para teste. */
export function speedOf(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.round(Math.max(0.5, Math.min(2, n)) * 20) / 20;
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
      scale: clampNum(m.scale, 0.05, 3, 0.4),
      // Posição livre (centro em fração da tela), quando a mídia foi arrastada no editor.
      ...(Number.isFinite(Number(m.cx)) && Number.isFinite(Number(m.cy)) ? { cx: clampNum(m.cx, -1, 2, 0.5), cy: clampNum(m.cy, -1, 2, 0.5) } : {}),
      opacity: clampNum(m.opacity, 0.1, 1, 1),
      volume: clampNum(m.volume, 0, 2, 0.35),
      // Animação de entrada/saída e mesclagem da camada (ver overlay.js).
      animIn: Object.hasOwn(LAYER_ANIMATIONS, m.animIn) ? m.animIn : 'none',
      animOut: Object.hasOwn(LAYER_ANIMATIONS, m.animOut) ? m.animOut : 'none',
      animDur: clampNum(m.animDur, 0.15, 2, 0.4),
      blend: Object.hasOwn(BLEND_MODES, m.blend) ? m.blend : 'normal',
      // Camada (0 = mais embaixo) e ponto de início no arquivo (aparar/dividir).
      layer: Math.round(clampNum(m.layer, 0, 20, 0)),
      // Entrada/saída suave da música (segundos).
      fadeIn: clampNum(m.fadeIn, 0, 10, 0),
      fadeOut: clampNum(m.fadeOut, 0, 10, 0),
      offset: clampNum(m.offset, 0, 100000, 0),
      // Vídeo: som ligado/desligado. Imagem/vídeo: brilho, contraste, saturação, espelhar.
      muted: m.muted === true,
      bright: clampNum(m.bright, -0.5, 0.5, 0),
      contrast: clampNum(m.contrast, 0.5, 2, 1),
      sat: clampNum(m.sat, 0, 2, 1),
      flip: m.flip === true,
      // Propriedades: giro (graus) e recorte de cada lado (fração), como no Premiere.
      ...(Math.abs(Number(m.rot) || 0) > 0.05 ? { rot: clampNum(m.rot, -180, 180, 0) } : {}),
      ...(cleanCrop(m.crop) ? { crop: cleanCrop(m.crop) } : {}),
      // Quadros-chave (Propriedades): posição, escala, giro e opacidade ao longo do tempo.
      ...(cleanLayerKf(m.kf) ? { kf: cleanLayerKf(m.kf) } : {}),
      // V0: por baixo do vídeo principal (aparece onde ele não cobre: diminuído, recortado, vazio)
      ...(m.under === true && kind !== 'audio' ? { under: true } : {}),
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
    if (Object.hasOwn(MOMENT_EFFECTS, m.effect)) item.effect = m.effect; // efeito próprio do momento
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
      // Crédito (autor/licença) da imagem do banco — vai para o relatório do vídeo.
      credit: typeof p.credit === 'string' ? p.credit.replace(/[<>]/g, '').slice(0, 140) : null,
    };
    // URL do banco: só http(s) de imagem/vídeo (o download roda no pipeline).
    if (typeof p.url === 'string' && /^https:\/\/[^\s]+$/i.test(p.url)) item.url = p.url;
    // Miniatura: reserva quando o site da imagem original recusa o download.
    if (typeof p.thumb === 'string' && /^https:\/\/[^\s]+$/i.test(p.thumb)) item.thumb = p.thumb;
    if (typeof p.mediaId === 'string' && p.mediaId) item.mediaId = p.mediaId;
    // Ajuste do quadro do B-roll: zoom 1–2.5 e ponto de foco X/Y (0–1) dentro da imagem.
    // Logo de marca: entra inteiro e centralizado (sem cortar para preencher).
    if (p.logo === true) item.logo = true;
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

export function parseOptions(raw) {
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
    // Tratamento da voz: remoção de ruído, equalização (preset), chiado do S; e modificadores.
    voiceNoise: Object.keys(VOICE_NOISE).includes(o.voiceNoise) ? o.voiceNoise : (['suave', 'medio', 'forte'].includes(o.voiceIntensity) ? o.voiceIntensity : 'medio'),
    voicePreset: Object.keys(VOICE_PRESETS).includes(o.voicePreset) ? o.voicePreset : 'natural',
    voiceDeEss: o.voiceDeEss !== false,
    voiceEffect: Object.keys(VOICE_EFFECTS).includes(o.voiceEffect) ? o.voiceEffect : 'none',
    voicePitch: Math.round(clampNum(o.voicePitch, -8, 8, 0)),
    // Som de tecla da legenda: 'ritmo' (frases alternadas, como digitação) ou 'todas' as palavras.
    captionKeys: o.captionKeys === 'todas' ? 'todas' : 'ritmo',
    autoClean: o.autoClean === true, // corta muletas/hesitações e gagueiras da fala
    soundEffects: o.soundEffects === true, // pop na legenda + whoosh no B-roll
    sfxIntensity: ['suave', 'medio', 'forte'].includes(o.sfxIntensity) ? o.sfxIntensity : 'medio',
    captions: o.captions !== false,
    captionTemplate: CAPTION_TEMPLATE_IDS.includes(o.captionTemplate) ? o.captionTemplate : 'clean',
    // cor da paleta ou livre ("#RRGGBB")
    captionColor: isCaptionColor(o.captionColor) ? String(o.captionColor) : 'white',
    // fonte embutida, ou "custom:<id>" = fonte própria do usuário (resolvida em optionsForUser)
    captionFont: o.captionFont === 'auto' || CAPTION_FONTS[o.captionFont] || /^custom:[A-Za-z0-9_-]{8,24}$/.test(String(o.captionFont || '')) ? o.captionFont : 'auto',
    captionAnimation: ['auto', 'fade', 'pop', 'bounce', 'zoom', 'pop-rot', 'shake', 'none'].includes(o.captionAnimation) ? o.captionAnimation : 'auto',
    captionBackground: ['auto', 'shadow', 'box', 'bar', 'glow', 'none', 'clean'].includes(o.captionBackground) ? o.captionBackground : 'auto',
    captionPosition: ['auto', 'top', 'center', 'bottom'].includes(o.captionPosition) ? o.captionPosition : 'auto',
    // Estilo da fonte (arquivo próprio: Regular, Itálico, Negrito, Black…), itálico
    // inclinado, sublinhado e maiúsculas/minúsculas (como os botões do Premiere).
    captionFontStyle: typeof o.captionFontStyle === 'string' && o.captionFontStyle && isFontStyle(o.captionFont, o.captionFontStyle) ? o.captionFontStyle : '',
    captionItalic: o.captionItalic === true || o.captionItalic === 'true',
    captionUnderline: o.captionUnderline === true || o.captionUnderline === 'true',
    captionCase: ['auto', 'upper', 'lower', 'normal'].includes(o.captionCase) ? o.captionCase : 'auto',
    // Espaçamento entre as letras (em) e sombra das letras (do estilo | sem | personalizada).
    captionSpacing: clampNum(o.captionSpacing, -0.05, 0.3, 0),
    captionShadow: ['auto', 'off', 'on'].includes(o.captionShadow) ? o.captionShadow : 'auto',
    captionShadowSize: clampNum(o.captionShadowSize, 0.3, 3, 1),
    captionShadowOpacity: clampNum(o.captionShadowOpacity, 0, 1, 0.6),
    // sombra projetada (como no Photoshop): mesclagem, cor, ângulo, distância, expansão, tamanho
    captionShadowBlend: ['multiply', 'normal'].includes(o.captionShadowBlend) ? o.captionShadowBlend : 'multiply',
    captionShadowColor: /^#?[0-9a-f]{6}$/i.test(String(o.captionShadowColor || '')) ? String(o.captionShadowColor).replace('#', '') : '000000',
    ...(o.captionShadowAngle != null || o.captionShadowDistance != null ? {
      captionShadowAngle: clampNum(o.captionShadowAngle, -360, 360, 135),
      captionShadowDistance: clampNum(o.captionShadowDistance, 0, 200, 6),
      captionShadowSpread: clampNum(o.captionShadowSpread, 0, 100, 0),
      captionShadowBlur: clampNum(o.captionShadowBlur, 0, 100, 6),
    } : {}),
    // Como o "Criar legendas" do Premiere: duração mínima na tela, intervalo entre
    // legendas (s) e remover pontuação.
    captionMinDuration: clampNum(o.captionMinDuration, 0, 5, 0),
    captionGap: clampNum(o.captionGap, 0, 0.5, 0),
    captionNoPunct: o.captionNoPunct === true || o.captionNoPunct === 'true',
    // Tela dividida com B-roll: a legenda vai para o meio (na linha entre as metades).
    captionBrollCenter: o.captionBrollCenter !== false && o.captionBrollCenter !== 'false',
    // Área segura das redes no vídeo vertical: legenda fora dos botões/descrição do Reels e TikTok.
    captionSafeZone: o.captionSafeZone !== false && o.captionSafeZone !== 'false',
    // Modo de exibição: auto (do estilo) | word (palavra por vez) | phrase (frase inteira).
    captionMode: ['auto', 'word', 'phrase'].includes(o.captionMode) ? o.captionMode : 'auto',
    // Destacar a palavra falada na frase (padrão: legenda normal, sem destaque).
    captionHighlight: o.captionHighlight === true,
    // como a palavra falada é destacada (auto = o do estilo)
    captionHighlightStyle: HIGHLIGHT_IDS.includes(o.captionHighlightStyle) ? o.captionHighlightStyle : 'auto',
    captionScale: clampNum(o.captionScale, 0.3, 1.6, 1), // 30% a 160%
    // Linhas por legenda (1 ou 2) e caracteres por linha (0 = automático pelo tamanho da fonte).
    captionLines: Number(o.captionLines) === 1 ? 1 : 2,
    captionMaxChars: Number(o.captionMaxChars) > 0 ? Math.round(clampNum(o.captionMaxChars, 8, 42, 0)) : 0,
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
    // Fonte das imagens de B-roll: pexels | pixabay | wikimedia | google | mix (tudo).
    imageSource: ['pexels', 'pixabay', 'wikimedia', 'google', 'mix'].includes(o.imageSource) ? o.imageSource : 'mix',
    // Título fixo no vídeo e capa (quadro + título em JPG; opcional no início do vídeo).
    headline: sanitizeHeadline(o.headline),
    cover: sanitizeCover(o.cover),
    niche: ['auto', 'leadership', 'mentor', 'medical', 'fitness', 'finance', 'business', 'marketing', 'education', 'tech', 'mindset', 'law', 'realestate'].includes(o.niche) ? o.niche : 'auto',
    // Chave do Pexels vinda da interface (opcional). Sanitiza: só o formato esperado
    // (alfanumérico, 20–80 chars) é aceito; qualquer outra coisa é descartada.
    pexelsKey: typeof o.pexelsKey === 'string' && /^[A-Za-z0-9]{20,80}$/.test(o.pexelsKey.trim()) ? o.pexelsKey.trim() : '',
    brollEverySec: clampNum(o.brollEverySec, 4, 30, 8),
    brollMax: clampNum(o.brollMax, 1, 12, 6),
    brollPlan: sanitizeBrollPlan(o.brollPlan),
    zoomMoments: sanitizeZoomMoments(o.zoomMoments),
    // Quadros-chave do Transformar (escala, posição, giro) — tempo original.
    transformKeys: cleanKeys(o.transformKeys),
    // Efeitos de vídeo nos momentos e textos livres (tempo original).
    fxMoments: cleanFxMoments(o.fxMoments),
    textLayers: cleanTextLayers(o.textLayers, Object.keys(CAPTION_FONTS)),
    // Legendas adicionadas à mão na timeline (tempo original), no estilo das automáticas.
    extraCaptions: cleanExtraCaptions(o.extraCaptions),
    // ── Restaurados (tinham sumido numa atualização e o servidor descartava: cortes da
    // timeline, volume, formato, força do corte de silêncio, clipes e minhas mídias).
    // Volume da fala: geral, mudo e trechos com volume próprio (tempo original).
    audioMute: o.audioMute === true,
    // Respirações entre as frases saem junto com as pausas (padrão: ligado).
    cutBreaths: o.cutBreaths !== false,
    // Tosse, pigarro e estalos de boca nos vãos entre as palavras saem (padrão: ligado).
    cutCoughs: o.cutCoughs !== false,
    // Velocidade do vídeo final (0,5× a 2×), aplicada no render final — fala sem mudar o tom.
    speed: speedOf(o.speed),
    // Qualidade de exportação (Premium): 720p, 1080p ou 4K (lado menor do quadro).
    quality: ['720', '1080', '2160'].includes(String(o.quality)) ? String(o.quality) : 'original',
    // Quadros por segundo da exportação (0 = o do vídeo gravado): 24, 25, 30, 50, 60 ou 120.
    ...([24, 25, 30, 50, 60, 120].includes(Number(o.fps)) ? { fps: Number(o.fps) } : {}),
    ...(['video', 'audio'].includes(o.streams) ? { streams: o.streams } : {}),
    audioVolume: clampNum(o.audioVolume, 0, 4, 1),
    ...(cleanVolKeys(o.audioVolKeys).length ? { audioVolKeys: cleanVolKeys(o.audioVolKeys) } : {}),
    // Recorte (Crop) do vídeo principal: quanto sai de cada lado (fração).
    ...(cleanCrop(o.videoCrop) ? { videoCrop: cleanCrop(o.videoCrop) } : {}),
    ...(cleanCropRanges(o.cropRanges).length ? { cropRanges: cleanCropRanges(o.cropRanges) } : {}),
    // Espaços vazios no vídeo principal (Excluir sem fechar o buraco), tempo original.
    ...(cleanBlanks(o.videoBlanks).length ? { videoBlanks: cleanBlanks(o.videoBlanks) } : {}),
    // espaço vazio antes do vídeo principal / depois do fim (timeline): segundos de preto
    ...(clampNum(o.padStart, 0, 3600, 0) > 0 ? { padStart: clampNum(o.padStart, 0, 3600, 0) } : {}),
    ...(clampNum(o.padEnd, 0, 3600, 0) > 0 ? { padEnd: clampNum(o.padEnd, 0, 3600, 0) } : {}),
    ...(Array.isArray(o.padGaps) && o.padGaps.length ? { padGaps: o.padGaps.slice(0, 60).map((g) => ({ at: clampNum(g?.at, 0, 100000, 0), dur: clampNum(g?.dur, 0, 3600, 0) })).filter((g) => g.at > 0 && g.dur > 0.01) } : {}),
    // clipes ainda sem transcrição: ali nada sai como pausa/silêncio
    ...(cleanBlanks(o.noCutRanges).length ? { noCutRanges: cleanBlanks(o.noCutRanges).map(({ start, end }) => ({ start, end })) } : {}),
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
    // Como o vídeo entra no formato: segue o rosto/quem fala (auto), ponto escolhido (manual), inteiro com fundo desfocado (fit) ou tela dividida com duas pessoas (split).
    reframeMode: ['auto', 'manual', 'fit', 'split'].includes(o.reframeMode) ? o.reframeMode : 'auto',
    splitSwap: o.splitSwap === true || o.splitSwap === 'true',
    // Posição livre da legenda (arrastada na prévia), 0–1 no quadro final; vazia = a do estilo.
    captionX: Number.isFinite(Number(o.captionX)) && o.captionX !== null && o.captionX !== '' ? clampNum(o.captionX, 0, 1, undefined) : undefined,
    captionY: Number.isFinite(Number(o.captionY)) && o.captionY !== null && o.captionY !== '' ? clampNum(o.captionY, 0, 1, undefined) : undefined,
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
    // Pausas que o usuário escolheu MANTER na timeline: os outros silêncios que o detector
    // achar (a transcrição às vezes "estica" as palavras e esconde a pausa) também saem.
    keptPauses: Array.isArray(o.keptPauses) ? sanitizeSilenceCuts(o.keptPauses) : null,
    // Tosses/sons soltos nas pausas que o usuário restaurou na timeline (ficam no vídeo).
    keptNoises: sanitizeSilenceCuts(o.keptNoises),
    // Trechos cortados à mão na faixa de vídeo (tempo original), independentes do silêncio.
    videoCuts: sanitizeSilenceCuts(o.videoCuts),
    // clipes curtos
    clipsCount: clampNum(o.clipsCount, 1, 8, 3),
    // objetivo dos cortes: autoridade | educacao | entretenimento | venda | engajamento
    clipGoal: CLIP_GOALS[o.clipGoal] ? o.clipGoal : 'auto',
    // Vídeo longo → UM vídeo curto de ~N segundos (0 = desligado). Diferente dos cortes (vários clipes).
    shortTarget: Number(o.shortTarget) > 0 ? clampNum(o.shortTarget, 15, 600, 60) : 0,
    clipAspect: ['original', '9:16', '16:9', '1:1'].includes(o.clipAspect) ? o.clipAspect : '9:16',
    clipMin: clampNum(o.clipMin, 5, 60, 15),
    clipMax: clampNum(o.clipMax, 15, 120, 50),
    // Mídias próprias do usuário na timeline (imagens/vídeos/músicas). Resolvidas
    // para caminhos de arquivo no servidor (ver optionsForUser).
    userMedia: sanitizeUserMedia(o.userMedia),
    // Marca d'água do Brand Kit: o logo (mídia enviada) num canto do vídeo.
    watermark: o.watermark && typeof o.watermark.mediaId === 'string' && o.watermark.mediaId
      ? {
        mediaId: o.watermark.mediaId,
        position: ['tr', 'tl', 'br', 'bl'].includes(o.watermark.position) ? o.watermark.position : 'tr',
        scale: clampNum(o.watermark.scale, 0.06, 0.35, 0.14),
        opacity: clampNum(o.watermark.opacity, 0.15, 1, 0.85),
      }
      : null,
    // Ducking: a música própria abaixa sozinha enquanto há fala ('off' desliga).
    musicDucking: ['off', 'suave', 'medio', 'forte'].includes(o.musicDucking) ? o.musicDucking : 'medio',
    // Tradução das legendas ('' = idioma original da fala).
    captionLanguage: Object.hasOwn(CAPTION_LANGUAGES, o.captionLanguage) ? o.captionLanguage : '',
    // Biblioteca de SFX: qual som entra em cada gatilho automático.
    sfxBrollType: sfxType(o.sfxBrollType, 'whoosh'),
    sfxZoomType: sfxType(o.sfxZoomType, 'whoosh'),
    sfxCutType: sfxType(o.sfxCutType, 'none'),
    // Efeitos colocados à mão na timeline (tempo original; o servidor remapeia após os cortes).
    sfxMoments: Array.isArray(o.sfxMoments)
      ? o.sfxMoments
          .filter((m) => m && Number.isFinite(Number(m.t)) && Number(m.t) >= 0 && (Object.hasOwn(SFX_LIBRARY, m.type) || (m.type === 'online' && okSfxUrl(m.url))))
          .slice(0, 60)
          .map((m) => ({ t: Number(m.t), type: m.type, ...(m.type === 'online' ? { url: m.url } : {}), ...(m.volume != null && Number.isFinite(Number(m.volume)) && Number(m.volume) !== 1 ? { volume: Math.max(0, Math.min(2, Number(m.volume))) } : {}) }))
      : [],
    // Transições (flash/esmaecer/brilho/blur) nos cortes e/ou nas entradas de B-roll.
    transition: Object.hasOwn(TRANSITIONS, o.transition) ? o.transition : 'none',
    transitionAt: Object.hasOwn(TRANSITION_TARGETS, o.transitionAt) ? o.transitionAt : 'broll',
    // Velocidade por trecho (0,25–4×) e congelar quadro (0,2–10 s), em tempo original.
    speedRanges: Array.isArray(o.speedRanges)
      ? o.speedRanges
          .filter((r) => r && Number.isFinite(Number(r.start)) && Number.isFinite(Number(r.end)) && Number(r.end) - Number(r.start) >= 0.05 && Number(r.speed) > 0)
          .slice(0, 60)
          .map((r) => ({ start: Math.max(0, Number(r.start)), end: Number(r.end), speed: Math.max(0.25, Math.min(4, Number(r.speed))) }))
      : [],
    freezes: Array.isArray(o.freezes)
      ? o.freezes
          .filter((f) => f && Number.isFinite(Number(f.t)) && Number(f.t) >= 0)
          .slice(0, 30)
          .map((f) => ({ t: Number(f.t), dur: Math.max(0.2, Math.min(10, Number(f.dur) || 2)) }))
      : [],
    // Transições manuais: cada uma num ponto (tempo original) com o seu tipo.
    transitions: Array.isArray(o.transitions)
      ? o.transitions
          .filter((x) => x && Number.isFinite(Number(x.t)) && Number(x.t) >= 0 && Object.hasOwn(TRANSITIONS, x.type) && x.type !== 'none')
          .slice(0, 80)
          .map((x) => ({ t: Number(x.t), type: x.type, ...(Number(x.dur) > 0 ? { dur: Math.max(0.1, Math.min(3, Number(x.dur))) } : {}) }))
      : [],
  };
}

// Fontes próprias do usuário (.ttf/.otf/.woff) para as legendas.
const uploadFont = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 ** 2 } });
jobsRouter.get('/custom-fonts', requireAuth, (req, res) => res.json({ fonts: listCustomFonts(req.user.id) }));
jobsRouter.post('/custom-fonts', requireAuth, uploadFont.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'envie o arquivo da fonte (campo "file")' });
  try {
    const f = saveCustomFont(req.user.id, req.file.buffer, fixName(req.file.originalname));
    res.status(201).json(f);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
jobsRouter.get('/custom-fonts/:id/file', requireAuth, (req, res) => {
  const f = resolveCustomFont(req.user.id, req.params.id);
  if (!f) return res.status(404).json({ error: 'fonte não encontrada' });
  res.set('Cache-Control', 'private, max-age=86400').sendFile(f.path);
});
jobsRouter.delete('/custom-fonts/:id', requireAuth, (req, res) => {
  res.json({ ok: deleteCustomFont(req.user.id, req.params.id) });
});

// Upload retomável em partes (o vídeo continua de onde parou se a conexão cair).
// Confere o saldo ANTES de subir o vídeo (não faz a pessoa enviar gigas para ouvir "sem créditos").
const creditsFor = (req, res, next) => requireCredits(['auto', 'transcribe', 'clips'].includes(req.body?.mode) ? req.body.mode : 'auto')(req, res, next);
jobsRouter.post('/uploads', requireAuth, requireVerified, creditsFor, (req, res) => {
  startUpload(req.user.id, req.body || {}).then((r) => res.status(r.status).json(r.body), (err) => res.status(500).json({ error: err.message }));
});
jobsRouter.get('/uploads/:id', requireAuth, (req, res) => {
  const r = uploadStatus(req.user.id, req.params.id);
  res.status(r.status).json(r.body);
});
jobsRouter.put('/uploads/:id', requireAuth, receiveChunk);

// POST /api/jobs  (multipart: file + options) → pipeline automático completo
jobsRouter.post('/jobs', requireAuth, requireVerified, requireCredits('auto'), checkUploadSize, upload.single('file'), fromChunkedUpload, fromLocalPath, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  chargeAndQueue(req, res, 'auto', {
    filename: fixName(req.file.originalname),
    inputPath: req.file.path,
    options: optionsForUser(req),
  });
});

// POST /api/transcribe  (multipart: file) → transcreve e para; o upload fica salvo
// para depois ser reusado por /api/render com a transcrição editada.
jobsRouter.post('/transcribe', requireAuth, requireVerified, requireCredits('transcribe'), checkUploadSize, upload.single('file'), fromChunkedUpload, fromLocalPath, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  chargeAndQueue(req, res, 'transcribe', {
    filename: fixName(req.file.originalname),
    inputPath: req.file.path,
    options: optionsForUser(req),
  });
});

/** Frases da transcrição vindas do editor: só números válidos e no máximo 20 mil palavras. */
function cleanSegments(raw) {
  let n = 0;
  const out = [];
  for (const sg of Array.isArray(raw) ? raw : []) {
    if (n > 20000) break;
    const words = (Array.isArray(sg?.words) ? sg.words : []).filter((w) => Number.isFinite(Number(w?.start)) && Number.isFinite(Number(w?.end)) && typeof w?.word === 'string').map((w) => ({ ...w, start: Number(w.start), end: Number(w.end), word: w.word.slice(0, 80) }));
    n += words.length;
    if (words.length) out.push({ ...sg, start: words[0].start, end: words[words.length - 1].end, text: String(sg.text || '').slice(0, 2000), words });
  }
  return out;
}

// POST /api/sequence/blank  { aspect, title } → timeline em branco: abre o editor na hora
// (quadro vazio, sem fala), sem cobrar; os clipes entram depois pela aba Projeto.
jobsRouter.post('/sequence/blank', requireAuth, requireVerified, (req, res) => {
  const body = req.body || {};
  const aspect = ['9:16', '16:9', '1:1', '4:5'].includes(body.aspect) ? body.aspect : '9:16';
  const job = queue.create({
    mode: 'transcribe',
    filename: fixName(String(body.title || '').trim().slice(0, 80) || 'Timeline'),
    inputPath: path.join(config.paths.uploads, `seq_${nanoid(12)}.mp4`),
    options: { ...optionsForUser(req), sequenceBuild: true },
    sequence: { clips: [], music: null, aspect, blank: true },
    ownerId: req.user?.id || null,
  });
  res.status(201).json(queue.public(job));
});

// POST /api/sequence  (JSON: { clips: [{ mediaId, in, out, duration }], music, aspect, title })
// "Timeline em branco": os clipes da trilha V1 (mídias já enviadas) viram UM vídeo que abre
// no editor — como montar a sequência no Premiere. Cobra como um vídeo novo.
jobsRouter.post('/sequence', requireAuth, requireVerified, requireCredits('transcribe'), (req, res) => {
  const body = req.body || {};
  const raw = Array.isArray(body.clips) ? body.clips.slice(0, 80) : [];
  const clips = [];
  for (const c of raw) {
    // espaço vazio (preto, sem som) — o que sobrou de um "Excluir" no vídeo principal
    if (c?.blank === true) { clips.push({ kind: 'blank', filename: 'Vazio', duration: clampNum(c.duration, 0.2, 600, 1) }); continue; }
    // o vídeo que já está no editor (enviado antes) também pode entrar na sequência
    if (c?.sourceId) {
      const src = queue.get(String(c.sourceId));
      if (!src || (src.ownerId && src.ownerId !== req.user.id) || !src.inputPath || !fs.existsSync(src.inputPath)) continue;
      // a fala desse vídeo já foi transcrita: entra junto (não transcreve de novo). A do
      // editor (com as correções feitas) vale mais que a original.
      const words = Array.isArray(c.words) ? cleanSegments(c.words)
        : body.transcriptSource === src.id && Array.isArray(body.transcript) ? cleanSegments(body.transcript)
          : (src.report?.editorTranscript?.segments || src.report?.transcript?.segments || null);
      clips.push({ file: src.inputPath, kind: 'video', sourceId: src.id, filename: String(c.filename || src.filename || 'vídeo').slice(0, 120), in: clampNum(c.in, 0, 100000, 0), out: clampNum(c.out, 0, 100000, 0), duration: 3, ...(words ? { words } : {}) });
      continue;
    }
    const m = resolveMedia(String(c?.mediaId || ''));
    if (!m || (m.ownerId && m.ownerId !== req.user.id) || !['video', 'image'].includes(m.kind)) continue;
    clips.push({
      file: m.path,
      mediaId: m.id,
      filename: m.originalname || '',
      kind: m.kind,
      in: clampNum(c.in, 0, 100000, 0),
      out: clampNum(c.out, 0, 100000, 0),
      duration: clampNum(c.duration, 0.5, 60, 3),
      // fala que o editor já tinha desse clipe (tempo da mídia): não transcreve de novo
      ...(m.kind === 'video' && Array.isArray(c.words) ? { words: cleanSegments(c.words) } : {}),
    });
  }
  if (!clips.length) return res.status(400).json({ error: 'coloque pelo menos um vídeo ou imagem na timeline' });
  if (!clips.some((c) => c.kind !== 'blank')) return res.status(400).json({ error: 'coloque pelo menos um vídeo ou imagem na timeline' });
  const total = clips.reduce((s, c) => s + (c.kind !== 'video' ? c.duration : Math.max(0.3, (c.out > c.in ? c.out : c.in + 5) - c.in)), 0);
  if (total > 3 * 3600) return res.status(400).json({ error: 'a timeline passou de 3 horas' });
  let music = null;
  if (body.music?.mediaId) {
    const m = resolveMedia(String(body.music.mediaId));
    if (m && m.kind === 'audio' && (!m.ownerId || m.ownerId === req.user.id)) music = { file: m.path, mediaId: m.id, filename: m.originalname || '', volume: clampNum(body.music.volume, 0, 2, 0.35) };
  }
  const aspect = ['9:16', '16:9', '1:1', '4:5'].includes(body.aspect) ? body.aspect : 'auto';
  const options = { ...optionsForUser(req), sequenceBuild: true };
  // "Só colocar na timeline": os clipes novos entram sem transcrever (dá para transcrever um
  // trecho depois, selecionando na timeline)
  const transcribeNew = body.transcribeNew !== false;
  chargeAndQueue(req, res, 'transcribe', {
    filename: fixName(String(body.title || '').trim().slice(0, 80) || 'Timeline'),
    inputPath: path.join(config.paths.uploads, `seq_${nanoid(12)}.mp4`),
    options,
    sequence: { clips, music, aspect, ...(transcribeNew ? {} : { transcribeNew: false }) },
  });
});

// POST /api/clips  (multipart: file) → gera vários clipes curtos do vídeo longo
jobsRouter.post('/clips', requireAuth, requireVerified, requireCredits('clips'), checkUploadSize, upload.single('file'), fromChunkedUpload, fromLocalPath, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  chargeAndQueue(req, res, 'clips', {
    filename: fixName(req.file.originalname),
    inputPath: req.file.path,
    options: optionsForUser(req),
  });
});

// POST /api/render  (JSON: sourceId + editedTranscript + options) → aplica a edição
// por transcrição ao vídeo já enviado e roda o restante do pipeline.
jobsRouter.post('/render', requireAuth, requireVerified, (req, res) => {
  const { sourceId, editedTranscript } = req.body || {};
  if (!sourceId) return res.status(400).json({ error: 'sourceId ausente' });
  const source = queue.get(sourceId);
  if (!source) return res.status(404).json({ error: 'transcrição de origem não encontrada' });
  if (!fs.existsSync(source.inputPath)) {
    return res.status(410).json({ error: 'o vídeo de origem expirou; reenvie' });
  }
  // Timeline montada só com imagens/música (sem fala): a transcrição pode vir vazia.
  if (!Array.isArray(editedTranscript?.segments) || (!editedTranscript.segments.length && !source.sequence)) {
    return res.status(400).json({ error: 'editedTranscript inválido' });
  }
  chargeAndQueue(req, res, 'render', {
    filename: source.filename,
    inputPath: source.inputPath,
    options: optionsForUser(req),
    editedTranscript,
    sourceId,
  }, { sourceId });
});

// POST /api/voice/preview  (JSON: sourceId + start + options) → alguns segundos do áudio
// do vídeo já enviado com o tratamento/modificador de voz escolhido (m4a), para ouvir antes
// de renderizar. Não cobra créditos.
jobsRouter.post('/voice/preview', requireAuth, requireVerified, async (req, res) => {
  const { sourceId, start } = req.body || {};
  const source = sourceId && queue.get(sourceId);
  if (!source || !fs.existsSync(source.inputPath)) return res.status(410).json({ error: 'o vídeo de origem expirou; reenvie' });
  let dir;
  try {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rf-voz-'));
    const out = path.join(dir, 'previa.m4a');
    await previewVoice(source.inputPath, dir, out, parseOptions(req.body?.options), Number(start) || 0, 8);
    res.type('audio/mp4');
    res.sendFile(out, () => fs.rm(dir, { recursive: true, force: true }, () => {}));
  } catch (err) {
    if (dir) fs.rm(dir, { recursive: true, force: true }, () => {});
    res.status(500).json({ error: err.message || 'falha ao gerar a prévia da voz' });
  }
});

// POST /api/jobs/:id/transcribe-range  (JSON: { start, end }) → transcreve só esse trecho do
// vídeo do editor (clipe que entrou na timeline sem transcrever). Devolve as frases já no
// tempo do vídeo; o editor junta com a transcrição que já tem.
jobsRouter.post('/jobs/:id/transcribe-range', requireAuth, requireVerified, async (req, res) => {
  const source = queue.get(String(req.params.id));
  if (!source || (source.ownerId && source.ownerId !== req.user.id)) return res.status(404).json({ error: 'vídeo não encontrado' });
  if (!source.inputPath || !fs.existsSync(source.inputPath)) return res.status(410).json({ error: 'o vídeo de origem expirou; reenvie' });
  const a = clampNum(req.body?.start, 0, 100000, 0);
  const b = clampNum(req.body?.end, 0, 100000, 0);
  if (b - a < 0.3) return res.status(400).json({ error: 'trecho curto demais' });
  if (b - a > 3 * 3600) return res.status(400).json({ error: 'trecho longo demais' });
  let dir;
  try {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rf-trecho-'));
    const r = await transcribeRange(source.inputPath, dir, a, b, { jobId: source.id, language: req.body?.language });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message || 'não deu para transcrever o trecho' });
  } finally {
    if (dir) fs.rm(dir, { recursive: true, force: true }, () => {});
  }
});

// POST /api/jobs/:id/clean-speech  (JSON: { segments, options }) → a fala do editor com as
// muletas, repetições e erros marcados para sair (Edição automática da timeline). A IA só
// entra com o recurso no plano (é cobrada no render, como a limpeza do início); sem ele,
// só a limpeza básica (muletas e repetições).
jobsRouter.post('/jobs/:id/clean-speech', requireAuth, requireVerified, async (req, res) => {
  const source = queue.get(String(req.params.id));
  if (!source || (source.ownerId && source.ownerId !== req.user.id)) return res.status(404).json({ error: 'vídeo não encontrado' });
  const segments = cleanSegments(req.body?.segments);
  if (!segments.length) return res.status(400).json({ error: 'sem fala transcrita para limpar' });
  const ai = Boolean(remoteAccount()) || trialCovers(req.user, 'render', source.id) || allowedFeatures(req.user).includes('ai');
  try {
    const { cleanSpeech } = await import('../pipeline/index.js');
    const options = { ...optionsForUser(req), ...(ai ? {} : { cleanAI: false }) };
    const r = await cleanSpeech({ segments }, options, { jobId: source.id });
    res.json({ segments: r.transcript.segments || [], removed: r.report.removed, method: r.report.method, ai: ai && /IA/.test(r.report.method) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'não deu para limpar a fala' });
  }
});

// POST /api/broll/plan  (JSON: sourceId + editedTranscript + options) → devolve os
// momentos de B-roll planejados COM candidatos (miniaturas) para o usuário revisar
// e trocar antes de renderizar. Não baixa nem renderiza nada.
jobsRouter.post('/broll/plan', requireAuth, requireVerified, async (req, res) => {
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
    const google = googleConfig();
    const pixabayKey = config.broll.pixabayKey;
    const src = resolveSource(options.imageSource, { apiKey, pixabayKey, googleReady: googleReady(google) });

    const out = [];
    for (const m of moments) {
      const candidates = await brollCandidates(m.query, {
        source: src, apiKey, google, pixabayKey, orientation,
        ...(m.entity ? { entity: m.entityKind || 'other' } : {}),
        targetH: meta.height || 1920,
        limit: src === 'mix' ? 9 : 8, unrestricted: google.unrestricted,
      });
      out.push({ start: m.start, end: m.end, term: m.term || m.query, query: m.query, candidates, ...(m.entity ? { entity: m.entity, entityKind: m.entityKind } : {}) });
    }
    res.json({ source: src, moments: out });
  } catch (err) {
    res.status(500).json({ error: err.message || 'falha ao planejar o B-roll' });
  }
});

// POST /api/broll/search  (JSON: query + source + orientation) → candidatos de B-roll para
// um termo escolhido pelo usuário (ex.: trocar a imagem de um momento por outra busca).
jobsRouter.post('/broll/search', requireAuth, requireVerified, async (req, res) => {
  const query = String(req.body?.query || '').trim().slice(0, 80);
  if (query.length < 2) return res.status(400).json({ error: 'digite o que buscar' });
  const s = getSettings(req.user.id);
  const apiKey = s.pexelsKey || config.broll.pexelsKey;
  const google = googleConfig();
  const pixabayKey = config.broll.pixabayKey;
  const source = resolveSource(req.body?.source, { apiKey, pixabayKey, googleReady: googleReady(google) });
  const orientation = req.body?.orientation === 'landscape' ? 'landscape' : 'portrait';
  // Digitou uma marca ("nike", "apple"): busca o logo/a marca, não uma cena genérica.
  const brand = brandIn(query);
  try {
    const candidates = await brollCandidates(brand ? entityQuery(brand, 'brand') : query, { source, apiKey, google, pixabayKey, orientation, targetH: 1280, limit: source === 'mix' ? 9 : 8, unrestricted: google.unrestricted, lang: 'pt', ...(brand ? { entity: 'brand' } : {}) });
    res.json({ source, query, candidates });
  } catch (err) {
    res.status(500).json({ error: err.message || 'falha na busca' });
  }
});

// POST /api/media  (multipart: file) → sobe uma mídia própria (imagem/vídeo/música)
// para usar na timeline. Devolve { id, kind, filename, durationSec }.
jobsRouter.post('/media', requireAuth, requireVerified, uploadMedia.single('file'), async (req, res) => {
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
    originalname: fixName(req.file.originalname),
    durationSec,
    ownerId: req.user?.id,
  });
  res.status(201).json(pub);
});

// GET /api/media/library → mídias que a conta já enviou (ficam guardadas para reusar)
jobsRouter.get('/media/library', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store').json({ media: listLibrary(req.user.id) });
});

// DELETE /api/media/library/:id → tira da biblioteca (projetos que usam continuam valendo)
jobsRouter.delete('/media/library/:id', requireAuth, (req, res) => {
  if (!removeFromLibrary(req.params.id, req.user.id)) return res.status(404).json({ error: 'mídia não encontrada' });
  res.json({ ok: true });
});

// ── Arquivos do projeto como no CapCut: no app de PC a mídia aponta para o ARQUIVO
// ORIGINAL (sem cópia que expira); se ele sumir, fica offline e o editor pede para
// localizar. No site, o mesmo vale para uploads que o servidor perdeu.
async function probeDuration(file, kind) {
  if (kind === 'image') return null;
  try {
    const meta = await probeSummary(file);
    return Number.isFinite(meta.duration) ? Math.round(meta.duration * 100) / 100 : null;
  } catch {
    return null;
  }
}
/** Caminho de arquivo do computador (só no app de PC): absoluto, existe e é mídia. */
/**
 * App de PC/Mac: o vídeo principal usa o arquivo ORIGINAL do computador (como as mídias),
 * sem copiar para a pasta do app — vídeo de dezenas de GB não dobra o espaço nem espera a
 * cópia. No site (sem modo PC) não faz nada e o envio normal segue.
 */
function fromLocalPath(req, res, next) {
  if (req.file || !req.body?.localPath) return next();
  const p = desktopPath(req.body.localPath);
  if (!p) return next();
  req.file = { path: p, originalname: path.basename(p), size: fs.statSync(p).size, linked: true };
  next();
}

function desktopPath(p) {
  if (!config.desktop || typeof p !== 'string' || !p || !path.isAbsolute(p)) return null;
  try {
    if (!fs.statSync(p).isFile()) return null;
  } catch {
    return null;
  }
  return path.resolve(p);
}

// POST /api/media/link  { path } → registra a mídia apontando para o arquivo original (app de PC)
jobsRouter.post('/media/link', requireAuth, async (req, res) => {
  const file = desktopPath(req.body?.path);
  if (!file) return res.status(400).json({ error: 'arquivo não encontrado no computador' });
  const kind = mediaKind(path.extname(file).toLowerCase());
  if (!kind) return res.status(400).json({ error: 'formato de mídia não suportado' });
  const pub = registerMedia({ id: nanoid(), filePath: file, kind, originalname: path.basename(file), durationSec: await probeDuration(file, kind), linked: true, ownerId: req.user?.id });
  res.status(201).json(pub);
});

// GET /api/media/:id/status → { status: ok | offline | missing, ... }
jobsRouter.get('/media/:id/status', (req, res) => res.json(mediaStatus(req.params.id)));

// GET /api/media/:id/file → o arquivo (prévia no editor depois de reabrir o projeto)
jobsRouter.get('/media/:id/file', (req, res) => {
  const m = resolveMedia(req.params.id);
  if (!m) return res.status(410).json({ error: 'arquivo offline' });
  res.sendFile(m.path);
});

// GET /api/media/:id/preview → vídeo que o navegador consegue tocar na prévia do editor.
// H.264/VP9/AV1 em 8 bits vai direto; HEVC (iPhone), ProRes, 10 bits, HDR, AVI/MKV… viram
// uma cópia leve em H.264 (até 720p), gerada uma vez e guardada no cache.
const BROWSER_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1']);
const BROWSER_EXT = new Set(['.mp4', '.m4v', '.webm', '.mov']);
jobsRouter.get('/media/:id/preview', async (req, res) => {
  const m = resolveMedia(req.params.id);
  if (!m) return res.status(410).json({ error: 'arquivo offline' });
  if (m.kind !== 'video') return res.sendFile(path.resolve(m.path));
  try {
    const meta = await probeSummary(m.path);
    const ext = path.extname(m.path).toLowerCase();
    const playable = BROWSER_CODECS.has(meta.videoCodec) && BROWSER_EXT.has(ext) && !meta.hdr && (!meta.pixFmt || meta.pixFmt === 'yuv420p' || meta.pixFmt === 'yuvj420p');
    if (playable) {
      res.type(MIME_BY_EXT[ext] || 'video/mp4');
      return res.sendFile(path.resolve(m.path));
    }
    const st = fs.statSync(m.path);
    const out = path.join(config.paths.cache, `mprev-${String(req.params.id).replace(/[^\w-]/g, '')}-${Math.round(st.mtimeMs)}.mp4`);
    if (!fs.existsSync(out)) {
      await once(out, async () => {
        fs.mkdirSync(config.paths.cache, { recursive: true });
        const tmp = `${out}.tmp.mp4`;
        const h = Math.max(2, Math.min(720, meta.height || 720)) & ~1;
        const vf = [meta.hdr ? sdrVf(meta) : null, `scale=-2:${h}`].filter(Boolean).join(',');
        await runFfmpeg(['-y', '-i', m.path, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p',
          ...(meta.hasAudio ? ['-c:a', 'aac', '-b:a', '96k'] : ['-an']), '-movflags', '+faststart', tmp], { label: 'media-preview' });
        fs.renameSync(tmp, out);
      });
    }
    res.type('video/mp4');
    res.sendFile(out);
  } catch (err) {
    res.status(500).json({ error: err.message || 'falha ao preparar a prévia' });
  }
});

// POST /api/transcribe/remote (multipart "audio") → transcrição feita AQUI (no site, com a
// chave de transcrição do servidor) para o app de PC que não tem chave nem Whisper local.
// Só o áudio (leve) vem; o vídeo continua no computador da pessoa. Limite diário por conta.
const remoteMinutes = new Map(); // userId → { day, min }
const REMOTE_DAILY_MIN = Number(process.env.REMOTE_TRANSCRIBE_DAILY_MIN) || 300;
jobsRouter.post('/transcribe/remote', requireAuth, requireVerified, requireAppPlan, uploadMedia.single('audio'), async (req, res) => {
  const file = req.file?.path;
  if (!file) return res.status(400).json({ error: 'envie o áudio (campo "audio")' });
  const drop = () => fs.unlink(file, () => {});
  if (remoteAccount() || ['whisper-local', 'mock'].includes(config.transcribe.provider)) {
    drop();
    return res.status(501).json({ error: 'este servidor não faz transcrição remota' });
  }
  let work = null;
  try {
    const meta = await probeSummary(file);
    const minutes = (Number(meta.duration) || 0) / 60;
    const day = new Date().toISOString().slice(0, 10);
    const used = remoteMinutes.get(req.user.id);
    const sofar = used && used.day === day ? used.min : 0;
    if (sofar + minutes > REMOTE_DAILY_MIN) {
      drop();
      return res.status(429).json({ error: `limite diário de transcrição pelo app atingido (${REMOTE_DAILY_MIN} min). Tente amanhã ou configure uma chave de transcrição no app.` });
    }
    remoteMinutes.set(req.user.id, { day, min: sofar + minutes });
    work = fs.mkdtempSync(path.join(config.paths.work, 'rtx-'));
    const { transcribe } = await import('../pipeline/transcribe/index.js');
    const t = await transcribe(file, work, { ...meta, hasAudio: true }, undefined, { language: req.body?.language });
    res.json({ provider: t.provider, language: t.language, text: t.text, segments: t.segments });
  } catch (err) {
    res.status(500).json({ error: err.message || 'falha na transcrição' });
  } finally {
    drop();
    if (work) fs.rm(work, { recursive: true, force: true }, () => {});
  }
});

// ── App de PC sem chaves: a conta do site faz por ele (só texto/consulta vai; o vídeo
// fica no computador). Limites diários por conta para não haver abuso.
const remoteUse = new Map(); // `${tipo}:${userId}` → { day, n }
function remoteQuota(kind, userId, max) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${kind}:${userId}`;
  const used = remoteUse.get(key);
  const n = used && used.day === day ? used.n : 0;
  if (n >= max) return false;
  remoteUse.set(key, { day, n: n + 1 });
  return true;
}
// POST /api/remote/llm { system, user, maxTokens, json } → { text } — IA deste servidor
jobsRouter.post('/remote/llm', requireAuth, requireVerified, requireAppPlan, async (req, res) => {
  if (remoteAccount()) return res.status(501).json({ error: 'este servidor não responde pela conta' });
  const system = String(req.body?.system || '');
  const user = String(req.body?.user || '');
  if (!user || system.length > 30_000 || user.length > 80_000) return res.status(400).json({ error: 'texto vazio ou grande demais' });
  if (!remoteQuota('llm', req.user.id, Number(process.env.REMOTE_LLM_DAILY) || 600)) return res.status(429).json({ error: 'limite diário de IA pelo app atingido — tente amanhã' });
  try {
    const { askText, llmConfig } = await import('../pipeline/llm.js');
    const cfg = llmConfig({});
    if (!cfg.anthropicKey && !cfg.groqKey) return res.status(501).json({ error: 'IA indisponível no servidor' });
    const out = await askText(system, user, cfg, { maxTokens: Math.min(4000, Number(req.body?.maxTokens) || 3000), json: req.body?.json !== false });
    res.json({ text: out.text, provider: out.provider });
  } catch (err) {
    res.status(500).json({ error: err.message || 'falha na IA' });
  }
});
// POST /api/remote/broll-search { query, source, orientation, targetH, limit, lang } → { candidates }
jobsRouter.post('/remote/broll-search', requireAuth, requireVerified, requireAppPlan, async (req, res) => {
  if (remoteAccount()) return res.status(501).json({ error: 'este servidor não responde pela conta' });
  const query = String(req.body?.query || '').trim().slice(0, 120);
  if (!query) return res.status(400).json({ error: 'busca vazia' });
  if (!remoteQuota('broll', req.user.id, Number(process.env.REMOTE_BROLL_DAILY) || 1500)) return res.status(429).json({ error: 'limite diário de buscas de B-roll pelo app atingido' });
  try {
    const apiKey = config.broll.pexelsKey;
    const pixabayKey = config.broll.pixabayKey;
    const google = googleConfig();
    const source = resolveSource(String(req.body?.source || 'mix'), { apiKey, pixabayKey, googleReady: googleReady(google) });
    const candidates = await brollCandidates(query, {
      source, apiKey, pixabayKey, google, noRemote: true, unrestricted: google.unrestricted,
      orientation: req.body?.orientation === 'landscape' ? 'landscape' : 'portrait',
      targetH: Math.min(2160, Number(req.body?.targetH) || 1280),
      limit: Math.max(1, Math.min(12, Number(req.body?.limit) || 6)),
      lang: String(req.body?.lang || '').slice(0, 5),
      ...(['brand', 'person', 'place', 'other'].includes(req.body?.entity) ? { entity: req.body.entity } : {}),
    });
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ error: err.message || 'falha na busca' });
  }
});

// ── Biblioteca online de sons (Freesound, só CC0) ──
// GET /api/sfx-online/search?q=&page= → { results } · sem chave aqui, busca pela conta do site
jobsRouter.get('/sfx-online/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').slice(0, 80);
  const page = Number(req.query.page) || 1;
  try {
    if (freesoundKey()) return res.json({ results: await searchFreesound(q, { page }) });
    if (remoteAccount()) {
      const auth = String(req.headers.authorization || '');
      const data = await accountFetch('/remote/sfx-search', { method: 'POST', token: auth.startsWith('Bearer ') ? auth.slice(7) : '', body: { q, page }, ip: req.ip });
      return res.json({ results: Array.isArray(data.results) ? data.results.filter((x) => okSfxUrl(x.preview)) : [] });
    }
    res.status(501).json({ error: 'A biblioteca online de sons ainda não foi ligada neste servidor (falta a chave gratuita do Freesound: FREESOUND_API_KEY).' });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.body?.error || err.message || 'falha na busca de sons' });
  }
});
// POST /api/remote/sfx-search { q, page } → { results } (para o app de PC sem chave)
jobsRouter.post('/remote/sfx-search', requireAuth, requireVerified, requireAppPlan, async (req, res) => {
  if (remoteAccount() || !freesoundKey()) return res.status(501).json({ error: 'a biblioteca online de sons não está ligada no site' });
  if (!remoteQuota('sfx', req.user.id, Number(process.env.REMOTE_SFX_DAILY) || 1500)) return res.status(429).json({ error: 'limite diário de buscas de sons atingido' });
  try {
    res.json({ results: await searchFreesound(String(req.body?.q || ''), { page: Number(req.body?.page) || 1 }) });
  } catch (err) {
    res.status(502).json({ error: err.message || 'falha na busca de sons' });
  }
});
// GET /api/sfx-online/preview?u=<prévia do Freesound> → o mp3 (do cache), para ouvir no editor
jobsRouter.get('/sfx-online/preview', async (req, res) => {
  const u = String(req.query.u || '');
  if (!okSfxUrl(u)) return res.status(400).json({ error: 'endereço de som inválido' });
  try {
    const file = await onlineSfxFile(u, config.paths.cache);
    res.set('Cache-Control', 'private, max-age=86400');
    res.type('audio/mpeg').sendFile(path.resolve(file));
  } catch (err) {
    res.status(502).json({ error: err.message || 'não deu para baixar o som' });
  }
});

// POST /api/cleanup/remote { text } → um bloco da correção da fala pela IA deste servidor,
// para o app de PC sem chave de IA (só o texto numerado vem). Limite diário por conta.
const remoteCleanups = new Map(); // userId → { day, n }
const REMOTE_CLEANUP_DAILY = Number(process.env.REMOTE_CLEANUP_DAILY) || 400;
jobsRouter.post('/cleanup/remote', requireAuth, requireVerified, requireAppPlan, async (req, res) => {
  const text = String(req.body?.text || '');
  if (!text || text.length > 40_000) return res.status(400).json({ error: 'texto vazio ou grande demais' });
  if (remoteAccount()) return res.status(501).json({ error: 'este servidor não faz correção remota' });
  const day = new Date().toISOString().slice(0, 10);
  const used = remoteCleanups.get(req.user.id);
  const n = used && used.day === day ? used.n : 0;
  if (n >= REMOTE_CLEANUP_DAILY) return res.status(429).json({ error: 'limite diário de correção da fala pelo app atingido — tente amanhã' });
  remoteCleanups.set(req.user.id, { day, n: n + 1 });
  try {
    const { cleanupWindowLLM } = await import('../pipeline/cleanupLLM.js');
    const out = await cleanupWindowLLM(text, {
      anthropicKey: config.analyze.anthropicKey, model: config.analyze.model, anthropicWorkspaceId: config.analyze.anthropicWorkspaceId,
      groqKey: config.analyze.groqKey, groqModel: config.analyze.groqModel,
    });
    res.json({ text: out });
  } catch (err) {
    res.status(500).json({ error: err.message || 'falha na IA' });
  }
});

// POST /api/media/:id/relink  ({ path } no app de PC | multipart "file") → mesmo id, arquivo novo
jobsRouter.post('/media/:id/relink', requireAuth, uploadMedia.single('file'), async (req, res) => {
  const st = mediaStatus(req.params.id);
  if (st.status === 'missing') return res.status(404).json({ error: 'mídia não encontrada neste projeto' });
  let file = null;
  let linked = false;
  if (req.file) file = req.file.path;
  else if ((file = desktopPath(req.body?.path))) linked = true;
  if (!file) return res.status(400).json({ error: 'escolha o arquivo' });
  const kind = mediaKind(path.extname(file).toLowerCase());
  if (!kind || kind !== st.kind) return res.status(400).json({ error: `escolha um arquivo do mesmo tipo (${st.kind === 'image' ? 'imagem' : st.kind === 'video' ? 'vídeo' : 'áudio'})` });
  res.json(relinkMedia(req.params.id, { filePath: file, linked, durationSec: await probeDuration(file, kind) }));
});

// POST /api/jobs/:id/source/relink  ({ path } no app de PC | multipart "file") → o vídeo de
// origem do projeto voltou (o original foi movido/apagado ou o servidor perdeu o upload).
jobsRouter.post('/jobs/:id/source/relink', requireAuth, upload.single('file'), (req, res) => {
  const job = queue.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'projeto não encontrado neste servidor' });
  const file = req.file ? req.file.path : desktopPath(req.body?.path);
  if (!file) return res.status(400).json({ error: 'escolha o vídeo do projeto' });
  if (!MEDIA_VIDEO.has(path.extname(file).toLowerCase())) return res.status(400).json({ error: 'escolha um arquivo de vídeo' });
  job.inputPath = file;
  fs.rmSync(editSourcePath(job.id), { force: true }); // a cópia de editar era do arquivo antigo
  queue._persist(job);
  res.json({ ok: true });
});

// GET /api/jobs/:id/source/status → o vídeo de origem está disponível?
jobsRouter.get('/jobs/:id/source/status', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job) return res.json({ status: 'missing' });
  res.json({ status: job.inputPath && fs.existsSync(job.inputPath) ? 'ok' : 'offline', filename: job.filename || null });
});

// (removido) GET /api/jobs — não expomos a listagem global de jobs: ela vazava os
// nomes de arquivo de todos os usuários. O acesso é por id (capability URL).

// GET /api/queue/mine → os vídeos desta conta na fila / processando / recém-terminados
// (?hours=12 → os terminados das últimas horas, até 24 h). No app de PC/Mac (um usuário só)
// entram também os vídeos sem dono registrado (enviados antes desta versão).
jobsRouter.get('/queue/mine', requireAuth, (req, res) => {
  const ownerless = remoteAccount();
  const hours = Math.max(0, Math.min(24, Number(req.query.hours) || 0));
  res.json({
    jobs: queue.mine(req.user.id, { ownerless, ...(hours ? { recentMs: hours * 3600_000 } : {}) }),
    othersAhead: queue.othersAhead(req.user.id, ownerless),
  });
});

// POST /api/jobs/:id/cancel | pause | resume → só quem enviou o vídeo
for (const action of ['cancel', 'pause', 'resume']) {
  jobsRouter.post(`/jobs/:id/${action}`, requireAuth, (req, res) => {
    const job = queue.get(req.params.id);
    if (!queue.owns(job, req.user.id, remoteAccount())) return res.status(404).json({ error: 'vídeo não encontrado na sua fila' });
    if (!queue[action](job.id)) return res.status(409).json({ error: 'não dá para fazer isso com este vídeo agora' });
    res.json(queue.public(job));
  });
}

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
  const file = outputOf(req.params.id, job);
  if (!file) return res.status(404).json({ error: 'render não disponível' });
  const base = path.parse(job?.filename || req.params.id).name.replace(/[^\w.-]+/g, '_');
  // exportado "só áudio": baixa o MP3 (o MP4 fica para a prévia; ?as=video baixa ele)
  const audio = job?.report?.output?.audioFile;
  const mp3 = audio && req.query.as !== 'video' ? path.join(config.paths.outputs, `${job.id}.mp3`) : null;
  if (mp3 && fs.existsSync(mp3)) return res.download(mp3, `riseframe_${base}.mp3`);
  res.download(file, `riseframe_${base}.mp4`);
});

/**
 * Arquivo final de um job. Se o job não está mais na memória (o servidor reiniciou
 * numa atualização e ele não era reabrível), o vídeo pronto que ainda está no disco
 * continua servindo — antes a miniatura e o download desses projetos sumiam.
 */
function outputOf(id, job) {
  if (job && (job.status !== 'done' || job.mode === 'transcribe' || job.mode === 'clips')) return null;
  if (!/^[\w-]{6,40}$/.test(String(id))) return null;
  const file = path.join(config.paths.outputs, `${id}.mp4`);
  return fs.existsSync(file) ? file : null;
}

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

// POST /api/jobs/:id/clips/:index/edit → abre um clipe pronto na timeline: recorta a
// janela do clipe do vídeo ORIGINAL (sem legenda/cor queimadas) num vídeo novo, com a
// transcrição dele, e devolve um job pronto para o editor (mesmo formato do /transcribe).
// Não cobra: a edição só é cobrada quando o usuário gerar o vídeo (/render).
jobsRouter.post('/jobs/:id/clips/:index/edit', requireAuth, requireVerified, async (req, res) => {
  const job = queue.get(req.params.id);
  const clip = job?.report?.clips?.find((c) => String(c.index) === String(req.params.index));
  if (!job || job.mode !== 'clips' || job.status !== 'done' || !clip) return res.status(404).json({ error: 'clipe não encontrado' });
  const tr = job.report.clipsTranscript;
  if (!tr?.segments?.length) {
    return res.status(409).json({ error: 'estes cortes foram feitos numa versão antiga e não guardaram a transcrição — gere os cortes de novo para poder editar' });
  }
  if (!job.inputPath || !fs.existsSync(job.inputPath)) return res.status(410).json({ error: 'o vídeo de origem expirou; gere os cortes de novo' });
  let dir;
  try {
    const meta = await probeSummary(job.inputPath);
    const start = Number.isFinite(clip.srcStart) ? clip.srcStart : Math.max(0, clip.start - 0.4);
    const end = Number.isFinite(clip.srcEnd) ? clip.srcEnd : Math.min(meta.duration, clip.end + 0.35);
    const keep = snapKeep([{ start, end: Math.min(meta.duration, end) }], meta.fps);
    if (!keep.length) return res.status(400).json({ error: 'trecho do clipe inválido' });
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rf-clipe-'));
    const cut = await remuxByKeepSegments(job.inputPath, dir, meta, keep, () => {}, 'clipe');
    const dest = path.join(config.paths.uploads, `${nanoid(12)}.mp4`);
    await fs.promises.copyFile(cut.output, dest);
    // As muletas, gagueiras e frases refeitas do clipe já abrem riscadas (o render da
    // timeline não limpa de novo, para respeitar o que o usuário devolver).
    const raw = remapTranscript(tr, keep);
    const local = job.options?.autoClean ? markFillers(raw, { aggressive: job.options.cutStrength === 'forte' }) : raw;
    const cmeta = await probeSummary(dest);
    const base = path.parse(job.filename || 'video').name;
    const created = queue.addDone({
      filename: `${base} — clipe ${clip.index + 1}.mp4`,
      inputPath: dest,
      options: job.options,
      report: {
        mode: 'transcribe',
        input: cmeta,
        provider: { transcribe: tr.provider || 'clips' },
        transcript: local,
        editorTranscript: { provider: tr.provider, language: tr.language, segments: local.segments },
        fromClip: { jobId: job.id, index: clip.index, title: clip.title, aspect: clip.aspect },
      },
    });
    res.status(201).json(queue.public(created));
  } catch (err) {
    res.status(500).json({ error: err.message || 'falha ao abrir o clipe na timeline' });
  } finally {
    if (dir) fs.rm(dir, { recursive: true, force: true }, () => {});
  }
});

// GET /api/jobs/:id/preview → stream inline (para <video>)
jobsRouter.get('/jobs/:id/preview', (req, res) => {
  const file = outputOf(req.params.id, queue.get(req.params.id));
  if (!file) return res.status(404).json({ error: 'preview não disponível' });
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

// POST /api/jobs/:id/precise-cuts { transcript, pauses, breaths, coughs, strength }
// → { pauses, removed }: os MESMOS cortes precisos do vídeo final (pausas que não passam
// por cima de voz, palavras removidas cortadas no vale do som), para a prévia do editor
// tocar e mostrar exatamente o que vai sair — sem comer pedaço de palavra.
const audioCache = new Map(); // id → Promise<análise do áudio> (poucos vídeos, os mais recentes)
const noiseCache = new Map(); // id → Promise<tosses/ruídos do vídeo> (acha uma vez por vídeo)
jobsRouter.post('/jobs/:id/precise-cuts', requireAuth, async (req, res) => {
  const job = sourceJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'vídeo de origem indisponível' });
  const { transcript, pauses } = req.body || {};
  if (!Array.isArray(transcript?.segments)) return res.status(400).json({ error: 'transcrição ausente' });
  try {
    if (!audioCache.has(job.id)) {
      audioCache.set(job.id, audioAnalysis(job.inputPath));
      while (audioCache.size > 4) audioCache.delete(audioCache.keys().next().value);
    }
    const audio = await audioCache.get(job.id);
    // Tosses: a prévia corta igual ao vídeo final (procuradas uma vez por vídeo, em segundo
    // plano na 1ª chamada; enquanto isso a prévia segue sem elas).
    // sem palavras (vídeo que entrou sem transcrever) não dá para separar tosse de fala:
    // nada é procurado. A busca vale para a fala desse momento (transcreveu → procura de novo).
    const nWords = transcript.segments.reduce((k, sg) => k + (Array.isArray(sg?.words) ? sg.words.length : 0), 0);
    const coughs = req.body.coughs !== false && nWords > 0;
    let noises = null;
    if (coughs) {
      const nk = `${job.id}:${nWords}`;
      if (!noiseCache.has(nk)) {
        noiseCache.set(nk, detectNoises(job.inputPath, transcript, { audio, duration: Number(job.report?.input?.duration) || Infinity }).catch(() => []));
        while (noiseCache.size > 4) noiseCache.delete(noiseCache.keys().next().value);
      }
      noises = await Promise.race([noiseCache.get(nk), new Promise((r) => setTimeout(() => r(null), 25_000))]);
    }
    const ranges = (Array.isArray(pauses) ? pauses : [])
      .slice(0, 5000)
      .map((p) => ({ start: Number(p?.start), end: Number(p?.end) }))
      .filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start);
    const r = await preciseRemovals(job.inputPath, {
      pauses: ranges,
      transcript,
      breaths: req.body.breaths !== false,
      coughs: Boolean(noises),
      noises: noises || [],
      keepNoises: sanitizeSilenceCuts(req.body.keepNoises),
      strength: ['forte', 'equilibrado', 'suave'].includes(req.body.strength) ? req.body.strength : 'forte',
      audio,
    });
    // todos os achados (inclusive os restaurados, marcados) para a timeline mostrar e alternar
    const restoredList = sanitizeSilenceCuts(req.body.keepNoises);
    const all = (noises || []).map((n) => ({ ...n, kept: restoredList.some((k) => Math.min(k.end, n.end) - Math.max(k.start, n.start) >= 0.5 * (n.end - n.start)) }));
    res.json({ pauses: r.pauses, removed: r.removed, noises: all, coughsPending: coughs && !noises });
  } catch (err) {
    audioCache.delete(job.id);
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

// GET /api/jobs/:id/cover?t=&text=&style=&color=&pos=&aspect=&quality=&fx=&full=1 → capa
// (JPG): o quadro do vídeo original no segundo `t`, no formato do vídeo final, com o
// título. Prévia no editor (menor) e "Baixar capa" (full=1, tamanho do vídeo final).
// Público como /source e /color-frame (o id não é adivinhável; <img> não manda cabeçalho).
jobsRouter.get('/jobs/:id/cover', async (req, res) => {
  try {
    const job = queue.get(req.params.id);
    if (!job?.inputPath || !fs.existsSync(job.inputPath)) return res.status(404).json({ error: 'vídeo não encontrado' });
    if (!sourceMetaCache.has(job.id)) sourceMetaCache.set(job.id, await probeSummary(job.inputPath));
    const meta = sourceMetaCache.get(job.id);
    const q = req.query;
    const cover = sanitizeCover({ t: q.t, text: q.text, position: q.pos, fx: q.fx }) || { t: 0, text: '', position: 'center', fx: 0.5 };
    const style = sanitizeHeadline({ text: 'x', style: q.style, color: q.color }) || {};
    const aspect = ['9:16', '1:1', '16:9'].includes(q.aspect) ? q.aspect : 'original';
    const full = q.full === '1';
    let dims = outputTarget(meta, { aspect, quality: full ? q.quality : undefined }) || { w: meta.width, h: meta.height };
    if (!full) {
      // prévia: lado menor com 540 px (rápido)
      const k = 540 / Math.min(dims.w, dims.h);
      dims = { w: Math.round((dims.w * k) / 2) * 2, h: Math.round((dims.h * k) / 2) * 2 };
    }
    const dir = path.join(config.paths.cache, 'covers');
    fs.mkdirSync(dir, { recursive: true });
    const key = [job.id, Math.round(cover.t * 10), cover.text, cover.position, cover.fx, style.style, style.color, dims.w, dims.h]
      .join('|');
    const hash = (await import('node:crypto')).createHash('sha1').update(key).digest('hex').slice(0, 20);
    const out = path.join(dir, `${hash}.jpg`);
    if (!fs.existsSync(out)) {
      await makeCover(job.inputPath, path.join(dir, `w_${hash}`), {
        t: cover.t, W: dims.w, H: dims.h, fx: cover.fx, preVf: sdrVf(meta) || '',
        text: cover.text, headline: style, position: cover.position,
      }, out);
      fs.rm(path.join(dir, `w_${hash}`), { recursive: true, force: true }, () => {});
    }
    res.set('Cache-Control', 'private, max-age=600');
    if (full) res.set('Content-Disposition', 'attachment; filename="riseframe_capa.jpg"');
    res.type('image/jpeg').sendFile(path.resolve(out));
  } catch (err) {
    res.status(500).json({ error: err.message || 'falha ao gerar a capa' });
  }
});

// GET /api/jobs/:id/captions.srt|vtt|txt → a legenda do vídeo final em arquivo (para subir
// nas redes ou abrir no Premiere), no tempo do vídeo exportado.
jobsRouter.get('/jobs/:id/captions.:fmt', (req, res) => {
  const job = queue.get(req.params.id);
  const fmt = String(req.params.fmt || '').toLowerCase();
  const name = ['srt', 'vtt', 'txt'].includes(fmt) ? job?.report?.output?.captionFiles?.[fmt] : null;
  const file = name && path.join(config.paths.outputs, path.basename(name));
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'legenda em arquivo não disponível para este vídeo' });
  const base = path.parse(job.filename || 'video').name.replace(/[^\w.-]+/g, '_');
  res.download(file, `riseframe_${base}.${fmt}`);
});

// GET /api/jobs/:id/cover.jpg → a capa gerada junto com o vídeo (render pronto)
jobsRouter.get('/jobs/:id/cover.jpg', (req, res) => {
  const job = queue.get(req.params.id);
  const file = job?.report?.cover?.file && path.join(config.paths.outputs, job.report.cover.file);
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'capa não disponível' });
  const base = path.parse(job.filename || 'video').name.replace(/[^\w.-]+/g, '_');
  res.download(file, `riseframe_${base}_capa.jpg`);
});

// GET /api/jobs/:id/edit-source/status → { ready, proxy }: a cópia de EDITAR (quadro-chave a
// cada 0,5 s, para a prévia não travar nos cortes) começa a ser feita na 1ª pergunta.
jobsRouter.get('/jobs/:id/edit-source/status', async (req, res) => {
  const job = queue.get(req.params.id);
  if (!job || !job.inputPath || !fs.existsSync(job.inputPath)) return res.status(404).json({ error: 'vídeo não encontrado' });
  try { res.json(await editSourceStatus(job.id, job.inputPath)); } catch (e) { res.json({ ready: true, proxy: false, error: e.message }); }
});
// GET /api/jobs/:id/edit-source → a cópia de editar (ou o original, se ela não existe)
jobsRouter.get('/jobs/:id/edit-source', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job || !job.inputPath || !fs.existsSync(job.inputPath)) return res.status(404).json({ error: 'vídeo não encontrado' });
  const proxy = editSourcePath(job.id);
  if (fs.existsSync(proxy)) { res.type('video/mp4'); return res.sendFile(path.resolve(proxy)); }
  const ext = path.extname(job.inputPath).toLowerCase();
  res.type(MIME_BY_EXT[ext] || 'application/octet-stream');
  res.sendFile(path.resolve(job.inputPath));
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
