# Publicar o Riseframe (Netlify grátis + backend no Render)

O Riseframe tem duas partes:

| Parte | O que é | Onde hospedar |
|---|---|---|
| **Frontend** (`web/`) | site React estático | **Netlify (grátis)** ✅ |
| **Backend** (`server/`) | Express + **FFmpeg** + Whisper (processa o vídeo) | **Render / Railway / VPS** (a Netlify NÃO roda isso) |

> ⚠️ A Netlify só serve arquivos estáticos e funções curtas. Ela **não** consegue
> rodar FFmpeg, uploads grandes de vídeo nem o progresso em tempo real. Por isso o
> backend precisa de um servidor de verdade. Sem o backend, o site abre mas não
> processa vídeo.

---

## 1) Backend no Render (grátis)

Vocês já têm `render.yaml` no repositório `GustavoAgrico/riseflow-app`.

1. Acesse https://render.com → **New → Blueprint** e conecte o repositório.
2. Configure as variáveis de ambiente do serviço (Environment):
   - `JWT_SECRET` = uma string aleatória forte
   - `CORS_ORIGIN` = a URL do seu site na Netlify (ex.: `https://riseframe.netlify.app`)
   - (opcionais) `PEXELS_API_KEY`, `ANTHROPIC_API_KEY`
3. Faça o deploy e anote a URL pública, ex.: `https://riseframe-api.onrender.com`.

> No plano grátis do Render o serviço "dorme" quando ocioso; a 1ª requisição
> depois de dormir demora alguns segundos. Para produção séria, use um plano pago.

## 2) Frontend na Netlify (grátis)

1. Acesse https://app.netlify.com → **Add new site → Import an existing project** e
   conecte o repositório `GustavoAgrico/riseflow-app`.
2. A Netlify lê o `web/netlify.toml` automaticamente:
   - **Base**: `riseframe/web`
   - **Build**: `npm install && npm run build`
   - **Publish**: `dist`
3. Em **Site settings → Environment variables**, adicione:
   - `VITE_API_URL` = a URL do backend no Render (ex.: `https://riseframe-api.onrender.com`)
     — **sem** `/api` no final; o app adiciona sozinho.
4. **Deploy**. Sua URL fica algo como `https://riseframe.netlify.app`.

## 3) Ligar os dois (CORS)

No Render, garanta que `CORS_ORIGIN` tenha exatamente a URL da Netlify
(ex.: `https://riseframe.netlify.app`). Se mudar o domínio, atualize e reinicie o
backend.

---

## Alternativa mais simples: tudo no Render

Como o app precisa do backend de qualquer forma, dá para publicar **tudo junto no
Render** (o Dockerfile builda o frontend e o Express serve o `dist` + `/api` na
mesma porta) — aí você **não precisa da Netlify nem de CORS**. É o caminho do
`render.yaml`. A Netlify só vale a pena se você quiser o frontend numa CDN
separada.
