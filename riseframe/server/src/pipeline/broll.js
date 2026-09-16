import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { config } from '../config.js';
import { runFfmpeg } from './ffmpeg.js';
import { averageSubjectCenter } from './reframe.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('broll');

/**
 * Escolhe um item entre os `top` primeiros candidatos (relevância) de forma
 * aleatória — dá VARIEDADE (não pega sempre o mesmo 1º resultado) sem perder o
 * contexto. Puro/exportado para teste.
 */
export function pickVaried(list, top = 5) {
  if (!list || !list.length) return null;
  const n = Math.min(top, list.length);
  return list[Math.floor(Math.random() * n)];
}

/**
 * Escolhe o melhor arquivo de vídeo de um resultado do Pexels: mp4 com altura
 * mais próxima do alvo, sem passar muito da resolução (evita baixar 4K à toa).
 * Puro/exportado para teste.
 */
export function pickBestVideoFile(files, targetH) {
  const mp4 = (files || []).filter((f) => f.file_type === 'video/mp4' && f.link && f.height);
  if (!mp4.length) return null;
  const cap = targetH * 1.4;
  const scored = mp4
    .map((f) => ({ f, over: f.height > cap ? f.height - cap : 0, dist: Math.abs(f.height - targetH) }))
    .sort((a, b) => a.over - b.over || a.dist - b.dist);
  return scored[0].f;
}

/**
 * Escolhe a melhor URL de foto do Pexels: a maior versão disponível.
 * Puro/exportado para teste.
 */
export function pickBestPhotoFile(src) {
  if (!src) return null;
  return src.original || src.large2x || src.large || src.medium || null;
}

/**
 * Busca no Pexels (licença livre) e devolve o 1º vídeo ainda não usado.
 * @returns {Promise<{id:number, link:string}|null>}
 */
