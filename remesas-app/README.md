# RemesasVE 💸

Aplicación full-stack para enviar dinero desde **Chile (CLP)** a **Venezuela (VES)**, a cuenta bancaria o **Pago Móvil**, usando la tasa del **dólar paralelo** en tiempo real.

## Stack

- **Backend**: Node.js + Express + SQLite (better-sqlite3) + JWT
- **Frontend**: React + Vite + Tailwind CSS (responsive web + móvil)
- **Tasas**: dólar paralelo venezolano (`dolarapi.com`) + USD/CLP (`open.er-api.com`), con caché de 30 min y **tasa de respaldo configurable** si las APIs no responden

## Funcionalidades

### Cuenta y seguridad
- Registro/login con **validación de RUT chileno** (dígito verificador, módulo 11)
- JWT con expiración de 7 días, contraseñas con bcrypt
- Edición de perfil y cambio de contraseña
- Rate limiting y cabeceras de seguridad básicas

### Verificación de identidad (KYC)
- Flujo de verificación con niveles que desbloquean límites
- **Nivel 1 Básico**: $150.000/día · $500.000/mes
- **Nivel 2 Verificado**: $1.500.000/día · $5.000.000/mes
- Validación de límites por transacción, diaria y mensual (cumplimiento anti-lavado)

### Envío de dinero
- **Cotización bidireccional**: "quiero enviar X CLP" o "quiero que reciban X Bs"
- Conversión transparente: CLP → USD → VES con comisión del 2,5%
- Flujo guiado en 4 pasos (monto → origen → destino → confirmar)
- **Seguimiento en tiempo real** con timeline de estados (recibida → procesando → completada)
- Cancelación de transferencias pendientes
- Comprobante imprimible

### Gestión
- Cuentas bancarias chilenas (13 bancos)
- Destinatarios venezolanos: banco (cuenta de 20 dígitos) o Pago Móvil (validación de prefijos 0412/0414/0416/0424/0426)
- Marcar destinatarios como **favoritos**
- Validación de cédula venezolana (V/E + 6-9 dígitos)

### Experiencia
- Centro de **notificaciones** in-app con contador en vivo
- **Dashboard** con estadísticas, uso mensual y límites disponibles
- Centro de **ayuda / FAQ**
- Diseño responsive: navegación inferior en móvil, barra superior en escritorio

## Cómo correr

```bash
cd remesas-app

# Instalar dependencias (solo la primera vez)
cd backend && npm install && cd ../frontend && npm install && cd ..

# Iniciar backend + frontend juntos
bash start.sh
```

- Backend API: http://localhost:4000
- Frontend: http://localhost:5173

### Configuración (backend/.env)

```
PORT=4000
JWT_SECRET=tu_secreto_seguro
FALLBACK_USD_CLP=950      # tasa de respaldo si las APIs externas fallan
FALLBACK_USD_VES=45       # mantener actualizada (inflación VES)
```

## Estructura

```
remesas-app/
├── backend/
│   └── src/
│       ├── config/database.js          # SQLite + schema + migraciones
│       ├── utils/validators.js         # RUT, cédula VE, teléfono pago móvil
│       ├── services/
│       │   ├── exchangeService.js      # tasas + cotización ida/vuelta + respaldo
│       │   ├── limitsService.js        # límites por nivel KYC
│       │   └── notificationService.js  # notificaciones in-app
│       ├── controllers/                # auth, kyc, cuentas, destinatarios, transferencias, notificaciones
│       ├── middleware/                 # auth (JWT) + rateLimiter
│       └── routes/index.js
└── frontend/
    └── src/
        ├── pages/      # Login, Register, Dashboard, Transferir, Historial,
        │               # DetalleTransferencia, Cuentas, Destinatarios,
        │               # Verificacion, Notificaciones, Perfil, Ayuda
        ├── components/Layout.jsx
        ├── context/AuthContext.jsx
        ├── services/api.js
        └── utils/format.js
```

## Notas importantes

- El **ciclo de vida de las transferencias** y la **aprobación de KYC** están **simulados** (avanzan automáticamente tras unos segundos) para poder probar el flujo completo. En producción se integran con un procesador de pagos real (Khipu/Flow/Transbank en Chile) y un servicio/equipo de verificación KYC.
- Las tasas de respaldo deben mantenerse actualizadas por un administrador, sobre todo la de VES por la alta inflación.

## Próximos pasos sugeridos

- Integración con procesador de pagos real (lado Chile) y red de pago en Venezuela
- KYC real con verificación documental automatizada
- Notificaciones por email/SMS/push
- Panel de administración (tasas, comisiones, aprobación KYC, monitoreo de operaciones)
- Autenticación de dos factores (2FA)
