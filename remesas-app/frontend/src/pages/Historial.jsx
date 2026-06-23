import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

function fmt(n) { return new Intl.NumberFormat('es-CL').format(Math.round(n)); }
function fmtVes(n) { return new Intl.NumberFormat('es-VE').format(Math.round(n)); }

const estadoColor = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  procesando: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  fallida: 'bg-red-100 text-red-700',
};
const estadoIcon = { pendiente: '⏳', procesando: '🔄', completada: '✅', fallida: '❌' };

export default function Historial() {
  const [data, setData] = useState({ rows: [], total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.transferencias(page).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Historial</h1>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : data.rows.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500">No tienes transferencias aún</p>
          <Link to="/transferir" className="btn-primary mt-4 inline-flex">Hacer primera transferencia</Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">{data.total} transferencia{data.total !== 1 ? 's' : ''} en total</p>
          <div className="space-y-3">
            {data.rows.map(t => (
              <Link key={t.id} to={`/historial/${t.id}`} className="card flex items-center gap-4 hover:shadow-md transition-shadow block">
                <div className="text-2xl">{estadoIcon[t.estado]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm truncate">{t.dest_nombre}</p>
                    <p className="font-bold text-sm ml-2 flex-shrink-0">${fmt(t.monto_clp)} CLP</p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div>
                      <p className="text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      <p className="text-xs text-gray-400">{t.dest_tipo === 'pago_movil' ? '📱 Pago Móvil' : '🏦 Banco'} · {t.dest_banco}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoColor[t.estado]}`}>{t.estado}</span>
                      <p className="text-xs text-brand-600 font-medium mt-0.5">{fmtVes(t.monto_ves)} Bs.</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {data.pages > 1 && (
            <div className="flex justify-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary px-3 py-1.5 text-sm">← Anterior</button>
              <span className="flex items-center text-sm text-gray-500">{page} / {data.pages}</span>
              <button disabled={page === data.pages} onClick={() => setPage(p => p + 1)} className="btn-secondary px-3 py-1.5 text-sm">Siguiente →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
