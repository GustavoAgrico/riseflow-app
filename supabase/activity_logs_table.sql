-- Logs de Atividade e Auditoria — RiseFlow
-- Cada usuário só enxerga e gerencia os próprios registros (RLS).

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  action text not null,
  category text default 'system',
  description text default '',
  metadata jsonb default '{}',
  ip text,
  page text,
  created_at timestamp default now()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_logs" ON activity_logs FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_logs_user_date ON activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_category ON activity_logs(category);
