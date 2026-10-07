import { config } from '../config.js';
import { makeLogger } from '../logger.js';
import { sendMail } from './email.js';

const log = makeLogger('notify');

/** Celular brasileiro só com dígitos e DDI 55 (ex.: 5511999999999). '' se inválido. */
export function normalizePhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : '';
}

export const whatsappReady = () => Boolean(config.billing.whatsapp.url && config.billing.whatsapp.key);

/** Link wa.me com a mensagem pronta (para o admin mandar na mão quando não há envio automático). */
export function waLink(phone, text) {
  const n = normalizePhone(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : '';
}

/** Envia um WhatsApp pelo servidor do RiseFlow (Baileys). Retorna true se enviou. */
export async function sendWhatsApp(phone, text) {
  const { url, key, sessionUserId } = config.billing.whatsapp;
  const number = normalizePhone(phone);
  if (!url || !key || !number) return false;
  try {
    const r = await fetch(`${url}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ userId: sessionUserId || undefined, number, text }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`WhatsApp respondeu ${r.status}`);
    return true;
  } catch (err) {
    log.warn(`WhatsApp para ${number.slice(0, 6)}… falhou: ${err.message}`);
    return false;
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** E-mail simples no visual do Riseframe (título, parágrafos e um botão opcional). */
export function emailHtml(title, paragraphs, button) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0b0b0f">
    <h2 style="margin:0 0 12px">${esc(title)}</h2>
    ${paragraphs.map((p) => `<p style="margin:0 0 14px;color:#333;line-height:1.5">${esc(p)}</p>`).join('')}
    ${button ? `<p style="margin:8px 0 22px"><a href="${esc(button.url)}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#7C3AED);color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700">${esc(button.label)}</a></p>` : ''}
    <p style="margin:0;color:#888;font-size:12px">Riseframe · editor de vídeo com IA</p>
  </div>`;
}

/** Avisa o cliente por e-mail e WhatsApp (o que estiver configurado). */
export async function notifyUser({ email, phone }, { subject, text, html }) {
  const [mail, wa] = await Promise.all([
    email ? sendMail({ to: email, subject, text, html }) : false,
    phone ? sendWhatsApp(phone, text) : false,
  ]);
  return { email: mail, whatsapp: wa };
}

/** Avisa os admins (e-mails de ADMIN_EMAILS e ADMIN_WHATSAPP). */
export async function notifyAdmins({ subject, text, html }) {
  const emails = config.billing.adminEmails;
  await Promise.all([
    ...emails.map((to) => sendMail({ to, subject, text, html })),
    config.billing.adminWhatsapp ? sendWhatsApp(config.billing.adminWhatsapp, text) : null,
  ]);
}
