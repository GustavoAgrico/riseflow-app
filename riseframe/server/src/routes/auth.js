import { Router } from 'express';
import {
  createUser,
  verifyCredentials,
  findByEmail,
  publicUser,
  findOrCreateGoogleUser,
  setPassword,
  findById,
  markVerified,
  signupsFromIp,
} from '../auth/store.js';
import { checkEmail, checkEmailCode, newEmailCode } from '../auth/contact.js';
import { emailHtml } from '../auth/notify.js';
import { signToken, verifyToken } from '../auth/tokens.js';
import { createResetToken, consumeResetToken } from '../auth/reset.js';
import { canEmailCustomers, emailReady, sendMail, sendResetEmail } from '../auth/email.js';
import { config } from '../config.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('auth');
export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate({ email, password }) {
  if (!EMAIL_RE.test(String(email || ''))) return 'informe um email válido';
  if (String(password || '').length < 8) return 'a senha precisa de pelo menos 8 caracteres';
  return null;
}

/** O cadastro exige confirmar o e-mail com código? (só quando o e-mail chega a qualquer pessoa) */
export function verifyRequired() {
  const mode = config.auth.emailVerify;
  if (mode === 'off' || mode === 'false' || mode === '0') return false;
  return canEmailCustomers();
}

const isAdminEmail = (e) => config.billing.adminEmails.includes(String(e || '').toLowerCase());

/** Manda o código de confirmação da conta. Lança 429 se pedir rápido demais. */
async function sendAccountCode(user) {
  const code = newEmailCode(`acct:${user.id}`, user.email);
  await sendMail({
    to: user.email,
    subject: `${code} é seu código do Riseframe`,
    text: `Seu código para confirmar a conta no Riseframe: ${code}\n\nVale por 15 minutos. Se não foi você, ignore este e-mail.`,
    html: emailHtml(`Seu código: ${code}`, ['Use este código para confirmar sua conta no Riseframe. Ele vale por 15 minutos.', 'Se não foi você, ignore este e-mail.']),
  }, { throwOnError: true });
}

// POST /api/auth/register { email, password, name } → { token, user }
authRouter.post('/auth/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  const invalid = validate({ email, password });
  if (invalid) return res.status(400).json({ error: invalid });
  // E-mail de verdade: formato, erro de digitação (gmial → gmail), e-mail temporário e
  // domínio que recebe e-mail.
  const em = await checkEmail(email);
  if (!em.ok) return res.status(400).json({ error: em.error, suggestion: em.suggestion || null });
  // Contas em massa da mesma conexão.
  const ip = req.ip || '';
  const limit = config.auth.signupsPerIpDay;
  if (limit > 0 && !isAdminEmail(em.email) && signupsFromIp(ip, Date.now() - 24 * 3600 * 1000) >= limit) {
    log.warn(`cadastro bloqueado: limite de ${limit} contas/dia para este IP`);
    return res.status(429).json({ error: 'muitas contas criadas desta conexão hoje. Tente amanhã ou entre com o Google.' });
  }
  try {
    const user = createUser({ email: em.email, password, name, signupIp: ip });
    log.ok(`novo usuário: ${user.email}`);
    let needsVerification = false;
    if (verifyRequired()) {
      needsVerification = true;
      try {
        await sendAccountCode(user);
      } catch (err) {
        log.error(`código de confirmação não enviado: ${err.message}`);
      }
    } else {
      markVerified(user.id); // sem envio de e-mail p/ clientes: valem as checagens acima
    }
    const fresh = publicUser(findById(user.id));
    return res.status(201).json({ token: signToken(fresh), user: fresh, needsVerification });
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
  if (!emailReady()) return res.status(503).json({ error: 'recuperação de senha não está configurada' });
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
  if (String(password || '').length < 8)
    return res.status(400).json({ error: 'a senha precisa de pelo menos 8 caracteres' });
  const email = consumeResetToken(token);
  if (!email) return res.status(400).json({ error: 'link inválido ou expirado' });
  const user = setPassword(email, password);
  if (!user) return res.status(400).json({ error: 'link inválido ou expirado' });
  log.ok(`senha redefinida: ${user.email}`);
  return res.json({ token: signToken(user), user });
});

// POST /api/auth/verify { code } → { user } — confirma o e-mail da conta
authRouter.post('/auth/verify', requireAuth, (req, res) => {
  const u = findById(req.user.id);
  if (!u) return res.status(401).json({ error: 'sessão inválida' });
  if (u.verified !== false) return res.json({ user: publicUser(u) });
  try {
    checkEmailCode(`acct:${u.id}`, u.email, (req.body || {}).code);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  log.ok(`e-mail confirmado: ${u.email}`);
  return res.json({ user: markVerified(u.id) });
});

// POST /api/auth/verify/resend → manda outro código
authRouter.post('/auth/verify/resend', requireAuth, async (req, res) => {
  const u = findById(req.user.id);
  if (!u) return res.status(401).json({ error: 'sessão inválida' });
  if (u.verified !== false) return res.json({ ok: true, verified: true });
  try {
    await sendAccountCode(u);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.status === 429 ? err.message : 'não consegui enviar o código agora; tente de novo em instantes' });
  }
});

/**
 * Middleware: só contas com e-mail confirmado usam o editor (upload, render, pagamento).
 * Contas antigas e as do Google já contam como confirmadas.
 */
export function requireVerified(req, res, next) {
  if (!verifyRequired()) return next();
  const u = findById(req.user?.id);
  if (u && u.verified === false) {
    return res.status(403).json({ error: 'confirme seu e-mail com o código que enviamos para continuar', needsVerification: true });
  }
  next();
}

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
