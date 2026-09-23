#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Riseframe — "robô" que fica tentando criar a VM ARM grátis (Ampere A1) na
# Oracle até a capacidade abrir. Feito para rodar no ORACLE CLOUD SHELL, que já
# vem logado na sua conta e com o OCI CLI pronto (nenhuma senha necessária).
#
# COMO USAR (no Cloud Shell — o ícone  >_  no topo do console Oracle):
#   curl -fsSL https://raw.githubusercontent.com/GustavoAgrico/riseflow-app/master/riseframe/deploy/oracle-retry.sh | bash
#
# Ele descobre sozinho: compartimento, domínio de disponibilidade, imagem do
# Ubuntu 22.04 (ARM) e a sua sub-rede. Gera uma chave SSH se você não tiver.
# Depois tenta criar a máquina em loop; quando conseguir, mostra o IP público.
#
# Ajustes opcionais (antes do comando, na MESMA linha):
#   OCPUS=1 MEM=6   → pede uma máquina menor (mais fácil de conseguir vaga)
#   OCPUS=4 MEM=24  → o máximo do plano grátis (mais difícil de conseguir)
#   INTERVAL=30     → tenta a cada 30s (padrão 60s)
# Ex.:  ... | OCPUS=1 MEM=6 bash
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

OCPUS="${OCPUS:-2}"
MEM="${MEM:-12}"
INTERVAL="${INTERVAL:-60}"
NAME="${NAME:-riseframe}"

say()  { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m*** ERRO: %s ***\033[0m\n' "$*"; exit 1; }

command -v oci >/dev/null 2>&1 || die "Rode isto no ORACLE CLOUD SHELL (lá o 'oci' já vem instalado)."

say "1/4 · Descobrindo a sua conta e a região…"
# No Cloud Shell o OCID da conta (tenancy) vem numa variável de ambiente.
TENANCY="${OCI_TENANCY:-$(oci iam compartment list --query 'data[0]."compartment-id"' --raw-output 2>/dev/null)}"
[ -n "${TENANCY:-}" ] || die "não consegui identificar sua conta (tenancy). Confirme que está no Cloud Shell."
COMPARTMENT="${COMPARTMENT:-$TENANCY}"   # conta nova → recursos no compartimento raiz

AD="$(oci iam availability-domain list --query 'data[0].name' --raw-output 2>/dev/null)"
[ -n "${AD:-}" ] || die "não consegui listar o domínio de disponibilidade."

say "2/4 · Achando a imagem do Ubuntu 22.04 (ARM) e a sua sub-rede…"
IMAGE="$(oci compute image list -c "$COMPARTMENT" \
  --operating-system "Canonical Ubuntu" --operating-system-version "22.04" \
  --shape "VM.Standard.A1.Flex" --sort-by TIMECREATED \
  --query 'data[0].id' --raw-output 2>/dev/null)"
[ -n "${IMAGE:-}" ] || die "não achei a imagem do Ubuntu 22.04 para ARM."

# Sub-rede PÚBLICA (aceita IP público). Com várias redes na conta, pega a primeira
# pública; para forçar uma específica: SUBNET=ocid1.subnet... antes do bash.
if [ -z "${SUBNET:-}" ]; then
  SUBNET="$(oci network subnet list -c "$COMPARTMENT" --all \
    --query 'data[?"prohibit-public-ip-on-vnic"==`false`].id | [0]' --raw-output 2>/dev/null)"
fi
if [ -z "${SUBNET:-}" ] || [ "$SUBNET" = "null" ]; then
  die "nenhuma sub-rede/VCN encontrada. Abra Menu → Networking → Virtual Cloud Networks e crie uma VCN (botão 'Start VCN Wizard' → 'VCN with Internet Connectivity'). Depois rode este comando de novo."
fi

SUBNET_NAME="$(oci network subnet get --subnet-id "$SUBNET" --query 'data."display-name"' --raw-output 2>/dev/null)"
echo "     Sub-rede: ${SUBNET_NAME:-$SUBNET}  (libere as portas 80/443 na Security List desta rede)"

say "3/4 · Preparando a chave SSH (como você vai entrar na máquina)…"
KEY="$HOME/.ssh/${NAME}"
if [ ! -f "${KEY}.pub" ]; then
  mkdir -p "$HOME/.ssh"
  ssh-keygen -t rsa -b 2048 -f "$KEY" -N "" -q
  say "   Chave criada. GUARDE a chave privada abaixo (é o que abre a máquina):"
  echo "   → arquivo: ${KEY}   (baixe pelo menu do Cloud Shell: ⋮ → Download → ${NAME})"
fi

say "4/4 · Tentando criar a máquina VM.Standard.A1.Flex (${OCPUS} núcleos / ${MEM} GB)…"
echo "     Domínio: $AD · a cada ${INTERVAL}s · Ctrl+C para parar."
echo "     Dica: se demorar muito, pare e rode com  OCPUS=1 MEM=6  (vaga mais fácil)."

ATTEMPT=0
while true; do
  ATTEMPT=$((ATTEMPT + 1))
  printf '\n\033[2m[%s] tentativa %d…\033[0m\n' "$(date +%H:%M:%S)" "$ATTEMPT"
  OUT="$(oci compute instance launch \
    --compartment-id "$COMPARTMENT" \
    --availability-domain "$AD" \
    --shape "VM.Standard.A1.Flex" \
    --shape-config "{\"ocpus\":${OCPUS},\"memoryInGBs\":${MEM}}" \
    --image-id "$IMAGE" \
    --subnet-id "$SUBNET" \
    --assign-public-ip true \
    --display-name "$NAME" \
    --ssh-authorized-keys-file "${KEY}.pub" \
    --wait-for-state RUNNING 2>&1)"
  RC=$?
  if [ $RC -eq 0 ]; then
    say "✅ MÁQUINA CRIADA! Buscando o IP público…"
    sleep 5
    INSTANCE_ID="$(printf '%s' "$OUT" | grep -oE 'ocid1\.instance[.a-z0-9-]+' | head -1)"
    IP="$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" \
      --query 'data[0]."public-ip"' --raw-output 2>/dev/null)"
    echo ""
    echo "   IP PÚBLICO: ${IP:-veja no console → Compute → Instances}"
    echo "   Usuário SSH: ubuntu   ·   chave: ${KEY}"
    echo ""
    say "Pronto! Me manda o IP público que a gente segue pro próximo passo (abrir as portas + subir o Riseframe)."
    break
  fi
  if printf '%s' "$OUT" | grep -qiE 'capacity|out of host|too many requests|429'; then
    warn "   sem capacidade agora — tento de novo em ${INTERVAL}s (deixe rodando)."
    sleep "$INTERVAL"
  elif printf '%s' "$OUT" | grep -qiE 'LimitExceeded|quota'; then
    die "limite do plano grátis atingido: você já tem máquinas ARM usando toda a cota (4 núcleos/24 GB). Apague uma instância antiga ou peça menos núcleos (OCPUS=1 MEM=6)."
  else
    printf '%s\n' "$OUT"
    die "erro diferente de capacidade (veja a mensagem acima). Me mande esse texto que eu te ajudo."
  fi
done
