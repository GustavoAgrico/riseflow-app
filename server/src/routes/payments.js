const express = require('express');
const crypto = require('crypto');
const { auth } = require('../../middleware/auth');
const { supabase, isConfigured } = require('../supabaseClient');

const router = express.Router();

// Configuração do AbacatePay (substitua com suas chaves reais)
// Usando API v2: https://docs.abacatepay.com/v2
const ABACATE_API_KEY = process.env.ABACATE_API_KEY || 'dev_key_placeholder';
const ABACATE_API_URL = process.env.ABACATE_API_URL || 'https://api.abacatepay.com/v2';
const ABACATE_WEBHOOK_SECRET = process.env.ABACATE_WEBHOOK_SECRET || '';

const PLANS = {
  starter: { tokens: 500, price: 29.90 },
  pro: { tokens: 2000, price: 99.90 },
  enterprise: { tokens: 5000, price: 249.90 },
};

// Mapeia métodos de pagamento internos para a API v2 do AbacatePay
function mapPaymentMethod(method) {
  const map = {
    'pix': 'PIX',
    'credit_card': 'CREDIT_CARD',
    'boleto': 'BOLETO'
  };
  return map[method] || 'CREDIT_CARD';
}

// Valida assinatura HMAC do webhook (segurança)
function validateWebhookSignature(payload, signature) {
  if (!ABACATE_WEBHOOK_SECRET) {
    console.warn('[webhook] ABACATE_WEBHOOK_SECRET não configurado, validação desabilitada');
    return true; // Fallback: aceita se secret não está configurado
  }

  const payloadStr = JSON.stringify(payload);
  const hmac = crypto
    .createHmac('sha256', ABACATE_WEBHOOK_SECRET)
    .update(payloadStr)
    .digest('hex');

  return hmac === signature;
}

