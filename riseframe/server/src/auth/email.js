import { config } from '../config.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('email');

/**
 * Envio de e-mail por dois caminhos:
 *  1. API do Resend (RESEND_API_KEY + EMAIL_FROM) — HTTPS, funciona no Render GRÁTIS,
 *     que bloqueia as portas de SMTP (25/465/587).
 *  2. SMTP via nodemailer (SMTP_HOST/USER/PASS) — servidor próprio / plano pago.
 * Sem nenhum dos dois, o envio simplesmente não acontece (o servidor segue normal).
 */
let transporterPromise = null;

/** Algum jeito de mandar e-mail está configurado? */
export function emailReady() {
  const { smtp, resendKey } = config.auth;
  return Boolean(resendKey || (smtp.host && smtp.user && smtp.pass));
}

/**
 * Dá para mandar e-mail para QUALQUER cliente? No Resend, só com domínio próprio
 * verificado (EMAIL_FROM no seu domínio); o remetente de teste deles só entrega para o
 * dono da conta Resend. Usado para exigir (ou não) o código de confirmação do e-mail.
 */
export function canEmailCustomers() {
  const { smtp, resendKey, emailFrom } = config.auth;
  if (resendKey) return Boolean(emailFrom && !/resend\.dev/i.test(emailFrom));
  return Boolean(smtp.host && smtp.user && smtp.pass);
}

/** Remetente: EMAIL_FROM / SMTP_FROM; no Resend sem domínio próprio, o de teste deles. */
function sender() {
  const { smtp, resendKey, emailFrom } = config.auth;
  if (emailFrom) return emailFrom;
  if (resendKey) return 'Riseframe <onboarding@resend.dev>';
  return smtp.from || smtp.user;
}

async function getTransporter() {
  const { smtp } = config.auth;
  if (!smtp.host || !smtp.user || !smtp.pass) return null;
  if (!transporterPromise) {
    transporterPromise = (async () => {
      try {
        const nodemailer = (await import('nodemailer')).default;
        return nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.port === 465,
          auth: { user: smtp.user, pass: smtp.pass },
        });
      } catch (err) {
        log.error(`nodemailer indisponível: ${err.message}`);
        return null;
      }
    })();
  }
  return transporterPromise;
}

async function sendResend({ to, subject, text, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.auth.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: sender(), to: [to], subject, text, html }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    let msg = body;
    try {
      msg = JSON.parse(body).message || body;
    } catch {
      /* texto puro */
    }
    throw new Error(`Resend ${r.status}: ${String(msg).slice(0, 200)}`);
  }
}

/**
 * Envia um e-mail (texto + HTML opcional). Retorna true se enviou. Com `throwOnError`,
 * lança o motivo da falha (usado no teste de envio do admin).
 */
export async function sendMail({ to, subject, text, html }, { throwOnError = false } = {}) {
  if (!to) return false;
  try {
    if (config.auth.resendKey) {
      await sendResend({ to, subject, text, html });
      return true;
    }
    const transporter = await getTransporter();
    if (!transporter) {
      if (throwOnError) throw new Error('envio de e-mail não configurado (falta RESEND_API_KEY)');
      return false;
    }
    await transporter.sendMail({ from: sender(), to, subject, text, html });
    return true;
  } catch (err) {
    log.error(`falha ao enviar e-mail: ${err.message}`);
    if (throwOnError) throw err;
    return false;
  }
}

/** Envia o e-mail de recuperação de senha com o link. Retorna true se enviou. */
export function sendResetEmail(to, link) {
  return sendMail({
    to,
    subject: 'Recuperação de senha — Riseframe',
    text: `Você pediu para redefinir sua senha no Riseframe.\n\nAbra este link (válido por 30 minutos):\n${link}\n\nSe não foi você, ignore este e-mail.`,
    html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#0b0b0f">
          <h2 style="margin:0 0 12px">Recuperação de senha</h2>
          <p style="margin:0 0 16px;color:#444">Você pediu para redefinir sua senha no <strong>Riseframe</strong>. O link é válido por 30 minutos.</p>
          <p style="margin:0 0 24px">
            <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#7C3AED);color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700">Redefinir senha</a>
          </p>
          <p style="margin:0;color:#888;font-size:13px">Se não foi você, ignore este e-mail.</p>
        </div>`,
  });
}
