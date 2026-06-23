const db = require('../config/database');
const auth = require('./auth');

module.exports = function adminAuth(req, res, next) {
  auth(req, res, () => {
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId);
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Acceso restringido a administradores' });
    }
    next();
  });
};
