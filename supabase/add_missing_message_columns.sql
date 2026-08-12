-- Migração: colunas que o servidor Express (inbox, flowEngine) e a Edge Function
-- usam para persistir/consultar mensagens, mas que faltavam no banco.
--   - conversations.updated_at  (writers faziam upsert com ela → insert falhava)
--   - messages.contact_phone    (writers gravam; aiAttendant/metaClient leem por ela)
-- Sem essas colunas, recebidas de Telegram/Meta e respostas de funil NÃO eram
-- persistidas, e o histórico da IA / janela de 24h da Meta ficavam vazios.
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.

-- Função de trigger (idempotente) — mantém updated_at automático em updates.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- 1) conversations.updated_at
alter table public.conversations add column if not exists updated_at timestamptz default now();
drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

-- 2) messages.contact_phone (denormalizado — consultas por telefone)
alter table public.messages add column if not exists contact_phone text;

-- Backfill: preenche contact_phone das mensagens já existentes a partir da conversa.
update public.messages m
   set contact_phone = c.contact_phone
  from public.conversations c
 where m.conversation_id = c.id
   and m.contact_phone is null;

-- Índice para as consultas por telefone (server/aiAttendant.js, server/metaClient.js).
create index if not exists messages_contact_phone_idx on public.messages (contact_phone);

-- Força o PostgREST a recarregar o cache de schema (senão a API pode não "ver"
-- as colunas novas por alguns segundos).
notify pgrst, 'reload schema';
