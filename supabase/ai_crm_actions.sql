-- ============================================================================
-- RiseFlow · IA Central — IA que age no CRM (tarefas, etapa do funil, agenda)
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- Idempotente. Depende de: ai_attendant.sql (attendant_config), crm_tasks.sql,
-- meetings.sql e pipeline_stages.sql já rodados.
--
-- attendant_config.ai_actions_mode:
--   'off'     → a IA só conversa (padrão)
--   'auto'    → a IA executa as ações sozinha (ganho/perda ainda pede aprovação)
--   'approve' → toda ação fica pendente até alguém do time aprovar
-- ============================================================================

alter table public.attendant_config
  add column if not exists ai_actions_mode text not null default 'off';

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid,
  contact_phone text,
  contact_name text,
  action_type text not null,          -- criar_tarefa | mover_etapa | agendar
  params jsonb not null default '{}'::jsonb,
  description text,
  status text not null default 'pending', -- pending | approved | executed | failed | rejected
  result jsonb,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_actions_user_idx on public.ai_actions(user_id, created_at desc);
create index if not exists ai_actions_pending_idx on public.ai_actions(user_id) where status = 'pending';

alter table public.ai_actions enable row level security;
do $$
begin
  execute 'drop policy if exists "ai_actions_own" on public.ai_actions';
  if exists (select 1 from pg_proc where proname = 'has_account_access') then
    execute 'create policy "ai_actions_own" on public.ai_actions for all '
         || 'using (public.has_account_access(user_id)) '
         || 'with check (public.has_account_access(user_id))';
  else
    execute 'create policy "ai_actions_own" on public.ai_actions for all '
         || 'using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;
end $$;
