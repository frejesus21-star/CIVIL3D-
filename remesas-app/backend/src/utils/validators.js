// Validadores específicos para Chile y Venezuela

// RUT chileno con dígito verificador (módulo 11)
function validarRut(rut) {
  if (!rut) return false;
  const clean = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return false;
  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;

  let suma = 0;
  let mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const resto = 11 - (suma % 11);
  const dvEsperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === dvEsperado;
}

function limpiarRut(rut) {
  return String(rut).replace(/[^0-9Kk]/g, '').toUpperCase();
}

// Cédula venezolana: V o E + 6 a 9 dígitos
function validarCedulaVE(cedula) {
  if (!cedula) return false;
  const clean = String(cedula).replace(/[\s.-]/g, '').toUpperCase();
  return /^[VE]\d{6,9}$/.test(clean);
}

// Teléfono de pago móvil venezolano: prefijos 0412/0414/0416/0424/0426 + 7 dígitos
const PREFIJOS_PM = ['0412', '0414', '0416', '0424', '0426'];
function validarTelefonoPM(telefono) {
  if (!telefono) return false;
  const clean = String(telefono).replace(/[\s.-]/g, '');
  if (!/^\d{11}$/.test(clean)) return false;
  return PREFIJOS_PM.includes(clean.slice(0, 4));
}

// Email básico
function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

// Edad mínima (18 años) a partir de fecha YYYY-MM-DD
function esMayorDeEdad(fechaNacimiento) {
  if (!fechaNacimiento) return false;
  const fn = new Date(fechaNacimiento);
  if (isNaN(fn.getTime())) return false;
  const hoy = new Date();
  let edad = hoy.getFullYear() - fn.getFullYear();
  const m = hoy.getMonth() - fn.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) edad--;
  return edad >= 18;
}

module.exports = {
  validarRut, limpiarRut, validarCedulaVE, validarTelefonoPM,
  validarEmail, esMayorDeEdad, PREFIJOS_PM,
};