async function searchPexels(query, targetH, orientation, usedIds, apiKey) {
  const url =
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}` +
    `&per_page=8&orientation=${orientation}`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    log.warn(`Pexels ${res.status} para "${query}"`);
    return null;
  }
  const data = await res.json();
  const cands = (data.videos || [])
    .filter((v) => !usedIds.has(v.id)) // dedupe entre momentos
    .map((v) => ({ id: v.id, file: pickBestVideoFile(v.video_files, targetH) }))
    .filter((x) => x.file);
  const pick = pickVaried(cands);
  return pick ? { id: pick.id, link: pick.file.link } : null;
}

/**
 * Fallback em FOTO: quando não há vídeo para o momento, busca uma imagem do
 * Pexels que combine com o contexto/nicho e a usa como B-roll estático.
 * @returns {Promise<{id:number, link:string}|null>}
 */
async function searchPexelsPhoto(query, orientation, usedIds, apiKey) {
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
    `&per_page=8&orientation=${orientation}`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    log.warn(`Pexels fotos ${res.status} para "${query}"`);
    return null;
  }
  const data = await res.json();
  const cands = (data.photos || [])
    .filter((p) => !usedIds.has(`p${p.id}`)) // dedupe (namespace separado de vídeos)
    .map((p) => ({ id: `p${p.id}`, link: pickBestPhotoFile(p.src) }))
    .filter((x) => x.link);
  const pick = pickVaried(cands);
  return pick ? { id: pick.id, link: pick.link } : null;
}

/**
 * Busca imagens no GOOGLE via Programmable Search (Custom Search JSON API).
 * A query já vem contextual (escolhida pela IA a partir da fala). Por segurança,
 * filtra por licenças Creative Commons, salvo se `unrestricted` (risco do usuário).
 * @returns {Promise<{id:string, link:string}|null>}
 */
async function searchGoogleImages(query, usedIds, cfg) {
  const params = new URLSearchParams({
    key: cfg.key, cx: cfg.cx, q: query, searchType: 'image',
    num: '8', safe: 'active', imgType: 'photo', imgSize: 'xlarge',
  });
  if (!cfg.unrestricted) {
    // Só resultados com direitos de reuso (reduz — não elimina — risco de copyright).
    params.set('rights', 'cc_publicdomain,cc_attribute,cc_sharealike');
  }
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!res.ok) {
    log.warn(`Google Images ${res.status} para "${query}"`);
    return null;
  }
  const data = await res.json();
  const cands = (data.items || [])
    .map((item) => ({ link: item.link, id: `g${item.image?.thumbnailLink || item.link}` }))
    .filter((x) => x.link && /^https?:\/\//i.test(x.link) && /\.(jpe?g|png|webp)(\?|$)/i.test(x.link) && !usedIds.has(x.id));
  const pick = pickVaried(cands);
  return pick ? { id: pick.id, link: pick.link } : null;
}

/**
 * Escolhe a 1ª imagem ainda não usada de um resultado do Openverse.
 * Puro/exportado para teste.
 * @returns {{id:string, link:string}|null}
 */
export function pickOpenverseHit(items, usedIds) {
  for (const item of items || []) {
    const link = item.url; // URL direta do arquivo de imagem
    if (!link || !/^https?:\/\//i.test(link)) continue;
    const id = `o${item.id || link}`;
    if (usedIds.has(id)) continue;
    return { id, link };
  }
  return null;
}

/**
 * Busca imagens no OPENVERSE (agregador de Creative Commons: Wikimedia, Flickr CC,
 * museus, etc.). Grátis, SEM chave e seguro para publicar (por padrão só licenças
 * de uso comercial). A query já vem contextual (em inglês, como o Pexels).
 * @returns {Promise<{id:string, link:string}|null>}
 */
async function searchOpenverse(query, usedIds, cfg = {}) {
  const params = new URLSearchParams({ q: query, page_size: '8', mature: 'false' });
  // Segurança para conteúdo publicado: só licenças que permitem uso comercial.
  if (!cfg.unrestricted) params.set('license_type', 'commercial');
  const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Riseframe/1.0 (video editor)' },
  });
  if (!res.ok) {
    log.warn(`Openverse ${res.status} para "${query}"`);
    return null;
  }
  const data = await res.json();
  const cands = (data.results || [])
    .map((it) => ({ link: it.url, id: `o${it.id || it.url}` }))
    .filter((x) => x.link && /^https?:\/\//i.test(x.link) && !usedIds.has(x.id));
  return pickVaried(cands);
}

/**
 * Geometria do enquadramento no rosto: cobre a região e centraliza o crop no ponto
 * de foco (0–1), com zoom opcional. Garante que o crop cabe (head nunca cortada
 * porque o foco fica dentro dos limites). Puro/exportado para teste.
 * @returns {{scaledW:number, scaledH:number, cropX:number, cropY:number}}
 */
export function faceCropGeometry(inW, inH, regionW, regionH, focus = {}, zoom = 1) {
  const base = Math.max(regionW / inW, regionH / inH);
  const s = base * Math.min(2.5, Math.max(1, zoom));
  const scaledW = Math.max(regionW, Math.round(inW * s));
  const scaledH = Math.max(regionH, Math.round(inH * s));
  const fx = Math.min(1, Math.max(0, Number.isFinite(focus.x) ? focus.x : 0.5));
  const fy = Math.min(1, Math.max(0, Number.isFinite(focus.y) ? focus.y : 0.4));
  const cropX = Math.round(Math.min(Math.max(fx * scaledW - regionW / 2, 0), scaledW - regionW));
  const cropY = Math.round(Math.min(Math.max(fy * scaledH - regionH / 2, 0), scaledH - regionH));
  return { scaledW, scaledH, cropX, cropY };
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download falhou ${res.status}`);
  await streamPipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

/**
 * Insere B-roll em tela cheia nos momentos escolhidos, mantendo o áudio.
 * Refino: clipes deduplicados, encaixe por resolução, orientação conforme o quadro.
 * Só roda com PEXELS_API_KEY.
 * @returns {Promise<{output:string, inserted:number}>}
 */
