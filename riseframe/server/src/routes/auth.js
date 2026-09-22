import { Router } from 'express';
import {
  createUser,
  verifyCredentials,
  findByEmail,
  publicUser,
  findOrCreateGoogleUser,
  setPassword,
} from '../auth/store.js';
import { signToken, verifyToken } from '../auth/tokens.js';
import { createResetToken, consumeResetToken } from '../auth/reset.js';
import { sendResetEmail } from '../auth/email.js';
import { config } from '../config.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('auth');
export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate({ email, password }) {
  if (!EMAIL_RE.test(String(email || ''))) return 'informe um email válido';
  if (String(password || '').length < 6) return 'a senha precisa de pelo menos 6 caracteres';
  return null;
}

// POST /api/auth/register { email, password, name } → { token, user }
authRouter.post('/auth/register', (req, res) => {
  const { email, password, name } = req.body || {};
  const invalid = validate({ email, password });
  if (invalid) return res.status(400).json({ error: invalid });
  try {
    const user = createUser({ email, password, name });
    log.ok(`novo usuário: ${user.email}`);
    return res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err.code === 'EMAIL_TAKEN') return res.status(409).json({ error: 'este email já está cadastrado' });
    log.error(`register: ${err.message}`);
    return res.status(500).json({ error: 'não foi possível criar a conta' });
  }
});

// POST /api/auth/login { email, password } → { token, user }
authRouter.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'informe email e senha' });
  const user = verifyCredentials(email, password);
  if (!user) return res.status(401).json({ error: 'email ou senha incorretos' });
  return res.json({ token: signToken(user), user });
});

// POST /api/auth/google { credential } → { token, user }
// `credential` é o ID token (JWT) devolvido pelo Google Identity Services.
authRouter.post('/auth/google', async (req, res) => {
  const { credential } = req.body || {};
  const clientId = config.auth.googleClientId;
  if (!clientId) return res.status(503).json({ error: 'login com Google não está configurado' });
  if (!credential) return res.status(400).json({ error: 'credential ausente' });
  try {
    // Verifica o ID token no endpoint público do Google (sem dependências).
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!r.ok) return res.status(401).json({ error: 'não foi possível validar o login do Google' });
    const info = await r.json();
    // Confere público-alvo (aud) e verificação de e-mail.
    if (info.aud !== clientId) return res.status(401).json({ error: 'token do Google inválido' });
    if (info.email_verified !== 'true' && info.email_verified !== true)
      return res.status(401).json({ error: 'e-mail do Google não verificado' });
    if (!info.email) return res.status(401).json({ error: 'e-mail não fornecido pelo Google' });
    const user = findOrCreateGoogleUser({ email: info.email, name: info.name, sub: info.sub });
    log.ok(`login Google: ${user.email}`);
    return res.json({ token: signToken(user), user });
  } catch (err) {
    log.error(`google: ${err.message}`);
    return res.status(500).json({ error: 'falha no login com Google' });
  }
});

// POST /api/auth/forgot { email } → { ok } (resposta neutra: nunca revela se existe)
authRouter.post('/auth/forgot', async (req, res) => {
  const { email } = req.body || {};
  const e = String(email || '').trim().toLowerCase();
  // Resposta genérica sempre — evita enumeração de usuários.
  const neutral = { ok: true };
  if (!EMAIL_RE.test(e)) return res.json(neutral);
  const emailReady = Boolean(config.auth.smtp.host && config.auth.smtp.user && config.auth.smtp.pass);
  if (!emailReady) return res.status(503).json({ error: 'recuperação de senha não está configurada' });
  try {
    const user = findByEmail(e);
    if (user) {
      const token = createResetToken(e);
      const base = (config.auth.appUrl || '').replace(/\/+$/, '');
      const link = `${base || ''}/?reset=${token}`;
      await sendResetEmail(e, link);
      log.ok(`link de recuperação enviado: ${e}`);
    }
  } catch (err) {
    log.error(`forgot: ${err.message}`);
  }
  return res.json(neutral);
});

// POST /api/auth/reset { token, password } → { token, user }
authRouter.post('/auth/reset', (req, res) => {
  const { token, password } = req.body || {};
  if (String(password || '').length < 6)
    return res.status(400).json({ error: 'a senha precisa de pelo menos 6 caracteres' });
  const email = consumeResetToken(token);
  if (!email) return res.status(400).json({ error: 'link inválido ou expirado' });
  const user = setPassword(email, password);
  if (!user) return res.status(400).json({ error: 'link inválido ou expirado' });
  log.ok(`senha redefinida: ${user.email}`);
  return res.json({ token: signToken(user), user });
});

// GET /api/auth/me → { user }  (requer token)
authRouter.get('/auth/me', requireAuth, (req, res) => {
  const user = findByEmail(req.user.email);
  if (!user) return res.status(401).json({ error: 'sessão inválida' });
  res.json({ user: publicUser(user) });
});

/** Middleware: exige um token de usuário válido em `Authorization: Bearer <token>`. */
export function requireAuth(req, res, next) {
  const hdr = req.get('authorization') || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'faça login para continuar' });
  req.user = { id: payload.sub, email: payload.email, name: payload.name };
  next();
}
