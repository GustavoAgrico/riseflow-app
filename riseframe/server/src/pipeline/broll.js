import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { config } from '../config.js';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
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
 * Geometria do enquadramento no rosto: cobre a região e centraliza o crop no ponto
 * de foco (0–1), com zoom opcional. Garante que o crop cabe (head nunca cortada
 * porque o foco fica dentro dos limites). Puro/exportado para teste.
 * @returns {{scaledW:number, scaledH:number, cropX:number, cropY:number}}
 */
/**
 * Enquadra o B-roll na região (cobre sem distorcer). Com o ajuste do usuário, amplia
 * (zoom 1–2.5) e posiciona o recorte no ponto de foco (fx/fy 0–1). Puro/testável.
 */
export function brollFrameVf(regionW, regionH, c = {}) {
  const z = Math.min(2.5, Math.max(1, Number(c.zoom) || 1));
  const fx = Math.min(1, Math.max(0, Number.isFinite(Number(c.fx)) ? Number(c.fx) : 0.5));
  const fy = Math.min(1, Math.max(0, Number.isFinite(Number(c.fy)) ? Number(c.fy) : 0.5));
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const sw = even(regionW * z);
  const sh = even(regionH * z);
  return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${regionW}:${regionH}:(iw-ow)*${fx.toFixed(3)}:(ih-oh)*${fy.toFixed(3)}`;
}

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


// ─── Mais bancos gratuitos ────────────────────────────────────────────────
const UA = { 'User-Agent': 'Riseframe/1.0 (editor de video; contato no site)', Accept: 'application/json' };

/**
 * PIXABAY (vídeos + fotos, licença Pixabay: uso comercial livre, sem atribuição).
 * Precisa de chave grátis (PIXABAY_API_KEY). Puro em relação ao formato da resposta.
 */
export async function pixabayCandidates(query, { key, orientation = 'portrait', limit = 6, targetH = 1280, lang = '' } = {}) {
  if (!key) return [];
  const out = [];
  // Busca digitada pela pessoa vem em português (lang=pt); a automática já vem em inglês.
  const q = encodeURIComponent(query) + (lang ? `&lang=${lang}` : '');
  const rv = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${q}&per_page=${Math.max(3, limit)}&safesearch=true`);
  if (rv.ok) {
    const d = await rv.json();
    for (const h of d.hits || []) {
      const v = h.videos || {};
      // tamanho mais próximo do alvo sem baixar 4K à toa
      const sizes = ['tiny', 'small', 'medium', 'large'].map((k) => v[k]).filter((f) => f?.url);
      const pick = sizes.find((f) => (f.height || 0) >= targetH * 0.7) || sizes[sizes.length - 1];
      if (!pick) continue;
      const thumb = v.medium?.thumbnail || v.small?.thumbnail || v.tiny?.thumbnail || (h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg` : null);
      out.push({ id: `px${h.id}`, link: pick.url, thumb: thumb || pick.url, kind: 'video', source: 'pixabay', credit: h.user ? `Pixabay · ${h.user}` : 'Pixabay' });
    }
  }
  const orient = orientation === 'portrait' ? 'vertical' : 'horizontal';
  const rp = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${q}&image_type=photo&orientation=${orient}&per_page=${Math.max(3, limit)}&safesearch=true`);
  if (rp.ok) {
    const d = await rp.json();
    for (const h of d.hits || []) {
      const link = h.largeImageURL || h.webformatURL;
      if (link) out.push({ id: `pi${h.id}`, link, thumb: h.webformatURL || h.previewURL || link, kind: 'image', source: 'pixabay', credit: h.user ? `Pixabay · ${h.user}` : 'Pixabay' });
    }
  }
  return out;
}

// Licenças que NÃO servem para vídeo publicado/comercial.
const BAD_LICENSE = /\b(NC|ND)\b|non-?commercial|no ?deriv|fair use/i;

/**
 * WIKIMEDIA COMMONS (fotos e vídeos de licença livre; grátis e sem chave). Só entram
 * arquivos com licença livre para uso comercial (CC0, domínio público, CC BY, CC BY-SA).
 * `kind`: 'image' | 'video'.
 */
export async function wikimediaCandidates(query, { kind = 'image', limit = 6 } = {}) {
  const filter = kind === 'video' ? 'filetype:video' : 'filetype:bitmap';
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: `${query} ${filter}`, gsrnamespace: '6', gsrlimit: String(Math.max(4, limit * 2)),
    prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '640',
  });
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: UA });
  if (!r.ok) return [];
  const d = await r.json();
  const pages = Array.isArray(d.query?.pages) ? d.query.pages : Object.values(d.query?.pages || {});
  const out = [];
  for (const pg of pages.sort((a, b) => (a.index || 0) - (b.index || 0))) {
    const ii = pg.imageinfo?.[0];
    if (!ii?.url) continue;
    const lic = ii.extmetadata?.LicenseShortName?.value || '';
    if (!lic || BAD_LICENSE.test(lic)) continue;
    const isVideo = /^video\//.test(ii.mime || '') || /\.(webm|ogv|mp4)$/i.test(ii.url);
    if ((kind === 'video') !== isVideo) continue;
    if (!isVideo && !/^image\/(jpeg|png|webp)/.test(ii.mime || '')) continue; // sem SVG/TIFF/GIF
    if (!isVideo && (ii.width || 0) < 640) continue; // pequena demais para o quadro
    const artist = String(ii.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 60);
    out.push({ id: `w${pg.pageid}`, link: ii.url, thumb: ii.thumburl || ii.url, kind: isVideo ? 'video' : 'image', source: 'wikimedia', credit: `${lic}${artist ? ` · ${artist}` : ''} · Wikimedia Commons` });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * NASA Image and Video Library (domínio público, sem chave). Ótimo para ciência,
 * tecnologia, espaço, natureza vista de cima. Vídeos: busca o arquivo mp4 no manifesto.
 */
export async function nasaCandidates(query, { limit = 4 } = {}) {
  const r = await fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image,video`, { headers: UA });
  if (!r.ok) return [];
  const d = await r.json();
  const out = [];
  for (const it of (d.collection?.items || []).slice(0, limit * 2)) {
    const meta = it.data?.[0] || {};
    const thumb = it.links?.find((l) => l.render === 'image' || /\.(jpe?g|png)$/i.test(l.href || ''))?.href;
    if (!meta.nasa_id || !thumb) continue;
    if (meta.media_type === 'video') {
      try {
        const m = await fetch(it.href, { headers: UA });
        const files = m.ok ? await m.json() : [];
        const mp4 = (files || []).find((u) => /~mobile\.mp4$/i.test(u)) || (files || []).find((u) => /~(small|medium|orig)\.mp4$/i.test(u));
        if (mp4) out.push({ id: `n${meta.nasa_id}`, link: mp4.replace(/^http:/, 'https:'), thumb, kind: 'video', source: 'nasa', credit: 'NASA (domínio público)' });
      } catch {
        /* pula este */
      }
    } else {
      out.push({ id: `n${meta.nasa_id}`, link: thumb.replace('~thumb.', '~large.'), thumb, kind: 'image', source: 'nasa', credit: 'NASA (domínio público)' });
    }
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Fonte efetiva do B-roll: a escolhida, se disponível; senão a mistura de todas.
 * Puro/exportado para teste.
 */
export function resolveSource(wanted, { apiKey, pixabayKey, googleReady } = {}) {
  if (wanted === 'pexels') return apiKey ? 'pexels' : 'mix';
  if (wanted === 'pixabay') return pixabayKey ? 'pixabay' : 'mix';
  if (wanted === 'google') return googleReady ? 'google' : 'mix';
  if (['openverse', 'wikimedia', 'nasa', 'mix'].includes(wanted)) return wanted;
  return 'mix';
}

/** Extensão do arquivo a partir da URL (para o FFmpeg reconhecer webm/ogv/png…). */
export function extOf(url, isImage) {
  const m = String(url || '').split('?')[0].match(/\.([a-z0-9]{2,4})$/i);
  const e = m ? m[1].toLowerCase() : '';
  if (isImage) return ['jpg', 'jpeg', 'png', 'webp'].includes(e) ? e : 'jpg';
  return ['mp4', 'webm', 'ogv', 'mov', 'm4v'].includes(e) ? e : 'mp4';
}

/**
 * Lista VÁRIOS candidatos de B-roll para uma busca (para a tela de revisão do
 * usuário escolher/trocar). Não baixa nada — só devolve links + miniaturas.
 * @returns {Promise<Array<{id:string, link:string, thumb:string, kind:'image'|'video'}>>}
 */
export async function brollCandidates(query, opts = {}) {
  const { source, apiKey, google, pixabayKey, orientation = 'portrait', targetH = 1280, limit = 6, unrestricted = false, lang = '' } = opts;
  // 'mix': junta VÍDEOS (Pexels, Pixabay), Google Imagens e os acervos livres (Creative
  // Commons/Openverse, Wikimedia Commons) numa lista só, intercalada (vídeo primeiro),
  // para o usuário escolher entre todos.
  if (source === 'mix') {
    const srcs = [apiKey ? 'pexels' : null, pixabayKey ? 'pixabay' : null, google?.key && google?.cx ? 'google' : null, 'openverse', 'wikimedia'].filter(Boolean);
    const per = Math.max(3, Math.ceil((limit + 3) / srcs.length));
    const lists = await Promise.all(srcs.map((src) => brollCandidates(query, { ...opts, source: src, limit: per })));
    const mixed = [];
    for (let i = 0; mixed.length < limit + 3 && lists.some((l) => l[i]); i++) {
      for (const l of lists) if (l[i]) mixed.push(l[i]);
    }
    return mixed.slice(0, Math.max(limit, 9));
  }
  const out = [];
  try {
    if (source === 'pixabay') {
      out.push(...await pixabayCandidates(query, { key: pixabayKey, orientation, limit, targetH, lang }));
      // vídeos e fotos intercalados (vídeo primeiro)
      const vids = out.filter((c) => c.kind === 'video');
      const imgs = out.filter((c) => c.kind !== 'video');
      out.length = 0;
      for (let i = 0; i < Math.max(vids.length, imgs.length); i++) { if (vids[i]) out.push(vids[i]); if (imgs[i]) out.push(imgs[i]); }
    } else if (source === 'wikimedia') {
      const [vids, imgs] = await Promise.all([wikimediaCandidates(query, { kind: 'video', limit: 2 }), wikimediaCandidates(query, { kind: 'image', limit })]);
      out.push(...vids, ...imgs);
    } else if (source === 'nasa') {
      out.push(...await nasaCandidates(query, { limit }));
    } else if (source === 'openverse') {
      const params = new URLSearchParams({ q: query, page_size: String(limit * 2), mature: 'false' });
      if (!unrestricted) params.set('license_type', 'commercial');
      const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Riseframe/1.0 (video editor)' },
      });
      if (res.ok) {
        const d = await res.json();
        for (const it of d.results || []) {
          if (it.url && /^https?:\/\//i.test(it.url)) out.push({ id: `o${it.id || it.url}`, link: it.url, thumb: it.thumbnail || it.url, kind: 'image', source: 'openverse' });
        }
      }
    } else if (source === 'google' && google?.key && google?.cx) {
      const params = new URLSearchParams({ key: google.key, cx: google.cx, q: query, searchType: 'image', num: String(limit * 2), safe: 'active', imgType: 'photo', imgSize: 'xlarge' });
      if (!google.unrestricted) params.set('rights', 'cc_publicdomain,cc_attribute,cc_sharealike');
      const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
      if (res.ok) {
        const d = await res.json();
        for (const it of d.items || []) {
          const link = it.link;
          if (link && /\.(jpe?g|png|webp)(\?|$)/i.test(link)) out.push({ id: `g${it.image?.thumbnailLink || link}`, link, thumb: it.image?.thumbnailLink || link, kind: 'image', source: 'google' });
        }
      }
    } else if (apiKey) {
      const loc = lang === 'pt' ? '&locale=pt-BR' : '';
      const rv = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=${orientation}${loc}`, { headers: { Authorization: apiKey } });
      if (rv.ok) {
        const d = await rv.json();
        for (const v of d.videos || []) {
          const f = pickBestVideoFile(v.video_files, targetH);
          if (f) out.push({ id: String(v.id), link: f.link, thumb: v.image, kind: 'video', source: 'pexels' });
        }
      }
      const rp = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=${orientation}${loc}`, { headers: { Authorization: apiKey } });
      if (rp.ok) {
        const d = await rp.json();
        for (const p of d.photos || []) {
          const link = pickBestPhotoFile(p.src);
          if (link) out.push({ id: `p${p.id}`, link, thumb: p.src?.medium || link, kind: 'image', source: 'pexels' });
        }
      }
    }
  } catch (err) {
    log.warn(`candidatos de B-roll "${query}": ${err.message}`);
  }
  return out.slice(0, limit);
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
  const pixabayKey = options.pixabayKey || config.broll.pixabayKey;
  // Fonte pedida, se estiver disponível (Pexels/Pixabay/Google precisam de chave); senão
  // a mistura de tudo o que há — que sempre inclui os acervos livres (CC e Wikimedia).
  const source = resolveSource(options.imageSource, { apiKey, pixabayKey, googleReady });
  const moments = (analysis.brollMoments || []).slice(0, options.brollMax ?? 6);
  const hasPlan = Array.isArray(options.brollPlan) && options.brollPlan.length > 0;
  if (!moments.length && !hasPlan) return { output: input, inserted: 0 };

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

  // ── PLANO TRAVADO (revisão do B-roll): o usuário já escolheu na tela de revisão
  //    o que entra em cada momento. Usa exatamente essas mídias (arquivo próprio ou
  //    URL do banco), sem buscar de novo; itens marcados como removidos são pulados.
  const plan = Array.isArray(options.brollPlan) && options.brollPlan.length ? options.brollPlan : null;
  if (plan) {
    for (const p of plan) {
      if (!p || p.remove) continue;
      const start = Math.max(0, Number(p.start) || 0);
      const end = Math.min(meta.duration, Number(p.end) || start + 3.2);
      if (end - start < 0.6) continue;
      const isImage = p.kind !== 'video';
      try {
        let file = p.file || null; // mídia própria já resolvida pelo servidor
        if (!file && p.url) {
          const ext = extOf(p.url, isImage);
          file = path.join(work, `broll_${clips.length}.${ext}`);
          await download(p.url, file);
        }
        if (!file) continue;
        clips.push({ start, end, query: p.query || 'mídia', term: p.query || null, file, isImage, zoom: p.zoom, fx: p.fx, fy: p.fy, link: p.url || null, credit: p.credit || null });
      } catch (err) {
        log.warn(`B-roll (plano) falhou em ${start.toFixed(1)}s: ${err.message}`);
      }
      if (clips.length >= (options.brollMax ?? 12)) break;
    }
  } else for (const m of moments) {
    try {
      const cands = (await brollCandidates(m.query, {
        source, apiKey, google, pixabayKey, orientation, targetH: regionH, limit: 6, unrestricted: google.unrestricted,
      })).filter((c) => !usedIds.has(c.id));
      // Vídeo (movimento) quando houver entre os primeiros resultados; senão uma foto,
      // variando entre as mais relevantes.
      const hit = cands.slice(0, 4).find((c) => c.kind === 'video') || pickVaried(cands);
      if (!hit) {
        log.info(`sem B-roll para "${m.query}"`);
        continue;
      }
      usedIds.add(hit.id);
      const isImage = hit.kind !== 'video';
      const dest = path.join(work, `broll_${clips.length}.${extOf(hit.link, isImage)}`);
      await download(hit.link, dest);
      clips.push({ ...m, file: dest, isImage, link: hit.link, credit: hit.credit || null, source: hit.source });
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
      `[${i + 1}:v]${brollFrameVf(regionW, regionH, c)},setsar=1,` +
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
    // A metade da pessoa vem da fonte SEM o reenquadramento do vídeo inteiro (quando houver),
    // para o foco/zoom não ser aplicado duas vezes. O resto do vídeo usa a entrada 0.
    const personIdx = options.personInput ? clips.length + 1 : 0;
    if (personIdx) {
      parts.push(`[0:v]null[base]`);
      parts.push(`[${personIdx}:v]split=${n}${clips.map((_, i) => `[p${i}]`).join('')}`);
    } else {
      parts.push(`[0:v]split=${n + 1}[base]${clips.map((_, i) => `[p${i}]`).join('')}`);
    }
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
  if (isSplit && options.personInput) args.push('-i', options.personInput);
  args.push('-filter_complex_script', scriptPath, '-map', '[outv]');
  if (meta.hasAudio) args.push('-map', '0:a', '-c:a', 'copy');
  args.push(...x264Fast(), '-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'broll', totalDuration: meta.duration, onProgress });
  const nImg = clips.filter((c) => c.isImage).length;
  const layoutLabel = layout === 'fullscreen' ? 'tela cheia' : `tela dividida (${layout === 'top' ? 'em cima' : 'embaixo'})`;
  log.ok(`${clips.length} inserções de B-roll (${clips.length - nImg} vídeos, ${nImg} fotos, ${layoutLabel})`);
  // Itens inseridos (para o simulador da página inicial): tempos na timeline deste vídeo.
  const items = clips.map((c) => ({
    start: +c.start.toFixed(3), end: +c.end.toFixed(3), kind: c.isImage ? 'image' : 'video', link: c.link || null,
    query: c.query || c.term || null, zoom: c.zoom, fx: c.fx, fy: c.fy, credit: c.credit || null,
  }));
  return { output, inserted: clips.length, items, layout };
}
