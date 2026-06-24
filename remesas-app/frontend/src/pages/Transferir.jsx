import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../services/api';
import { fmtCLP, fmtVES } from '../utils/format';

const PASOS = ['Monto', 'Origen', 'Destino', 'Confirmar'];

export default function Transferir() {
  const navigate = useNavigate();
  const location = useLocation();

  // Restaurar estado guardado al volver de cuentas/destinatarios
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('transferir_state') || 'null'); } catch { return null; } })();

  const [paso, setPaso] = useState(saved?.paso ?? 0);
  const [modo, setModo] = useState(saved?.modo ?? 'envio');
  const [valor, setValor] = useState(saved?.valor ?? '');
  const [cotizacion, setCotizacion] = useState(saved?.cotizacion ?? null);
  const [loadingCot, setLoadingCot] = useState(false);
  const [cuentas, setCuentas] = useState([]);
  const [destinatarios, setDestinatarios] = useState([]);
  const [limites, setLimites] = useState(null);
  const [cuentaId, setCuentaId] = useState(saved?.cuentaId ?? '');
  const [destId, setDestId] = useState(saved?.destId ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [errorLimite, setErrorLimite] = useState(false);
  const [err2fa, setErr2fa] = useState(false);
  const [exito, setExito] = useState(null);
  const debounceRef = useRef(null);

  // Guardar estado antes de navegar a otra página
  function guardarEstado(pasoActual) {
    sessionStorage.setItem('transferir_state', JSON.stringify({ paso: pasoActual, modo, valor, cotizacion, cuentaId, destId }));
  }

  useEffect(() => {
    // Limpiar estado guardado solo al montar sin volver de otra página
    if (!location.state?.volver) sessionStorage.removeItem('transferir_state');
    api.cuentas().then(d => {
      setCuentas(d);
      // Si volvimos y no hay cuenta seleccionada, preseleccionar la más reciente
      if (!cuentaId && d.length > 0 && location.state?.volver === 'cuenta') setCuentaId(d[0].id);
    }).catch(() => {});
    api.destinatarios().then(d => {
      setDestinatarios(d);
      if (!destId && d.length > 0 && location.state?.volver === 'destinatario') setDestId(d[0].id);
    }).catch(() => {});
    api.stats().then(s => setLimites(s.limites)).catch(() => {});
  }, []);

  const cotizar = useCallback(async (val, modoActual) => {
    const num = Number(String(val).replace(/\./g, ''));
    if (!num || num <= 0) { setCotizacion(null); return; }
    setLoadingCot(true);
    try {
      const c = modoActual === 'recibo' ? await api.cotizarInverso(num) : await api.cotizar(num);
      setCotizacion(c);
    } catch {
      setCotizacion(null);
    } finally {
      setLoadingCot(false);
    }
  }, []);

  function handleValor(e) {
    const raw = e.target.value.replace(/\./g, '');
    if (!/^\d*$/.test(raw)) return;
    const num = Number(raw);
    setValor(num === 0 ? '' : fmtCLP(num));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => cotizar(num, modo), 400);
  }

  function cambiarModo(nuevoModo) {
    if (nuevoModo === modo) return;
    setModo(nuevoModo);
    setValor('');
    setCotizacion(null);
  }

  async function confirmar() {
    setError('');
    setErrorLimite(false);
    setErr2fa(false);
    setEnviando(true);
    try {
      const t = await api.crearTransferencia({
        cuenta_origen_id: cuentaId,
        destinatario_id: destId,
        monto_clp: cotizacion.monto_clp,
      });
      sessionStorage.removeItem('transferir_state');
      setExito(t);
    } catch (err) {
      setError(err.message);
      if (err.codigo === 'LIMITE_EXCEDIDO') setErrorLimite(true);
      if (err.codigo === 'REQUIERE_2FA') setErr2fa(true);
    } finally {
      setEnviando(false);
    }
  }

  if (exito) {
    return (
      <div className="max-w-md mx-auto space-y-5">
        <div className="card space-y-4">
          <div className="text-center">
            <div className="text-5xl mb-2">📋</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">¡Orden registrada!</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Ahora debes realizar la transferencia bancaria</p>
          </div>
          <div className="bg-brand-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Referencia</span>
              <span className="font-mono font-bold text-brand-700">{exito.referencia}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Monto a transferir</span>
              <span className="font-semibold">${fmtCLP(exito.monto_clp)} CLP</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">El destinatario recibe</span>
              <span className="font-semibold text-brand-600">{fmtVES(exito.monto_ves)} Bs.</span>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-amber-800 text-sm">Pasos para completar tu envío:</p>
            <ol className="text-sm text-amber-700 space-y-1 list-decimal list-inside">
              <li>Transfiere <strong>${fmtCLP(exito.monto_clp)} CLP</strong> a nuestra cuenta bancaria</li>
              <li>Usa como referencia: <strong className="font-mono">{exito.referencia}</strong></li>
              <li>Una vez recibido el pago, procesamos tu envío a Venezuela</li>
            </ol>
            <p className="text-xs text-amber-600 mt-2">Recibirás una notificación cuando el pago sea confirmado y el dinero entregado.</p>
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => navigate(`/historial/${exito.id}`)}>Ver seguimiento</button>
            <button className="btn-primary flex-1" onClick={() => { setExito(null); setPaso(0); setValor(''); setCotizacion(null); setCuentaId(''); setDestId(''); }}>Nueva transferencia</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Enviar dinero</h1>

      <div className="flex items-center gap-1">
        {PASOS.map((p, i) => (
          <div key={p} className={`flex-1 h-1.5 rounded-full ${i <= paso ? 'bg-brand-500' : 'bg-gray-200'}`} />
        ))}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Paso {paso + 1} de {PASOS.length}: <span className="text-gray-900 dark:text-gray-100">{PASOS[paso]}</span></p>

      {/* Paso 0: Monto */}
      {paso === 0 && (
        <div className="card space-y-5">
          {/* Toggle modo */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
            <button onClick={() => cambiarModo('envio')}
              className={`py-2 rounded-lg text-sm font-medium transition-colors ${modo === 'envio' ? 'bg-white shadow text-brand-700' : 'text-gray-500 dark:text-gray-400'}`}>
              Quiero enviar
            </button>
            <button onClick={() => cambiarModo('recibo')}
              className={`py-2 rounded-lg text-sm font-medium transition-colors ${modo === 'recibo' ? 'bg-white shadow text-brand-700' : 'text-gray-500 dark:text-gray-400'}`}>
              Quiero que reciban
            </button>
          </div>

          <div>
            <label className="label">{modo === 'envio' ? '¿Cuánto quieres enviar?' : '¿Cuánto quieres que reciban?'}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">{modo === 'envio' ? '$' : 'Bs.'}</span>
              <input className={`input ${modo === 'envio' ? 'pl-7' : 'pl-12'} text-xl font-semibold`} placeholder={modo === 'envio' ? '50.000' : '5.000'}
                value={valor} onChange={handleValor} inputMode="numeric" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{modo === 'envio' ? 'CLP' : 'VES'}</span>
            </div>
            {limites && (
              <p className="text-xs text-gray-400 mt-1">
                Disponible hoy: ${fmtCLP(limites.disponible_hoy)} CLP · Nivel {limites.nivel_nombre}
              </p>
            )}
          </div>

          {loadingCot && <div className="text-sm text-gray-400">Calculando...</div>}
          {cotizacion && (
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-brand-700 mb-2">Resumen</p>
              <div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-300">Monto enviado</span><span>${fmtCLP(cotizacion.monto_clp)} CLP</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-300">Comisión ({cotizacion.comision_pct}%)</span><span>-${fmtCLP(cotizacion.comision_clp)} CLP</span></div>
              <div className="border-t border-brand-200 pt-2 flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-300">Neto</span><span>${fmtCLP(cotizacion.monto_neto_clp)} CLP</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-300">Equivalente USD</span><span>${cotizacion.monto_usd} USD</span></div>
              <div className="flex justify-between font-bold text-brand-700"><span>Destinatario recibe</span><span>{fmtVES(cotizacion.monto_ves)} Bs.</span></div>
              <p className="text-xs text-gray-400 pt-1">Tasa: 1 USD = {fmtCLP(cotizacion.tasa_usd_ves)} Bs. (promedio) · {fmtCLP(cotizacion.tasa_usd_clp)} CLP</p>
            </div>
          )}

          {limites && cotizacion && cotizacion.monto_clp > limites.disponible_hoy && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm">
              Este monto supera tu disponible de hoy (${fmtCLP(limites.disponible_hoy)} CLP).{' '}
              {limites.nivel < 2 && <Link to="/verificacion" className="font-medium underline">Verifícate para aumentar tus límites</Link>}
            </div>
          )}

          <button disabled={!cotizacion || cotizacion.monto_clp < 1000} className="btn-primary w-full"
            onClick={() => setPaso(1)}>
            Continuar →
          </button>
        </div>
      )}

      {/* Paso 1: Cuenta origen */}
      {paso === 1 && (
        <div className="card space-y-4">
          <p className="font-semibold">¿Desde qué cuenta chilena envías?</p>
          {cuentas.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p>No tienes cuentas registradas</p>
              <button onClick={() => { guardarEstado(1); navigate('/cuentas', { state: { volver: 'cuenta' } }); }}
                className="text-brand-600 text-sm font-medium hover:underline">Agregar cuenta →</button>
            </div>
          ) : (
            <div className="space-y-2">
              {cuentas.map(c => (
                <label key={c.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${cuentaId === c.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" className="hidden" value={c.id} checked={cuentaId === c.id} onChange={() => setCuentaId(c.id)} />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{c.banco}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.tipo_cuenta} · ···{c.numero_cuenta.slice(-4)}</p>
                    <p className="text-xs text-gray-400">{c.titular}</p>
                  </div>
                  {cuentaId === c.id && <span className="text-brand-500">✓</span>}
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setPaso(0)}>← Atrás</button>
            <button disabled={!cuentaId} className="btn-primary flex-1" onClick={() => setPaso(2)}>Continuar →</button>
          </div>
        </div>
      )}

      {/* Paso 2: Destinatario */}
      {paso === 2 && (
        <div className="card space-y-4">
          <p className="font-semibold">¿A quién le envías?</p>
          {destinatarios.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p>No tienes destinatarios registrados</p>
              <button onClick={() => { guardarEstado(2); navigate('/destinatarios', { state: { volver: 'destinatario' } }); }}
                className="text-brand-600 text-sm font-medium hover:underline">Agregar destinatario →</button>
            </div>
          ) : (
            <div className="space-y-2">
              {destinatarios.map(d => (
                <label key={d.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${destId === d.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" className="hidden" value={d.id} checked={destId === d.id} onChange={() => setDestId(d.id)} />
                  <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                    {d.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{d.nombre} {d.favorito && <span className="text-amber-400">★</span>}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{d.tipo === 'pago_movil' ? '📱 Pago Móvil' : '🏦 Banco'} · {d.banco}</p>
                    {d.telefono && <p className="text-xs text-gray-400">{d.telefono}</p>}
                  </div>
                  {destId === d.id && <span className="text-brand-500">✓</span>}
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setPaso(1)}>← Atrás</button>
            <button disabled={!destId} className="btn-primary flex-1" onClick={() => setPaso(3)}>Continuar →</button>
          </div>
        </div>
      )}

      {/* Paso 3: Confirmar */}
      {paso === 3 && (() => {
        const cuenta = cuentas.find(c => c.id === cuentaId);
        const dest = destinatarios.find(d => d.id === destId);
        return (
          <div className="card space-y-5">
            <p className="font-semibold">Confirma tu transferencia</p>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                {error}
                {errorLimite && <div className="mt-2"><Link to="/verificacion" className="font-medium underline">Verificar mi identidad →</Link></div>}
                {err2fa && <div className="mt-2"><Link to="/perfil" className="font-medium underline">Activar 2FA en Mi Perfil →</Link></div>}
              </div>
            )}
            <div className="space-y-3">
              <div className="flex justify-between text-sm py-2 border-b border-gray-100">
                <span className="text-gray-500 dark:text-gray-400">Envías</span>
                <span className="font-semibold text-lg">${fmtCLP(cotizacion.monto_clp)} CLP</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-gray-100">
                <span className="text-gray-500 dark:text-gray-400">Comisión</span>
                <span>-${fmtCLP(cotizacion.comision_clp)} CLP</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-gray-100">
                <span className="text-gray-500 dark:text-gray-400">Destinatario recibe</span>
                <span className="font-bold text-brand-600 text-base">{fmtVES(cotizacion.monto_ves)} Bs.</span>
              </div>
              {cuenta && (
                <div className="flex justify-between text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-500 dark:text-gray-400">Desde</span>
                  <span>{cuenta.banco} ···{cuenta.numero_cuenta.slice(-4)}</span>
                </div>
              )}
              {dest && (
                <div className="flex justify-between text-sm py-2">
                  <span className="text-gray-500 dark:text-gray-400">Para</span>
                  <div className="text-right">
                    <p>{dest.nombre}</p>
                    <p className="text-xs text-gray-400">{dest.tipo === 'pago_movil' ? '📱 Pago Móvil' : '🏦 Banco'} · {dest.banco}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setPaso(2)}>← Atrás</button>
              <button disabled={enviando} className="btn-primary flex-1" onClick={confirmar}>
                {enviando ? 'Enviando...' : '✓ Confirmar envío'}
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center">Al confirmar autorizas el débito de tu cuenta</p>
          </div>
        );
      })()}
    </div>
  );
}
