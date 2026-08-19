-- contacts_unique_constraint.sql
-- Adiciona a UNIQUE (user_id, jid) exigida pelo upsert de POST /api/contacts/import.
--
-- Contexto: a tabela contacts nunca teve constraint única (só índices comuns),
-- então o upsert antigo com onConflict:'jid' falhava em runtime. O backend agora
-- usa onConflict:'user_id,jid' — o mesmo número pode pertencer a donos diferentes
-- sem colisão. Rodar MANUALMENTE no dashboard do Supabase (não há runner de CLI).
--
-- Ordem: (1) remover duplicatas pré-existentes, (2) criar a constraint.

-- ── 1. Dedup defensivo ──────────────────────────────────────────────────────
-- Se já houver linhas com o mesmo (user_id, jid), a criação da UNIQUE falha.
-- Mantém a linha mais recente (maior first_seen_at; empate → maior id) e apaga o resto.
-- NULLs em user_id são tratados como distintos pelo Postgres, então órfãs antigas
-- (user_id IS NULL) não colidem entre si nem bloqueiam a constraint.
DELETE FROM public.contacts c
USING public.contacts keep
WHERE c.user_id IS NOT DISTINCT FROM keep.user_id
  AND c.jid = keep.jid
  AND c.id <> keep.id
  AND (
    keep.first_seen_at > c.first_seen_at
    OR (keep.first_seen_at = c.first_seen_at AND keep.id > c.id)
    OR (c.first_seen_at IS NULL AND keep.first_seen_at IS NOT NULL)
  );

-- ── 2. Constraint única ─────────────────────────────────────────────────────
-- Idempotente: só cria se ainda não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_user_jid_unique'
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_user_jid_unique UNIQUE (user_id, jid);
  END IF;
END $$;

-- ── 3. (OPCIONAL) Backfill das órfãs ────────────────────────────────────────
-- Linhas com user_id NULL foram criadas pelo bug do req.user.id. Se você tem um
-- único dono real hoje, dá pra adotá-las. Descomente e troque o UUID pelo do dono
-- (auth.users.id). Deixe comentado se houver mais de um tenant — nesse caso é
-- impossível saber a quem cada órfã pertence e o mais seguro é apagar:
--
--   UPDATE public.contacts SET user_id = '00000000-0000-0000-0000-000000000000'
--   WHERE user_id IS NULL;
--
-- ou, para descartar as órfãs:
--
--   DELETE FROM public.contacts WHERE user_id IS NULL;

-- Verificação
SELECT 'contacts', count(*) AS total,
       count(*) FILTER (WHERE user_id IS NULL) AS orfas
FROM public.contacts;
