# RiseFlow Payment System Documentation

Complete guide to the token/credit payment system powered by AbacatePay.

## System Overview

The payment system allows users to purchase tokens (credits) used for rendering videos with AI. The system is fully integrated with the frontend UI (Credits page) and backend payment processing.

### Architecture

```
Frontend (React)
  ↓ (user selects plan + payment method)
  ↓
src/pages/Credits.jsx
  ↓ (POST /api/payments/abacate)
  ↓
server/src/routes/payments.js (protected endpoint)
  ↓ (calls AbacatePay API v2)
  ↓
AbacatePay (payment processor)
  ↓ (webhook confirmation)
  ↓
server/src/routes/payments.js (webhook handler - public)
  ↓ (updates Supabase)
  ↓
users.credits column (database)
```

## Features

- **Three plan tiers:**
  - Starter: 500 tokens for R$ 29.90
  - Pro: 2,000 tokens for R$ 99.90 (most popular)
  - Enterprise: 5,000 tokens for R$ 249.90

- **Three payment methods:**
  - PIX (instant)
  - Credit Card (up to 12 installments)
  - Boleto (2-3 business days)

- **Security:**
  - HMAC-SHA256 webhook signature validation
  - Rate limiting on payment endpoint (5 requests per user per 15 minutes)
  - JWT authentication for payment initiation
  - Payment method normalization to prevent injection

- **Production-Ready:**
  - Development mode with simulated payments
  - Production mode with real AbacatePay integration
  - Automatic transaction logging
  - Database integration with error handling

## File Structure

```
src/
├── pages/
│   └── Credits.jsx                    # Payment UI (plan selection + modal)
└── components/
    └── Layout/
        └── Sidebar.jsx                # "Comprar créditos" button + balance display

server/
├── src/routes/
│   └── payments.js                    # 4 endpoints + webhook handler
├── middleware/
│   ├── auth.js                        # JWT validation
│   └── rateLimit.js                   # Payment rate limiting
└── index.js                           # Route registration

Documentation/
├── PAYMENTS_README.md                 # This file
├── DEPLOYMENT.md                      # Production deployment guide
├── PRODUCTION_ENV_SETUP.md            # Environment variables reference
├── ABACATEPAY_SETUP.md               # AbacatePay integration guide
└── ABACATEPAY_TEST.md                # Testing with curl examples
```

## API Endpoints

### 1. Initiate Payment (Protected)
```
POST /api/payments/abacate
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "planId": "pro",                    // "starter" | "pro" | "enterprise"
  "paymentMethod": "pix"              // "pix" | "credit_card" | "boleto"
}

Response:
{
  "transactionId": "tx_1234...",
  "status": "pending",
  "redirectUrl": null,                // null for dev, URL for prod
  "paymentMethod": "pix",
  "amount": 99.90
}
```

**Rate limit:** 5 requests per user per 15 minutes (429 if exceeded)

### 2. Check Payment Status (Protected)
```
GET /api/payments/status/:transactionId
Authorization: Bearer <JWT>

Response:
{
  "transactionId": "tx_1234...",
  "status": "completed",              // "pending" | "completed" | "failed"
  "credits": 2000,                    // Only if completed
  "message": "Pagamento concluído com sucesso"
}
```

### 3. Webhook (Public - AbacatePay Only)
```
POST /api/payments/webhook
Content-Type: application/json
X-Abacate-Signature: <HMAC-SHA256>

{
  "transactionId": "tx_1234...",
  "status": "paid",
  "metadata": {
    "userId": "uuid-...",
    "planId": "pro",
    "credits": 2000
  }
}
```

**Security:** Signature validated with ABACATE_WEBHOOK_SECRET

## Development Setup

### 1. Install Dependencies
```bash
npm install                 # Root (frontend)
npm --prefix server install # Backend
```

### 2. Environment Variables (`server/.env`)
```
JWT_SECRET=dev_secret_key_change_in_prod
NODE_ENV=development
ABACATE_API_KEY=dev_key_placeholder
ABACATE_WEBHOOK_SECRET=dev_secret
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_key
CORS_ORIGIN=http://localhost:3001,http://localhost:3000
```

### 3. Run Development
```bash
# Terminal 1: Frontend (Vite on :3001)
npm run dev

# Terminal 2: Backend (Express on :3333)
npm run dev:server

# Or all at once:
npm run dev:all
```

### 4. Test in Browser
1. Go to http://localhost:3001
2. Log in (or demo mode)
3. Click sidebar "Comprar créditos" button
4. Select plan and payment method
5. Click "Pagar Agora"
6. In dev mode, success message shows (no redirect needed)

## Testing

### Unit Testing Payment Validation

```javascript
// test/payments.test.js
import { test } from 'vitest';
import payments from '../server/src/routes/payments';

test('validates HMAC signatures', () => {
  // Webhook signature validation
});

test('enforces rate limiting', () => {
  // 6th request in 15min window returns 429
});
```

