-- ─────────────────────────────────────────────────────────────────────────
-- RiseFlow — Campanhas (disparo em massa WhatsApp / Email)
-- Cole TODO este bloco no Supabase → SQL Editor → clique Run.
-- Idempotente: pode rodar várias vezes sem erro.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Tabela principal de campanhas
create table if not exists public.campaigns (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  name             text        not null,
  message          text,
  media_url        text,
  message_type     text        default 'text',
  audience_type    text        default 'all',
  audience_filter  jsonb       default '{}'::jsonb,
  status           text        default 'draft',
  scheduled_at     timestamptz,
  interval_seconds int         default 3,
  total            int         default 0,
  sent             int         default 0,
  delivered        int         default 0,
  read             int         default 0,
  replied          int         default 0,
  created_at       timestamptz default now()
);

-- 2) Colunas extras (adicionadas depois do schema original)
alter table public.campaigns add column if not exists channel text default 'whatsapp';
alter table public.campaigns add column if not exists subject text;

-- 3) Tabela de destinatários por campanha
create table if not exists public.campaign_messages (
  id              uuid        primary key default gen_random_uuid(),
  campaign_id     uuid        references public.campaigns(id) on delete cascade,
  contact_id      uuid,
  contact_name    text,
  contact_company text,
  phone           text,
  email           text,
  status          text        default 'pending',
  sent_at         timestamptz,
  error           text
);

-- 4) Colunas extras em campaign_messages (idempotente)
alter table public.campaign_messages add column if not exists contact_name    text;
alter table public.campaign_messages add column if not exists contact_company text;
alter table public.campaign_messages add column if not exists email           text;

-- 5) Remove NOT NULL do phone (campanhas de email não têm telefone)
--    Só executa se a constraint existir; do contrário é no-op.
do $$ begin
  alter table public.campaign_messages alter column phone drop not null;
exception when others then null;
end $$;

-- 6) Índices
create index if not exists campaigns_user_idx
  on public.campaigns (user_id, created_at desc);

create index if not exists campaign_messages_campaign_idx
  on public.campaign_messages (campaign_id, status);

-- 7) RLS
alter table public.campaigns         enable row level security;
alter table public.campaign_messages enable row level security;

drop policy if exists "campaigns_own"          on public.campaigns;
drop policy if exists "campaign_messages_own"  on public.campaign_messages;

create policy "campaigns_own" on public.campaigns
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "campaign_messages_own" on public.campaign_messages
  for all
  using      (campaign_id in (select id from public.campaigns where user_id = auth.uid()))
  with check (campaign_id in (select id from public.campaigns where user_id = auth.uid()));

-- ✅ Pronto — tabelas campaigns e campaign_messages configuradas.
