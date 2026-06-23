import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatRut, validarRut } from '../utils/format';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', rut: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function setField(field, value) {
    if (field === 'rut') value = formatRut(value);
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!validarRut(form.rut)) return setError('El RUT no es válido (revisa el dígito verificador)');
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden');
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres');
    setLoading(true);
    try {
      await register({ nombre: form.nombre, email: form.email, telefono: form.telefono, rut: form.rut, password: form.password });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-brand-50 to-white py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">💸</div>
          <h1 className="text-2xl font-bold">Crear cuenta</h1>
        </div>
        <div className="card">
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Nombre completo</label>
              <input className="input" required value={form.nombre} onChange={e => setField('nombre', e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required value={form.email} onChange={e => setField('email', e.target.value)} />
            </div>
            <div>
              <label className="label">Teléfono (opcional)</label>
              <input className="input" type="tel" value={form.telefono} onChange={e => setField('telefono', e.target.value)} />
            </div>
            <div>
              <label className="label">RUT chileno</label>
              <input className={`input ${form.rut && !validarRut(form.rut) ? 'border-red-300' : ''}`} placeholder="12.345.678-9" required value={form.rut} onChange={e => setField('rut', e.target.value)} />
              {form.rut && !validarRut(form.rut) && <p className="text-xs text-red-500 mt-1">RUT inválido (dígito verificador)</p>}
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input className="input" type="password" required minLength={8} value={form.password} onChange={e => setField('password', e.target.value)} />
            </div>
            <div>
              <label className="label">Confirmar contraseña</label>
              <input className="input" type="password" required value={form.confirm} onChange={e => setField('confirm', e.target.value)} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-5">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-brand-600 font-medium hover:underline">Iniciar sesión</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
