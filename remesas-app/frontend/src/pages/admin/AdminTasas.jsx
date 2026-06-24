import React, { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import { api } from '../../services/api';

export default function AdminTasas() {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ usd_clp: '', usd_ves: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // Configuración general
  const [config, setConfig] = useState({ comision_pct: '', comision_minima_clp: '', mensaje_mantenimiento: '' });
  const [savingConfig, setSavingConfig] = useState(false);
  const [msgConfig, setMsgConfig] = useState('');
  const [errorConfig, setErrorConfig] = useState('');

  async function cargar() {
    const d = await api.adminTasas().catch(() => null);
    if (d) {
      setInfo(d);
      setForm({ usd_clp: d.rates.usd_clp, usd_ves: d.rates.usd_ves });
    }
  }

  async function cargarConfig() {
    const c = await api.adminConfig().catch(() => null);
    if (c) setConfig({ comision_pct: c.comision_pct, comision_minima_clp: c.comision_minima_clp, mensaje_mantenimiento: c.mensaje_mantenimiento || '' });
  }

  useEffect(() => { cargar(); cargarConfig(); }, []);

  async function guardar(e) {
    e.preventDefault();
    setError(''); setMsg('');
    setSaving(true);
    try {
      await api.adminSetTasas({ usd_clp: parseFloat(form.usd_clp), usd_ves: parseFloat(form.usd_ves) });
      setMsg('Tasas actualizadas. Las próximas cotizaciones usarán estos valores.');
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

  async function guardarConfig(e) {
    e.preventDefault();
    setErrorConfig(''); setMsgConfig('');
    setSavingConfig(true);
    try {
      await api.adminSetConfig({
        comision_pct: parseFloat(config.comision_pct),
        comision_minima_clp: parseFloat(config.comision_minima_clp),
        mensaje_mantenimiento: config.mensaje_mantenimiento,
      });
      setMsgConfig('Configuración guardada correctamente.');
      cargarConfig();
    } catch (err) {
      setErrorConfig(err.message);
    } finally {
      setSavingConfig(false);
    }
  }

  function calcPreview() {
    const usd_clp = parseFloat(form.usd_clp);
    const usd_ves = parseFloat(form.usd_ves);
    const comision = parseFloat(config.comision_pct) || 2.5;
    if (!usd_clp || !usd_ves) return null;
    const monto_clp = 100000;
    const neto = monto_clp * (1 - comision / 100);
    const monto_ves = (neto / usd_clp) * usd_ves;
    return { monto_clp, monto_ves: Math.round(monto_ves), comision };
  }

  const preview = calcPreview();

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Tasas y Configuración</h1>

      {msg && <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 rounded-lg text-sm">{msg}</div>}
      {error && <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Estado actual */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Tasas actuales</h2>
          {info && (
            <div className="space-y-3">
              <InfoRow label="USD / CLP" value={info.rates.usd_clp?.toLocaleString('es-CL', { maximumFractionDigits: 2 })} />
              <InfoRow label="USD / VES (promedio)" value={info.rates.usd_ves?.toLocaleString('es-VE', { maximumFractionDigits: 2 })} />
              <InfoRow label="Fuente" value={info.rates.fuente} />
              {info.cache && <InfoRow label="Última actualización" value={new Date(info.cache.updated_at).toLocaleString('es-CL')} />}
              {info.cache?.manual === 1 && (
                <div className="mt-2 px-3 py-2 bg-amber-50 text-amber-700 text-xs rounded-lg">
                  ⚠️ Usando tasa manual configurada por administrador
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

        {/* Formulario tasas */}
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
              <label className="text-sm font-medium text-gray-600 block mb-1">1 USD = ___ VES (dólar promedio)</label>
              <input type="number" step="0.01" min="1"
                className="input w-full" value={form.usd_ves}
                onChange={e => setForm(f => ({ ...f, usd_ves: e.target.value }))}
                required />
            </div>

            {preview && (
              <div className="px-4 py-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                Ejemplo: $100.000 CLP → <strong>{preview.monto_ves.toLocaleString('es-VE')} Bs</strong>
                <span className="text-xs ml-1 text-blue-400">(con comisión {preview.comision}%)</span>
              </div>
            )}

            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? 'Guardando...' : 'Aplicar tasas'}
            </button>
          </form>
        </div>
      </div>

      {/* Configuración general */}
      <div className="mt-6 bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-700 mb-1">Configuración general</h2>
        <p className="text-xs text-gray-400 mb-4">Ajusta la comisión del servicio y otros parámetros operativos.</p>

        {msgConfig && <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 rounded-lg text-sm">{msgConfig}</div>}
        {errorConfig && <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 rounded-lg text-sm">{errorConfig}</div>}

        <form onSubmit={guardarConfig} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">
              Comisión por transferencia (%)
            </label>
            <input type="number" step="0.01" min="0" max="20"
              className="input w-full" value={config.comision_pct}
              onChange={e => setConfig(c => ({ ...c, comision_pct: e.target.value }))}
              required />
            <p className="text-xs text-gray-400 mt-1">Entre 0% y 20%. Actualmente: {config.comision_pct}%</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">
              Comisión mínima (CLP)
            </label>
            <input type="number" step="1" min="0"
              className="input w-full" value={config.comision_minima_clp}
              onChange={e => setConfig(c => ({ ...c, comision_minima_clp: e.target.value }))}
              required />
            <p className="text-xs text-gray-400 mt-1">0 = sin mínimo</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">
              Mensaje de mantenimiento
            </label>
            <input type="text" maxLength={300}
              className="input w-full" value={config.mensaje_mantenimiento}
              placeholder="Vacío = sin aviso"
              onChange={e => setConfig(c => ({ ...c, mensaje_mantenimiento: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">Se muestra en el banner superior de la app</p>
          </div>

          <div className="md:col-span-3">
            <button type="submit" disabled={savingConfig} className="btn-primary">
              {savingConfig ? 'Guardando...' : 'Guardar configuración'}
            </button>
          </div>
        </form>
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
