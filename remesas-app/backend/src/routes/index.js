const router = require('express').Router();
const auth = require('../middleware/auth');
const authCtrl = require('../controllers/authController');
const cuentasCtrl = require('../controllers/cuentasController');
const destCtrl = require('../controllers/destinatariosController');
const transCtrl = require('../controllers/transferenciasController');
const kycCtrl = require('../controllers/kycController');
const notifCtrl = require('../controllers/notificacionesController');
const { getRates } = require('../services/exchangeService');

// Auth
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', auth, authCtrl.me);
router.patch('/auth/perfil', auth, authCtrl.actualizarPerfil);
router.post('/auth/cambiar-password', auth, authCtrl.cambiarPassword);
router.get('/auth/stats', auth, authCtrl.stats);

// KYC / Verificación
router.get('/kyc', auth, kycCtrl.estado);
router.post('/kyc', auth, kycCtrl.enviar);

// Notificaciones
router.get('/notificaciones', auth, notifCtrl.listar);
router.get('/notificaciones/contador', auth, notifCtrl.contador);
router.post('/notificaciones/:id/leida', auth, notifCtrl.marcarLeida);
router.post('/notificaciones/leer-todas', auth, notifCtrl.marcarTodas);

// Tasas públicas
router.get('/tasas', async (req, res) => {
  try {
    res.json(await getRates());
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
router.post('/destinatarios/:id/favorito', auth, destCtrl.favorito);
router.delete('/destinatarios/:id', auth, destCtrl.eliminar);

// Transferencias
router.get('/transferencias/cotizar', auth, transCtrl.cotizar);
router.get('/transferencias', auth, transCtrl.listar);
router.post('/transferencias', auth, transCtrl.crear);
router.get('/transferencias/:id', auth, transCtrl.obtener);
router.post('/transferencias/:id/cancelar', auth, transCtrl.cancelar);

module.exports = router;
