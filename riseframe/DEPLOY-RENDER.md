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
   | `PIXABAY_API_KEY` | *(opcional)* | Mais vídeos e fotos livres no B-roll (chave grátis em pixabay.com/api/docs) |
   | `ANTHROPIC_API_KEY` | *(opcional)* | correção de fala + color grade por IA |

4. **Create Web Service.** No 1º deploy o Docker builda o frontend e baixa o modelo
   Whisper (demora alguns minutos). Ao terminar, a URL fica algo como
   `https://riseframe.onrender.com`.

> Alternativa: o arquivo `riseframe/render.yaml` já traz essa mesma configuração
> como referência (Blueprint), caso prefira aplicar via **New → Blueprint**.

## O que esperar no plano FREE

- **Dorme quando ocioso:** a 1ª visita depois de dormir demora ~30s para acordar.
- **512 MB de RAM:** vídeo é pesado. A transcrição local (`whisper-local`) roda um
  processo Python que, no free, pode **estourar a memória (OOM) ou travar**. Existe
  um timeout de segurança (o job cai para `mock` em vez de ficar preso), mas para
  **legendas reais de forma estável no free** a melhor opção é usar uma **API de
  transcrição** (roda fora da máquina, não consome a RAM):
  - **Deepgram** (`TRANSCRIBE_PROVIDER=deepgram` + `DEEPGRAM_API_KEY`) — crédito grátis inicial.
  - **AssemblyAI** (`TRANSCRIBE_PROVIDER=assemblyai` + `ASSEMBLYAI_API_KEY`) — tier grátis.
  - **OpenAI Whisper** (`TRANSCRIBE_PROVIDER=openai` + `OPENAI_API_KEY`) — ~US$0,006/min.

  Alternativas: `WHISPER_MODEL=tiny` (mais leve, pode rodar mas é instável no free),
  `TRANSCRIBE_PROVIDER=mock` (funciona com legendas de exemplo, só p/ demo) ou subir
  o plano. Ajuste fino do timeout: `TRANSCRIBE_TIMEOUT_MS` (ms).
- **Sem disco persistente:** uploads e vídeos prontos são **temporários** — somem
  quando o serviço reinicia. Contas, planos, Pix e configurações também sumiriam,
  **a não ser que a cópia no Supabase esteja ligada** (abaixo).

## Contas e planos salvos no Supabase (recomendado no free)

Com estas duas variáveis, o servidor guarda `users.json`, `billing.json`,
`settings.json`, `auth_secret` e a demonstração da página inicial num bucket
**privado** do Supabase Storage (`riseframe-data`, criado sozinho) e os traz de
volta a cada deploy/reinício:

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | `https://<ref-do-projeto>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → **service_role** (ou a *secret key* `sb_secret_…`) |

- A chave é secreta: só no Environment do Render, nunca no código.
- Confira em **Conta → Status do servidor → "Dados salvos na nuvem · Supabase"** ou em
  `/api/health` (`"cloud": "ok"`).
- Se o Supabase não responder no boot, o servidor tenta por ~2 min e reinicia (em vez
  de subir vazio e apagar os dados de lá). Chave errada → sobe sem a cópia e avisa.
- Opcional: `CLOUD_BUCKET` (outro nome de bucket), `CLOUD_SYNC=off` (desliga).
- Vídeos dos usuários **não** vão para o Supabase (são grandes e temporários).

## Para uso REAL (recomendado)

No `render.yaml` há um bloco comentado: mude para **plan: starter** (ou acima),
**adicione um disco** montado em `/app/data` (guarda usuários, uploads e renders
de forma persistente) e suba o `WHISPER_MODEL` para `base`/`small` (legendas
melhores). Aí o app fica estável e não dorme.
