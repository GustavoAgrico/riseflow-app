import crypto from 'node:crypto';
import dns from 'node:dns';

/**
 * Validação dos dados de contato pedidos no pagamento (e-mail e WhatsApp) e códigos de
 * confirmação por e-mail. Sem dependências: o e-mail é conferido no formato, contra erros
 * de digitação comuns, contra e-mails descartáveis e no DNS (o domínio precisa receber
 * e-mail); o WhatsApp precisa ser um celular brasileiro com DDD que existe.
 */

// DDDs em uso no Brasil (Anatel).
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const TYPOS = {
  'gmail.com': ['gmial.com', 'gmal.com', 'gmai.com', 'gmail.co', 'gmail.con', 'gmail.cm', 'gmail.om', 'gnail.com', 'gamil.com', 'gmaill.com', 'gmail.com.br', 'gmil.com', 'gmali.com', 'gmeil.com', 'g-mail.com'],
  'hotmail.com': ['hotmial.com', 'hotmal.com', 'hotmai.com', 'hotmail.con', 'hotmail.co', 'hotamil.com', 'hotmeil.com', 'hotmaill.com', 'homail.com', 'hotmil.com', 'hotimail.com'],
  'outlook.com': ['outlok.com', 'outlook.con', 'outloo.com', 'outllok.com', 'otlook.com', 'outlook.co'],
  'yahoo.com.br': ['yaho.com.br', 'yahoo.con.br', 'yahoo.com.b', 'yahho.com.br'],
  'yahoo.com': ['yaho.com', 'yahoo.con', 'yahooo.com', 'yahho.com'],
  'icloud.com': ['iclod.com', 'icloud.con', 'icoud.com', 'icloud.co'],
  'live.com': ['live.con', 'liv.com'],
  'uol.com.br': ['uol.com', 'uol.con.br'],
  'bol.com.br': ['bol.com', 'bol.con.br'],
};
const TYPO_FIX = new Map(Object.entries(TYPOS).flatMap(([good, bad]) => bad.map((b) => [b, good])));

const DISPOSABLE = new Set([
  'mailinator.com', 'yopmail.com', '10minutemail.com', 'guerrillamail.com', 'guerrillamail.net', 'tempmail.com', 'temp-mail.org',
  'sharklasers.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'mintemail.com', 'emailondeck.com',
  'throwawaymail.com', 'fakeinbox.com', 'tempail.com', 'mohmal.com', 'moakt.com', 'tmpmail.org', '1secmail.com', 'tempmailo.com',
  'burnermail.io', 'spamgourmet.com', 'mail.tm', 'mailnesia.com', 'tempr.email', 'emailfake.com', 'fakemail.net', 'mytemp.email',
]);

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/;

let resolver = {
  mx: (d) => dns.promises.resolveMx(d),
  a: (d) => dns.promises.resolve(d),
};
/** Só para testes: troca as consultas de DNS. */
export function __setDnsResolver(r) {
  resolver = r;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms))]);

/** O domínio recebe e-mail? true/false; null quando o DNS não respondeu (não bloqueia). */
async function domainReceivesMail(domain) {
  try {
    const mx = await withTimeout(resolver.mx(domain), 4000);
    // "MX nulo" (RFC 7505): o domínio declara que NÃO recebe e-mail.
    return mx.some((r) => r.exchange && r.exchange !== '.');
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      // Sem MX, o e-mail vai para o endereço do próprio domínio (se ele existir).
      try {
        const a = await withTimeout(resolver.a(domain), 4000);
        return a.length > 0;
      } catch (e2) {
        return e2.code === 'ENOTFOUND' || e2.code === 'ENODATA' ? false : null;
      }
    }
    return null;
  }
}

/** { ok, email, error?, suggestion? } */
export async function checkEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return { ok: false, email, error: 'informe seu e-mail' };
  if (!EMAIL_RE.test(email) || email.length > 200) return { ok: false, email, error: 'e-mail inválido — confira se digitou certo' };
  const [user, domain] = email.split('@');
  const fix = TYPO_FIX.get(domain);
  if (fix) return { ok: false, email, error: `você quis dizer ${user}@${fix}?`, suggestion: `${user}@${fix}` };
  if (DISPOSABLE.has(domain)) return { ok: false, email, error: 'use um e-mail seu de verdade (e-mails temporários não são aceitos)' };
  const receives = await domainReceivesMail(domain);
  if (receives === false) return { ok: false, email, error: `o domínio "${domain}" não recebe e-mails — confira se digitou certo` };
  return { ok: true, email };
}

/** { ok, phone (55 + DDD + número), error? } — só celular brasileiro (WhatsApp). */
export function checkPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return { ok: false, phone: '', error: 'informe seu WhatsApp com DDD' };
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1); // 0 + DDD + número
  if (d.length !== 11) return { ok: false, phone: '', error: 'WhatsApp precisa ter DDD + 9 dígitos, ex.: (11) 98765-4321' };
  if (!DDDS.has(Number(d.slice(0, 2)))) return { ok: false, phone: '', error: `DDD ${d.slice(0, 2)} não existe — confira o número` };
  if (d[2] !== '9') return { ok: false, phone: '', error: 'informe um celular (começa com 9 depois do DDD)' };
  const sub = d.slice(3);
  if (/^(\d)\1+$/.test(sub) || sub === '12345678') {
    return { ok: false, phone: '', error: 'esse número não parece real — confira o WhatsApp' };
  }
  return { ok: true, phone: `55${d}` };
}

/** "(11) 98765-4321" a partir de 5511987654321. */
export function formatPhone(p) {
  const d = String(p || '').replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d;
}

// ── Código de confirmação do e-mail (6 dígitos, 15 min, 5 tentativas) ──
const CODE_TTL_MS = 15 * 60_000;
const RESEND_AFTER_MS = 45_000;
const codes = new Map(); // userId → { email, hash, expires, tries, sent: [timestamps] }
const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

/** Gera um código para o e-mail; lança 429 se pedir rápido demais. */
export function newEmailCode(userId, email) {
  const now = Date.now();
  const prev = codes.get(userId);
  const sent = (prev?.sent || []).filter((t) => now - t < 3600_000);
  if (sent.length && now - sent[sent.length - 1] < RESEND_AFTER_MS) {
    throw Object.assign(new Error('aguarde alguns segundos para pedir outro código'), { status: 429 });
  }
  if (sent.length >= 5) throw Object.assign(new Error('muitos códigos pedidos; tente de novo em 1 hora'), { status: 429 });
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  codes.set(userId, { email, hash: hashCode(code), expires: now + CODE_TTL_MS, tries: 0, sent: [...sent, now] });
  return code;
}

/** Confere o código. Lança com a mensagem certa se não bater. */
export function checkEmailCode(userId, email, code) {
  const c = codes.get(userId);
  if (!c || c.email !== email || Date.now() > c.expires) throw Object.assign(new Error('código expirado — peça um novo'), { status: 400 });
  if (c.tries >= 5) throw Object.assign(new Error('muitas tentativas — peça um novo código'), { status: 429 });
  c.tries++;
  const a = Buffer.from(hashCode(String(code || '').replace(/\D/g, '')));
  const b = Buffer.from(c.hash);
  if (!crypto.timingSafeEqual(a, b)) throw Object.assign(new Error('código incorreto'), { status: 400 });
  codes.delete(userId);
  return true;
}
