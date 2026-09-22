# Riseframe Desktop — Guia de Setup e Build

## O que é

Riseframe Desktop é uma versão do editor de vídeo com IA que roda **100% localmente** na sua máquina — sem servidor remoto, sem conta, apenas você + seu vídeo.

- ✅ Edição de vídeo com corte de silêncio, legendas, B-roll, color grade
- ✅ Transcription com Whisper (local)
- ✅ Análise de conteúdo com Claude (opcional)
- ✅ Instalável em Windows, Mac, Linux
- ✅ Funciona offline (exceto se usar Claude remoto)

---

## Requisitos

### Obrigatório
- **Node.js** ≥20 (https://nodejs.org)
- **Python** ≥3.8 (para Whisper local)
- **FFmpeg** (áudio/vídeo):
  - **Windows:** `choco install ffmpeg` ou baixar de https://ffmpeg.org/download.html
  - **Mac:** `brew install ffmpeg`
  - **Linux:** `sudo apt-get install ffmpeg`

### Opcional
- **ANTHROPIC_API_KEY** (para análise com Claude ao invés de heurístico)

---

## Desenvolvimento Local

### 1. Instalar dependências
```bash
cd riseframe
npm install
npm --workspace server install
npm --workspace web install
```

### 2. Criar `.env` no `server/`
```bash
cp server/.env.example server/.env
```

Adicionar essas variáveis:
```
NODE_ENV=development
PORT=3333
CORS_ORIGIN=http://localhost:5174,http://localhost:3000
WHISPER_MODEL=base
TRANSCRIBE_PROVIDER=whisper-local
DEBUG=true
```

### 3. Rodando em desenvolvimento

**Terminal 1 — Servidor + Web + Electron:**
```bash
npm run dev
```

Isso inicia:
- Express server (port 3333)
- Vite dev server (port 5174)
- Electron (janela desktop)

**OU individualmente:**
```bash
npm run dev:server    # Terminal 1
npm run dev:web       # Terminal 2
npm run dev:electron  # Terminal 3 (precisa de Electron instalado)
```

---

## Build para Produção

### 1. Build da web
```bash
npm run build
```

Gera `web/dist/` com o código otimizado.

### 2. Build do instalador

**Windows (.exe):**
```bash
npm run build:desktop
```
Gera `dist/builds/Riseframe-X.X.X.exe`

**Mac (.dmg):**
```bash
npm run build:desktop
```
Gera `dist/builds/Riseframe-X.X.X.dmg`

**Linux (.AppImage):**
```bash
npm run build:desktop
```
Gera `dist/builds/Riseframe-X.X.X.AppImage`

---

## Estrutura de Arquivos

```
riseframe/
├── electron/
│   ├── main.js          ← Processo principal Electron
│   ├── preload.js       ← Bridge entre web e Electron
│   └── db.js            ← SQLite local para dados
├── web/                 ← Frontend React (mantém igual)
├── server/              ← Backend Node.js (roda como subprocess)
├── .env.desktop.example ← Template de configuração
└── electron-builder.yml ← Configuração de build
```

### Onde são salvos os dados?

**Windows:** `C:\Users\<seu-usuario>\AppData\Local\Riseframe\riseframe-data\`
**Mac:** `~/Library/Application Support/Riseframe/riseframe-data/`
**Linux:** `~/.config/Riseframe/riseframe-data/`

Dados incluem:
- `riseframe.db` — SQLite com configurações e histórico
- `uploads/` — vídeos e áudios enviados
- `outputs/` — vídeos processados
- `work/` — arquivos temporários

---

## Configuração Detalhada

### Whisper Local (Padrão)

**Modelos disponíveis:**
- `tiny` (39M) — ⚡ Rápido, menos preciso (~1min por 10min de vídeo)
- `base` (140M) — ⭐ Recomendado (~5min por 10min)
- `small` (244M) — 🎯 Bom balanço (~10min por 10min)
- `medium` (769M) — 🔍 Mais preciso (~20min por 10min)
- `large` (2.9G) — 🏆 Melhor qualidade (~40min por 10min)

**Primeira execução**
A primeira vez que você processa um vídeo, Whisper baixa o modelo (~140MB para `base`). Esse arquivo fica em cache local e é reutilizado.

**Configurar:**
```bash
# Em .env ou ao iniciar
WHISPER_MODEL=small
```

### Claude para Análise (Opcional)

Se você quer análise mais sofisticada (escolher B-roll melhor, limpar fala melhor), use Claude:

```bash
ANALYZE_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-proj-...
```

Sem isso, usa análise heurística (grátis, local).

### Aumentar Limite de Upload

Padrão: 512MB

```bash
MAX_UPLOAD_MB=1024  # 1GB
```

---

## Troubleshooting

### Erro: "FFmpeg não encontrado"
```bash
# Windows (com Chocolatey)
choco install ffmpeg

# Mac
brew install ffmpeg

# Linux
sudo apt-get install ffmpeg
```

### Erro: "Python não encontrado" (Whisper)
Instale Python 3.8+ de https://python.org

### Erro: "Porta 3333 já em uso"
A porta está ocupada por outro processo. Mude em `.env`:
```
PORT=3334
```

### Aplicação lenta na primeira execução
Normal! Whisper está baixando o modelo. Depois fica rápido.

### Como limpar dados locais?
Delete o diretório de dados:
- **Windows:** `C:\Users\<seu-usuario>\AppData\Local\Riseframe\`
- **Mac:** `~/Library/Application Support/Riseframe/`
- **Linux:** `~/.config/Riseframe/`

Ou pela app: Configurações → Limpar Dados

---

## Performance & Escalabilidade

### Atual (Render Free - para teste)
- CPU: Compartilhado (lento)
- RAM: 512MB
- Processamento: ~10min/10min de vídeo

### Desejado (seu computador)
- CPU: Dedicado
- RAM: 4GB+ (recomendado)
- Processamento: **2-3x mais rápido** que Render Free

### Se precisar escalar depois
Você pode voltar para a versão web (Render Paid) quando precisar de múltiplos usuários ou processamento em nuvem.

---

## Desenvolvimento Futuro

Melhorias planejadas:
- [ ] Suporte para GPU (CUDA/Metal) — 10-100x mais rápido
- [ ] Queue de jobs em background
- [ ] Integração com Google Drive / Dropbox
- [ ] Plugin system para custom effects
- [ ] Conversão automática de formatos

---

## Suporte

Problemas? Verifique:
1. `.env` está correto
2. FFmpeg está instalado: `ffmpeg -version`
3. Node.js versão ≥20: `node --version`
4. Logs: Abra Devtools (Ctrl+Shift+I)

---

**Versão:** v39  
**Última atualização:** 2026-09-22  
**Status:** Beta (pronto para teste)
