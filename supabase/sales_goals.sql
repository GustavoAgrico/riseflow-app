-- Metas de venda + catálogo de produtos + data de fechamento dos negócios.
-- Rode no Supabase > SQL Editor. Idempotente.

CREATE TABLE IF NOT EXISTS sales_goals (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month      date NOT NULL,            -- 1º dia do mês
  target     numeric NOT NULL CHECK (target > 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, month)
);
ALTER TABLE sales_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_goals_owner ON sales_goals;
CREATE POLICY sales_goals_owner ON sales_goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS products (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  price      numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_owner ON products;
CREATE POLICY products_owner ON products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Quando o negócio foi ganho. Mantido pelo gatilho abaixo, por qualquer caminho de escrita.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS won_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_clients_won_at ON clients(user_id, won_at) WHERE won_at IS NOT NULL;

-- Etapa "ganho": kind='won' em pipeline_stages; conta sem etapas próprias usa a padrão 'closed'.
CREATE OR REPLACE FUNCTION public.stage_is_won(p_user uuid, p_stage text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM pipeline_stages WHERE user_id = p_user)
      THEN EXISTS (SELECT 1 FROM pipeline_stages WHERE user_id = p_user AND key = p_stage AND kind = 'won')
    ELSE p_stage = 'closed'
  END
$$;

CREATE OR REPLACE FUNCTION public.clients_set_won_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF public.stage_is_won(NEW.user_id, NEW.stage) THEN
    IF TG_OP = 'UPDATE' AND OLD.won_at IS NOT NULL AND public.stage_is_won(OLD.user_id, OLD.stage) THEN
      NEW.won_at := OLD.won_at;          -- já estava ganho: mantém a data original
    ELSE
      NEW.won_at := COALESCE(NEW.won_at, now());
    END IF;
  ELSE
    NEW.won_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clients_won_at ON clients;
CREATE TRIGGER trg_clients_won_at BEFORE INSERT OR UPDATE OF stage ON clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_set_won_at();

-- Negócios já ganhos antes desta migração: usa a última atualização como data de fechamento.
UPDATE clients SET won_at = COALESCE(updated_at, created_at)
  WHERE won_at IS NULL AND public.stage_is_won(user_id, stage);

NOTIFY pgrst, 'reload schema';
