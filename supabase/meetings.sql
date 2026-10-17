-- Tabela de reuniões — sincroniza com Google Calendar via iCal feed
-- Rode este SQL no Supabase > SQL Editor.
CREATE TABLE IF NOT EXISTS meetings (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  date        date NOT NULL,
  time        text,              -- HH:MM
  duration    integer DEFAULT 60, -- minutos
  client_name text,
  client_id   uuid REFERENCES clients(id) ON DELETE SET NULL,
  location    text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(user_id, date);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meetings_owner ON meetings;
CREATE POLICY meetings_owner ON meetings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Adiciona client_id na tabela proposals (se ainda não existir)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE proposals ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
  END IF;
END $$;
