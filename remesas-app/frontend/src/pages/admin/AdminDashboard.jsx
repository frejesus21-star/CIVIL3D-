import React, { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import { api } from '../../services/api';
import { fmtCLP } from '../../utils/format';
import VolumenChart from './VolumenChart';

function Stat({ label, value, sub, color = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

const ESTADO_COLOR = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  procesando: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  fallida: 'bg-red-100 text-red-700',
  cancelada: 'bg-gray-100 text-gray-600',
};

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminStats().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminLayout><div className="text-gray-400 text-sm">Cargando...</div></AdminLayout>;
  if (!data) return <AdminLayout><div className="text-red-500 text-sm">Error al cargar estadísticas</div></AdminLayout>;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Usuarios registrados" value={data.totalUsuarios} />
        <Stat label="KYC pendientes" value={data.kycPendientes} color={data.kycPendientes > 0 ? 'text-amber-600' : 'text-gray-900'} />
        <Stat
          label="Transferencias hoy"
          value={data.transHoy.n}
          sub={fmtCLP(data.transHoy.vol) + ' CLP'}
        />
        <Stat
          label="Volumen del mes"
          value={fmtCLP(data.transMes.vol)}
          sub={`${data.transMes.n} operaciones`}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <h2 className="font-semibold text-gray-700 mb-4">Volumen diario (últimos 14 días)</h2>
        <VolumenChart serie={data.serie} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-700 mb-4">Transferencias por estado</h2>
        <div className="flex flex-wrap gap-3">
          {data.porEstado.map(e => (
            <span key={e.estado} className={`px-3 py-1.5 rounded-full text-sm font-medium ${ESTADO_COLOR[e.estado] || 'bg-gray-100 text-gray-600'}`}>
              {e.estado}: {e.n}
            </span>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
