-- Ligações feitas pelo agente de voz (ElevenLabs + número Twilio importado na ElevenLabs).
-- Cada linha é uma chamada para um lead: status vindo da ElevenLabs, transcrição e
-- a qualificação feita depois pela IA do dono (também gravada em lead_scores).
-- Rodar manualmente no SQL Editor do Supabase.

create table if not exists public.ai_calls (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  client_id       uuid references public.clients(id) on delete set null,
  to_number       text not null,
  conversation_id text,
  call_sid        text,
  status          text not null default 'initiated',  -- queued | dialing | initiated | in-progress | processing | done | failed | canceled
  call_result     text,                               -- answered | voicemail | busy | no_answer | failed
  duration_secs   int,
  cost_usd        numeric,
  transcript      jsonb default '[]'::jsonb,           -- [{ role: 'agent'|'user', message, t }]
  summary         text,
  score           int,
  temperature     text,                               -- hot | warm | cold
  qualified       boolean,
  error           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists ai_calls_user_idx   on public.ai_calls (user_id, created_at desc);
create index if not exists ai_calls_client_idx on public.ai_calls (client_id, created_at desc);
create index if not exists ai_calls_queue_idx  on public.ai_calls (status, created_at);
create unique index if not exists ai_calls_conversation_uidx on public.ai_calls (conversation_id) where conversation_id is not null;

alter table public.ai_calls enable row level security;
drop policy if exists "ai_calls_own" on public.ai_calls;
create policy "ai_calls_own" on public.ai_calls
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
