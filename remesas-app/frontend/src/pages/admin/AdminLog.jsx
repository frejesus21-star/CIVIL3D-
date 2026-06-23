import React, { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import { api } from '../../services/api';
import { fmtFechaHora } from '../../utils/format';

const ACCION_LABEL = {
  aprobar_kyc: { txt: 'Aprobó KYC', color: 'bg-green-100 text-green-700' },
  rechazar_kyc: { txt: 'Rechazó KYC', color: 'bg-red-100 text-red-600' },
  cambiar_estado_transferencia: { txt: 'Cambió estado de transferencia', color: 'bg-blue-100 text-blue-700' },
  ajustar_tasas: { txt: 'Ajustó tasas', color: 'bg-amber-100 text-amber-700' },
  actualizar_configuracion: { txt: 'Actualizó configuración', color: 'bg-purple-100 text-purple-700' },
  exportar_csv: { txt: 'Exportó CSV', color: 'bg-gray-100 text-gray-600' },
};

export default function AdminLog() {
  const [data, setData] = useState({ rows: [], total: 0, pages: 1, page: 1 });
  const [page, setPage] = useState(1);
  const [accion, setAccion] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  useEffect(() => {
    api.adminLog(page, accion, desde, hasta).then(setData).catch(() => {});
  }, [page, accion, desde, hasta]);

  function fmtDetalle(d) {
    if (!d) return '';
    try {
      const obj = JSON.parse(d);
      return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(' · ');
    } catch {
      return d;
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Registro de auditoría</h1>
        <span className="text-sm text-gray-500">{data.total} acciones</span>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Acción</label>
          <select value={accion} onChange={e => { setAccion(e.target.value); setPage(1); }} className="input text-sm">
            <option value="">Todas</option>
            {Object.entries(ACCION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v.txt}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Desde</label>
          <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1); }} className="input text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1); }} className="input text-sm" />
        </div>
        {(accion || desde || hasta) && (
          <button onClick={() => { setAccion(''); setDesde(''); setHasta(''); setPage(1); }}
            className="text-sm text-gray-400 hover:text-red-600 pb-2">
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Administrador</th>
              <th className="px-4 py-3 text-left">Acción</th>
              <th className="px-4 py-3 text-left">Entidad</th>
              <th className="px-4 py-3 text-left">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(l => {
              const a = ACCION_LABEL[l.accion] || { txt: l.accion, color: 'bg-gray-100 text-gray-600' };
              return (
                <tr key={l.id} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtFechaHora(l.created_at)}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium text-xs">{l.admin_nombre || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.color}`}>{a.txt}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {l.entidad || '—'}{l.entidad_id ? <span className="text-gray-300 ml-1 font-mono">{l.entidad_id.slice(0, 8)}</span> : ''}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDetalle(l.detalle)}</td>
                </tr>
              );
            })}
            {data.rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin acciones registradas</td></tr>
            )}
          </tbody>
        </table>
        {data.pages > 1 && (
          <div className="flex gap-2 px-4 py-3 border-t border-gray-50 justify-end">
            {Array.from({ length: data.pages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-8 h-8 rounded text-sm font-medium ${p === page ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
