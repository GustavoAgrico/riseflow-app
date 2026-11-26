# Plano — agentes reais, fases 1 e 2

Base: `docs/AGENTES_ARQUITETURA.md` (seções 3 a 5 e roteiro da seção 11) e a aba já pronta
(`docs/AGENTES_ABA_E_MASCOTES.md`). Este plano adapta a especificação ao código de hoje.
Status: plano aprovado. **Fase 1 implementada** (2026-11-24): `supabase/agents_core.sql`,
`server/agents/`, `server/routes/agents.js`, socket autenticado com sala por conta. Modelo:
Claude Opus 5.5 (`claude-opus-5-5`, esforço baixo, fallback do servidor da Anthropic ligado),
reserva OpenAI `gpt-4o-mini` e Groq `openai/gpt-oss-120b` (último recurso).
**Fase 2 implementada** (2026-11-24): `supabase/agents_tools.sql`, `server/agents/tools/`
(catálogo + executor), `server/agents/approvals.js`, `/api/approvals`. Diferença do plano: o
turno não fica pausado esperando a decisão — a ação de risco alto é guardada no pedido e
executada no "Aprovar"; o resultado aparece como mensagem de sistema na conversa. Também entrou
`schedule_meeting` e `get_goal_progress`. Push no celular continua pendente (aviso pelo sino).

## Ajustes da especificação à realidade do projeto

| Especificação | Hoje | Decisão |
|---|---|---|
| Servidor no Render | API e motores rodam na VM Oracle (pm2), Render é reserva com `ENGINES_ENABLED=false` | Worker no mesmo processo da API, ligado só onde `ENGINES_ENABLED != 'false'` |
| Transação: evento + fila + mensagem juntos | `supabase-js` não abre transação | Funções SQL (`agent_enqueue`, `agent_claim_next`, `agent_requeue_stale`) chamadas por RPC; a atomicidade fica no Postgres |
| Eventos `agent_*` na sala do usuário | Socket.io sem autenticação: todo `io.emit` chega a todos os navegadores | **Fase 1 inclui** autenticar o socket com o JWT do proxy e criar uma sala por conta (`user:<id>`). Eventos de agente só vão para a sala |
| Chaves de IA cifradas | `settings.openai_key` / `anthropic_key` em texto puro | Usar as chaves que já existem (mesmo caminho do `aiProvider.js`); cifrar fica como melhoria separada |
| Provedores com ferramentas | `aiProvider.js` só gera texto | Adaptadores novos com ferramentas nativas para Claude e OpenAI (REST, sem SDK novo). Gemini e Groq ficam para a fase 4 |
| Validação com zod | zod não está no projeto | Esquema JSON de cada ferramenta (o formato que os modelos já recebem) + validação simples no servidor |

## Fase 1 — Fundação

**Pronto quando:** uma mensagem mandada a um agente sobrevive a um reinício do servidor e é
respondida uma única vez, e a resposta só chega ao navegador da própria conta.

1. **Banco** — `supabase/agents_core.sql` (rodar manualmente):
   `agents`, `agent_threads`, `agent_events` (log append-only), `agent_messages`, `agent_queue`,
   `agent_runs`, todas com `user_id` e RLS; índice único parcial em
   `agent_queue (agent_id) where status = 'running'`; `idempotency_key` único em eventos e fila;
   funções `agent_enqueue`, `agent_claim_next` (`for update skip locked`) e `agent_requeue_stale`.
2. **Equipe padrão** — no primeiro `GET /api/agents` da conta, criar os 6 agentes da aba
   (Rizo comercial, Bia atendente, Pino prospecção, Tiki agenda, Topo metas, Dado relatórios),
   cada um com instruções da função. A aba sai do modo exemplo sozinha.
