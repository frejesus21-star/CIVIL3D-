import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { api } from '../../services/api';
import { fmtCLP, fmtFecha } from '../../utils/format';

const KYC_COLOR = {
  no_iniciado: 'bg-gray-100 text-gray-500',
  en_revision: 'bg-amber-100 text-amber-700',
  verificado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-600',
};

export default function AdminUsuarios() {
  const [data, setData] = useState({ rows: [], total: 0, pages: 1, page: 1 });
  const [buscar, setBuscar] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(() => {
    api.adminUsuarios(page, buscar).then(setData).catch(() => {});
  }, [page, buscar]);

  useEffect(() => { cargar(); }, [cargar]);

  async function abrirDetalle(id) {
    setSelected(id);
    setDetalle(null);
    setLoadingDetalle(true);
    try {
      const d = await api.adminUsuario(id);
      setDetalle(d);
    } finally {
      setLoadingDetalle(false);
    }
  }

  async function aprobar(id) {
    await api.adminAprobarKYC(id);
    setMsg('KYC aprobado correctamente');
    setDetalle(d => ({ ...d, kyc_estado: 'verificado', kyc_nivel: 2 }));
    setData(prev => ({
      ...prev,
      rows: prev.rows.map(r => r.id === id ? { ...r, kyc_estado: 'verificado', kyc_nivel: 2 } : r),
    }));
    setTimeout(() => setMsg(''), 3000);
  }

  async function rechazar(id) {
    const motivo = prompt('Motivo del rechazo:');
    if (motivo === null) return;
    await api.adminRechazarKYC(id, motivo);
    setMsg('KYC rechazado');
    setDetalle(d => ({ ...d, kyc_estado: 'rechazado' }));
    setData(prev => ({
      ...prev,
      rows: prev.rows.map(r => r.id === id ? { ...r, kyc_estado: 'rechazado' } : r),
    }));
    setTimeout(() => setMsg(''), 3000);
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => api.adminDescargarCSV('usuarios').catch(e => setMsg('Error: ' + e.message))}
            className="text-sm font-medium text-gray-600 hover:text-brand-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-brand-300 transition-colors">
            ⬇ Exportar CSV
          </button>
          <span className="text-sm text-gray-500">{data.total} registrados</span>
        </div>
      </div>

      {msg && <div className="mb-4 px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm">{msg}</div>}

      <div className="flex gap-3 mb-4">
        <input
          className="input flex-1 max-w-xs"
          placeholder="Buscar por nombre, email o RUT..."
          value={buscar}
          onChange={e => { setBuscar(e.target.value); setPage(1); }}
        />
      </div>

      <div className="flex gap-6">
        {/* Tabla */}
        <div className="flex-1 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-left">RUT</th>
                <th className="px-4 py-3 text-left">KYC</th>
                <th className="px-4 py-3 text-right">Ops</th>
                <th className="px-4 py-3 text-right">Vol. total</th>
                <th className="px-4 py-3 text-left">Registro</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(u => (
                <tr key={u.id}
                  onClick={() => abrirDetalle(u.id)}
                  className={`border-t border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${selected === u.id ? 'bg-brand-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{u.nombre}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{u.rut}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${KYC_COLOR[u.kyc_estado]}`}>
                      {u.kyc_estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{u.num_trans}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmtCLP(u.vol_total)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmtFecha(u.created_at)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin resultados</td></tr>
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

        {/* Panel de detalle */}
        {selected && (
          <div className="w-80 shrink-0 bg-white rounded-xl border border-gray-100 p-5 self-start">
            {loadingDetalle ? <p className="text-sm text-gray-400">Cargando...</p> : detalle && (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-bold text-gray-900">{detalle.nombre}</p>
                    <p className="text-xs text-gray-500">{detalle.email}</p>
                  </div>
                  <button onClick={() => { setSelected(null); setDetalle(null); }} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <Row label="RUT" value={detalle.rut} />
                  <Row label="Teléfono" value={detalle.telefono || '—'} />
                  <Row label="Ciudad" value={detalle.ciudad || '—'} />
                  <Row label="Documento" value={detalle.numero_documento ? `${detalle.tipo_documento} ${detalle.numero_documento}` : '—'} />
                  <Row label="KYC" value={
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${KYC_COLOR[detalle.kyc_estado]}`}>
                      {detalle.kyc_estado} · Nivel {detalle.kyc_nivel}
                    </span>
                  } />
                </div>

                {detalle.kyc_estado === 'en_revision' && (
                  <div className="flex gap-2 mb-4">
                    <button onClick={() => aprobar(detalle.id)} className="btn-primary text-xs py-1.5 flex-1">✓ Aprobar</button>
                    <button onClick={() => rechazar(detalle.id)} className="text-xs py-1.5 px-3 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 flex-1">✕ Rechazar</button>
                  </div>
                )}

                {detalle.transferencias?.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Últimas transferencias</p>
                    <div className="space-y-1">
                      {detalle.transferencias.map(t => (
                        <div key={t.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                          <span className="font-mono text-gray-400">{t.referencia}</span>
                          <span className="text-gray-700">{fmtCLP(t.monto_clp)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-700 text-right">{value}</span>
    </div>
  );
}
