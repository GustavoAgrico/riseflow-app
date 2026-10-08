# Riseframe na Hostinger (VPS) — passo a passo

Na VPS o Riseframe fica **sempre ligado** (sem "acordar" como no Render grátis), com
**disco permanente** (contas, planos, Pix confirmados e a demo não somem mais) e
**HTTPS automático**. Tudo roda em Docker; você só copia e cola comandos.

> ⚠️ Precisa ser **VPS** (planos "KVM"). A "Hospedagem de Sites" e a "Hospedagem Cloud"
> da Hostinger **não** rodam o Riseframe (ele usa FFmpeg e processamentos longos).

## 1. Contratar a VPS

1. Hostinger → **VPS** → escolha o plano. Recomendado: **KVM 2** (2 vCPU, 8 GB de RAM).
   O KVM 1 funciona, mas edita mais devagar. Mais núcleos = vídeos prontos mais rápido.
2. **Localização:** a mais perto dos seus clientes (Brasil, se tiver).
3. **Sistema operacional:** *Ubuntu 24.04* (o "puro", sem painel).
4. Crie a **senha do root** e guarde. Anote o **IP** da VPS (aparece no hPanel → VPS).

## 2. Abrir o terminal da VPS

hPanel → **VPS** → seu servidor → **Terminal do navegador** (ou "Browser terminal").
Abre uma tela preta já logada como `root`. (Se preferir, no Windows: PowerShell →
`ssh root@SEU_IP`.)

## 3. Instalar com um comando

Cole no terminal e aperte Enter:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/GustavoAgrico/riseflow-app/master/riseframe/deploy/install.sh)
```

Ele instala o Docker, baixa o Riseframe e faz 4 perguntas:

| Pergunta | O que responder |
|---|---|
| Endereço principal do site | **Para testar primeiro:** `SEU_IP.sslip.io` (ex.: `82.25.10.20.sslip.io`). Depois trocamos pelo domínio (passo 6). |
| Outro endereço que redireciona | Deixe **vazio** por enquanto (apague o texto e Enter). |
| Seu e-mail de administrador | Seu e-mail de admin (o mesmo do `ADMIN_EMAILS` do Render). |
| Chave da Deepgram | A mesma do Render (Render → serviço → Environment → `DEEPGRAM_API_KEY`). |

A primeira instalação leva de 5 a 15 minutos. No fim aparece **✅ Riseframe instalado**.
Abra `https://SEU_IP.sslip.io` no navegador: o site tem que abrir.

## 4. Copiar as outras chaves do Render

No terminal:

```bash
nano /opt/riseflow-app/riseframe/deploy/.env
```

Preencha com os **mesmos valores** do Render → Environment (o que não usa, deixe vazio):
- **Essenciais:** `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (contas e planos), `RESEND_API_KEY`
  e `EMAIL_FROM` (e-mails), `DEEPGRAM_API_KEY`/`GROQ_API_KEY` (legendas).
- **Imagens e IA:** `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `GOOGLE_CSE_KEY`, `GOOGLE_CSE_ID`, `ANTHROPIC_API_KEY`.
- **Cobrança:** `ABACATE_PAY_API_KEY`, `ABACATE_WEBHOOK_SECRET`, `BILLING_PLANS`, `CREDIT_PACKS`,
  `CREDIT_COSTS`, `BILLING_METHODS`, `BILLING_SIGNUP_CREDITS`.
- **Outros:** `GOOGLE_CLIENT_ID`, `SMTP_*`, `WHATSAPP_*`, `ADMIN_WHATSAPP`, `SUPPORT_EMAIL`, `SUPPORT_WHATSAPP`.

> Toda variável do `.env` vai para o app — se o Render tiver alguma chave que não está
> nesta lista, é só acrescentar a linha `NOME=valor` no `.env`.

Salvar no nano: **Ctrl+O**, Enter, **Ctrl+X**. Depois aplique:

```bash
/opt/riseflow-app/riseframe/deploy/update.sh
```

## 5. Trazer as contas e planos do Render

