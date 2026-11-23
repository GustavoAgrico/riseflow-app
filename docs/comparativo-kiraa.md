# Kiraa x RiseFlow — comparativo de funcionalidades

Levantamento de 2026-11-23. Fonte do Kiraa: o site público (páginas `/`, `/produtos`, `/whatsapp`,
`/produtos/agentes-ia`, `/integrations` e `/about`). O Kiraa **não publica preços**: a proposta é
montada "com o especialista". As páginas individuais de cada produto e o `docs.kiraa.com.br` não
foram lidos, então detalhes finos podem faltar.

Legenda: ✅ tem · 🟡 parcial · ❌ não tem

## 1. Comparativo

### Atendimento e canais

| Kiraa | RiseFlow | Evidência / o que falta |
|---|---|---|
| Inbox estilo WhatsApp Web, vários atendentes no mesmo número | ✅ | `/chat` (`src/pages/Chat.jsx`), Baileys multi-sessão (`whatsapp-server/`), transferência entre atendentes (`transferTo`, evento `transfer_notification`) |
| WhatsApp pela API oficial da Meta ou por QR code | ✅ | `server/whatsappCloudClient.js`, `server/routes/whatsappCloud.js`; QR via Baileys |
| Instagram DM e Facebook Messenger na mesma fila | ✅ | `server/metaClient.js`, `server/routes/meta.js`, prefixos `ig/` e `fb/` |
| Comentários do Instagram | ❌ | `metaClient.js` assina só `messages, messaging_postbacks, leadgen` |
| Notas internas e @menção na conversa | ❌ | nenhuma coluna ou UI de nota interna em `messages` ou em `Chat.jsx` |
| Filas de follow-up do time | 🟡 | `team_queues`, `assigned_to`, `/hoje` (`Today.jsx`); não há fila de "aguardando retorno" por atendente |
| SMS | ❌ | — |
| E-mail | ✅ | `server/emailClient.js` (SMTP ou API HTTP), nó `ActionSendEmail`, campanhas com canal e-mail |
| — (o Kiraa não cita) | ✅ extra | Telegram (`server/telegramClient.js`, prefixo `tg/`) |

### CRM e vendas

| Kiraa | RiseFlow | Evidência / o que falta |
|---|---|---|
| Pipelines Kanban | 🟡 | `/crm` (`CRM.jsx`), `PipelineBoard.jsx`, `pipeline_stages.sql`; **um** pipeline só (a tabela não tem `pipeline_id`) |
| Cliente 360 com timeline de 25+ eventos | 🟡 | timeline unificada em `CRM.jsx` (até 40 itens); poucos tipos de evento |
| Tarefas | ✅ | `crm_tasks.sql`, `/hoje` |
| Catálogo de produtos com foto e preço | 🟡 | `products` (nome e preço) em `/goals`; sem foto, sem descrição |
| Enviar produto na conversa e gerar pedido ligado ao cliente | ❌ | não há tabela de pedidos nem envio de produto no chat |
| Propostas | ✅ extra | `/proposals` (`Proposals.jsx`, exporta PDF) |
| Metas de venda com comemoração | ✅ extra | `/goals`, `sales_goals.sql`, `lib/airhorn.js` |
| Contrato gerado com os dados do cliente e assinatura (ClickSign) | ❌ | a proposta vira PDF, mas não há contrato nem assinatura |

### IA

