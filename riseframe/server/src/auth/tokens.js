import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Token no estilo JWT (HS256) assinado com HMAC-SHA256 — sem dependências externas.
 * O segredo vem de AUTH_SECRET; se ausente, é gerado uma vez e persistido em
 * data/auth_secret (assim os tokens continuam válidos entre reinícios).
 */
function loadSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const file = path.join(config.paths.data, 'auth_secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('hex');
    try {
      fs.mkdirSync(config.paths.data, { recursive: true });
      fs.writeFileSync(file, secret, { mode: 0o600 });
    } catch {
      /* se não der pra persistir, usa o segredo em memória desta execução */
    }
    return secret;
  }
}

const SECRET = loadSecret();
const TTL_SECONDS = 30 * 24 * 3600; // 30 dias

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}
function sign(data) {
  return b64url(crypto.createHmac('sha256', SECRET).update(data).digest());
}

/** Assina um token para o usuário (payload: sub=id, email, name). */
export function signToken(user) {
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlJson({ sub: user.id, email: user.email, name: user.name, iat: now, exp: now + TTL_SECONDS });
  const body = `${header}.${payload}`;
  return `${body}.${sign(body)}`;
}

/** Verifica o token; retorna o payload ou null. Comparação em tempo constante. */
export function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = sign(`${header}.${payload}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}
