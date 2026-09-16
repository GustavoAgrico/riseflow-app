#!/bin/bash
# Atualiza e roda o Riseframe no macOS. Baixa o projeto sozinho (repositorio publico)
# na PRIMEIRA vez e atualiza nas proximas. Pode ficar em qualquer lugar (ex.: Downloads).
# Requer: git e Node.js instalados.
REPO_URL="https://github.com/GustavoAgrico/riseflow-app.git"
TARGET="$HOME/riseflow-app"

die() { echo ""; echo "*** ERRO: $1 ***"; echo ""; read -n1 -r -p "Pressione qualquer tecla para fechar..."; exit 1; }

echo "=========================================="
echo "   ATUALIZANDO O RISEFRAME (Mac)"
echo "=========================================="
echo ""

command -v git >/dev/null 2>&1 || die "git nao esta instalado. Instale o Xcode Command Line Tools: no Terminal rode  xcode-select --install"
command -v npm >/dev/null 2>&1 || die "Node.js nao esta instalado. Baixe em https://nodejs.org (versao LTS) e rode este arquivo de novo."

echo "[1/5] Encerrando servidor anterior (porta 4000)..."
lsof -ti tcp:4000 2>/dev/null | xargs kill -9 2>/dev/null

if [ -d "$TARGET/.git" ]; then
  echo "[2/5] Baixando a versao mais nova..."
  cd "$TARGET" || die "nao consegui entrar em $TARGET"
  git fetch origin master || die "falha ao baixar (sem internet?)"
  git checkout -- . 2>/dev/null
  git reset --hard origin/master || die "falha ao aplicar a versao nova"
else
  echo "[2/5] Primeira vez: baixando o Riseframe para $TARGET ..."
  rm -rf "$TARGET" 2>/dev/null
  git clone "$REPO_URL" "$TARGET" || die "falha ao baixar o projeto (sem internet?)"
  cd "$TARGET" || die "nao consegui entrar em $TARGET"
fi

cd riseframe || die "pasta 'riseframe' nao encontrada"

echo ""
echo "[3/5] Instalando dependencias... (pode demorar alguns minutos na 1a vez)"
npm install || die "npm install falhou"

echo ""
echo "[4/5] Reconstruindo o app..."
npm run build || die "build falhou"

echo ""
echo "[5/5] Iniciando o servidor... (aguarde a linha 'Riseframe vXX rodando')"
lsof -ti tcp:4000 2>/dev/null | xargs kill -9 2>/dev/null
echo ""
echo "=========================================="
echo "   Abra no navegador:  http://localhost:4000"
echo "   O app fica em: $TARGET"
echo "   NAO feche esta janela enquanto estiver usando."
echo "=========================================="
echo ""
npm run start

echo ""
echo "(O servidor foi encerrado.)"
read -n1 -r -p "Pressione qualquer tecla para fechar..."
