---
title: Riseframe
emoji: 🎬
colorFrom: orange
colorTo: purple
sdk: docker
app_port: 4000
pinned: false
---

# Riseframe

Editor de vídeo com IA — legendas dinâmicas, cortes automáticos, B-roll e color grade.

O container builda o frontend e serve o site + a API na mesma porta (4000).
Transcrição via Deepgram (defina `DEEPGRAM_API_KEY` nos secrets do Space).

Secrets (Settings → Variables and secrets), com os mesmos valores do Render:
- **Essenciais:** `AUTH_SECRET`, `DEEPGRAM_API_KEY`, `ADMIN_EMAILS` e `APP_URL`
  (o endereço do Space, ex.: `https://usuario-riseframe.hf.space`).
- **Contas, planos e Pix (recomendado):** `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` — o disco
  do Space não é permanente; com o Supabase as contas sobrevivem a reinícios e vêm do Render.
- **E-mails:** `RESEND_API_KEY`, `EMAIL_FROM`.
- **Imagens e IA:** `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `ANTHROPIC_API_KEY`, `SERPER_API_KEY` ou `BRAVE_SEARCH_KEY` (Google Imagens), `GOOGLE_CSE_KEY`, `GOOGLE_CSE_ID`.
- **Cobrança:** `ABACATE_PAY_API_KEY`, `ABACATE_WEBHOOK_SECRET`.

Atualizar para a versão nova do GitHub: Settings → **Factory rebuild**.
