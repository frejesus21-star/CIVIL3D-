import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

const TIPOS = ['Cuenta Corriente', 'Cuenta Vista', 'Cuenta de Ahorro', 'Cuenta RUT'];

export default function Cuentas() {
  const [cuentas, setCuentas] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ banco: '', tipo_cuenta: '', numero_cuenta: '', titular: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.cuentas().then(setCuentas).catch(() => {});
    api.bancosChile().then(setBancos).catch(() => {});
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const nueva = await api.crearCuenta(form);
      setCuentas(c => [nueva, ...c]);
      setShowForm(false);
      setForm({ banco: '', tipo_cuenta: '', numero_cuenta: '', titular: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar esta cuenta?')) return;
    await api.eliminarCuenta(id).catch(() => {});
    setCuentas(c => c.filter(x => x.id !== id));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis cuentas (Chile)</h1>
        <button className="btn-primary text-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancelar' : '+ Agregar'}
        </button>
      </div>

      {showForm && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Nueva cuenta bancaria</h2>
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
          <form onSubmit={guardar} className="space-y-4">
            <div>
              <label className="label">Banco</label>
              <select className="input" required value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })}>
                <option value="">Selecciona un banco</option>
                {bancos.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tipo de cuenta</label>
              <select className="input" required value={form.tipo_cuenta} onChange={e => setForm({ ...form, tipo_cuenta: e.target.value })}>
                <option value="">Selecciona tipo</option>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Número de cuenta</label>
              <input className="input" required inputMode="numeric"
                value={form.numero_cuenta} onChange={e => setForm({ ...form, numero_cuenta: e.target.value })} />
            </div>
            <div>
              <label className="label">Nombre del titular</label>
              <input className="input" required
                value={form.titular} onChange={e => setForm({ ...form, titular: e.target.value })} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Guardando...' : 'Guardar cuenta'}
            </button>
          </form>
        </div>
      )}

      {cuentas.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🏦</div>
          <p className="text-gray-500">No tienes cuentas registradas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cuentas.map(c => (
            <div key={c.id} className="card flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-lg flex-shrink-0">🏦</div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{c.banco}</p>
                <p className="text-xs text-gray-500">{c.tipo_cuenta} · ···{c.numero_cuenta.slice(-4)}</p>
                <p className="text-xs text-gray-400">{c.titular}</p>
              </div>
              <button onClick={() => eliminar(c.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
