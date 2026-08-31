# Arquitetura — Riseframe MVP

Este documento detalha como o MVP implementa o pipeline do brief de produto.

## Visão geral

```
┌────────────┐      HTTP/SSE      ┌──────────────────────────────┐
│  web (SPA) │ ───────────────▶  │  server (Express + fila)     │
│  React/Vite│ ◀───────────────  │  worker único → pipeline     │
└────────────┘   progresso       └──────────────┬───────────────┘
   :5174                                          │ spawn
                                                  ▼
                                        ┌──────────────────┐
                                        │  ffmpeg-static   │  (corte, legendas,
                                        │  ffprobe-static  │   grade, encode)
                                        └──────────────────┘
```

- **Sem GPU necessária:** todo o processamento usa `libx264` (CPU). Em produção com
  volume, trocar por encoder acelerado (NVENC/QSV) é uma mudança de flags, não de
  arquitetura.
- **Um job por vez:** o worker processa serialmente (modelo "sob demanda" do brief).
  Para escalar, a fila em memória vira uma fila real (BullMQ/Redis) e o worker vira
  um pool de máquinas — sem mudar as etapas.

## O pipeline (`server/src/pipeline/`)

Orquestrado por `pipeline/index.js`, que monta um **plano ponderado** de etapas
(etapas desligadas nas opções são removidas e o peso é redistribuído) e emite
progresso normalizado 0–100 durante toda a execução.

| Ordem | Módulo | O que faz | Real / Pluggable |
|---|---|---|---|
| 1 | `ffmpeg.js` `probeSummary` | duração, fps, resolução, streams | real (ffprobe) |
| 2 | `transcribe/` | fala → texto com timestamps de palavra | pluggable |
| 3 | `timeline.js` + `silence.js` | corte unificado (silêncio + edição por texto) + **remap** | real |
| 4 | `analyze.js` | temas (frequência) + momentos de B-roll | heurística |
| 5 | `broll.js` | busca Pexels + overlay em tela cheia nas janelas | pluggable (Pexels) |
| 6 | `captions.js` | gera `.ass` palavra-a-palavra + burn-in (libass) | real |
| 7 | `color.js` | look cinematográfico (curves/eq/colorbalance/LUT) | real |
| 8 | `render.js` | reframe (crop central) + encode web-ready | real |

Cada etapa transformadora escreve um MP4 intermediário em `data/work/<jobId>/` e
passa o caminho adiante. Ao final, os intermediários são apagados; ficam o upload
original (`data/uploads/`) e o render (`data/outputs/<jobId>.mp4`).

### Modos de job

O mesmo pipeline roda em três modos (campo `mode` do job):

- **auto** — pipeline completo automático (o fluxo padrão).
- **transcribe** — sonda + transcreve e **para**, devolvendo a transcrição; o upload
  é preservado para reuso. É a primeira metade do editor de transcrição.
- **render** — reusa o upload de um job `transcribe` e aplica a **transcrição editada**
  pelo cliente (palavras marcadas como `removed`), seguindo com o restante do pipeline.
- **clips** — sonda + transcreve + gera **vários clipes curtos** (`clips.js`): encontra
  os melhores trechos e produz um MP4 por clipe (ver abaixo).

### Geração de clipes curtos (`clips.js`)

`findHighlights` particiona a transcrição em janelas naturais (quebra numa pausa
grande ou ao atingir o comprimento-alvo, entre `clipMin`–`clipMax`s) e **pontua** cada
uma por sinais de engajamento: densidade de fala (palavras/s), densidade de informação
(palavras únicas/s), palavras-gancho, presença de pergunta/número e encaixe de duração
(ideal 20–45s). Pega as `clipsCount` melhores. (Camada por IA opcional: mesma
infraestrutura de `analyzeLLM`.)

Para cada janela, `generateClips` monta um clipe **reutilizando os módulos do
pipeline**: corta a fonte (`remuxByKeepSegments`), **remapeia a transcrição** para o
tempo local (`remapTranscript`), queima legendas, aplica o **grade por IA** e faz
**reframe** (9:16 por padrão). Cada clipe vira `outputs/<jobId>_clip<N>.mp4`, baixável
em `/api/jobs/:id/clips/:index/download`.

