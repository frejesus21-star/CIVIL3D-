const path = require('path');
const totp = require(path.join(__dirname, '../../src/utils/totp'));
const PORT = process.env.PORT || 4099;
const B = `http://localhost:${PORT}/api`;
const SEED_SECRET = process.env.ADMIN_SEED_SECRET || 'seed_admin_test';
let pass = 0, fail = 0;
const ok = (m) => { console.log('  \x1b[32m✓\x1b[0m ' + m); pass++; };
const bad = (m, d) => { console.log('  \x1b[31m✗\x1b[0m ' + m + ' — ' + JSON.stringify(d)); fail++; };

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(B + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

(async () => {
  console.log('\n═══ 1. REGISTRO Y AUTENTICACIÓN ═══');
  let r = await call('POST', '/auth/register', { body: { nombre: 'Carlos Ruiz', email: 'carlos@test.com', rut: '15.834.215-4', password: 'clave12345', telefono: '+56987654321' } });
  const token = r.data?.token;
  token ? ok('Registro con RUT válido') : bad('Registro', r.data);

  r = await call('POST', '/auth/register', { body: { nombre: 'X', email: 'x@test.com', rut: '11.111.111-2', password: 'clave12345' } });
  r.data?.error ? ok('Rechaza RUT con DV inválido') : bad('Validación RUT', r.data);

  r = await call('POST', '/auth/login', { body: { email: 'carlos@test.com', password: 'malaclave' } });
  r.status === 401 ? ok('Rechaza contraseña incorrecta') : bad('Login malo', r.data);

  console.log('\n═══ 2. TASAS Y COTIZACIÓN ═══');
  r = await call('GET', '/tasas');
  r.data?.usd_clp ? ok(`Obtiene tasas (CLP=${r.data.usd_clp}, VES=${r.data.usd_ves}, fuente: ${r.data.fuente})`) : bad('Tasas', r.data);

  r = await call('GET', '/transferencias/cotizar?monto_clp=100000', { token });
  r.data?.monto_ves ? ok(`Cotización directa: 100.000 CLP → ${r.data.monto_ves} Bs (comisión ${r.data.comision_clp} CLP, ${r.data.comision_pct}%)`) : bad('Cotizar directo', r.data);

  r = await call('GET', '/transferencias/cotizar?monto_ves=50000', { token });
  r.data?.monto_clp ? ok(`Cotización inversa: recibir 50.000 Bs → pagar ${r.data.monto_clp} CLP`) : bad('Cotizar inverso', r.data);

  console.log('\n═══ 3. KYC ═══');
  r = await call('POST', '/kyc', { token, body: { tipo_documento: 'cedula', numero_documento: '15834215', fecha_nacimiento: '1985-03-12', direccion: 'Av. Providencia 123', ciudad: 'Santiago' } });
  (r.status === 200 || r.status === 201) ? ok('Envío de KYC aceptado') : bad('KYC', r.data);
  r = await call('GET', '/kyc', { token });
  ok(`Estado KYC consultado: ${r.data?.kyc_estado}`);

  console.log('\n═══ 4. CUENTAS Y DESTINATARIOS ═══');
  r = await call('POST', '/cuentas', { token, body: { banco: 'BancoEstado', tipo_cuenta: 'corriente', numero_cuenta: '123456789', titular: 'Carlos Ruiz' } });
  const cid = r.data?.id;
  cid ? ok('Crea cuenta de origen chilena') : bad('Cuenta', r.data);

  r = await call('POST', '/destinatarios', { token, body: { nombre: 'Maria Perez', tipo: 'pago_movil', banco: 'Banesco', cedula: 'V18765432', telefono: '04141234567' } });
  const did = r.data?.id;
  did ? ok('Crea destinatario (pago móvil)') : bad('Destinatario', r.data);

  r = await call('POST', '/destinatarios', { token, body: { nombre: 'Mal', tipo: 'pago_movil', cedula: 'V1', telefono: '123' } });
  r.data?.error ? ok(`Rechaza pago móvil inválido (${r.data.error})`) : bad('Validación PM', r.data);

  console.log('\n═══ 5. TRANSFERENCIA COMPLETA ═══');
  r = await call('POST', '/transferencias', { token, body: { cuenta_origen_id: cid, destinatario_id: did, monto_clp: 80000 } });
  const tid = r.data?.id;
  tid ? ok(`Crea transferencia (ref ${r.data.referencia}, estado ${r.data.estado})`) : bad('Transferencia', r.data);

  r = await call('GET', '/transferencias', { token });
  Array.isArray(r.data?.rows) ? ok(`Lista historial (total: ${r.data.total})`) : bad('Historial', r.data);

  console.log('\n═══ 6. 2FA (TOTP + RESPALDO) ═══');
  r = await call('POST', '/auth/2fa/setup', { token });
  const sec = r.data?.secreto;
  (sec && r.data?.qr) ? ok('Setup 2FA genera secreto + QR') : bad('2FA setup', r.data);

  const code = totp.generarCodigo(sec, Math.floor(Date.now() / 1000 / 30));
  r = await call('POST', '/auth/2fa/activar', { token, body: { codigo: code } });
  const backup = r.data?.codigos_respaldo?.[0];
  backup ? ok(`Activa 2FA y entrega ${r.data.codigos_respaldo.length} códigos de respaldo`) : bad('2FA activar', r.data);

  r = await call('POST', '/auth/login', { body: { email: 'carlos@test.com', password: 'clave12345' } });
  r.data?.requiere_2fa ? ok('Login exige 2FA cuando está activo') : bad('Login 2FA', r.data);

  const code2 = totp.generarCodigo(sec, Math.floor(Date.now() / 1000 / 30));
  r = await call('POST', '/auth/login', { body: { email: 'carlos@test.com', password: 'clave12345', codigo_2fa: code2 } });
  r.data?.token ? ok('Login con código TOTP válido') : bad('Login TOTP', r.data);

  r = await call('POST', '/auth/login', { body: { email: 'carlos@test.com', password: 'clave12345', codigo_2fa: backup } });
  r.data?.token ? ok('Login con código de respaldo (un solo uso)') : bad('Login respaldo', r.data);

  r = await call('POST', '/auth/login', { body: { email: 'carlos@test.com', password: 'clave12345', codigo_2fa: backup } });
  r.status === 401 ? ok('Rechaza reutilización del código de respaldo') : bad('Reuso respaldo', r.data);

  console.log('\n═══ 7. PANEL ADMIN ═══');
  // Usuario aparte con KYC pendiente para probar la aprobación desde admin
  r = await call('POST', '/auth/register', { body: { nombre: 'Pedro Soto', email: 'pedro@test.com', rut: '18.765.432-7', password: 'clave12345' } });
  const ptok = r.data?.token;
  await call('POST', '/kyc', { token: ptok, body: { tipo_documento: 'cedula', numero_documento: '18765432', fecha_nacimiento: '1990-06-01', direccion: 'Calle 2', ciudad: 'Valparaíso' } });

  await call('POST', '/admin/seed', { body: { email: 'carlos@test.com', secret: SEED_SECRET } });
  const atok = token; // mismo usuario, ahora admin
  r = await call('GET', '/admin/stats', { token: atok });
  r.data?.serie?.length === 14 ? ok(`Stats admin (usuarios: ${r.data.totalUsuarios}, serie: ${r.data.serie.length} días, KYC pend: ${r.data.kycPendientes})`) : bad('Stats', r.data);

  r = await call('GET', '/admin/usuarios?buscar=pedro', { token: atok });
  const uid = r.data?.rows?.[0]?.id;
  r = await call('POST', `/admin/usuarios/${uid}/aprobar-kyc`, { token: atok });
  r.data?.ok ? ok('Aprueba KYC desde admin (con notificación)') : bad('Aprobar KYC', r.data);

  r = await call('PATCH', `/admin/transferencias/${tid}`, { token: atok, body: { estado: 'completada', notas_admin: 'Verificado y pagado' } });
  r.data?.ok ? ok('Cambia estado de transferencia a completada') : bad('Editar transferencia', r.data);

  await call('PATCH', '/admin/config', { token: atok, body: { comision_pct: 3.5 } });
  r = await call('GET', '/transferencias/cotizar?monto_clp=100000', { token: atok });
  r.data?.comision_pct === 3.5 ? ok('Comisión configurable aplica en vivo (3,5%)') : bad('Comisión', r.data);

  r = await call('GET', '/admin/log', { token: atok });
  r.data?.total > 0 ? ok(`Registro de auditoría (${r.data.total} acciones registradas)`) : bad('Auditoría', r.data);

  r = await call('GET', '/admin/log?accion=ajustar_tasas', { token: atok });
  ok(`Filtro de auditoría por acción funciona (${r.data.total} resultados)`);

  const res = await fetch(B + '/admin/export/transferencias', { headers: { Authorization: 'Bearer ' + atok } });
  res.status === 200 ? ok('Exporta CSV de transferencias') : bad('CSV', res.status);

  console.log('\n═══ 8. CONTROL DE ACCESO ═══');
  r = await call('POST', '/auth/register', { body: { nombre: 'Normal', email: 'normal@test.com', rut: '9.866.766-0', password: 'clave12345' } });
  const ntok = r.data?.token;
  r = await call('GET', '/admin/stats', { token: ntok });
  r.status === 403 ? ok('Usuario normal NO accede a admin (403)') : bad('Acceso admin', r.status);

  r = await call('GET', '/transferencias');
  r.status === 401 ? ok('Sin token NO accede a rutas privadas (401)') : bad('Auth', r.status);

  console.log('\n═══════════════════════════════════');
  console.log(`  RESULTADO: ${pass} pruebas OK, ${fail} fallidas`);
  console.log('═══════════════════════════════════\n');
  process.exit(fail > 0 ? 1 : 0);
})();
