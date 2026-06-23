import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import InstallPrompt from './InstallPrompt';

const NAV = [
  { to: '/dashboard', label: 'Inicio', icon: '🏠' },
  { to: '/transferir', label: 'Transferir', icon: '💸' },
  { to: '/historial', label: 'Historial', icon: '📋' },
  { to: '/cuentas', label: 'Mis cuentas', icon: '🏦' },
  { to: '/destinatarios', label: 'Destinatarios', icon: '👥' },
];

const MENU_EXTRA = [
  { to: '/verificacion', label: 'Verificación', icon: '🪪' },
  { to: '/perfil', label: 'Mi perfil', icon: '👤' },
  { to: '/ayuda', label: 'Ayuda', icon: '❓' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [noLeidas, setNoLeidas] = useState(0);
  const [mantenimiento, setMantenimiento] = useState('');

  useEffect(() => {
    let activo = true;
    function cargar() {
      api.contadorNotificaciones().then(r => { if (activo) setNoLeidas(r.no_leidas); }).catch(() => {});
    }
    cargar();
    const interval = setInterval(cargar, 15000);
    return () => { activo = false; clearInterval(interval); };
  }, [location.pathname]);

  useEffect(() => {
    api.configPublica().then(d => { if (d.mensaje_mantenimiento) setMantenimiento(d.mensaje_mantenimiento); }).catch(() => {});
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 font-bold text-brand-600 text-lg">
            <span>💸</span> RemesasVE
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {NAV.map(n => (
              <Link key={n.to} to={n.to}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${location.pathname === n.to ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                {n.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link to="/notificaciones" className="relative p-1" aria-label="Notificaciones">
              <span className="text-xl">🔔</span>
              {noLeidas > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {noLeidas > 9 ? '9+' : noLeidas}
                </span>
              )}
            </Link>
            <Link to="/perfil" className="hidden md:flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
              <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                {user?.nombre?.charAt(0).toUpperCase()}
              </span>
            </Link>
            {user?.is_admin && (
              <Link to="/admin" className="hidden md:block text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 bg-amber-50 rounded-lg">⚙ Admin</Link>
            )}
            <button onClick={handleLogout} className="hidden md:block text-sm text-gray-500 hover:text-red-600 transition-colors">Salir</button>
            <button className="md:hidden p-1 text-xl" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-2 flex flex-col gap-1">
            {[...NAV, ...MENU_EXTRA].map(n => (
              <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${location.pathname === n.to ? 'bg-brand-50 text-brand-700' : 'text-gray-600'}`}>
                <span>{n.icon}</span>{n.label}
              </Link>
            ))}
            <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 text-left">
              <span>🚪</span>Cerrar sesión
            </button>
          </div>
        )}
        {/* Sub-nav desktop para accesos secundarios */}
        <div className="hidden md:block border-t border-gray-50">
          <div className="max-w-5xl mx-auto px-4 h-9 flex items-center gap-4">
            {MENU_EXTRA.map(n => (
              <Link key={n.to} to={n.to}
                className={`text-xs font-medium transition-colors ${location.pathname === n.to ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
                {n.icon} {n.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {mantenimiento && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm text-center px-4 py-2">
          ⚠️ {mantenimiento}
        </div>
      )}

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30">
        <div className="flex">
          {NAV.map(n => (
            <Link key={n.to} to={n.to}
              className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${location.pathname === n.to ? 'text-brand-600' : 'text-gray-400'}`}>
              <span className="text-lg">{n.icon}</span>
              <span className="text-[10px]">{n.label}</span>
            </Link>
          ))}
        </div>
      </nav>
      <div className="md:hidden h-16" />
      <InstallPrompt />
    </div>
  );
}