### Corte unificado + remapeamento de timeline (`timeline.js`)

Silêncio e edição por texto convergem num único mecanismo: cada fonte produz **faixas
a remover**, que são unidas e subtraídas de `[0, duração]` para gerar os segmentos a
manter. `remuxByKeepSegments` remonta o vídeo num único passe `filter_complex`
(`trim`/`atrim` + `concat`, frame-accurate).

- `silence.js` expõe `silenceRemovalRanges` (silêncios com folga aplicada).
- A edição por texto vira faixas a partir das palavras `removed`.

Após qualquer corte, `remapTranscript` **reposiciona os timestamps** da transcrição
para a nova timeline (descartando palavras removidas/cortadas). Isso mantém as
**legendas sincronizadas** — antes desta unificação, as legendas eram queimadas com os
tempos originais e desalinhavam depois do corte.

### Legendas dinâmicas

`captions.js` gera um arquivo ASS (Advanced SubStation). Dois modos:

- **karaoke** — a frase inteira aparece e a palavra corrente é destacada na cor de
  acento (laranja `#FF6B35` ou roxo `#7C3AED`).
- **word** — uma palavra grande por vez, com um leve "pop" (`\t` animando `\fscx`).

Tamanho de fonte, contorno e sombra escalam com a resolução (`PlayResX/Y`). O burn-in
usa `-vf subtitles=` (libass + fontconfig). Fonte padrão: DejaVu Sans (presente no
ambiente); configurável.

### <a name="b-roll"></a>B-roll (seleção + licença)

A **seleção de momentos** (`analyze.js`) é feita por cena, não por relógio:
- keyword extraída do **texto do próprio segmento** (a mais saliente; prioriza temas
  fortes), traduzida **pt→EN** (o Pexels é indexado em inglês) por um mini-dicionário;
- momentos **espaçados** (`brollEverySec`/`brollMinGap`), **sem repetir** a query em
  sequência, **sem cobrir a introdução** (`brollSkipIntro`) e limitados por `brollMax`.
- **Opcional por IA:** com `ANALYZE_PROVIDER=anthropic|openai` + chave, um LLM lê a
  transcrição e devolve `{themes, brollMoments:[{start,end,query}]}` com queries em
  inglês (`analyzeLLM.js`, Claude via SDK oficial / OpenAI via HTTP). Falha/sem chave
  → cai para a heurística.

A **inserção** (`broll.js`) usa só a **API do Pexels** (licença livre): para cada
momento busca vídeos, **deduplica** por id entre momentos, escolhe o arquivo cuja
**resolução** mais se aproxima do quadro (sem baixar 4K à toa), escala/croppa e
sobrepõe **apenas** durante a janela (`overlay=enable='between(t,s,e)'`, com offset de
PTS para o clipe começar do zero). **Nunca** baixa mídia da web aberta. Sem
`PEXELS_API_KEY`, a etapa é pulada com elegância.

### Color grade

Três modos:
- **`auto` (default) — grade por IA (`autoColor.js`).** Amostra frames do vídeo
  (ffmpeg → rgb24 reduzido), calcula estatísticas globais (médias R/G/B, luminância,
  contraste=desvio-padrão, saturação, frações de sombra/alta, viés quente-frio) e a
  partir delas **computa** a correção e o look:
  - **balanço de branco** (gray-world parcial, travado em ±15%) via `colorchannelmixer`;
  - **exposição/contraste/saturação/gamma** via `eq`, mirando alvos (luma ~118,
    saturação ~0.32) e levantando sombras quando a imagem é escura;
  - **look** escolhido pelo conteúdo (teal-orange p/ cenas quentes, balanced-cool p/
    frias, moody p/ baixa luz) via `colorbalance` + `unsharp`.
  Os ajustes calculados vão no relatório (`report.color.ai`) e aparecem na UI. É o
  "ajuste de cor por IA" do brief — decisão guiada por análise, não preset fixo.
