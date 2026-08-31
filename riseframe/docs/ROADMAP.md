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
| **Ajuste de cor por IA** (correção + look cinematográfico) | 🔨 looks + suporte a LUT `.cube`; falta o "por IA" (analisar o vídeo e escolher/gerar o look) |
| **B-roll automático** via Pexels | 🔨 busca + inserção funcionam; refinar seleção por cena/tema |
| Reconhecimento de tema e segmentação por trecho | 🔨 temas por frequência; evoluir para LLM + segmentação semântica |
| Edição por texto (editar o vídeo editando a transcrição) | ⬜ UI de transcript com corte por palavra |

## Fase 3 — escala ⬜

| Item do brief | Status |
|---|---|
| Geração de clipes curtos a partir de vídeo longo | ⬜ (análise já identifica momentos — base para o "highlight finder") |
| Reframe automático (16:9 → 9:16) | 🔨 reframe por crop central existe; falta tracking do sujeito |
| Bibliotecas de "looks" e templates de legenda | 🔨 3 presets de legenda + 6 looks; virar biblioteca navegável |
| Colaboração / equipes | ⬜ (exige auth + multi-tenant) |

## Próximos passos técnicos sugeridos

1. **ASR real por padrão em produção** — configurar `whisper-local` (custo marginal ~0)
   ou Deepgram/OpenAI (menos esforço). Já é só uma variável de ambiente.
2. **Fila persistente** — trocar a fila em memória por BullMQ+Redis para sobreviver a
   restarts e permitir múltiplos workers.
3. **Encode acelerado** — NVENC/QSV quando houver GPU, cortando o maior custo variável.
4. **Editor de transcrição** — a peça de UX que fecha a Fase 2 (editar vídeo = editar texto).
5. **"Cor por IA"** — pipeline que analisa amostras de frames e escolhe/gera o LUT,
   entregando o diferencial central do brief.

## O que falta para virar produto (além de código)

Do próprio brief (§13): checar **marca/domínio/INPI** do nome Riseframe, publicar a
**landing de validação**, e medir demanda antes de investir em infra pesada. Este MVP
serve tanto para as edições manuais de prova de valor quanto como base do produto real.
