# RiseFlow — Fase 0: auditoria e plano de execução

Data: 26/11/2026 · Base: `RiseFlow_Plano_Evolucao_Implementacao.md` (v1.0)

Este documento é o inventário pedido no item 1 do plano: o que existe hoje, com evidência, e a ordem proposta das próximas etapas. **Nenhuma mudança estrutural foi feita nesta fase.**

## 0. Adaptação da arquitetura do plano

O plano foi escrito para Lovable + Supabase + n8n. O RiseFlow real já tem uma base equivalente e funcional; a recomendação é **reaproveitar, não trocar**:

| No plano | No RiseFlow hoje | Decisão |
|---|---|---|
| Lovable (frontend) | Vite + React em Cloudflare Pages (`riseflow-app.pages.dev`) | manter |
| Supabase (Auth, Postgres, RLS, Storage) | Supabase `upcaknwpvnofirszehth` | manter |
| Edge Functions para webhooks e segredos | Servidor Express na VM Oracle (`167-234-229-1.sslip.io`, pm2) com todos os segredos | manter; equivale às Edge Functions |
| n8n (filas, retries, rotinas) | Motores no próprio servidor: campanhas, agendamentos, fila de ligações, worker dos agentes (fila no banco com retry/idempotência) | manter; n8n só se houver ganho claro |
| WhatsApp oficial | Duas vias: Baileys/QR (não oficial, em uso) e WhatsApp Cloud API (rotas existem) | evoluir a Cloud API |

## 1. Evidências coletadas

**Banco (contagem real com a chave do servidor, 26/11):** 49 tabelas de negócio existem. Linhas: `clients` 224 · `activity_logs` 389 · `messages` 99 · `agent_events` 55 · `agent_messages` 42 · `contacts` 23 · `crm_tasks` 20 · `conversations` 10 · `agents` 12 · `pipeline_stages` 9 · `notes` 8 · `notifications` 5 · `integrations` 4 · `usage` 4 · usuários no Auth: 4. Tabelas `organizations` e `billing` **não existem**.

**RLS (teste com a chave pública, sem login):** em todas as 49 tabelas o acesso anônimo vê **0 linhas**, inclusive onde há dados (ex.: 224 clientes) → leitura anônima bloqueada.

**Isolamento entre contas:** o PostgREST recusa o JWT do usuário; todo `supabase.from()` do navegador passa pelo proxy `/api/rest/v1` do servidor, que **força `user_id = conta do JWT`** em leitura e escrita (lista fechada `USER_TABLES`). As demais rotas filtram `user_id` manualmente. Ainda não existe teste automatizado "conta A tenta ler conta B".

**Testes automatizados:** 29 arquivos (vitest). Falha conhecida e pré-existente: `Sidebar.test.jsx` (correção em andamento em outra sessão).

**Operação:** servidor e WhatsApp online na VM; WhatsApp com 0 sessões (falta parear em `pages.dev`); app antigo no Render é legado.

## 2. Inventário por módulo

Legenda: ✅ funcional · 🟡 parcial · ❌ ausente · ⚠️ com falha

### 2.1 Dashboard — 🟡 parcial
- ✅ Período global, KPIs de vendas (receita ganha, conversão, pipeline, ticket) com comparação ao período anterior, funil de alcance, entrada de leads, saúde do funil, atividade de mensagens, canais, conversas ao vivo (`src/pages/Dashboard.jsx`, `src/lib/metrics.js`, `src/lib/pipelineStats.js`).
- ❌ Filtros por origem e responsável; ❌ "cada indicador abre a listagem"; ❌ tempo médio de 1ª resposta no Dashboard (existe só no Piloto de Vendas); ❌ desempenho por campanha/vendedor no Dashboard (existe no Monitor do time).

