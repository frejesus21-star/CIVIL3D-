const router = require('express').Router();
const auth = require('../middleware/auth');
const authCtrl = require('../controllers/authController');
const cuentasCtrl = require('../controllers/cuentasController');
const destCtrl = require('../controllers/destinatariosController');
const transCtrl = require('../controllers/transferenciasController');
const { getRates } = require('../services/exchangeService');

// Auth
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', auth, authCtrl.me);

// Tasas públicas
router.get('/tasas', async (req, res) => {
  try {
    const rates = await getRates();
    res.json(rates);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Datos de referencia
router.get('/bancos/chile', (req, res) => res.json(cuentasCtrl.BANCOS_CHILE));
router.get('/bancos/venezuela', (req, res) => res.json(destCtrl.BANCOS_VENEZUELA));

// Cuentas de origen (Chile)
router.get('/cuentas', auth, cuentasCtrl.listar);
router.post('/cuentas', auth, cuentasCtrl.crear);
router.delete('/cuentas/:id', auth, cuentasCtrl.eliminar);

// Destinatarios (Venezuela)
router.get('/destinatarios', auth, destCtrl.listar);
router.post('/destinatarios', auth, destCtrl.crear);
router.delete('/destinatarios/:id', auth, destCtrl.eliminar);

// Transferencias
router.get('/transferencias/cotizar', auth, transCtrl.cotizar);
router.get('/transferencias', auth, transCtrl.listar);
router.post('/transferencias', auth, transCtrl.crear);
router.get('/transferencias/:id', auth, transCtrl.obtener);

module.exports = router;
