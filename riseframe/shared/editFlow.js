// Meu fluxo de edição: a pessoa monta o PRÓPRIO fluxo (entrevista → referências → perfil →
// plano), e o perfil ativo vira as opções de todo vídeo novo. Baseado no método
// "fluxo-de-edicao" (8 etapas, ofício separado do gosto, caderno de aprendizados).
//
// Funções puras, usadas pelo web (página "Meu fluxo") e pelos testes do servidor.

/** As 8 etapas de referência + o render final (para quem revisa assistindo). */
export const FLOW_STAGES = [
  { id: 'iniciar', label: 'Iniciar', line: 'Abre o projeto e organiza o briefing do vídeo.', tool: 'Criar vídeo (arquivo ou link)' },
  { id: 'preparar', label: 'Preparar', line: 'Transcrição com tempo por palavra e as notas de edição faladas.', tool: 'Transcrição automática' },
  { id: 'cortes', label: 'Cortes', line: 'Tira erros, hesitações e pausas; entrega o primeiro corte.', tool: 'Corte de silêncio + limpeza da fala' },
  { id: 'motion-mapa', label: 'Mapa de motion', line: 'Planeja onde entram as animações e a câmera em volta delas.', tool: 'Momentos-chave da fala' },
  { id: 'assets', label: 'Assets', line: 'Busca imagens, logos e B-roll que as animações pedem.', tool: 'B-roll automático' },
  { id: 'motion-render', label: 'Motion', line: 'Constrói e renderiza cada animação.', tool: 'Motion tipográfico' },
  { id: 'camera', label: 'Câmera', line: 'Zooms e movimentos casados com a fala e as animações.', tool: 'Zoom / punch-in' },
  { id: 'sfx', label: 'Som', line: 'Efeitos sonoros em camadas, alinhados ao que se vê.', tool: 'Efeitos sonoros' },
  { id: 'render', label: 'Render', line: 'Vídeo final pronto para assistir e publicar.', tool: 'Render final' },
];

const stageById = Object.fromEntries(FLOW_STAGES.map((s) => [s.id, s]));

/** Frases padrão da nota de edição falada ("nota de edição, usa esse take, fim da nota"). */
export const DEFAULT_NOTE_OPEN = 'nota de edição';
export const DEFAULT_NOTE_CLOSE = 'fim da nota';

/**
 * A entrevista, na ordem do método. A primeira é sempre ONDE a pessoa revisa (muda o
 * fluxo inteiro). Cada pergunta traz o porquê e a sugestão para o caso dela.
 * `when(a)` esconde perguntas que não se aplicam.
 */
