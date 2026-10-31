// Elementos das cenas de motion: o assunto da fala vira um objeto 3D flutuando em volta do
// texto (ampulheta no "tempo", saco de dinheiro no "dinheiro", cérebro no "cérebro"...) com o
// som que combina, e a palavra principal ganha rabiscos coloridos (sublinhado, brilho).
//
// Objetos: Fluent Emoji 3D (Microsoft, licença MIT) em server/assets/elements/<id>.png.
// Rabiscos: PNG brancos em server/assets/elements/doodles/<id>.png, coloridos no render
// (`tint`) e na prévia (máscara CSS). Tudo vira camada de imagem normal da timeline, com as
// animações e movimentos de shared/elementMotion.js, desenhada POR CIMA das cenas (`above`).

const W = (re) => new RegExp(`(?<!\\p{L})(?:${re})(?!\\p{L})`, 'iu');

// [id do conceito, objeto 3D, regex (pt + en), sons (o primeiro que existir)]
export const CONCEPTS = [
  ['time', 'hourglass', W('tempo|tempos|prazo|prazos|demora|demorar|demorou|anos|meses|minutos?|horas?|hours?|minutes?'), ['clock', 'pop']],
  ['clock', 'alarm-clock', W('rel[oó]gio|acordar|acordei|madrugada|cedo|atrasad[oa]s?|atraso|pontual|deadline|alarm'), ['clock', 'ding']],
  ['money', 'money-bag', W('dinheiro|grana|lucro|lucros|faturamento|faturar|faturei|r\\$|reais|d[oó]lar(?:es)?|milh[aã]o|milh[oõ]es|riqueza|rico|ricos|money|profit|cash'), ['cash', 'coin']],
  ['spend', 'money-wings', W('gastar|gastei|gasto|gastos|desperd[ií]cio|perdi dinheiro|caro|cara demais|d[ií]vida|d[ií]vidas|spend|debt'), ['whooshdown', 'swoosh']],
  ['sale', 'shopping', W('vender|vendas|venda|vendi|comprar|compra|compras|comprei|cliente|clientes|loja|produto|produtos|sell|sales|customers?'), ['cash', 'coin']],
  ['brain', 'brain', W('c[eé]rebro|mente|mental|neur[oô]nios?|cabe[cç]a|mem[oó]ria|brain|mind'), ['magic', 'sparkle']],
  ['idea', 'bulb', W('ideia|ideias|insight|criatividade|criativ[oa]|inova[cç][aã]o|solu[cç][aã]o|idea|ideas'), ['ding', 'sparkle']],
  ['think', 'thinking', W('pensar|pensa|pensando|pensei|d[uú]vida|d[uú]vidas|ser[aá] que|por que|porque n[aã]o|think|wonder'), ['bubble', 'pop']],
  ['growth', 'chart-up', W('crescer|cresceu|crescimento|escalar|escala|resultado|resultados|aumentar|aumentou|dobrar|dobrou|subir|subiu|growth|grow|results?'), ['success', 'riser']],
  ['fall', 'chart-down', W('cair|caiu|queda|perder|perdeu|perdi|preju[ií]zo|diminuir|diminuiu|fracasso|fail|loss'), ['whooshdown', 'fail']],
  ['fast', 'rocket', W('r[aá]pido|r[aá]pida|acelerar|explodir|explodiu|decolar|lan[cç]amento|lan[cç]ar|fast|launch'), ['riser', 'whoosh']],
  ['error', 'cross', W('erro|erros|errado|errada|errar|errei|n[aã]o fa[cç]a|pare de|nunca fa[cç]a|wrong|mistake'), ['error', 'fail']],
  ['alert', 'warning', W('cuidado|aten[cç][aã]o|perigo|alerta|risco|riscos|golpe|warning|danger'), ['error', 'notify']],
  ['right', 'check', W('certo|correto|funciona|funcionou|aprovad[oa]|isso mesmo|correct'), ['success', 'ding']],
  ['goal', 'target', W('meta|metas|objetivo|objetivos|foco|focar|alvo|prop[oó]sito|goal|focus|target'), ['impact', 'thud']],
  ['fire', 'fire', W('fogo|viral|viralizar|viralizou|quente|bomb[aá]stico|incr[ií]vel|absurdo|fire|hot'), ['boom', 'impact']],
  ['secret', 'lock', W('segredo|segredos|secreto|escondido|privado|ningu[eé]m conta|secret'), ['magic', 'sparkle']],
  ['key', 'key', W('chave|destravar|desbloquear|liberar|acesso|unlock|access'), ['sparkle', 'bling']],
  ['phone', 'phone', W('celular|instagram|tiktok|reels|whatsapp|aplicativo|app|redes sociais|rede social|story|stories|phone'), ['notify', 'pop']],
  ['work', 'folder', W('trabalho|trabalhar|arquivo|arquivos|pasta|pastas|organizar|organiza[cç][aã]o|documentos?|processo|processos|tarefa|tarefas|work|files?'), ['pop', 'click']],
  ['write', 'pen', W('escrever|escreva|escrevi|anotar|anote|caneta|assinar|contrato|roteiro|write|notes?'), ['typing', 'click']],
  ['list', 'memo', W('lista|listas|planejamento|planejar|plano|passo a passo|checklist|list|plan'), ['typing', 'pop']],
  ['computer', 'laptop', W('computador|notebook|site|internet|online|sistema|software|programa|computer|laptop|website'), ['typing', 'click']],
  ['keyboard', 'keyboard', W('digitar|digitando|teclado|typing|keyboard'), ['typing', 'click']],
  ['leader', 'crown', W('rei|rainha|l[ií]der|lideran[cç]a|chefe|dono|dona|empres[aá]rio|empres[aá]ria|ceo|king|queen|boss|leader'), ['bling', 'sparkle']],
  ['strategy', 'chess', W('estrat[eé]gia|estrat[eé]gias|estrat[eé]gico|xadrez|jogada|t[aá]tica|strategy'), ['thud', 'impact']],
  ['team', 'handshake', W('equipe|time|parceria|parceiro|parceiros|s[oó]cio|s[oó]cios|respons[aá]vel|respons[aá]veis|juntos|acordo|neg[oó]cio|neg[oó]cios|team|partner|deal'), ['pop', 'bubble']],
  ['people', 'people', W('pessoas|pessoa|gente|p[uú]blico|seguidores|audi[eê]ncia|fam[ií]lia|people|followers|audience'), ['pop', 'bubble']],
  ['love', 'heart', W('amor|amar|cora[cç][aã]o|paix[aã]o|apaixonad[oa]|gostar|love|heart'), ['heartbeat', 'pop']],
  ['best', 'star', W('melhor|melhores|top|destaque|estrela|n[uú]mero um|premium|best|star'), ['sparkle', 'bling']],
  ['magic', 'sparkles', W('m[aá]gica|m[aá]gico|transformar|transformou|transforma[cç][aã]o|novidade|magic'), ['magic', 'sparkle']],
  ['look', 'eyes', W('olha|olhe|olhar|veja|repara|reparou|look|watch'), ['pop', 'bubble']],
  ['talk', 'megaphone', W('falar|fala|falei|anunciar|an[uú]ncio|divulgar|marketing|comunicar|voz|speak|announce'), ['notify', 'pop']],
  ['chat', 'speech', W('conversa|conversar|mensagem|mensagens|coment[aá]rio|coment[aá]rios|responder|chat|message|comments?'), ['notify', 'bubble']],
  ['gift', 'gift', W('presente|b[oô]nus|gr[aá]tis|de gra[cç]a|brinde|surpresa|free|gift|bonus'), ['magic', 'bling']],
  ['calendar', 'calendar', W('semana|semanas|calend[aá]rio|agenda|rotina|amanh[aã]|calendar|daily|weekly'), ['click', 'pop']],
  ['home', 'house', W('casa|lar|im[oó]vel|apartamento|morar|home|house'), ['pop', 'bubble']],
  ['strength', 'muscle', W('for[cç]a|forte|fortes|treino|treinar|academia|disciplina|strong|strength'), ['impact', 'thud']],
  ['energy', 'bolt', W('energia|poder|potente|turbo|intenso|power|energy'), ['zap', 'laser']],
  ['learn', 'books', W('aprender|aprendi|estudar|estudo|livro|livros|conhecimento|leitura|ler|learn|study|books?'), ['ding', 'sparkle']],
  ['course', 'grad-cap', W('curso|cursos|faculdade|aula|aulas|mentoria|formado|formatura|course|class'), ['success', 'ding']],
  ['world', 'globe', W('mundo|global|pa[ií]s|brasil|internacional|world'), ['whoosh', 'swoosh']],
  ['question', 'question', W('pergunta|perguntas|perguntar|questionar|question|ask'), ['notify', 'ding']],
  ['win', 'trophy', W('vencer|venci|ganhar|ganhei|vit[oó]ria|conquista|conquistar|conquistei|campe[aã]o|sucesso|win|winner|success'), ['success', 'bling']],
  ['boom', 'bomb', W('bomba|explos[aã]o|chocante|choque|impacto|bomb|shock'), ['boom', 'impact']],
  ['mail', 'envelope', W('e-?mail|carta|newsletter|inbox|mail'), ['notify', 'pop']],
  ['system', 'gear', W('autom[aá]tico|automatizar|automa[cç][aã]o|engrenagem|funcionamento|m[aá]quina|setup|automation|system'), ['click', 'kick']],
  // assuntos que só têm recorte realista (o objeto 3D é o mais próximo, para os estilos sem recorte)
  ['travel', 'globe', W('viagem|viagens|viajar|viajei|avi[aã]o|aeroporto|voar|voo|voos|destino|turismo|travel|trip|flight|plane'), ['whoosh', 'swoosh']],
  ['stage', 'megaphone', W('palco|podcast|programa|est[uú]dio|televis[aã]o|tv|entrevista|apresenta[cç][aã]o|show|stage|studio'), ['pr-shine', 'pop']],
  ['shout', 'megaphone', W('gritar|grito|gritando|berrar|boca|calar|cala a boca|falar alto|shout|scream|mouth'), ['boom', 'impact']],
  ['past', 'hourglass', W('antigamente|passado|antigo|antiga|antigos|hist[oó]ria|tradi[cç][aã]o|velho|velha|old|history'), ['clock', 'pop']],
];

