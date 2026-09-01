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
| Transcrição | 🔌 pluggable | **`whisper-local` (default, ASR real, CPU)**, `openai`, `deepgram`, `assemblyai`, `mock` |
| Análise por IA (temas/B-roll) | 🔌 pluggable | `heuristic` (default) ou LLM via API |
| Corte automático de silêncios | ✅ | `ffmpeg silencedetect` → trim + concat |
| B-roll automático | 🔌 pluggable | API do Pexels (grátis) — precisa de `PEXELS_API_KEY` |
| Legendas dinâmicas (palavra-a-palavra) | ✅ | geração de `.ass` + burn-in (`libass`) |
| Ajuste de cor cinematográfico | ✅ | filtros `curves`/`eq` + LUTs (looks) |
| Render final (encode) | ✅ | `libx264` + `aac` |
| **Editor de transcrição** (editar o vídeo editando o texto) | ✅ | transcreve → corta palavras/frases → render com remap de timeline |
| **Color grade por IA** | ✅ | analisa frames → calcula balanço de branco/exposição/contraste/saturação + look |
| **Clipes curtos** (highlight finder) | ✅ | acha os melhores trechos → N clipes com legendas + grade + reframe 9:16 |
| Fila de jobs assíncrona | ✅ | worker em memória, 1 job por vez |

> **Nota honesta:** a transcrição padrão é **`whisper-local`** — ASR real via
> `faster-whisper` em CPU, custo ~zero. Requer Python + `pip install -r
> server/requirements.txt`; o modelo é baixado do HuggingFace no 1º uso (ou pré-baixado
> no build Docker). Se o modelo/ambiente não estiver disponível, cada job **cai
> automaticamente para o modo `mock`** (nunca trava). B-roll de qualidade depende do
> Pexels (chave). Veja `server/.env.example`.

## Rodando localmente

```bash
cd riseframe
npm install                              # instala server + web (workspaces)
pip install -r server/requirements.txt   # transcrição local (whisper-local, default)
npm run dev                              # server :4000 + web :5174
```

Abra http://localhost:5174, faça upload de um vídeo, escolha as opções e acompanhe o
pipeline em tempo real. O vídeo final fica disponível para download.

> Sem Python/faster-whisper? Tudo funciona mesmo assim — a transcrição cai para o modo
> `mock`. Para pular a ASR de propósito, rode com `TRANSCRIBE_PROVIDER=mock`.

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

## Segurança (estado do MVP)

- **Sem auth por usuário.** O MVP não tem login/tenant — o acesso aos jobs é por
  **id não-adivinhável** (nanoid, capability URL). A listagem global de jobs **não** é
  exposta. Para travar a API, defina `API_TOKEN` (exige `Authorization: Bearer`). Um
  deploy **multiusuário** real precisa de login/isolamento por usuário — é pré-requisito
  antes de expor publicamente (alinhado a "colaboração/equipes" ser fase posterior).
- **Entrada validada.** `colorLook` é restrito a uma lista permitida (o caminho de LUT
  não é exposto ao cliente, evitando injeção no filtergraph do FFmpeg); todas as chamadas
  a ffmpeg/ffprobe/python usam argumentos em array (sem shell); caminhos de arquivo vêm
  de ids gerados no servidor (sem path traversal).
- **Limites.** Upload limitado por `MAX_UPLOAD_MB`; renders expiram por `OUTPUT_TTL_HOURS`;
  a fila em memória evita crescimento sem fim (limite de registros).

## Licença de mídia

O B-roll usa **apenas** a API do Pexels (licença livre). O sistema nunca baixa mídia da
web aberta. Ver `docs/ARCHITECTURE.md#b-roll`.
