import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { validarCedulaVE, validarTelefonoPM } from '../utils/format';

export default function Destinatarios() {
  const navigate = useNavigate();
  const location = useLocation();
  const volverATransferir = location.state?.volver === 'destinatario';
  const [dest, setDest] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [showForm, setShowForm] = useState(volverATransferir);
  const [form, setForm] = useState({ nombre: '', tipo: 'pago_movil', banco: '', numero_cuenta: '', cedula: '', telefono: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.destinatarios().then(setDest).catch(() => {});
    api.bancosVenezuela().then(setBancos).catch(() => {});
  }, []);

  // Validación en vivo
  const cedulaValida = !form.cedula || validarCedulaVE(form.cedula);
  const telefonoValido = !form.telefono || validarTelefonoPM(form.telefono);
  const cuentaValida = !form.numero_cuenta || /^\d{20}$/.test(form.numero_cuenta.replace(/\s/g, ''));

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.crearDestinatario(form);
      if (volverATransferir) {
        navigate('/transferir', { state: { volver: 'destinatario' } });
        return;
      }
      const lista = await api.destinatarios();
      setDest(lista.sort((a, b) => (b.favorito - a.favorito) || a.nombre.localeCompare(b.nombre)));
      setShowForm(false);
      setForm({ nombre: '', tipo: 'pago_movil', banco: '', numero_cuenta: '', cedula: '', telefono: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleFav(d) {
    const actualizado = await api.favoritoDestinatario(d.id).catch(() => null);
    if (!actualizado) return;
    setDest(list => list.map(x => x.id === d.id ? { ...x, favorito: actualizado.favorito } : x)
      .sort((a, b) => (b.favorito - a.favorito) || a.nombre.localeCompare(b.nombre)));
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este destinatario?')) return;
    await api.eliminarDestinatario(id).catch(() => {});
    setDest(d => d.filter(x => x.id !== id));
  }

  const Hint = ({ ok, children }) => !ok && <p className="text-xs text-red-500 mt-1">{children}</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Destinatarios</h1>
        <button className="btn-primary text-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancelar' : '+ Agregar'}
        </button>
      </div>

      {showForm && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Nuevo destinatario en Venezuela</h2>
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
          <form onSubmit={guardar} className="space-y-4">
            <div>
              <label className="label">Nombre del destinatario</label>
              <input className="input" required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label className="label">Tipo de pago</label>
              <div className="grid grid-cols-2 gap-2">
                {[['pago_movil', '📱 Pago Móvil'], ['banco', '🏦 Banco']].map(([val, label]) => (
                  <button type="button" key={val}
                    className={`py-2 px-3 rounded-xl border-2 text-sm font-medium transition-colors ${form.tipo === val ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 dark:text-gray-300 hover:border-gray-300'}`}
                    onClick={() => setForm({ ...form, tipo: val })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Banco venezolano</label>
              <select className="input" required value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })}>
                <option value="">Selecciona banco</option>
                {bancos.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Cédula de identidad</label>
              <input className={`input ${!cedulaValida ? 'border-red-300' : ''}`} required placeholder="V12345678"
                value={form.cedula} onChange={e => setForm({ ...form, cedula: e.target.value })} />
              <Hint ok={cedulaValida}>Formato: V o E seguido de 6 a 9 dígitos (ej. V12345678)</Hint>
            </div>
            {form.tipo === 'pago_movil' ? (
              <div>
                <label className="label">Teléfono (para pago móvil)</label>
                <input className={`input ${!telefonoValido ? 'border-red-300' : ''}`} required type="tel" placeholder="0414-1234567"
                  value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                <Hint ok={telefonoValido}>Debe iniciar en 0412/0414/0416/0424/0426 y tener 11 dígitos</Hint>
              </div>
            ) : (
              <div>
                <label className="label">Número de cuenta (20 dígitos)</label>
                <input className={`input ${!cuentaValida ? 'border-red-300' : ''}`} required inputMode="numeric" placeholder="01020000000000000000"
                  value={form.numero_cuenta} onChange={e => setForm({ ...form, numero_cuenta: e.target.value })} />
                <Hint ok={cuentaValida}>El número de cuenta venezolano tiene 20 dígitos</Hint>
              </div>
            )}
            <button type="submit" disabled={loading || !cedulaValida || !telefonoValido || !cuentaValida} className="btn-primary w-full">
              {loading ? 'Guardando...' : 'Guardar destinatario'}
            </button>
          </form>
        </div>
      )}

      {dest.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-gray-500 dark:text-gray-400">No tienes destinatarios registrados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dest.map(d => (
            <div key={d.id} className="card flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-ves-100 flex items-center justify-center text-ves-600 font-bold text-sm flex-shrink-0">
                {d.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{d.nombre}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{d.tipo === 'pago_movil' ? '📱 Pago Móvil' : '🏦 Banco'} · {d.banco}</p>
                {d.telefono && <p className="text-xs text-gray-400">{d.telefono}</p>}
                {d.numero_cuenta && <p className="text-xs text-gray-400 font-mono">···{d.numero_cuenta.slice(-6)}</p>}
                <p className="text-xs text-gray-400">CI: {d.cedula}</p>
              </div>
              <button onClick={() => toggleFav(d)} className={`p-1 text-lg ${d.favorito ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400'}`} title="Favorito">
                {d.favorito ? '★' : '☆'}
              </button>
              <button onClick={() => eliminar(d.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
