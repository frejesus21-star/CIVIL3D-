import React from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: '📊' },
  { to: '/admin/usuarios', label: 'Usuarios', icon: '👥' },
  { to: '/admin/transferencias', label: 'Transferencias', icon: '💸' },
  { to: '/admin/tasas', label: 'Tasas', icon: '💱' },
  { to: '/admin/auditoria', label: 'Auditoría', icon: '📜' },
];

export default function AdminLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user?.is_admin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col min-h-screen fixed top-0 left-0 z-40">
        <div className="px-5 py-4 border-b border-gray-700">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Panel Admin</p>
          <p className="font-bold text-white mt-0.5">RemesasVE</p>
        </div>
        <nav className="flex-1 py-4 flex flex-col gap-0.5 px-2">
          {NAV.map(n => (
            <Link key={n.to} to={n.to}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === n.to ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <span>{n.icon}</span>{n.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-700">
          <Link to="/dashboard" className="text-xs text-gray-400 hover:text-white transition-colors">← Volver a la app</Link>
        </div>
      </aside>
      {/* Content */}
      <main className="flex-1 ml-56 p-6">
        {children}
      </main>
    </div>
  );
}
