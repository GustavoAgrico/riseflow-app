-- Rodar no Supabase Dashboard > SQL Editor
-- Threshold de score configurável para a qualificação de leads.
-- (As tabelas niche_config e lead_scores já existem; isto só adiciona o corte de score.)

ALTER TABLE niche_config ADD COLUMN IF NOT EXISTS min_score int DEFAULT 70;
