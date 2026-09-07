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
