-- Configuração da ligação por IA de cada conta (Configurações → Ligações com IA).
-- A chave da ElevenLabs é gravada cifrada pelo servidor (secretCrypto, TOKEN_ENC_KEY)
-- e nunca volta para o navegador. Esta tabela NÃO está no proxy REST (USER_TABLES):
-- só o servidor lê e grava.
-- Rodar manualmente no SQL Editor do Supabase.

create table if not exists public.ai_call_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  elevenlabs_api_key text,                         -- cifrada (enc:v1:...)
  agent_id           text,
  phone_number_id    text,
  business_name      text,
  call_days          text not null default '1-5',  -- 1-5 seg-sex · 1-6 seg-sáb · 0-6 todos
  call_start         text not null default '09:00',
  call_end           text not null default '18:00',
  test_numbers       text default '',              -- E.164 separados por vírgula; vazio = qualquer lead
  enabled            boolean not null default true,
  updated_at         timestamptz default now()
);

alter table public.ai_call_settings enable row level security;
-- Sem policy para usuários: o navegador não lê nem grava (só a service role do servidor).
