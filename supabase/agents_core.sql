-- Agentes de IA — fase 1 (fundação). Ver docs/AGENTES_ARQUITETURA.md (seção 3) e
-- docs/PLANO_AGENTES_FASES_1_2.md. Rodar manualmente no SQL Editor do Supabase.
--
-- agent_events é o log append-only; mensagens, fila e execuções são projeções
-- gravadas pelas funções abaixo na mesma transação. O servidor usa a service role;
-- as policies de RLS deixam o navegador ler só a própria conta.

-- ── Tabelas ────────────────────────────────────────────────────────────────

create table if not exists public.agents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  kind              text not null,                         -- comercial | atendente | prospector | agenda | metas | analista
  name              text not null,
  role              text not null,
  instructions      text not null default '',
  provider_chain    jsonb not null default '["claude", "openai"]'::jsonb,
  tools             text[] not null default '{}',
  approval_policy   jsonb not null default '{"baixo": "auto", "medio": "auto", "alto": "ask"}'::jsonb,
  max_runs_per_hour int not null default 60,
  status            text not null default 'idle',           -- idle | thinking | working | waiting_approval | error
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists agents_default_kind_uidx on public.agents (user_id, kind) where is_default;
create index if not exists agents_user_idx on public.agents (user_id);

create table if not exists public.agent_threads (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  agent_id       uuid not null references public.agents(id) on delete cascade,
  kind           text not null default 'direct',            -- direct | handoff | routine | channel
  title          text,
  provider_state jsonb,
  created_at     timestamptz not null default now()
);
create unique index if not exists agent_threads_direct_uidx on public.agent_threads (agent_id) where kind = 'direct';

create table if not exists public.agent_events (
  id              bigserial primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  agent_id        uuid references public.agents(id) on delete cascade,
  thread_id       uuid references public.agent_threads(id) on delete cascade,
  type            text not null,                            -- user_message | agent_message | run_failed | ...
  payload         jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  created_at      timestamptz not null default now()
);
create index if not exists agent_events_thread_idx on public.agent_events (thread_id, id);

create table if not exists public.agent_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  agent_id    uuid not null references public.agents(id) on delete cascade,
  thread_id   uuid not null references public.agent_threads(id) on delete cascade,
  author_kind text not null,                                -- user | agent | system
  author_id   text,
  content     text not null,
  attachments jsonb not null default '[]'::jsonb,
  event_id    bigint references public.agent_events(id),
  created_at  timestamptz not null default now()
);
create index if not exists agent_messages_thread_idx on public.agent_messages (thread_id, created_at);

create table if not exists public.agent_queue (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  agent_id        uuid not null references public.agents(id) on delete cascade,
  thread_id       uuid not null references public.agent_threads(id) on delete cascade,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'queued',           -- queued | running | done | failed
  attempts        int not null default 0,
  available_at    timestamptz not null default now(),
  locked_at       timestamptz,
  last_error      text,
  idempotency_key text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Um turno por agente: no máximo uma linha 'running' por agente.
create unique index if not exists agent_queue_one_running_uidx on public.agent_queue (agent_id) where status = 'running';
create index if not exists agent_queue_ready_idx on public.agent_queue (status, available_at);

create table if not exists public.agent_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  agent_id      uuid not null references public.agents(id) on delete cascade,
  thread_id     uuid references public.agent_threads(id) on delete cascade,
  queue_id      uuid references public.agent_queue(id) on delete set null,
  provider      text,
  model         text,
  fallback_from text,
  tokens_in     int,
  tokens_out    int,
  cost_usd      numeric,
  status        text not null,                              -- done | failed
  error         text,
  started_at    timestamptz,
  ended_at      timestamptz not null default now()
);
create index if not exists agent_runs_agent_idx on public.agent_runs (agent_id, ended_at desc);

-- ── RLS: o navegador só enxerga a própria conta (o servidor usa a service role) ──

