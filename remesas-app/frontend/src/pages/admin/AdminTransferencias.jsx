import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { api } from '../../services/api';
import { fmtCLP, fmtFechaHora } from '../../utils/format';

const ESTADOS = ['', 'pendiente', 'procesando', 'completada', 'fallida', 'cancelada'];
const ESTADO_COLOR = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  procesando: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  fallida: 'bg-red-100 text-red-600',
  cancelada: 'bg-gray-100 text-gray-500',
};

export default function AdminTransferencias() {
  const [data, setData] = useState({ rows: [], total: 0, pages: 1, page: 1 });
  const [filtroEstado, setFiltroEstado] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [notas, setNotas] = useState('');
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(() => {
    api.adminTransferencias(page, filtroEstado).then(setData).catch(() => {});
  }, [page, filtroEstado]);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirDetalle(t) {
    setSelected(t);
    setNotas(t.notas_admin || '');
    setNuevoEstado(t.estado);
  }

  async function guardar() {
    setSaving(true);
    try {
      await api.adminActualizarTransferencia(selected.id, {
        estado: nuevoEstado !== selected.estado ? nuevoEstado : undefined,
        notas_admin: notas,
      });
      setMsg('Guardado');
      cargar();
      setSelected(null);
    } catch (e) {
      setMsg('Error: ' + e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 3000);
    }
  }

  function fmtVes(n) { return new Intl.NumberFormat('es-VE').format(Math.round(n)) + ' Bs'; }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Transferencias</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => api.adminDescargarCSV('transferencias', filtroEstado).catch(e => setMsg('Error: ' + e.message))}
            className="text-sm font-medium text-gray-600 hover:text-brand-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-brand-300 transition-colors">
            ⬇ Exportar CSV
          </button>
          <span className="text-sm text-gray-500">{data.total} total</span>
        </div>
      </div>

      {msg && <div className="mb-4 px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm">{msg}</div>}

      <div className="flex gap-2 mb-4">
        {ESTADOS.map(e => (
          <button key={e || 'all'} onClick={() => { setFiltroEstado(e); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filtroEstado === e ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {e || 'Todas'}
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        <div className="flex-1 bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Referencia</th>
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-right">CLP</th>
                <th className="px-4 py-3 text-right">VES</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(t => (
                <tr key={t.id}
                  onClick={() => abrirDetalle(t)}
                  className={`border-t border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${selected?.id === t.id ? 'bg-brand-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.referencia}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 text-xs">{t.usuario_nombre}</p>
                    <p className="text-xs text-gray-400">{t.usuario_rut}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{fmtCLP(t.monto_clp)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 text-xs">{fmtVes(t.monto_ves)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[t.estado]}`}>{t.estado}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmtFechaHora(t.created_at)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin transferencias</td></tr>
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

        {/* Panel de edición */}
        {selected && (
          <div className="w-80 shrink-0 bg-white rounded-xl border border-gray-100 p-5 self-start">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-bold text-gray-900 text-sm font-mono">{selected.referencia}</p>
                <p className="text-xs text-gray-400">{selected.usuario_nombre}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-300 hover:text-gray-500 text-lg">×</button>
            </div>

            <div className="space-y-2 text-xs mb-4">
              <Row label="Monto CLP" value={fmtCLP(selected.monto_clp)} />
              <Row label="Comisión" value={fmtCLP(selected.comision_clp)} />
              <Row label="Monto VES" value={fmtVes(selected.monto_ves)} />
              <Row label="Tasa USD/CLP" value={selected.tasa_usd_clp?.toFixed(2)} />
              <Row label="Tasa USD/VES" value={selected.tasa_usd_ves?.toFixed(2)} />
              <hr className="border-gray-100" />
              <Row label="Banco origen" value={selected.origen_banco} />
              <Row label="Cuenta origen" value={selected.origen_cuenta} />
              <hr className="border-gray-100" />
              <Row label="Destinatario" value={selected.dest_nombre} />
              <Row label="Tipo" value={selected.dest_tipo} />
              <Row label="Banco destino" value={selected.dest_banco || '—'} />
              <Row label="Cuenta/Tel" value={selected.dest_cuenta || selected.dest_telefono || '—'} />
            </div>

            <div className="mb-3">
              <label className="text-xs font-medium text-gray-600 block mb-1">Estado</label>
              <select value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)} className="input text-sm w-full">
                {ESTADOS.filter(Boolean).map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="text-xs font-medium text-gray-600 block mb-1">Notas internas</label>
              <textarea
                className="input text-sm w-full h-20 resize-none"
                placeholder="Notas para el equipo..."
                value={notas}
                onChange={e => setNotas(e.target.value)}
              />
            </div>

            <button onClick={guardar} disabled={saving} className="btn-primary w-full text-sm py-2">
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-medium text-right">{value}</span>
    </div>
  );
}
