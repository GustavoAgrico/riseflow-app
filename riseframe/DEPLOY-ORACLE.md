# Publicar o Riseframe na Oracle Cloud (Always Free) — grátis e forte

A Oracle Cloud tem um tier **Always Free** com uma VM ARM (**Ampere A1**) de até
**4 núcleos e 24 GB de RAM** que **não dorme** e é grátis para sempre. É o
suficiente para rodar o Riseframe inteiro (frontend + API + FFmpeg + Whisper) com
folga — sem o OOM/sleep do plano free do Render.

Este guia sobe tudo com **Docker Compose** + **Caddy** (HTTPS automático e grátis).
Tempo total: ~30 min (a maior parte é esperar o 1º build).

---

## Visão geral do que você vai fazer
1. Criar a conta e a VM ARM na Oracle.
2. Liberar as portas 80/443 (firewall da nuvem **e** do sistema).
3. Instalar o Docker.
4. Baixar o projeto e subir com um comando.
5. Abrir o site em HTTPS.

---

## 1. Criar a conta e a VM

1. Crie a conta em https://www.oracle.com/cloud/free/ (pede cartão só para
   verificação; o Always Free **não cobra**).
2. No console: **Menu → Compute → Instances → Create instance**.
3. Configure:
   - **Image:** Canonical **Ubuntu 22.04**.
   - **Shape → Change shape → Ampere → `VM.Standard.A1.Flex`** → **4 OCPUs / 24 GB**
     (tudo o que o Always Free permite; cabe numa VM só).
   - **Add SSH keys:** deixe **Generate a key pair** e **baixe a chave privada**
     (guarde bem — é como você entra na VM).
   - **Networking:** deixe criar uma VCN nova (padrão).
4. **Create.** Quando ficar **Running**, anote o **Public IP address** (ex.: `123.45.67.89`).

> ⚠️ **Não use `VM.Standard.E2.1.Micro`.** É o shape que a Oracle oferece por padrão,
> mas tem **1 núcleo e 1 GB de RAM** — não dá nem para o `docker build` terminar (o
> `npm install` + build do frontend + faster-whisper estouram a memória), e o Whisper
> local não roda. O Always Free dá direito à Ampere A1 **e** aos Micro; use a A1.
> Se a capacidade A1 não abrir, o robô do passo abaixo tenta sozinho.

> ⚠️ **"Out of capacity" no shape Ampere?** É comum. Tente de novo mais tarde, ou
> troque a **Availability Domain** (AD-1/2/3) na criação, ou reduza para 2 OCPU/12 GB.
> Em vez de ficar tentando na mão, rode o robô no **Cloud Shell** (ícone `>_` no topo
> do console), que tenta em loop até abrir vaga:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/GustavoAgrico/riseflow-app/master/riseframe/deploy/oracle-retry.sh | OCPUS=2 MEM=12 bash
> ```
> Pedir menos (`OCPUS=1 MEM=6`) consegue vaga muito mais rápido e ainda é 6× a RAM
> de um Micro — suficiente para rodar o Riseframe.
> Persistindo, crie a conta numa **Home Region** diferente (a capacidade varia por região).

---

## 2. Liberar as portas 80 e 443 (DUAS camadas — o erro nº1 da Oracle)

### 2a. Firewall da nuvem (VCN Security List)
1. Na página da instância → clique na **Subnet** → **Security Lists** → a Default.
2. **Add Ingress Rules** (duas vezes), com:
   - Source CIDR: `0.0.0.0/0` · IP Protocol: **TCP** · Destination Port: **80**
   - Source CIDR: `0.0.0.0/0` · IP Protocol: **TCP** · Destination Port: **443**

### 2b. Firewall do sistema (dentro da VM)
As imagens Ubuntu da Oracle vêm com iptables **bloqueando** quase tudo. Depois de
entrar por SSH (passo 3), rode:
```bash
sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo netfilter-persistent save
```
(Sem isso, o site simplesmente **não abre**, mesmo com o app rodando.)

---

## 2c. Apontar o seu domínio para a VM (se tiver um)

No painel do seu registrador, crie um registro **A**:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `@` (ou `app`, para `app.seudominio.com`) | o **IP público** da VM | 300 |

Confirme que já propagou **antes** de subir o app — o Caddy pede o certificado no
primeiro acesso e o Let's Encrypt precisa que o domínio já resolva para o IP:
```bash
dig +short seudominio.com     # deve responder o IP da VM
```
> Usando Cloudflare, deixe o registro **sem proxy** (nuvem cinza) até o certificado
> ser emitido; com a nuvem laranja o Let's Encrypt não consegue validar.

Sem domínio próprio, pule este passo e use `SEU_IP.sslip.io` no `SITE_ADDRESS`.

---

## 3. Entrar na VM (SSH) e instalar o Docker

No seu computador, com a chave `.key` baixada:
```bash
# Windows (PowerShell) ou Mac/Linux:
ssh -i caminho/para/sua-chave.key ubuntu@SEU_IP_PUBLICO
```
> No Windows, se der erro de permissão da chave, use o PowerShell e o caminho
> completo do arquivo; o usuário do Ubuntu da Oracle é sempre **`ubuntu`**.

Já dentro da VM, instale o Docker (inclui o `docker compose`):
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# aplique o grupo sem precisar relogar:
newgrp docker
```
E rode as regras de firewall do passo **2b** (se ainda não rodou).

