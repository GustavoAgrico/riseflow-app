-- ─────────────────────────────────────────────────────────────────────────
-- RiseFlow — Verificação em duas etapas (2FA)
-- Rode no Supabase → SQL Editor. Idempotente.
--
-- O app autenticador (TOTP) é nativo do Supabase Auth e NÃO precisa destas
-- tabelas. Elas guardam o que o Supabase não tem:
--   mfa_recovery_codes  códigos de recuperação (uso único, só o hash)
--   mfa_email_codes     código por e-mail (só o hash; 10 min; 5 tentativas)
--   mfa_sessions        sessões que passaram pela 2ª etapa por código de
--                       recuperação ou e-mail (o TOTP já marca a sessão como aal2)
-- Acesso só pelo servidor (service role): RLS ligada e sem políticas.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.mfa_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mfa_recovery_codes_user_idx on public.mfa_recovery_codes (user_id);

create table if not exists public.mfa_email_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code_hash  text not null,
  purpose    text not null default 'login' check (purpose in ('login', 'enable')),
  attempts   integer not null default 0,
  expires_at timestamptz not null,
  sent_at    timestamptz not null default now()
);

create table if not exists public.mfa_sessions (
  session_id uuid primary key,              -- claim session_id do token do Supabase
  user_id    uuid not null references auth.users(id) on delete cascade,
  method     text not null check (method in ('recovery', 'email')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists mfa_sessions_user_idx on public.mfa_sessions (user_id);

alter table public.mfa_recovery_codes enable row level security;
alter table public.mfa_email_codes    enable row level security;
alter table public.mfa_sessions       enable row level security;
