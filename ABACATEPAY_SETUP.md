# Integração AbacatePay - Riseframe

Guia de setup e configuração do sistema de pagamentos com AbacatePay.

## 📋 Visão Geral

O sistema de pagamentos Riseframe foi integrado com a plataforma **AbacatePay** para processar vendas de créditos (tokens). A implementação suporta três métodos de pagamento:

- **PIX**: Pagamento instantâneo
- **Cartão de Crédito**: Parcelado até 12x
- **Boleto**: Processamento em 2-3 dias úteis

## 🔧 Configuração

### 1. Variáveis de Ambiente (`.env` do servidor)

Adicione no arquivo `server/.env`:

```env
# AbacatePay Configuration
ABACATE_API_KEY=seu_api_key_aqui
ABACATE_API_URL=https://api.abacatepay.com
NODE_ENV=production  # ou development para testes

# Payment URLs (para produção)
PAYMENT_RETURN_URL=https://riseframe.com.br/dashboard
SERVER_URL=https://api.riseframe.com.br
```

### 2. Obter Credenciais AbacatePay

1. Acesse https://dashboard.abacatepay.com
2. Faça login ou crie uma conta
3. Vá para "Integrations" → "API Keys"
4. Copie sua chave de API (Public e Secret)
5. Guarde com segurança - nunca commite no Git

### 3. Configurar URLs de Callback

No dashboard do AbacatePay, configure:

- **Return URL**: `https://riseframe.com.br/dashboard`
- **Webhook URL**: `https://api.riseframe.com.br/api/payments/webhook`
- **Notification URL**: Mesmo que Webhook URL

## 🔄 Fluxo de Pagamento

### Lado Frontend (React)

```javascript
// 1. Usuário clica "Comprar agora" em um plano
handleBuy(plan)
// → Abre modal de pagamento

// 2. Seleciona método de pagamento (PIX, Cartão, Boleto)
setSelectedPaymentMethod(method)

// 3. Clica "Pagar com AbacatePay"
handleProcessPayment()
// → Chama backend /api/payments/abacate

// 4. Para PIX: Aguarda confirmação
// 5. Para Cartão/Boleto: Redireciona para AbacatePay
```

### Lado Backend (Node.js)

```javascript
// POST /api/payments/abacate
// Body: { planId: 'pro', paymentMethod: 'pix' }

// Resposta em desenvolvimento:
{
  "transactionId": "tx_1695XXX_abc123",
  "status": "pending",
  "method": "pix",
  "amount": 99.90,
  "redirectUrl": null
}

// Resposta em produção (Cartão/Boleto):
{
  "transactionId": "tx_1695XXX_abc123",
  "status": "pending",
  "redirectUrl": "https://checkout.abacatepay.com/xyz",
  "paymentMethod": "credit_card"
}
```

## 💰 Planos Disponíveis

| Plano | Tokens | Preço | Preço/Token |
|-------|--------|-------|-----------|
| Starter | 500 | R$ 29,90 | 5,98¢ |
| Pro | 2000 | R$ 99,90 | 5,00¢ |
| Enterprise | 5000 | R$ 249,90 | 5,00¢ |

## 🧪 Modo Desenvolvimento

Em `NODE_ENV=development`, o sistema simula pagamentos sem chamar AbacatePay:

```javascript
// Desenvolvimento: retorna sucesso imediatamente
if (process.env.NODE_ENV === 'development') {
  return res.json({
    transactionId: 'tx_dev_mock',
    status: 'pending',
    message: 'Modo teste: pagamento simulado'
  });
}
```

### Testando Localmente

1. Configure `NODE_ENV=development` no `.env`
2. Não precisa de `ABACATE_API_KEY` (será ignorado)
3. Pagamentos simulados retornam sucesso
4. Histórico salvo em memória

## 🪝 Webhooks

AbacatePay enviará POST para `https://api.riseframe.com.br/api/payments/webhook` com:

```javascript
{
  "transactionId": "tx_1695XXX",
  "status": "paid",
  "metadata": {
    "userId": "user_uuid",
    "credits": 2000
  }
}
```

### Segurança do Webhook

O endpoint valida a assinatura HMAC (TODO - implementar):

```javascript
// TODO: Adicionar validação HMAC
const signature = req.headers['x-abacate-signature'];
const hmac = crypto
  .createHmac('sha256', ABACATE_WEBHOOK_SECRET)
  .update(req.body)
  .digest('hex');
if (signature !== hmac) return res.status(401).json({ error: 'Invalid signature' });
```

## 📊 Endpoints API

### POST /api/payments/abacate
Inicia um pagamento. Requer autenticação.

**Body:**
```json
{
  "planId": "pro",
  "paymentMethod": "pix"
}
```

**Resposta (sucesso):**
```json
{
  "transactionId": "tx_1695XXX",
  "status": "pending",
  "redirectUrl": "https://checkout.abacatepay.com/xyz",
  "paymentMethod": "credit_card",
  "amount": 99.90
}
```

### GET /api/payments/status/:transactionId
Verifica status de um pagamento. Requer autenticação.

**Resposta:**
```json
{
  "transactionId": "tx_1695XXX",
  "status": "completed",
  "credits": 2000,
  "message": "Pagamento concluído com sucesso"
}
```

### POST /api/payments/webhook
Webhook para confirmações de pagamento. Sem autenticação (protegido por HMAC).

## 🔐 Boas Práticas

1. **Nunca commite credenciais** - use `.env`
2. **Validar assinatura webhook** - implementar HMAC
3. **Registrar todas as transações** - guardar em DB
4. **Testes** - use modo desenvolvimento
5. **HTTPS obrigatório** - em produção, exigir TLS
6. **Rate limiting** - proteger endpoint /api/payments/abacate

## 🚀 Checklist de Deploy

- [ ] Variáveis de ambiente configuradas no servidor
- [ ] URLs de callback registradas no AbacatePay
- [ ] Webhook secret guardado de forma segura
- [ ] Validação HMAC implementada
- [ ] Banco de dados pronto para registrar créditos
- [ ] Email de confirmação configurado
- [ ] Página de status de pagamento pronta
- [ ] Testes completos com pagamentos reais

## 📝 TODOs

1. **Backend:**
   - [ ] Implementar validação de assinatura HMAC
   - [ ] Registrar créditos no banco quando pagamento confirmado
   - [ ] Registrar histórico de transações
   - [ ] Enviar email de confirmação
   - [ ] Implementar retry logic para webhook

2. **Frontend:**
   - [ ] Página de status de pagamento (pending, completed, failed)
   - [ ] Integração de PIX QR code display
   - [ ] Resgate de cupons/descontos
   - [ ] Histórico de transações estilizado

3. **DevOps:**
   - [ ] CI/CD para secrets
   - [ ] Monitoring de pagamentos falhados
   - [ ] Alertas para transações suspeitas

## 📞 Suporte AbacatePay

- **Dashboard**: https://dashboard.abacatepay.com
- **Docs**: https://docs.abacatepay.com
- **Email**: support@abacatepay.com

## 💡 Notas

- Todos os valores estão em **BRL (Real)**
- Transações são armazenadas com ID único (`tx_*`)
- Método PIX requer confirmação manual do usuário
- Métodos de pagamento podem ser adicionados/removidos no array `PAYMENT_METHODS`