export const QUESTIONS = [
  {
    id: 'review',
    title: 'Onde você revisa o vídeo?',
    why: 'Muda o fluxo inteiro: revisar na timeline deixa você aprovar cada etapa antes do render.',
    options: [
      { id: 'timeline', label: 'Na timeline do Riseframe', hint: 'Abro a edição, confiro os cortes e o resto, e só depois renderizo.' },
      { id: 'pronto', label: 'Assistindo o vídeo pronto', hint: 'Recebo o vídeo final e peço ajustes. Mais simples, cada ajuste é um render novo.' },
      { id: 'fora', label: 'Termino em outro programa', hint: 'Baixo o vídeo e faço o acabamento no Premiere, CapCut, DaVinci…' },
    ],
    suggest: () => 'timeline',
  },
  {
    id: 'videoType',
    title: 'Que tipo de vídeo você faz?',
    why: 'Define o ritmo, quanta animação cabe e quais etapas fazem sentido.',
    options: [
      { id: 'apresentador', label: 'Falando para a câmera', hint: 'YouTube, aula, opinião.' },
      { id: 'reels', label: 'Reels / Shorts / TikTok', hint: 'Curto, vertical, gancho forte.' },
      { id: 'tutorial', label: 'Tutorial com tela', hint: 'Gravação de tela com ou sem rosto.' },
      { id: 'narrado', label: 'Narrado', hint: 'Só voz sobre imagens.' },
      { id: 'podcast', label: 'Podcast em vídeo', hint: 'Conversa longa, várias pessoas.' },
    ],
    suggest: () => 'apresentador',
  },
  {
    id: 'notes',
    title: 'Notas de edição faladas',
    why: 'Durante a gravação você fala "nota de edição … fim da nota" e o trecho sai do vídeo sozinho; a nota fica registrada para você.',
    options: [
      { id: 'sim', label: 'Quero usar', hint: 'O trecho da nota é cortado do vídeo.' },
      { id: 'nao', label: 'Não preciso', hint: '' },
    ],
    suggest: () => 'sim',
  },
  {
    id: 'cutPace',
    title: 'Quanto ar entre as frases?',
    why: 'É o ritmo do corte. Apertado prende atenção; respirado deixa a fala mais natural.',
    options: [
      { id: 'apertado', label: 'Apertado', hint: 'Quase sem pausa. Ritmo de reels.' },
      { id: 'equilibrado', label: 'Equilibrado', hint: 'Pausas curtas, fala natural.' },
      { id: 'respirado', label: 'Respirado', hint: 'Mantém as respirações. Bom para conversa e aula.' },
    ],
    suggest: (a) => (a.videoType === 'reels' ? 'apertado' : a.videoType === 'podcast' || a.videoType === 'narrado' ? 'respirado' : 'equilibrado'),
  },
  {
    id: 'hesitations',
    title: 'E as hesitações ("ééé", "hum", frases refeitas)?',
    why: 'Cortar enxuga muito; na timeline elas aparecem riscadas e você devolve qualquer uma com um toque.',
    options: [
      { id: 'cortar', label: 'Cortar', hint: 'Muletas, gaguejos e frases refeitas saem.' },
      { id: 'manter', label: 'Manter', hint: 'Só as pausas saem.' },
    ],
    suggest: () => 'cortar',
  },
  {
    id: 'motion',
    title: 'Quanta animação?',
    why: 'Animação demais cansa; de menos, o vídeo fica parado. O comum é mais no gancho e menos no corpo.',
    options: [
      { id: 'nenhuma', label: 'Nenhuma', hint: 'Só o corte e a legenda.' },
      { id: 'enfases', label: 'Só nas ênfases', hint: 'Textos animados nas palavras-chave.' },
      { id: 'gancho', label: 'Forte no gancho', hint: 'Muito no começo, menos no corpo.' },
      { id: 'muita', label: 'Muita', hint: 'Animação o vídeo inteiro.' },
    ],
    suggest: (a) => (a.videoType === 'reels' ? 'gancho' : a.videoType === 'podcast' ? 'nenhuma' : 'enfases'),
  },
  {
    id: 'broll',
    title: 'Imagens de apoio (B-roll)?',
    why: 'Imagens que ilustram o que você fala. Essencial em vídeo narrado.',
    options: [
      { id: 'sim', label: 'Sim', hint: 'Busca vídeos e fotos livres pelo assunto da fala.' },
      { id: 'nao', label: 'Não', hint: '' },
    ],
    suggest: (a) => (a.videoType === 'narrado' || a.videoType === 'reels' ? 'sim' : 'nao'),
  },
  {
    id: 'camera',
    title: 'Movimento de câmera',
    why: 'Zoom nos cortes disfarça o pulo do corte; punch nas ênfases dá força às frases-chave.',
    options: [
      { id: 'parada', label: 'Câmera parada', hint: '' },
      { id: 'cortes', label: 'Zoom nos cortes', hint: 'Disfarça o pulo (jump cut).' },
      { id: 'enfases', label: 'Punch nas ênfases', hint: 'Aproxima nas frases fortes.' },
      { id: 'lenta', label: 'Aproximação lenta', hint: 'A câmera vai chegando devagar.' },
      { id: 'dinamica', label: 'Dinâmica', hint: 'Punch nas ênfases + zoom nos cortes.' },
    ],
    suggest: (a) => (a.videoType === 'reels' ? 'dinamica' : a.videoType === 'apresentador' ? 'enfases' : a.videoType === 'podcast' ? 'cortes' : 'parada'),
  },
  {
    id: 'cameraStrength',
    title: 'Quão forte o zoom?',
    why: 'Sutil passa quase despercebido; forte chama atenção para a frase.',
    options: [
      { id: 'suave', label: 'Sutil', hint: '~6%' },
      { id: 'medio', label: 'Médio', hint: '~12%' },
      { id: 'forte', label: 'Forte', hint: '~20%' },
    ],
    when: (a) => a.camera && a.camera !== 'parada',
    suggest: (a) => (a.videoType === 'reels' ? 'forte' : 'medio'),
  },
  {
    id: 'faceFollow',
    title: 'Seguir o rosto quando o formato muda?',
    why: 'De horizontal para vertical, a câmera acompanha a pessoa em vez de cortar no meio.',
    options: [
      { id: 'sim', label: 'Seguir o rosto', hint: '' },
      { id: 'nao', label: 'Corte central', hint: '' },
    ],
    suggest: () => 'sim',
  },
  {
    id: 'sound',
    title: 'Efeitos sonoros',
    why: 'Whoosh, pop e impacto alinhados ao que aparece. Som demais vira ruído.',
    options: [
      { id: 'nenhum', label: 'Nenhum', hint: '' },
      { id: 'sutil', label: 'Sutil', hint: 'Poucos, baixos.' },
      { id: 'medio', label: 'Médio', hint: '' },
      { id: 'forte', label: 'Muitos', hint: 'Em toda entrada e ênfase.' },
    ],
    suggest: (a) => (a.videoType === 'reels' ? 'medio' : a.videoType === 'podcast' ? 'nenhum' : 'sutil'),
  },
];