export async function insertBroll(input, work, meta, analysis, options, onProgress) {
  // Chave da interface (options.pexelsKey) tem prioridade; senão, a do servidor (.env).
  const apiKey = options.pexelsKey || config.broll.pexelsKey;
  // Fonte de imagens: pexels (padrão) ou google (Custom Search). Google exige as
  // credenciais configuradas; se pedirem google sem elas, cai para o Pexels.
  const google = {
    key: config.broll.googleImagesKey,
    cx: config.broll.googleImagesCx,
    unrestricted: config.broll.googleImagesUnrestricted,
  };
  const googleReady = Boolean(google.key && google.cx);
  // Fonte escolhida: pexels (padrão histórico) | google (Custom Search, exige chave) |
  // openverse (Creative Commons, grátis e SEM chave). Google sem credenciais cai para
  // Pexels; Openverse funciona sempre.
  const source = options.imageSource;
  const useGoogle = source === 'google' && googleReady;
  const useOpenverse = source === 'openverse';
  if (!apiKey && !useGoogle && !useOpenverse) {
    log.info('sem fonte de imagens (Pexels/Google/Openverse); pulando B-roll');
    return { output: input, inserted: 0 };
  }
  const moments = (analysis.brollMoments || []).slice(0, options.brollMax ?? 6);
  if (!moments.length) return { output: input, inserted: 0 };

  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const orientation = H >= W ? 'portrait' : 'landscape';

  // Layout: tela cheia (padrão) OU tela dividida (metade a metade) com o vídeo da
  // pessoa em uma metade e o B-roll na outra (o usuário escolhe em cima/embaixo).
  const layout = ['fullscreen', 'top', 'bottom'].includes(options.brollLayout) ? options.brollLayout : 'fullscreen';
  const isSplit = layout !== 'fullscreen';
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const regionW = W;
  const regionH = layout === 'fullscreen' ? H : even(H / 2);
  const ovY = layout === 'bottom' ? H - regionH : 0; // Y da metade do B-roll
  const personY = layout === 'top' ? regionH : 0; // pessoa fica na metade oposta
  // Posição vertical da pessoa dentro da metade dela (topo/centro/base). Na tela
  // dividida a pessoa é ENCAIXADA inteira (não cortada); isto só a alinha na metade.
  const pcrop = ['top', 'center', 'bottom'].includes(options.personCrop) ? options.personCrop : 'center';
  const alignY = pcrop === 'top' ? '0' : pcrop === 'bottom' ? 'H-h' : '(H-h)/2';

  // Baixa clipes distintos; ignora os que falharem ou repetirem. Se não houver
  // VÍDEO para o momento, cai para uma FOTO do Pexels (mesmo contexto/nicho).
  const usedIds = new Set();
  const clips = [];
  for (const m of moments) {
    try {
      let hit = null;
      let isImage = false;
      if (useOpenverse) {
        // Openverse (Creative Commons, sem chave). Se falhar e houver Pexels, cai para ele.
        hit = await searchOpenverse(m.query, usedIds, { unrestricted: google.unrestricted });
        isImage = true;
        if (!hit && apiKey) {
          hit = await searchPexelsPhoto(m.query, orientation, usedIds, apiKey);
        }
      } else if (useGoogle) {
        // Imagens do Google (contextuais). Se falhar e houver Pexels, cai para ele.
        hit = await searchGoogleImages(m.query, usedIds, google);
        isImage = true;
        if (!hit && apiKey) {
          hit = await searchPexelsPhoto(m.query, orientation, usedIds, apiKey);
        }
      } else {
        hit = await searchPexels(m.query, regionH, orientation, usedIds, apiKey);
        if (!hit) {
          hit = await searchPexelsPhoto(m.query, orientation, usedIds, apiKey);
          isImage = true;
        }
      }
      if (!hit) {
        log.info(`sem B-roll para "${m.query}"`);
        continue;
      }
      usedIds.add(hit.id);
      const ext = isImage ? 'jpg' : 'mp4';
      const dest = path.join(work, `broll_${clips.length}.${ext}`);
      await download(hit.link, dest);
      clips.push({ ...m, file: dest, isImage });
    } catch (err) {
      log.warn(`B-roll "${m.query}" falhou: ${err.message}`);
    }
  }
  if (!clips.length) return { output: input, inserted: 0 };

  // Enquadramento da pessoa na tela dividida: foco no ROSTO. Manual (options) tem
  // prioridade; senão detecta pelo rastreador. Sem tracking → cai para contida+desfoque.
  let personFocus = null;
  let personZoom = Math.min(2.5, Math.max(1, Number(options.personZoom) || 1));
  if (isSplit) {
    const mx = Number(options.personFocusX);
    const my = Number(options.personFocusY);
    if (Number.isFinite(mx) && Number.isFinite(my)) {
      personFocus = { x: mx, y: my, source: 'manual' };
      log.info(`enquadramento manual: foco (${mx.toFixed(2)}, ${my.toFixed(2)}) zoom ${personZoom}`);
    } else {
      personFocus = await averageSubjectCenter(input);
      if (personFocus) log.ok(`enquadramento no ${personFocus.source}: foco (${personFocus.x.toFixed(2)}, ${personFocus.y.toFixed(2)})`);
      else log.info('sem rastreamento; pessoa contida com fundo desfocado');
    }
  }

  // Filtergraph: cada clipe (vídeo ou foto) escalado/cropado para a região do
  // layout e sobreposto na sua janela de tempo. Foto → congela pela duração.
  const parts = [];
  clips.forEach((c, i) => {
    const dur = Math.max(0.6, c.end - c.start).toFixed(2);
    parts.push(
      `[${i + 1}:v]scale=${regionW}:${regionH}:force_original_aspect_ratio=increase,crop=${regionW}:${regionH},setsar=1,` +
        `trim=0:${dur},setpts=PTS-STARTPTS+${c.start.toFixed(3)}/TB[b${i}]`,
    );
  });

  let last;
  if (isSplit) {
    // Tela dividida: a pessoa é ENCAIXADA INTEIRA na metade dela (contida, sem cortar
    // a cabeça). O vazio é preenchido por uma cópia ampliada e DESFOCADA do próprio
    // quadro (estilo Reels), e a pessoa é alinhada em topo/centro/base (alignY).
    const n = clips.length;
    const g = personFocus ? faceCropGeometry(W, H, regionW, regionH, personFocus, personZoom) : null;
    parts.push(`[0:v]split=${n + 1}[base]${clips.map((_, i) => `[p${i}]`).join('')}`);
    clips.forEach((_, i) => {
      if (g) {
        // Enquadrado no rosto: cobre a metade e centraliza no foco (preenche, sem cortar a cabeça).
        parts.push(
          `[p${i}]scale=${g.scaledW}:${g.scaledH}:flags=bicubic,` +
            `crop=${regionW}:${regionH}:${g.cropX}:${g.cropY},setsar=1[ph${i}]`,
        );
      } else {
        // Sem rastreamento: pessoa inteira contida sobre fundo desfocado (nada cortado).
        parts.push(`[p${i}]split=2[pbg${i}][pfg${i}]`);
        parts.push(
          `[pbg${i}]scale=${regionW}:${regionH}:force_original_aspect_ratio=increase,` +
            `crop=${regionW}:${regionH},boxblur=18:2,setsar=1[pbb${i}]`,
        );
        parts.push(
          `[pfg${i}]scale=${regionW}:${regionH}:force_original_aspect_ratio=decrease,setsar=1[pff${i}]`,
        );
        parts.push(`[pbb${i}][pff${i}]overlay=x=(W-w)/2:y=${alignY}[ph${i}]`);
      }
    });
    last = '[base]';
    clips.forEach((c, i) => {
      const win = `enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})'`;
      const mid = `[s${i}]`;
      // 1) encaixa a pessoa na metade dela; 2) coloca o B-roll na outra metade.
      parts.push(`${last}[ph${i}]overlay=x=0:y=${personY}:${win}${mid}`);
      parts.push(`${mid}[b${i}]overlay=x=0:y=${ovY}:${win}${i === n - 1 ? '[outv]' : `[o${i}]`}`);
      last = i === n - 1 ? '[outv]' : `[o${i}]`;
    });
  } else {
    // Tela cheia: o B-roll cobre o quadro inteiro durante o momento.
    last = '[0:v]';
    clips.forEach((c, i) => {
      const out = i === clips.length - 1 ? '[outv]' : `[o${i}]`;
      parts.push(
        `${last}[b${i}]overlay=enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})'${out}`,
      );
      last = `[o${i}]`;
    });
  }

  const scriptPath = path.join(work, 'broll_filter.txt');
  await fs.writeFile(scriptPath, parts.join(';\n'), 'utf8');

  const output = path.join(work, 'broll.mp4');
  const args = ['-i', input];
  for (const c of clips) {
    // Foto entra como input em loop, limitado à duração do momento.
    if (c.isImage) args.push('-loop', '1', '-t', Math.max(0.6, c.end - c.start).toFixed(2));
    args.push('-i', c.file);
  }
  args.push('-filter_complex_script', scriptPath, '-map', '[outv]');
  if (meta.hasAudio) args.push('-map', '0:a', '-c:a', 'copy');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'broll', totalDuration: meta.duration, onProgress });
  const nImg = clips.filter((c) => c.isImage).length;
  const layoutLabel = layout === 'fullscreen' ? 'tela cheia' : `tela dividida (${layout === 'top' ? 'em cima' : 'embaixo'})`;
  log.ok(`${clips.length} inserções de B-roll (${clips.length - nImg} vídeos, ${nImg} fotos, ${layoutLabel})`);
  return { output, inserted: clips.length };
}
