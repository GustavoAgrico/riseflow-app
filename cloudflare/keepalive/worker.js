// Cloudflare Worker com Cron Trigger: chama o servidor do RiseFlow a cada 10 min
// para o Render free não hibernar (ele dorme após 15 min sem tráfego).
// Deploy: dashboard → Workers & Pages → riseflow-keepalive (cole este arquivo)
// e em Settings → Triggers → Cron: */10 * * * *
const TARGET = 'https://riseflow-app-aepu.onrender.com/health'

async function ping() {
  const started = Date.now()
  try {
    const res = await fetch(TARGET, { cf: { cacheTtl: 0 } })
    return { ok: res.ok, status: res.status, ms: Date.now() - started }
  } catch (e) {
    return { ok: false, error: String(e), ms: Date.now() - started }
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ping().then((r) => console.log('keepalive', JSON.stringify(r))))
  },
  async fetch() {
    return Response.json(await ping())
  },
}
