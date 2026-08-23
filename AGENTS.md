# GLAMOURS — Guía del Proyecto (AGENTS.md)

Sistema de gestión comercial: **libro de caja doble (Blanco/Negro)**, ventas, cierres de caja, conciliaciones y auditoría. Interfaz 100% en español.

> **Kit del usuario**: en `C:\Opencode` hay accesos directos y guía (`LEEME.txt`) para abrir opencode local y la app en modo desarrollo/producción. `opencode.json` en este proyecto fija `small_model` a un modelo gratuito y deshabilita el share (evitar costos/privacidad).

## Stack

- **Frontend**: React 18 + Vite (`npm run dev` → http://localhost:5173)
- **Backend**: Firebase — Auth + Firestore (proyecto `glamours-control`)
- **Librerías clave**: react-hot-toast, lucide-react, xlsx (parseo Excel), recharts
- **Entorno dev**: emuladores locales de Firebase (Auth :9099, Firestore :8080, UI :4000)

## Comandos y arranque del entorno

| Tarea | Cómo |
|---|---|
| Levantar TODO (emulador + app) | Doble clic a `iniciar-desarrollo.cmd` (raíz del proyecto) |
| Solo app | `npm run dev` |
| Solo emulador | `firebase emulators:start` **con Java en el PATH** (ver abajo) |

⚠️ **CRÍTICO — Java**: el emulador de Firestore requiere Java. Está instalado **Java portable JRE 21** en:
`C:\Users\EfectivoSi\jre21\jdk-21.0.12.1+1-jre`
Sin él, el emulador no arranca y las cargas se cuelgan en "Detectando duplicados". Para arrancarlo manual:

```cmd
set JAVA_HOME=C:\Users\EfectivoSi\jre21\jdk-21.0.12.1+1-jre
set PATH=%JAVA_HOME%\bin;%PATH%
firebase emulators:start
```

**Credencial de prueba** (usuario creado en el Auth del emulador):
`admin@glamours.com` / `glamours123`

`.env.development` tiene `VITE_USE_EMULATOR=true` → la app conecta automáticamente a los emuladores. La base del emulador es efímera; los datos históricos reales viven en **producción** de Firestore.

## Arquitectura — archivos importantes

```
src/
├── config/firebase.js          Init SDK + conexión a emuladores. Exporta firebaseConfig/auth/db/storage
├── services/
│   ├── firestoreDB.js          SERVICIO CENTRAL de datos (clase FirestoreDB). Ver "Fórmula de Saldos"
│   ├── cargaService.js         Job singleton de carga de Excel FUERA de React: sobrevive cambios de sección,
│   │                           progreso en vivo + toast global al terminar
│   └── calendarioDB.js         Datos del calendario
├── utils/
│   ├── excelParser.js          processData() + separarDuplicadosInternos(). normalizeColumn tolera
│   │                           acentos/espacios/mayúsculas (COLUMNAS_MAP). Dedup interno: omite una fila
│   │                           solo si TODOS los campos coinciden con otra del mismo archivo
│   ├── dateUtils.js            today(), defaultDateFrom/To, formatDateTime
│   ├── formatCurrency.js       Formato moneda AR
│   └── exportUtils.js          exportToCSV / exportToExcel / exportToPDF
├── hooks/useSortableData.js    Ordenamiento de tablas (usar SIEMPRE este + SortIcon)
├── components/
│   ├── DateFilter.jsx          Filtro de fechas estándar
│   └── ResultadoCarga.jsx      Inspector post-carga: chips Cargados/Dup. del archivo/Ya en la base.
│                               Permite "cargar igualmente" dups internos y eliminar dups de la base
└── pages/                      Dashboard, Ventas, Caja, CierresCaja, Reportes, Auditoria, Configuracion, CargaExcel, Login
```

## Fórmula de Saldos (SAGRADA — no modificar sin incrementar SALDO_VERSION)

`firestoreDB.js` exporta `SALDO_VERSION = 7`. Los saldos van **por categoría separada** (Blanco/Negro).

Regla por código de movimiento:
- **500 "En caja"** → ANCLA: fija el saldo = monto (conteo físico declarado). No suma ni resta.
- **501 "Egreso en Caja"** → resta
- **502 "Ingreso en Caja"** → suma
- **503 "Retiro de Caja"** → **INFORMATIVO**: no afecta el saldo. La salida de dinero ya está reflejada en el 501 (Egreso). El 503 solo documenta que hubo un retiro físico.

**Fórmula: Saldo = 500 + 502 - 501** (el 503 NO participa)

Ejemplo verificado con datos del usuario (día 20/08):
  500=10592, 502=482300, 501=480600, 503=480600 → Saldo = 10592 + 482300 - 480600 = **12292** (503 NO resta)

## Modelo de datos (Firestore)

- **caja**: `{fecha 'YYYY-MM-DD', tipo, codigo 500|501|502|503, categoria 'Blanco'|'Negro', codigo, descripcion, monto, saldo_anterior, saldo_nuevo, origen 'excel'|'manual', creado}`
- **ventas**: `{fecha, tipo, categoria, medio_pago, banco, cuotas, monto, descripcion, origen, usuario, creado}`
- **cierres**: arqueos diarios con teórico/real/diferencia por categoría + observaciones (se generan desde Caja → "Cerrar Caja")
- **auditoria**: `{usuario, accion, modulo, detalle, fecha}` — registrar acá toda acción sensible (addAuditLog)
- **users**: `{uid, email, nombre, rol 'admin'|'operador', creado}`
- **configuracion**, **conciliaciones**

Servicios disponibles en firestoreDB: CRUD completo de caja/ventas (con recálculo de saldos en deletes/updates), `addBulk*` en batches con onProgress, `processExcelFile()` (pipeline completo de carga), `getCierres/addCierre`, `exportAllData/importData` (backup/restauración JSON preservando ids), `deleteAllCollections`, `getCollectionCounts`, `getUsers/addUser`, `recalcularSaldosCompletos`.

Resiliencia: `conTimeout()` (15s) envuelve lecturas críticas para fallar con mensaje accionable si el emulador está caído en vez de colgarse para siempre.

## Convenciones de UI (design system actual)

Tema oscuro con acentos dorados `#d4af37`. Todas las secciones comparten esta estructura:

1. **Encabezado de página**: cuadrado dorado 42px con ícono lucide negro + título 1.35rem/800 + subtítulo gris
2. **Card hero**: gradiente ámbar `linear-gradient(135deg, #854d0e 0%, #a16207 40%, #ca8a04 100%)`, cifra principal 3.5rem/900, decorativo `$` gigante opacity 0.04
3. **Cards secundarias**: gradientes por semántica — slate (neutro), verde `#022c22→#064e3b` (positivo), rojo `#450a0a→#7f1d1d` (negativo), violeta `#1e1b4b→#312e81` (informativo)
4. **Barra de acciones/filtros**: fondo `rgba(255,255,255,0.03)`, borde `rgba(255,255,255,0.08)`, radius 14px, label "FILTROS" uppercase + divisores verticales + botones export Excel/PDF a la derecha
5. **Tablas**: contenedor redondeado `rgba(255,255,255,0.02)` + borde sutil, headers uppercase 0.7rem grises ordenables, columnas de montos con clase `.amount`, estados con badges, empty-state centrado gris

Blanco = declarado (amarillo #facc15), Negro = no declarado (gris).

## Contexto de negocio importante

- Negocio real con caja doble: efectivo declarado (Blanco) y no declarado (Negro). Tratar el tema con discreción; es su herramienta interna.
- **Calidad de datos histórica**: en años pasados ~40% de los días no cuadran ventas-en-efectivo vs movimientos de caja (egresos pagados de otra fuente, ventas no registradas que igual alimentan la caja). Es un problema de los DATOS, no de la app. La fórmula está verificada contra datos recientes reales.
- Las cargas de Excel son el flujo principal: archivos concatenados multi-año (~7000 filas). El pipeline omite automáticamente duplicados internos exactos y muestra los ya-existentes-en-base en ResultadoCarga para decidir.

## Últimos cambios (agosto 2026)

1. **CierresCaja**: restyling completo al design system + exportación Excel/PDF
2. **Auditoria**: restyling + cards resumen (registros/módulos/usuarios) + filtros nuevos + exportación
3. **Configuración**: se ELIMINARON Impuestos (IVA) y Límites de Caja (decisión del usuario). Se agregó:
   - Alta real de usuarios (Auth + perfil vía app Firebase secundaria, sin cerrar la sesión admin)
   - Copias de Seguridad: descargar + **restaurar** backup JSON (importData)
   - Info del Sistema: entorno, SALDO_VERSION, conteos por colección
4. firestoreDB: nuevos métodos `importData()` y `getCollectionCounts()`; `config/firebase.js` ahora exporta `firebaseConfig`
5. Infra: Java portable instalado para el emulador; scripts `iniciar-desarrollo.cmd` y `abrir-opencode.cmd`; usuario de prueba creado en Auth del emulador
6. Carga completa verificada en emulador: TEST CONCATENAR_ultimo.xlsx → 3949 movs caja + 2768 ventas (2022-02-01 → 2026-08-15)
7. **Dashboard rediseñado**: calendario convertido en burbuja flotante fija arriba a la derecha (`cal-float`, colapsada por defecto con badge x/y, click abre/cierra), mensaje "Operativo" eliminado del topbar, fecha+hora en una sola línea, y fila superior nueva de 2 heroes lado a lado (Total Ventas | Saldo al Abrir Caja); secciones compactadas (gap 1.5rem) — "Ventas por Medio de Pago" y "Caja" con su desglose desplegable
8. **Menú lateral con efectos** (elección del usuario entre 4 prototipos A/B/C/D, quedó D en turquesa): clase `.nav-fx` en App.css — tarjetas 3D que se inclinan al hover (`perspective` + `rotateY`), destello de luz que cruza el ítem, marco de luz cian animado girando alrededor del ítem activo (conic-gradient + @property --ang), íconos con glow. Colores centralizados en variables `--nv/--nv-strong/--nv-light` sobre `.nav-fx` (fácil recolorear)
9. **Caja y Ventas adecuadas al estilo Dashboard** (gap 1.5rem, headers 1.25rem): Caja ahora tiene fila de 2 heroes (Saldo Total | Ingresos de Hoy con retiros como subline) + cards Saldo Blanco/Negro; Ventas ahora clasifica los **5 tipos igual que el Dashboard** (`classificarVenta` copiada): faltaban las cards **Débito** y **Transferencia QR** — agregadas con sus gradientes, chips de filtro nuevos, badges por tipo en tabla, desglose por banco dentro de cada card y chips B/N/TC/D/QR por día
10. **Carga Masiva reordenada como flujo**: Paso 1 (tipo de carga Caja/Ventas/Combinado con check en el activo) → Paso 2 (dropzone compacta de una línea con botón "Elegir archivos") → cola + progreso → Resultados → "Referencia y Ayuda" al final (formatos soportados + reglas de duplicados + tablas de codificación). El panel informativo ya no estorba arriba
11. **Clasificación de ventas UNIFICADA + Reportes adecuado**: se creó `src/utils/ventaTypes.js` — ÚNICA fuente de verdad para los 5 tipos (`classificarVenta`, VENTA_TYPES, VENTA_TYPE_CFG, VENTA_BADGES, VENTA_CHART_COLORS, totalesPorTipo). Dashboard, Ventas y Reportes importan de acá; NO volver a copiar la función localmente. Reportes ahora: gap 1.5rem / headers 1.25rem, sección "Resultados del Periodo" con un solo encabezado (antes había doble header redundante), hero ámbar grande, KPIs de los 5 tipos con % y gradientes, línea diaria + doughnut con 5 categorías, ranking ampliado a TODOS los pagos electrónicos por banco (antes solo Tarjeta), barras apiladas mensuales/anuales con 5 series y mini-cards B/N/TC/D/QR. **Gráficos modernizados** (pedido del usuario): cards de gráfico con profundidad (fondo en gradiente, borde con highlight superior, box-shadow ambiente + glow dorado radial decorativo, componente local `ChartCard`), sombra proyectada sobre los trazos via CSS `filter: drop-shadow` en el wrapper del canvas, rellenos con gradiente vertical (`fillDown`/`barGrad` scriptables), barras redondeadas 7px, doughnut con segmentos separados (spacing/borderRadius/hoverOffset) y **total del periodo dibujado en el centro** (plugin custom `centerTotalPlugin`, formato compacto `formatCompact`: $1,2M / $450K), tooltips oscuros con borde dorado y montos formateados, ejes Y compactos

## Pendientes conocidos

- Resolver los ~36 días históricos que tienen DOS anclas 500 el mismo día
- El dedup vs base usa comparación por TODOS los campos (regla del usuario: "para no cargar tiene que coincidir todos los campos") — no cambiar esta regla sin consultar
- Al pasar a producción recordar: reglas de Firestore actuales solo exigen `request.auth != null` (sin roles). Evaluar endurecer por rol
- **Verificador de caja**: script `verificar-caja.mjs` en la raíz de glamours-app replica la fórmula v6 y audita integridad/estado/anclas dobles/conciliación contra el EMULADOR. Correr con `node verificar-caja.mjs` (emulador activo). Última corrida: 3949/3949 saldos íntegros, estado OK, 36 anclas dobles (dato histórico)

## Producción (agosto 2026)

1. **Config**: `.env` base = proyecto real `glamours-control` (sin VITE_USE_EMULATOR); `.env.development` agrega emulador. `npm run build` verificado; servidor producción: `npx vite --mode production --port 5174` (log `vite-prod.log`; Vite 8 bindea IPv6 — probar con `localhost`, NO 127.0.0.1)
2. **Seguridad**: `firestore.rules` endurecido y **DESPLEGADO a producción** (agosto 2026) — leer/escribir exige login; **BORRAR solo admin** (rol leído de `users/{uid}`); crear el PROPIO perfil `users/{uid}` permitido para auto-migración. CLI autenticado como ssaavedra1969@gmail.com (la cuenta webfireone@gmail.com NO tiene permisos sobre el proyecto). Nota: esta versión del CLI no soporta `--add`; usar `firebase login --reauth --no-localhost`
3. **Usuarios con ID=uid**: `addUser()` ahora usa setDoc(users/{uid}); `ensurePerfilUid(perfil)` (llamado desde AuthContext en cada login) crea el perfil con ID=uid migrando el formato viejo — así las reglas encuentran el rol sin migración manual
4. **Smoke test prod**: Firestore producción responde 403 a anónimos (reglas activas, base no expuesta)
5. **Validado EN PRODUCCIÓN por el usuario**: primer login de ssaavedra1969@gmail.com (admin, auto-migrado por ensurePerfilUid) → alta de usuario operador desde Configuración funcionó (fix aplicado: addUser ANTES de fbSignOut de la app secundaria, porque las reglas solo permiten crear users/{uid} del propio autenticado) → login del operador OK. Pendiente probar: intento de borrado como operador debe ser rechazado
6. Nota: borrar el perfil en Gestión de Usuarios NO elimina la cuenta de Authentication (esa requiere consola de Firebase); sin perfil uid-keyed el usuario pierde permisos de borrado/admin
