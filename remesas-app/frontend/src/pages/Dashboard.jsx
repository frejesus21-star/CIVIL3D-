import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { fmtCLP, fmtVES, fmtFecha, ESTADO_COLOR } from '../utils/format';

export default function Dashboard() {
  const { user } = useAuth();
  const [tasas, setTasas] = useState(null);
  const [stats, setStats] = useState(null);
  const [ultimas, setUltimas] = useState([]);
  const [loadingTasas, setLoadingTasas] = useState(true);

  useEffect(() => {
    api.tasas().then(setTasas).catch(() => {}).finally(() => setLoadingTasas(false));
    api.stats().then(setStats).catch(() => {});
    api.transferencias(1).then(r => setUltimas(r.rows.slice(0, 3))).catch(() => {});
  }, []);

  const verificado = user?.kyc_estado === 'verificado';
  const limites = stats?.limites;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {user?.nombre?.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm">Bienvenido a RemesasVE</p>
      </div>

      {/* Aviso de verificación */}
      {!verificado && (
        <Link to="/verificacion" className="card flex items-center gap-3 bg-amber-50 border-amber-200 hover:shadow-md transition-shadow">
          <span className="text-2xl">🪪</span>
          <div className="flex-1">
            <p className="font-semibold text-sm text-amber-900">Verifica tu identidad</p>
            <p className="text-xs text-amber-700">Aumenta tus límites de envío hasta $5.000.000/mes</p>
          </div>
          <span className="text-amber-600">→</span>
        </Link>
      )}

      {/* Tasas del día */}
      <div className="card bg-gradient-to-r from-brand-600 to-brand-700 text-white border-0">
        <p className="text-brand-100 text-sm font-medium mb-3">Tasas del día</p>
        {loadingTasas ? (
          <div className="text-brand-200 text-sm">Cargando tasas...</div>
        ) : tasas ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-brand-200 text-xs">1 USD =</p>
              <p className="text-2xl font-bold">${fmtCLP(tasas.usd_clp)} CLP</p>
            </div>
            <div>
              <p className="text-brand-200 text-xs">1 USD = (paralelo)</p>
              <p className="text-2xl font-bold">{fmtCLP(tasas.usd_ves)} Bs.</p>
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

      {/* Estadísticas + límite disponible */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card">
            <p className="text-xs text-gray-400">Total enviado</p>
            <p className="text-xl font-bold">${fmtCLP(stats.total_enviado_clp)}</p>
            <p className="text-xs text-gray-400">{stats.completadas} transferencia{stats.completadas !== 1 ? 's' : ''} completada{stats.completadas !== 1 ? 's' : ''}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-400">Disponible este mes</p>
            <p className="text-xl font-bold text-brand-600">${fmtCLP(limites?.disponible_mes)}</p>
            <p className="text-xs text-gray-400">de ${fmtCLP(limites?.limites?.mensual)} ({limites?.nivel_nombre})</p>
          </div>
        </div>
      )}

      {/* Barra de uso mensual */}
      {limites && (
        <div className="card">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500">Uso mensual</span>
            <span className="font-medium">${fmtCLP(limites.uso.mes)} / ${fmtCLP(limites.limites.mensual)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, (limites.uso.mes / limites.limites.mensual) * 100)}%` }} />
          </div>
        </div>
      )}

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
              <Link key={t.id} to={`/historial/${t.id}`} className="card flex items-center justify-between hover:shadow-md transition-shadow">
                <div>
                  <p className="font-medium text-sm">{t.dest_nombre}</p>
                  <p className="text-xs text-gray-400">{fmtFecha(t.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">${fmtCLP(t.monto_clp)} CLP</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[t.estado]}`}>{t.estado}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
