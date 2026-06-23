#!/usr/bin/env node
/**
 * Verifica la configuración de email y envía un correo de prueba.
 *
 * Uso:
 *   node scripts/test-email.js destinatario@ejemplo.com
 *
 * Lee la configuración SMTP de las variables de entorno (o de .env).
 * Si no hay SMTP configurado, avisa que está en modo simulado.
 */
require('dotenv').config();
const mailer = require('../src/services/emailService');

async function main() {
  const to = process.argv[2];

  console.log(`Modo: ${mailer.modoReal ? 'SMTP real' : 'simulado (sin SMTP_HOST)'}`);

  const estado = await mailer.verificarConexion();
  console.log(`Conexión: ${estado.ok ? '✓' : '✗'} ${estado.mensaje}`);

  if (!to) {
    console.log('\nSugerencia: pasa un destinatario para enviar un correo de prueba:');
    console.log('  node scripts/test-email.js tu@correo.com');
    return;
  }

  const { subject, html } = mailer.plantillas.bienvenida('Prueba');
  const r = await mailer.enviar({ to, subject, html });
  if (r.ok) {
    console.log(`\n✓ Correo de prueba ${mailer.modoReal ? 'enviado' : 'simulado'} a ${to} (id: ${r.messageId || '—'})`);
  } else {
    console.log(`\n✗ No se pudo enviar: ${r.motivo}`);
    process.exit(1);
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