| Kiraa | RiseFlow | Evidência / o que falta |
|---|---|---|
| Agente de IA no WhatsApp com base de conhecimento | 🟡 | `server/aiAttendant.js` + `knowledge_base` (FAQ pergunta/resposta, sem busca semântica), `/smart-attendant` |
| Playground para testar o agente | ✅ | sandbox de teste em `SmartAttendant.jsx` |
| Passa para humano | ✅ | transferência no `aiAttendant.js` e nó `ActionTransfer` |
| IA com **ferramentas**: agenda, remarca, move etapa, cria tarefa, valida identidade | ❌ | o agente só responde texto; não age no CRM |
| Gate de aprovação para ações sensíveis | ❌ | — |
| IA lê áudio e imagem | ❌ | `aiAttendant.js` só processa texto |
| Copiloto ("Kira"): briefing do cliente, sinais da conversa, ações com preview | 🟡 | `/api/ai/chat` e `/api/ai/generate-message` (`server/routes/ai.js`) geram texto; não há briefing nem ações |
| Ligação com IA em português | 🟡 | `server/aiCallService.js`, `aiCallQueue.js` (ElevenLabs + Twilio, janela de horário, qualificação e mudança de etapa); só ligação de saída |
| Discador (power dialer) multioperador com triagem de caixa postal | ❌ | `/calls` (`Calls.jsx`) é registro manual de ligações; a IA detecta caixa postal só na ligação dela |

### Automação e campanhas

| Kiraa | RiseFlow | Evidência / o que falta |
|---|---|---|
| Builder visual: gatilho, espera, envio, tarefa | 🟡 | `/flows-novo` (`src/pages/Flows/`, `server/flowEngine.js`): gatilhos de palavra-chave, agenda, tag e primeiro contato; nós de espera, aguardar resposta, condição, texto, arquivo, e-mail, webhook, tag, transferência e resposta da IA. **Faltam** os nós "criar tarefa" e "mover etapa" |
| Régua que para quando o cliente responde | ✅ | `actionWaitReply` + `flow_execution_id` na conversa |
| Régua que troca de canal sozinha | ❌ | cada nó envia pelo canal da conversa |
| Campanhas em massa | 🟡 | `/campaigns`, `server/campaignEngine.js`: intervalo entre envios, limite e status `sent`/`failed` |
| Campanha com janela de horário, retentativa e acompanhamento de resposta | ❌ | sem janela, sem retentativa, sem métrica de resposta |
| Templates aprovados | 🟡 | `/templates` (`templates.sql`); sem sincronizar os templates HSM da API oficial |
| Agendamento de mensagens | ✅ extra | `/schedules`, `server/scheduleEngine.js` |

### Cobrança e dados

| Kiraa | RiseFlow | Evidência / o que falta |
|---|---|---|
| Gerar PIX e boleto para o cliente final | ❌ | `/billing` (`Billing.jsx`, `invoices`) só registra parcelas; a AbacatePay em `server/routes/billing.js` cobra a assinatura **do próprio RiseFlow**, não os clientes do tenant |
| Régua automática de cobrança | ❌ | o atraso é calculado na tela; nada é enviado |
| Negociação e acordo assinado | ❌ | — |
| Completar cadastro por CPF/CNPJ | ❌ | — |
| Score de crédito e restritivos (bureaus) | ❌ | — |
| Prospecção B2B por CNAE, segmento e região, com contatos dos sócios | 🟡 | `/prospeccao` (`server/leadSearch.js`): busca no Google Maps via Apify, importa para Clientes e põe na fila de ligação por IA; sem CNAE e sem sócios |

### Reuniões, agenda e integrações

| Kiraa | RiseFlow | Evidência / o que falta |
|---|---|---|
| Bot que entra no Meet, Teams ou Zoom e gera a ata | ❌ | `meetings` é só a agenda de reuniões (`server/routes/meetings.js`) |
| Google Calendar | 🟡 | `server/routes/calendar.js` publica um feed iCal (só leitura, de mão única); sem OAuth bidirecional |
| Gmail | 🟡 | envia e-mail; não lê a caixa de entrada |
| Conectores nativos (HubSpot, Pipedrive, RD, Shopify, VTEX, Nuvemshop, Bling, Omie, SAP, TOTVS, Zendesk…) | ❌ | — |
| Zapier, Make, n8n | 🟡 | só pelo nó `ActionWebhook` (saída) dentro do fluxo |
| API REST pública com webhooks bidirecionais | ❌ | não há chave de API por tenant nem webhook por evento |
| Atribuição Meta Ads e Google Ads | 🟡 | `server/metaLeads.js` (Lead Ads), `leads_source.sql`, `/marketing`; sem Google Ads |

### Plataforma

