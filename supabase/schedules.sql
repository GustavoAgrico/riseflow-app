-- ─────────────────────────────────────────────────────────────────────────
-- RiseFlow — Agendamentos (mensagens agendadas / recorrentes pelo WhatsApp)
-- Rode este SQL no Supabase → SQL Editor.
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists schedules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  name           text,
  phone          text not null,
  msg            text,
  send_date      date not null,
  send_time      text default '09:00',          -- HH:MM
  type           text default 'unica',          -- unica | recorrente
  freq           text default 'diario',         -- diario | semanal | mensal | segsex
  end_date       date,
  status         text default 'agendado',       -- agendado | enviado | cancelado | falhou
  business_hours boolean default false,
  last_sent_at   timestamptz,
  created_at     timestamptz default now()
);

create index if not exists schedules_user_idx   on schedules (user_id);
create index if not exists schedules_status_idx on schedules (user_id, status);

-- ── RLS ──
alter table schedules enable row level security;

drop policy if exists "schedules_own" on schedules;
create policy "schedules_own" on schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
