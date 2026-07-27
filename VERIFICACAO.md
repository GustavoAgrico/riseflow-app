# RiseFlow — Verificação Funcional (Produção)

> Data: 02/07/2026. Alvo: `https://riseflow.onrender.com`.
> Método: sondagem HTTP real da produção + leitura do código do frontend/SQL.
> Ordenado por criticidade.

---

## 🔴 DESCOBERTA PRINCIPAL — o que está no Render NÃO é o app

**`https://riseflow.onrender.com` está rodando o `whatsapp-server/` (Baileys), não o proxy `server/` nem o frontend.**

Evidências (testadas ao vivo):
| Requisição | Resultado | Conclusão |
|---|---|---|
| `GET /status` + `apikey: riseflow-server-2024` | `200 {"status":"disconnected"...}` | shape do `whatsapp-server/index.js:83` |
| `GET /health` | `404 Cannot GET /health` | `/health` só existe no proxy `server/` |
| `POST /api/auth/login` | `404` | rota do proxy — ausente |
| `GET /api/webhook/meta` | `404` | proxy — ausente |
| `GET /dashboard` | `404` | frontend não está aqui |
| `GET /qr` + apikey | `200 {"status":"waiting_qr", qr:...}` | Baileys aguardando pareamento |

**Consequências:**
- **Não há frontend em produção** — o app React (Dashboard, Chat, etc.) não está publicado nesta URL.
- **Não há proxy/API** — todas as rotas `/api/*` (chat, mensagens, email, telegram, meta, funis) estão fora do ar em produção.
- O **Dockerfile raiz** (multi-stage frontend+proxy, criado no BUGS.md B01) **não é o que o Render está usando** — o serviço aponta para o `whatsapp-server/`.

**Correção necessária (mais crítica de todas):** decidir a topologia de deploy. Ou:
1. **Um serviço** com o Dockerfile raiz (frontend + proxy juntos) + **outro serviço** para o `whatsapp-server/` (com Persistent Disk — B07); ou
2. Publicar o frontend na Vercel (já previsto no `DEPLOY.md`) e o proxy + Baileys no Render como 2 serviços.
Hoje só existe 1 dos 3 componentes no ar, e desconectado.

---

## 🔴 CRÍTICOS

### C1 — WhatsApp em produção desconectado + sessão efêmera
- **Status:** QUEBRADO. `GET /status` = `disconnected`; `GET /qr` = `waiting_qr` (nunca pareado ou sessão perdida).
- **Causa:** filesystem do Render é efêmero — `useMultiFileAuthState('./auth_session')` (`whatsapp-server/whatsapp.js:17`) é apagado a cada deploy/restart (e o free tier hiberna). Toda vez volta pedindo QR.
- **Correção:** montar Persistent Disk no Render e usar `AUTH_DIR` absoluto apontando pra ele (BUGS.md B07). Sem isso, nenhum envio de WhatsApp funciona de forma estável em produção.

### C2 — apikey padrão hardcoded aceita em produção
- **Status:** QUEBRADO (segurança). `GET /status` com `riseflow-server-2024` **funciona na produção real** — a chave está no código (`whatsapp-server/index.js:10`) e no `.gitignore`/README.
- **Impacto:** qualquer pessoa gera QR (sequestra o pareamento), envia mensagens pela instância e faz logout. Testável agora mesmo com um curl.
- **Correção:** exigir `API_KEY` do ambiente (remover o fallback) e gerar chave aleatória. BUGS.md B15.

### C3 — Reconexão automática do Baileys: parcial, sem persistência
- **Status:** PARCIALMENTE OK. `whatsapp-server/whatsapp.js:63-77`: em `connection:'close'` com motivo ≠ `loggedOut` → `setTimeout(startWhatsApp, 3000)` reconecta usando a sessão salva. Isso funciona para quedas transitórias **enquanto o processo vive**.
- **Falhas:**
  1. `loggedOut` → apaga `auth_session` e **não** reconecta (correto), mas exige QR manual.
  2. **Sem backoff** (BUGS.md B08): sem sessão pareada, entra em loop QR-expira-reconecta a cada ~60s (reproduzido nesta auditoria).
  3. **Restart do container** (deploy/hibernação) perde a sessão inteira (C1) — a "reconexão" não ajuda porque as credenciais sumiram.
- **Correção:** C1 (disco persistente) + backoff exponencial. A lógica de reconexão em si está correta; o que falta é a sessão sobreviver.

### C4 — Autenticação do proxy é decorativa
- **Status:** QUEBRADO (segurança) — quando o proxy for publicado. `POST /api/auth/login` emite JWT para qualquer email sem senha (`server/index.js:56-63`); `userId` vem do body nas rotas de email/telegram/meta. BUGS.md B14.
- **Correção:** validar o token do Supabase Auth e derivar `userId` do token.

---

## 🟠 ALTOS

### A1 — Gráfico do Dashboard é 100% mockado
- **Status:** UI SEM LÓGICA. O gráfico de mensagens/conversões usa `CHART_DATA` hardcoded (`src/constants/config.js:54-60`, valores fixos Seg–Dom). Os **cards de números** (flows/clients/conversão) são reais via `useDashboardData` (query com tratamento de erro — OK), mas a série temporal é fantasia.
- **Correção:** derivar de `messages` agrupado por dia (a tela Analytics já faz query real em `messages`, dá pra reusar).

