// Rate limiter simple en memoria, sin dependencias externas.
// Para producción multi-instancia conviene usar Redis.
function rateLimiter({ windowMs = 60000, max = 100 } = {}) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of hits) {
      if (now > data.reset) hits.delete(key);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip || req.connection?.remoteAddress || 'anon';
    const now = Date.now();
    let data = hits.get(key);
    if (!data || now > data.reset) {
      data = { count: 0, reset: now + windowMs };
      hits.set(key, data);
    }
    data.count++;
    if (data.count > max) {
      const retry = Math.ceil((data.reset - now) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({ error: `Demasiadas solicitudes. Intenta de nuevo en ${retry}s.` });
    }
    next();
  };
}

module.exports = rateLimiter;