| Kiraa | RiseFlow | Evidência / o que falta |
|---|---|---|
| Relatórios e dashboards | ✅ | `/dashboard`, `/reports`, `/analytics`, `/funnel`, `/monitor` |
| Cada usuário vê só o que o acesso permite | ✅ | RBAC em `src/constants/access.js` |
| Isolamento de dados por tenant | ✅ | `user_id` em todas as queries do server + RLS |
| LGPD e retenção configurável | 🟡 | `server/routes/legal.js` (privacidade e exclusão de dados); sem política de retenção |
| Preço público e contratação self-service | ✅ extra | `/plans`, checkout AbacatePay (o Kiraa vende só por proposta) |

## 2. Lacunas priorizadas (impacto x esforço)

Esforço: P = até 1 dia · M = 2 a 4 dias · G = 1 semana ou mais (ou depende de contrato com terceiros).

### Fazer primeiro (impacto alto, esforço P/M)

1. **Notas internas e @menção no chat** (P). É usado todo dia por times com vários atendentes. Exige uma coluna `is_internal` em `messages`, uma aba "Nota" no composer e notificação para quem foi mencionado.
2. **Nós "Criar tarefa" e "Mover etapa do funil" no builder** (P). Fecha o "gatilho → espera → envio → tarefa" do Kiraa usando `crm_tasks` e `clients.stage`, que já existem.
3. **Campanhas com janela de horário, retentativa e taxa de resposta** (P/M). Estende `campaignEngine.js` e a tabela `campaigns`.
4. **IA que age no CRM, com ferramentas** (M). Tool-calling no `aiAttendant.js` para criar tarefa, mover etapa, agendar (`schedules`/`meetings`) e transferir, com aprovação humana opcional para ações sensíveis. É o maior diferencial do Kiraa.
5. **IA que entende áudio e imagem** (M). Transcrever o áudio recebido e descrever a imagem antes de chamar o modelo. As chaves ficam no server.
6. **Régua de cobrança sobre `invoices`** (M). Lembretes por WhatsApp antes, no dia e depois do vencimento, que param quando a parcela é paga. Pode incluir PIX copia-e-cola estático gerado a partir da chave Pix do tenant (BR Code), sem gateway.

### Em seguida (impacto médio)

7. **Catálogo com foto e envio de produto no chat** (M). Adiciona foto e descrição em `products` e um botão "Enviar produto" no composer. Pedidos viriam depois.
8. **API pública e webhooks por evento** (M). Chave de API por tenant e eventos como `client.created`, `stage.changed` e `message.received`. Abre caminho para Zapier, Make e n8n sem conector nativo.
9. **Copiloto: briefing do cliente no chat** (P/M). Um resumo gerado por IA a partir da timeline e das últimas mensagens, via `/api/ai/chat`.
10. **Enriquecimento por CNPJ** (P). A BrasilAPI é gratuita e traz razão social, CNAE, endereço e sócios. CPF e score dependem de bureau pago (G).
11. **Vários pipelines** (M). `pipeline_id` em `pipeline_stages` e `clients`, e um seletor no `/crm`.

### Depois (esforço alto ou dependência externa)

12. Contrato a partir da proposta, com assinatura pela ClickSign (G, conta paga).
13. Google Calendar bidirecional por OAuth (M/G, verificação do app no Google).
14. Comentários do Instagram (M, permissão `instagram_manage_comments` na revisão da Meta).
15. SMS (P/M, já existe conta Twilio por causa da ligação com IA).
16. Ligação com IA recebida (inbound) (M).
17. Discador humano (power dialer) (G, Twilio Voice SDK no browser).
18. Bot de atas de reunião (G).
19. Prospecção B2B por CNAE com contatos dos sócios (G, base paga).
20. Conectores nativos de ERP, e-commerce e helpdesk (G cada).

## 3. Implementação

Ainda não começou. O pedido era implementar "usando o REA", mas não existe nada com esse nome no
repositório, na memória do projeto nem nas skills ou agentes instalados. Falta o usuário dizer o que
é o REA e quais lacunas implementar primeiro.
