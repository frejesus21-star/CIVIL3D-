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
- **Autenticación en dos pasos (2FA)** opcional con TOTP, compatible con
  Google Authenticator / Authy (implementación propia según RFC 6238),
  con **código QR escaneable** y **códigos de respaldo de un solo uso**
- Rate limiting y cabeceras de seguridad básicas

### Verificación de identidad (KYC)
- Flujo de verificación con niveles que desbloquean límites
- **Nivel 1 Básico**: $150.000/día · $500.000/mes
- **Nivel 2 Verificado**: $1.500.000/día · $5.000.000/mes
- Validación de límites por transacción, diaria y mensual (cumplimiento anti-lavado)

### Envío de dinero
- **Cotización bidireccional**: "quiero enviar X CLP" o "quiero que reciban X Bs"
- Conversión transparente: CLP → USD → VES con comisión configurable (2,5% por defecto)
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
- **PWA instalable**: se instala como app nativa en el celular (Android/iOS) con
  ícono propio, pantalla completa y service worker (app shell offline)
- Banner de **mensaje de mantenimiento** configurable desde el panel admin

### Panel de administración
Acceso restringido a usuarios con rol admin (doble protección: middleware
`adminAuth` en el backend + guardia de ruta en el frontend). Disponible en `/admin`.

- **Dashboard**: total de usuarios, KYC pendientes, volumen del día y del mes,
  distribución de transferencias por estado y **gráfico de volumen diario**
  (últimos 14 días, SVG sin dependencias)
- **Usuarios**: listado paginado con búsqueda (nombre/email/RUT), detalle con
  historial, y **aprobación/rechazo de KYC** (notifica al usuario)
- **Transferencias**: listado con filtros por **estado** y **rango de fechas**,
  edición de estado y notas internas (notifica cambios al usuario)
- **Tasas y configuración**: ajuste manual de tasas USD/CLP y USD/VES (útil si las
  APIs externas fallan), **comisión configurable en tiempo real** (% y mínimo CLP),
  mensaje de mantenimiento, y botón para forzar recarga desde la API
- **Auditoría**: registro de todas las acciones administrativas (quién hizo qué y
  cuándo), con filtros por tipo de acción y rango de fechas
- **Exportación a CSV** de usuarios y transferencias (compatible con Excel,
  respeta los filtros activos)

Para convertir un usuario en administrador, usa el endpoint protegido con
`ADMIN_SEED_SECRET`:

```bash
curl -X POST http://localhost:4000/api/admin/seed \
  -H 'Content-Type: application/json' \
  -d '{"email":"tu@email.com","secret":"<ADMIN_SEED_SECRET>"}'
```

## Calidad

- Suite de **tests unitarios** del backend con el runner nativo de Node
  (`npm test`, 27 tests): validación de RUT/cédula/teléfono, cálculos de
  cotización (ida y vuelta), límites por nivel y módulo TOTP (verificado
  contra los vectores del RFC 6238).
- **Prueba de integración end-to-end** (`npm run test:e2e`, 28 checks): levanta
  el servidor con una base de datos temporal y recorre el flujo completo
  (registro, KYC, cuentas, destinatarios, transferencia, 2FA con TOTP y
  códigos de respaldo, panel admin y control de acceso). Limpia todo al final.

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
FALLBACK_USD_CLP=950             # tasa de respaldo si las APIs externas fallan
FALLBACK_USD_VES=45             # mantener actualizada (inflación VES)
ADMIN_SEED_SECRET=secreto_admin # protege el endpoint que asigna rol admin
```

> La comisión ya **no** se configura por variable de entorno: se ajusta en vivo
> desde el panel admin (Tasas y configuración) y se persiste en la base de datos.

## Base de datos

Por defecto la app usa **SQLite** (archivo local con WAL), ideal para desarrollo
y suficiente para un MVP. Para **producción/escala** está preparada la migración
a **PostgreSQL**:

```bash
# 1. Levantar PostgreSQL (desde la raíz del proyecto)
docker compose up -d

# 2. Migrar los datos existentes de SQLite a Postgres
cd backend
DATABASE_URL=postgres://remesas:remesas@localhost:5432/remesas \
  npm run migrate:postgres
```

- `scripts/pg-schema.sql` — esquema PostgreSQL equivalente al de SQLite.
- `scripts/migrate-to-postgres.js` — copia todas las tablas respetando las
  claves foráneas (probado: crea el esquema y migra los datos sin pérdida).
- `docker-compose.yml` — servicio PostgreSQL 16 con volumen persistente.

> Nota: el acceso a datos de la app es síncrono (better-sqlite3). Para operar
> **en runtime** sobre Postgres queda como paso final volver asíncrono el data
> layer; el esquema, la infraestructura y la migración de datos ya están listos
> y validados.

## Estructura

```
remesas-app/
├── backend/
│   └── src/
│       ├── config/database.js          # SQLite + schema + migraciones + config
│       ├── utils/validators.js         # RUT, cédula VE, teléfono pago móvil
│       ├── utils/totp.js               # TOTP (RFC 6238) para 2FA
│       ├── services/
│       │   ├── exchangeService.js      # tasas + cotización ida/vuelta + respaldo + comisión
│       │   ├── limitsService.js        # límites por nivel KYC
│       │   ├── notificationService.js  # notificaciones in-app
│       │   └── auditService.js         # registro de acciones de admin
│       ├── controllers/                # auth, kyc, cuentas, destinatarios, transferencias, notificaciones, admin
│       ├── middleware/                 # auth (JWT) + adminAuth + rateLimiter
│       └── routes/index.js
└── frontend/
    └── src/
        ├── pages/      # Login, Register, Dashboard, Transferir, Historial,
        │               # DetalleTransferencia, Cuentas, Destinatarios,
        │               # Verificacion, Notificaciones, Perfil, Ayuda
        │   └── admin/  # AdminLayout, AdminDashboard, AdminUsuarios,
        │               # AdminTransferencias, AdminTasas, AdminLog
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
- Verificación KYC con documentos reales (OCR / proveedor externo)
