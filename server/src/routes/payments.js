const express = require('express');
const { auth } = require('../../middleware/auth');

const router = express.Router();

// Configuração do AbacatePay (substitua com suas chaves reais)
const ABACATE_API_KEY = process.env.ABACATE_API_KEY || 'dev_key_placeholder';
const ABACATE_API_URL = process.env.ABACATE_API_URL || 'https://api.abacatepay.com';

const PLANS = {
  starter: { tokens: 500, price: 29.90 },
  pro: { tokens: 2000, price: 99.90 },
  enterprise: { tokens: 5000, price: 249.90 },
};

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

    // Em produção: integra com AbacatePay API
    const paymentPayload = {
      amount: Math.round(plan.price * 100), // Centavos
      currency: 'BRL',
      description: `${plan.tokens} tokens Riseframe`,
      orderId: transactionId,
      userId,
      paymentMethod,
      returnUrl: process.env.PAYMENT_RETURN_URL || 'http://localhost:5174/dashboard',
      notificationUrl: `${process.env.SERVER_URL || 'http://localhost:3333'}/api/payments/webhook`
    };

    // Chamada fictícia à AbacatePay (substitua com integração real)
    const abacateResponse = await fetch(`${ABACATE_API_URL}/v1/checkout`, {
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

    // Em produção: consulta status na AbacatePay
    const statusResponse = await fetch(`${ABACATE_API_URL}/v1/transactions/${transactionId}`, {
      headers: {
        'Authorization': `Bearer ${ABACATE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }).catch(() => null);

    if (!statusResponse || !statusResponse.ok) {
      return res.status(503).json({ error: 'Serviço indisponível' });
    }

    const data = await statusResponse.json();

    // Se pago, adiciona créditos ao usuário (implementar com DB)
    if (data.status === 'paid') {
      // TODO: Atualizar user.credits na base de dados
      // TODO: Registrar transação no histórico
    }

    res.json({
      transactionId,
      status: data.status,
      credits: data.metadata?.credits || 0,
      message: data.message || 'Consulta realizada'
    });
  } catch (err) {
    console.error('Erro ao verificar status:', err);
    res.status(500).json({ error: 'Erro ao verificar status' });
  }
});

/** POST /api/payments/webhook - Webhook de confirmação do AbacatePay */
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const { transactionId, status, metadata } = req.body;

    // Valida assinatura do webhook (importante para segurança)
    // TODO: Implementar validação de assinatura HMAC

    if (status === 'paid') {
      // Adiciona créditos ao usuário
      // TODO: Implementar lógica de adicionar créditos
      console.log(`Pagamento ${transactionId} confirmado para usuário ${metadata.userId}`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Erro no webhook:', err);
    res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

module.exports = router;
