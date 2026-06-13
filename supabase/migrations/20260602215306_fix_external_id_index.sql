-- Corrige o índice de dedup de mensagens para funcionar com o upsert da Edge Function `webhook`.
--
-- Problema: o índice anterior era PARCIAL (`where external_id is not null`). O upsert do PostgREST
-- (onConflict: 'external_id') não passa o predicado, então o Postgres não infere o índice e rejeita
-- com "no unique or exclusion constraint matching the ON CONFLICT specification" — fazendo a mensagem
-- não ser salva mesmo o webhook respondendo 200.
--
-- Solução: substituir por um índice único "completo" sobre external_id (sempre preenchido pelo app).
-- Idempotente: pode rodar de novo sem erro.

drop index if exists public.messages_external_id_uidx;

create unique index if not exists messages_external_id_uidx
  on public.messages (external_id);