1. No site **atual** (riseframe.com.br, no Render), entre como admin → **Configurações** →
   **Backup e mudança de servidor** → **Baixar backup**. Vem um arquivo `riseframe-backup-AAAA-MM-DD.zip`.
   Faça isso **logo antes** de trocar o domínio (passo 6), para não perder cadastros novos.
2. Envie o arquivo para a VPS. No Windows, abra o **PowerShell** na pasta Downloads:
   ```powershell
   scp .\riseframe-backup-*.zip root@SEU_IP:/root/
   ```
3. No terminal da VPS:
   ```bash
   cd /opt/riseflow-app/riseframe/deploy && ./restore.sh /root/riseframe-backup-*.zip
   ```
   Aparece **✅ … restaurados**. Os usuários entram com a mesma senha de antes.

## 6. Apontar o domínio riseframe.com.br para a VPS

1. No painel onde o domínio está registrado (Registro.br, Hostinger, Cloudflare…), na **zona DNS**:
   - registro **A** com nome `@` (ou vazio) → **IP da VPS**
   - registro **A** com nome `www` → **IP da VPS**
   - **apague** os registros antigos que apontam para o Render (CNAME `www` → `….onrender.com`, ou A antigos).
2. Na VPS, troque o endereço:
   ```bash
   cd /opt/riseflow-app/riseframe/deploy
   sed -i 's|^SITE_ADDRESS=.*|SITE_ADDRESS=www.riseframe.com.br|; s|^SITE_ALIASES=.*|SITE_ALIASES=riseframe.com.br|' .env
   ./update.sh
   ```
3. Em alguns minutos (até algumas horas, conforme o DNS) `https://www.riseframe.com.br`
   abre pela VPS, com HTTPS automático, e `riseframe.com.br` redireciona para o `www`.
4. **Login com Google:** no Google Cloud → Credenciais → seu Client ID → *Authorized
   JavaScript origins*: confira que `https://www.riseframe.com.br` está lá.

## 6b. O site estático da Hostinger (public_html)

Com a VPS, **site e API ficam juntos** no mesmo endereço — o zip `riseframe-site-hostinger.zip`
em `public_html` deixa de ser usado. Se o domínio apontava para a hospedagem de sites, a troca
de DNS do passo 6 já leva os visitantes para a VPS (pode apagar os arquivos do `public_html`
depois que tudo estiver funcionando).

## 7. Desligar o Render

Quando o site estiver abrindo pela VPS (teste cadastro, login e uma edição), no Render:
serviço **riseframe** → **Settings** → **Suspend** (ou Delete). No GitHub, nada muda.

## Dia a dia

| Para… | Comando (no terminal da VPS) |
|---|---|
| Atualizar para a versão nova | `/opt/riseflow-app/riseframe/deploy/update.sh` |
| Mudar uma chave | `nano /opt/riseflow-app/riseframe/deploy/.env` e depois o `update.sh` |
| Ver erros | `cd /opt/riseflow-app/riseframe/deploy && docker compose logs -f app` (Ctrl+C sai) |
| Backup agora | `/opt/riseflow-app/riseframe/deploy/backup.sh` (vai para `/root/backups`) |
| Backup todo dia às 3h | `crontab -e` → adicione `0 3 * * * /opt/riseflow-app/riseframe/deploy/backup.sh` |
| Reiniciar | `cd /opt/riseflow-app/riseframe/deploy && docker compose restart` |

Também dá para baixar o backup pelo site (Configurações → Baixar backup) e guardar no seu PC.

## Problemas comuns

- **O site não abre pelo domínio:** o DNS ainda não propagou ou ficou registro antigo do
  Render. Confira em https://dnschecker.org se `www.riseframe.com.br` já mostra o IP da VPS.
- **"Não seguro"/erro de certificado:** o Caddy só consegue o HTTPS depois que o domínio
  aponta para a VPS. Ele tenta de novo sozinho; depois do DNS certo, `docker compose restart caddy`.
- **Firewall da Hostinger:** se você ativou o firewall no hPanel (VPS → Firewall), libere
  as portas **80** e **443** (TCP).
- **Edição lenta:** suba para um plano com mais núcleos (KVM 4/8) — sem reinstalar nada.
