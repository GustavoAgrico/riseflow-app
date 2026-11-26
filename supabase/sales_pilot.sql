-- ============================================================================
-- RiseFlow · Piloto de Vendas (agente de vendas automático)
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- Idempotente. O servidor usa a service key (filtra user_id); RLS protege o acesso direto.
--
-- sales_opportunities: uma linha por contato com sinal de compra. A nota (score 0–100)
--   vem do detector de intenção (server/sales/intent.js) e é recalculada a cada mensagem.
--   status: new → contacted → proposal → negotiation → won | lost | dismissed
-- sales_pilot_settings: o que o piloto faz sozinho em cada conta.
-- ============================================================================

create table if not exists public.sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid references public.clients(id) on delete set null,
  contact_phone text not null,
  contact_name text,
  channel text,
  score integer not null default 0,
  level text not null default 'baixa',
  signals text[] not null default '{}',
  product text,
  last_message text,
  last_inbound_at timestamptz,
  status text not null default 'new',
  value numeric,
  auto_moved_at timestamptz,
  contacted_at timestamptz,
  won_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_opps_status_chk check (status in ('new', 'contacted', 'proposal', 'negotiation', 'won', 'lost', 'dismissed')),
  constraint sales_opps_unique_contact unique (user_id, contact_phone)
);
create index if not exists sales_opps_user_score_idx on public.sales_opportunities(user_id, score desc);
create index if not exists sales_opps_user_status_idx on public.sales_opportunities(user_id, status);

create table if not exists public.sales_pilot_settings (
  user_id uuid primary key,
  auto_register boolean not null default true,  -- cria a ficha do cliente na 1ª mensagem
  auto_update boolean not null default true,    -- atualiza nome e última mensagem na ficha
  auto_tag boolean not null default true,       -- etiqueta Quente / Interessado
  auto_stage boolean not null default true,     -- lead quente avança de "Novo" para "Qualificado"
  notify boolean not null default true,         -- avisa quando um lead fica quente
  hot_threshold integer not null default 75,
  updated_at timestamptz not null default now()
);

alter table public.sales_opportunities enable row level security;
alter table public.sales_pilot_settings enable row level security;
do $$
begin
  execute 'drop policy if exists "sales_opps_own" on public.sales_opportunities';
  execute 'drop policy if exists "sales_pilot_own" on public.sales_pilot_settings';
  if exists (select 1 from pg_proc where proname = 'has_account_access') then
    execute 'create policy "sales_opps_own" on public.sales_opportunities for all using (public.has_account_access(user_id)) with check (public.has_account_access(user_id))';
    execute 'create policy "sales_pilot_own" on public.sales_pilot_settings for all using (public.has_account_access(user_id)) with check (public.has_account_access(user_id))';
  else
    execute 'create policy "sales_opps_own" on public.sales_opportunities for all using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    execute 'create policy "sales_pilot_own" on public.sales_pilot_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;
end $$;
