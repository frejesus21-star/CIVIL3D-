const crypto = require('crypto');

// TOTP (RFC 6238) compatible con Google Authenticator / Authy.
// Implementado con `crypto` nativo, sin dependencias externas.

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// Genera un secreto aleatorio en base32 (20 bytes = 160 bits)
function generarSecreto() {
  return base32Encode(crypto.randomBytes(20));
}

// Calcula el código TOTP para un contador (paso de 30s)
function generarCodigo(secretoB32, contador) {
  const key = base32Decode(secretoB32);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(contador / 0x100000000), 0);
  buf.writeUInt32BE(contador >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) |
              (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1000000).padStart(6, '0');
}

// Verifica un código permitiendo ±1 ventana (tolerancia de reloj)
function verificar(secretoB32, codigo, ventana = 1) {
  if (!codigo || !/^\d{6}$/.test(String(codigo).trim())) return false;
  const contadorActual = Math.floor(Date.now() / 1000 / 30);
  const objetivo = String(codigo).trim();
  for (let i = -ventana; i <= ventana; i++) {
    if (generarCodigo(secretoB32, contadorActual + i) === objetivo) return true;
  }
  return false;
}

// Construye el URI otpauth:// para apps de autenticación
function otpauthURI(secretoB32, email, emisor = 'RemesasVE') {
  const label = encodeURIComponent(`${emisor}:${email}`);
  const params = new URLSearchParams({ secret: secretoB32, issuer: emisor, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { generarSecreto, verificar, otpauthURI, generarCodigo };
