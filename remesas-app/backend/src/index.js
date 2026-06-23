require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const rateLimiter = require('./middleware/rateLimiter');

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'dev_secret_change_in_production';
  console.warn('[ADVERTENCIA] JWT_SECRET no configurado, usando valor de desarrollo');
}

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// Cabeceras de seguridad básicas (sin dependencias)
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

// Rate limiting global y reforzado para login/registro
app.use('/api', rateLimiter({ windowMs: 60000, max: 120 }));
app.use('/api/auth/login', rateLimiter({ windowMs: 60000, max: 10 }));
app.use('/api/auth/register', rateLimiter({ windowMs: 60000, max: 5 }));
app.use('/api/auth/recuperar', rateLimiter({ windowMs: 60000, max: 5 }));
app.use('/api/auth/restablecer', rateLimiter({ windowMs: 60000, max: 10 }));

app.use('/api', routes);

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Remesas API corriendo en puerto ${PORT}`));
