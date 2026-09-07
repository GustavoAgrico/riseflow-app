-- ============================================================================
-- RiseFlow · Etapas do funil editáveis (tabela pipeline_stages)
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- Idempotente. RLS de equipe (has_account_access) com fallback por dono.
--
-- Cada conta define suas etapas. Se a conta NÃO tiver linhas aqui, o app usa as
-- 6 etapas padrão (lead/qual/prop/neg/closed/lost). O campo `key` casa com
-- clients.stage. `kind`: open | won | lost. `probability` 0-100 (forecast).
-- ============================================================================

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  key text not null,
  label text not null,
  color text not null default '#7C3AED',
  position integer not null default 0,
  kind text not null default 'open',
  probability integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);
create index if not exists pipeline_stages_user_idx on public.pipeline_stages(user_id);

alter table public.pipeline_stages enable row level security;
do $$
begin
  execute 'drop policy if exists "pipeline_stages_own" on public.pipeline_stages';
  if exists (select 1 from pg_proc where proname = 'has_account_access') then
    execute 'create policy "pipeline_stages_own" on public.pipeline_stages for all '
         || 'using (public.has_account_access(user_id)) '
         || 'with check (public.has_account_access(user_id))';
    raise notice 'pipeline_stages: RLS com acesso de equipe';
  else
    execute 'create policy "pipeline_stages_own" on public.pipeline_stages for all '
         || 'using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    raise notice 'pipeline_stages: RLS por dono (rode team_access_rls.sql p/ equipe)';
  end if;
end $$;
