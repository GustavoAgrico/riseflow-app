# Testes da Integração AbacatePay v2

Guia para testar a integração com AbacatePay usando curl e exemplos práticos.

## 🧪 Teste com curl (Local)

### 1. Iniciar Pagamento via PIX

```bash
curl -X POST http://localhost:3333/api/payments/abacate \
  -H "Authorization: Bearer seu_jwt_token_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "pro",
    "paymentMethod": "pix"
  }'
```

**Resposta esperada (desenvolvimento):**
```json
{
  "transactionId": "tx_1695123456_abc789",
  "status": "pending",
  "method": "pix",
  "amount": 99.90,
  "redirectUrl": null,
  "message": "Modo teste: pagamento simulado"
}
```

### 2. Iniciar Pagamento via Cartão de Crédito

```bash
curl -X POST http://localhost:3333/api/payments/abacate \
  -H "Authorization: Bearer seu_jwt_token_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "starter",
    "paymentMethod": "credit_card"
  }'
```

**Resposta esperada (produção):**
```json
{
  "transactionId": "tx_1695123456_def456",
  "status": "pending",
  "redirectUrl": "https://checkout.abacatepay.com/checkout/xyz123",
  "paymentMethod": "credit_card",
  "amount": 29.90
}
```

### 3. Verificar Status do Pagamento

```bash
curl -X GET http://localhost:3333/api/payments/status/tx_1695123456_abc789 \
  -H "Authorization: Bearer seu_jwt_token_aqui"
```

**Resposta esperada:**
```json
{
  "transactionId": "tx_1695123456_abc789",
  "status": "completed",
  "credits": 2000,
  "message": "Pagamento concluído com sucesso"
}
```

## 🔄 Fluxo Completo de Teste

### Teste 1: PIX (Instantâneo)
1. Faça login no app
2. Vá para "Comprar créditos"
3. Escolha plano "Pro" (R$ 99,90)
4. Selecione método **PIX**
5. Clique "Pagar com AbacatePay"
6. ✅ Em dev: verá mensagem de sucesso
7. ✅ Em prod: verá QR code PIX para escanear

### Teste 2: Cartão de Crédito (Redirect)
1. Repita passos 1-4
2. Selecione método **Cartão de Crédito**
3. Clique "Pagar com AbacatePay"
4. ✅ Em dev: verá mensagem de sucesso
5. ✅ Em prod: será redirecionado para checkout AbacatePay
6. ✅ Após pagamento, voltará para dashboard

### Teste 3: Boleto (2-3 dias)
1. Repita passos 1-4
2. Selecione método **Boleto**
3. Clique "Pagar com AbacatePay"
4. ✅ Em dev: verá mensagem de sucesso
5. ✅ Em prod: receberá número do boleto para pagar

## 📝 Exemplos de Payload (API v2)

### Checkout Create
```javascript
POST /v2/checkout
{
  "amount": 9990,                    // em centavos
  "currency": "BRL",
  "description": "2000 tokens - Riseframe Video Editor",
  "orderId": "tx_1695123456_abc789",
  "paymentMethod": "PIX",            // PIX, CREDIT_CARD, BOLETO
  "customer": {
    "id": "user_uuid_123",
    "email": "user@example.com"
  },
  "metadata": {
    "planId": "pro",
    "tokens": 2000
  },
  "redirectUrl": "https://riseframe.com.br/dashboard",
  "webhookUrl": "https://api.riseframe.com.br/api/payments/webhook"
}
```

### Webhook Payload (de AbacatePay)
```javascript
POST /api/payments/webhook
{
  "transactionId": "tx_1695123456_abc789",
  "status": "paid",
  "amount": 9990,
  "currency": "BRL",
  "paymentMethod": "PIX",
  "customer": {
    "id": "user_uuid_123",
    "email": "user@example.com"
  },
  "metadata": {
    "planId": "pro",
    "tokens": 2000
  },
  "timestamp": "2024-01-15T14:30:00Z"
}
```

## 🔐 Validar Webhook com HMAC

```javascript
// Node.js
const crypto = require('crypto');

function validateWebhookSignature(payload, signature, secret) {
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return hmac === signature;
}

// Uso:
const isValid = validateWebhookSignature(
  req.body,
  req.headers['x-abacate-signature'],
  process.env.ABACATE_WEBHOOK_SECRET
);
```

## 🛠️ Debug & Troubleshooting

### Erro: "ABACATE_API_KEY ausente"
```bash
# Verifique o .env
cat server/.env | grep ABACATE

# Copie o template e configure
cp server/.env.abacatepay.example server/.env
# Edite o arquivo e adicione suas credenciais
```

### Erro: "Serviço de pagamento indisponível"
```bash
# Verifique se a API URL está correta
echo $ABACATE_API_URL
# Deve ser: https://api.abacatepay.com/v2

# Teste a conexão
curl -H "Authorization: Bearer $ABACATE_API_KEY" \
  https://api.abacatepay.com/v2/health
```

### Erro: "Falha ao verificar assinatura webhook"
```bash
# Certifique-se que o WEBHOOK_SECRET está correto
# Ele deve ser copiado do dashboard, não a API_KEY

# Verifique que está usando HMAC-SHA256
# (não SHA1 ou MD5)
```

## 📊 Monitoramento

### Logs Importantes

```javascript
// Log antes de chamar AbacatePay
console.log(`[Payment] Iniciando ${paymentMethod} para plano ${planId}`, {
  amount: plan.price,
  transactionId,
  userId
});

// Log de resposta
console.log(`[Payment] Resposta AbacatePay:`, response.status, response.data);

// Log de webhook recebido
console.log(`[Webhook] Pagamento ${transactionId} => ${status}`);
```

### Métricas para Monitorar
- Taxa de sucesso por método de pagamento
- Tempo médio de processamento
- Taxa de chargeback (se houver)
- Clientes com múltiplas tentativas falhadas

## 🚀 Checklist de Teste Pré-Deploy

- [ ] Teste PIX em desenvolvimento
- [ ] Teste Cartão em desenvolvimento
- [ ] Teste Boleto em desenvolvimento
- [ ] Teste webhook com payload real
- [ ] Valide assinatura HMAC do webhook
- [ ] Verifique que créditos são adicionados após pagamento
- [ ] Teste com múltiplos usuários simultaneamente
- [ ] Teste refund/chargeback workflow
- [ ] Verifique emails de confirmação
- [ ] Simule falha de API (circuit breaker)
- [ ] Teste retry de webhook
- [ ] Verifique logs em produção

## 📞 Recursos Úteis

- **Dashboard AbacatePay**: https://dashboard.abacatepay.com
- **Docs v2**: https://docs.abacatepay.com/v2
- **API Reference**: https://docs.abacatepay.com/v2/api-reference
- **Webhooks Guide**: https://docs.abacatepay.com/v2/webhooks
- **Status Page**: https://status.abacatepay.com
