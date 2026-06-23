import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function TwoFactorSettings() {
  const { user, refresh } = useAuth();
  const activado = !!user?.totp_enabled;

  const [setup, setSetup] = useState(null); // { secreto, otpauth, qr }
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [codigosRespaldo, setCodigosRespaldo] = useState(null); // se muestran una sola vez
  const [disponibles, setDisponibles] = useState(null);
  const [mostrarRegen, setMostrarRegen] = useState(false);

  useEffect(() => {
    if (activado) {
      api.estado2FA().then(d => setDisponibles(d.codigos_respaldo_disponibles)).catch(() => {});
    }
  }, [activado]);

  async function iniciar() {
    setMsg(null);
    setLoading(true);
    try {
      const d = await api.setup2FA();
      setSetup(d);
    } catch (err) {
      setMsg({ ok: false, texto: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function activar(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const r = await api.activar2FA(codigo);
      await refresh();
      setSetup(null);
      setCodigo('');
      setCodigosRespaldo(r.codigos_respaldo || null);
      setMsg({ ok: true, texto: '✅ Autenticación en dos pasos activada' });
    } catch (err) {
      setMsg({ ok: false, texto: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function desactivar(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      await api.desactivar2FA(password);
      await refresh();
      setPassword('');
      setCodigosRespaldo(null);
      setMsg({ ok: true, texto: 'Autenticación en dos pasos desactivada' });
    } catch (err) {
      setMsg({ ok: false, texto: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function regenerar(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const r = await api.regenerarCodigos2FA(password);
      setPassword('');
      setMostrarRegen(false);
      setCodigosRespaldo(r.codigos_respaldo);
      setDisponibles(r.codigos_respaldo.length);
    } catch (err) {
      setMsg({ ok: false, texto: err.message });
    } finally {
      setLoading(false);
    }
  }

  const Msg = () => msg && (
    <div className={`p-3 rounded-xl text-sm ${msg.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>{msg.texto}</div>
  );

  function copiarCodigos() {
    navigator.clipboard?.writeText(codigosRespaldo.join('\n')).catch(() => {});
  }

  // Panel que muestra los códigos de respaldo (solo una vez)
  const PanelCodigos = () => codigosRespaldo && (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-amber-800">⚠️ Guarda tus códigos de respaldo</p>
      <p className="text-xs text-amber-700">
        Cada código sirve una sola vez para entrar si pierdes tu app de autenticación.
        No volverán a mostrarse.
      </p>
      <div className="grid grid-cols-2 gap-2 bg-white rounded-lg p-3 border border-amber-100">
        {codigosRespaldo.map(c => (
          <code key={c} className="font-mono text-sm text-gray-800 text-center select-all">{c}</code>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={copiarCodigos} className="btn-secondary flex-1 text-sm py-2">Copiar</button>
        <button onClick={() => setCodigosRespaldo(null)} className="btn-primary flex-1 text-sm py-2">Ya los guardé</button>
      </div>
    </div>
  );

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Verificación en dos pasos (2FA)</p>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${activado ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {activado ? 'Activada' : 'Desactivada'}
        </span>
      </div>
      <Msg />

      {!activado && !setup && (
        <>
          <p className="text-sm text-gray-500">
            Añade una capa extra de seguridad. Necesitarás un código de tu app de autenticación
            (Google Authenticator, Authy, etc.) cada vez que inicies sesión.
          </p>
          <button onClick={iniciar} disabled={loading} className="btn-primary w-full">
            {loading ? 'Generando...' : 'Activar 2FA'}
          </button>
        </>
      )}

      {!activado && setup && (
        <form onSubmit={activar} className="space-y-4">
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
            <li>Abre tu app de autenticación y agrega una cuenta nueva.</li>
            <li>Escanea el código QR o ingresa la clave manualmente:</li>
          </ol>
          {setup.qr && (
            <div className="flex justify-center">
              <img src={setup.qr} alt="Código QR para 2FA" className="w-44 h-44 border border-gray-200 rounded-xl p-2 bg-white" />
            </div>
          )}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-400 mb-1">O ingresa esta clave manualmente</p>
            <code className="font-mono text-sm tracking-wider break-all select-all">{setup.secreto}</code>
          </div>
          <a href={setup.otpauth} className="block text-center text-xs text-brand-600 hover:underline">
            Abrir en la app de autenticación
          </a>
          <div>
            <label className="label">Código de verificación</label>
            <input className="input tracking-[0.4em] text-center text-lg" type="text" inputMode="numeric"
              maxLength={6} placeholder="000000" required
              value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} />
            <p className="text-xs text-gray-400 mt-1">Ingresa el código de 6 dígitos que muestra tu app</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setSetup(null); setCodigo(''); }} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={loading || codigo.length !== 6} className="btn-primary flex-1">
              {loading ? 'Verificando...' : 'Confirmar y activar'}
            </button>
          </div>
        </form>
      )}

      {activado && (
        <div className="space-y-4">
          <PanelCodigos />

          {/* Códigos de respaldo */}
          {!codigosRespaldo && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Códigos de respaldo</p>
                  {disponibles !== null && (
                    <p className={`text-xs mt-0.5 ${disponibles <= 2 ? 'text-red-500' : 'text-gray-400'}`}>
                      {disponibles} disponible{disponibles === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
                <button onClick={() => { setMostrarRegen(v => !v); setMsg(null); }} className="text-sm text-brand-600 font-medium hover:underline">
                  Regenerar
                </button>
              </div>
              {mostrarRegen && (
                <form onSubmit={regenerar} className="mt-3 space-y-2">
                  <p className="text-xs text-gray-500">Esto invalida los códigos anteriores. Confirma tu contraseña.</p>
                  <input className="input" type="password" placeholder="Tu contraseña" required
                    value={password} onChange={e => setPassword(e.target.value)} />
                  <button type="submit" disabled={loading} className="btn-primary w-full text-sm py-2">
                    {loading ? 'Generando...' : 'Generar nuevos códigos'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Desactivar */}
          {!codigosRespaldo && !mostrarRegen && (
            <form onSubmit={desactivar} className="space-y-3 border-t border-gray-100 pt-4">
              <p className="text-sm text-gray-500">Para desactivar el 2FA, confirma tu contraseña.</p>
              <input className="input" type="password" placeholder="Tu contraseña" required
                value={password} onChange={e => setPassword(e.target.value)} />
              <button type="submit" disabled={loading} className="w-full py-2.5 text-red-600 font-medium border border-red-200 hover:bg-red-50 rounded-xl transition-colors">
                {loading ? 'Desactivando...' : 'Desactivar 2FA'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
