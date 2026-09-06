import { config } from '../config.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('email');

/**
 * Envio de e-mail via SMTP usando nodemailer. O import é dinâmico e tolerante:
 * se o pacote não estiver instalado (ou o SMTP não estiver configurado), o envio
 * simplesmente não acontece — o servidor continua funcionando normalmente.
 * A capability `emailReady` controla se o frontend oferece a recuperação de senha.
 */
let transporterPromise = null;

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

/** Envia o e-mail de recuperação de senha com o link. Retorna true se enviou. */
export async function sendResetEmail(to, link) {
  const transporter = await getTransporter();
  if (!transporter) return false;
  const from = config.auth.smtp.from || config.auth.smtp.user;
  try {
    await transporter.sendMail({
      from,
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
    return true;
  } catch (err) {
    log.error(`falha ao enviar e-mail: ${err.message}`);
    return false;
  }
}
