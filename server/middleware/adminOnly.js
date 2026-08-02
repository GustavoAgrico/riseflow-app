// Restringe acesso às rotas protegidas a administradores ou membros verificados da equipe.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'gugahagrico12@gmail.com')
  .split(',').map((e) => e.trim().toLowerCase())

module.exports = function adminOnly(req, res, next) {
  // Membro de equipe: JWT contém member_id (emitido em /api/auth/login após lookup em team_members)
  if (req.user?.member_id) return next()

  const email = (req.user?.email || '').toLowerCase()
  if (!email || !ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({
      error: 'Sistema em fase de testes. Acesso restrito a administradores.',
    })
  }
  next()
}
