# Integração AbacatePay v2 - Riseframe

Guia de setup e configuração do sistema de pagamentos com **AbacatePay API v2**.

**Versão API**: v2 (Checkout, Assinaturas, Transparente e recursos compartilhados)  
**Documentação Oficial**: https://docs.abacatepay.com/v2

## 📋 Visão Geral

O sistema de pagamentos Riseframe foi integrado com a plataforma **AbacatePay** para processar vendas de créditos (tokens). A implementação suporta três métodos de pagamento:

- **PIX**: Pagamento instantâneo
- **Cartão de Crédito**: Parcelado até 12x
- **Boleto**: Processamento em 2-3 dias úteis

## 🔧 Configuração

### 1. Variáveis de Ambiente (`.env` do servidor)

Adicione no arquivo `server/.env`:

```env
# AbacatePay Configuration (API v2)
ABACATE_API_KEY=seu_api_key_aqui
ABACATE_API_URL=https://api.abacatepay.com/v2
ABACATE_WEBHOOK_SECRET=seu_webhook_secret_aqui
NODE_ENV=production  # ou development para testes

# Payment URLs (para produção)
PAYMENT_RETURN_URL=https://riseframe.com.br/dashboard
SERVER_URL=https://api.riseframe.com.br
```

### 2. Obter Credenciais AbacatePay v2

1. Acesse https://dashboard.abacatepay.com
2. Faça login ou crie uma conta
3. Vá para **"Integrações"** → **"Chaves de API"**
4. Clique em **"Nova chave"**
5. Selecione **"API v2"** (com Checkout, Assinaturas, etc)
6. Escolha **Escopo**: "Pagamentos" ou similar
7. Configure **Permissões**: Leitura e Escrita
8. Dê uma descrição: "Riseframe - Pagamento de Créditos"
9. Salve e copie a chave (só aparece uma vez!)
10. Copie também o **Webhook Secret** para validação de assinatura
11. Guarde com segurança - **nunca commite no Git**

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
    "credits": 2000,
    "planId": "pro"
  }
}
```

### Segurança do Webhook

O endpoint valida a assinatura HMAC-SHA256 usando o header `x-abacate-signature`:

```javascript
const crypto = require('crypto');

const signature = req.headers['x-abacate-signature'];
const payloadStr = JSON.stringify(req.body);
const hmac = crypto
  .createHmac('sha256', process.env.ABACATE_WEBHOOK_SECRET)
  .update(payloadStr)
  .digest('hex');

if (hmac !== signature) {
  return res.status(401).json({ error: 'Assinatura inválida' });
}
```

✅ **Implementado** em `server/src/routes/payments.js`:
- Validação de assinatura HMAC-SHA256
- Verificação da origem (header `x-abacate-signature`)
- Retorno 401 se assinatura for inválida

### Integração com Banco de Dados

Quando um webhook com `status: "paid"` é recebido:

1. **Validação** de assinatura (segurança)
2. **Busca** do usuário na tabela `users`
3. **Adição** de créditos: `user.credits += metadata.credits`
4. **Registro** da transação em `activity_logs`:
   ```json
   {
     "user_id": "uuid",
     "action": "payment_completed",
     "details": {
       "transactionId": "tx_xxx",
       "planId": "pro",
       "creditsAdded": 2000,
       "newTotal": 2500
     }
   }
   ```

✅ **Implementado** em `server/src/routes/payments.js`:
- Integração com Supabase `users` table
- Atualização atômica de créditos
- Registro de histórico de transações em `activity_logs`
- Logging estruturado para auditorias

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
   - [x] Implementar validação de assinatura HMAC
   - [x] Registrar créditos no banco quando pagamento confirmado
   - [x] Registrar histórico de transações
   - [ ] Enviar email de confirmação
   - [ ] Implementar retry logic para webhook
   - [ ] Tratamento de refund/chargeback

2. **Frontend:**
   - [ ] Página de status de pagamento (pending, completed, failed) com polling
   - [ ] Integração de PIX QR code display para metodo PIX
   - [ ] Resgate de cupons/descontos
   - [ ] Histórico de transações estilizado com filtros
   - [ ] Notificação de sucesso/erro após pagamento

3. **DevOps:**
   - [ ] CI/CD para secrets (ABACATE_API_KEY, WEBHOOK_SECRET)
   - [ ] Monitoring de pagamentos falhados
   - [ ] Alertas para transações suspeitas (múltiplas tentativas, valores alto)
   - [ ] Rate limiting no endpoint /api/payments/abacate
   - [ ] Logs estruturados para conformidade PCI

## 📞 Suporte AbacatePay

- **Dashboard**: https://dashboard.abacatepay.com
- **Docs**: https://docs.abacatepay.com
- **Email**: support@abacatepay.com

## 💡 Notas

- Todos os valores estão em **BRL (Real)**
- Transações são armazenadas com ID único (`tx_*`)
- Método PIX requer confirmação manual do usuário
- Métodos de pagamento podem ser adicionados/removidos no array `PAYMENT_METHODS`
