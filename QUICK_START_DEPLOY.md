# 🚀 Quick Start: Deploy RiseFlow to Production

This is your checklist to get RiseFlow online in ~30 minutes.

## Step 1: Prepare Accounts (5 min)

- [ ] Create Supabase account at https://supabase.com
- [ ] Create AbacatePay account at https://app.abacatepay.com
- [ ] Have Render account ready at https://render.com

## Step 2: Get Credentials (10 min)

### Supabase
1. Go to https://app.supabase.com → Create new project
2. Wait for project to initialize
3. Go to Settings → API
4. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **Service Role Key** → `SUPABASE_SERVICE_ROLE_KEY` 
   - **Anon Key** → `VITE_SUPABASE_ANON_KEY`

### AbacatePay
1. Log into https://app.abacatepay.com
2. Go to Settings → API Keys
3. Copy **Production API Key** → `ABACATE_API_KEY`
4. Go to Webhooks → Create New
   - Event: `payment.completed`
   - URL: `https://your-app-name.onrender.com/api/payments/webhook` (we'll update this)
5. Copy **Webhook Secret** → `ABACATE_WEBHOOK_SECRET`

## Step 3: Deploy to Render (15 min)

1. Go to https://render.com/dashboard
2. Click **New** → **Blueprint**
3. Select GitHub account
4. Search for `riseflow-app` repo
5. Select branch: `claude/riseframe-premium-broll`
6. Click **Create from Blueprint**
7. Fill in variables when prompted:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase |
| `VITE_SUPABASE_URL` | same as SUPABASE_URL |
| `VITE_SUPABASE_ANON_KEY` | from Supabase |
| `ABACATE_API_KEY` | from AbacatePay |
| `ABACATE_WEBHOOK_SECRET` | from AbacatePay |

**Wait for build to finish** (~10 minutes)

## Step 4: Get Your App URL (1 min)

1. In Render dashboard, go to Service → Settings
2. Copy your URL: `https://riseflow-app-XXXXX.onrender.com`
3. Copy this URL

## Step 5: Update Dynamic URLs (2 min)

In Render dashboard, go to Environment and add/update:

```
CORS_ORIGIN = https://riseflow-app-XXXXX.onrender.com
APP_URL = https://riseflow-app-XXXXX.onrender.com
PAYMENT_RETURN_URL = https://riseflow-app-XXXXX.onrender.com/credits
SERVER_URL = https://riseflow-app-XXXXX.onrender.com
```

Click **Save** (triggers rebuild)

## Step 6: Configure AbacatePay Webhook (2 min)

1. Go to AbacatePay → Webhooks
2. Edit your webhook
3. Update URL to: `https://riseflow-app-XXXXX.onrender.com/api/payments/webhook`
4. Save

## Step 7: Verify It's Working (3 min)

```bash
# Test health check
curl https://riseflow-app-XXXXX.onrender.com/health

# Should return:
# {"ok":true,"ts":1234567890}
```

## Step 8: Test Payment Flow (2 min)

1. Go to your app: `https://riseflow-app-XXXXX.onrender.com`
2. Log in (or use demo mode)
3. Click **Comprar créditos** in sidebar
4. Select a plan (e.g., Pro)
5. Choose payment method (PIX recommended for testing)
6. Click **Pagar Agora**
7. Should show success message or redirect to AbacatePay

## 🎉 You're Live!

**Your app is now accessible at:**  
`https://riseflow-app-XXXXX.onrender.com`

---

## Troubleshooting Quick Fixes

### "Health check failed"
- Wait 2-3 minutes for deployment to fully complete
- Check Render logs: Service → Logs

### "Payment returns 500 error"
- Verify `ABACATE_API_KEY` is set correctly (no typos)
- Check that `APP_URL` matches your deployed domain
- Look at Render logs for error details

### "CORS error on frontend"
- Verify `CORS_ORIGIN` includes your deployed URL
- Manual Deploy again in Render to apply changes

### "Webhook signature invalid"
- Make sure `ABACATE_WEBHOOK_SECRET` matches AbacatePay config
- Verify webhook URL in AbacatePay is correct
- Generate new webhook secret if needed

---

## What's Included

✅ **Payment System**
- 3 pricing plans (Starter, Pro, Enterprise)
- 3 payment methods (PIX, Credit Card, Boleto)
- Automatic credit updates after payment
- Transaction logging

✅ **Security**
- JWT authentication
- HMAC-SHA256 webhook validation
- Rate limiting (5 payments per user per 15 minutes)
- Service role key kept server-side only

✅ **Frontend**
- Credits page with plan selection
- Payment modal with method selection
- Sidebar showing current balance
- Link to purchase credits

✅ **Documentation**
- Complete API documentation
- Setup guides for each service
- Testing procedures
- Troubleshooting guide

---

## Next Steps

1. **Test thoroughly** with real payments
2. Check logs regularly: Render → Service → Logs
3. Monitor AbacatePay dashboard for payment issues
4. Set up email notifications (optional)
5. Consider upgrading Render plan if needed (free tier is single-instance)

---

## Need Help?

📖 **See detailed guides:**
- `DEPLOYMENT.md` - Full deployment guide with all options
- `PAYMENTS_README.md` - Complete payment system documentation
- `PRODUCTION_ENV_SETUP.md` - All environment variables explained
- `ABACATEPAY_TEST.md` - Testing with curl examples

---

**Questions about AbacatePay?**  
Visit: https://app.abacatepay.com/support

**Questions about Render?**  
Visit: https://render.com/docs

---

🎊 **Congratulations! Your payment system is live!**
