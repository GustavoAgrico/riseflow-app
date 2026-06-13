-- Suporte a escolha de provider de WhatsApp por usuário (Evolution vs Cloud API oficial).
-- Idempotente.

alter table public.settings add column if not exists wa_provider        text default 'evolution';
alter table public.settings add column if not exists wa_phone_number_id  text;
alter table public.settings add column if not exists wa_access_token      text;
