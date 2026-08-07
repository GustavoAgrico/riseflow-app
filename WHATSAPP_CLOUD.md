# WhatsApp Cloud API (oficial da Meta) — Guia de configuração

Integração oficial do WhatsApp via **Cloud API** da Meta. Diferente do Baileys
(QR), **não precisa de servidor sempre-ligado**: a Meta hospeda tudo e entrega as
mensagens por webhook. O contato é o telefone puro — mesma identidade do WhatsApp
Baileys, então unifica no CRM/Chat.

> Código: `server/whatsappCloudClient.js`, `server/routes/whatsappCloud.js`,
> `src/components/Integrations/WhatsAppCloudModal.jsx`. O dispatch de saída
> (`server/flowEngine.js`, `server/routes/messages.js`) usa a Cloud API quando o
> usuário tem um número Cloud conectado (`isActiveFor`); senão, cai no Baileys.

---

## Visão geral do fluxo

```
Cliente manda msg → Meta → webhook (POST /api/webhook/whatsapp)
  → whatsappCloudClient.handleWebhookEvent
  → Socket.io (Chat em tempo real) + IA/funis + persiste no Supabase

Você responde no Chat → messages.js/flowEngine (isActiveFor=true)
  → POST graph.facebook.com/<phoneNumberId>/messages (Bearer token)
```

---

## Pré-requisitos (lado da Meta)

1. **Conta Meta Business** verificada — <https://business.facebook.com>
2. **App Meta** com o produto **WhatsApp** adicionado — <https://developers.facebook.com/apps>
3. **WhatsApp Business Account (WABA)** + um **número dedicado**
   - Para testar sem custo: use o **número de teste grátis** que a Meta fornece.
   - O número **não pode** estar ativo no app normal do WhatsApp/WhatsApp Business
     (ao entrar na API, o número vira "só-API").
4. Anote do painel **WhatsApp → API Setup**:
   - **Phone Number ID**
   - **WhatsApp Business Account ID (WABA)**
   - **Access Token** (temporário para teste; permanente via System User para produção)

---

## Passo 1 — Variáveis de ambiente (no servidor / Render)

No serviço `riseflow-app-aepu` → **Environment**, adicione:

| Variável | Valor | Obrigatória? |
|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | uma senha que você inventa (ex: `rf-wa-2026-xyz`) | ✅ sim |
| `WHATSAPP_APP_SECRET` | App Secret do seu app Meta (valida a assinatura do webhook) | recomendada |

Notas:
- `WHATSAPP_VERIFY_TOKEN` precisa ser **idêntico** ao que você colar no painel da Meta.
- Se `WHATSAPP_APP_SECRET` faltar, o código cai para `META_APP_SECRET`; se nenhum
  existir, o webhook é aceito **sem** validar assinatura (só aceitável em teste).

Salve → o Render rebuilda.

---

## Passo 2 — Configurar o webhook na Meta

No app Meta → **WhatsApp → Configuration → Webhook**:

1. **Callback URL:**
   ```
   https://riseflow-app-aepu.onrender.com/api/webhook/whatsapp
   ```
2. **Verify token:** o **mesmo** valor de `WHATSAPP_VERIFY_TOKEN`.
3. Clique em **Verify and save** (a Meta faz um GET; o servidor ecoa o `hub.challenge`).
4. Em **Webhook fields**, assine o campo **`messages`**.

Se a verificação falhar: confira que a env foi salva, que o deploy terminou, e que
o token bate exatamente (sem espaços).

---

## Passo 3 — Conectar no app

1. **Integrações** → card **"WhatsApp API Oficial"** → **Conectar**.
2. Cole **Phone Number ID** e **Access Token** (WABA ID é opcional).
3. **Conectar** — o backend valida as credenciais na Graph (`GET /<phoneNumberId>`)
   e só conecta se forem reais. O modal também mostra a URL do webhook para copiar.

---

## Passo 4 — Testar

1. Do **seu celular**, mande uma mensagem para o número da Meta.
2. Ela deve aparecer no **Chat** do RiseFlow em tempo real.
3. Responda pelo Chat → sai pela Cloud API.

> **Janela de 24h (regra da Meta):** mensagem de texto livre só é permitida até 24h
> após a última mensagem recebida do contato. Fora disso, a Meta exige **template
> aprovado** (não implementado ainda). Se o envio falhar fora da janela, o erro da
> Meta é repassado na resposta.

---

## Solução de problemas

| Sintoma | Causa provável | Ação |
|---|---|---|
| Webhook "Verify" falha na Meta | `WHATSAPP_VERIFY_TOKEN` diferente / deploy não terminou | Conferir env e o token idêntico; aguardar o build |
| Mensagem recebida não aparece | Campo `messages` não assinado, ou número não conectado no app | Assinar `messages`; reconectar no card |
| `mensagem de número não registrado` no log | `phone_number_id` do webhook não bate com o conectado | Reconectar com o Phone Number ID correto |
| Erro ao enviar fora de 24h | Regra da Meta (janela de atendimento) | Usar template aprovado (etapa futura) |
| 401 no webhook | Assinatura inválida (`X-Hub-Signature-256`) | Conferir `WHATSAPP_APP_SECRET` = App Secret do app Meta |

---

## Baileys vs Cloud API (qual usa)

- Os dois entregam o **mesmo canal "whatsapp"** (contato = telefone puro).
- Um usuário conecta **um** provider. O dispatch escolhe automático:
  - Tem número Cloud conectado (`isActiveFor`) → **Cloud API**.
  - Senão → **Baileys** (precisa do servidor `riseflow-wa` no ar).
- Cloud API **não** precisa do servidor pago `riseflow-wa`; Baileys precisa.