/** POST /api/payments/abacate - Inicia pagamento via AbacatePay */
router.post('/abacate', auth, async (req, res) => {
  try {
    const { planId, paymentMethod } = req.body;
    const userId = req.user.sub;

    if (!PLANS[planId]) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    if (!['pix', 'credit_card', 'boleto'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Método de pagamento inválido' });
    }

    const plan = PLANS[planId];
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Em desenvolvimento: simula resposta bem-sucedida
    if (process.env.NODE_ENV === 'development') {
      return res.json({
        transactionId,
        status: 'pending',
        method: paymentMethod,
        amount: plan.price,
        redirectUrl: null,
        message: `Pagamento via ${paymentMethod} iniciado. Transaction ID: ${transactionId}`
      });
    }

    // Em produção: integra com AbacatePay API v2
    // Documentação: https://docs.abacatepay.com/v2
    const paymentPayload = {
      amount: Math.round(plan.price * 100), // Centavos
      currency: 'BRL',
      description: `${plan.tokens} tokens - Riseframe Video Editor`,
      orderId: transactionId,
      paymentMethod: mapPaymentMethod(paymentMethod),
      customer: {
        id: userId,
        email: req.user.email
      },
      metadata: {
        planId,
        tokens: plan.tokens
      },
      redirectUrl: process.env.PAYMENT_RETURN_URL || 'http://localhost:5174/dashboard',
      webhookUrl: `${process.env.SERVER_URL || 'http://localhost:3333'}/api/payments/webhook`
    };

    // Chamada à AbacatePay API v2
    const abacateResponse = await fetch(`${ABACATE_API_URL}/checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ABACATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentPayload)
    }).catch(() => null);

    if (!abacateResponse || !abacateResponse.ok) {
      // Fallback em desenvolvimento
      if (process.env.NODE_ENV !== 'production') {
        return res.json({
          transactionId,
          status: 'pending',
          method: paymentMethod,
          amount: plan.price,
          redirectUrl: null,
          message: 'Modo teste: pagamento simulado'
        });
      }
      return res.status(503).json({ error: 'Serviço de pagamento indisponível' });
    }

    const data = await abacateResponse.json();

    res.json({
      transactionId,
      status: data.status || 'pending',
      redirectUrl: data.checkoutUrl || null,
      paymentMethod,
      amount: plan.price
    });
  } catch (err) {
    console.error('Erro ao processar pagamento:', err);
    res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
});

/** GET /api/payments/status/:transactionId - Verifica status da transação */
router.get('/status/:transactionId', auth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.sub;

    // Em desenvolvimento: retorna status fictício
    if (process.env.NODE_ENV === 'development') {
      return res.json({
        transactionId,
        status: 'completed',
        credits: 2000,
        message: 'Pagamento concluído com sucesso'
      });
    }

    // Em produção: consulta status na AbacatePay v2
    const statusResponse = await fetch(`${ABACATE_API_URL}/checkout/${transactionId}`, {
      headers: {
        'Authorization': `Bearer ${ABACATE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }).catch(() => null);

    if (!statusResponse || !statusResponse.ok) {
      return res.status(503).json({ error: 'Serviço indisponível' });
    }

    const data = await statusResponse.json();

    // Se pago, verifica se créditos já foram adicionados (webhook pode ter processado)
    if (data.status === 'paid' && isConfigured) {
      try {
        const { data: user } = await supabase
          .from('users')
          .select('credits')
          .eq('id', userId)
          .single();

        return res.json({
          transactionId,
          status: 'completed',
          credits: user?.credits || 0,
          message: 'Pagamento concluído com sucesso'
        });
      } catch (err) {
        console.warn('[status] Erro ao buscar créditos atualizados:', err?.message);
      }
    }

    res.json({
      transactionId,
      status: data.status,
      credits: data.metadata?.credits || 0,
      message: data.message || 'Consulta realizada'
    });
  } catch (err) {
    console.error('[status] Erro ao verificar status:', err);
    res.status(500).json({ error: 'Erro ao verificar status' });
  }
});

/** POST /api/payments/webhook - Webhook de confirmação do AbacatePay */
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const { transactionId, status, metadata } = req.body;
    const signature = req.headers['x-abacate-signature'];

    // Valida assinatura do webhook (importante para segurança)
    if (!validateWebhookSignature(req.body, signature)) {
      console.warn(`[webhook] Assinatura inválida para transação ${transactionId}`);
      return res.status(401).json({ error: 'Assinatura do webhook inválida' });
    }

    if (status === 'paid' && metadata?.userId) {
      const { userId, credits, planId } = metadata;

      if (!isConfigured) {
        console.warn(`[webhook] Supabase não configurado, ignorando atualização de créditos para ${transactionId}`);
        return res.json({ ok: true, warning: 'Supabase não configurado' });
      }

      // Adiciona créditos ao usuário
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('credits')
        .eq('id', userId)
        .single();

      if (fetchError) {
        console.error(`[webhook] Erro ao buscar usuário ${userId}:`, fetchError);
        return res.status(500).json({ error: 'Erro ao atualizar créditos' });
      }

      const newCredits = (user?.credits || 0) + (credits || 0);
      const { error: updateError } = await supabase
        .from('users')
        .update({ credits: newCredits })
        .eq('id', userId);

      if (updateError) {
        console.error(`[webhook] Erro ao atualizar créditos para ${userId}:`, updateError);
        return res.status(500).json({ error: 'Erro ao adicionar créditos' });
      }

      // Registra transação no histórico (se tabela existir)
      await supabase
        .from('activity_logs')
        .insert({
          user_id: userId,
          action: 'payment_completed',
          details: {
            transactionId,
            planId,
            creditsAdded: credits,
            newTotal: newCredits
          }
        })
        .catch(err => console.warn('[webhook] Não foi possível registrar atividade:', err?.message));

      console.log(`[webhook] Pagamento ${transactionId} confirmado: +${credits} créditos para ${userId} (total: ${newCredits})`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook] Erro ao processar webhook:', err);
    res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

module.exports = router;
