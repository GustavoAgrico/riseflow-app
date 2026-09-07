-- ============================================================================
-- RiseFlow · Ligações — registro/telemetria de chamadas (tabela calls)
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- Idempotente. RLS de equipe (has_account_access) com fallback por dono.
-- outcome: connected | no_answer | busy | voicemail | scheduled | won | lost
-- direction: outbound | inbound
-- ============================================================================

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid references public.clients(id) on delete set null,
  contact_name text,
  phone text,
  direction text not null default 'outbound',
  outcome text not null default 'connected',
  duration_sec integer not null default 0,
  notes text,
  agent text,
  created_at timestamptz not null default now()
);
create index if not exists calls_user_idx on public.calls(user_id);
create index if not exists calls_client_idx on public.calls(client_id);
create index if not exists calls_created_idx on public.calls(created_at);

alter table public.calls enable row level security;
do $$
begin
  execute 'drop policy if exists "calls_own" on public.calls';
  if exists (select 1 from pg_proc where proname = 'has_account_access') then
    execute 'create policy "calls_own" on public.calls for all '
         || 'using (public.has_account_access(user_id)) '
         || 'with check (public.has_account_access(user_id))';
    raise notice 'calls: RLS com acesso de equipe';
  else
    execute 'create policy "calls_own" on public.calls for all '
         || 'using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    raise notice 'calls: RLS por dono (rode team_access_rls.sql p/ equipe)';
  end if;
end $$;
