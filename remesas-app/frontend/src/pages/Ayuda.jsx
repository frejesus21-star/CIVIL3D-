import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const FAQS = [
  {
    q: '¿Cómo envío dinero a Venezuela?',
    a: 'Registra una cuenta bancaria chilena en "Mis cuentas", agrega un destinatario en "Destinatarios" (banco o pago móvil), y luego ve a "Transferir". Ingresa el monto, confirma y listo.',
  },
  {
    q: '¿Qué es el pago móvil?',
    a: 'Es un sistema venezolano para recibir dinero usando solo el número de teléfono, la cédula y el banco del destinatario. El dinero llega directo a su cuenta asociada al teléfono.',
  },
  {
    q: '¿Qué tasa de cambio usan?',
    a: 'Usamos la tasa del dólar promedio de Venezuela en tiempo real. La conversión es CLP → USD → VES. Verás la tasa exacta antes de confirmar cada envío.',
  },
  {
    q: '¿Cuánto cobran de comisión?',
    a: 'La comisión es del 2,5% sobre el monto enviado. Siempre verás el desglose completo (monto, comisión y cuánto recibe el destinatario) antes de confirmar.',
  },
  {
    q: '¿Cuánto puedo enviar?',
    a: 'Con cuenta Básica puedes enviar hasta $150.000 CLP/día y $500.000 CLP/mes. Al verificar tu identidad subes a Nivel Verificado: $1.500.000 CLP/día y $5.000.000 CLP/mes.',
  },
  {
    q: '¿Por qué debo verificar mi identidad?',
    a: 'Por normativa de prevención de lavado de activos, todo servicio de remesas debe conocer a sus usuarios (KYC). Verificarte además aumenta tus límites de envío.',
  },
  {
    q: '¿Cuánto demora la transferencia?',
    a: 'Una vez confirmada, la transferencia pasa por las etapas: recibida → procesando → completada. Recibirás una notificación en cada cambio de estado.',
  },
  {
    q: '¿Puedo cancelar una transferencia?',
    a: 'Sí, pero solo mientras esté en estado "pendiente". Una vez que pasa a "procesando" ya no se puede cancelar.',
  },
];

function Item({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left gap-3">
        <span className="font-medium text-sm">{q}</span>
        <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">{a}</p>}
    </div>
  );
}

export default function Ayuda() {
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Centro de ayuda</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm">Preguntas frecuentes sobre el envío de dinero a Venezuela.</p>

      <div className="space-y-3">
        {FAQS.map((f, i) => <Item key={i} {...f} />)}
      </div>

      <div className="card bg-brand-50 border-brand-100 text-center space-y-2">
        <p className="font-semibold">¿Necesitas más ayuda?</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">Escríbenos a <a href="mailto:soporte@remesasve.cl" className="text-brand-600 font-medium">soporte@remesasve.cl</a></p>
        <Link to="/transferir" className="btn-primary inline-flex mt-2">Hacer una transferencia</Link>
      </div>

      <p className="text-xs text-gray-400 text-center">
        RemesasVE · Servicio de envío de remesas Chile → Venezuela.<br />
        Las operaciones están sujetas a verificación de identidad y límites por normativa vigente.
      </p>
    </div>
  );
}
