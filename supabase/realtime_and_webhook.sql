-- RiseFlow — habilitar Realtime do chat + dedup + RPC de não-lidas
-- Rodar UMA VEZ no Supabase Dashboard → SQL Editor.
-- Tudo é idempotente: pode rodar de novo sem erro.

-- 1) REALTIME: sem isto o postgres_changes NÃO dispara (causa do "não sincroniza")
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null; end $$;

-- Necessário p/ o Realtime entregar os dados de UPDATE/DELETE (não só INSERT)
alter table public.messages      replica identity full;
alter table public.conversations replica identity full;

-- 2) DEDUP: idempotência das mensagens recebidas (webhook e polling usam external_id)
create unique index if not exists messages_external_id_uidx
  on public.messages (external_id) where external_id is not null;

-- 3) UPSERT de conversa por (user, telefone) — usado no sync e no webhook
do $$ begin
  alter table public.conversations
    add constraint conversations_user_phone_unique unique (user_id, contact_phone);
exception when duplicate_object then null; when duplicate_table then null; end $$;

-- 4) Incremento atômico de não-lidas (chamado pelo webhook ao receber mensagem)
create or replace function public.increment_unread(conv_id uuid)
returns void language sql as $$
  update public.conversations
  set unread_count = coalesce(unread_count, 0) + 1
  where id = conv_id;
$$;
