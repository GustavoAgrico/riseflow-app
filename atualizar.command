#!/bin/bash
# Atualiza e roda o Riseframe no macOS (equivalente do atualizar.bat do Windows).
# Dois cliques neste arquivo. Requer: Node.js e git instalados.
cd "$(dirname "$0")" || exit 1

# Se este arquivo estiver DENTRO da pasta "riseframe", sobe um nível.
if [ -d "web" ] && [ -d "server" ] && [ -f "package.json" ]; then cd ..; fi

if [ ! -f "riseframe/package.json" ]; then
  echo ""
  echo "*** Nao encontrei a pasta do projeto. ***"
  echo "Coloque este arquivo na pasta do projeto (a que contem a pasta 'riseframe') e tente de novo."
  echo ""
  read -n1 -r -p "Pressione qualquer tecla para fechar..."
  exit 1
fi

echo "=========================================="
echo "   ATUALIZANDO O RISEFRAME (Mac)"
echo "=========================================="
echo ""

echo "[1/5] Encerrando servidor anterior (porta 4000)..."
lsof -ti tcp:4000 2>/dev/null | xargs kill -9 2>/dev/null

echo "[2/5] Baixando a versao mais nova..."
git fetch origin master || { echo ""; echo "*** ERRO no download. Tire um print e me mande. ***"; read -n1 -r; exit 1; }
git checkout -- . 2>/dev/null
git reset --hard origin/master || { echo ""; echo "*** ERRO ao aplicar a versao nova. ***"; read -n1 -r; exit 1; }

cd riseframe || exit 1

echo ""
echo "[3/5] Instalando dependencias..."
npm install || { echo ""; echo "*** ERRO no npm install (Node esta instalado?). ***"; read -n1 -r; exit 1; }

echo ""
echo "[4/5] Reconstruindo o app..."
npm run build || { echo ""; echo "*** ERRO no build. Tire um print e me mande. ***"; read -n1 -r; exit 1; }

echo ""
echo "[5/5] Iniciando o servidor... (aguarde a linha 'Riseframe vXX rodando')"
lsof -ti tcp:4000 2>/dev/null | xargs kill -9 2>/dev/null
echo ""
echo "=========================================="
echo "   Abra no navegador:  http://localhost:4000"
echo "   NAO feche esta janela enquanto estiver usando."
echo "=========================================="
echo ""
npm run start

echo ""
echo "(O servidor foi encerrado.)"
read -n1 -r -p "Pressione qualquer tecla para fechar..."
