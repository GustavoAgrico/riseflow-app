-- ============================================================================
-- RiseFlow · Chat — Notas internas da conversa (com @menção)
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- Idempotente.
--
-- A nota fica numa tabela própria, nunca em `messages`: assim ela não é
-- enviada ao contato, não entra no histórico que a IA lê e não conta nas
-- métricas de mensagens.
-- RLS: usa has_account_access (equipe) se existir; senão, isola por dono.
-- ============================================================================

create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_name text,
  author_member_id uuid,
  content text not null,
  -- [{ "id": "<team_members.id | owner>", "name": "Ana" }]
  mentions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists conversation_notes_conv_idx on public.conversation_notes(conversation_id, created_at);
create index if not exists conversation_notes_user_idx on public.conversation_notes(user_id);

alter table public.conversation_notes enable row level security;
do $$
begin
  execute 'drop policy if exists "conversation_notes_own" on public.conversation_notes';
  if exists (select 1 from pg_proc where proname = 'has_account_access') then
    execute 'create policy "conversation_notes_own" on public.conversation_notes for all '
         || 'using (public.has_account_access(user_id)) '
         || 'with check (public.has_account_access(user_id))';
  else
    execute 'create policy "conversation_notes_own" on public.conversation_notes for all '
         || 'using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;
end $$;
