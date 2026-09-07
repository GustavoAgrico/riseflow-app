-- ============================================================================
-- RiseFlow · CRM — Tarefas/atividades por lead + Responsável
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- Idempotente. Cria a tabela crm_tasks e a coluna clients.assigned_to.
-- RLS: usa has_account_access (equipe) se existir; senão, isola por dono.
-- ============================================================================

-- 1) Tarefas por lead
create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid references public.clients(id) on delete cascade,
  title text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists crm_tasks_client_idx on public.crm_tasks(client_id);
create index if not exists crm_tasks_user_idx on public.crm_tasks(user_id);

-- 2) Responsável pelo lead (nome do membro da equipe)
alter table public.clients add column if not exists assigned_to text;

-- 3) RLS
alter table public.crm_tasks enable row level security;
do $$
begin
  execute 'drop policy if exists "crm_tasks_own" on public.crm_tasks';
  if exists (select 1 from pg_proc where proname = 'has_account_access') then
    execute 'create policy "crm_tasks_own" on public.crm_tasks for all '
         || 'using (public.has_account_access(user_id)) '
         || 'with check (public.has_account_access(user_id))';
    raise notice 'crm_tasks: RLS com acesso de equipe (has_account_access)';
  else
    execute 'create policy "crm_tasks_own" on public.crm_tasks for all '
         || 'using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    raise notice 'crm_tasks: RLS por dono (has_account_access ausente — rode team_access_rls.sql p/ equipe)';
  end if;
end $$;
