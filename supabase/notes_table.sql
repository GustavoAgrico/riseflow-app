-- Rodar no Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  contact_id text not null,
  content text not null,
  type text default 'note',
  pinned boolean default false,
  created_at timestamp default now(),
  updated_at timestamp default now()
);
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_notes" ON notes FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_notes_contact ON notes(contact_id);
