import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from './auth.js';
import { billingEnabled, billingStatus, cancelSubscription, createCheckout, renewSubscriptions, syncPayments } from '../auth/billing.js';
import { config } from '../config.js';
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
billingRouter.post('/billing/checkout', requireAuth, async (req, res) => {
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
