const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.codigo = data.codigo;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),
  actualizarPerfil: (body) => request('/auth/perfil', { method: 'PATCH', body: JSON.stringify(body) }),
  cambiarPassword: (body) => request('/auth/cambiar-password', { method: 'POST', body: JSON.stringify(body) }),
  stats: () => request('/auth/stats'),

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

  // Admin
  adminStats: () => request('/admin/stats'),
  adminUsuarios: (page = 1, buscar = '') => request(`/admin/usuarios?page=${page}&buscar=${encodeURIComponent(buscar)}`),
  adminUsuario: (id) => request(`/admin/usuarios/${id}`),
  adminAprobarKYC: (id) => request(`/admin/usuarios/${id}/aprobar-kyc`, { method: 'POST' }),
  adminRechazarKYC: (id, motivo) => request(`/admin/usuarios/${id}/rechazar-kyc`, { method: 'POST', body: JSON.stringify({ motivo }) }),
  adminTransferencias: (page = 1, estado = '') => request(`/admin/transferencias?page=${page}&estado=${estado}`),
  adminActualizarTransferencia: (id, body) => request(`/admin/transferencias/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminTasas: () => request('/admin/tasas'),
  adminSetTasas: (body) => request('/admin/tasas', { method: 'POST', body: JSON.stringify(body) }),
  adminResetTasas: () => request('/admin/tasas/cache', { method: 'DELETE' }),
};
