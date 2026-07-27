# RiseFlow — Auditoria de Bugs

> Gerada em 02/07/2026. Escopo: Dockerfile/deploy Render, CORS/env de produção,
> persistência da sessão Baileys, variáveis VITE_, tratamento de erros
> (webhooks/motor de funis) e segurança.
>
> Severidades: 🔴 CRÍTICO (quebra produção ou expõe dados) · 🟠 ALTO ·
> 🟡 MÉDIO · 🔵 BAIXO/informativo.
>
> ✅ = corrigido nesta auditoria.

---

## 1. Dockerfile / deploy no Render

### ✅ 🔴 B01 — "Cannot GET /": não existe Dockerfile na raiz e o Express não serve o build do Vite
- **Arquivo:** raiz do repo (Dockerfile ausente) + `server/index.js`
- **Causa:** o único Dockerfile do projeto é o do `whatsapp-server/` (que está até
  fora deste repo, via `.gitignore:22`). O deploy no Render sobe só o proxy
  Express, que não tem rota `GET /` nem `express.static` — logo `Cannot GET /`.
  O build do Vite (`dist/`) nunca chega ao container.
- **Correção (aplicada):**
  1. Novo `Dockerfile` multi-stage na raiz: estágio 1 builda o frontend
     (`npm run build`, com `VITE_*` via `ARG`), estágio 2 roda o `server/`
     copiando o `dist/` junto.
  2. `server/index.js` agora serve `../dist` como estático com fallback SPA
     (`GET` não-`/api` → `index.html`).
  3. `.dockerignore` novo — impede que `.env` locais vazem para a imagem e
     contaminem o build do Vite.

### 🟡 B02 — `whatsapp-server/Dockerfile` com `EXPOSE 3333` desatualizado
- **Arquivo:** `whatsapp-server/Dockerfile:6`
- **Problema:** convenção atual do projeto é Baileys na **3334** (proxy usa 3333).
  `EXPOSE` é só documentação, mas induz a erro de configuração no deploy.
- **Correção:** `EXPOSE 3334` (e ver B12 sobre o default de `PORT`).

---

## 2. CORS e variáveis de ambiente para produção

### 🟠 B03 — `CORS_ORIGIN` só permite localhost
- **Arquivo:** `server/.env:17` (`CORS_ORIGIN=http://localhost:3001,http://localhost:3000`)
- **Problema:** em produção, requisições do domínio público (e o handshake do
  Socket.io, `server/index.js:33-35`) são rejeitadas. Com o B01 corrigido o
  frontend passa a ser same-origin (CORS deixa de bloquear o app), mas qualquer
  domínio extra (app mobile Capacitor, admin separado) precisa entrar na lista.
- **Correção:** no Render, definir `CORS_ORIGIN=https://<app>.onrender.com`
  (mais domínios extras separados por vírgula).

### ✅ 🔴 B04 — `VITE_API_URL` com fallback `http://localhost:3001` quebra produção
- **Arquivo:** `src/services/api.js:9`
- **Problema:** variáveis `VITE_*` são **injetadas no build** (não em runtime).
  Se o Render buildar sem `VITE_API_URL`, o frontend em produção chama a API na
  máquina do visitante (`localhost:3001`) → `ERR_CONNECTION_REFUSED` em tudo.
- **Correção (aplicada):** fallback agora é `''` (same-origin, `/api`) — casa com
  o Dockerfile do B01, onde frontend e API saem do mesmo processo. Em dev nada
  muda (o `.env` define o valor e o Vite proxia `/api`).

### ✅ 🟠 B05 — Socket.io com fallback `http://localhost:3333` em produção
- **Arquivo:** `src/services/socket.js:9`
- **Problema:** mesmo padrão do B04 — sem `VITE_SOCKET_URL` no build, o socket de
  produção tenta conectar no localhost do visitante; o chat perde o tempo real.
- **Correção (aplicada):** em produção o fallback vira same-origin
  (`io()` sem URL); em dev continua `http://localhost:3333`.

### 🟠 B06 — Supabase com placeholder silencioso quando `VITE_*` faltam no build
- **Arquivo:** `src/lib/supabase.js:10-13`
- **Problema:** sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` no momento do
  build, o cliente conecta em `https://placeholder.supabase.co` — o app carrega
  e falha silenciosamente (login/telas vazias, só um `console.error`).
- **Correção:** definir as duas envs no build do Render (ou `--build-arg` no
  Docker, já previsto no novo Dockerfile). Sugestão adicional: renderizar uma
  tela de erro visível em vez do placeholder.

---

## 3. Persistência da sessão Baileys

### 🔴 B07 — Sessão em `./auth_session` (path relativo) + filesystem efêmero
- **Arquivo:** `whatsapp-server/whatsapp.js:17` (`useMultiFileAuthState('./auth_session')`),
  também `:71` e `:233` (`fs.rmSync('./auth_session')`)
