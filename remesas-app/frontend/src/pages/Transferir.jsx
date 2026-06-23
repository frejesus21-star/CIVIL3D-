import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

function fmt(n) { return new Intl.NumberFormat('es-CL').format(Math.round(n)); }
function fmtVes(n) { return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 0 }).format(Math.round(n)); }

const PASOS = ['Monto', 'Origen', 'Destino', 'Confirmar'];

export default function Transferir() {
  const navigate = useNavigate();
  const [paso, setPaso] = useState(0);
  const [monto, setMonto] = useState('');
  const [cotizacion, setCotizacion] = useState(null);
  const [loadingCot, setLoadingCot] = useState(false);
  const [cuentas, setCuentas] = useState([]);
  const [destinatarios, setDestinatarios] = useState([]);
  const [cuentaId, setCuentaId] = useState('');
  const [destId, setDestId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null);

  useEffect(() => {
    api.cuentas().then(setCuentas).catch(() => {});
    api.destinatarios().then(setDestinatarios).catch(() => {});
  }, []);

  const cotizar = useCallback(async (val) => {
    const num = Number(String(val).replace(/\./g, '').replace(',', ''));
    if (!num || num < 1000) { setCotizacion(null); return; }
    setLoadingCot(true);
    try {
      const c = await api.cotizar(num);
      setCotizacion(c);
    } catch {
      setCotizacion(null);
    } finally {
      setLoadingCot(false);
    }
  }, []);

  function handleMonto(e) {
    const raw = e.target.value.replace(/\./g, '');
    if (!/^\d*$/.test(raw)) return;
    const num = Number(raw);
    setMonto(fmt(num) === '0' ? '' : fmt(num));
    cotizar(num);
  }

  async function confirmar() {
    setError('');
    setEnviando(true);
    const montoNum = Number(monto.replace(/\./g, ''));
    try {
      const t = await api.crearTransferencia({ cuenta_origen_id: cuentaId, destinatario_id: destId, monto_clp: montoNum });
      setExito(t);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (exito) {
    return (
      <div className="max-w-md mx-auto space-y-5">
        <div className="card text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-bold text-gray-900">¡Transferencia enviada!</h2>
          <p className="text-gray-500 text-sm">Tu dinero está siendo procesado</p>
          <div className="bg-brand-50 rounded-xl p-4 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Referencia</span>
              <span className="font-mono font-semibold">{exito.referencia}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Enviaste</span>
              <span className="font-semibold">${fmt(exito.monto_clp)} CLP</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">El destinatario recibe</span>
              <span className="font-semibold text-brand-600">{fmtVes(exito.monto_ves)} Bs.</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => navigate('/historial')}>Ver historial</button>
            <button className="btn-primary flex-1" onClick={() => { setExito(null); setPaso(0); setMonto(''); setCotizacion(null); }}>Nueva transferencia</button>
          </div>
        </div>
      </div>
    );
  }

  const montoNum = Number(monto.replace(/\./g, ''));

  return (
    <div className="max-w-md mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Enviar dinero</h1>

      {/* Stepper */}
      <div className="flex items-center gap-1">
        {PASOS.map((p, i) => (
          <React.Fragment key={p}>
            <div className={`flex-1 h-1.5 rounded-full ${i <= paso ? 'bg-brand-500' : 'bg-gray-200'}`} />
          </React.Fragment>
        ))}
      </div>
      <p className="text-sm text-gray-500 font-medium">Paso {paso + 1} de {PASOS.length}: <span className="text-gray-900">{PASOS[paso]}</span></p>

      {/* Paso 0: Monto */}
      {paso === 0 && (
        <div className="card space-y-5">
          <div>
            <label className="label">¿Cuánto quieres enviar?</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
              <input className="input pl-7 text-xl font-semibold" placeholder="50.000"
                value={monto} onChange={handleMonto} inputMode="numeric" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">CLP</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Mínimo $1.000 — Máximo $5.000.000 CLP</p>
          </div>

          {loadingCot && <div className="text-sm text-gray-400">Calculando...</div>}
          {cotizacion && (
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-brand-700 mb-2">Resumen</p>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Monto enviado</span><span>${fmt(cotizacion.monto_clp)} CLP</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Comisión ({cotizacion.comision_pct}%)</span><span>-${fmt(cotizacion.comision_clp)} CLP</span></div>
              <div className="border-t border-brand-200 pt-2 flex justify-between text-sm"><span className="text-gray-600">Neto</span><span>${fmt(cotizacion.monto_neto_clp)} CLP</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Equivalente USD</span><span>${cotizacion.monto_usd} USD</span></div>
              <div className="flex justify-between font-bold text-brand-700"><span>Destinatario recibe</span><span>{fmtVes(cotizacion.monto_ves)} Bs.</span></div>
              <p className="text-xs text-gray-400 pt-1">Tasa: 1 USD = {fmt(cotizacion.tasa_usd_ves)} Bs. (paralelo) · {fmt(cotizacion.tasa_usd_clp)} CLP</p>
            </div>
          )}

          <button disabled={!cotizacion || montoNum < 1000} className="btn-primary w-full"
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
              <a href="/cuentas" className="text-brand-600 text-sm font-medium hover:underline">Agregar cuenta →</a>
            </div>
          ) : (
            <div className="space-y-2">
              {cuentas.map(c => (
                <label key={c.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${cuentaId === c.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" className="hidden" value={c.id} checked={cuentaId === c.id} onChange={() => setCuentaId(c.id)} />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{c.banco}</p>
                    <p className="text-xs text-gray-500">{c.tipo_cuenta} · ···{c.numero_cuenta.slice(-4)}</p>
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
              <a href="/destinatarios" className="text-brand-600 text-sm font-medium hover:underline">Agregar destinatario →</a>
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
                    <p className="font-medium text-sm">{d.nombre}</p>
                    <p className="text-xs text-gray-500">{d.tipo === 'pago_movil' ? '📱 Pago Móvil' : '🏦 Banco'} · {d.banco}</p>
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
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
            <div className="space-y-3">
              <div className="flex justify-between text-sm py-2 border-b border-gray-100">
                <span className="text-gray-500">Envías</span>
                <span className="font-semibold text-lg">${fmt(montoNum)} CLP</span>
              </div>
              {cotizacion && <>
                <div className="flex justify-between text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-500">Comisión</span>
                  <span>-${fmt(cotizacion.comision_clp)} CLP</span>
                </div>
                <div className="flex justify-between text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-500">Destinatario recibe</span>
                  <span className="font-bold text-brand-600 text-base">{fmtVes(cotizacion.monto_ves)} Bs.</span>
                </div>
              </>}
              {cuenta && (
                <div className="flex justify-between text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-500">Desde</span>
                  <span>{cuenta.banco} ···{cuenta.numero_cuenta.slice(-4)}</span>
                </div>
              )}
              {dest && (
                <div className="flex justify-between text-sm py-2">
                  <span className="text-gray-500">Para</span>
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
