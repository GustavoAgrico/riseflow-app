-- ─────────────────────────────────────────────────────────────────────────
-- RiseFlow — Campanhas (disparo em massa pelo WhatsApp)
-- Rode este SQL no Supabase → SQL Editor.
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists campaigns (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users not null,
  name             text not null,
  message          text,
  media_url        text,
  message_type     text default 'text',          -- text | image | document | list
  audience_type    text default 'all',           -- all | tag | stage | csv
  audience_filter  jsonb default '{}',           -- { tags:[], stages:[], excludeTags:[] }
  status           text default 'draft',         -- draft | scheduled | sending | done | paused | paused_limit | failed
  scheduled_at     timestamptz,
  interval_seconds integer default 3,
  total            integer default 0,
  sent             integer default 0,
  delivered        integer default 0,
  read             integer default 0,
  replied          integer default 0,
  created_at       timestamptz default now()
);

create table if not exists campaign_messages (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid references campaigns on delete cascade,
  contact_id      uuid,
  contact_name    text,
  contact_company text,
  phone           text not null,
  status          text default 'pending',        -- pending | sent | failed
  sent_at         timestamptz,
  error           text
);

-- Colunas adicionadas depois (no-op se já existirem) ─ mantém upgrades seguros.
alter table campaign_messages add column if not exists contact_name    text;
alter table campaign_messages add column if not exists contact_company text;

-- Canal Email (SMTP): campanhas podem disparar por WhatsApp ou Email.
alter table campaigns         add column if not exists channel text default 'whatsapp'; -- whatsapp | email
alter table campaigns         add column if not exists subject text;                    -- assunto (só canal email)
alter table campaign_messages add column if not exists email   text;                    -- destinatário (canal email)
alter table campaign_messages alter column phone drop not null;                         -- campanhas de email não têm telefone

create index if not exists campaign_messages_campaign_idx on campaign_messages (campaign_id);
create index if not exists campaigns_user_idx on campaigns (user_id);

-- ── RLS ──
alter table campaigns         enable row level security;
alter table campaign_messages enable row level security;

drop policy if exists "campaigns_own" on campaigns;
create policy "campaigns_own" on campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "campaign_messages_own" on campaign_messages;
create policy "campaign_messages_own" on campaign_messages
  for all using (campaign_id in (select id from campaigns where user_id = auth.uid()))
  with check (campaign_id in (select id from campaigns where user_id = auth.uid()));
