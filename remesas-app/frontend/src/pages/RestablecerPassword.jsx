import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import PasswordInput from '../components/PasswordInput';

export default function RestablecerPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres');
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden');
    setLoading(true);
    try {
      await api.restablecerPassword(token, form.password);
      setListo(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-brand-50 to-white dark:from-gray-900 dark:to-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Nueva contraseña</h1>
        </div>
        <div className="card">
          {!token ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-red-600">El enlace no es válido. Solicita uno nuevo.</p>
              <Link to="/recuperar" className="btn-primary w-full">Solicitar enlace</Link>
            </div>
          ) : listo ? (
            <div className="text-center space-y-3">
              <p className="text-4xl">✅</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">Tu contraseña fue actualizada. Te llevamos al inicio de sesión...</p>
            </div>
          ) : (
            <>
              {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Nueva contraseña</label>
                  <PasswordInput required minLength={8} autoFocus
                    value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                </div>
                <div>
                  <label className="label">Confirmar contraseña</label>
                  <PasswordInput required
                    value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Guardando...' : 'Cambiar contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
