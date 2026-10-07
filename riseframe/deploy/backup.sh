#!/usr/bin/env bash
# Copia contas, planos/créditos e configurações para /root/backups (guarde fora da VPS
# também). Para rodar todo dia às 3h:  crontab -e  →  0 3 * * * /opt/riseflow-app/riseframe/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")"
OUT=/root/backups; mkdir -p "$OUT"
TMP=$(mktemp -d)
for f in users.json billing.json settings.json; do
  docker compose cp "app:/app/data/$f" "$TMP/$f" >/dev/null 2>&1 || true
done
FILE="$OUT/riseframe-$(date +%F-%H%M).tar.gz"
tar -czf "$FILE" -C "$TMP" .
rm -rf "$TMP"
ls -1t "$OUT"/riseframe-*.tar.gz | tail -n +31 | xargs -r rm -f   # guarda os 30 mais novos
echo "✅ Backup: $FILE"
