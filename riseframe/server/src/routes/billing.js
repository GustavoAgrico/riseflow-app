import crypto from 'node:crypto';
import express, { Router } from 'express';
import { requireAuth, requireVerified } from './auth.js';
import {
  adminGrant, approveClaim, billingEnabled, billingStatus, cancelSubscription, createCheckout, createPixClaim, claimSummary, resendClaimNotice, checkContact, sendContactCode, verifyContactCode,
  listClaims, rejectClaim, renewSubscriptions, sendReminders, syncPayments,
} from '../auth/billing.js';
import { config } from '../config.js';
import { verifyLink } from '../auth/tokens.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('billing');
export const billingRouter = Router();

const digits = (v) => String(v || '').replace(/\D/g, '');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// GET /api/billing → plano, saldo, recursos liberados, custos, planos e recargas
billingRouter.get('/billing', requireAuth, async (req, res) => {
  // Plano com renovação automática que venceu: confere a assinatura antes de responder.
  await renewSubscriptions({ userId: req.user.id }).catch((err) => log.warn(`renovação: ${err.message}`));
  res.json(billingStatus(req.user));
});

// POST /api/billing/checkout { kind: 'plan'|'pack', itemId, name, cpf, phone } → { url } do pagamento
billingRouter.post('/billing/checkout', requireAuth, requireVerified, async (req, res) => {
  if (!billingEnabled()) return res.status(400).json({ error: 'pagamentos não estão configurados' });
  if (billingStatus(req.user).admin) return res.status(400).json({ error: 'conta de administrador já tem uso ilimitado' });

  const { kind, itemId, name, cpf, phone, recurring } = req.body || {};
  const taxId = digits(cpf);
  const cellphone = digits(phone);
  if (taxId.length !== 11 && taxId.length !== 14) return res.status(400).json({ error: 'informe um CPF ou CNPJ válido' });
  if (cellphone.length < 10 || cellphone.length > 13) return res.status(400).json({ error: 'informe um celular com DDD' });

  const base = (config.auth.appUrl || req.get('origin') || '').replace(/\/+$/, '');
  try {
    const url = await createCheckout(req.user, {
      kind: String(kind || ''),
      itemId: String(itemId || ''),
      name: String(name || '').trim().slice(0, 120),
      taxId,
      cellphone,
      returnUrl: `${base}/?billing=return`,
      recurring: recurring === true && config.billing.autoRenew,
    });
    res.json({ url });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    log.error(`checkout: ${err.message}`);
    res.status(502).json({ error: `não foi possível gerar o pagamento: ${err.message}` });
  }
});

// ── Dados de contato do pagamento (nome, e-mail e WhatsApp reais) ──
// POST /api/billing/contact/check { name, email, phone } → validação campo a campo
billingRouter.post('/billing/contact/check', requireAuth, async (req, res) => {
  const { name, email, phone } = req.body || {};
  res.json(await checkContact(req.user, { name, email, phone }));
});

