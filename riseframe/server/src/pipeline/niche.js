/**
 * Nicho/linguagem do vídeo → contexto de busca em inglês para o B-roll, de forma
 * que as imagens/vídeos de apoio CASEM com o tema (liderança, médico, mentor...).
 * `core` entra junto da palavra-chave do momento; `fallback` é usado quando não há
 * palavra-chave boa; `kw` são termos (pt) para detecção automática pela transcrição.
 */
export const NICHES = {
  leadership: {
    label: 'Liderança / gestão',
    core: 'business leadership',
    fallback: 'business leader team meeting office',
    kw: ['lideranca', 'lider', 'lideres', 'gestao', 'gestor', 'equipe', 'time', 'chefe', 'chefia', 'delegar', 'estrategia', 'resultado', 'meta', 'metas', 'empresa', 'negocio'],
  },
  mentor: {
    label: 'Mentor / coach',
    core: 'mentor coaching',
    fallback: 'mentor coaching conversation guidance',
    kw: ['mentor', 'mentoria', 'coach', 'coaching', 'aluno', 'alunos', 'ensinar', 'jornada', 'transformacao', 'proposito', 'desenvolvimento', 'crescimento pessoal'],
  },
  medical: {
    label: 'Médico / saúde',
    core: 'doctor healthcare',
    fallback: 'doctor hospital healthcare medical clinic',
    kw: ['medico', 'medica', 'saude', 'paciente', 'pacientes', 'clinica', 'hospital', 'tratamento', 'sintoma', 'sintomas', 'doenca', 'consulta', 'diagnostico', 'remedio', 'exame'],
  },
  fitness: {
    label: 'Fitness / saúde física',
    core: 'fitness workout',
    fallback: 'fitness workout gym training athlete',
    kw: ['treino', 'treinar', 'academia', 'exercicio', 'musculo', 'musculacao', 'dieta', 'emagrecer', 'emagrecimento', 'corpo', 'saude fisica', 'personal'],
  },
  finance: {
    label: 'Finanças / investimentos',
    core: 'finance investment',
    fallback: 'finance money investment stock market charts',
    kw: ['dinheiro', 'investir', 'investimento', 'financas', 'financeiro', 'renda', 'lucro', 'acoes', 'bolsa', 'juros', 'economia', 'poupar', 'rico', 'riqueza'],
  },
  business: {
    label: 'Negócios / empreendedorismo',
    core: 'business corporate',
    fallback: 'business office corporate professional entrepreneur',
    kw: ['empreendedor', 'empreendedorismo', 'startup', 'vendas', 'vender', 'cliente', 'clientes', 'produto', 'mercado', 'faturamento', 'escala', 'empresa'],
  },
  marketing: {
    label: 'Marketing / digital',
    core: 'digital marketing',
    fallback: 'digital marketing social media content creator',
    kw: ['marketing', 'trafego', 'anuncio', 'anuncios', 'conteudo', 'audiencia', 'engajamento', 'seguidores', 'instagram', 'social', 'copy', 'funil', 'lancamento'],
  },
  education: {
    label: 'Educação / ensino',
    core: 'education learning',
    fallback: 'education learning classroom study students',
    kw: ['aula', 'aulas', 'aprender', 'estudar', 'estudo', 'professor', 'escola', 'faculdade', 'curso', 'conhecimento', 'educacao', 'prova', 'concurso'],
  },
  tech: {
    label: 'Tecnologia',
    core: 'technology',
    fallback: 'technology software computer data startup',
    kw: ['tecnologia', 'software', 'programacao', 'codigo', 'dados', 'inteligencia artificial', 'ia', 'app', 'aplicativo', 'sistema', 'inovacao', 'digital'],
  },
  mindset: {
    label: 'Motivação / mentalidade',
    core: 'motivation success',
    fallback: 'motivation success mindset determination sunrise',
    kw: ['motivacao', 'mentalidade', 'foco', 'disciplina', 'sonho', 'sonhos', 'proposito', 'superacao', 'sucesso', 'atitude', 'habito', 'habitos', 'vencer'],
  },
  law: {
    label: 'Direito / jurídico',
    core: 'law legal',
    fallback: 'law legal lawyer justice court office',
    kw: ['direito', 'advogado', 'advogada', 'juridico', 'lei', 'leis', 'processo', 'justica', 'contrato', 'tribunal', 'juiz'],
  },
  realestate: {
    label: 'Imóveis',
    core: 'real estate',
    fallback: 'real estate property house apartment keys',
    kw: ['imovel', 'imoveis', 'apartamento', 'casa', 'aluguel', 'corretor', 'financiamento', 'construtora', 'terreno', 'condominio'],
  },
};

const AUTO = 'auto';

/** minúsculas sem acento, para casar palavras-chave. */
function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Detecta o nicho pela transcrição (contagem de palavras-chave). Retorna o id do
 * nicho ou null quando nada se destaca.
 */
export function detectNiche(text) {
  const t = ` ${fold(text)} `;
  let best = null;
  let bestScore = 0;
  for (const [id, n] of Object.entries(NICHES)) {
    let score = 0;
    for (const k of n.kw) {
      const kk = fold(k);
      // conta ocorrências (limite por termo para não deixar 1 palavra dominar)
      let from = 0;
      let c = 0;
      while (c < 5) {
        const i = t.indexOf(` ${kk}`, from);
        if (i === -1) break;
        c++;
        from = i + kk.length + 1;
      }
      score += c;
    }
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return bestScore >= 2 ? best : null; // exige um mínimo de sinal
}

/**
 * Resolve o nicho efetivo: escolha do usuário (se não 'auto') ou detecção pela fala.
 * @returns {{id:string|null, core:string, fallback:string}|null}
 */
export function resolveNiche(optionNiche, text) {
  const id = optionNiche && optionNiche !== AUTO && NICHES[optionNiche] ? optionNiche : detectNiche(text);
  if (!id || !NICHES[id]) return null;
  return { id, core: NICHES[id].core, fallback: NICHES[id].fallback };
}
