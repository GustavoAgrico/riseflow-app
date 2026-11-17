# Ligação por IA (ElevenLabs + Twilio)

A assistente virtual liga para o lead, faz as perguntas de qualificação do nicho e,
quando a ligação termina, a IA do dono qualifica a transcrição. O resultado aparece no
detalhe do lead no CRM (painel **Ligação com IA**) e na pontuação do lead.

Fluxo: CRM → `POST /api/ai-calls` → ElevenLabs liga pelo número Twilio importado →
o painel acompanha por `POST /api/ai-calls/:id/refresh` → no fim, qualificação em
`lead_scores` e, se qualificado, o lead novo vai para "Qualificado".

## 1. Twilio

1. Crie a conta em twilio.com e compre um número com voz (para teste, um número dos EUA serve).
2. Em **Voice → Settings → Geo permissions**, libere ligações para **Brasil**.
3. Conta trial: em **Phone Numbers → Verified Caller IDs**, verifique o número que vai receber o teste. A Twilio toca um aviso de conta trial antes da ligação.
4. Crie uma **API Key** (Account → API keys). Guarde o SID (começa com `SK`) e o Secret.

> Produção no Brasil: ligação ativa de oferta exige número com prefixo **0303** (Anatel),
> respeito à lista **Não Me Perturbe** e base legal na LGPD. Confirme com o jurídico antes
> de ligar em escala.

## 2. ElevenLabs

1. Em **Agents Platform → Agents**, crie um agente em branco.
2. **Idioma:** Português. **Voz:** uma voz pt-BR natural.
3. **First message:**

   ```
   Olá, {{lead_name}}? Aqui é a Clara, assistente virtual da {{business_name}}. Você tem dois minutinhos para conversarmos?
   ```

4. **System prompt:**

   ```
   Você é Clara, assistente virtual da {{business_name}}, ligando para {{lead_name}} da empresa {{lead_company}}.
   Nicho atendido: {{niche}}. Cliente ideal: {{ideal_customer}}.

   Objetivo: entender se a pessoa tem interesse e perfil para uma conversa com um consultor.

   Regras:
   - Fale português do Brasil, de forma simpática, curta e natural. Uma pergunta por vez.
   - Se perguntarem, confirme que você é uma assistente virtual.
   - Se a pessoa não puder falar agora, pergunte o melhor horário e encerre.
   - Se não tiver interesse ou pedir para não ligar mais, agradeça, diga que não vai ligar de novo e encerre.
   - Faça estas perguntas de qualificação, adaptando à conversa: {{questions}}
   - Se a lista de perguntas estiver vazia, pergunte: qual o principal desafio hoje, quem decide a compra e para quando precisam resolver.
   - Nunca prometa preço, desconto ou prazo. Não peça CPF, cartão ou senha.
   - No fim, diga que um consultor vai entrar em contato, agradeça e encerre a ligação.
   - Se cair na caixa postal, encerre sem deixar recado.
   ```

5. Em **Tools**, ative a ferramenta de sistema **End call**.
6. Em **Advanced**, limite a duração máxima a cerca de 4 minutos.
7. Para testar no painel, preencha valores de exemplo das variáveis (`lead_name`, `lead_company`, `business_name`, `niche`, `ideal_customer`, `questions`).

## 3. Importar o número na ElevenLabs

1. **Agents Platform → Phone Numbers → Import number → Twilio**.
2. Informe rótulo, número e as credenciais da Twilio (API Key SID + Secret).
3. Atribua o número ao agente criado.

## 4. Servidor do RiseFlow

Preencha no `server/.env` (local) e no `.env` do servidor de produção:

| Variável | Onde pegar |
|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs → Developers → API Keys |
| `ELEVENLABS_AGENT_ID` | Página do agente (ID do agente) |
| `ELEVENLABS_PHONE_NUMBER_ID` | Phone Numbers → número importado (ID) |
| `AI_CALLS_BUSINESS_NAME` | Nome da sua empresa |
| `AI_CALLS_TEST_NUMBERS` | Números liberados no modo teste (vazio = qualquer lead) |

Reinicie o servidor depois de alterar o `.env`.

## 5. Banco

Rode `supabase/ai_calls.sql` no SQL Editor do Supabase.

## 6. Testar

Sem passar pelo CRM (não precisa da migração):

```bash
node server/scripts/test-ai-call.js +55DDDNUMERO
```

Pelo CRM: abra um lead com o telefone de teste → **Ligar com IA** → **Confirmar ligação**.
A qualificação usa a chave de IA configurada em Configurações (OpenAI ou Anthropic) e o
nicho salvo em `niche_config`.

## 7. Prospecção com IA (busca + fila de ligações)

Tela **Vendas → Prospecção com IA** (`/prospeccao`, dono e Admin):

1. Informe o que buscar e onde (ex.: "clínica odontológica", "Volta Redonda, Brasil").
   O servidor busca no Google Maps pelo Apify (`compass/crawler-google-places`), cerca de
   US$ 0,004 por empresa no plano gratuito.
2. Revise a lista. Empresas sem telefone ou já no CRM não podem ser marcadas.
3. **Importar para o CRM** cria os leads com a tag `Prospect Maps`.
   **Importar e ligar com IA** também coloca cada lead na fila de ligações.
4. A fila (`server/aiCallQueue.js`) roda no servidor a cada 30 s: liga um lead por vez por
   conta, com 90 s entre ligações, só dentro de `AI_CALLS_WINDOW`
   (padrão `1-5 09:00-18:00`, horário de Brasília). Acompanha as ligações e qualifica
   as concluídas mesmo com o CRM fechado.
5. Ligações na fila podem ser canceladas na própria tela.

Variáveis no servidor: `APIFY_TOKEN` (console.apify.com → Settings → API & Integrations)
e, opcional, `AI_CALLS_WINDOW`. A fila só roda onde `ENGINES_ENABLED` não é `false`.
Em modo teste (`AI_CALLS_TEST_NUMBERS` preenchido), números fora da lista são importados
mas não entram na fila.