---

## 4. Baixar o projeto e subir

```bash
# git já vem no Ubuntu; o repositório é PÚBLICO, então o clone NÃO pede login/senha:
git clone https://github.com/GustavoAgrico/riseflow-app.git
cd riseflow-app/riseframe/deploy

# configure o ambiente:
cp .env.example .env
nano .env
```
No `.env`, preencha no mínimo:
- **`SITE_ADDRESS`** — sem domínio próprio, use o IP com **sslip.io**:
  `123.45.67.89.sslip.io` (troque pelo seu IP). Isso te dá um HTTPS válido de graça,
  sem comprar domínio.
- **`AUTH_SECRET`** — gere um forte: rode `openssl rand -hex 32` e cole o resultado.

Salve (`Ctrl+O`, `Enter`, `Ctrl+X`) e suba:
```bash
docker compose up -d --build
```
> O **1º build demora** (~10–20 min na ARM): instala as dependências, baixa o
> modelo Whisper e builda o frontend. Acompanhe com `docker compose logs -f`.

---

## 5. Abrir o site

Acesse **`https://SEU_IP.sslip.io`** (o mesmo `SITE_ADDRESS`). O Caddy emite o
certificado HTTPS automaticamente no 1º acesso (pode levar alguns segundos).

Teste rápido da API: `https://SEU_IP.sslip.io/api/health` → deve responder um JSON.

Pronto — Riseframe no ar, sem dormir e com RAM de sobra. 🎉

---

## Migrar de um site que já está no ar (sem derrubar o domínio)

Se o domínio já aponta para outro host (ex.: Render) e você está trocando para esta
VM, **não mude o DNS primeiro**. O Caddy pede o certificado no primeiro acesso, e o
build inicial leva 10–20 min — apontar o domínio antes deixa o site fora do ar nesse
intervalo e o certificado falha.

Faça na ordem inversa, com zero downtime:

1. Suba a VM com `SITE_ADDRESS=SEU_IP.sslip.io` e teste tudo por esse endereço
   (login, upload, render). O site antigo continua no ar o tempo todo.
2. Quando estiver satisfeito, troque no `.env` para o domínio real e recarregue:
   ```bash
   nano .env      # SITE_ADDRESS=seudominio.com
   docker compose up -d
   ```
3. Só então mude o DNS (registro **A** → IP da VM) e apague o registro antigo que
   apontava para o host anterior.
