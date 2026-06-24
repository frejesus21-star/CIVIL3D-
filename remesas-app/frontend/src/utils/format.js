// Formateadores y validadores compartidos en el frontend

export function fmtCLP(n) {
  return new Intl.NumberFormat('es-CL').format(Math.round(n || 0));
}

export function fmtVES(n) {
  return new Intl.NumberFormat('es-VE').format(Math.round(n || 0));
}

export function fmtFecha(iso) {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtFechaHora(iso) {
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// RUT chileno: formato y validación (módulo 11)
export function formatRut(value) {
  const clean = String(value).replace(/[^0-9kK]/g, '');
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return body + '-' + clean.slice(-1).toUpperCase();
}

export function validarRut(rut) {
  const clean = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return false;
  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === esperado;
}

export function validarCedulaVE(cedula) {
  const clean = String(cedula).replace(/[\s.-]/g, '').toUpperCase();
  return /^[VE]\d{6,9}$/.test(clean);
}

const PREFIJOS_PM = ['0412', '0414', '0416', '0424', '0426'];
export function validarTelefonoPM(telefono) {
  const clean = String(telefono).replace(/[\s.-]/g, '');
  return /^\d{11}$/.test(clean) && PREFIJOS_PM.includes(clean.slice(0, 4));
}

export const ESTADO_COLOR = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  procesando: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  fallida: 'bg-red-100 text-red-700',
  cancelada: 'bg-gray-100 text-gray-600',
};

export const ESTADO_ICON = {
  pendiente: '⏳', procesando: '🔄', completada: '✅', fallida: '❌', cancelada: '🚫',
};