const questionById = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

/** Perguntas que valem para estas respostas (na ordem). */
export function activeQuestions(answers = {}) {
  return QUESTIONS.filter((q) => !q.when || q.when(answers));
}

/** A sugestão da pergunta para o caso da pessoa (sempre uma opção válida). */
export function suggestFor(qid, answers = {}) {
  const q = questionById[qid];
  if (!q) return null;
  const s = q.suggest ? q.suggest(answers) : null;
  return q.options.some((o) => o.id === s) ? s : q.options[0].id;
}

/** Rótulo legível de uma resposta. */
export function answerLabel(qid, value) {
  const q = questionById[qid];
  return q?.options.find((o) => o.id === value)?.label || '';
}

/** Respostas completas: o que faltar recebe a sugestão (na ordem, pois uma depende da outra). */
export function completeAnswers(answers = {}) {
  const a = { ...answers };
  for (const q of QUESTIONS) {
    if (q.when && !q.when(a)) continue;
    if (!q.options.some((o) => o.id === a[q.id])) a[q.id] = suggestFor(q.id, a);
  }
  if (typeof a.noteOpen !== 'string' || !a.noteOpen.trim()) a.noteOpen = DEFAULT_NOTE_OPEN;
  if (typeof a.noteClose !== 'string' || !a.noteClose.trim()) a.noteClose = DEFAULT_NOTE_CLOSE;
  return a;
}

/**
 * Plano do fluxo: as 8 etapas de referência adaptadas às respostas. Ex.: sem animação
 * pula mapa/motion; sem B-roll pula assets; reels junta o mapa no motion; quem revisa
 * assistindo ganha o render como etapa de revisão.
 * @returns {Array<{id,label,line,tool,review:boolean}>}
 */