### 2.2 Prospecção — 🟡 parcial (avançou nesta semana)
- ✅ Busca Google Maps por segmento/localização com teto de custo no crédito grátis e aviso de crédito (`server/leadSearch.js`, `server/prospectingService.js`).
- ✅ Importação de lista CSV/colada, enriquecimento por site e CNPJ público (BrasilAPI) com proteção SSRF, classificação ICP Tier A/B/C — **implementado, ainda não publicado** (`src/pages/Prospecting.jsx`, `server/prospecting/enrich.js`, `src/lib/icp.js`, `src/lib/leadList.js`).
- ✅ Deduplicação por telefone normalizado na importação.
- ❌ Histórico de buscas com proveniência (consulta, provedor, custo, data) em tabela; ❌ dedupe por domínio; ❌ cancelamento de busca; ❌ filtros por presença digital/data de descoberta na lista salva.

### 2.3 Enriquecimento e lead scoring — 🟡 parcial
- ✅ Nota 0–100 explicável (motivos) e configurável (perfil de cliente ideal) na Prospecção; ✅ nota de intenção de compra nas conversas (Piloto de Vendas, `server/sales/intent.js`); ✅ qualificação por IA após ligação (`lead_scores`).
- ❌ Perfil ICP salvo na conta (hoje no navegador); ❌ histórico de pontuação com data/confiança unificado; faixas do plano (0–39/40–69/70–100) quase iguais às atuais (0–44/45–69/70+) — alinhar.

### 2.4 CRM e pipeline — 🟡 parcial
- ✅ Cadastro, Kanban, etapas configuráveis por conta (`pipeline_stages`), responsável, tags, notas, tarefas (`crm_tasks`), busca/filtros, exportação/importação CSV, painel ao vivo, projetos pós-venda.
- ❌ Motivo de perda; ❌ empresas associadas (empresa ≠ contato); ❌ histórico cronológico unificado por lead; ❌ valor estimado × valor fechado separados; ❌ consentimentos; etapas padrão do plano (Tentativa de contato, Reunião agendada, Nutrição) não existem por padrão.

### 2.5 WhatsApp oficial — 🟡 parcial
- ✅ Em uso: WhatsApp por QR (Baileys, multi-sessão por conta), recebimento/envio, mídia, histórico no pareamento (publicado 25/11), atribuição/transferência, notas internas, pausa da IA por conversa.
- 🟡 Cloud API oficial: rotas e webhook com verificação de assinatura existem (`server/routes/whatsappCloud.js`), sem onboarding guiado.
- ❌ Templates aprovados, janela de 24 h, opt-in/opt-out registrado, status de entrega vindo da Meta na inbox.

### 2.6 IA de atendimento e copiloto — 🟡 parcial
- ✅ Atendente IA por conversa com handoff/cessão para humano (`server/aiAttendant.js`), cadeia de provedores grátis primeiro, 6 agentes com ferramentas e aprovação para ações sensíveis, contexto da tela, ações sugeridas com confirmação.
- 🟡 Base de conhecimento: tabela `knowledge_base` existe (0 registros), sem upload/versionamento/indexação.
- ❌ Sugestão de resposta dentro do Chat (copiloto), resumo de conversa, controle de custo/consumo de IA por plano.

### 2.7 Automações — 🟡 parcial
- ✅ Construtor visual de fluxos (`/flows-novo`) + motor no servidor (gatilho por palavra-chave/agenda/tag, espera de resposta); campanhas e agendamentos.
- ❌ Gatilhos de CRM (mudança de etapa, tarefa vencida, venda ganha/perdida); ❌ logs por etapa, versionamento, reprocessamento. (Hoje: 0 fluxos cadastrados.)

### 2.8 Tarefas e agenda — ✅ funcional (com lacunas)
- ✅ Tarefas por lead, Hoje, Agenda com reuniões e feed iCal para Google Agenda.
- ❌ Lembrete de tarefa; visão semanal da agenda.

### 2.9 Relatórios — 🟡 parcial
- ✅ Relatórios, Analytics, Funil, Monitor do time, Piloto de Vendas (tempo de resposta).
- ❌ Definição formal de numerador/denominador por métrica; motivos de perda; custo por provedor.

### 2.10 Planos e cobrança — ⚠️ em espera
- 🟡 Tabela `usage` com limite de mensagens aplicado no backend só nas campanhas (`server/campaignEngine.js`); campos de plano protegidos no proxy.
- ⚠️ Cobrança em espera por decisão comercial (tabela `billing` inexistente; webhook a revisar).

