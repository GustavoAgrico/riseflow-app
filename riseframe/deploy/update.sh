#!/usr/bin/env bash
# Atualiza o Riseframe para a versão mais nova do GitHub (e aplica mudanças do .env).
# Contas, planos e vídeos ficam no volume do Docker — não se perdem.
set -euo pipefail
cd "$(dirname "$0")"
git -C .. pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
echo "✅ Atualizado: $(docker compose exec -T app node -e "import('./server/src/config.js').then(m=>console.log(m.APP_VERSION))" 2>/dev/null || echo 'ok')"
