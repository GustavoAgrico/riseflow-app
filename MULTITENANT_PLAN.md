# RiseFlow · Plano Multi-Tenant

Objetivo: cada usuário tem **seu próprio número de WhatsApp** e **dados totalmente
isolados** dos demais. Implementação em 4 etapas técnicas + este plano (etapa 5).

> Estado atual: o backend é **single-tenant**. O `whatsapp-server` mantém **uma
> única** sessão Baileys global (variáveis de módulo `sock` / `connectionState`
> em `whatsapp.js`) e o webhook grava tudo sob um `DEFAULT_USER_ID`. O isolamento
> de dados no Supabase é **parcial**: a maioria das tabelas já tem RLS, mas nem
> todas — ver Etapa 1.

---

## Visão geral da arquitetura

### Antes (single-tenant)
```
1 número WhatsApp  →  whatsapp-server (1 sessão)  →  webhook (DEFAULT_USER_ID)  →  Supabase
```

### Depois (multi-tenant)
```
usuário A  →  QR A  ┐
usuário B  →  QR B  ┼→ whatsapp-server (N sessões, Map<userId,sessão>)
usuário C  →  QR C  ┘        │
                             └→ webhook({ userId da sessão })  →  Supabase (RLS por user_id)
```

Três pilares mudam:
1. **Banco** — RLS garante que cada query só enxerga as linhas do `auth.uid()`.
2. **Servidor WhatsApp** — uma sessão Baileys isolada por `userId`, cada uma com
   sua pasta de credenciais `./sessions/{userId}/`.
3. **Atribuição de origem** — toda mensagem recebida carrega o `userId` da sessão
   que a recebeu, substituindo o `DEFAULT_USER_ID` no webhook/flows.

---

## ETAPA 1 — Isolamento de dados (RLS) ✅ pronta para rodar

SQL completo em [`supabase/multitenant_rls.sql`](supabase/multitenant_rls.sql).
**É a etapa mais segura e a primeira a aplicar.** Rode no Dashboard → SQL Editor.

### Tabelas e como cada uma isola (19 no total)

| Tabela | Isolamento | RLS já existia? |
|---|---|---|
| `profiles` | `user_id` direto | parcial |
| `conversations` | `user_id` direto | ✅ |
| `messages` | `user_id` direto | ✅ |
| `clients` | `user_id` direto | a confirmar |
| `contacts` | `user_id` direto | ✅ |
| `flows` | `user_id` direto | ✅ |
| `integrations` | `user_id` direto | a confirmar |
| `campaigns` | `user_id` direto | a confirmar |
| `settings` | `user_id` direto | ✅ |
| `usage` | `user_id` direto | ✅ |
| `activity_logs` | `user_id` direto | ✅ |
| `notes` | `user_id` direto | ✅ |
| `niche_config` | `user_id` direto | a confirmar |
| `lead_scores` | `user_id` direto | a confirmar |
| `attendant_config` | `user_id` direto | a confirmar |
| `knowledge_base` | `user_id` direto | a confirmar |
| `user_preferences` | `user_id` direto | a confirmar |
| `flow_executions` | via `flow_id → flows.user_id` | ✅ |
| `campaign_messages` | via `campaign_id → campaigns.user_id` | via pai |

Política padrão: `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.

---

## ETAPA 2 — Sessões WhatsApp por usuário

Refatorar o `whatsapp-server` de **1 sessão global** para **N sessões isoladas**.

### Arquivos afetados
- **NOVO** `whatsapp-server/sessionManager.js` — `Map<userId, { sock, qr, qrImage, state, saveCreds }>`.
  Encapsula tudo que hoje são variáveis de módulo em `whatsapp.js`.
- **Refatorar** `whatsapp-server/whatsapp.js` — deixar de ter `sock`/`connectionState`
  globais; cada função passa a receber `userId` e operar sobre a sessão do Map.
  Pasta de credenciais vira `./sessions/{userId}/` (hoje é `./auth_session` único).
- **Refatorar** `whatsapp-server/index.js` — endpoints passam a receber `userId`
  (ver Etapa 4). Adicionar autenticação que valide que o `userId` pertence ao
  chamador (JWT do Supabase) — hoje só há uma `API_KEY` global.

### Esboço do `sessionManager.js`
```js
const sessions = new Map() // userId -> { sock, qr, qrImage, state, saveCreds }

