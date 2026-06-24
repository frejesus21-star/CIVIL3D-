import React, { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

export default function VerificarEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [estado, setEstado] = useState('verificando'); // verificando | ok | error
  const yaCorrio = useRef(false);

  useEffect(() => {
    if (yaCorrio.current) return;
    yaCorrio.current = true;
    if (!token) { setEstado('error'); return; }
    api.verificarEmail(token).then(() => setEstado('ok')).catch(() => setEstado('error'));
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-brand-50 to-white dark:from-gray-900 dark:to-gray-950">
      <div className="w-full max-w-sm">
        <div className="card text-center space-y-4">
          {estado === 'verificando' && (
            <>
              <p className="text-4xl">⏳</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">Verificando tu correo...</p>
            </>
          )}
          {estado === 'ok' && (
            <>
              <p className="text-5xl">✅</p>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">¡Correo verificado!</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">Tu dirección de correo fue confirmada correctamente.</p>
              <Link to="/dashboard" className="btn-primary w-full">Ir a mi cuenta</Link>
            </>
          )}
          {estado === 'error' && (
            <>
              <p className="text-5xl">⚠️</p>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Enlace no válido</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">El enlace de verificación no es válido o ya expiró. Puedes pedir uno nuevo desde tu perfil.</p>
              <Link to="/perfil" className="btn-primary w-full">Ir a mi perfil</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
