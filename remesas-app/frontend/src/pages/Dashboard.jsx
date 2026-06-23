import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

function fmt(n) { return new Intl.NumberFormat('es-CL').format(Math.round(n)); }

export default function Dashboard() {
  const { user } = useAuth();
  const [tasas, setTasas] = useState(null);
  const [ultimas, setUltimas] = useState([]);
  const [loadingTasas, setLoadingTasas] = useState(true);

  useEffect(() => {
    api.tasas().then(setTasas).catch(() => {}).finally(() => setLoadingTasas(false));
    api.transferencias(1).then(r => setUltimas(r.rows.slice(0, 3))).catch(() => {});
  }, []);

  const estadoColor = { pendiente: 'bg-yellow-100 text-yellow-700', procesando: 'bg-blue-100 text-blue-700', completada: 'bg-green-100 text-green-700', fallida: 'bg-red-100 text-red-700' };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {user?.nombre?.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm">Bienvenido a RemesasVE</p>
      </div>

      {/* Tasas del día */}
      <div className="card bg-gradient-to-r from-brand-600 to-brand-700 text-white border-0">
        <p className="text-brand-100 text-sm font-medium mb-3">Tasas del día</p>
        {loadingTasas ? (
          <div className="text-brand-200 text-sm">Cargando tasas...</div>
        ) : tasas ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-brand-200 text-xs">1 USD =</p>
              <p className="text-2xl font-bold">${fmt(tasas.usd_clp)} CLP</p>
            </div>
            <div>
              <p className="text-brand-200 text-xs">1 USD = (paralelo)</p>
              <p className="text-2xl font-bold">{fmt(tasas.usd_ves)} Bs.</p>
            </div>
          </div>
        ) : (
          <div className="text-brand-200 text-sm">No se pudo obtener la tasa</div>
        )}
        {tasas && <p className="text-brand-200 text-xs mt-2">Fuente: {tasas.fuente}</p>}
      </div>

      {/* Acción principal */}
      <Link to="/transferir" className="btn-primary w-full text-base py-4 shadow-lg shadow-brand-200">
        💸 Enviar dinero a Venezuela
      </Link>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/cuentas" className="card hover:shadow-md transition-shadow text-center">
          <div className="text-2xl mb-1">🏦</div>
          <p className="text-sm font-medium">Mis cuentas</p>
          <p className="text-xs text-gray-400">Chile</p>
        </Link>
        <Link to="/destinatarios" className="card hover:shadow-md transition-shadow text-center">
          <div className="text-2xl mb-1">👥</div>
          <p className="text-sm font-medium">Destinatarios</p>
          <p className="text-xs text-gray-400">Venezuela</p>
        </Link>
      </div>

      {/* Últimas transferencias */}
      {ultimas.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Últimas transferencias</h2>
            <Link to="/historial" className="text-sm text-brand-600 hover:underline">Ver todas</Link>
          </div>
          <div className="space-y-2">
            {ultimas.map(t => (
              <div key={t.id} className="card flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{t.dest_nombre}</p>
                  <p className="text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString('es-CL')}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">${fmt(t.monto_clp)} CLP</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoColor[t.estado]}`}>{t.estado}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
