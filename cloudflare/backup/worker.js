// Backup do Supabase do RiseFlow no D1 `riseflow-bd` (Cloudflare Worker `riseflow-backup`).
// Cron a cada 10 min: copia UMA tabela por execução (limite de CPU do plano grátis) e
// avança o cursor; o ciclo completo cobre todas as tabelas várias vezes ao dia.
// Nada é apagado no D1: linha que some do Supabase recebe deleted_at e continua guardada.
// Bindings: DB (D1 riseflow-bd) · SUPABASE_URL (texto) · SUPABASE_SERVICE_ROLE_KEY (segredo).
// settings/integrations/push_subscriptions ficam de fora: guardam senhas e chaves de API.
// Ponto e vírgula explícito: o dashboard recebe este arquivo compactado numa linha só.
const TABLES = [
  'clients', 'contacts', 'conversations', 'messages', 'proposals', 'meetings', 'crm_tasks',
  'schedules', 'campaigns', 'campaign_messages', 'flows', 'team_members', 'team_queues',
  'pipeline_stages', 'sales_goals', 'products', 'invoices', 'notes', 'calls', 'lead_scores',
  'templates', 'knowledge_base', 'attendant_config', 'niche_config', 'usage',
  'user_preferences', 'activity_logs', 'access_requests', 'notifications',
];
const PAGE = 1000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS snapshots (tbl TEXT NOT NULL, row_id TEXT NOT NULL, data TEXT NOT NULL,
    first_seen TEXT NOT NULL, last_changed TEXT NOT NULL, last_seen TEXT NOT NULL, deleted_at TEXT,
    PRIMARY KEY (tbl, row_id))`,
  `CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT, at TEXT, ok INTEGER, rows INTEGER, deleted INTEGER, error TEXT)`,
  `CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v TEXT)`,
];

async function fetchTable(env, table) {
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=*&offset=${offset}&limit=${PAGE}`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function backupOne(env) {
  await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
  const cur = await env.DB.prepare(`SELECT v FROM state WHERE k='cursor'`).first('v');
  const idx = (Number(cur) || 0) % TABLES.length;
  const table = TABLES[idx];
  const now = new Date().toISOString();
  try {
    const rows = await fetchTable(env, table);
    let deleted = 0;
    if (rows) {
      const upsert = env.DB.prepare(`INSERT INTO snapshots (tbl,row_id,data,first_seen,last_changed,last_seen,deleted_at)
        VALUES (?1,?2,?3,?4,?4,?4,NULL) ON CONFLICT(tbl,row_id) DO UPDATE SET
        last_changed = CASE WHEN snapshots.data <> excluded.data THEN excluded.last_seen ELSE snapshots.last_changed END,
        data = excluded.data, last_seen = excluded.last_seen, deleted_at = NULL`);
      const stmts = rows.map(r => upsert.bind(table, String(r.id ?? r.user_id ?? JSON.stringify(r)), JSON.stringify(r), now));
      for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
      const res = await env.DB.prepare(`UPDATE snapshots SET deleted_at=?1 WHERE tbl=?2 AND last_seen<?1 AND deleted_at IS NULL`).bind(now, table).run();
      deleted = res.meta?.changes ?? 0;
    }
    await env.DB.prepare(`INSERT INTO runs (tbl,at,ok,rows,deleted,error) VALUES (?1,?2,1,?3,?4,NULL)`).bind(table, now, rows ? rows.length : -1, deleted).run();
  } catch (e) {
    await env.DB.prepare(`INSERT INTO runs (tbl,at,ok,rows,deleted,error) VALUES (?1,?2,0,0,0,?3)`).bind(table, now, String(e.message || e).slice(0, 300)).run();
  }
  await env.DB.prepare(`INSERT INTO state (k,v) VALUES ('cursor',?1) ON CONFLICT(k) DO UPDATE SET v=excluded.v`).bind(String(idx + 1)).run();
  await env.DB.prepare(`DELETE FROM runs WHERE at < ?1`).bind(new Date(Date.now() - 30 * 86400000).toISOString()).run();
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(backupOne(env));
  },
  // Só resumo (contagens), nunca os dados.
  async fetch(request, env) {
    await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
    const { results } = await env.DB.prepare(`SELECT tbl, COUNT(*) AS guardadas, SUM(deleted_at IS NOT NULL) AS removidas_no_supabase, MAX(last_seen) AS ultimo_backup
      FROM snapshots GROUP BY tbl ORDER BY tbl`).all();
    const last = await env.DB.prepare(`SELECT tbl, at, ok, rows, error FROM runs ORDER BY id DESC LIMIT 5`).all();
    return Response.json({ tabelas: results, ultimas_execucoes: last.results });
  },
};
