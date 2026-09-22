#!/bin/bash
# Riseframe Desktop - Build Script

set -e

echo "🎬 Riseframe Desktop Build"
echo "=========================="

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale de https://nodejs.org"
    exit 1
fi

echo "✅ Node.js $(node --version)"

# Verificar FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg não encontrado. Instale:"
    echo "   Windows: choco install ffmpeg"
    echo "   Mac: brew install ffmpeg"
    echo "   Linux: sudo apt-get install ffmpeg"
    exit 1
fi

echo "✅ FFmpeg $(ffmpeg -version | head -n1)"

# Instalar dependências
echo ""
echo "📦 Instalando dependências..."
npm install
npm --workspace server install
npm --workspace web install

# Build web
echo ""
echo "🔨 Buildando web..."
npm run build

# Build desktop
echo ""
echo "🖥️  Buildando aplicativo desktop..."
npm run build:desktop

echo ""
echo "✅ Build completo!"
echo ""
echo "Arquivos em: dist/builds/"
ls -lh dist/builds/ | grep -E "\.(exe|dmg|AppImage|deb)$" || echo "Nenhum arquivo encontrado"
