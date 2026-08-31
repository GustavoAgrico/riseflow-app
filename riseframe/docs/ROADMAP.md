# Roadmap — Riseframe

Mapeamento entre o que o brief pede (por fase) e o que este repositório já entrega.

## Fase MVP — validar o encadeamento ✅ (implementado)

| Item do brief | Status |
|---|---|
| Upload de vídeo pelo navegador | ✅ |
| Transcrição automática | ✅ (pluggable; mock por padrão, ASR real via chave) |
| Corte automático de pausas/silêncios (com ajuste de sensibilidade) | ✅ |
| Legendas dinâmicas (palavra-a-palavra, editáveis) | ✅ render; edição textual → Fase 2 |
| Exportação do vídeo final | ✅ |

## Fase 2 — diferenciação 🔨 (base pronta, refinar)

| Item do brief | Status |
|---|---|
| **Ajuste de cor por IA** (correção + look cinematográfico) | ✅ look `auto` (default): analisa frames (balanço de branco, exposição, contraste, saturação, sombras/altas) e **calcula** correção + look cinematográfico específico do vídeo; presets fixos e LUT `.cube` seguem disponíveis |
| **B-roll automático** via Pexels | ✅ refinado: keyword por contexto, tradução pt→EN, timing por cena (espaçamento/limite/sem intro), clipes deduplicados e encaixe por resolução; **análise por IA opcional** (Claude/OpenAI) escolhe momentos+queries |
| Reconhecimento de tema e segmentação por trecho | 🔨 temas por frequência + keyword por segmento; análise por IA (LLM) quando configurada |
| **Edição por texto** (editar o vídeo editando a transcrição) | ✅ transcreve → edita (clique remove palavra/frase, duplo-clique edita texto) → render aplica os cortes com **remapeamento de timeline** (legendas sincronizadas) |

## Fase 3 — escala ⬜

| Item do brief | Status |
|---|---|
| Geração de clipes curtos a partir de vídeo longo | ✅ modo `clips`: encontra os melhores trechos (heurística de engajamento: densidade de fala/informação, ganchos, encaixe de duração) e gera N clipes curtos, cada um com corte + legendas remapeadas + grade por IA + reframe 9:16 |
| Reframe automático (16:9 → 9:16) | 🔨 reframe por crop central existe; falta tracking do sujeito |
| Bibliotecas de "looks" e templates de legenda | 🔨 3 presets de legenda + 6 looks; virar biblioteca navegável |
| Colaboração / equipes | ⬜ (exige auth + multi-tenant) |

## Próximos passos técnicos sugeridos

1. ~~**ASR real por padrão**~~ ✅ `whisper-local` é o default (faster-whisper, CPU,
   custo ~0), com fallback seguro para `mock`. Trocar para Deepgram/OpenAI é só uma
   variável de ambiente.
2. **Fila persistente** — trocar a fila em memória por BullMQ+Redis para sobreviver a
   restarts e permitir múltiplos workers.
3. **Encode acelerado** — NVENC/QSV quando houver GPU, cortando o maior custo variável.
4. ~~**Editor de transcrição**~~ ✅ entregue (editar vídeo = editar texto).
5. ~~**"Cor por IA"**~~ ✅ entregue — grade `auto` analisa frames e calcula
   correção + look por vídeo (`autoColor.js`). Evolução futura: gerar/licenciar LUTs.

## O que falta para virar produto (além de código)

Do próprio brief (§13): checar **marca/domínio/INPI** do nome Riseframe, publicar a
**landing de validação**, e medir demanda antes de investir em infra pesada. Este MVP
serve tanto para as edições manuais de prova de valor quanto como base do produto real.
