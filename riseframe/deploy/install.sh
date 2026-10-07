#!/usr/bin/env bash
# Instala o Riseframe numa VPS Ubuntu (Hostinger KVM, Oracle, etc.) com UM comando:
#   bash <(curl -fsSL https://raw.githubusercontent.com/GustavoAgrico/riseflow-app/master/riseframe/deploy/install.sh)
# Instala o Docker, baixa o projeto em /opt/riseflow-app, pergunta o essencial, cria o
# .env e sobe o site com HTTPS automático. Pode rodar de novo sem perder nada.
set -euo pipefail

REPO="https://github.com/GustavoAgrico/riseflow-app.git"
DIR="/opt/riseflow-app"
DEPLOY="$DIR/riseframe/deploy"

say() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }
ask() { # ask "Pergunta" "padrão" → resposta (lida do terminal, mesmo via curl | bash)
  local q="$1" def="${2:-}" ans
  if [ -n "$def" ]; then printf '%s [%s]: ' "$q" "$def" > /dev/tty; else printf '%s: ' "$q" > /dev/tty; fi
  IFS= read -r ans < /dev/tty || true
  printf '%s' "${ans:-$def}"
}
set_env() { # set_env CHAVE valor → grava no .env (cria a linha se não existir)
  local key="$1" val="$2" esc
  esc=$(printf '%s' "$val" | sed -e 's/[\/&|\\]/\\&/g')
  if grep -q "^${key}=" .env; then sed -i "s|^${key}=.*|${key}=${esc}|" .env; else printf '%s=%s\n' "$key" "$val" >> .env; fi
}

[ "$(id -u)" -eq 0 ] || { echo "Rode como root (no terminal da Hostinger você já é root)."; exit 1; }

say "1/5 · Instalando o Docker (se ainda não tiver)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
apt-get install -y -qq git openssl python3 >/dev/null 2>&1 || true

say "2/5 · Baixando o Riseframe em $DIR"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone --depth 1 "$REPO" "$DIR"; fi
cd "$DEPLOY"

say "3/5 · Configuração"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Responda (Enter aceita o valor entre colchetes)."
  set_env SITE_ADDRESS "$(ask 'Endereço principal do site' 'www.riseframe.com.br')"
  set_env SITE_ALIASES "$(ask 'Outro endereço que redireciona para o principal (vazio = nenhum)' 'riseframe.com.br')"
  set_env ADMIN_EMAILS "$(ask 'Seu e-mail de administrador')"
  set_env DEEPGRAM_API_KEY "$(ask 'Chave da Deepgram (legendas) — a mesma do Render')"
  set_env AUTH_SECRET "$(openssl rand -hex 32)"
  echo "As outras chaves (Pexels, Google, Claude, e-mail, WhatsApp) você coloca depois com:  nano $DEPLOY/.env"
else
  echo ".env já existe — mantendo sua configuração."
  grep -q '^AUTH_SECRET=.\+' .env || set_env AUTH_SECRET "$(openssl rand -hex 32)"
fi

say "4/5 · Liberando as portas 80 e 443"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'Status: active'; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

say "5/5 · Subindo o site (a 1ª vez leva de 5 a 15 minutos)"
docker compose up -d --build

IP=$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
SITE=$(grep '^SITE_ADDRESS=' .env | cut -d= -f2)
cat <<MSG

✅ Riseframe instalado.
   IP desta VPS: $IP
   Site: https://$SITE  (funciona depois que o domínio apontar para $IP — veja o guia)

   Editar chaves:   nano $DEPLOY/.env   e depois   $DEPLOY/update.sh
   Atualizar:       $DEPLOY/update.sh
   Ver erros:       cd $DEPLOY && docker compose logs -f app
MSG
