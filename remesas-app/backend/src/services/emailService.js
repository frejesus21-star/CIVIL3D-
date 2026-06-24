const nodemailer = require('nodemailer');

// Transporte configurable. Si hay credenciales SMTP en el entorno, envía de
// verdad; si no, usa un transporte "jsonTransport" que no contacta ninguna red
// y deja el correo registrado en consola (modo desarrollo / sandbox).
const SMTP_HOST = process.env.SMTP_HOST;
const FROM = process.env.SMTP_FROM || 'RemesasVE <no-reply@remesasve.app>';

let transporter;
let modoReal = false;

if (SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  modoReal = true;
} else {
  transporter = nodemailer.createTransport({ jsonTransport: true });
}

// Plantilla HTML simple y responsive, coherente con la marca.
function plantilla({ titulo, saludo, cuerpo, cta }) {
  return `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#0d9488;border-radius:12px 12px 0 0;padding:20px 28px;">
      <span style="color:#fff;font-size:20px;font-weight:bold;">💸 RemesasVE</span>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px;">
      <h1 style="font-size:18px;color:#111827;margin:0 0 8px;">${titulo}</h1>
      <p style="color:#374151;font-size:14px;margin:0 0 16px;">${saludo}</p>
      <div style="color:#374151;font-size:14px;line-height:1.6;">${cuerpo}</div>
      ${cta ? `<div style="margin-top:24px;"><a href="${cta.url}" style="background:#0d9488;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;">${cta.texto}</a></div>` : ''}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">Este es un mensaje automático de RemesasVE. Por favor no respondas a este correo.</p>
    </div>
  </div></body></html>`;
}

// Envía un email. Nunca lanza: un fallo de correo no debe romper la operación.
async function enviar({ to, subject, html }) {
  if (!to) return { ok: false, motivo: 'sin destinatario' };
  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    if (!modoReal) {
      console.log(`[email:simulado] → ${to} | ${subject}`);
    }
    return { ok: true, modoReal, messageId: info.messageId };
  } catch (err) {
    console.error('[email:error]', err.message);
    return { ok: false, motivo: err.message };
  }
}

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

const plantillas = {
  bienvenida: (nombre) => ({
    subject: '¡Bienvenido a RemesasVE! 🎉',
    html: plantilla({
      titulo: '¡Tu cuenta está lista!',
      saludo: `Hola ${nombre},`,
      cuerpo: 'Gracias por unirte a RemesasVE. Ya puedes enviar dinero de Chile a Venezuela de forma rápida y segura. Verifica tu identidad para aumentar tus límites de envío.',
      cta: { texto: 'Ir a mi cuenta', url: APP_URL },
    }),
  }),
  transferencia_completada: (nombre, t) => ({
    subject: `Transferencia completada · ${t.referencia}`,
    html: plantilla({
      titulo: 'Tu transferencia fue completada ✅',
      saludo: `Hola ${nombre},`,
      cuerpo: `Tu envío con referencia <strong>${t.referencia}</strong> se completó correctamente.<br><br>
        Monto enviado: <strong>$${new Intl.NumberFormat('es-CL').format(t.monto_clp)} CLP</strong><br>
        Monto recibido: <strong>${new Intl.NumberFormat('es-VE').format(Math.round(t.monto_ves))} Bs</strong>`,
      cta: { texto: 'Ver comprobante', url: `${APP_URL}/historial/${t.id}` },
    }),
  }),
  verificar_email: (nombre, token) => ({
    subject: 'Confirma tu correo · RemesasVE',
    html: plantilla({
      titulo: 'Confirma tu dirección de correo',
      saludo: `Hola ${nombre},`,
      cuerpo: 'Para activar todas las funciones de tu cuenta, confirma que este correo te pertenece. El enlace vence en 24 horas.',
      cta: { texto: 'Confirmar mi correo', url: `${APP_URL}/verificar-email?token=${token}` },
    }),
  }),
  recuperar_password: (nombre, token) => ({
    subject: 'Restablece tu contraseña · RemesasVE',
    html: plantilla({
      titulo: 'Restablecer contraseña',
      saludo: `Hola ${nombre},`,
      cuerpo: 'Recibimos una solicitud para restablecer tu contraseña. Si fuiste tú, usa el siguiente botón. El enlace vence en 1 hora. Si no fuiste tú, ignora este correo: tu contraseña no cambiará.',
      cta: { texto: 'Crear nueva contraseña', url: `${APP_URL}/restablecer?token=${token}` },
    }),
  }),
  kyc_aprobado: (nombre) => ({
    subject: 'Verificación aprobada ✅',
    html: plantilla({
      titulo: 'Tu identidad fue verificada',
      saludo: `Hola ${nombre},`,
      cuerpo: 'Tu verificación de identidad fue aprobada. Ahora tienes acceso a límites de envío ampliados.',
      cta: { texto: 'Hacer una transferencia', url: `${APP_URL}/transferir` },
    }),
  }),
  kyc_rechazado: (nombre, motivo) => ({
    subject: 'Verificación rechazada',
    html: plantilla({
      titulo: 'No pudimos verificar tu identidad',
      saludo: `Hola ${nombre},`,
      cuerpo: `Tu verificación fue rechazada por el siguiente motivo:<br><br><em>${motivo || 'No se pudo verificar la información proporcionada.'}</em><br><br>Puedes volver a enviar tus datos corregidos.`,
      cta: { texto: 'Reintentar verificación', url: `${APP_URL}/verificacion` },
    }),
  }),
};

// Envía una plantilla a un usuario por su id (busca su email/nombre).
// Async sin await en el llamador: el correo se manda en segundo plano.
async function enviarPlantilla(userId, key, ...args) {
  try {
    const db = require('../config/database');
    const user = await db.prepare('SELECT email, nombre FROM users WHERE id=?').get(userId);
    if (!user || !user.email) return;
    const tpl = plantillas[key];
    if (!tpl) return;
    const { subject, html } = tpl(user.nombre, ...args);
    // No bloquea al llamador: se resuelve en segundo plano
    await enviar({ to: user.email, subject, html });
  } catch (err) {
    console.error('[email:plantilla:error]', err.message);
  }
}

// Verifica la conexión con el servidor SMTP (útil para diagnosticar config).
async function verificarConexion() {
  if (!modoReal) return { ok: false, modoReal: false, mensaje: 'SMTP no configurado: los correos se simulan en consola.' };
  try {
    await transporter.verify();
    return { ok: true, modoReal: true, mensaje: 'Conexión SMTP correcta.' };
  } catch (err) {
    return { ok: false, modoReal: true, mensaje: `Error de conexión SMTP: ${err.message}` };
  }
}

module.exports = { enviar, enviarPlantilla, plantillas, modoReal, verificarConexion };
