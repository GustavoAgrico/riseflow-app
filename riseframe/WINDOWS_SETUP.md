# Riseframe Desktop — Setup Windows

## ⚙️ Preparação

### 1. Instalar Requisitos

**Node.js ≥20**
```powershell
# Verificar versão
node --version   # deve ser v20+
```
Se não tiver, baixe de https://nodejs.org

**FFmpeg**
```powershell
# Opção 1: Chocolatey (recomendado)
choco install ffmpeg

# Opção 2: Baixar manualmente
# https://ffmpeg.org/download.html
# Extrair e adicionar ao PATH
```

**Python ≥3.8** (para Whisper)
```powershell
# Instalar de https://python.org
# Marcar "Add Python to PATH"
```

### 2. Clonar e Instalar

```powershell
cd "D:\Rise Creative\riseframe-app\riseframe"

# Instalar dependências (pode demorar 5-10 min)
npm install
npm --workspace server install
npm --workspace web install
```

## 🚀 Rodando Localmente

### Opção 1: Apenas Web + Server (Recomendado para teste)

```powershell
npm run dev
```

Abre dois serviços:
- **Server:** http://localhost:4000
- **Web:** http://localhost:5174

Clique em http://localhost:5174 no navegador.

### Opção 2: Com Electron (Desktop App)

Depois que tiver tudo testado:

```powershell
# Terminal 1
npm run dev:server

# Terminal 2  
npm run dev:web

# Terminal 3
npm run dev:electron
```

Ou em um terminal (precisa de `concurrently`):
```powershell
npm run dev:all
```

## 🔨 Build do Instalador

Quando estiver pronto para distribuir:

```powershell
# Build automático (cria .exe)
.\build-desktop.bat

# Ou manual
npm run build
npm run build:desktop
```

Gera: `dist\builds\Riseframe-0.1.0.exe`

## 🐛 Troubleshooting

### Erro: "FFmpeg não encontrado"

```powershell
# Verificar
ffmpeg -version

# Se não funcionar, instale novamente
choco install ffmpeg --force

# Reinicie PowerShell depois
```

### Erro: "Python não encontrado" (ao transcrever)

```powershell
# Verificar
python --version

# Se não funcionar
# Instale de https://python.org
# Marque "Add Python to PATH"
# Reinicie PowerShell
```

### Erro: "Porta 3333 já em uso"

Matando o processo:
```powershell
# Encontrar processo na porta 3333
netstat -ano | findstr :3333

# Matar processo (exemplo, PID 1234)
taskkill /PID 1234 /F
```

### App lenta na primeira execução

Normal! Whisper está baixando o modelo (~140MB). Depois fica rápido.

## 📁 Dados Salvos

```
C:\Users\<seu-usuario>\AppData\Local\Riseframe\riseframe-data\
├── riseframe.db          # SQLite com dados
├── uploads/              # Vídeos enviados
├── outputs/              # Vídeos processados
└── work/                 # Arquivos temporários
```

Para limpar tudo:
```powershell
rmdir "$env:APPDATA\..\Local\Riseframe" -Force -Recurse
```

## 📝 Variáveis de Ambiente

Crie `server\.env`:

```
NODE_ENV=development
PORT=3333
CORS_ORIGIN=http://localhost:5174,http://localhost:3000
WHISPER_MODEL=base
TRANSCRIBE_PROVIDER=whisper-local
DEBUG=false
```

## ✅ Checklist Antes de Build

- [ ] `node --version` mostra v20+
- [ ] `ffmpeg -version` funciona
- [ ] `python --version` funciona
- [ ] `npm run dev` abre sem erros
- [ ] Pode fazer upload de vídeo
- [ ] Transcrição funciona
- [ ] Vídeo final pode ser baixado

---

**Dúvidas?** Verifique [DESKTOP_SETUP.md](./DESKTOP_SETUP.md)
