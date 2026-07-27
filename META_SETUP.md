# Meta (Facebook Messenger + Instagram DM) — Configuração

Passo a passo para ligar os canais Meta do RiseFlow (cards **Facebook
Messenger** e **Instagram DM** em Integrações). A implementação usa a
**Messenger Platform / Graph API v21.0**.

> **Pré-requisitos**
> - Uma **Página do Facebook** (o Messenger é sempre de uma página, não de perfil).
> - Para Instagram DM: conta **profissional** (Business/Creator) **vinculada** a essa página.
> - O proxy do RiseFlow acessível por **HTTPS público** para receber webhooks
>   (Render/VPS; em localhost use um túnel — ex.: `cloudflared tunnel --url http://localhost:3333`).

---

## 1. Criar o app na Meta

1. Acesse [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
2. Tipo: **Business** (ou "Other" → Business).
3. Nomeie (ex.: `RiseFlow`) e crie o app.
4. No painel do app → **Add products**:
   - **Messenger** → Set up
   - **Instagram** → Set up (só se for usar DM do Instagram)

## 2. Copiar as credenciais para o `server/.env`

Em **App settings → Basic**:

```dotenv
META_APP_ID=<App ID>
META_APP_SECRET=<App Secret>          # usado para validar a assinatura do webhook
META_VERIFY_TOKEN=<invente-uma-string-aleatoria-longa>
# PAGE_ACCESS_TOKEN é opcional — fallback global; o normal é conectar pela tela
# de Integrações (o token da página fica salvo por usuário em integrations).
PAGE_ACCESS_TOKEN=
```

Reinicie o proxy (`server/`) depois de editar o `.env`.

## 3. Configurar o Webhook

No painel do app → **Messenger → Settings → Webhooks** (e **Instagram →
Configuration → Webhooks** para DM):

| Campo | Valor |
|---|---|
| Callback URL | `https://SEU-DOMINIO/api/webhook/meta` |
| Verify Token | o MESMO valor de `META_VERIFY_TOKEN` do `.env` |
| Webhook fields | `messages`, `messaging_postbacks` |

Ao clicar em **Verify and save**, a Meta faz um `GET` com `hub.challenge` —
o proxy responde automaticamente (rota `GET /api/webhook/meta`). Se falhar,
confira se o token bate e se a URL é alcançável por fora.

## 4. Conectar a página no RiseFlow

Dois caminhos (a tela de Integrações oferece os dois):

### A) OAuth (recomendado)
1. Em **Facebook Login → Settings** do app, adicione em **Valid OAuth Redirect URIs**:
   `https://SEU-DOMINIO/api/meta/oauth/callback`
   (em dev: `http://localhost:3333/api/meta/oauth/callback`)
2. No RiseFlow: **Integrações → Facebook Messenger (ou Instagram DM) → Conectar
   → Entrar com a Meta** → faça login → escolha a página.
3. O RiseFlow troca o code pelo token, pega o **Page Access Token**, assina o
   app nos eventos da página (`subscribed_apps`) e salva tudo.

### B) Token manual
1. No painel do app → **Messenger → Settings → Access Tokens** → **Add or
   remove pages** → selecione a página → **Generate token**.
2. Cole o token no campo "Page Access Token" do modal.

> Para **Instagram DM**, use a MESMA página do Facebook à qual a conta
> profissional do Instagram está vinculada — o token é o da página.

## 5. Permissões e App Review

Em **desenvolvimento** (app em Dev Mode), tudo funciona **apenas para
administradores/testers do app** — adicione sua conta em **App roles**.

Para uso com clientes reais, submeta o **App Review** com:
- `pages_messaging` (Messenger)
- `instagram_basic` + `instagram_manage_messages` (Instagram DM)
- `pages_show_list`, `pages_read_engagement`

## 6. Janela de 24 horas (política da Meta)

A Meta só permite responder um contato **até 24h após a última mensagem
recebida** dele (`messaging_type: RESPONSE`). O RiseFlow **bloqueia o envio
fora da janela** com o erro:

> "Fora da janela de 24h da Meta: só é possível responder até 24h após a
> última mensagem do contato."

Não há burla — fora da janela, apenas Message Tags aprovadas (não
implementadas) ou esperar o contato escrever de novo.

## 7. Teste ponta a ponta

1. Conecte a página (passo 4) — o card fica **Online** com o nome da página.
2. Envie uma mensagem para a página (Messenger) ou DM (Instagram) de outra conta.
3. A conversa aparece no **Chat** do RiseFlow (contato `fb…`/`ig…`); funis com
   gatilho por palavra-chave e IA respondem automaticamente.
4. Responda pelo Chat — deve chegar no Messenger/Instagram.

## Arquitetura (referência)

| Peça | Arquivo |
|---|---|
| Cliente Graph/registro de páginas/janela 24h | `server/metaClient.js` |
| Webhook (GET verificação + POST eventos c/ assinatura) | `server/routes/meta.js` |
| Roteamento de envio por prefixo (`fb…`/`ig…`) | `server/routes/messages.js` + `server/flowEngine.js` |
| Modal de conexão (OAuth + token manual) | `src/components/Integrations/MetaConnectModal.jsx` |
| Identidade do contato | `fb<PSID>` / `ig<IGSID>` em `conversations.contact_phone` |