### A2 — Cards de canal do Dashboard sugerem Instagram/Facebook ativos
- **Status:** enganoso. Ícones de Instagram/Facebook no Dashboard implicam canais ligados; em produção nada está conectado.
- **Correção:** refletir o estado real de `integrations`.

### A3 — KPI "Mensagens/mês" em Integrações é inventado
- **Status:** UI SEM LÓGICA. `connectedCount * 1000` (`src/pages/Integrations.jsx`). Já registrado na verificação de integrações.

---

## 🟡 MÉDIOS — telas: backend real vs. UI

Levantamento por tela (código do frontend):

| Tela | Backend | Status | Observação |
|---|---|---|---|
| Dashboard | `useDashboardData` (flows/clients) | OK parcial | números reais; **gráfico mock** (A1) |
| Chat | `conversations`/`messages` + Socket.io + `/api/messages/send` | OK | depende do proxy no ar (fora em prod) |
| Atendimento IA | `attendant_config`/`knowledge_base`/`settings` + `aiAttendant.js` | OK | multi-provider (Gemini→Groq→OpenAI→Claude) |
| Funis (builder novo) | `flows` (nodes/edges) + `flowEngine.js` | OK | motor roda no proxy |
| Funis (builder antigo) | `flows.flow_data` | NÃO EXECUTA | o motor só roda o builder novo — ver [[riseflow-flows-builder]] |
| CRM / Clients | `clients` | OK | |
| Analytics | `messages`/`conversations`/`clients`/`flows` | OK | queries reais |
| Campanhas | `campaigns`/`campaign_messages` + `campaignService` | OK | dispara no navegador; agendada não auto-dispara |
| Agendamentos | `schedules` + dispatcher client-side | OK parcial | só dispara com a aba aberta |
| Equipes | `team_members`/`team_queues` | OK | |
| Templates | `templates` | OK | consumido no Chat |
| Automação | `flows` (mesma tabela dos funis) | OK | toggle/delete reais |
| Planos | `StripeService` | VERIFICAR | depende de credenciais Stripe configuradas |
| Logs | `activity_logs` | OK | |
| Funnel | query Supabase (3 refs) | OK | |

**Nenhuma tela é pura fachada** hoje (todas as antigas mock foram corrigidas em 2026-06/07). As ressalvas são pontuais (gráfico do Dashboard, builder antigo, KPIs cosméticos).

### M1 — Rotas `/api/chats`, `/api/contacts`, `/api/messages` (GET) retornam vazio por design
- **Status:** OK (intencional). `chats.js`, `contacts.js`, `messages.js` GET devolvem `[]` — o Baileys não tem store consultável; histórico vem via webhook→Supabase. Não é bug, mas confunde numa auditoria de rota.

---

## 🔵 Tratamento de erro nas queries Supabase

Amostragem:
- **Com tratamento:** `useDashboardData` (try/catch + `setError`), `Automation` (`if (!error)`), `Analytics`, `campaignService`.
- **Inconsistente:** vários `const { data } = await supabase...` ignoram `error` silenciosamente (padrão comum no projeto) — em falha, a tela mostra vazio sem avisar. Não quebra, mas esconde problemas.
- **Recomendação:** padronizar um wrapper que logue/toaste erros de query.

## 🔵 RLS multi-tenant

- **Cobertura boa no schema:** `supabase/schema.sql` tem `enable row level security` em **23 tabelas** (profiles, settings, clients, conversations, messages, notes, flows, flow_executions, contacts, integrations, attendant_config, knowledge_base, campaigns, campaign_messages, schedules, team_members, team_queues, activity_logs, etc.), com policies `*_own` por `auth.uid() = user_id`.
- **Ressalva 1:** o schema no repo é a *intenção* — o que vale é o que foi realmente rodado no dashboard (SQL manual — ver [[riseflow-supabase-migrations]]). Precisa auditar no banco real: `select tablename, rowsecurity from pg_tables where schemaname='public'`.
- **Ressalva 2 (importante):** o **proxy usa a service role key**, que **ignora RLS** por design (`server/supabaseClient.js`). Toda a segurança multi-tenant do backend depende do `userId` correto — que hoje vem do body sem validação (C4). Ou seja, o RLS protege o acesso direto do frontend (anon key), mas **não** protege as rotas do proxy.

---

## Resumo executivo

| Prioridade | Item | Status |
|---|---|---|
| 🔴 | Produção roda só o Baileys — sem frontend nem proxy | QUEBRADO (topologia) |
| 🔴 | C1 WhatsApp desconectado + sessão efêmera | QUEBRADO |
| 🔴 | C2 apikey padrão aceita em produção | QUEBRADO (segurança) |
| 🔴 | C3 reconexão sem persistência/backoff | PARCIAL |
| 🔴 | C4 auth do proxy sem senha | QUEBRADO (segurança) |
| 🟠 | A1 gráfico Dashboard mock | UI SEM LÓGICA |
| 🟠 | A2/A3 canais e KPI cosméticos | UI SEM LÓGICA |
| 🟡 | Builder antigo não executa | POR DESIGN |
| 🟡 | Planos/Stripe | VERIFICAR credenciais |
| 🔵 | Erro de query inconsistente / RLS via service key | RISCO |

**Ação nº1:** corrigir a topologia de deploy — publicar frontend + proxy (Dockerfile raiz) e o `whatsapp-server` como serviço separado com disco persistente. Sem isso, o produto não está no ar; só um pedaço desconectado dele está.