do $$
declare t text;
begin
  foreach t in array array['agents', 'agent_threads', 'agent_events', 'agent_messages', 'agent_queue', 'agent_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || '_own', t);
  end loop;
end $$;

-- ── Funções da fila (chamadas pelo servidor via RPC) ─────────────────────────

-- Grava a mensagem do usuário (evento + mensagem + fila) numa transação.
-- Uma idempotency_key repetida devolve a mensagem já gravada, sem duplicar.
create or replace function public.agent_enqueue(
  p_user_id uuid, p_agent_id uuid, p_thread_id uuid,
  p_content text, p_author_id text, p_idempotency_key text
) returns public.agent_messages
language plpgsql as $$
declare
  v_event_id bigint;
  v_msg public.agent_messages;
begin
  if p_idempotency_key is not null then
    select m.* into v_msg from public.agent_messages m
      join public.agent_events e on e.id = m.event_id
      where e.idempotency_key = p_idempotency_key and e.user_id = p_user_id;
    if found then return v_msg; end if;
  end if;

  insert into public.agent_events (user_id, agent_id, thread_id, type, payload, idempotency_key)
    values (p_user_id, p_agent_id, p_thread_id, 'user_message', jsonb_build_object('content', p_content), p_idempotency_key)
    returning id into v_event_id;

  insert into public.agent_messages (user_id, agent_id, thread_id, author_kind, author_id, content, event_id)
    values (p_user_id, p_agent_id, p_thread_id, 'user', p_author_id, p_content, v_event_id)
    returning * into v_msg;

  insert into public.agent_queue (user_id, agent_id, thread_id, payload, idempotency_key)
    values (p_user_id, p_agent_id, p_thread_id, jsonb_build_object('message_id', v_msg.id),
            coalesce(p_idempotency_key, 'msg:' || v_msg.id::text));

  return v_msg;
end $$;

-- Pega a próxima mensagem pronta de um agente que não está em turno.
-- skip locked: duas cópias do worker nunca pegam a mesma linha; o índice único
-- de 'running' impede dois turnos do mesmo agente (a disputa perdida devolve vazio).
create or replace function public.agent_claim_next()
returns setof public.agent_queue
language plpgsql as $$
declare v_id uuid;
begin
  select q.id into v_id from public.agent_queue q
    where q.status = 'queued' and q.available_at <= now()
      and not exists (select 1 from public.agent_queue r where r.agent_id = q.agent_id and r.status = 'running')
    order by q.available_at
    for update skip locked
    limit 1;
  if v_id is null then return; end if;

  begin
    return query
      update public.agent_queue set status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
        where id = v_id returning *;
  exception when unique_violation then
    return;
  end;
end $$;

-- Devolve à fila o que ficou 'running' (servidor caiu no meio do turno).
create or replace function public.agent_requeue_stale(p_minutes int default 10)
returns int
language plpgsql as $$
declare n int;
begin
  update public.agent_queue
    set status = 'queued', locked_at = null, available_at = now(), updated_at = now()
    where status = 'running' and locked_at < now() - make_interval(mins => p_minutes);
  get diagnostics n = row_count;
  return n;
end $$;

-- Conclui o turno: grava a resposta (uma única vez por item da fila), a execução e fecha a fila.
-- Se a mesma conclusão chegar de novo (retentativa), devolve a resposta já gravada.
create or replace function public.agent_complete(
  p_queue_id uuid, p_author_kind text, p_content text, p_run jsonb
) returns public.agent_messages
language plpgsql as $$
declare
  q public.agent_queue;
  v_event_id bigint;
  v_msg public.agent_messages;
begin
  select * into q from public.agent_queue where id = p_queue_id;
  if not found then raise exception 'agent_queue % não existe', p_queue_id; end if;

  select m.* into v_msg from public.agent_messages m
    join public.agent_events e on e.id = m.event_id
    where e.idempotency_key = 'reply:' || p_queue_id::text;
  if found then
    update public.agent_queue set status = 'done', locked_at = null, updated_at = now() where id = p_queue_id;
    return v_msg;
  end if;

  insert into public.agent_events (user_id, agent_id, thread_id, type, payload, idempotency_key)
    values (q.user_id, q.agent_id, q.thread_id, 'agent_message',
            jsonb_build_object('content', p_content, 'run', p_run), 'reply:' || p_queue_id::text)
    returning id into v_event_id;

  insert into public.agent_messages (user_id, agent_id, thread_id, author_kind, author_id, content, event_id)
    values (q.user_id, q.agent_id, q.thread_id, p_author_kind, q.agent_id::text, p_content, v_event_id)
    returning * into v_msg;

  insert into public.agent_runs (user_id, agent_id, thread_id, queue_id, provider, model, fallback_from,
                                 tokens_in, tokens_out, status, error, started_at)
    values (q.user_id, q.agent_id, q.thread_id, q.id, p_run->>'provider', p_run->>'model', p_run->>'fallback_from',
            nullif(p_run->>'tokens_in', '')::int, nullif(p_run->>'tokens_out', '')::int,
            coalesce(p_run->>'status', 'done'), p_run->>'error', (p_run->>'started_at')::timestamptz);

  update public.agent_queue set status = 'done', locked_at = null, updated_at = now() where id = p_queue_id;
  return v_msg;
end $$;

-- Só o servidor (service role) chama as funções.
revoke all on function public.agent_enqueue(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.agent_claim_next() from public, anon, authenticated;
revoke all on function public.agent_requeue_stale(int) from public, anon, authenticated;
revoke all on function public.agent_complete(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.agent_enqueue(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.agent_claim_next() to service_role;
grant execute on function public.agent_requeue_stale(int) to service_role;
grant execute on function public.agent_complete(uuid, text, text, jsonb) to service_role;