4. No primeiro acesso pelo domínio o Caddy emite o certificado (alguns segundos).

Depois de virar o DNS, atualize o que aponta para o endereço do site:
- **AbacatePay → Webhooks:** `https://seudominio.com/api/billing/webhook?webhookSecret=...`
  (mesmo valor do `ABACATE_WEBHOOK_SECRET` do `.env`).
- **Login com Google:** adicione o domínio nas *Authorized JavaScript origins*.
- **Render:** com tudo funcionando na VM, suspenda o serviço antigo (Settings →
  Suspend) para não ter dois sites cobrando/atendendo ao mesmo tempo.

> As contas de usuário **não migram** entre os dois hosts — o banco é um arquivo no
> disco de cada máquina. Se já houver gente cadastrada no site antigo, elas precisam
> se cadastrar de novo, ou você copia o `data/` do host antigo antes de virar o DNS.

---

## Manutenção

**Atualizar para a versão mais nova** (depois de mudanças no repo):
```bash
cd ~/riseflow-app && git pull
cd riseframe/deploy && docker compose up -d --build
```

**Ver logs / reiniciar / parar:**
```bash
docker compose logs -f        # logs ao vivo
docker compose restart app    # reinicia só o app
docker compose down           # para tudo (os dados no volume permanecem)
```

**Onde ficam os dados:** num volume Docker (`riseframe_data`), montado em
`/app/data` — sobrevive a `down`/`up` e a reinícios da VM:

| Pasta | O que guarda |
|---|---|
| `uploads/` | os vídeos enviados |
| `outputs/` | os vídeos renderizados (o que o usuário baixa) |
| `jobs/` | registro dos vídeos que dá para **reabrir na timeline** |
| `cache/` | miniaturas e forma de onda das faixas da timeline |
| `users.json`, `auth_secret` | contas e o segredo que assina os logins |
| `billing.json` | planos assinados, créditos e pagamentos de cada conta |

**`OUTPUT_TTL_HOURS` varre `outputs/`, `uploads/`, `jobs/` e `cache/`.** Ele define,
na prática, por quanto tempo um vídeo continua podendo ser reaberto na timeline —
passado o prazo, o arquivo de origem some e o registro é descartado no próximo boot.
Com disco sobrando, subir para `72` dá uma janela mais confortável.

---

## Ativar os extras (opcional, no `.env` → depois `docker compose up -d`)
- **Login com Google:** preencha `GOOGLE_CLIENT_ID` e adicione `https://SEU_IP.sslip.io`
  nas *Authorized JavaScript origins* no Google Cloud.
- **Recuperação de senha:** preencha `SMTP_HOST/PORT/USER/PASS/FROM` (ex.: Gmail com
  senha de app).
- **B-roll / IA:** `PEXELS_API_KEY`, `ANTHROPIC_API_KEY`.
- **Legendas melhores:** suba `WHISPER_MODEL` para `small` (a A1 aguenta).

## Problemas comuns
- **Site não abre / demora infinito:** faltou o firewall — confira **as duas** camadas
  do passo 2 (Security List *e* iptables).
- **Cadeado inválido / sem HTTPS:** o `SITE_ADDRESS` precisa resolver para o IP.
  Com `sslip.io` isso é automático; confira que digitou o IP certo. O Let's Encrypt
  também precisa das portas 80 **e** 443 abertas.
- **Falha ao instalar o Whisper na ARM:** raro, mas se acontecer, troque no `.env`
  para uma API de transcrição (`TRANSCRIBE_PROVIDER=deepgram` + `DEEPGRAM_API_KEY`)
  e rode `docker compose up -d` de novo.
- **Domínio próprio:** aponte um registro **A** do seu domínio para o IP da VM e use
  esse domínio no `SITE_ADDRESS` (sem `https://`). O Caddy cuida do certificado.