- **presets fixos** (`teal-orange`, `warm`, `cold`, `vibrant`, `moody`, `clean`) —
  cadeias `eq`/`colorbalance`/`unsharp`.
- **LUT `.cube`** via `lut:<caminho>` (`lut3d`), para licenciar/importar looks
  profissionais.

## Transcrição pluggable (`transcribe/`)

`TRANSCRIBE_PROVIDER` seleciona:

- **whisper-local** (default) — `faster-whisper` via Python (CPU/int8), **ASR real**
  com custo ~zero por minuto. O modelo (`WHISPER_MODEL`=tiny|base|small|medium) é
  baixado do HuggingFace no 1º uso e fica em cache; no Docker é pré-baixado no build.
  Um autoteste na inicialização (`whisperLocalAvailable`) reflete a prontidão no
  `/api/health`.
- **openai** — Whisper API (`verbose_json` + word timestamps).
- **deepgram** — nova-2 (words com tempo).
- **assemblyai** — upload → transcript → poll.
- **mock** — deriva regiões de fala do áudio e distribui palavras placeholder
  sincronizadas. Valida o pipeline **sem custo e sem dependências**. Não é ASR real.

Se um provedor real falhar (modelo ausente, chave inválida, rede), o job **cai para o
mock** e reporta o motivo no relatório — o pipeline nunca trava por causa da
transcrição. É por isso que `whisper-local` pode ser o default com segurança: em um
ambiente sem Python/modelo, a saída degrada para `mock` em vez de quebrar.

> **Nota de validação:** neste repositório, a política de egress bloqueia o
> `huggingface.co`, então o download do modelo não pôde ser exercitado aqui — apenas o
> caminho de fallback (whisper-local → mock) foi validado. Em um ambiente com rede
> aberta ao HuggingFace (ou com o modelo pré-baixado no Docker), a ASR real roda.

## Contrato da API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | status + capabilities |
| GET | `/api/options` | catálogo de escolhas para a UI |
| POST | `/api/jobs` | multipart `file` + `options` → job automático |
| POST | `/api/transcribe` | multipart `file` → transcreve e para (editor) |
| POST | `/api/render` | JSON `sourceId` + `editedTranscript` + `options` → aplica a edição por texto |
| POST | `/api/clips` | multipart `file` → gera vários clipes curtos |
| GET | `/api/jobs/:id/clips/:i/preview` · `/download` | preview/baixa um clipe |
| GET | `/api/jobs` | lista jobs |
| GET | `/api/jobs/:id` | status de um job |
| GET | `/api/jobs/:id/events` | **SSE** de progresso em tempo real |
| GET | `/api/jobs/:id/preview` | stream inline (para `<video>`) |
| GET | `/api/jobs/:id/download` | download do render final |

## Custo (mapeado ao brief §7)

O modelo de custo do brief se materializa aqui: **render** e **transcrição (API)**
dominam. Com `TRANSCRIBE_PROVIDER=whisper-local` + encode FFmpeg próprio, o custo
marginal por vídeo cai para basicamente energia/tempo de CPU — exatamente a alavanca
de "derrubar custo" descrita no documento.

## Limitações conhecidas (MVP honesto)

- Encoder é CPU (`libx264`); vídeos longos são lentos sem aceleração de hardware.
- Fila em memória: reiniciar o servidor perde jobs em andamento (não os renders já
  salvos). Para produção, usar fila persistente.
- `whisper-local` (default) precisa de Python + `faster-whisper` e do download do
  modelo no 1º uso; sem isso, degrada para `mock` (não trava, mas as legendas ficam
  placeholder). Modelos maiores (small/medium) melhoram a acurácia e custam mais CPU.
- B-roll faz overlay em tela cheia; corte por cena/tema mais fino é evolução da Fase 2.
- Vulnerabilidades do `npm audit` são do **dev-server** do Vite/esbuild (não afetam o
  `dist/` estático servido em produção).
