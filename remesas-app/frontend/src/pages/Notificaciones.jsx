import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { fmtFechaHora } from '../utils/format';

const ICONO = {
  bienvenida: '🎉', kyc: '🪪', transferencia: '💸', info: 'ℹ️',
};

export default function Notificaciones() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  function cargar() {
    api.notificaciones().then(r => setItems(r.notificaciones)).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { cargar(); }, []);

  async function abrir(n) {
    if (!n.leida) {
      await api.marcarLeida(n.id).catch(() => {});
      setItems(items.map(x => x.id === n.id ? { ...x, leida: true } : x));
    }
    if (n.meta?.transferencia_id) navigate(`/historial/${n.meta.transferencia_id}`);
  }

  async function leerTodas() {
    await api.leerTodas().catch(() => {});
    setItems(items.map(x => ({ ...x, leida: true })));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notificaciones</h1>
        {items.some(i => !i.leida) && (
          <button onClick={leerTodas} className="text-sm text-brand-600 hover:underline">Marcar todas como leídas</button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔔</div>
          <p className="text-gray-500">No tienes notificaciones</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(n => (
            <button key={n.id} onClick={() => abrir(n)}
              className={`card w-full text-left flex items-start gap-3 hover:shadow-md transition-shadow ${!n.leida ? 'border-brand-200 bg-brand-50/40' : ''}`}>
              <div className="text-xl flex-shrink-0">{ICONO[n.tipo] || 'ℹ️'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{n.titulo}</p>
                  {!n.leida && <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />}
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{n.mensaje}</p>
                <p className="text-xs text-gray-400 mt-1">{fmtFechaHora(n.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
