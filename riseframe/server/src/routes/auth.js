import { Router } from 'express';
import { createUser, verifyCredentials, findByEmail, publicUser } from '../auth/store.js';
import { signToken, verifyToken } from '../auth/tokens.js';
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
