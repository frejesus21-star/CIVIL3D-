const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

// Construye un query string omitiendo valores vacíos
function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.mensaje || `Error ${res.status}`);
    err.codigo = data.codigo;
    err.status = res.status;
    err.requiere_2fa = data.requiere_2fa;
    throw err;
  }
  return data;
}

// Descarga un archivo (CSV) autenticado y dispara el guardado en el navegador
async function descargar(path, filename) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { headers });
  if (!res.ok) throw new Error(`Error ${res.status} al descargar`);
  const blob = await res.blob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  // Auth
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),
  actualizarPerfil: (body) => request('/auth/perfil', { method: 'PATCH', body: JSON.stringify(body) }),
  cambiarPassword: (body) => request('/auth/cambiar-password', { method: 'POST', body: JSON.stringify(body) }),
  stats: () => request('/auth/stats'),
  verificarEmail: (token) => request('/auth/verificar-email', { method: 'POST', body: JSON.stringify({ token }) }),
  reenviarVerificacion: () => request('/auth/reenviar-verificacion', { method: 'POST' }),
  recuperarPassword: (email) => request('/auth/recuperar', { method: 'POST', body: JSON.stringify({ email }) }),
  restablecerPassword: (token, password) => request('/auth/restablecer', { method: 'POST', body: JSON.stringify({ token, password }) }),

  // 2FA
  estado2FA: () => request('/auth/2fa'),
  setup2FA: () => request('/auth/2fa/setup', { method: 'POST' }),
  activar2FA: (codigo) => request('/auth/2fa/activar', { method: 'POST', body: JSON.stringify({ codigo }) }),
  desactivar2FA: (password) => request('/auth/2fa/desactivar', { method: 'POST', body: JSON.stringify({ password }) }),
  regenerarCodigos2FA: (password) => request('/auth/2fa/regenerar-codigos', { method: 'POST', body: JSON.stringify({ password }) }),

  // KYC
  kyc: () => request('/kyc'),
  enviarKyc: (body) => request('/kyc', { method: 'POST', body: JSON.stringify(body) }),

  // Notificaciones
  notificaciones: () => request('/notificaciones'),
  contadorNotificaciones: () => request('/notificaciones/contador'),
  marcarLeida: (id) => request(`/notificaciones/${id}/leida`, { method: 'POST' }),
  leerTodas: () => request('/notificaciones/leer-todas', { method: 'POST' }),

  // Datos de referencia
  tasas: () => request('/tasas'),
  bancosChile: () => request('/bancos/chile'),
  bancosVenezuela: () => request('/bancos/venezuela'),

  // Cuentas
  cuentas: () => request('/cuentas'),
  crearCuenta: (body) => request('/cuentas', { method: 'POST', body: JSON.stringify(body) }),
  eliminarCuenta: (id) => request(`/cuentas/${id}`, { method: 'DELETE' }),

  // Destinatarios
  destinatarios: () => request('/destinatarios'),
  crearDestinatario: (body) => request('/destinatarios', { method: 'POST', body: JSON.stringify(body) }),
  favoritoDestinatario: (id) => request(`/destinatarios/${id}/favorito`, { method: 'POST' }),
  eliminarDestinatario: (id) => request(`/destinatarios/${id}`, { method: 'DELETE' }),

  // Transferencias
  cotizar: (monto_clp) => request(`/transferencias/cotizar?monto_clp=${monto_clp}`),
  cotizarInverso: (monto_ves) => request(`/transferencias/cotizar?monto_ves=${monto_ves}`),
  transferencias: (page = 1, estado) => request(`/transferencias?page=${page}${estado ? `&estado=${estado}` : ''}`),
  crearTransferencia: (body) => request('/transferencias', { method: 'POST', body: JSON.stringify(body) }),
  transferencia: (id) => request(`/transferencias/${id}`),
  cancelarTransferencia: (id) => request(`/transferencias/${id}/cancelar`, { method: 'POST' }),
  iniciarPagoKhipu: (id) => request(`/transferencias/${id}/iniciar-pago`, { method: 'POST' }),

  // Admin
  adminStats: () => request('/admin/stats'),
  adminUsuarios: (page = 1, buscar = '') => request(`/admin/usuarios?page=${page}&buscar=${encodeURIComponent(buscar)}`),
  adminUsuario: (id) => request(`/admin/usuarios/${id}`),
  adminAprobarKYC: (id) => request(`/admin/usuarios/${id}/aprobar-kyc`, { method: 'POST' }),
  adminRechazarKYC: (id, motivo) => request(`/admin/usuarios/${id}/rechazar-kyc`, { method: 'POST', body: JSON.stringify({ motivo }) }),
  adminTransferencias: (page = 1, estado = '', desde = '', hasta = '') => request(`/admin/transferencias?${qs({ page, estado, desde, hasta })}`),
  adminActualizarTransferencia: (id, body) => request(`/admin/transferencias/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminTasas: () => request('/admin/tasas'),
  adminSetTasas: (body) => request('/admin/tasas', { method: 'POST', body: JSON.stringify(body) }),
  adminResetTasas: () => request('/admin/tasas/cache', { method: 'DELETE' }),
  descargarComprobante: (id, ref) => descargar(`/transferencias/${id}/comprobante`, `comprobante_${ref}.pdf`),
  configPublica: () => request('/config/publica'),
  adminConfig: () => request('/admin/config'),
  adminOperacionesVE: (estado = 'pagado') => request(`/admin/operaciones-ve?estado=${estado}`),
  adminRegistrarPagoVE: (id, body) => request(`/admin/operaciones-ve/${id}/pagar`, { method: 'POST', body: JSON.stringify(body) }),
  adminLiquidez: () => request('/admin/liquidez'),
  adminLog: (page = 1, accion = '', desde = '', hasta = '') => request(`/admin/log?${qs({ page, accion, desde, hasta })}`),
  adminDescargarCSV: (recurso, filtros = {}) => descargar(`/admin/export/${recurso}?${qs(filtros)}`, `${recurso}.csv`),
  adminSetConfig: (body) => request('/admin/config', { method: 'PATCH', body: JSON.stringify(body) }),
};
