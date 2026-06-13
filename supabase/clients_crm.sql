-- Rodar no Supabase Dashboard > SQL Editor
-- Adiciona as colunas do pipeline do CRM à tabela clients (sincroniza CRM <-> Funil).
-- A coluna `stage` usa os ids do pipeline: lead, qual, prop, neg, closed, lost.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS stage   text DEFAULT 'lead';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS value   numeric DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email   text;

-- Contatos antigos sem etapa entram como "Novo Lead"
UPDATE clients SET stage = 'lead' WHERE stage IS NULL;
