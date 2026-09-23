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

Secrets (Settings → Variables and secrets): `AUTH_SECRET`, `DEEPGRAM_API_KEY`,
`PEXELS_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CSE_KEY`, `GOOGLE_CSE_ID`,
`ADMIN_EMAILS`, `ABACATE_PAY_API_KEY`, `ABACATE_WEBHOOK_SECRET` e `APP_URL`
(o endereço do Space, ex.: `https://usuario-riseframe.hf.space`).

Atualizar para a versão nova do GitHub: Settings → **Factory rebuild**.