async function createSession(userId) { /* useMultiFileAuthState('./sessions/'+userId) */ }
function   getSession(userId)        { return sessions.get(userId) }
async function sendFromSession(userId, phone, text) {
  const s = sessions.get(userId)
  if (!s || s.state !== 'connected') throw new Error('WhatsApp não conectado para este usuário')
  return s.sock.sendMessage(formatPhone(phone), { text })
}
async function logoutSession(userId) { /* logout + rm ./sessions/{userId} + sessions.delete */ }
```

### Considerações
- Toda a lógica já existente de `whatsapp.js` (LID→número, 9º dígito brasileiro,
  `resolveJid`, reconexão automática) precisa ser **preservada por sessão**.
- Reconexão: ao subir o servidor, recriar sessões para cada pasta em `./sessions/*`.
- Limite de recursos: cada sessão Baileys é uma conexão WebSocket viva — N usuários
  = N conexões. Definir teto e/ou encerrar sessões ociosas.

---

## ETAPA 3 — Identificar o usuário no webhook

Hoje `whatsapp.js → sendWebhook()` não envia `userId`; o webhook assume `DEFAULT_USER_ID`.

### Mudanças
- `sendWebhook(payload)` passa a incluir `userId` (o dono da sessão que recebeu o evento).
- **Edge Function do webhook** (a deployada é `Documents/riseflow/supabase/functions/webhook`)
  e o webhook do proxy (`server/routes/webhook.js`) passam a usar o `userId` recebido
  em vez do `DEFAULT_USER_ID` ao gravar `conversations`/`messages` e ao disparar flows.
- O `flowEngine` (server) já roda com a **service role key** (ignora RLS), então
  consegue escrever para qualquer `userId` — o que muda é a **origem** do `userId`.

---

## ETAPA 4 — Frontend: conectar WhatsApp por usuário

### Arquivos afetados
- `src/components/Integrations/WhatsAppModal.jsx` e `WhatsAppManagePanel.jsx`
- `src/services/evolutionApi.js` / camada que chama o whatsapp-server

### Mudanças
- Ao conectar: `POST /session/start` com o `userId` do usuário logado.
- Exibir o QR **daquele** usuário: `GET /session/{userId}/qr`.
- Status individual: `GET /session/{userId}/status`.
- Cada cliente escaneia o **próprio** QR e conecta o **próprio** número.

### Novos endpoints (Etapa 2/4)
```
POST /session/start            { userId }
GET  /session/:userId/qr
GET  /session/:userId/status
POST /session/:userId/send/text { number, text }
POST /session/:userId/logout
```

---

## Riscos e considerações

| Risco | Mitigação |
|---|---|
| **Linhas órfãs** (`user_id` NULL) somem ao ligar RLS | Seção 1d do SQL lista órfãs; Seção 4 faz backfill antes de aplicar |
| Frontend para de ler dados após RLS | Confirmar que o frontend usa anon key + JWT (já usa) e que toda linha tem `user_id` |
| Servidor precisa escrever p/ qualquer usuário | Usa **service role key** (ignora RLS) — manter essa key só no backend |
| `API_KEY` global no whatsapp-server | Trocar por validação do JWT do Supabase para amarrar `userId` ao chamador |
| N conexões Baileys (memória/limite) | Teto de sessões, encerrar ociosas, monitorar no Railway |
| Sessões perdidas em restart | Persistir `./sessions/{userId}/` em volume do Railway e recriar no boot |
| Migração de dados existentes do número único | Decidir a qual usuário o histórico atual pertence antes do split |

---

## Ordem de implementação recomendada

1. **Etapa 1 (RLS)** — segura e independente. Rodar diagnóstico → backfill → aplicar. ← começar aqui
2. **Etapa 2** — `sessionManager.js` + refactor do whatsapp-server (sem mexer no frontend ainda).
3. **Etapa 3** — propagar `userId` no webhook/flows.
4. **Etapa 4** — frontend conectar por usuário.
5. Testes ponta-a-ponta com 2+ contas em paralelo.
