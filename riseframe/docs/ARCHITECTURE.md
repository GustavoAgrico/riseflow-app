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
| 3 | `analyze.js` | temas (frequência) + momentos de B-roll | heurística |
| 4 | `silence.js` | `silencedetect` → segmentos de fala → trim+concat | real |
| 5 | `broll.js` | busca Pexels + overlay em tela cheia nas janelas | pluggable (Pexels) |
| 6 | `captions.js` | gera `.ass` palavra-a-palavra + burn-in (libass) | real |
| 7 | `color.js` | look cinematográfico (curves/eq/colorbalance/LUT) | real |
| 8 | `render.js` | reframe (crop central) + encode web-ready | real |

Cada etapa transformadora escreve um MP4 intermediário em `data/work/<jobId>/` e
passa o caminho adiante. Ao final, os intermediários são apagados; ficam o upload
original (`data/uploads/`) e o render (`data/outputs/<jobId>.mp4`).

### Corte de silêncios

`silencedetect=noise=<dB>:d=<seg>` emite pares `silence_start`/`silence_end`. A partir
deles calculamos os **segmentos de fala** a manter (com uma folga configurável em
torno de cada corte, para não "comer" o início/fim das palavras), unimos segmentos
adjacentes e remontamos num único passe `filter_complex` com `trim`/`atrim` +
`concat` (corte frame-accurate, sem depender do demuxer concat).

### Legendas dinâmicas

`captions.js` gera um arquivo ASS (Advanced SubStation). Dois modos:

- **karaoke** — a frase inteira aparece e a palavra corrente é destacada na cor de
  acento (laranja `#FF6B35` ou roxo `#7C3AED`).
- **word** — uma palavra grande por vez, com um leve "pop" (`\t` animando `\fscx`).

Tamanho de fonte, contorno e sombra escalam com a resolução (`PlayResX/Y`). O burn-in
usa `-vf subtitles=` (libass + fontconfig). Fonte padrão: DejaVu Sans (presente no
ambiente); configurável.

### <a name="b-roll"></a>B-roll (licença)

Só a **API do Pexels** (licença livre). `broll.js` busca um clipe por momento,
baixa, escala/croppa para o quadro e sobrepõe **apenas** durante a janela
(`overlay=enable='between(t,s,e)'`, com offset de PTS para o clipe começar do zero na
janela). **Nunca** baixa mídia da web aberta. Requer `PEXELS_API_KEY`; sem ela, a
etapa é pulada com elegância.

### Color grade

Looks são cadeias de filtros FFmpeg (`eq`, `colorbalance`, `unsharp`). O look-assinatura
`teal-orange` esfria as sombras e esquenta as altas — o "acabamento cinematográfico"
que o brief define como diferencial. Suporta também LUT `.cube` via `lut:<caminho>`
(`lut3d`), caminho natural para licenciar/importar looks profissionais na Fase 2.

## Transcrição pluggable (`transcribe/`)

`TRANSCRIBE_PROVIDER` seleciona:

- **mock** (default) — deriva regiões de fala do áudio e distribui palavras
  placeholder sincronizadas. Valida o pipeline de legendas de ponta a ponta **sem
  custo e sem chave**. Não é ASR real.
- **openai** — Whisper API (`verbose_json` + word timestamps).
- **deepgram** — nova-2 (words com tempo).
- **assemblyai** — upload → transcript → poll.
- **whisper-local** — `faster-whisper` via Python (CPU/int8), zero custo por minuto.

Se um provedor real falhar (chave inválida, rede), o job **cai para o mock** e reporta
o motivo no relatório — o pipeline nunca trava por causa da transcrição.

## Contrato da API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | status + capabilities |
| GET | `/api/options` | catálogo de escolhas para a UI |
| POST | `/api/jobs` | multipart `file` + `options` → cria job |
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
- `mock` não é transcrição real — configure um provedor para legendas fiéis.
- B-roll faz overlay em tela cheia; corte por cena/tema mais fino é evolução da Fase 2.
- Vulnerabilidades do `npm audit` são do **dev-server** do Vite/esbuild (não afetam o
  `dist/` estático servido em produção).
