const PDFDocument = require('pdfkit');

const BRAND = '#0d9488';
const GRAY = '#6b7280';
const DARK = '#111827';

function fmtCLP(n) {
  return '$' + new Intl.NumberFormat('es-CL').format(Math.round(n || 0));
}
function fmtVES(n) {
  return new Intl.NumberFormat('es-VE').format(Math.round(n || 0)) + ' Bs';
}
function fmtFecha(s) {
  if (!s) return '-';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' });
}

const ESTADO_LABEL = {
  pendiente: 'Pendiente', procesando: 'En proceso', completada: 'Completada',
  fallida: 'Fallida', cancelada: 'Cancelada',
};

// Genera el comprobante de una transferencia y lo escribe en el stream `res`.
function generar(t, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  // Encabezado
  doc.fillColor(BRAND).fontSize(22).font('Helvetica-Bold').text('RemesasVE', 50, 50);
  doc.fillColor(GRAY).fontSize(10).font('Helvetica').text('Comprobante de transferencia', 50, 78);
  doc.fillColor(GRAY).fontSize(9)
    .text(`Emitido: ${fmtFecha(new Date().toISOString())}`, 50, 78, { align: 'right' });

  doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#e5e7eb').stroke();

  // Estado + referencia
  doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold').text('Referencia', 50, 120);
  doc.fillColor(BRAND).fontSize(13).text(t.referencia, 50, 135);
  doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold').text('Estado', 0, 120, { align: 'right' });
  doc.fillColor(GRAY).fontSize(13).font('Helvetica').text(ESTADO_LABEL[t.estado] || t.estado, 0, 135, { align: 'right' });

  // Bloque de montos
  let y = 175;
  doc.roundedRect(50, y, 495, 90, 8).fill('#f0fdfa');
  doc.fillColor(GRAY).fontSize(10).font('Helvetica').text('Monto enviado', 70, y + 18);
  doc.fillColor(DARK).fontSize(20).font('Helvetica-Bold').text(fmtCLP(t.monto_clp), 70, y + 32);
  doc.fillColor(GRAY).fontSize(10).font('Helvetica').text('Monto recibido', 0, y + 18, { align: 'right', width: 525 });
  doc.fillColor(BRAND).fontSize(20).font('Helvetica-Bold').text(fmtVES(t.monto_ves), 0, y + 32, { align: 'right', width: 525 });

  // Detalle de la operación
  y += 115;
  const filas = [
    ['Comisión', fmtCLP(t.comision_clp)],
    ['Tasa USD/CLP', new Intl.NumberFormat('es-CL').format(t.tasa_usd_clp)],
    ['Tasa USD/VES (paralelo)', new Intl.NumberFormat('es-VE').format(t.tasa_usd_ves)],
    ['Monto en USD', 'US$ ' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(t.monto_usd)],
    ['Fecha de creación', fmtFecha(t.created_at)],
  ];
  doc.fillColor(DARK).fontSize(12).font('Helvetica-Bold').text('Detalle de la operación', 50, y);
  y += 22;
  for (const [k, v] of filas) {
    doc.fillColor(GRAY).fontSize(10).font('Helvetica').text(k, 50, y);
    doc.fillColor(DARK).font('Helvetica-Bold').text(v, 0, y, { align: 'right', width: 495 });
    y += 20;
  }

  // Origen y destino
  y += 15;
  doc.fillColor(DARK).fontSize(12).font('Helvetica-Bold').text('Cuenta de origen (Chile)', 50, y);
  doc.fillColor(DARK).text('Destinatario (Venezuela)', 300, y);
  y += 20;
  const origen = [
    ['Titular', t.origen_titular],
    ['Banco', t.origen_banco],
    ['Cuenta', `${t.origen_tipo} ${t.origen_numero}`],
  ];
  const destino = t.dest_tipo === 'pago_movil'
    ? [['Nombre', t.dest_nombre], ['Tipo', 'Pago Móvil'], ['Cédula', t.dest_cedula], ['Teléfono', t.dest_telefono]]
    : [['Nombre', t.dest_nombre], ['Banco', t.dest_banco], ['Cédula', t.dest_cedula], ['Cuenta', t.dest_numero]];

  let yO = y, yD = y;
  for (const [k, v] of origen) {
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(`${k}: `, 50, yO, { continued: true }).fillColor(DARK).font('Helvetica-Bold').text(v || '-');
    yO += 16;
  }
  for (const [k, v] of destino) {
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(`${k}: `, 300, yD, { continued: true }).fillColor(DARK).font('Helvetica-Bold').text(v || '-');
    yD += 16;
  }

  // Pie
  doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(
    'Este comprobante es generado automáticamente por RemesasVE. Conserva la referencia para cualquier consulta. ' +
    'Las tasas mostradas corresponden al dólar paralelo vigente al momento de la operación.',
    50, 760, { align: 'center', width: 495 }
  );

  doc.end();
}

module.exports = { generar };
