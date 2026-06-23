require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'dev_secret_change_in_production';
  console.warn('[ADVERTENCIA] JWT_SECRET no configurado, usando valor de desarrollo');
}

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', routes);

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Remesas API corriendo en puerto ${PORT}`));
