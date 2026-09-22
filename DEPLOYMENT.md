# RiseFlow Production Deployment Guide

This guide walks through deploying RiseFlow to production on Render.

## Pre-Deployment Checklist

- [ ] Supabase project created and configured
- [ ] AbacatePay account created and API keys obtained
- [ ] All environment variables documented
- [ ] Payment system tested in development
- [ ] Database migrations applied in Supabase
- [ ] WhatsApp server (riseflow-wa-server) deployed separately
- [ ] All code committed and pushed to GitHub

## Step 1: Set Up Supabase Production Project

1. Create a Supabase project (or use existing production project)
2. Run all SQL migrations from `supabase/migrations/` in the Supabase dashboard SQL editor
3. Create `users` table with `credits` column if not already present:
   ```sql
   ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 0;
   ```
4. Copy these from Supabase Settings:
   - Project URL → `SUPABASE_URL`
   - Service Role Key (not anon key) → `SUPABASE_SERVICE_ROLE_KEY`
   - Anon Key → `VITE_SUPABASE_ANON_KEY`

## Step 2: Set Up AbacatePay Production

1. Log into [app.abacatepay.com](https://app.abacatepay.com) (production)
2. Navigate to Settings → API Keys
3. Create or copy your Production API Key → `ABACATE_API_KEY`
4. Navigate to Webhooks → create a new webhook:
   - Event type: `payment.completed`, `payment.failed`
   - URL: `https://your-app-domain.onrender.com/api/payments/webhook`
   - Copy the Webhook Secret → `ABACATE_WEBHOOK_SECRET`

## Step 3: Deploy to Render

### Option A: Using Render Dashboard (Recommended)

1. Go to [render.com](https://render.com) and sign in
2. Click **New** → **Blueprint**
3. Connect your GitHub account and select `GustavoAgrico/riseflow-app`
4. Select branch: `claude/riseframe-premium-broll` (or your main branch)
5. Click **Create from Blueprint**
6. Render will ask for each environment variable marked `sync: false`

### Required Variables (Fill these in Render Dashboard):

**Supabase (Required)**
```
SUPABASE_URL = <your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY = <service-role-key>
VITE_SUPABASE_URL = <same-as-SUPABASE_URL>
VITE_SUPABASE_ANON_KEY = <anon-key>
```

**AbacatePay (Required for Payments)**
```
ABACATE_API_KEY = <production-api-key>
ABACATE_WEBHOOK_SECRET = <webhook-secret>
APP_URL = https://your-app-name.onrender.com
```

**CORS & Connections (Update after first deploy)**
```
CORS_ORIGIN = https://your-app-name.onrender.com
BAILEYS_URL = https://riseflow-wa-XXXX.onrender.com
BAILEYS_KEY = <shared-api-key-from-baileys-server>
```

**Optional: Email & Admin**
```
ADMIN_EMAILS = gugahagrico12@gmail.com,other@example.com
TELEGRAM_WEBHOOK_BASE = https://your-app-name.onrender.com
```

**Optional: Push Notifications (Web Push)**
```
VITE_VAPID_PUBLIC_KEY = <public-key>
VAPID_PUBLIC_KEY = <public-key>
VAPID_PRIVATE_KEY = <private-key>
```

### Step-by-Step Render Setup:

1. **Initial Deploy** (Render auto-generates JWT_SECRET and WEBHOOK_TOKEN)
   - Let Render build and deploy (takes ~5-10 min)
   - Once live, copy the deployed URL

2. **Update Dynamic Variables** (after first deploy)
   - Go to your Render service → Environment
   - Update:
     - `CORS_ORIGIN` = your deployed URL
     - `BAILEYS_URL` = WhatsApp server URL (from separate deployment)
     - `APP_URL` = your deployed URL
   - Click **Save** (triggers rebuild)

3. **Test Health Check**
   - Visit: `https://your-app.onrender.com/health`
   - Should respond: `{ "ok": true, "ts": <timestamp> }`

4. **Test Payment Endpoint** (after AbacatePay webhook configured)
   ```bash
   curl -X POST https://your-app.onrender.com/api/payments/abacate \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"planId":"pro","paymentMethod":"pix"}'
   ```

## Step 4: Configure Production Database

### Create Missing Tables (if using fresh Supabase)

Run these in Supabase SQL editor:

```sql
-- Users table with credits
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;

-- Activity logs (for payment tracking)
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment transactions (optional, for transaction history)
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  transaction_id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Enable RLS if needed
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
```

## Step 5: Verify Webhook Delivery

1. Make a test payment in production UI
2. Check your Render logs:
   ```bash
   # Via Render dashboard: Service → Logs
   # Or via Render CLI:
   render logs -s riseflow-app
   ```
3. Look for lines like:
   ```
   [webhook] Pagamento tx_XXX confirmado: +2000 créditos para user_uuid
   ```

## Step 6: Enable Auto-Deploy (Optional)

In Render dashboard:
- Service → Settings → Auto-Deploy
- Set to: Deploy on push to branch `main` or `claude/riseframe-premium-broll`

## Monitoring & Debugging

### Check Logs
```bash
# Render CLI
render logs -s riseflow-app -f  # follow logs

# Or via dashboard: Service → Logs
```

### Common Issues

**Issue: "Health check failed"**
- Check `/health` endpoint responds
- Ensure `NODE_ENV=production` is set
- Verify database connection string is correct

**Issue: Payments return 500 error**
- Check `ABACATE_API_KEY` is set correctly
- Verify `APP_URL` matches deployed domain
- Look for Supabase connection errors in logs

**Issue: "Webhook signature invalid"**
- Verify `ABACATE_WEBHOOK_SECRET` matches AbacatePay config
- Check that AbacatePay webhook URL points to `/api/payments/webhook`

**Issue: CORS errors on frontend**
- Update `CORS_ORIGIN` to match your domain
- Trigger rebuild by clicking "Manual Deploy" in Render

## Rollback

If deployment has critical issues:

1. In Render dashboard, go to Service → Deploys
2. Click on previous successful deploy
3. Click **Redeploy**

## Post-Deployment Tests

1. **Health Check**
   ```bash
   curl https://your-app.onrender.com/health
   ```

2. **Payment Flow (PIX)**
   - Go to app, click "Comprar créditos"
   - Select plan and PIX method
   - Payment modal should show
   - Click "Pagar Agora"
   - Should succeed (or redirect to AbacatePay if fully integrated)

3. **Payment Flow (Credit Card)**
   - Repeat above but select Credit Card
   - Should redirect to AbacatePay checkout

4. **Database Update**
   - After successful payment (webhook received)
   - Check Supabase: `SELECT credits FROM users WHERE id = 'your_id'`
   - Credits should be updated

## Monitoring Dashboard

Access logs and metrics:
- Render Dashboard: Service → Logs, Metrics, Events
- Supabase Dashboard: SQL Editor to check users table
- AbacatePay: Dashboard → Transactions to verify payments

## Scale Up (Optional)

When ready for production load:
1. Render Dashboard → Service → Plan
2. Upgrade from "Free" to "Pro" (always on, better CPU)
3. Or set "Spinning Down" to Never if using Starter

---

**Questions?** Check:
- `ABACATEPAY_SETUP.md` - AbacatePay integration details
- `ABACATEPAY_TEST.md` - Testing guide with curl examples
- `CLAUDE.md` - Architecture overview
