-- ─────────────────────────────────────────────────────────────────────────
-- RiseFlow — Templates de mensagem
-- Rode este SQL no Supabase → SQL Editor.
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  name       text not null,
  category   text default 'Saudação',     -- Saudação | Vendas | Suporte | Cobrança | Follow-up | Reativação
  type       text default 'Texto',        -- Texto | Imagem | Lista
  msg        text,
  media_url  text,
  options    text,                         -- opções da lista, uma por linha
  uses       integer default 0,
  created_at timestamptz default now()
);

create index if not exists templates_user_idx on templates (user_id);

-- ── RLS ──
alter table templates enable row level security;

drop policy if exists "templates_own" on templates;
create policy "templates_own" on templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
