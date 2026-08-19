# RiseFlow — Relatório de Prontidão

> Data: 18/08/2026 · Branch `master` até commit `2f5e68a`
> Produção: `https://riseflow-app-aepu.onrender.com` (respondendo `HTTP 200` em `/health`)
> Supabase: `upcaknwpvnofirszehth`
> Substitui as auditorias `VERIFICACAO.md` / `BUGS.md` (de 02/07, era Baileys — obsoletas).

Legenda: ✅ pronto · 🟠 parcial/ação pendente · 🔴 bloqueia lançamento · 📋 decisão de produto

---

## Resumo executivo

O núcleo técnico (multi-tenant, segurança, integrações, cifragem) está **pronto e no ar**.
O que falta para o lançamento público é **operacional e depende do usuário**: token
permanente do WhatsApp, dados legais reais, e a submissão do App Review da Meta.

| Área | Status |
|---|---|
| Segurança & multi-tenant | ✅ |
| Cifragem de segredos em repouso | ✅ (ativa em produção) |
| Integração WhatsApp Cloud | 🔴 (desconectado — sem número ativo) |
| Integrações Meta / Telegram / Email | 🔴 (todos desconectados / nunca conectados) |
| Páginas legais | 🟠 (no ar, mas com dados placeholder) |
| App Review Meta | 🔴 (não submetido) |
| Infra de produção | 📋 (free tier do Render) |

---

## 1. Segurança & Multi-tenant — ✅

Fechado e verificado nesta sessão (6 commits, todos deployados):

| Commit | Entrega |
|---|---|
| `95b79a2` | IA proxiada pelo servidor (`POST /api/ai/chat`) — chave LLM nunca chega ao browser; vazamento cross-tenant em `contacts` fechado |
| `5069b4c` | `adminOnly` morto removido + `CLAUDE.md` corrigido |
| `2e52e0a` | tokens de canal cifrados em repouso (AES-256-GCM) |
| `b63b813` | motor de funis duplicado no frontend removido (869 linhas mortas) |
| `2f5e68a` | fallback que enviaria pelo número de outro tenant removido |

Fundamentos confirmados:
- Backend usa `service_role` (ignora RLS) → todo acesso é filtrado por `user_id` (`req.user.sub`, derivado do JWT, nunca do body).
- RLS aplicado e protege as leituras do frontend (anon key).
- `JWT_SECRET` e `WEBHOOK_TOKEN` exigidos como fatais em produção.
- HMAC da Meta validado sobre o corpo cru (antes do gzip).

**Dívida residual (não bloqueia):** SMTP `pass` e chaves LLM (`settings`) ainda em texto
puro — são escritos pelo frontend (anon client); cifrar exigiria rotear a escrita pela API.

## 2. Cifragem de segredos em repouso — ✅

- `server/secretCrypto.js`: AES-256-GCM, chave `TOKEN_ENC_KEY`, prefixo `enc:v1:`.
- Cobre: WhatsApp Cloud `token`, Meta `page_token`, Telegram `bot_token`.
- Retrocompatível: valores legados sem prefixo passam direto; sem a chave vira no-op.
- **Ativa em produção:** `TOKEN_ENC_KEY` já setada no Render.
- **Nada a recifrar hoje:** verificação da tabela `integrations` em 18/08 mostrou todos
  os canais desconectados com `config` vazio — não há token salvo em texto puro. A
  cifragem passa a valer na próxima conexão de cada canal.

## 3. WhatsApp Cloud — 🔴 (desconectado)

- **Verificado em 18/08:** `whatsapp_cloud` está `disconnected` (config vazio). O último
  connect foi hoje 14:18 e depois houve disconnect explícito — **não há número ativo agora.**
- Status de entrega por webhook (`sent`/`delivered`/`read`/`failed`) está implementado,
  mas inerte sem canal conectado.
- Para voltar a funcionar: conectar um número via **token permanente** (System User no
  Business Manager, expiração "Nunca", permissões `whatsapp_business_messaging` +
  `whatsapp_business_management`) OU **Embedded Signup**. Ao conectar, o token já nasce
  **cifrado** (§2).
- **Bloqueado em:** aguardando o usuário concluir a geração do token (última tentativa travou).

## 4. Integrações Meta / Telegram / Email — 🔴

- Código pronto (Meta FB/IG: seguidores + sync do Direct; Telegram via grammY; Email SMTP).
- **Verificado em 18/08 (tabela `integrations`):**
  - `facebook` / `instagram`: `disconnected` (últ. conexão 13/08, config vazio).
  - `telegram` / `email`: **sem linha na tabela — nunca conectados.**
- Nada conectado em produção hoje. Reconectar cada canal que for usar (o token/segredo
  nasce cifrado na conexão).

## 5. Páginas legais — 🟠

- `/privacidade`, `/privacy`, `/exclusao-de-dados`, `/data-deletion` servidas pelo Express
  (`server/routes/legal.js`), com URL estável.
- 🔴 **Ainda com placeholders `[PREENCHER: ...]`** — a Meta reprova política incompleta.
- Falta o usuário informar: razão social + CNPJ (ou CPF), e-mail de contato, cidade/UF.
  Podem entrar como env vars no Render (`LEGAL_ORG_NAME`, `LEGAL_CONTACT_EMAIL`,
  `LEGAL_JURISDICTION`) e/ou hardcode em `legal.js`.

## 6. App Review da Meta — 🔴

- Depende de: §3 (token/Embedded Signup) + §5 (dados legais reais).
- Escopo: permissões de IG/FB + WhatsApp Embedded Signup.
- **Não submetido.**

## 7. Infra de produção — 📋

- App no ar no **free tier** do Render (`riseflow-app-aepu.onrender.com`).
- Free tier hiberna após inatividade → primeira requisição fria é lenta.
- Decisão de custo do usuário: subir de plano antes de tráfego real / App Review.

---

## Ações manuais concluídas nesta sessão

- ✅ `TOKEN_ENC_KEY` setada no Render (cifragem ativa).
- ✅ `supabase/contacts_unique_constraint.sql` rodado (7 contatos, 0 órfãos; import consertado).

## Próximas ações (ordem sugerida)

1. **Dados legais** (§5) — 100% acionável: usuário passa 4 dados, páginas ficam prontas.
2. **Token permanente do WhatsApp** (§3) — destravar a geração (ou Embedded Signup) e
   **conectar o número** (hoje não há nenhum canal ativo em produção).
3. **Conectar os demais canais que for usar** (§4) — Meta/Telegram/Email estão todos fora;
   cada token/segredo nasce cifrado na conexão.
4. **Submeter App Review** (§6) — quando 1 e 2 estiverem prontos.
5. **Plano pago do Render** (§7) — antes de tráfego real.
