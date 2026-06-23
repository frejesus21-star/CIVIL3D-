import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { fmtCLP, fmtVES, fmtFechaHora, ESTADO_COLOR, ESTADO_ICON } from '../utils/format';

const PASOS_ESTADO = ['pendiente', 'procesando', 'completada'];
const DESC_ESTADO = {
  pendiente: 'Recibida',
  procesando: 'Procesando',
  completada: 'Completada',
};

export default function DetalleTransferencia() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelando, setCancelando] = useState(false);
  const pollRef = useRef(null);

  function cargar() {
    return api.transferencia(id).then(setT).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { cargar(); }, [id]);

  // Refrescar mientras esté en curso, para ver avanzar el timeline
  useEffect(() => {
    if (t && (t.estado === 'pendiente' || t.estado === 'procesando')) {
      pollRef.current = setInterval(cargar, 2500);
      return () => clearInterval(pollRef.current);
    }
    clearInterval(pollRef.current);
  }, [t?.estado]);

  async function cancelar() {
    if (!confirm('¿Seguro que quieres cancelar esta transferencia?')) return;
    setCancelando(true);
    try {
      await api.cancelarTransferencia(id);
      await cargar();
    } catch (err) {
      alert(err.message);
    } finally {
      setCancelando(false);
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;
  if (!t) return <div className="text-center py-12"><p className="text-gray-500">Transferencia no encontrada</p><Link to="/historial" className="text-brand-600 hover:underline">← Volver</Link></div>;

  const cancelada = t.estado === 'cancelada' || t.estado === 'fallida';
  const idxActual = PASOS_ESTADO.indexOf(t.estado);

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="flex items-center gap-3 print:hidden">
        <Link to="/historial" className="text-gray-400 hover:text-gray-600">←</Link>
        <h1 className="text-xl font-bold flex-1">Detalle de transferencia</h1>
        <button onClick={() => window.print()} className="text-sm text-gray-500 hover:text-gray-900" title="Imprimir comprobante">🖨️</button>
      </div>

      {/* Estado destacado */}
      <div className="card text-center space-y-2">
        <div className="text-4xl">{ESTADO_ICON[t.estado]}</div>
        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${ESTADO_COLOR[t.estado]}`}>{t.estado}</span>
        <p className="text-2xl font-bold">{fmtVES(t.monto_ves)} Bs.</p>
        <p className="text-sm text-gray-500">${fmtCLP(t.monto_clp)} CLP enviados</p>
      </div>

      {/* Timeline de progreso */}
      {!cancelada && (
        <div className="card">
          <p className="font-semibold text-sm mb-4">Seguimiento</p>
          <div className="space-y-0">
            {PASOS_ESTADO.map((estado, i) => {
              const evento = t.eventos?.find(e => e.estado === estado);
              const alcanzado = idxActual >= i;
              const actual = idxActual === i && t.estado !== 'completada';
              return (
                <div key={estado} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${alcanzado ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-400'} ${actual ? 'animate-pulse' : ''}`}>
                      {alcanzado ? '✓' : i + 1}
                    </div>
                    {i < PASOS_ESTADO.length - 1 && <div className={`w-0.5 h-8 ${idxActual > i ? 'bg-brand-500' : 'bg-gray-200'}`} />}
                  </div>
                  <div className="pb-4">
                    <p className={`text-sm font-medium ${alcanzado ? 'text-gray-900' : 'text-gray-400'}`}>{DESC_ESTADO[estado]}</p>
                    {evento && <p className="text-xs text-gray-400">{evento.descripcion}</p>}
                    {evento && <p className="text-xs text-gray-300">{fmtFechaHora(evento.created_at)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Comprobante / detalle */}
      <div className="card space-y-0 divide-y divide-gray-100">
        <Fila k="Referencia" v={<span className="font-mono font-semibold">{t.referencia}</span>} />
        <Fila k="Fecha" v={fmtFechaHora(t.created_at)} />
        <Sep />
        <Fila k="Monto enviado" v={`$${fmtCLP(t.monto_clp)} CLP`} />
        <Fila k="Comisión" v={`-$${fmtCLP(t.comision_clp)} CLP`} />
        <Fila k="Equivalente USD" v={`$${t.monto_usd} USD`} />
        <Fila k="Destinatario recibe" v={<span className="font-bold text-brand-600">{fmtVES(t.monto_ves)} Bs.</span>} />
        <Sep />
        <Fila k="Tasa USD/CLP" v={fmtCLP(t.tasa_usd_clp)} />
        <Fila k="Tasa USD/VES (paralelo)" v={fmtCLP(t.tasa_usd_ves)} />
        <Sep />
        <Fila k="Desde" v={`${t.origen_banco} · ···${t.origen_numero.slice(-4)}`} />
        <Fila k="Titular" v={t.origen_titular} />
        <Sep />
        <Fila k="Destinatario" v={t.dest_nombre} />
        <Fila k="Tipo de pago" v={t.dest_tipo === 'pago_movil' ? '📱 Pago Móvil' : '🏦 Transferencia bancaria'} />
        <Fila k="Banco Venezuela" v={t.dest_banco} />
        {t.dest_numero && <Fila k="Número de cuenta" v={t.dest_numero} />}
        {t.dest_cedula && <Fila k="Cédula" v={t.dest_cedula} />}
        {t.dest_telefono && <Fila k="Teléfono" v={t.dest_telefono} />}
      </div>

      {t.estado === 'pendiente' && (
        <button onClick={cancelar} disabled={cancelando} className="w-full py-3 text-red-600 font-medium hover:bg-red-50 rounded-xl transition-colors print:hidden">
          {cancelando ? 'Cancelando...' : 'Cancelar transferencia'}
        </button>
      )}
    </div>
  );
}

const Fila = ({ k, v }) => (
  <div className="flex justify-between py-3 text-sm">
    <span className="text-gray-500">{k}</span>
    <span className="font-medium text-right">{v}</span>
  </div>
);
const Sep = () => <div className="h-1" />;
