import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import RecuperarPassword from './pages/RecuperarPassword';
import RestablecerPassword from './pages/RestablecerPassword';
import VerificarEmail from './pages/VerificarEmail';
import Dashboard from './pages/Dashboard';
import Transferir from './pages/Transferir';
import Historial from './pages/Historial';
import DetalleTransferencia from './pages/DetalleTransferencia';
import Cuentas from './pages/Cuentas';
import Destinatarios from './pages/Destinatarios';
import Verificacion from './pages/Verificacion';
import Notificaciones from './pages/Notificaciones';
import Perfil from './pages/Perfil';
import Ayuda from './pages/Ayuda';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsuarios from './pages/admin/AdminUsuarios';
import AdminTransferencias from './pages/admin/AdminTransferencias';
import AdminTasas from './pages/admin/AdminTasas';
import AdminLog from './pages/admin/AdminLog';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/recuperar" element={<RecuperarPassword />} />
        <Route path="/restablecer" element={<RestablecerPassword />} />
        <Route path="/verificar-email" element={<VerificarEmail />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/transferir" element={<ProtectedRoute><Transferir /></ProtectedRoute>} />
        <Route path="/historial" element={<ProtectedRoute><Historial /></ProtectedRoute>} />
        <Route path="/historial/:id" element={<ProtectedRoute><DetalleTransferencia /></ProtectedRoute>} />
        <Route path="/cuentas" element={<ProtectedRoute><Cuentas /></ProtectedRoute>} />
        <Route path="/destinatarios" element={<ProtectedRoute><Destinatarios /></ProtectedRoute>} />
        <Route path="/verificacion" element={<ProtectedRoute><Verificacion /></ProtectedRoute>} />
        <Route path="/notificaciones" element={<ProtectedRoute><Notificaciones /></ProtectedRoute>} />
        <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
        <Route path="/ayuda" element={<ProtectedRoute><Ayuda /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/usuarios" element={<AdminUsuarios />} />
        <Route path="/admin/transferencias" element={<AdminTransferencias />} />
        <Route path="/admin/tasas" element={<AdminTasas />} />
        <Route path="/admin/auditoria" element={<AdminLog />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
