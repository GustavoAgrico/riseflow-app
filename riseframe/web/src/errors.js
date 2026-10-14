/**
 * Mensagens de erro em linguagem simples: o que aconteceu e o que fazer. A mensagem
 * técnica original continua disponível (detalhe) para o suporte.
 */
const RULES = [
  [/conex[aã]o caiu|falha de rede|failed to fetch|networkerror|load failed/i, 'A internet caiu durante o envio. Clique em "Tentar de novo": o envio continua de onde parou.'],
  [/limite (é|e) |maior que o limite|413/i, null], // já é clara
  [/sem espa[cç]o|ENOSPC|507/i, 'O servidor ficou sem espaço para este vídeo agora. Tente de novo em alguns minutos ou envie um vídeo menor.'],
  [/moov atom|invalid data found|could not find codec|vídeo inválido|end of file|corrupt/i, 'Não consegui ler este arquivo — ele parece incompleto ou corrompido. Exporte de novo em MP4 (H.264) e envie outra vez.'],
  [/formato não suportado/i, 'Este formato de arquivo não é aceito. Envie MP4, MOV, MKV, WEBM, AVI ou M4V.'],
  [/todos os trechos foram removidos/i, 'Todos os trechos foram cortados — não sobrou nada para o vídeo. Devolva algum trecho na timeline e exporte de novo.'],
  [/não foi possível obter a transcrição|sem fala|no speech/i, 'Não encontrei fala neste vídeo para transcrever. Confira se o áudio está ligado e audível.'],
  [/timeout|timed out|ETIMEDOUT/i, 'Uma etapa demorou demais e foi interrompida. Tente de novo — se repetir, envie um trecho menor do vídeo.'],
  [/402|créditos|saldo|edições grátis/i, null],
  [/401|sessão|token/i, 'Sua sessão expirou. Entre de novo na sua conta e tente outra vez.'],
  [/killed|SIGKILL|out of memory|ENOMEM/i, 'O servidor ficou sem memória processando este vídeo. Tente de novo com qualidade menor (720p/1080p) ou um vídeo mais curto.'],
];

export function friendlyError(raw) {
  const msg = String(raw || 'erro desconhecido');
  for (const [re, text] of RULES) {
    if (re.test(msg)) return { text: text || capitalize(msg), detail: text ? msg : '' };
  }
  return { text: `Não deu para terminar este vídeo. ${capitalize(msg)}`, detail: '' };
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