- **Problema (duplo):**
  1. Path **relativo ao cwd** — iniciar o processo de outro diretório cria/lê
     sessão em lugar errado (o pareamento "some").
  2. Em Render/Railway o filesystem do container é **efêmero**: todo deploy ou
     restart apaga `auth_session` → QR code de novo a cada deploy.
- **Correção:** path absoluto configurável
  (`const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'auth_session')`)
  e, no Render, montar um **Persistent Disk** apontando `AUTH_DIR` para ele
  (ex.: `/data/auth_session`). No Railway, um Volume.

### 🟡 B08 — Reconexão sem backoff gera QR infinito
- **Arquivo:** `whatsapp-server/whatsapp.js:74-76`
- **Problema:** desconexão ≠ logout → `setTimeout(startWhatsApp, 3000)` fixo.
  Sem sessão pareada, o ciclo QR-expira-reconecta roda para sempre a cada ~60s
  (observado ao vivo nesta auditoria), enchendo log e CPU.
- **Correção:** backoff exponencial (3s → 60s) e/ou parar de reagendar após N
  tentativas sem pareamento, aguardando `POST /reconnect` manual.

---

## 4. Variáveis VITE_ — build vs runtime

**Resposta direta à pergunta:** são de **build**. `import.meta.env.VITE_*` é
substituído por texto literal durante o `vite build`; definir env no serviço em
runtime **não tem efeito nenhum** sobre um bundle já buildado.

- Consequências mapeadas: B04 (API), B05 (socket), B06 (Supabase).
- No novo `Dockerfile` da raiz elas entram como `ARG`/`ENV` do estágio de build:
  `docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=...`
  No Render (runtime Docker), as env vars do serviço são expostas ao build —
  basta cadastrá-las no painel.

---

## 5. Tratamento de erros — webhooks e motor de funis

### 🟡 B09 — Exceção em ação de nó deixa a execução travada em `running` para sempre
- **Arquivo:** `server/flowEngine.js:261-318` (`runFlow`), `:321-329` (`resumeWaiting`)
- **Problema:** as ações (`sendText` → Baileys fora do ar, `callWebhook` → URL do
  usuário retornando 500, etc.) não têm try/catch individual. A exceção sobe até
  o catch de `handleIncomingMessage` (`:358`), que só loga — a linha de
  `flow_executions` fica em `status='running'` eternamente (não existe estado
  `failed`), poluindo métricas e impedindo diagnóstico.
- **Correção:** envolver o `while` de `runFlow` em try/catch que marque
  `status='failed'` + coluna `error`; para nós não-críticos (webhook, email),
  capturar por nó e seguir o fluxo (email já faz isso em `sendEmailAction:226-232`).

### 🟡 B10 — `actionWebhook` sem timeout tratado derruba o funil inteiro
- **Arquivo:** `server/flowEngine.js:235-249`
- **Problema:** caso particular do B09 — o axios tem `timeout: 10_000`, mas o
  throw (timeout/4xx/5xx) não é capturado; um webhook de terceiro instável
  aborta a conversa do lead no meio.
- **Correção:** try/catch no `callWebhook` retornando `undefined` (e logando),
  como já é feito no envio de email.

### 🟠 B11 — `POST /api/webhook` público por padrão (WEBHOOK_TOKEN vazio)
- **Arquivo:** `server/routes/webhook.js:49` + `server/.env:20` (`WEBHOOK_TOKEN=`)
- **Problema:** sem token, qualquer um que alcance a URL injeta eventos falsos:
  dispara funis, aciona a IA (gasta créditos OpenAI/Anthropic do usuário) e
  planta mensagens forjadas no chat via Socket.io. Em localhost é aceitável; em
  produção é porta aberta.
- **Correção:** tornar `WEBHOOK_TOKEN` obrigatório quando `NODE_ENV=production`
  (recusar boot sem ele) e configurar o mesmo token no `FLOW_WEBHOOK_URL` do
  whatsapp-server (`?token=...`).

### 🔵 B12 — dotenv depende do diretório de execução; portas colidem no erro
- **Arquivos:** `server/index.js:3`, `whatsapp-server/index.js:1` +
  default `PORT = 3333` em `whatsapp-server/index.js:159`
- **Problema:** `dotenv` lê `.env` do **cwd**. Rodando `node server\index.js` da
  raiz: o proxy morre (sem `JWT_SECRET`) e o Baileys sobe **na 3333** (default
  errado), ocupando a porta do proxy — reproduzido ao vivo nesta auditoria.
- **Correção:** `require('dotenv').config({ path: path.join(__dirname, '.env') })`
  nos dois servidores e default do Baileys para `3334`.

---

## 6. Segurança

