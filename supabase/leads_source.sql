-- Rodar no Supabase Dashboard > SQL Editor
-- Origem do lead (tráfego pago / captação) na tabela clients.
--   source      = canal de origem, ex.: 'meta_lead_ad'
--   source_meta = detalhes em JSON: { ad_id, form_id, leadgen_id, campos do formulário, ... }
-- Assim cada lead guarda de qual campanha/anúncio veio (rastreabilidade de ROI).

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS source      text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS source_meta jsonb;

-- Índice p/ filtrar leads por origem (ex.: só os do tráfego pago do usuário).
CREATE INDEX IF NOT EXISTS clients_user_source_idx ON public.clients (user_id, source);
