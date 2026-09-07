-- ============================================================================
-- RiseFlow · Cobrança — Parcelas & Mensalidades (tabela invoices)
-- ----------------------------------------------------------------------------
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → cole tudo → Run.
-- Idempotente. RLS de equipe (has_account_access) com fallback por dono.
-- status: 'pending' | 'paid'  (o "atrasado" é derivado: due_date < hoje e não pago).
-- recurring = true → mensalidade (entra no MRR).
-- ============================================================================

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text,
  description text,
  amount numeric not null default 0,
  due_date date,
  status text not null default 'pending',
  recurring boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invoices_user_idx on public.invoices(user_id);
create index if not exists invoices_client_idx on public.invoices(client_id);
create index if not exists invoices_status_idx on public.invoices(status);

alter table public.invoices enable row level security;
do $$
begin
  execute 'drop policy if exists "invoices_own" on public.invoices';
  if exists (select 1 from pg_proc where proname = 'has_account_access') then
    execute 'create policy "invoices_own" on public.invoices for all '
         || 'using (public.has_account_access(user_id)) '
         || 'with check (public.has_account_access(user_id))';
    raise notice 'invoices: RLS com acesso de equipe';
  else
    execute 'create policy "invoices_own" on public.invoices for all '
         || 'using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    raise notice 'invoices: RLS por dono (rode team_access_rls.sql p/ equipe)';
  end if;
end $$;
