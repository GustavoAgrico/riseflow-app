// B-roll pelo NOME: quando a fala cita uma marca, pessoa, lugar ou produto (Apple, Nike,
// Elon Musk, São Paulo, iPhone…), a imagem daquele momento mostra exatamente isso — o
// logo da marca, a foto da pessoa, o lugar — em vez de uma imagem genérica do banco.

/**
 * Marcas conhecidas (a fala às vezes vem sem maiúscula). Só nomes que não são palavras
 * comuns em português ("meta", "vivo", "claro", "visa" ficam de fora de propósito).
 * `m`: formas como aparecem na fala (minúsculas, sem acento).
 */
const BRANDS = [
  ['Apple', ['apple']], ['iPhone', ['iphone']], ['iPad', ['ipad']], ['MacBook', ['macbook']], ['Nike', ['nike']],
  ['Adidas', ['adidas']], ['Google', ['google']], ['Microsoft', ['microsoft']], ['Amazon', ['amazon']],
  ['Netflix', ['netflix']], ['Coca-Cola', ['coca-cola', 'coca cola', 'cocacola']], ['Pepsi', ['pepsi']],
  ["McDonald's", ['mcdonalds', "mcdonald's", 'mc donalds', 'mcdonald']], ['Burger King', ['burger king']],
  ['Starbucks', ['starbucks']], ['Samsung', ['samsung']], ['Tesla', ['tesla']], ['Instagram', ['instagram']],
  ['TikTok', ['tiktok', 'tik tok']], ['YouTube', ['youtube']], ['WhatsApp', ['whatsapp', 'zap zap']],
  ['Facebook', ['facebook']], ['LinkedIn', ['linkedin']], ['Twitter', ['twitter']], ['Spotify', ['spotify']],
  ['Uber', ['uber']], ['Airbnb', ['airbnb']], ['Nubank', ['nubank']], ['Itaú', ['itau']], ['Bradesco', ['bradesco']],
  ['Santander', ['santander']], ['Banco do Brasil', ['banco do brasil']], ['Caixa Econômica', ['caixa economica']],
  ['Magazine Luiza', ['magazine luiza', 'magalu']], ['Mercado Livre', ['mercado livre']], ['Shopee', ['shopee']],
  ['iFood', ['ifood']], ['Natura', ['natura']], ['O Boticário', ['boticario']], ['Havaianas', ['havaianas']],
  ['Petrobras', ['petrobras']], ['Rolex', ['rolex']], ['Louis Vuitton', ['louis vuitton']], ['Gucci', ['gucci']],
  ['Chanel', ['chanel']], ['Prada', ['prada']], ['Zara', ['zara']], ['Red Bull', ['red bull', 'redbull']],
  ['Puma', ['puma']], ['Lego', ['lego']], ['Nintendo', ['nintendo']], ['PlayStation', ['playstation']],
  ['Xbox', ['xbox']], ['OpenAI', ['openai', 'open ai']], ['ChatGPT', ['chatgpt', 'chat gpt']], ['Canva', ['canva']],
  ['Disney', ['disney']], ['Mercedes-Benz', ['mercedes', 'mercedes-benz']], ['BMW', ['bmw']], ['Ferrari', ['ferrari']],
  ['Porsche', ['porsche']], ['Toyota', ['toyota']], ['Volkswagen', ['volkswagen']], ['Heineken', ['heineken']],
  ['Ambev', ['ambev']], ['Nestlé', ['nestle']], ['Intel', ['intel']], ['Nvidia', ['nvidia']], ['Shein', ['shein']],
  ['Hotmart', ['hotmart']], ['Kiwify', ['kiwify']], ['Pix', ['pix']], ['PayPal', ['paypal']], ['Mastercard', ['mastercard']],
  ['Harvard', ['harvard']], ['NASA', ['nasa']], ['FIFA', ['fifa']], ['Copa do Mundo', ['copa do mundo']],
];
const BRAND_FORMS = BRANDS.flatMap(([name, forms]) => forms.map((f) => ({ name, tokens: f.split(/\s+/) })))
  .sort((a, b) => b.tokens.length - a.tokens.length); // "banco do brasil" antes de palavras soltas

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’-]+$/gu, '').replace(/[’]/g, "'").replace(/'s$/, 's');

/** Marca citada num texto curto (ex.: busca digitada "nike"). → nome oficial ou null. */
export function brandIn(text) {
  const toks = String(text || '').split(/\s+/).map(plain).filter(Boolean);
  for (const f of BRAND_FORMS) {
    for (let i = 0; i + f.tokens.length <= toks.length; i++) {
      if (f.tokens.every((t, k) => toks[i + k] === t)) return f.name;
    }
  }
  return null;
}

/** Busca de imagem para cada tipo de nome: marca → logo; pessoa/lugar → foto. */
export function entityQuery(name, kind) {
  return kind === 'brand' ? `${name} logo` : name;
}

// Palavras com maiúscula que não são nomes (começo de frase já é ignorado à parte).
const NOT_NAMES = new Set(['eu', 'voce', 'nos', 'ele', 'ela', 'eles', 'elas', 'deus', 'senhor', 'o', 'a', 'os', 'as', 'e', 'mas', 'entao', 'porque', 'quando', 'se', 'isso', 'esse', 'essa', 'aqui', 'hoje', 'agora', 'brasil']);
const CONNECT = new Set(['de', 'da', 'do', 'dos', 'das']);

/**
 * Nomes citados na fala, com o tempo da primeira vez: marcas da lista (com ou sem
 * maiúscula) e nomes próprios compostos com maiúscula no meio da frase ("Elon Musk",
 * "São Paulo", "Steve Jobs"). → [{ name, kind: 'brand'|'name', start, end }]
 */
export function findEntityMentions(segments = []) {
  const words = [];
  for (const s of segments) {
    const ws = s.words?.length ? s.words : [];
    for (const w of ws) if (!w.removed && String(w.word ?? '').trim()) words.push({ raw: String(w.word).trim(), p: plain(w.word), start: Number(w.start), end: Number(w.end) });
  }
  const found = new Map();
  const add = (name, kind, a, b) => { if (!found.has(name.toLowerCase())) found.set(name.toLowerCase(), { name, kind, start: a.start, end: b.end }); };
  for (let i = 0; i < words.length; i++) {
    const brand = BRAND_FORMS.find((f) => f.tokens.every((t, k) => words[i + k]?.p === t));
    if (brand) { add(brand.name, 'brand', words[i], words[i + brand.tokens.length - 1]); i += brand.tokens.length - 1; continue; }
    // Nome próprio composto: 2+ palavras com maiúscula seguidas (pode ter "de/da/do" no meio),
    // fora do começo de frase.
    const prev = words[i - 1];
    const sentenceStart = !prev || /[.!?…]$/.test(prev.raw);
    const cap = (w) => w && /^\p{Lu}/u.test(w.raw) && w.p.length > 1 && !NOT_NAMES.has(w.p);
    if (sentenceStart || !cap(words[i])) continue;
    let j = i + 1;
    const parts = [words[i].raw];
    while (j < words.length) {
      if (cap(words[j])) { parts.push(words[j].raw); j++; continue; }
      if (CONNECT.has(words[j].p) && cap(words[j + 1])) { parts.push(words[j].raw, words[j + 1].raw); j += 2; continue; }
      break;
    }
    if (parts.length >= 2) {
      add(parts.map((x) => x.replace(/[^\p{L}\p{N}'’.-]+$/u, '')).join(' '), 'name', words[i], words[j - 1]);
      i = j - 1;
    }
  }
  return [...found.values()].sort((a, b) => a.start - b.start);
}

/**
 * Junta os momentos com nome aos momentos de B-roll: cada nome citado ganha o seu
 * momento (marca = logo); um momento genérico que bate no mesmo trecho sai; passou do
 * limite, saem primeiro os genéricos.
 */
export function withEntityMoments(moments = [], segments = [], { duration = Infinity, max = 6, skipIntro = 0 } = {}) {
  const have = moments.filter((m) => m.entity).map((m) => m.entity.toLowerCase());
  const extra = findEntityMentions(segments)
    .filter((e) => e.start >= skipIntro && !have.includes(e.name.toLowerCase()))
    .map((e) => {
      const kind = e.kind === 'brand' ? 'brand' : 'name';
      const start = Math.max(0, e.start - 0.1);
      return { start: +start.toFixed(2), end: +Math.min(duration, start + Math.max(2, e.end - e.start + 1.2)).toFixed(2), query: entityQuery(e.name, kind), term: e.name, entity: e.name, entityKind: kind };
    })
    .filter((m) => m.end - m.start >= 0.8);
  if (!extra.length) return moments;
  const named = [...moments.filter((m) => m.entity), ...extra];
  const overlaps = (a, b) => a.start < b.end && b.start < a.end;
  const generic = moments.filter((m) => !m.entity && !named.some((n) => overlaps(n, m)));
  // nomes primeiro (limite), depois os genéricos que couberem; tudo na ordem do vídeo
  const keptNamed = named.sort((a, b) => a.start - b.start).filter((m, i, l) => !l.slice(0, i).some((x) => overlaps(x, m))).slice(0, max);
  return [...keptNamed, ...generic.slice(0, Math.max(0, max - keptNamed.length))].sort((a, b) => a.start - b.start);
}
