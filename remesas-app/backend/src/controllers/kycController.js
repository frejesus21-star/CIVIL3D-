const db = require('../config/database');
const { esMayorDeEdad } = require('../utils/validators');
const { getResumen, getLimites } = require('../services/limitsService');
const notif = require('../services/notificationService');

async function estado(req, res) {
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  res.json({
    kyc_estado: user.kyc_estado,
    kyc_nivel: user.kyc_nivel,
    fecha_nacimiento: user.fecha_nacimiento,
    direccion: user.direccion,
    ciudad: user.ciudad,
    tipo_documento: user.tipo_documento,
    numero_documento: user.numero_documento,
    resumen: await getResumen(user),
    nivel_objetivo: { nivel: 2, ...getLimites(2) },
  });
}

// Enviar verificación. Simulación: pasa a 'en_revision' y se auto-aprueba tras unos segundos.
async function enviar(req, res) {
  const { fecha_nacimiento, direccion, ciudad, tipo_documento, numero_documento, foto_documento, foto_selfie } = req.body;

  if (!fecha_nacimiento || !direccion || !ciudad || !tipo_documento || !numero_documento) {
    return res.status(400).json({ error: 'Todos los campos de verificación son requeridos' });
  }
  if (!foto_documento || !foto_selfie) {
    return res.status(400).json({ error: 'Debes adjuntar foto de tu documento y una selfie sosteniéndolo' });
  }
  if (!esMayorDeEdad(fecha_nacimiento)) {
    return res.status(400).json({ error: 'Debes ser mayor de 18 años para usar el servicio' });
  }

  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  if (user.kyc_estado === 'verificado') {
    return res.status(409).json({ error: 'Tu identidad ya está verificada' });
  }

  await db.prepare(`
    UPDATE users SET kyc_estado='en_revision',
      fecha_nacimiento=?, direccion=?, ciudad=?, tipo_documento=?, numero_documento=?,
      kyc_foto_documento=?, kyc_foto_selfie=?
    WHERE id=?
  `).run(fecha_nacimiento, direccion, ciudad, tipo_documento, numero_documento, foto_documento, foto_selfie, req.userId);

  notif.crear(req.userId, {
    tipo: 'kyc',
    titulo: 'Verificación recibida 🔎',
    mensaje: 'Estamos revisando tus datos y documentos. Te notificaremos cuando esté aprobado (1-24 horas hábiles).',
  });

  const actualizado = await db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  res.json({ kyc_estado: actualizado.kyc_estado, mensaje: 'Verificación enviada. Un agente revisará tus documentos pronto.' });
}

module.exports = { estado, enviar };