3. **Provedores** — `server/agents/providers/` com `claude.js` e `openai.js`, interface única
   `chat({ model, system, messages, tools })` → `{ text, toolCalls, usage, stopReason }` e troca
   automática (5xx, 429, timeout, chave inválida). Cadeia padrão: Claude (modelo atual mais leve)
   → OpenAI `gpt-4o-mini`, usando a chave do dono. Sem chave, o agente responde com um aviso de
   sistema apontando Configurações → API & Webhooks.
4. **Fila e worker** — `server/agents/queue.js` e `worker.js` (ciclo de 2 s): pega a próxima
   mensagem por RPC, monta contexto (instruções + últimas mensagens da thread), roda o turno,
   grava `agent_runs`, mensagem e evento; falha transitória volta com 10 s → 1 min → 5 min, 3
   tentativas; ao subir, devolve o que ficou `running` há mais de 10 min.
5. **Rotas** — `GET /api/agents`, `GET /api/agents/:id/messages`, `POST /api/agents/:id/messages`
   (com `idempotency_key` do cliente). Contrato igual à seção 5 da aba.
6. **Tempo real** — socket autenticado + sala por conta; eventos `agent_status` e
   `agent_message` só na sala. Os eventos atuais que vazam conteúdo entre contas
   (`transfer_notification`, `team_status`) entram na mesma sala.
7. **Testes (vitest)** — fila não duplica com a mesma chave; mensagem `running` antiga volta à
   fila; troca de provedor quando o primeiro falha; evento de agente não chega a outra conta.

## Fase 2 — Ferramentas e aprovações

**Pronto quando:** o agente cria uma tarefa sozinho, o Pino busca leads quando pedido, e
mandar WhatsApp ou ligar só acontece depois de aprovado no cartão "PEDE APROVAÇÃO".

1. **Catálogo** — `server/agents/tools/`, cada ferramenta com nome, descrição, esquema,
   risco (`baixo`/`médio`/`alto`) e `run(ctx, args)` presa ao tenant. Toda execução vira evento
   com argumentos e resultado.
2. **Ferramentas iniciais** (reaproveitando o que existe):

   | Ferramenta | Usa | Risco | Agentes |
   |---|---|---|---|
   | `search_contacts`, `list_tasks`, `list_pipeline`, `get_calendar` | `clients`, `crm_tasks`, `pipeline_stages`, `meetings` | baixo | todos |
   | `remember`, `search_memories` | `agent_memories` (busca de texto) | baixo | todos |
   | `create_task`, `move_pipeline_stage`, `create_note` | `server/crmActions.js` | médio | Rizo, Bia, Tiki |
   | `search_leads` | `server/leadSearch.js`, dentro do crédito grátis do Apify | médio | Pino |
   | `import_leads` | rota de importação da Prospecção | médio | Pino |
   | `queue_ai_call` | fila de ligação por IA | **alto** | Pino, Rizo |
   | `send_whatsapp` | envio atual do Chat | **alto** | Bia, Rizo |

3. **Aprovações** — tabela `agent_approvals` (no mesmo SQL), `GET /api/approvals`,
   `POST /api/approvals/:id/decision` (`approve`/`reject`). Política padrão por agente: baixo e
   médio rodam direto, alto pede aprovação; expira em 24 h. O turno pausa só naquele ponto;
   decidido, volta à fila com o resultado (ou o motivo da recusa). Aviso pelo socket e pelo sino
   (`notifications`); push no celular fica para depois.
4. **Testes** — ferramenta de outra conta é inacessível; ação de risco alto não roda sem
   aprovação; recusa volta ao modelo com o motivo; `search_leads` respeita o crédito grátis.

## Fora destas fases

Agente falando com agente (fase 3), Gemini e Groq e worker separado (fase 4), rotinas por cron e
nós de agente no construtor (fase 5), criar agente pela tela (fase 8).

## O que o dono precisa fazer

- Rodar `supabase/agents_core.sql` no Supabase ao fim da fase 1 (e a atualização da fase 2).
- Ter uma chave de IA (Claude ou OpenAI) em Configurações → API & Webhooks.
- Para o Pino buscar leads: `APIFY_TOKEN` no servidor.
