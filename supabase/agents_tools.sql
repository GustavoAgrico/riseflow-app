-- Agentes de IA — fase 2 (ferramentas e aprovações). Requer supabase/agents_core.sql.
-- Rodar manualmente no SQL Editor do Supabase.

-- Ação de risco alto pedida por um agente: fica guardada e só roda quando alguém aprova.
create table if not exists public.agent_approvals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  agent_id    uuid not null references public.agents(id) on delete cascade,
  thread_id   uuid references public.agent_threads(id) on delete cascade,
  queue_id    uuid references public.agent_queue(id) on delete set null,
  tool        text not null,
  args        jsonb not null default '{}'::jsonb,
  summary     text not null,
  risk        text not null default 'alto',
  status      text not null default 'pending',          -- pending | approved | denied | expired
  result      jsonb,
  decided_by  text,
  decided_at  timestamptz,
  expires_at  timestamptz not null default now() + interval '24 hours',
  created_at  timestamptz not null default now()
);
create index if not exists agent_approvals_pending_idx on public.agent_approvals (user_id, status, created_at desc);
create index if not exists agent_approvals_agent_idx on public.agent_approvals (agent_id, status);

-- Fatos que o agente guardou (ferramentas remember / search_memories).
create table if not exists public.agent_memories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  agent_id        uuid not null references public.agents(id) on delete cascade,
  text            text not null,
  tags            text[] not null default '{}',
  source_event_id bigint references public.agent_events(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists agent_memories_agent_idx on public.agent_memories (agent_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['agent_approvals', 'agent_memories'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || '_own', t);
  end loop;
end $$;
