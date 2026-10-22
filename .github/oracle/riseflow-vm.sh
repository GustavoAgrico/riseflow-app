#!/usr/bin/env bash
# Robô que tenta criar a VM grátis do servidor RiseFlow na Oracle até abrir vaga.
# Alterna entre as duas opções Always Free: ARM (A1.Flex 1 núcleo/6 GB) e AMD
# (E2.1.Micro). Roda no GitHub Actions (oracle-robo-riseflow.yml) com o OCI CLI
# configurado por uma chave de API. A VM sai preparada pelo riseflow-cloud-init.yaml.
#
# Variáveis: NAME (padrão riseflow-app), SSH_PUBKEY (chave pública de acesso),
# INTERVAL (s entre tentativas), MAX_SECONDS (0 = sem limite), ROBO_RESULT (arquivo
# onde gravar "created IP" / "exists IP").
set -uo pipefail

NAME="${NAME:-riseflow-app}"
INTERVAL="${INTERVAL:-60}"
MAX_SECONDS="${MAX_SECONDS:-0}"
HERE="$(cd "$(dirname "$0")" && pwd)"
USER_DATA="$HERE/riseflow-cloud-init.yaml"

say()  { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m*** ERRO: %s ***\033[0m\n' "$*"; exit 1; }
result() { [ -n "${ROBO_RESULT:-}" ] && printf '%s %s\n' "$1" "${2:-}" > "$ROBO_RESULT"; }

command -v oci >/dev/null 2>&1 || die "OCI CLI não encontrado."
[ -n "${SSH_PUBKEY:-}" ] || die "SSH_PUBKEY vazia."
KEYFILE="$(mktemp)"; printf '%s\n' "$SSH_PUBKEY" > "$KEYFILE"

TENANCY="$(awk -F= '/^[[:space:]]*tenancy[[:space:]]*=/{gsub(/[[:space:]]/,"",$2); print $2; exit}' "$HOME/.oci/config" 2>/dev/null)"
TENANCY="${OCI_TENANCY:-$TENANCY}"
[ -n "$TENANCY" ] || die "tenancy não encontrada no ~/.oci/config."
COMPARTMENT="${COMPARTMENT:-$TENANCY}"
AD="$(oci iam availability-domain list --query 'data[0].name' --raw-output 2>/dev/null)"
[ -n "${AD:-}" ] || die "não consegui listar o domínio de disponibilidade (chave de API válida?)."

EXISTING="$(oci compute instance list -c "$COMPARTMENT" --display-name "$NAME" --all \
  --query 'data[?contains(`["RUNNING","PROVISIONING","STARTING","STOPPED"]`, "lifecycle-state")].id | [0]' --raw-output 2>/dev/null)"
if [ -n "${EXISTING:-}" ] && [ "$EXISTING" != "null" ]; then
  IP="$(oci compute instance list-vnics --instance-id "$EXISTING" --query 'data[0]."public-ip"' --raw-output 2>/dev/null)"
  say "A VM \"$NAME\" já existe (IP: ${IP:-?}). Nada a fazer."
  result exists "$IP"; exit 0
fi

SUBNET="${SUBNET:-$(oci network subnet list -c "$COMPARTMENT" --all \
  --query 'data[?"prohibit-public-ip-on-vnic"==`false`].id | [0]' --raw-output 2>/dev/null)}"
{ [ -n "${SUBNET:-}" ] && [ "$SUBNET" != "null" ]; } || die "nenhuma sub-rede pública encontrada."

image_for() {
  oci compute image list -c "$COMPARTMENT" --operating-system "Canonical Ubuntu" \
    --operating-system-version "24.04" --shape "$1" --sort-by TIMECREATED \
    --query 'data[?!contains("display-name", `Minimal`)].id | [0]' --raw-output 2>/dev/null
}
IMG_ARM="$(image_for VM.Standard.A1.Flex)"
IMG_AMD="$(image_for VM.Standard.E2.1.Micro)"
SHAPES=()
[ -n "$IMG_ARM" ] && [ "$IMG_ARM" != "null" ] && SHAPES+=("VM.Standard.A1.Flex")
[ -n "$IMG_AMD" ] && [ "$IMG_AMD" != "null" ] && SHAPES+=("VM.Standard.E2.1.Micro")
[ ${#SHAPES[@]} -gt 0 ] || die "não achei imagem Ubuntu 24.04 para nenhum shape grátis."

say "Tentando criar \"$NAME\" (${SHAPES[*]}) a cada ${INTERVAL}s…"
STARTED=$(date +%s); ATTEMPT=0
while true; do
  if [ "$MAX_SECONDS" -gt 0 ] && [ $(( $(date +%s) - STARTED )) -ge "$MAX_SECONDS" ]; then
    say "Tempo desta rodada acabou sem vaga — a próxima rodada continua."; exit 0
  fi
  [ ${#SHAPES[@]} -gt 0 ] || die "cota grátis esgotada nos dois shapes."
  SHAPE="${SHAPES[$(( ATTEMPT % ${#SHAPES[@]} ))]}"; ATTEMPT=$((ATTEMPT + 1))
  if [ "$SHAPE" = "VM.Standard.A1.Flex" ]; then
    IMAGE="$IMG_ARM"; EXTRA=(--shape-config '{"ocpus":1,"memoryInGBs":6}')
  else
    IMAGE="$IMG_AMD"; EXTRA=()
  fi
  printf '\n[%s] tentativa %d · %s\n' "$(date +%H:%M:%S)" "$ATTEMPT" "$SHAPE"
  OUT="$(oci compute instance launch --compartment-id "$COMPARTMENT" --availability-domain "$AD" \
    --shape "$SHAPE" "${EXTRA[@]}" --image-id "$IMAGE" --subnet-id "$SUBNET" --assign-public-ip true \
    --display-name "$NAME" --ssh-authorized-keys-file "$KEYFILE" --user-data-file "$USER_DATA" \
    --wait-for-state RUNNING 2>&1)"
  if [ $? -eq 0 ]; then
    sleep 5
    ID="$(printf '%s' "$OUT" | grep -oE 'ocid1\.instance[.a-z0-9-]+' | head -1)"
    IP="$(oci compute instance list-vnics --instance-id "$ID" --query 'data[0]."public-ip"' --raw-output 2>/dev/null)"
    say "VM CRIADA ($SHAPE) — IP: ${IP:-?}"
    result created "$IP $SHAPE"; exit 0
  fi
  if printf '%s' "$OUT" | grep -qiE 'LimitExceeded|quota'; then
    warn "cota grátis de $SHAPE esgotada — deixo de tentar este shape."
    NEW=(); for s in "${SHAPES[@]}"; do [ "$s" != "$SHAPE" ] && NEW+=("$s"); done; SHAPES=("${NEW[@]}")
  elif printf '%s' "$OUT" | grep -qiE 'capacity|out of host|too many requests|429|InternalError'; then
    warn "sem vaga agora."
  else
    printf '%s\n' "$OUT"; die "erro diferente de capacidade (veja acima)."
  fi
  sleep "$INTERVAL"
done
