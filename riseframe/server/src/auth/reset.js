import crypto from 'node:crypto';

/**
 * Tokens de recuperação de senha em memória. Simples e sem dependências: some no
 * restart (aceitável — links de recuperação são de curta duração de qualquer forma).
 * Chave = token (aleatório); valor = { email, exp }.
 */
const tokens = new Map();
const TTL_MS = 30 * 60 * 1000; // 30 minutos

function sweep() {
  const now = Date.now();
  for (const [t, v] of tokens) if (v.exp < now) tokens.delete(t);
}

/** Cria e guarda um token de recuperação para o email. Retorna o token. */
export function createResetToken(email) {
  sweep();
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, { email: String(email || '').trim().toLowerCase(), exp: Date.now() + TTL_MS });
  return token;
}

/** Consome o token (uso único). Retorna o email associado ou null. */
export function consumeResetToken(token) {
  sweep();
  const v = tokens.get(String(token || ''));
  if (!v) return null;
  tokens.delete(token);
  if (v.exp < Date.now()) return null;
  return v.email;
}
