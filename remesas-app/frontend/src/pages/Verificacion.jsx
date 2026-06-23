import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmtCLP } from '../utils/format';

const ESTADOS = {
  no_iniciado: { label: 'Sin verificar', color: 'bg-gray-100 text-gray-600 dark:text-gray-300', icon: '○' },
  en_revision: { label: 'En revisión', color: 'bg-blue-100 text-blue-700', icon: '🔎' },
  verificado: { label: 'Verificado', color: 'bg-green-100 text-green-700', icon: '✅' },
  rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-700', icon: '❌' },
};

export default function Verificacion() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ fecha_nacimiento: '', direccion: '', ciudad: '', tipo_documento: 'Cédula de Identidad', numero_documento: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const pollRef = useRef(null);

  function cargar() {
    api.kyc().then(d => {
      setData(d);
      setForm(f => ({
        ...f,
        fecha_nacimiento: d.fecha_nacimiento || f.fecha_nacimiento,
        direccion: d.direccion || f.direccion,
        ciudad: d.ciudad || f.ciudad,
        numero_documento: d.numero_documento || f.numero_documento,
      }));
    }).catch(() => {});
  }

  useEffect(() => {
    cargar();
    return () => clearInterval(pollRef.current);
  }, []);

  // Si está en revisión, consultar periódicamente hasta que se apruebe (simulación auto-aprueba en ~5s)
  useEffect(() => {
    if (data?.kyc_estado === 'en_revision') {
      pollRef.current = setInterval(async () => {
        const d = await api.kyc().catch(() => null);
        if (d && d.kyc_estado !== 'en_revision') {
          setData(d);
          refresh();
          clearInterval(pollRef.current);
        }
      }, 2000);
      return () => clearInterval(pollRef.current);
    }
  }, [data?.kyc_estado, refresh]);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await api.enviarKyc(form);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!data) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  const est = ESTADOS[data.kyc_estado] || ESTADOS.no_iniciado;
  const verificado = data.kyc_estado === 'verificado';
  const enRevision = data.kyc_estado === 'en_revision';

  return (
    <div className="max-w-md mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Verificación de identidad</h1>

      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Estado actual</p>
          <p className="font-semibold">Nivel {data.kyc_nivel} · {data.resumen.nivel_nombre}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${est.color}`}>{est.icon} {est.label}</span>
      </div>

      {/* Comparativa de límites */}
      <div className="card">
        <p className="font-semibold mb-3">Tus límites de envío</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Por transacción</span><span className="font-medium">${fmtCLP(data.resumen.limites.por_transaccion)} CLP</span></div>
          <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Diario</span><span className="font-medium">${fmtCLP(data.resumen.limites.diario)} CLP</span></div>
          <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Mensual</span><span className="font-medium">${fmtCLP(data.resumen.limites.mensual)} CLP</span></div>
        </div>
        {!verificado && (
          <div className="mt-4 p-3 bg-brand-50 rounded-xl text-sm">
            <p className="font-medium text-brand-700">Al verificarte (Nivel 2) podrás enviar:</p>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Hasta <strong>${fmtCLP(data.nivel_objetivo.diario)} CLP/día</strong> y <strong>${fmtCLP(data.nivel_objetivo.mensual)} CLP/mes</strong></p>
          </div>
        )}
      </div>

      {verificado ? (
        <div className="card text-center space-y-3">
          <div className="text-4xl">🎉</div>
          <p className="font-semibold">¡Tu identidad está verificada!</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Ya disfrutas de los límites ampliados.</p>
          <button className="btn-primary w-full" onClick={() => navigate('/transferir')}>Hacer una transferencia</button>
        </div>
      ) : enRevision ? (
        <div className="card text-center space-y-3">
          <div className="text-4xl animate-pulse">🔎</div>
          <p className="font-semibold">Estamos revisando tus datos</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Esto toma unos minutos. Te avisaremos cuando esté listo. Puedes seguir usando la app.</p>
        </div>
      ) : (
        <form onSubmit={enviar} className="card space-y-4">
          <p className="font-semibold">Completa tus datos</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Necesitamos esta información por normativa de prevención de lavado de activos. Tus datos están protegidos.</p>
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
          <div>
            <label className="label">Fecha de nacimiento</label>
            <input className="input" type="date" required value={form.fecha_nacimiento} onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })} />
          </div>
          <div>
            <label className="label">Tipo de documento</label>
            <select className="input" value={form.tipo_documento} onChange={e => setForm({ ...form, tipo_documento: e.target.value })}>
              <option>Cédula de Identidad</option>
              <option>Pasaporte</option>
            </select>
          </div>
          <div>
            <label className="label">Número de documento</label>
            <input className="input" required value={form.numero_documento} onChange={e => setForm({ ...form, numero_documento: e.target.value })} />
          </div>
          <div>
            <label className="label">Dirección</label>
            <input className="input" required value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
          </div>
          <div>
            <label className="label">Ciudad</label>
            <input className="input" required value={form.ciudad} onChange={e => setForm({ ...form, ciudad: e.target.value })} />
          </div>
          <button type="submit" disabled={enviando} className="btn-primary w-full">
            {enviando ? 'Enviando...' : 'Enviar verificación'}
          </button>
        </form>
      )}
    </div>
  );
}
