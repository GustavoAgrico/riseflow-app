// Só o dono da conta ou um membro com cargo Admin passa.
// Membros de equipe têm sub = dono e member_id no token (ver /api/auth/login em server/index.js).
const { supabase } = require('../supabaseClient')

function requireAdmin(message = 'Só o dono da conta ou um Admin pode fazer isso.') {
  return async (req, res, next) => {
    const memberId = req.user?.member_id
    if (!memberId) return next()
    try {
      const { data } = await supabase.from('team_members').select('role').eq('id', memberId).eq('user_id', req.user.sub).maybeSingle()
      if (/admin/i.test(data?.role || '')) return next()
    } catch { /* cai no 403 */ }
    res.status(403).json({ error: message })
  }
}

module.exports = { requireAdmin }
