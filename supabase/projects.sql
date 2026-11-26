-- ============================================================================
-- RiseFlow · Projetos (implantação / pós-venda) com checklist
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- Idempotente. RLS de equipe (has_account_access) com fallback por dono.
-- status: 'planning' | 'active' | 'review' | 'done'
-- steps (jsonb): [{ "id": "...", "title": "...", "done": false, "done_at": null }]
--   O checklist fica na própria linha: marcar um passo é um único update atômico.
-- team (text[]): nomes de quem participa; lead_name é o responsável.
-- ============================================================================

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text,
  name text not null,
  status text not null default 'planning',
  due_date date,
  lead_name text,
  team text[] not null default '{}',
  steps jsonb not null default '[]'::jsonb,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_status_chk check (status in ('planning', 'active', 'review', 'done'))
);
create index if not exists projects_user_idx on public.projects(user_id);
create index if not exists projects_client_idx on public.projects(client_id);
create index if not exists projects_status_idx on public.projects(user_id, status);

-- updated_at automático
create or replace function public.projects_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.projects_touch();

alter table public.projects enable row level security;
do $$
begin
  execute 'drop policy if exists "projects_own" on public.projects';
  if exists (select 1 from pg_proc where proname = 'has_account_access') then
    execute 'create policy "projects_own" on public.projects for all '
         || 'using (public.has_account_access(user_id)) '
         || 'with check (public.has_account_access(user_id))';
    raise notice 'projects: RLS com acesso de equipe';
  else
    execute 'create policy "projects_own" on public.projects for all '
         || 'using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    raise notice 'projects: RLS por dono (rode team_access_rls.sql p/ equipe)';
  end if;
end $$;