export function planFlow(answers = {}) {
  const a = completeAnswers(answers);
  const ids = ['iniciar', 'preparar', 'cortes'];
  const anim = a.motion !== 'nenhuma';
  if (anim && a.videoType !== 'reels') ids.push('motion-mapa');
  if (a.broll === 'sim') ids.push('assets');
  if (anim) ids.push('motion-render');
  if (a.camera !== 'parada') ids.push('camera');
  if (a.sound !== 'nenhum') ids.push('sfx');
  ids.push('render');
  // onde a pessoa para e aprova: na timeline, depois de cada etapa que muda o vídeo;
  // assistindo, só no vídeo pronto (o mapa de motion é aprovado pelo resumo)
  const reviewAt = a.review === 'timeline'
    ? new Set(['cortes', 'motion-mapa', 'motion-render', 'camera', 'sfx', 'render'])
    : new Set(['render']);
  return ids.map((id) => {
    const s = stageById[id];
    const line = id === 'motion-render' && a.videoType === 'reels' && anim
      ? 'Planeja e constrói as animações (no reels o mapa entra junto).'
      : id === 'render' && a.review === 'fora'
        ? 'Vídeo final para baixar e terminar no seu programa.'
        : s.line;
    return { ...s, line, review: reviewAt.has(id) };
  });
}

const PACE_TO_STRENGTH = { apertado: 'forte', equilibrado: 'equilibrado', respirado: 'suave' };
const SOUND_TO_INTENSITY = { sutil: 'suave', medio: 'medio', forte: 'forte' };

/**
 * O perfil vira opções do pipeline (as mesmas chaves do catálogo /api/options).
 * Só o que o perfil decide: legenda e logo continuam com o Brand Kit; formato, com a
 * escolha do vídeo.
 */
export function profileToOptions(profile) {
  if (!profile) return {};
  const a = completeAnswers(profile.answers || {});
  const camera = a.camera;
  const o = {
    cutSilence: true,
    cutStrength: PACE_TO_STRENGTH[a.cutPace] || 'equilibrado',
    cutBreaths: a.cutPace !== 'respirado',
    autoClean: a.hesitations === 'cortar',
    editNotes: a.notes === 'sim',
    editNoteOpen: a.noteOpen,
    editNoteClose: a.noteClose,
    kinetic: a.motion === 'gancho' || a.motion === 'muita' || a.motion === 'enfases',
    kineticAmount: a.motion === 'muita' ? 'muitos' : 'chave',
    broll: a.broll === 'sim',
    videoMotion: camera === 'enfases' || camera === 'dinamica' ? 'dynamic' : camera === 'lenta' ? 'zoom-in' : 'none',
    motionIntensity: ['suave', 'medio', 'forte'].includes(a.cameraStrength) ? a.cameraStrength : 'medio',
    transition: camera === 'cortes' || camera === 'dinamica' ? 'zoomin' : 'none',
    transitionAt: camera === 'cortes' || camera === 'dinamica' ? 'cuts' : 'broll',
    reframeTrack: a.faceFollow !== 'nao',
    soundEffects: a.sound !== 'nenhum',
    sfxIntensity: SOUND_TO_INTENSITY[a.sound] || 'medio',
  };
  if (a.motion === 'nenhuma') o.kinetic = false;
  return o;
}

/** Resumo do perfil em frases curtas (para o card e para a confirmação). */
export function profileSummary(profile) {
  const a = completeAnswers(profile?.answers || {});
  const out = [
    `Revisão: ${answerLabel('review', a.review).toLowerCase()}.`,
    `Corte ${answerLabel('cutPace', a.cutPace).toLowerCase()}${a.hesitations === 'cortar' ? ', sem hesitações' : ', mantendo as hesitações'}.`,
    `Animação: ${answerLabel('motion', a.motion).toLowerCase()}${a.broll === 'sim' ? ' + B-roll' : ''}.`,
    a.camera === 'parada' ? 'Câmera parada.' : `Câmera: ${answerLabel('camera', a.camera).toLowerCase()} (${answerLabel('cameraStrength', a.cameraStrength).toLowerCase()}).`,
    `Som: ${answerLabel('sound', a.sound).toLowerCase()}.`,
  ];
  if (a.notes === 'sim') out.push(`Notas faladas: "${a.noteOpen}" … "${a.noteClose}".`);
  return out;
}

// ─── Referências → perfil ────────────────────────────────────────────────────────────

