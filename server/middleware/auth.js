// Middleware de autenticação JWT.
// Valida o header `Authorization: Bearer <token>` em todas as rotas protegidas.
const jwt = require('jsonwebtoken')

const { JWT_SECRET } = process.env

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res
      .status(401)
      .json({ error: 'Token ausente. Use o header Authorization: Bearer <token>.' })
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' })
  }
}
