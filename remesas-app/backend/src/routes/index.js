const router = require('express').Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const authCtrl = require('../controllers/authController');
const cuentasCtrl = require('../controllers/cuentasController');
const destCtrl = require('../controllers/destinatariosController');
const transCtrl = require('../controllers/transferenciasController');
const kycCtrl = require('../controllers/kycController');
const notifCtrl = require('../controllers/notificacionesController');
const adminCtrl = require('../controllers/adminController');
const twoFactorCtrl = require('../controllers/twoFactorController');
const { getRates } = require('../services/exchangeService');

// Auth
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', auth, authCtrl.me);
router.patch('/auth/perfil', auth, authCtrl.actualizarPerfil);
router.post('/auth/cambiar-password', auth, authCtrl.cambiarPassword);
router.get('/auth/stats', auth, authCtrl.stats);

// Verificación de email y recuperación de contraseña
router.post('/auth/verificar-email', authCtrl.verificarEmail);
router.post('/auth/reenviar-verificacion', auth, authCtrl.reenviarVerificacion);
router.post('/auth/recuperar', authCtrl.solicitarRecuperacion);
router.post('/auth/restablecer', authCtrl.restablecerPassword);

// 2FA (autenticación en dos pasos)
router.get('/auth/2fa', auth, twoFactorCtrl.estado);
router.post('/auth/2fa/setup', auth, twoFactorCtrl.setup);
router.post('/auth/2fa/activar', auth, twoFactorCtrl.activar);
router.post('/auth/2fa/desactivar', auth, twoFactorCtrl.desactivar);
router.post('/auth/2fa/regenerar-codigos', auth, twoFactorCtrl.regenerarCodigos);

// KYC / Verificación
router.get('/kyc', auth, kycCtrl.estado);
router.post('/kyc', auth, kycCtrl.enviar);

// Notificaciones
router.get('/notificaciones', auth, notifCtrl.listar);
router.get('/notificaciones/contador', auth, notifCtrl.contador);
router.post('/notificaciones/:id/leida', auth, notifCtrl.marcarLeida);
router.post('/notificaciones/leer-todas', auth, notifCtrl.marcarTodas);

// Configuración pública (solo lectura, sin auth)
router.get('/config/publica', async (req, res) => {
  const { getConfig } = require('../config/database');
  res.json({ mensaje_mantenimiento: (await getConfig('mensaje_mantenimiento')) || '' });
});

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
router.get('/transferencias/:id/comprobante', auth, transCtrl.comprobantePDF);
router.post('/transferencias/:id/cancelar', auth, transCtrl.cancelar);

// ── ADMIN ──────────────────────────────────────────────────────────────────
router.get('/admin/stats', adminAuth, adminCtrl.stats);
router.get('/admin/usuarios', adminAuth, adminCtrl.listarUsuarios);
router.get('/admin/usuarios/:id', adminAuth, adminCtrl.getUsuario);
router.post('/admin/usuarios/:id/aprobar-kyc', adminAuth, adminCtrl.aprobarKYC);
router.post('/admin/usuarios/:id/rechazar-kyc', adminAuth, adminCtrl.rechazarKYC);
router.get('/admin/transferencias', adminAuth, adminCtrl.listarTransferencias);
router.patch('/admin/transferencias/:id', adminAuth, adminCtrl.actualizarTransferencia);
router.get('/admin/tasas', adminAuth, adminCtrl.getTasas);
router.post('/admin/tasas', adminAuth, adminCtrl.setTasas);
router.delete('/admin/tasas/cache', adminAuth, adminCtrl.resetTasas);
router.get('/admin/config', adminAuth, adminCtrl.getConfigAdmin);
router.patch('/admin/config', adminAuth, adminCtrl.setConfigAdmin);
router.get('/admin/log', adminAuth, adminCtrl.listarLog);
router.get('/admin/export/usuarios', adminAuth, adminCtrl.exportarUsuarios);
router.get('/admin/export/transferencias', adminAuth, adminCtrl.exportarTransferencias);

// Promoción de usuario a admin (solo por consola / primer uso protegido por contraseña de env)
router.post('/admin/seed', async (req, res) => {
  const secret = process.env.ADMIN_SEED_SECRET;
  if (!secret || req.body.secret !== secret) return res.status(403).json({ error: 'Forbidden' });
  const db = require('../config/database');
  const result = await db.prepare('UPDATE users SET is_admin=1 WHERE email=?').run(req.body.email);
  if (result.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ok: true, mensaje: `${req.body.email} ahora es administrador` });
});

module.exports = router;
