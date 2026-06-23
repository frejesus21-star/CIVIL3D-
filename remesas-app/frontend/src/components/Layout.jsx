import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/dashboard', label: 'Inicio', icon: '🏠' },
  { to: '/transferir', label: 'Transferir', icon: '💸' },
  { to: '/historial', label: 'Historial', icon: '📋' },
  { to: '/cuentas', label: 'Mis cuentas', icon: '🏦' },
  { to: '/destinatarios', label: 'Destinatarios', icon: '👥' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
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
            <span className="hidden md:block text-sm text-gray-500">{user?.nombre}</span>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-600 transition-colors">Salir</button>
            <button className="md:hidden p-1" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-2 flex flex-col gap-1">
            {NAV.map(n => (
              <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${location.pathname === n.to ? 'bg-brand-50 text-brand-700' : 'text-gray-600'}`}>
                <span>{n.icon}</span>{n.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30">
        <div className="flex">
          {NAV.map(n => (
            <Link key={n.to} to={n.to}
              className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${location.pathname === n.to ? 'text-brand-600' : 'text-gray-400'}`}>
              <span className="text-lg">{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          ))}
        </div>
      </nav>
      <div className="md:hidden h-16" />
    </div>
  );
}
