import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { api } from '../../services/api';
import { fmtCLP, fmtVES, fmtFecha } from '../../utils/format';

const METODOS = [
  { value: 'pago_movil', label: '📱 Pago Móvil' },
  { value: 'transferencia', label: '🏦 Transferencia bancaria' },
  { value: 'usdt', label: '💰 USDT → Bs.' },
];

export default function AdminOperacionesVE() {
  const [filasPendientes, setFilasPendientes] = useState([]);
  const [filasCompletadas, setFilasCompletadas] = useState([]);
  const [liquidez, setLiquidez] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ comprobante_ve: '', metodo_pago_ve: 'pago_movil', notas_ve: '', tasa_usdt_ves_real: '', monto_usdt_enviado: '' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    const [pendientes, completadas, liq] = await Promise.all([
      api.adminOperacionesVE('pagado'),
      api.adminOperacionesVE('completada'),
      api.adminLiquidez(),
    ]);
    setFilasPendientes(pendientes);
    setFilasCompletadas(completadas.slice(0, 10));
    setLiquidez(liq);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirForm(t) {
    setSelected(t);
    setForm({
      comprobante_ve: '',
      metodo_pago_ve: t.dest_tipo === 'pago_movil' ? 'pago_movil' : 'transferencia',
      notas_ve: '',
      tasa_usdt_ves_real: '',
      monto_usdt_enviado: '',
    });
  }

  async function confirmarPago(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.adminRegistrarPagoVE(selected.id, form);
      setMsg('¡Pago registrado! La transferencia fue marcada como completada.');
      setSelected(null);
      cargar();
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Operaciones Venezuela</h1>
        <p className="text-sm text-gray-500 mt-1">Gestiona los pagos pendientes de entrega en Venezuela</p>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {msg}
          <button className="ml-2 opacity-60 hover:opacity-100" onClick={() => setMsg('')}>✕</button>
        </div>
      )}

      {/* Tarjetas de liquidez */}
      {liquidez && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-yellow-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Por pagar en Venezuela</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{liquidez.pendientesPago.n}</p>
            <p className="text-sm text-gray-500">{fmtVES(liquidez.pendientesPago.total_ves)} Bs. · ${liquidez.pendientesPago.total_usd?.toFixed(2)} USD</p>
          </div>
          <div className="bg-white rounded-xl border border-blue-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">En proceso</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{liquidez.enProceso.n}</p>
            <p className="text-sm text-gray-500">{fmtVES(liquidez.enProceso.total_ves)} Bs.</p>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Completadas hoy</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{liquidez.completadasHoy.n}</p>
            <p className="text-sm text-gray-500">{fmtCLP(liquidez.completadasHoy.vol_clp)} CLP</p>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* Lista de pendientes */}
        <div className="flex-1 space-y-4">
          <h2 className="font-semibold text-gray-700">Pendientes de pago ({filasPendientes.length})</h2>

          {filasPendientes.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
              No hay transferencias pendientes de pago en Venezuela
            </div>
          ) : (
            filasPendientes.map(t => (
              <div key={t.id}
                onClick={() => abrirForm(t)}
                className={`bg-white rounded-xl border-2 p-4 cursor-pointer hover:border-brand-300 transition-colors ${selected?.id === t.id ? 'border-brand-500 bg-brand-50' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold text-gray-700">{t.referencia}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700 font-medium">pendiente pago</span>
                    </div>
                    <p className="text-sm text-gray-500">{t.usuario_nombre} · {fmtFecha(t.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg text-brand-600">{fmtVES(t.monto_ves)} Bs.</p>
                    <p className="text-xs text-gray-400">${t.monto_usd?.toFixed(2)} USD</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Destinatario</p>
                    <p className="font-medium">{t.dest_nombre}</p>
                    <p className="text-xs text-gray-500">{t.dest_tipo === 'pago_movil' ? '📱' : '🏦'} {t.dest_banco}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{t.dest_tipo === 'pago_movil' ? 'Teléfono' : 'Cuenta'}</p>
                    <p className="font-mono text-xs">{t.dest_telefono || t.dest_cuenta}</p>
                    <p className="text-xs text-gray-500">CI: {t.dest_cedula}</p>
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Últimas completadas */}
          {filasCompletadas.length > 0 && (
            <div className="mt-6">
              <h2 className="font-semibold text-gray-700 mb-3">Últimas completadas</h2>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Ref</th>
                      <th className="px-4 py-2 text-left">Destinatario</th>
                      <th className="px-4 py-2 text-right">Bs.</th>
                      <th className="px-4 py-2 text-left">Método</th>
                      <th className="px-4 py-2 text-left">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasCompletadas.map(t => (
                      <tr key={t.id} className="border-t border-gray-50">
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{t.referencia}</td>
                        <td className="px-4 py-2">{t.dest_nombre}</td>
                        <td className="px-4 py-2 text-right font-medium text-green-600">{fmtVES(t.monto_ves)}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{t.metodo_pago_ve || '—'}</td>
                        <td className="px-4 py-2 text-xs text-gray-400">{fmtFecha(t.pagado_ve_at || t.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Panel de pago */}
        {selected && (
          <div className="w-96 shrink-0">
            <div className="bg-white rounded-xl border border-gray-100 p-5 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">Registrar pago</h3>
                <button onClick={() => setSelected(null)} className="text-gray-300 hover:text-gray-500 text-xl">×</button>
              </div>

              {/* Resumen de la transferencia */}
              <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Destinatario</span>
                  <span className="font-medium">{selected.dest_nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Banco</span>
                  <span>{selected.dest_banco}</span>
                </div>
                {selected.dest_tipo === 'pago_movil' ? (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Teléfono</span>
                    <span className="font-mono">{selected.dest_telefono}</span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cuenta</span>
                    <span className="font-mono text-xs">{selected.dest_cuenta}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Cédula</span>
                  <span>{selected.dest_cedula}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 font-bold">
                  <span>Monto a entregar</span>
                  <span className="text-brand-600">{fmtVES(selected.monto_ves)} Bs.</span>
                </div>
              </div>

              <form onSubmit={confirmarPago} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Método de pago usado</label>
                  <select className="input mt-1" value={form.metodo_pago_ve} onChange={e => setForm({ ...form, metodo_pago_ve: e.target.value })}>
                    {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Número de comprobante</label>
                  <input className="input mt-1" required placeholder="Ej: 0000123456" value={form.comprobante_ve}
                    onChange={e => setForm({ ...form, comprobante_ve: e.target.value })} />
                </div>

                {form.metodo_pago_ve === 'usdt' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">USDT enviados</label>
                      <input className="input mt-1" type="number" step="0.01" placeholder="0.00"
                        value={form.monto_usdt_enviado} onChange={e => setForm({ ...form, monto_usdt_enviado: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tasa USDT/Bs</label>
                      <input className="input mt-1" type="number" step="0.01" placeholder="792"
                        value={form.tasa_usdt_ves_real} onChange={e => setForm({ ...form, tasa_usdt_ves_real: e.target.value })} />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notas (opcional)</label>
                  <textarea className="input mt-1 h-16 resize-none text-sm" placeholder="Observaciones del pago..."
                    value={form.notas_ve} onChange={e => setForm({ ...form, notas_ve: e.target.value })} />
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors disabled:opacity-60">
                  {loading ? 'Guardando...' : '✓ Confirmar entrega en Venezuela'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
