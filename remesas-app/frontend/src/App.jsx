import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Transferir from './pages/Transferir';
import Historial from './pages/Historial';
import DetalleTransferencia from './pages/DetalleTransferencia';
import Cuentas from './pages/Cuentas';
import Destinatarios from './pages/Destinatarios';

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
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/transferir" element={<ProtectedRoute><Transferir /></ProtectedRoute>} />
        <Route path="/historial" element={<ProtectedRoute><Historial /></ProtectedRoute>} />
        <Route path="/historial/:id" element={<ProtectedRoute><DetalleTransferencia /></ProtectedRoute>} />
        <Route path="/cuentas" element={<ProtectedRoute><Cuentas /></ProtectedRoute>} />
        <Route path="/destinatarios" element={<ProtectedRoute><Destinatarios /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