### 2.11 Administração — ❌ ausente
- Existe só o dono da conta com equipe (cargos Admin/Supervisor/Atendente). Não há painel de plataforma (todas as organizações, consumo, falhas).

### Multi-tenancy (P0) — 🟡 parcial
- Modelo atual: **cada conta = o usuário dono** (`user_id`); membros entram por e-mail (`team_members`) e herdam o `user_id` do dono. Isolamento garantido pelo servidor (proxy + filtros). Não existem `organizations` / `organization_members` / `organization_id`.

### Segurança e LGPD — 🟡 parcial
- ✅ Segredos só no servidor; RLS bloqueia anônimo; webhooks Meta/WhatsApp Cloud com HMAC; webhook do WhatsApp com token; limites por hora em buscas, enriquecimento, IA e agentes; SSRF bloqueado no enriquecimento; backup do banco a cada 10 min (D1).
- ❌ Lista de supressão/opt-out global antes de campanhas; ❌ registro de consentimento; ❌ teste automatizado de isolamento entre contas; ❌ rate limit geral da API.

## 3. Riscos principais
1. **Isolamento depende do servidor** (não de RLS por organização). Seguro hoje, mas sem teste automatizado: uma rota nova que esqueça o filtro `user_id` vaza dados.
2. **Migração para `organization_id`** toca as 49 tabelas: precisa ser feita em passos (coluna nova preenchida = `user_id` do dono, depois troca das consultas), nunca de uma vez.
3. **WhatsApp não oficial (Baileys)** pode ser bloqueado pela Meta; a Cloud API oficial é o caminho para disparos e templates.
4. **Campanhas sem opt-out** — risco de LGPD e de bloqueio do número.

## 4. Plano de execução por etapas (pequenas, testáveis e reversíveis)

| Etapa | Prioridade | Entrega | Mudança no banco |
|---|---|---|---|
| **E0 — Estabilização** | P0 | Publicar a Prospecção (pronta), parear WhatsApp em `pages.dev`, mídia do WhatsApp na VM nova, Sidebar.test verde | nenhuma |
| **E1 — Prova de isolamento** | P0 | Teste automatizado conta A × conta B em todas as rotas e no proxy REST; lista única de tabelas por conta; auditoria de ações sensíveis em `activity_logs` | nenhuma |
| **E2 — Organizações (fundação)** | P0 | `organizations` + `organization_members` (papéis owner/admin/manager/agent/viewer) espelhando dono/equipe atuais; `organization_id` adicionado e preenchido sem mudar consultas | migração aditiva |
| **E3 — CRM completo** | P1 | Motivo de perda, valor estimado × fechado, linha do tempo por lead, empresas associadas, etapas padrão do plano como modelo opcional | migração aditiva |
| **E4 — Prospecção rastreável** | P1 | Histórico de buscas (consulta, provedor, custo, data), dedupe por domínio, cancelamento, perfil ICP salvo na conta | `lead_searches`, colunas |
| **E5 — WhatsApp oficial** | P1 | Onboarding Cloud API, templates, janela de 24 h, opt-in/opt-out e lista de supressão, status de entrega na inbox | `consents`, `message_templates` |
| **E6 — IA com base de conhecimento** | P2 | Cadastro/upload de conhecimento, respostas com fonte, copiloto no Chat (sugerir resposta, resumir), consumo de IA | usa `knowledge_base` |
| **E7 — Automações de CRM** | P2 | Gatilhos de etapa/tarefa/venda, logs por execução, retry e reprocessamento | `automation_runs` |
| **E8 — Relatórios** | P2 | Métricas com definição explícita, filtros por origem/responsável, cada KPI abre a lista | nenhuma |
| **E9 — Planos, consumo e admin** | P3 | Depois da decisão comercial | `plans`, `subscriptions`, `usage_events` |

Cada etapa termina com: arquivos alterados, migrações, variáveis, testes executados e pendências.
