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
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const api = {
  // Auth
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),

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
  eliminarDestinatario: (id) => request(`/destinatarios/${id}`, { method: 'DELETE' }),

  // Transferencias
  cotizar: (monto_clp) => request(`/transferencias/cotizar?monto_clp=${monto_clp}`),
  transferencias: (page = 1) => request(`/transferencias?page=${page}`),
  crearTransferencia: (body) => request('/transferencias', { method: 'POST', body: JSON.stringify(body) }),
  transferencia: (id) => request(`/transferencias/${id}`),
};