### Integration Testing with curl

See `ABACATEPAY_TEST.md` for complete curl examples:

```bash
# Get JWT token first
TOKEN=$(curl -s -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}' | jq -r '.token')

# Test payment initiation
curl -X POST http://localhost:3333/api/payments/abacate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"planId":"pro","paymentMethod":"pix"}'
```

### Manual Browser Testing

1. **Happy path (successful payment):**
   - Select plan, choose payment method, click "Pagar Agora"
   - Dev mode: toast shows success + transaction ID
   - Prod: redirects to AbacatePay checkout

2. **Rate limit test:**
   - Click "Pagar Agora" 6 times rapidly
   - 6th request should return 429 error

3. **Payment status check:**
   - After payment, query `/api/payments/status/:transactionId`
   - Should show updated credits (prod) or simulated success (dev)

## Production Deployment

### Prerequisites
1. Supabase project created and configured
2. AbacatePay production account + API keys
3. Render account + GitHub connected

### Quick Start
1. See `DEPLOYMENT.md` for step-by-step guide
2. Fill in `PRODUCTION_ENV_SETUP.md` variables in Render
3. Push to GitHub and deploy via Render Blueprint
4. Test payment endpoint with production URL

### Post-Deployment Checklist
- [ ] Health check passes: `/health`
- [ ] Payment endpoint returns 200: `POST /api/payments/abacate`
- [ ] Webhook signature validation working
- [ ] Test payment appears in AbacatePay dashboard
- [ ] Database updated with credits (check Supabase)
- [ ] Email notifications sent (if configured)

## Database Schema

### users Table
```sql
ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 0;
```

### activity_logs Table (Optional)
```sql
CREATE TABLE activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Records payment completions:
-- { action: 'payment_completed', details: { transactionId, planId, creditsAdded, newTotal } }
```

## Troubleshooting

### Payment Endpoint Returns 401
- JWT token expired or invalid
- Check `Authorization: Bearer` header
- Get new token from `/api/auth/login`

### Payment Endpoint Returns 429
- Rate limit exceeded (5 per user per 15 minutes)
- Wait 15 minutes or use different user account for testing

### Webhook Signature Invalid
- `ABACATE_WEBHOOK_SECRET` doesn't match AbacatePay config
- Regenerate secret in AbacatePay → Webhooks
- Update environment variable and redeploy

### Credits Not Updating After Payment
- Webhook not received (check Render logs)
- Database user_id mismatch (verify in Supabase)
- Supabase not configured (dev environment)

### CORS Error on Frontend
- `CORS_ORIGIN` doesn't match app domain
- For prod: set `CORS_ORIGIN` to deployed URL
- For dev: ensure `http://localhost:3001` is in CORS_ORIGIN

## Environment Variables Reference

| Variable | Required | Dev | Prod | Description |
|----------|----------|-----|------|-------------|
| `JWT_SECRET` | ✓ | any | auto-gen | Proxy JWT secret |
| `WEBHOOK_TOKEN` | ✓ | any | auto-gen | Webhook auth token |
| `SUPABASE_URL` | ✓ | ✓ | ✓ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | ✓ | Supabase service role key |
| `ABACATE_API_KEY` | ✓ | dev_key | prod_key | AbacatePay API key |
| `ABACATE_WEBHOOK_SECRET` | ✓ | any | webhook_secret | Webhook signature secret |
| `APP_URL` | ✓ | - | required | App's public URL (for redirects) |
| `CORS_ORIGIN` | ✓ | localhost:3001 | app_domain | Allowed CORS origins |

See `PRODUCTION_ENV_SETUP.md` for complete reference.

## Next Steps

### Planned Features
- [ ] Coupon/discount code system
- [ ] Payment history page with filters
- [ ] Email receipts after payment
- [ ] Multi-currency support (USD, EUR, etc)
- [ ] Subscription plans (auto-renew)
- [ ] Admin dashboard for payment management
- [ ] Refund processing UI
- [ ] Invoice generation (PDF)

### Infrastructure
- [ ] Monitoring: Sentry error tracking
- [ ] Analytics: Payment funnel tracking
- [ ] Backup: Encrypted payment data backups
- [ ] Scale: Redis rate limiting for multi-instance
- [ ] Load testing: Stress test payment endpoints

## Support

For issues or questions:

1. Check relevant guide:
   - Setup issues → `ABACATEPAY_SETUP.md`
   - Deployment issues → `DEPLOYMENT.md`
   - Testing issues → `ABACATEPAY_TEST.md`

2. Check logs:
   ```bash
   # Local dev
   npm run dev:server  # See console output
   
   # Production
   # Render dashboard → Service → Logs
   ```

3. Contact AbacatePay support: https://app.abacatepay.com/support

---

**Last Updated:** 2026-09-22  
**Status:** Production Ready  
**Version:** 1.0.0