// POST /api/billing/contact/code { email } → manda o código de confirmação por e-mail
billingRouter.post('/billing/contact/code', requireAuth, async (req, res) => {
  try {
    res.json(await sendContactCode(req.user, (req.body || {}).email));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/billing/contact/verify { email, code } → confirma o e-mail
billingRouter.post('/billing/contact/verify', requireAuth, (req, res) => {
  try {
    const { email, code } = req.body || {};
    res.json(verifyContactCode(req.user, email, code));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/billing/pix/claim { kind, itemId, phone, name, email } → "Já paguei" (Pix pelo link do banco)
billingRouter.post('/billing/pix/claim', requireAuth, requireVerified, async (req, res) => {
  if (!billingEnabled() || config.billing.payment !== 'pix-links') return res.status(400).json({ error: 'pagamento por Pix não está ativo' });
  try {
    const { kind, itemId, phone, name, email } = req.body || {};
    await createPixClaim(req.user, { kind: String(kind || ''), itemId: String(itemId || ''), phone, name: String(name || '').trim(), email });
    res.json(billingStatus(req.user));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, errors: err.errors });
  }
});

// ── Confirmar o Pix direto pelo botão do e-mail do admin ──
// GET mostra a página com os dados e os botões; só o POST (clique) confirma ou recusa.
// Assim, robôs que abrem links de e-mail (antivírus, Gmail) não confirmam nada sozinhos.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

function actionPage(title, body, color = '#FF6B35') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · Riseframe</title>
<style>body{margin:0;background:#0b0b0f;color:#f4f4f6;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
.card{max-width:460px;width:100%;background:#15151c;border:1px solid #2a2a35;border-radius:16px;padding:26px}
h1{font-size:21px;margin:0 0 14px;color:${color}}p{color:#b8b8c4;line-height:1.55;margin:0 0 10px;font-size:15px}b{color:#f4f4f6}
.row{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}button,a.btn{flex:1;min-height:48px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;border:none;font-family:inherit;text-decoration:none;display:flex;align-items:center;justify-content:center}
.ok{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff}.no{background:transparent;border:1px solid #3a3a48;color:#f4f4f6}.btn{background:linear-gradient(135deg,#FF6B35,#7C3AED);color:#fff}</style></head>
<body><div class="card"><h1>${esc(title)}</h1>${body}</div></body></html>`;
}

function claimFromLink(req) {
  const data = verifyLink(req.query.t || req.body?.t);
  return data?.c ? claimSummary(data.c) : null;
}

const details = (c) => `<p><b>${esc(c.name || 'Sem nome')}</b><br>${esc(c.email)}${c.account !== c.email ? ` (conta ${esc(c.account)})` : ''}<br>WhatsApp ${esc(c.phone)}</p>
<p>Pagamento do <b>${esc(c.item)}</b> — <b>${esc(c.price)}</b></p>`;

const decided = (c) => actionPage(
  c.status === 'approved' ? 'Pagamento já confirmado' : 'Aviso já recusado',
  `${details(c)}<p>Decidido em ${esc(new Date(c.decidedAt || c.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}.</p>`,
  c.status === 'approved' ? '#22c55e' : '#FCA5B4',
);

billingRouter.get('/billing/pix/email-action', (req, res) => {
  res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex');
  const c = claimFromLink(req);
  if (!c) return res.status(400).send(actionPage('Link inválido ou vencido', '<p>Abra a página de Planos do Riseframe logado como admin para confirmar.</p>', '#FCA5B4'));
  if (c.status !== 'pending') return res.send(decided(c));
  const t = esc(req.query.t);
  res.send(actionPage('Pix a confirmar', `${details(c)}
<p>Confira no extrato do banco se o Pix de <b>${esc(c.price)}</b> caiu. Ao confirmar, o plano e os créditos são liberados na hora e o cliente é avisado.</p>
<form method="post" class="row"><input type="hidden" name="t" value="${t}">
<button class="ok" name="action" value="approve">Confirmar pagamento</button>
<button class="no" name="action" value="reject">Recusar</button></form>`));
});

billingRouter.post('/billing/pix/email-action', express.urlencoded({ extended: false }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const c = claimFromLink(req);
  if (!c) return res.status(400).send(actionPage('Link inválido ou vencido', '<p>Abra a página de Planos do Riseframe logado como admin para confirmar.</p>', '#FCA5B4'));
  if (c.status !== 'pending') return res.send(decided(c));
  const by = { email: 'link do e-mail' };
  try {
    if (req.body?.action === 'approve') {
      const r = await approveClaim(c.id, by);
      const sent = [r.sent?.email && 'e-mail', r.sent?.whatsapp && 'WhatsApp'].filter(Boolean);
      log.info(`Pix ${c.id} confirmado pelo link do e-mail`);
      return res.send(actionPage('Pagamento confirmado!', `${details(c)}<p>O ${esc(c.item)} foi liberado.${sent.length ? ` O cliente foi avisado por ${sent.join(' e ')}.` : ' Avise o cliente pelo WhatsApp.'}</p>`, '#22c55e'));
    }
    if (req.body?.action === 'reject') {
      rejectClaim(c.id, by);
      log.info(`Pix ${c.id} recusado pelo link do e-mail`);
      return res.send(actionPage('Aviso recusado', `${details(c)}<p>Nada foi liberado.</p>`, '#FCA5B4'));
    }
    res.status(400).send(actionPage('Escolha uma opção', '<p>Volte e clique em Confirmar ou Recusar.</p>', '#FCA5B4'));
  } catch (err) {
    res.status(err.status || 500).send(actionPage('Não deu certo', `<p>${esc(err.message)}</p>`, '#FCA5B4'));
  }
});

// ── Admin: confirmar os Pix avisados, liberar planos na mão, disparar lembretes ──
function requireAdmin(req, res, next) {
  if (!billingStatus(req.user).admin) return res.status(403).json({ error: 'só para administradores' });
  next();
}

billingRouter.get('/billing/admin/claims', requireAuth, requireAdmin, (_req, res) => {
  res.json(listClaims());
});

billingRouter.post('/billing/admin/claims/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await approveClaim(req.params.id, req.user);
    res.json({ ...listClaims(), sent: r.sent });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

billingRouter.post('/billing/admin/claims/:id/notify', requireAuth, requireAdmin, async (req, res) => {
  try {
    const notice = await resendClaimNotice(req.params.id);
    res.json({ notice, ...listClaims() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

billingRouter.post('/billing/admin/claims/:id/reject', requireAuth, requireAdmin, (req, res) => {
  try {
    rejectClaim(req.params.id, req.user);
    res.json(listClaims());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// { email, kind: 'plan'|'pack', itemId } → libera direto (pagamento recebido fora do site)
billingRouter.post('/billing/admin/grant', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, kind, itemId } = req.body || {};
    res.json(await adminGrant({ email: String(email || ''), kind: kind === 'pack' ? 'pack' : 'plan', itemId: String(itemId || '') }, req.user));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Dispara agora os lembretes de vencimento pendentes (normalmente rodam de hora em hora).
billingRouter.post('/billing/admin/reminders', requireAuth, requireAdmin, async (_req, res) => {
  try {
    res.json({ sent: await sendReminders({ force: true }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/subscription/cancel → desliga a renovação automática (o plano vale até o fim do período)
billingRouter.post('/billing/subscription/cancel', requireAuth, async (req, res) => {
  try {
    await cancelSubscription(req.user);
    res.json(billingStatus(req.user));
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    log.error(`cancelar assinatura: ${err.message}`);
    res.status(502).json({ error: `não foi possível cancelar agora: ${err.message}` });
  }
});

// POST /api/billing/sync → confere na AbacatePay se o pagamento caiu; { applied: [...], ...status }
billingRouter.post('/billing/sync', requireAuth, async (req, res) => {
  try {
    const applied = await syncPayments({ userId: req.user.id });
    await renewSubscriptions({ userId: req.user.id }).catch((err) => log.warn(`renovação: ${err.message}`));
    res.json({ applied, ...billingStatus(req.user) });
  } catch (err) {
    log.error(`sync: ${err.message}`);
    res.status(502).json({ error: 'não foi possível consultar o pagamento agora; tente de novo em instantes' });
  }
});

// POST /api/billing/webhook — PÚBLICO (chamado pela AbacatePay). O corpo é só um
// aviso: o pagamento é sempre confirmado consultando a API antes de liberar acesso.
billingRouter.post('/billing/webhook', (req, res) => {
  const secret = config.billing.webhookSecret;
  const given = req.query.webhookSecret || req.query.secret || '';
  if (secret && !safeEqual(given, secret)) return res.status(401).json({ error: 'não autorizado' });
  res.json({ received: true });

  const data = req.body?.data || {};
  const billingId = data.billing?.id || data.checkout?.id || data.id || undefined;
  syncPayments({ billingId: typeof billingId === 'string' ? billingId : undefined })
    .then(() => (/^subscription\./.test(String(req.body?.event || '')) ? renewSubscriptions() : null))
    .catch((err) => log.error(`webhook: ${err.message}`));
});