/**
 * Recortes realistas (fotos/3D com fundo transparente, em server/assets/elements/real):
 * quando o assunto tem recorte, ele entra no lugar do objeto 3D (emoji) — fica mais perto
 * das referências. Vários recortes no mesmo assunto: a escolha varia pela palavra falada.
 */
export const REAL_OBJECTS = {
  time: ['real/hourglass-gold', 'real/clock-antique'],
  clock: ['real/clock-antique', 'real/clock-gears'],
  system: ['real/gear-gold', 'real/clock-gears'],
  strategy: ['real/chess-set', 'real/rook-gold'],
  leader: ['real/rook-gold'],
  boom: ['real/time-bomb'],
  alert: ['real/time-bomb'],
  travel: ['real/airplane'],
  stage: ['real/tv-stage'],
  shout: ['real/mouth'],
  talk: ['real/mouth'],
  past: ['real/clock-antique'],
};
const REAL_IDS = [...new Set(Object.values(REAL_OBJECTS).flat())];
/** Recorte realista do assunto (estável para a mesma palavra) ou null. */
export function realObject(conceptId, word = '') {
  const list = REAL_OBJECTS[conceptId];
  if (!list?.length) return null;
  let h = 0;
  for (const ch of String(word).toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/** Ids de todos os objetos 3D usados (= arquivos em server/assets/elements). */
export const ELEMENT_ASSETS = [...new Set([...CONCEPTS.map((c) => c[1]), ...REAL_IDS])];
/** Rabiscos usados nas cenas (= arquivos em server/assets/elements/doodles). */
export const SCENE_DOODLES = ['underline', 'squiggle', 'sparkle', 'star-4', 'arrow-curved', 'zigzag', 'circle-hand'];

const clean = (w) => String(w?.word ?? '').trim();

/**
 * Conceitos falados num trecho, na ordem em que aparecem (um por conceito).
 * @returns {Array<{id:string, element:string, sfx:string[], word:object, index:number}>}
 */
export function conceptsIn(words) {
  const found = [];
  const seen = new Set();
  (words || []).forEach((w, i) => {
    const one = clean(w);
    const two = i + 1 < words.length ? `${one} ${clean(words[i + 1])}` : null;
    for (const [id, element, re, sfx] of CONCEPTS) {
      if (seen.has(element)) continue;
      if (re.test(one) || (two && re.test(two) && !re.test(clean(words[i + 1])))) {
        seen.add(element);
        // `real`: o recorte realista do assunto (quando há), usado pelos estilos de motion desenhados
        found.push({ id, element, real: realObject(id, one), sfx, word: w, index: i });
        break;
      }
    }
  });
  return found;
}

/** Primeiro som da lista que existe no catálogo. */
export function conceptSfx(c, available) {
  return (c?.sfx || []).find((id) => !available || available.has(id)) || null;
}

/** Fundos animados (vídeo em loop de 6 s); os outros fundos são imagem. */
export const ANIMATED_BACKGROUNDS = new Set(['preto-raios', 'grade-ondulada', 'azul-grade', 'cinza-manchas', 'holofote-cone', 'lampada', 'azul-orbita', 'lilas-flor']);
/** Extensão do arquivo de um elemento (fundos: MP4 animado ou JPG; objetos e rabiscos: PNG). */
export const elementExt = (id) => {
  const s = String(id);
  if (!s.startsWith('backgrounds/')) return 'png';
  return ANIMATED_BACKGROUNDS.has(s.slice(12)) ? 'mp4' : 'jpg';
};
// proporção altura/largura dos PNGs dos rabiscos usados aqui
const DOODLE_AR = { underline: 30 / 160, squiggle: 40 / 160, sparkle: 1, 'star-4': 1 };
const r3 = (v) => +Number(v).toFixed(3);

/**
 * Elementos de uma cena (camadas de imagem) e os sons dos objetos.
 * @param {object} o
 * @param {Array} o.words palavras da cena
 * @param {Array} o.lines linhas compostas (com y, h, size, text, role, words)
 * @param {object} [o.star] linha de destaque
 * @param {string} o.theme tema da cena
 * @param {number} o.start início
 * @param {number} o.end fim
 * @param {number} o.aspect largura/altura do quadro
 * @param {number} o.index número da cena (alterna lados e entradas)
 * @param {Set<string>} [o.available] sons existentes
 * @param {string} [o.tint] cor dos rabiscos (a do tema)
 * @param {boolean} [o.glass] cena com card de vidro (os objetos saem pelos cantos do card)
 * @returns {{elements:Array, sfx:Array}}
 */
export function sceneElements({ words, lines, star, start, end, aspect, index = 0, available = null, tint = '#FF5A1F', glass = false }) {
  const elements = [];
  const sfx = [];
  if (!lines?.length) return { elements, sfx };
  const top = Math.min(...lines.map((l) => l.y - l.h / 2));
  const bottom = Math.max(...lines.map((l) => l.y + l.h / 2));
  const side = index % 2 ? -1 : 1;
  const base = (at, extra) => ({
    kind: 'image', mode: 'pip', above: true, layer: 12,
    start: r3(Math.max(start, at)), duration: r3(Math.max(0.3, end - Math.max(start, at))),
    animOut: 'fade', animDur: 0.45, ...extra,
  });

  // 1) objetos 3D dos assuntos (até 2 por cena): ficam no espaço livre acima/abaixo do bloco
  //    (o maior para o principal), no tamanho que couber — nunca em cima do texto
  const concepts = conceptsIn(words).slice(0, 2);
  const ENTRIES = ['elastic', 'bounce', 'drop'];
  const zones = [
    { at: 'top', room: top - 0.06 },
    { at: 'bottom', room: 0.94 - bottom - 0.03 },
  ].sort((a, b) => b.room - a.room);
  concepts.forEach((c, k) => {
    let cx;
    let cy;
    let scale;
    if (glass) {
      // saindo do canto do card de vidro (em cima de um lado, embaixo do outro)
      scale = k === 0 ? 0.26 : 0.18;
      const h = scale * aspect;
      cx = 0.5 + (k === 0 ? 0.3 : -0.3) * side;
      cy = k === 0 ? top - 0.035 - h * 0.15 : bottom + 0.035 + h * 0.15;
    } else {
      const z = zones[k];
      if (!z) return;
      scale = Math.min(k === 0 ? 0.3 : 0.2, (z.room - 0.015) / aspect);
      if (scale < 0.11) return; // sem espaço: melhor sem objeto do que em cima do texto
      const h = scale * aspect;
      cy = z.at === 'top' ? top - 0.012 - h / 2 : bottom + 0.03 + h / 2;
      cx = k === 0 ? 0.5 + [0, 0.17, -0.17][index % 3] : 0.5 - 0.26 * side;
    }
    elements.push(base(c.word.start - 0.06, {
      element: c.element, cx: r3(cx), cy: r3(cy), scale: r3(scale),
      rot: (k === 0 ? 9 : -12) * side,
      animIn: k === 0 ? ENTRIES[index % ENTRIES.length] : 'elastic',
      motion: k === 0 ? 'float-rotate' : 'float', motionSpeed: k === 0 ? 1 : 1.3, motionAmp: k === 0 ? 1.1 : 0.9,
    }));
    const s = conceptSfx(c, available);
    if (s) sfx.push({ t: +Math.max(0, c.word.start - 0.03).toFixed(3), type: s, volume: k === 0 ? 0.9 : 0.75, why: `assunto: ${c.id}` });
  });

  // 2) rabisco colorido na palavra principal (sublinhado à mão) e brilho no número
  const keyLine = star || lines.find((l) => l.role === 'key');
  if (keyLine) {
    const id = index % 2 ? 'squiggle' : 'underline';
    const lineW = Math.min(0.9, (keyLine.w ?? keyLine.text.length * 0.6 * keyLine.size) / aspect);
    const scale = r3(Math.max(0.25, lineW * 1.06));
    const h = scale * aspect * DOODLE_AR[id];
    elements.push(base(keyLine.words[keyLine.words.length - 1].end - 0.05, {
      element: `doodles/${id}`, tint, cx: r3(keyLine.x ?? 0.5), cy: r3(keyLine.y + keyLine.h / 2 + h * 0.1),
      scale, animIn: 'grow', animDur: 0.35, layer: 11,
    }));
  }
  const num = lines.find((l) => l.role === 'num');
  if (num) {
    const lineW = Math.min(0.8, (num.w ?? num.text.length * 0.6 * num.size) / aspect);
    elements.push(base(num.words[0].start + 0.1, {
      element: 'doodles/sparkle', tint, cx: r3(Math.min(0.94, (num.x ?? 0.5) + lineW / 2 + 0.035)), cy: r3(num.y - num.h * 0.32),
      scale: 0.09, animIn: 'spin', motion: 'pulse', motionSpeed: 1.4, motionAmp: 1.4,
    }));
  }
  return { elements, sfx };
}
