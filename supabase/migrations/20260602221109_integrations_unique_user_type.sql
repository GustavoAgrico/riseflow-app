-- Adiciona a constraint UNIQUE (user_id, type) na tabela `integrations`.
--
-- Problema: vários upserts do frontend usam `onConflict: 'user_id,type'`
-- (Integrations.jsx, WhatsApp/AI/Email/Facebook/Instagram/Telegram modals).
-- Sem essa constraint, o Postgres rejeita com
-- "no unique or exclusion constraint matching the ON CONFLICT specification"
-- e o salvamento da integração falha (erro [WA sync] no console).
--
-- Idempotente: pode rodar de novo sem erro.

do $$ begin
  alter table public.integrations
    add constraint integrations_user_type_unique unique (user_id, type);
exception
  when duplicate_object then null;
  when duplicate_table  then null;
end $$;
