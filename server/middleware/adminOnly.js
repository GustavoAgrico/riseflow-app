// Restringe acesso às rotas protegidas apenas a administradores.
// Ativo durante o período de testes; remover quando abrir para outros usuários.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'gugahagrico12@gmail.com')
  .split(',').map((e) => e.trim().toLowerCase())

module.exports = function adminOnly(req, res, next) {
  const email = (req.user?.email || '').toLowerCase()
  if (!email || !ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({
      error: 'Sistema em fase de testes. Acesso restrito a administradores.',
    })
  }
  next()
}
