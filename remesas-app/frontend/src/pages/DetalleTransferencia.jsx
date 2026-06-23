import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';

function fmt(n) { return new Intl.NumberFormat('es-CL').format(Math.round(n)); }
function fmtVes(n) { return new Intl.NumberFormat('es-VE').format(Math.round(n)); }

const estadoColor = { pendiente:'bg-yellow-100 text-yellow-700', procesando:'bg-blue-100 text-blue-700', completada:'bg-green-100 text-green-700', fallida:'bg-red-100 text-red-700' };

export default function DetalleTransferencia() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.transferencia(id).then(setT).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;
  if (!t) return <div className="text-center py-12"><p className="text-gray-500">Transferencia no encontrada</p><Link to="/historial" className="text-brand-600 hover:underline">← Volver</Link></div>;

  const filas = [
    ['Referencia', <span className="font-mono font-semibold">{t.referencia}</span>],
    ['Fecha', new Date(t.created_at).toLocaleString('es-CL')],
    ['Estado', <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoColor[t.estado]}`}>{t.estado}</span>],
    null,
    ['Monto enviado', `$${fmt(t.monto_clp)} CLP`],
    ['Comisión', `-$${fmt(t.comision_clp)} CLP`],
    ['Neto', `$${fmt(t.monto_clp - t.comision_clp)} CLP`],
    ['Equivalente USD', `$${t.monto_usd} USD`],
    ['El destinatario recibe', <span className="font-bold text-brand-600">{fmtVes(t.monto_ves)} Bs.</span>],
    null,
    ['Tasa USD/CLP', fmt(t.tasa_usd_clp)],
    ['Tasa USD/VES (paralelo)', fmt(t.tasa_usd_ves)],
    null,
    ['Desde', `${t.origen_banco} · ${t.origen_tipo} ···${t.origen_numero.slice(-4)}`],
    ['Titular cuenta', t.origen_titular],
    null,
    ['Destinatario', t.dest_nombre],
    ['Tipo de pago', t.dest_tipo === 'pago_movil' ? '📱 Pago Móvil' : '🏦 Transferencia bancaria'],
    ['Banco Venezuela', t.dest_banco],
    t.dest_numero && ['Número de cuenta', t.dest_numero],
    t.dest_cedula && ['Cédula', t.dest_cedula],
    t.dest_telefono && ['Teléfono', t.dest_telefono],
  ].filter(Boolean);

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/historial" className="text-gray-400 hover:text-gray-600">←</Link>
        <h1 className="text-xl font-bold">Detalle de transferencia</h1>
      </div>
      <div className="card space-y-0 divide-y divide-gray-100">
        {filas.map((fila, i) =>
          fila === null ? <div key={i} className="h-0" /> : (
            <div key={i} className="flex justify-between py-3 text-sm">
              <span className="text-gray-500">{fila[0]}</span>
              <span className="font-medium text-right">{fila[1]}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
