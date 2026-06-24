require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const db = require('./config/database');
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

// Servir frontend compilado en producción
const path = require('path');
const fs = require('fs');
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;
db.init()
  .then(() => app.listen(PORT, () => console.log(`Remesas API corriendo en puerto ${PORT} (BD: ${db.driver})`)))
  .catch(err => { console.error('No se pudo inicializar la base de datos:', err); process.exit(1); });
