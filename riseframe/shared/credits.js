// Cálculo de créditos por job — usado pelo servidor (cobra) e pelo site (mostra o custo).
// `costs` vem do servidor (GET /api/billing), então os dois sempre concordam.

export const DEFAULT_COSTS = {
  video: 20, // vídeo editado: corte de silêncio + legenda básica
  captionStyle: 10, // legenda estilizada (qualquer estilo além do "clean")
  image: 5, // cada imagem/vídeo de B-roll inserido
  ai: 10, // limpeza de fala por IA (muletas, gaguejos)
  clips: 40, // pacote de clipes curtos
};

function brollCount(o) {
  if (!o.broll) return 0;
  if (Array.isArray(o.brollPlan) && o.brollPlan.length) return o.brollPlan.filter((p) => p && !p.remove).length;
  return Math.max(0, Math.round(Number(o.brollMax) || 6));
}

/**
 * Itens cobrados. mode: 'auto' (vídeo completo de uma vez) | 'transcribe' (envio p/
 * timeline: só o vídeo) | 'render' (render da timeline: só os extras) | 'clips'.
 */
export function creditItems(mode, options = {}, costs = DEFAULT_COSTS) {
  const o = options || {};
  const items = [];
  if (mode === 'clips') return [{ id: 'clips', label: 'Clipes curtos', credits: costs.clips }];
  if (mode === 'auto' || mode === 'transcribe') {
    items.push({ id: 'video', label: 'Vídeo editado (silêncio + legenda básica)', credits: costs.video });
  }
  if (mode === 'transcribe') return items;
  if (o.captions !== false && o.captionTemplate && o.captionTemplate !== 'clean') {
    items.push({ id: 'captionStyle', label: 'Legenda estilizada', credits: costs.captionStyle });
  }
  const n = brollCount(o);
  if (n > 0) items.push({ id: 'image', label: `${n} imagem(ns) de B-roll`, credits: n * costs.image });
  if (o.autoClean) items.push({ id: 'ai', label: 'Limpeza de fala por IA', credits: costs.ai });
  return items;
}

export const creditTotal = (items) => items.reduce((s, i) => s + i.credits, 0);
