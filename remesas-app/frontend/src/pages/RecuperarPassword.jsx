import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export default function RecuperarPassword() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.recuperarPassword(email);
      setEnviado(true);
    } catch {
      setEnviado(true); // mismo mensaje aunque falle, para no filtrar info
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-brand-50 to-white dark:from-gray-900 dark:to-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔑</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Recuperar contraseña</h1>
        </div>
        <div className="card">
          {enviado ? (
            <div className="text-center space-y-4">
              <p className="text-4xl">📩</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.
                Revisa tu bandeja de entrada y la carpeta de spam.
              </p>
              <Link to="/login" className="btn-primary w-full">Volver a iniciar sesión</Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" required autoFocus
                    value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </form>
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-5">
                <Link to="/login" className="text-brand-600 font-medium hover:underline">Volver</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
