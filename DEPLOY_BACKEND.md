# Deploy do Backend de Mensagens — RiseFlow

Checklist para ligar **recebimento de mensagens do WhatsApp** + **sincronização em tempo real** no chat.
Faça na ordem. Itens marcados com 🖥️ rodam no seu terminal; 🌐 no navegador.

---

## Pré-requisitos
- Acesso ao projeto no [Supabase Dashboard](https://supabase.com/dashboard)
- Supabase CLI já instalado como devDependency → use **`npx supabase ...`** (não precisa instalar global)
- Instância da Evolution API conectada (QR code lido) e online

---

## 1) 🌐 Habilitar Realtime + índices + RPC (SQL)

Dashboard → **SQL Editor** → cole e rode o conteúdo de **`supabase/realtime_and_webhook.sql`**.
É idempotente (pode rodar de novo sem erro). Isso resolve o "não sincroniza em tempo real".

Confere rápido depois de rodar:
```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename in ('messages','conversations');
-- deve listar as duas tabelas
```

---

## 2) 🖥️ Linkar o projeto e descobrir o PROJECT_REF

O `PROJECT_REF` é o subdomínio da sua `VITE_SUPABASE_URL` (`https://<REF>.supabase.co`).

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
```

---

## 3) 🖥️ Configurar o secret da Edge Function

> ⚠️ **Importante:** `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são **injetados automaticamente**
> pelo Supabase em toda Edge Function — não podem (e não precisam) ser setados como secret
> (nomes começando com `SUPABASE_` são reservados). O único secret necessário é o `DEFAULT_USER_ID`.
>
> O **DEFAULT_USER_ID** é o `id` do seu usuário em `auth.users`
> (Dashboard → Authentication → Users → copiar o **User UID**). Ele é usado para abrir conversas
> de **números novos** que ainda não existem no banco. Conversas já existentes usam o `user_id` próprio.

```bash
npx supabase secrets set DEFAULT_USER_ID="<seu_auth_user_id>"
```

---

## 4) 🖥️ Deployar a Edge Function `webhook`

```bash
npx supabase functions deploy webhook --no-verify-jwt
```

- `--no-verify-jwt` é obrigatório: a Evolution chama sem token de usuário.
- URL final: `https://<PROJECT_REF>.supabase.co/functions/v1/webhook`

Teste por linha de comando (deve responder `OK` ou `ignored`):
```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"test","data":{}}'
```

---

## 5) 🌐 Apontar a Evolution API para o webhook

No app: **Integrações → WhatsApp → aba Configurações**
1. O campo **Webhook URL** já vem pré-preenchido com a URL da função.
2. Clique **📋 Copiar**.
3. Clique **Testar** → deve ficar 🟢 **Conectado** (só funciona após o passo 4).
4. Clique **Salvar configurações** (grava em `integrations` e registra o webhook na Evolution).

Eventos que a Evolution deve enviar (já configurados pelo `setWebhook`):
`MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`

> Alternativa manual: painel da Evolution → Settings → Webhook → cole a URL e marque os eventos acima.

---

## 6) ✅ Validar ponta a ponta

1. No app, abra o **Chat**. No console do navegador deve aparecer:
   `[Chat] realtime: SUBSCRIBED`
   (Se vier `CHANNEL_ERROR`, o passo 1 não foi aplicado.)
2. Mande uma mensagem **de um celular** para o número conectado.
3. Esperado:
   - **Com a função deployada:** a mensagem aparece **na hora**, mesmo sem aquela conversa aberta.
   - **Sem a função (só frontend):** aparece em ~10s, mas **somente** com o chat aberto (polling de segurança).

---

## Fluxo
```
WhatsApp → Evolution API → POST /functions/v1/webhook (service role)
        → INSERT messages → Supabase Realtime → Chat.jsx (UI ao vivo)
```

## Arquivos relacionados
- `supabase/realtime_and_webhook.sql` — SQL do passo 1
- `supabase/functions/webhook/index.ts` — Edge Function (receiver)
- `src/components/Integrations/WhatsAppManagePanel.jsx` — campo/teste do webhook
- `src/pages/Chat.jsx` — realtime + polling de segurança

## Multi-usuário (opcional)
A função abre conversas novas com `DEFAULT_USER_ID` (setup single-tenant). Para várias
instâncias/usuários, é preciso uma tabela de mapeamento `instância → user_id` e ajustar a
função para resolver o dono pelo nome da instância no payload. Peça que eu implemento.
