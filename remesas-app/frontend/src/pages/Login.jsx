import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [codigo2fa, setCodigo2fa] = useState('');
  const [requiere2fa, setRequiere2fa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password, requiere2fa ? codigo2fa : undefined);
      navigate('/dashboard');
    } catch (err) {
      if (err.requiere_2fa) {
        setRequiere2fa(true);
        // Solo mostramos error si ya habían ingresado un código (código inválido)
        setError(codigo2fa ? err.message : '');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-brand-50 to-white dark:from-gray-900 dark:to-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💸</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">RemesasVE</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Envía dinero de Chile a Venezuela</p>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold mb-5">Iniciar sesión</h2>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input className="input" type="password" required
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            {requiere2fa && (
              <div>
                <label className="label">Código de verificación</label>
                <input className="input tracking-[0.4em] text-center text-lg" type="text" inputMode="numeric"
                  maxLength={6} placeholder="000000" autoFocus required
                  value={codigo2fa} onChange={e => setCodigo2fa(e.target.value.replace(/\D/g, ''))} />
                <p className="text-xs text-gray-400 mt-1">Ingresa el código de 6 dígitos de tu app de autenticación</p>
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Ingresando...' : (requiere2fa ? 'Verificar' : 'Ingresar')}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-5">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="text-brand-600 font-medium hover:underline">Regístrate</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
