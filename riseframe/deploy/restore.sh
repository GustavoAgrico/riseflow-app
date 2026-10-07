#!/usr/bin/env bash
# Restaura contas, planos e configurações a partir de um backup:
#   • o .zip baixado no site (Configurações → Backup e mudança de servidor), ou
#   • um .tar.gz do backup.sh
# Uso:  ./restore.sh /root/riseframe-backup-2026-10-07.zip
set -euo pipefail
cd "$(dirname "$0")"
SRC="${1:?Informe o arquivo do backup. Ex.: ./restore.sh /root/riseframe-backup.zip}"
TMP=$(mktemp -d)
case "$SRC" in
  *.zip) python3 -m zipfile -e "$SRC" "$TMP" ;;
  *.tar.gz|*.tgz) tar -xzf "$SRC" -C "$TMP" ;;
  *) echo "Formato não reconhecido (use .zip ou .tar.gz)"; exit 1 ;;
esac
n=0
for f in users.json billing.json settings.json; do
  p=$(find "$TMP" -name "$f" | head -1)
  [ -n "$p" ] || continue
  docker compose cp "$p" "app:/app/data/$f"
  n=$((n+1))
done
rm -rf "$TMP"
[ "$n" -gt 0 ] || { echo "Nenhum arquivo de dados encontrado no backup."; exit 1; }
docker compose restart app
echo "✅ $n arquivo(s) restaurados. Contas e planos de volta."
