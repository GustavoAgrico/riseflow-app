# Publicar o Riseframe no Render (tudo junto, grátis)

Um único serviço Docker builda o **frontend** e serve o site + a **API** (`/api`) na
mesma porta — não precisa de Netlify nem de CORS.

## Passo a passo (serviço manual — recomendado neste monorepo)

1. Acesse https://render.com → **New → Web Service** e conecte o repositório
   `GustavoAgrico/riseflow-app`.
2. Configure:
   - **Root Directory:** `riseframe`
   - **Runtime:** Docker · **Dockerfile Path:** `Dockerfile`
   - **Plan:** Free
   - **Health Check Path:** `/api/health`
3. Em **Environment**, adicione:

   | Variável | Valor | Para quê |
   |---|---|---|
   | `PORT` | `4000` | porta do servidor |
   | `CORS_ORIGIN` | `*` | frontend é servido junto |
   | `AUTH_SECRET` | (gerar aleatório forte) | mantém os logins válidos após reinício |
   | `OUTPUT_TTL_HOURS` | `6` | limpa renders antigos (disco pequeno no free) |
   | `TRANSCRIBE_PROVIDER` | `whisper-local` | legendas reais (ver nota do free) |
   | `WHISPER_MODEL` | `tiny` | modelo leve p/ caber no free |
   | `PEXELS_API_KEY` | *(opcional)* | B-roll automático |
   | `ANTHROPIC_API_KEY` | *(opcional)* | correção de fala + color grade por IA |

4. **Create Web Service.** No 1º deploy o Docker builda o frontend e baixa o modelo
   Whisper (demora alguns minutos). Ao terminar, a URL fica algo como
   `https://riseframe.onrender.com`.

> Alternativa: o arquivo `riseframe/render.yaml` já traz essa mesma configuração
> como referência (Blueprint), caso prefira aplicar via **New → Blueprint**.

## O que esperar no plano FREE

- **Dorme quando ocioso:** a 1ª visita depois de dormir demora ~30s para acordar.
- **512 MB de RAM:** vídeo é pesado. Com `WHISPER_MODEL=tiny` tem chance de rodar;
  se o serviço **reiniciar/der OOM** durante a transcrição, troque
  `TRANSCRIBE_PROVIDER` para `mock` (o app funciona, com legendas de exemplo) ou
  suba o plano. O servidor também cai para `mock` sozinho se o Whisper falhar.
- **Sem disco persistente:** contas de usuário, uploads e vídeos prontos são
  **temporários** — somem quando o serviço reinicia. Bom para testar/demonstrar.

## Para uso REAL (recomendado)

No `render.yaml` há um bloco comentado: mude para **plan: starter** (ou acima),
**adicione um disco** montado em `/app/data` (guarda usuários, uploads e renders
de forma persistente) e suba o `WHISPER_MODEL` para `base`/`small` (legendas
melhores). Aí o app fica estável e não dorme.
