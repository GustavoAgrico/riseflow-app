# Riseframe

Editor de vídeo web com IA. A partir do upload de um vídeo bruto, o Riseframe entrega
automaticamente uma versão pronta: corta pausas, gera legendas dinâmicas, insere B-roll
de bancos gratuitos e aplica um ajuste de cor cinematográfico — tudo processado na nuvem.

Este repositório é o **MVP funcional** derivado do brief de produto. Ele implementa o
pipeline completo descrito no documento, com processamento **real** de vídeo via FFmpeg.

```
Upload → Transcrição → Análise (IA) → Corte de silêncios →
B-roll → Legendas dinâmicas → Color grade → Render final → Download
```

## O que está implementado (real, roda neste ambiente)

| Etapa | Status | Como |
|---|---|---|
| Upload pelo navegador | ✅ | `multipart/form-data` → disco |
| Sondagem de mídia (probe) | ✅ | `ffprobe` |
| Transcrição | 🔌 pluggable | `mock` (default), `openai`, `deepgram`, `assemblyai`, `whisper-local` |
| Análise por IA (temas/B-roll) | 🔌 pluggable | `heuristic` (default) ou LLM via API |
| Corte automático de silêncios | ✅ | `ffmpeg silencedetect` → trim + concat |
| B-roll automático | 🔌 pluggable | API do Pexels (grátis) — precisa de `PEXELS_API_KEY` |
| Legendas dinâmicas (palavra-a-palavra) | ✅ | geração de `.ass` + burn-in (`libass`) |
| Ajuste de cor cinematográfico | ✅ | filtros `curves`/`eq` + LUTs (looks) |
| Render final (encode) | ✅ | `libx264` + `aac` |
| Fila de jobs assíncrona | ✅ | worker em memória, 1 job por vez |

> **Nota honesta:** transcrição e B-roll de qualidade dependem de serviços externos
> (chaves de API) ou de um modelo Whisper local. Sem chaves, o sistema roda de ponta a
> ponta usando o provedor `mock` de transcrição e pulando o B-roll — assim você valida
> todo o encadeamento (corte + legendas + cor + render) sem custo. Veja `.env.example`.

## Rodando localmente

```bash
cd riseframe
npm install            # instala server + web (workspaces)
npm run dev            # server :4000 + web :5174
```

Abra http://localhost:5174, faça upload de um vídeo, escolha as opções e acompanhe o
pipeline em tempo real. O vídeo final fica disponível para download.

Sem nenhum vídeo à mão? Gere um clipe de teste:

```bash
npm run sample         # cria data/uploads/sample.mp4 (10s, testsrc + fala sintética)
```

## Estrutura

```
riseframe/
  server/   → Express + fila de jobs + pipeline FFmpeg  (porta 4000)
  web/      → SPA React (Vite)                           (porta 5174)
  data/     → uploads / outputs / arquivos de trabalho   (gitignored)
  docs/     → arquitetura e decisões
```

Veja `docs/ARCHITECTURE.md` para o detalhamento técnico e `docs/ROADMAP.md` para as fases.

## Configuração

Copie `server/.env.example` para `server/.env` e ajuste. Todas as chaves são opcionais —
o sistema degrada com elegância para provedores locais/mock quando faltam.

## Licença de mídia

O B-roll usa **apenas** a API do Pexels (licença livre). O sistema nunca baixa mídia da
web aberta. Ver `docs/ARCHITECTURE.md#b-roll`.