const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('pt-BR');
/** "na ref 2" / "nas refs 1, 3" */
const refList = (idx) => (idx.length === 1 ? `na ref ${idx[0]}` : `nas refs ${idx.join(', ')}`);

/**
 * Lê as medições das referências (ver server/src/pipeline/refAnalyze.js) e devolve a
 * sugestão de perfil, as regras com número e origem e 3–5 frases simples
 * ("seus vídeos preferidos fazem X"). Tendência, não regra.
 * @param {Array<{name?:string, metrics:object}>} refs
 */
export function synthesizeReferences(refs = []) {
  const list = refs.map((r, i) => ({ i: i + 1, m: r?.metrics || null })).filter((r) => r.m && Number(r.m.duration) > 0);
  if (!list.length) return { suggest: {}, rules: [], sentences: [] };
  const suggest = {};
  const rules = [];
  const sentences = [];
  const all = list.map((r) => r.i);

  // Ritmo de corte: duração média de cada cena.
  const shot = median(list.map((r) => r.m.avgShot));
  if (shot != null) {
    suggest.cutPace = shot < 2 ? 'apertado' : shot < 4 ? 'equilibrado' : 'respirado';
    rules.push({ area: 'cortes', text: `Cena troca a cada ~${fmt1(shot)} s → corte ${answerLabel('cutPace', suggest.cutPace).toLowerCase()}`, origin: `medido ${refList(all)}` });
    sentences.push(`Seus vídeos preferidos trocam de cena a cada ${fmt1(shot)} segundos, em média.`);
  }

  // Câmera: punches (zoom rápido), aproximação lenta e quanto tempo ela se mexe.
  const cam = list.filter((r) => r.m.camera?.available);
  if (cam.length) {
    const idx = cam.map((r) => r.i);
    const punches = median(cam.map((r) => r.m.camera.punchesPerMin));
    const pushes = median(cam.map((r) => r.m.camera.pushesPerMin));
    const moving = median(cam.map((r) => r.m.camera.movingFraction));
    const zoom = median(cam.map((r) => r.m.camera.punchZoom).filter((z) => z > 0));
    if (punches >= 1 && pushes >= 1) suggest.camera = 'dinamica';
    else if (punches >= 1) suggest.camera = 'enfases';
    else if (pushes >= 0.6) suggest.camera = 'lenta';
    else if (moving < 0.1) suggest.camera = 'parada';
    if (zoom != null) suggest.cameraStrength = zoom < 0.08 ? 'suave' : zoom < 0.15 ? 'medio' : 'forte';
    if (suggest.camera) {
      const strength = suggest.cameraStrength ? `, zoom de ~${Math.round(zoom * 100)}%` : '';
      rules.push({ area: 'camera', text: `${fmt1(punches)} punch/min, ${fmt1(pushes)} aproximação lenta/min${strength} → ${answerLabel('camera', suggest.camera).toLowerCase()}`, origin: `medido ${refList(idx)}` });
    }
    sentences.push(moving < 0.1
      ? 'A câmera fica quase sempre parada.'
      : `A câmera se mexe em ${Math.round(moving * 100)}% do tempo${punches >= 1 ? `, com ${fmt1(punches)} punch-ins por minuto` : ''}.`);
  }

  // Movimento na tela (fora os cortes): indica quanta animação há.
  const act = median(list.map((r) => r.m.activity));
  if (act != null) {
    suggest.motion = act > 0.06 ? 'muita' : act > 0.025 ? 'gancho' : act > 0.01 ? 'enfases' : 'nenhuma';
    rules.push({ area: 'motion', text: `Movimento na tela ${fmt1(act * 100)}% por quadro → animação ${answerLabel('motion', suggest.motion).toLowerCase()}`, origin: `medido ${refList(all)}` });
    sentences.push(act > 0.025 ? 'Tem bastante coisa se mexendo na tela além da pessoa.' : 'A tela é calma: pouca coisa se mexe além da pessoa.');
  }

  // Som: picos curtos acima da fala (whoosh, impacto, pop).
  const hits = median(list.map((r) => r.m.audio?.hitsPerMin));
  if (hits != null) {
    suggest.sound = hits >= 12 ? 'forte' : hits >= 6 ? 'medio' : hits >= 2 ? 'sutil' : 'nenhum';
    rules.push({ area: 'som', text: `${fmt1(hits)} picos de som/min → som ${answerLabel('sound', suggest.sound).toLowerCase()}`, origin: `medido ${refList(all)}` });
    if (hits >= 2) sentences.push(`Tem um efeito de som a cada ${fmt1(60 / hits)} segundos, mais ou menos.`);
  }

  return { suggest, rules, sentences: sentences.slice(0, 5) };
}

