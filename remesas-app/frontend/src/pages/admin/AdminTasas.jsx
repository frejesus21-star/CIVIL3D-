import React, { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import { api } from '../../services/api';

export default function AdminTasas() {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ usd_clp: '', usd_ves: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function cargar() {
    const d = await api.adminTasas().catch(() => null);
    if (d) {
      setInfo(d);
      setForm({ usd_clp: d.rates.usd_clp, usd_ves: d.rates.usd_ves });
    }
  }

  useEffect(() => { cargar(); }, []);

  async function guardar(e) {
    e.preventDefault();
    setError(''); setMsg('');
    setSaving(true);
    try {
      await api.adminSetTasas({ usd_clp: parseFloat(form.usd_clp), usd_ves: parseFloat(form.usd_ves) });
      setMsg('Tasas actualizadas. Próximas cotizaciones usarán estos valores.');
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function resetear() {
    setError(''); setMsg('');
    await api.adminResetTasas();
    setMsg('Caché borrada. Las tasas se obtendrán de la API externa en la próxima consulta.');
    cargar();
  }

  function calcPreview() {
    const usd_clp = parseFloat(form.usd_clp);
    const usd_ves = parseFloat(form.usd_ves);
    if (!usd_clp || !usd_ves) return null;
    const comision = 0.025;
    const monto_clp = 100000;
    const neto = monto_clp * (1 - comision);
    const monto_ves = (neto / usd_clp) * usd_ves;
    return { monto_clp, monto_ves: Math.round(monto_ves) };
  }

  const preview = calcPreview();

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Gestión de Tasas</h1>

      {msg && <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 rounded-lg text-sm">{msg}</div>}
      {error && <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Estado actual */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Estado actual</h2>
          {info && (
            <div className="space-y-3">
              <InfoRow label="USD / CLP" value={info.rates.usd_clp?.toLocaleString('es-CL', { maximumFractionDigits: 2 })} />
              <InfoRow label="USD / VES (paralelo)" value={info.rates.usd_ves?.toLocaleString('es-VE', { maximumFractionDigits: 2 })} />
              <InfoRow label="Fuente" value={info.rates.fuente} />
              {info.cache && <InfoRow label="Última actualización" value={new Date(info.cache.updated_at).toLocaleString('es-CL')} />}
              {info.cache?.manual === 1 && (
                <div className="mt-2 px-3 py-2 bg-amber-50 text-amber-700 text-xs rounded-lg">
                  ⚠️ Usando tasa manual configurada por admin
                </div>
              )}
              {info.rates.respaldo && (
                <div className="mt-2 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg">
                  ⚠️ Usando tasa de respaldo (APIs externas no disponibles)
                </div>
              )}
            </div>
          )}
          <button onClick={resetear} className="mt-4 text-sm text-gray-400 hover:text-red-600 transition-colors">
            🗑 Limpiar caché y forzar recarga desde API
          </button>
        </div>

        {/* Formulario */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-1">Ajuste manual de tasas</h2>
          <p className="text-xs text-gray-400 mb-4">Úsalo cuando las APIs externas estén caídas o la tasa sea incorrecta. Sobreescribe la caché existente.</p>

          <form onSubmit={guardar} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-600 block mb-1">1 USD = ___ CLP</label>
              <input type="number" step="0.01" min="100" max="5000"
                className="input w-full" value={form.usd_clp}
                onChange={e => setForm(f => ({ ...f, usd_clp: e.target.value }))}
                required />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 block mb-1">1 USD = ___ VES (dólar paralelo)</label>
              <input type="number" step="0.01" min="1"
                className="input w-full" value={form.usd_ves}
                onChange={e => setForm(f => ({ ...f, usd_ves: e.target.value }))}
                required />
            </div>

            {preview && (
              <div className="px-4 py-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                Ejemplo: $100.000 CLP → <strong>{preview.monto_ves.toLocaleString('es-VE')} Bs</strong>
                <span className="text-xs ml-1 text-blue-400">(con comisión 2,5%)</span>
              </div>
            )}

            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? 'Guardando...' : 'Aplicar tasas'}
            </button>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{value}</span>
    </div>
  );
}
