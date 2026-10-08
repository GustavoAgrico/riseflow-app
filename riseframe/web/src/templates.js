// Templates por nicho: um conjunto pronto de ajustes (estilo da legenda, cor, zoom,
// imagens de apoio e nicho das imagens). "Usar template" abre o Criar vídeo com tudo
// isso aplicado — dá para mudar qualquer coisa depois.
export const NICHE_CATEGORIES = [
  { id: 'todos', label: 'Todos', icon: 'grid' },
  { id: 'empresario', label: 'Empresário', icon: 'target' },
  { id: 'infoprodutor', label: 'Infoprodutor', icon: 'sparkles' },
  { id: 'advogado', label: 'Advogado', icon: 'shield' },
  { id: 'medico', label: 'Médico / saúde', icon: 'heart' },
  { id: 'imobiliario', label: 'Imobiliário', icon: 'home' },
  { id: 'podcast', label: 'Podcast', icon: 'podcast' },
  { id: 'agencia', label: 'Agência / marketing', icon: 'megaphone' },
  { id: 'educacao', label: 'Educação', icon: 'captions' },
  { id: 'fitness', label: 'Fitness', icon: 'zap' },
];

const base = { captions: true, cutSilence: true, autoClean: true, colorLook: 'auto', soundEffects: false };

export const TEMPLATES = [
  { id: 'estrategia', cat: 'empresario', title: 'Estratégia gera resultados', desc: 'Destaque seu posicionamento', preset: 'premium', options: { ...base, niche: 'business', videoMotion: 'dynamic', soundEffects: true } },
  { id: 'bastidores', cat: 'empresario', title: 'Rotina de um empresário', desc: 'Conte os bastidores da sua rotina', preset: 'duaslinhas', options: { ...base, niche: 'leadership', videoMotion: 'dynamic', broll: true } },
  { id: 'produto', cat: 'infoprodutor', title: 'Seu produto é a solução', desc: 'Explique seu produto ou serviço', preset: 'karaoke', options: { ...base, niche: 'marketing', videoMotion: 'dynamic', broll: true } },
  { id: 'aula', cat: 'infoprodutor', title: '3 passos para começar', desc: 'Conteúdo educativo que vende', preset: 'marcatexto', options: { ...base, niche: 'mentor', videoMotion: 'dynamic' } },
  { id: 'direito', cat: 'advogado', title: 'Você conhece seus direitos?', desc: 'Tire dúvidas jurídicas comuns', preset: 'classico', options: { ...base, niche: 'law', videoMotion: 'zoom-in' } },
  { id: 'saude', cat: 'medico', title: 'O que ninguém te contou', desc: 'Orientação de saúde com autoridade', preset: 'caixabranca', options: { ...base, niche: 'medical', videoMotion: 'zoom-in' } },
  { id: 'imovel', cat: 'imobiliario', title: 'Esse imóvel tem tudo', desc: 'Apresente imóveis e oportunidades', preset: 'destaque', options: { ...base, niche: 'realestate', broll: true, videoMotion: 'ken-burns' } },
  { id: 'corte', cat: 'podcast', title: 'O melhor momento do episódio', desc: 'Cortes curtos do seu podcast', preset: 'premium', format: 'cortes', options: { ...base, niche: 'auto', soundEffects: true } },
  { id: 'case', cat: 'agencia', title: 'Resultado do cliente', desc: 'Mostre cases e resultados', preset: 'impacto', options: { ...base, niche: 'marketing', videoMotion: 'dynamic', broll: true } },
  { id: 'dica', cat: 'educacao', title: 'Uma dica rápida', desc: 'Explicação curta e direta', preset: 'minimal', options: { ...base, niche: 'education', videoMotion: 'none' } },
  { id: 'treino', cat: 'fitness', title: 'Faça isso todo dia', desc: 'Dicas de treino e hábitos', preset: 'pop', options: { ...base, niche: 'fitness', videoMotion: 'dynamic' } },
];
