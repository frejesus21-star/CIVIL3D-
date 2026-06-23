import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatRut } from '../utils/format';
import TwoFactorSettings from '../components/TwoFactorSettings';

export default function Perfil() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [perfil, setPerfil] = useState({
    nombre: user?.nombre || '', telefono: user?.telefono || '',
    direccion: user?.direccion || '', ciudad: user?.ciudad || '',
  });
  const [pwd, setPwd] = useState({ password_actual: '', password_nueva: '', confirm: '' });
  const [msgPerfil, setMsgPerfil] = useState(null);
  const [msgPwd, setMsgPwd] = useState(null);
  const [loadingPerfil, setLoadingPerfil] = useState(false);
  const [loadingPwd, setLoadingPwd] = useState(false);

  async function guardarPerfil(e) {
    e.preventDefault();
    setMsgPerfil(null);
    setLoadingPerfil(true);
    try {
      const actualizado = await api.actualizarPerfil(perfil);
      setUser(actualizado);
      setMsgPerfil({ ok: true, texto: 'Perfil actualizado correctamente' });
    } catch (err) {
      setMsgPerfil({ ok: false, texto: err.message });
    } finally {
      setLoadingPerfil(false);
    }
  }

  async function cambiarPwd(e) {
    e.preventDefault();
    setMsgPwd(null);
    if (pwd.password_nueva !== pwd.confirm) return setMsgPwd({ ok: false, texto: 'Las contraseñas no coinciden' });
    setLoadingPwd(true);
    try {
      await api.cambiarPassword({ password_actual: pwd.password_actual, password_nueva: pwd.password_nueva });
      setMsgPwd({ ok: true, texto: 'Contraseña actualizada' });
      setPwd({ password_actual: '', password_nueva: '', confirm: '' });
    } catch (err) {
      setMsgPwd({ ok: false, texto: err.message });
    } finally {
      setLoadingPwd(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const Msg = ({ m }) => m && (
    <div className={`p-3 rounded-xl text-sm ${m.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>{m.texto}</div>
  );

  return (
    <div className="max-w-md mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Mi perfil</h1>

      {/* Datos no editables */}
      <div className="card space-y-2">
        <div className="flex justify-between text-sm"><span className="text-gray-500">Email</span><span className="font-medium">{user?.email}</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-500">RUT</span><span className="font-medium">{user?.rut ? formatRut(user.rut) : '-'}</span></div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Verificación</span>
          <span className={`font-medium ${user?.kyc_estado === 'verificado' ? 'text-green-600' : 'text-gray-600'}`}>
            {user?.kyc_estado === 'verificado' ? '✅ Verificado' : 'Pendiente'}
          </span>
        </div>
      </div>

      {/* Editar perfil */}
      <form onSubmit={guardarPerfil} className="card space-y-4">
        <p className="font-semibold">Datos personales</p>
        <Msg m={msgPerfil} />
        <div>
          <label className="label">Nombre completo</label>
          <input className="input" value={perfil.nombre} onChange={e => setPerfil({ ...perfil, nombre: e.target.value })} />
        </div>
        <div>
          <label className="label">Teléfono</label>
          <input className="input" type="tel" value={perfil.telefono} onChange={e => setPerfil({ ...perfil, telefono: e.target.value })} />
        </div>
        <div>
          <label className="label">Dirección</label>
          <input className="input" value={perfil.direccion} onChange={e => setPerfil({ ...perfil, direccion: e.target.value })} />
        </div>
        <div>
          <label className="label">Ciudad</label>
          <input className="input" value={perfil.ciudad} onChange={e => setPerfil({ ...perfil, ciudad: e.target.value })} />
        </div>
        <button type="submit" disabled={loadingPerfil} className="btn-primary w-full">{loadingPerfil ? 'Guardando...' : 'Guardar cambios'}</button>
      </form>

      {/* Cambiar contraseña */}
      <form onSubmit={cambiarPwd} className="card space-y-4">
        <p className="font-semibold">Cambiar contraseña</p>
        <Msg m={msgPwd} />
        <div>
          <label className="label">Contraseña actual</label>
          <input className="input" type="password" required value={pwd.password_actual} onChange={e => setPwd({ ...pwd, password_actual: e.target.value })} />
        </div>
        <div>
          <label className="label">Nueva contraseña</label>
          <input className="input" type="password" required minLength={8} value={pwd.password_nueva} onChange={e => setPwd({ ...pwd, password_nueva: e.target.value })} />
        </div>
        <div>
          <label className="label">Confirmar nueva contraseña</label>
          <input className="input" type="password" required value={pwd.confirm} onChange={e => setPwd({ ...pwd, confirm: e.target.value })} />
        </div>
        <button type="submit" disabled={loadingPwd} className="btn-secondary w-full">{loadingPwd ? 'Cambiando...' : 'Cambiar contraseña'}</button>
      </form>

      {/* Seguridad: 2FA */}
      <TwoFactorSettings />

      <button onClick={handleLogout} className="w-full py-3 text-red-600 font-medium hover:bg-red-50 rounded-xl transition-colors">
        Cerrar sesión
      </button>
    </div>
  );
}