### 🔴 B13 — `JWT_SECRET` é o placeholder do exemplo
- **Arquivo:** `server/.env:11` (`troque-por-uma-string-aleatoria-forte-em-producao`)
- **Problema:** qualquer pessoa que leia o repo/exemplo forja tokens válidos
  para TODAS as rotas protegidas do proxy.
- **Correção:** gerar segredo real (`openssl rand -base64 48` ou
  `[Convert]::ToBase64String((1..48 | % { Get-Random -Max 256 }))`) antes de
  qualquer deploy. Nunca reutilizar o do exemplo.

### 🔴 B14 — Autenticação decorativa: login emite JWT para qualquer email, sem senha
- **Arquivo:** `server/index.js:56-63` (`/api/auth/login`) — o próprio comentário
  admite: "Em produção, troque por validação real".
- **Problema:** as rotas "protegidas" são efetivamente públicas — basta pedir um
  token. Combinado com `server/routes/email.js:32-35` (aceita `userId`
  arbitrário no body), permite **enviar emails pelo SMTP de qualquer usuário**
  cadastrado; idem para enviar WhatsApp pela instância conectada.
- **Correção:** validar o access token do Supabase Auth no login (ou substituir
  o JWT próprio pelo do Supabase via `supabase.auth.getUser(token)` no
  middleware) e derivar `userId` do token — nunca do body.

### 🟡 B15 — Credencial default hardcoded `riseflow-server-2024`
- **Arquivos:** `whatsapp-server/index.js:10` (fallback do `API_KEY`),
  `server/.env:5`, `docker-compose.yml:12`
- **Problema:** chave previsível publicada no código; quem achar a porta 3334
  exposta envia mensagens pelo WhatsApp conectado.
- **Correção:** remover o fallback (exigir env) e gerar chave aleatória por
  instalação.

### 🔵 B16 — API key aceita via query string e registrada no access log
- **Arquivo:** `whatsapp-server/index.js:77` (`req.query.apikey`) + `:57` (log de URL)
- **Problema:** `?apikey=...` fica gravada em logs/históricos de proxy.
- **Correção:** aceitar apenas via header.

### 🔵 B17 — Superfície legada da Evolution ainda ativa
- **Arquivos:** `vercel.json:3` (rewrite `/evolution/*` → Railway),
  `vite.config.js:52-57`
- **Problema:** proxy morto para serviço desativado; se a URL do Railway for
  reciclada por terceiros, vira open redirect de dados.
- **Correção:** remover os dois blocos.

### 🔵 B18 — JWT do proxy em `localStorage`
- **Arquivo:** `src/services/api.js:34`
- **Problema:** qualquer XSS rouba o token (validade 7d). Risco padrão, mas
  registrado — mitigável com cookie httpOnly quando a auth real (B14) entrar.

### 🔵 B19 — Headers de segurança só existem no dev server
- **Arquivo:** `vite.config.js:39-44`
- **Problema:** `X-Frame-Options` etc. são do dev server do Vite; a produção
  (Express servindo `dist/`) não os envia.
- **Correção:** adicionar os mesmos headers (ou `helmet`) no `server/index.js`.

### ✔️ Verificações que passaram
- `.env`/`auth_session` corretamente fora do git (`.gitignore:11-13,21-24`).
- Service role key usada só no servidor (`server/supabaseClient.js`), nunca no
  frontend.
- Webhook responde 200 mesmo em erro de processamento (evita loop de reentrega)
  e o motor de funis roda fire-and-forget sem bloquear a resposta
  (`server/routes/webhook.js:72-88`).
- Rate limit, bloqueio sem User-Agent e allowlist de método nos `/send/*` do
  whatsapp-server (`whatsapp-server/index.js:17-73`).
- Frontend nunca fala com Baileys/SMTP direto — sempre via proxy.

---

## Resumo

| # | Severidade | Área | Status |
|---|---|---|---|
| B01 | 🔴 | Dockerfile não serve frontend ("Cannot GET /") | ✅ corrigido |
| B04 | 🔴 | `VITE_API_URL` fallback localhost em produção | ✅ corrigido |
| B05 | 🟠 | Socket.io fallback localhost em produção | ✅ corrigido |
| B07 | 🔴 | Sessão Baileys efêmera/relativa | pendente (precisa disco no Render) |
| B13 | 🔴 | `JWT_SECRET` placeholder | pendente (ação sua: gerar segredo) |
| B14 | 🔴 | Login sem senha / `userId` do body | pendente (refatoração de auth) |
| B03, B06, B11 | 🟠 | CORS/env produção, Supabase placeholder, webhook aberto | pendente (config de deploy) |
| B02, B08–B10, B15 | 🟡 | diversos | pendente |
| B12, B16–B19 | 🔵 | diversos | pendente |