// ─── Caderno de aprendizados ─────────────────────────────────────────────────────────

/**
 * Ajustes comuns que já sabem onde entram no perfil. Um aprendizado livre (texto) também
 * pode ser anotado; esses a pessoa marca à mão (aplicado / só deste vídeo).
 */
export const LEARNING_PRESETS = [
  { id: 'cut-more-air', stage: 'cortes', text: 'Cortes mais respirados', key: 'cutPace', order: ['apertado', 'equilibrado', 'respirado'], step: 1 },
  { id: 'cut-less-air', stage: 'cortes', text: 'Cortes mais apertados', key: 'cutPace', order: ['apertado', 'equilibrado', 'respirado'], step: -1 },
  { id: 'zoom-softer', stage: 'camera', text: 'Zoom mais sutil', key: 'cameraStrength', order: ['suave', 'medio', 'forte'], step: -1 },
  { id: 'zoom-stronger', stage: 'camera', text: 'Zoom mais forte', key: 'cameraStrength', order: ['suave', 'medio', 'forte'], step: 1 },
  { id: 'less-motion', stage: 'motion-render', text: 'Menos animação', key: 'motion', order: ['nenhuma', 'enfases', 'gancho', 'muita'], step: -1 },
  { id: 'more-motion', stage: 'motion-render', text: 'Mais animação', key: 'motion', order: ['nenhuma', 'enfases', 'gancho', 'muita'], step: 1 },
  { id: 'less-sound', stage: 'sfx', text: 'Menos efeitos sonoros', key: 'sound', order: ['nenhum', 'sutil', 'medio', 'forte'], step: -1 },
  { id: 'more-sound', stage: 'sfx', text: 'Mais efeitos sonoros', key: 'sound', order: ['nenhum', 'sutil', 'medio', 'forte'], step: 1 },
];

const presetById = Object.fromEntries(LEARNING_PRESETS.map((p) => [p.id, p]));

/**
 * Aplica um aprendizado de ajuste ao perfil. Devolve um NOVO perfil (respostas mudadas +
 * regra com a origem "pedido em dd/mm") e o aprendizado marcado; ou `changed:false` se já
 * estava no limite (ex.: zoom já é o mais sutil).
 */
export function applyLearning(profile, learning, today = new Date()) {
  const p = presetById[learning?.preset];
  if (!profile || !p) return { profile, learning, changed: false };
  const answers = completeAnswers(profile.answers || {});
  const i = p.order.indexOf(answers[p.key]);
  const j = Math.max(0, Math.min(p.order.length - 1, (i < 0 ? 0 : i) + p.step));
  const date = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
  if (i === j) {
    return { profile, learning: { ...learning, status: 'aplicado', appliedTo: 'já estava no limite' }, changed: false };
  }
  const value = p.order[j];
  const label = answerLabel(p.key, value) || value;
  const rules = [...(profile.rules || []), { area: p.stage, text: `${p.text}: ${label.toLowerCase()}`, origin: `pedido em ${date}` }];
  return {
    profile: { ...profile, answers: { ...answers, [p.key]: value }, rules },
    learning: { ...learning, status: 'aplicado', appliedTo: `perfil → ${questionById[p.key]?.title || p.key}: ${label}` },
    changed: true,
  };
}
