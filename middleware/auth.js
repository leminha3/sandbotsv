const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'sandbot-jwt-secret-change-me';
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ','');
  if(!token) return res.status(401).json({error:'No token'});
  try { req.admin = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({error:'Invalid token'}); }
}
module.exports = { adminAuth };
