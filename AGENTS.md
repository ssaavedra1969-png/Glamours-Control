# GLAMOURS — Guía del Proyecto (AGENTS.md)

Sistema de gestión comercial: **libro de caja doble (Blanco/Negro)**, ventas, cierres de caja, conciliaciones y auditoría. Interfaz 100% en español.

> **Kit del usuario**: en `C:\Opencode` hay accesos directos y guía (`LEEME.txt`) para abrir opencode local y la app en modo desarrollo/producción. `opencode.json` en este proyecto fija `small_model` a un modelo gratuito y deshabilita el share (evitar costos/privacidad).

## Stack

- **Frontend**: React 19 + Vite (`npm run dev` → http://localhost:5173)
- **Backend**: Firebase — Auth + Firestore (proyecto `glamours-control`)
- **Librerías clave**: react-hot-toast, lucide-react, xlsx (parseo Excel), recharts, **jsbarcode** (códigos de barras CODE128 para etiquetas)
- **Entorno dev**: emuladores locales de Firebase (Auth :9099, Firestore :8080, UI :4000)
- **Deploy producción**: **Vercel** (git push a `main` → deploy automático, ~2 min). Ver sección Producción

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
│   ├── firestoreDB.js          SERVICIO CENTRAL de datos (clase FirestoreDB, export DEFAULT). Ver "Fórmula de Saldos"
│   ├── codigosDB.js            Sección Códigos de Barras: catalogs marcas/prendas/colores/talles + contador
│   │                           transaccional de prendas. AISLADO de firestoreDB (no tocar el central)
│   ├── cargaService.js         Job singleton de carga de Excel FUERA de React: sobrevive cambios de sección,
│   │                           progreso en vivo + toast global al terminar
│   └── calendarioDB.js         Datos del calendario
├── utils/
│   ├── excelParser.js          processData() + separarDuplicadosInternos(). normalizeColumn tolera
│   │                           acentos/espacios/mayúsculas (COLUMNAS_MAP). Dedup interno: omite una fila
│   │                           solo si TODOS los campos coinciden con otra del mismo archivo
│   ├── ventaTypes.js           ÚNICA fuente de verdad de la clasificación de ventas (5 tipos)
│   ├── luxcarParser.js         Parser Excel Regalos Empresariales + descargarBackupLuxcar (3 hojas)
│   ├── dateUtils.js            today(), defaultDateFrom/To, formatDateTime
│   ├── formatCurrency.js       Formato moneda AR
│   └── exportUtils.js          exportToCSV / exportToExcel / exportToPDF
├── hooks/useSortableData.js    Ordenamiento de tablas (usar SIEMPRE este + SortIcon)
├── components/
│   ├── DateFilter.jsx          Filtro de fechas estándar
│   └── ResultadoCarga.jsx      Inspector post-carga: chips Cargados/Dup. del archivo/Ya en la base.
│                               Permite "cargar igualmente" dups internos y eliminar dups de la base
└── pages/                      Dashboard, Ventas, Caja, CierresCaja, Reportes, Auditoria, Configuracion,
                                CargaExcel, Login, Luxcar (Regalos Empresariales),
                                CodigosBarras (+ CodigosBarras.css propio)
```

> Docs complementarios en raíz: `DESARROLLO.md` (levantar entorno en otra PC, datos Luxcar), `AGENTS.md` (este archivo).

## Fórmula de Saldos (SAGRADA — no modificar sin incrementar SALDO_VERSION)

`firestoreDB.js` exporta `SALDO_VERSION = 8`. Los saldos van **por categoría separada** (Blanco/Negro).

Regla por código de movimiento:
- **500 "En caja"** → ANCLA: fija el saldo = monto (conteo físico declarado). **RESETEA AMBAS categorías** (Blanco y Negro) a 0 antes de fijar. Esto es porque el conteo físico es del TOTAL de la caja, no de una categoría.
- **501 "Egreso en Caja"** → resta
- **502 "Ingreso en Caja"** → suma (categoría según Valor del Excel: 0=Blanco, 2=Negro)
- **503 "Retiro de Caja"** → **INFORMATIVO**: no afecta el saldo. La salida de dinero ya está reflejada en el 501 (Egreso). El 503 solo documenta que hubo un retiro físico.

**Fórmula: Saldo = 500 + 502 - 501** (el 503 NO participa)

Ejemplo verificado con datos del usuario (día 20/08):
  500=10592, 502=482300, 501=480600, 503=480600 → Saldo = 10592 + 482300 - 480600 = **12292** (503 NO resta)

### Puntos de implementación de la fórmula (DÓNDE ESTÁ EL CÓDIGO)

| Ubicación | Función | resetBoth | Contexto |
|-----------|---------|-----------|----------|
| `firestoreDB.js:105` | `aplicarMovimiento()` | parámetro | Función base. **Parámetro `resetBoth`**: cuando `true`, resetea ambas categorías en500. Cuando `false`, solo resetea la categoría del movimiento. |
| `firestoreDB.js:139` | `computeSaldos()` | `true` | Calcula saldos finales de un set completo de documentos. Siempre resetea ambas. |
| `firestoreDB.js:197` | `addCajaMovimiento()` | `false` (default) | Agrega un movimiento manual. Crea temp object de una categoría; después llama `_recalculateFromScratch(categoria)`. |
| `firestoreDB.js:225` | `addBulkCajaMovimientos()` | `true` | Carga batch de Excel. Puede incluir 500s, debe resetear ambas. |
| `firestoreDB.js:302` | `_recalculateFromScratch()` | `!onlyCategoria` | **CLAVE**: si `onlyCategoria` está seteado, NO resetea la otra categoría. Si no, resetea ambas. |
| `firestoreDB.js:389` | `addBulkVentas()` (carga 1) | `false` (default) | Solo genera 502, nunca 500. El flag no importa. |
| `firestoreDB.js:867` | `addBulkVentas()` (carga 2) | `false` (default) | Idem: solo 502. |

**UI — fórmulas de saldos en cada página** (estas calculan `saldo_nuevo` en tiempo real para el hero card):

| Archivo | Línea | Variable |
|---------|-------|----------|
| `Dashboard.jsx` | 73 | `saldos` en `useMemo` |
| `Caja.jsx` | 66 | `saldos` en `useMemo` (stats) |
| `Caja.jsx` | 101 | `runningBalanceByDate` en `useMemo` |
| `CierresCaja.jsx` | 53 | `saldosCalc` en `useMemo` |

Todas usan: `if (m.codigo === 500) { s.Blanco = m.monto; s.Negro = 0; }` — **resetear AMBAS**.

### Contexto de negocio (importante)

- **500 = conteo físico TOTAL** de la caja (efectivo declarado + no declarado). NO es por categoría.
- **501 = egreso** del TOTAL de la caja (retiro/suma de plata).
- **502 = ingreso** por ventas, categorizado por Valor (0=Blanco/declarado, 2=Negro/no declarado).
- **503 = solo documenta** que hubo un retiro físico. NO afecta saldos.
- Blanco y Negro son la misma plata (efectivo). La diferencia es si está declarada o no.

### ⚠️ BUG HISTÓRICO: el 500 solo reseteaba UNA categoría (agosto 2026)

**Problema**: antes del fix, `aplicarMovimiento` hacía `s[cat] = monto` para el 500. Si el 500 era Blanco, solo reseteaba Blanco. Negro acumulaba desde 2022 (~$21.7M) sin nunca ser reseteado por un500.

**Causa raíz**: la fórmula estaba mal diseñada. El500 es un conteo FÍSICO del total, pero el código original lo trataba como un reset de UNA categoría.

**Fix**: `aplicarMovimiento()` ahora tiene un parámetro `resetBoth`. Los callers que procesan datos completos pasan `true`. El caso `_recalculateFromScratch(onlyCategoria)` pasa `false` para no romper la otra categoría.

**Archivos modificados**:
1. `firestoreDB.js:105-113` — `aplicarMovimiento()` con `resetBoth` param
2. `Dashboard.jsx:73` — `{ s.Blanco = m.monto; s.Negro = 0; }`
3. `Caja.jsx:66` — idem
4. `Caja.jsx:101` — idem
5. `CierresCaja.jsx:53` — idem

**Commits**: `ba504bf` (stored saldos), `043dac0` (UI formulas)

**After deploy**: usuario debe clickear "Recalcular saldos" en Libro de Caja para reescribir todos los `saldo_nuevo` almacenados.

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

## Sección Regalos Empresariales (Luxcar)

Ruta `/luxcar`. Componente único `src/pages/Luxcar.jsx` + estilos `lx-*` en `App.css` + parser `src/utils/luxcarParser.js`. Colección `luxcar_personas`: docs `cumple` `{nombre,dia,mes,estado}` / `nino`,`navidad` `{nombre,fecha}` (fecha `dd/mm`). Commit `8127de4`.

- **Alta en cadena**: botón "Agregar persona" → modal "¿A dónde agregar?" con tildes múltiples → la misma persona se carga en secuencia (Cumpleaños → Día del Niño → Navidad) y **el backup Excel se descarga SOLO al final** de la cadena (si cancela a mitad, igual descarga lo guardado)
- **Fechas de referencia** (`FECHA_REF`): Día del Niño 15/08, Navidad 24/12 — prellenadas en alta/cadena y muestra `FechaRefHint` editable también al editar
- **Capitalización**: `capitalizar()` en altas, ediciones y nombres cargados en formularios
- **Popups**: centrados (overlay `overflow-y:auto`, `align-items:flex-start + padding-top 7vh`), click fuera NO cierra NINGÚN modal; backup previo obligatorio solo en editar/eliminar (popup de backup `zIndex 950`)
- Formularios nino/navidad unificados con formato cumpleaños (Día + Mes → `fechaDeDM`)
- Parser re-importa el propio backup idéntico: round-trip verificado con `test-roundtrip-luxcar.mjs` (3 hojas OK). OJO: la clave de datos es `cumple` (singular), NO `cumples`
- Entorno/datos: ver `DESARROLLO.md`; scripts `sembrar-luxcar-todos-meses.mjs`, `fix-nombres-luxcar.mjs`

## Sección Códigos de Barras (octubre 2026)

Ruta `/codigos` (menú **entre Regalos Empresariales y Cierres de Caja** — pedido explícito del usuario). Archivos: `src/pages/CodigosBarras.jsx` + `src/pages/CodigosBarras.css` (CSS propio, prefijo `cb-`) + `src/services/codigosDB.js`. **Sección aislada**: no toca ni depende del resto (solo hace `addAuditLog` de firestoreDB). Commit `814ee78`.

### Formato del código (10 dígitos)

`XX XXXX XX XX` = **2 marca + 4 prenda + 2 color + 2 talle** (orden confirmado por el usuario: Marca-Prenda-Color-Talle, NO el orden talle/color del pedido original).

Ej: `01 0001 03 04` → Nike / Remera manga corta / Rojo / Talle M (la función `fmtCodigo()` agrupa para mostrar; el barrado va sin espacios).

### Modelo de datos (colecciones nuevas, prefijo `codigos_`)

| Colección | Doc ID | Contenido |
|---|---|---|
| `codigos_marcas` | código 2d (`01`) | `{codigo, nombre, creado}` — código lo asigna el usuario |
| `codigos_prendas` | código 4d (`0001`) | `{codigo, nombre, creado}` — contador automático |
| `codigos_colores` | código 2d | `{codigo, nombre, creado}` |
| `codigos_talles` | código 2d | `{codigo, nombre, creado}` |
| `codigos_meta/prenda_counter` | — | `{next, actualizado}` — contador **monótono** |

- **Unicidad e irrepetibilidad garantizadas por el ID del doc** (crear un código duplicado falla solo; doble check en cliente + servidor)
- **Contador de prendas**: transaccional (`runTransaction`), arranca `0001`, **nunca retrocede** (borrar una prenda no libera su código — huecos permitidos). Si falta el counter (p. ej. recién restaurado), se inicializa en `max(id existente)+1` para no pisar datos
- ⚠️ **Gotcha del SDK**: `tx.get(query)` DENTRO de `runTransaction` revienta (`Cannot read properties of undefined (reading 'path')`) en firebase@12 — `tx.get(doc)` SÍ funciona. Por eso `nextPrendaCodigo()` resuelve el max de prendas **fuera** de la transacción y la transacción solo toca el doc counter

### UI

- **Generador** (card arriba): 4 selects (marca/prenda/color/talle) con botón "+" para alta rápida desde el propio select; hero ámbar con código agrupado grande, chips de datos, barcode SVG (jsbarcode CODE128) sobre caja blanca, campo cantidad (1-100), botones **Agregar al TXT** + **Imprimir**
- **Catálogos en pestañas** (abajo): **1 sola card** con pestañas Marcas/Prendas/Colores/Talles (elección del usuario, prototipo D), cada una con contador, buscador y alta/edición vía modal (código solo editable en marcas/colores/talles; prendas siempre automático), borrado con confirm. Swatch de color en colores (nombres conocidos) + leyenda del formato del código (`01+0001+01+01=01 0001 01 01`). Reglas de Firestore: DELETE solo admin (operador recibe error → toast)
- **Impresión**: **ventana popup dedicada** (`window.open` + HTML propio con `@page { size: 62mm 30mm; margin: 0 }`) → en el diálogo elegir Brother QL-800 / 62×30. ⚠️ **Requiere rollo continuo de 62 mm** (DK-2251 negro/rojo que viene en la caja, o DK-22205): el DK-1201 de 29×90 mm que trae la QL-800 **no sirve** (ancho 29 mm ≠ 62 mm) y da el error "el rollo no coincide con el seleccionado". NO usar `window.print()` sobre el DOM de la app: rompe con overlays/visibility hacks y pagina mal multi-etiqueta. El popup pagina bien (1 etiqueta por página) y no afecta impresiones de otras secciones. Si bloquea popups → toast "Permití las ventanas emergentes"
- **Etiqueta 62×30mm** (mismos estilos en CSS preview + template del popup, mantener sincronizados): marca ARRIBA centrada en una línea (letter-spacing ancho) → barcode al **MÁXIMO** (`flex:1`) → número del código → abajo centrado prenda (2 líneas clamp) y `color · Talle X`
- **Export TXT → formato definitivo del sistema de ventas** (commit a definir): card "TXT del sistema de ventas" debajo del generador que se va llenando en vivo con cada código **imprimido o agregado** (botón "Agregar al TXT"). Formato igual a `Muestras/Articulo_Descripcion_Marca.txt`: `Articulo<TAB>Descripcion<TAB>Marca`, **una fila por código** (marca+prenda+color+talle = 10 dígitos), sin encabezado, UTF-8 sin BOM, saltos LF. Lista **persistente en localStorage** (`gl_codigos_etiquetas`, sobrevive recargas; dedup por artículo). Botones: **Imprimir todo** (lote: 1 etiqueta por código en el panel, misma plantilla 62×30) · **Vaciar** · **Exportar TXT** (descarga `Articulo_Descripcion_Marca.txt`). Lo que se imprime individual también se suma solo a la lista.

### Cuota Firebase (plan Spark)

Al abrir la página: 4 lecturas (1 por colección). Alta: 1 getDoc + 1 setDoc. Edición: 1 updateDoc. Baja: 1 deleteDoc. Prenda nueva: 1-2 lecturas + 1 escritura (counter). Todo contabilizado con `trackOp` (misma contabilidad de Salud de Firebase).

### Datos sembrados — SOLO emulador

marcas `01 Nike, 02 Adidas, 03 Puma, 04 Los Gatos`; colores `01 Negro, 02 Blanco, 03 Rojo, 04 Azul`; talles `01-05 = XS,S,M,L,XL`; prendas `0001 Remera manga corta`. **En PRODUCCIÓN las tablas arrancan vacías** (el usuario crea sus datos desde la sección).

### Test

`node probar-codigos.mjs` (emulador activo) — E2E **idempotente** (tolerante a datos del usuario): unicidad por doc ID, validación de largo, contador secuencial, no-reutilización de códigos borrados. Última corrida: **10/10 OK**. Solo borra docs de prueba propios (nombre "Prenda de prueba") y el contador solo si no existía antes.


## Últimos cambios

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

12. **Carga en cualquier orden (fix saldos)**: `addBulkCajaMovimientos()` ahora termina con `_recalculateFromScratch()` completo y `addCajaMovimiento()` manual recalcula su categoría — el saldo ya NO depende del orden de carga de archivos/días (antes cada tanda encadenaba desde el `estado` dejado por la anterior y cargar en desorden trenzaba las cadenas). En cargas normales el recálculo no reescribe nada (solo docs cuyo saldo cambió). Scripts nuevos en raíz: `crear-admin-emulador.mjs` (recrea usuario test del emulador), `debug-saldo-v7.mjs` (auditoría fórmula v7), `fix-saldos-emulador.mjs` (recalcula saldos del emulador), `probar-flujo-caja.mjs` (E2E: carga desordenada → recalc → borrar días → restaurar). OJO: `verificar-caja.mjs` sigue replicando la fórmula v6 vieja (503 resta) — desactualizado
13. **Modales de Caja**: editar muestra SOLO Tipo/Monto/Descripción (categoría se conserva); click fuera NO cierra ningún modal; popups abren en la parte superior. Fix raíz del scroll: `pageEnter` terminaba con transform retenido que rompía el position:fixed del overlay — ahora termina en `transform:none`; overlay con `align-items:flex-start + padding-top 7vh` (global para todos los modales)
14. **Eliminar día completo** en Libro de Caja y Libro de Ventas: tacho rojo en la cabecera de cada día (solo visible admin — las reglas solo permiten DELETE a admin), confirmación incluida, audita como "ELIMINACION DIA COMPLETO" con resumen por categoría; métodos nuevos `deleteCajaDia(fecha)` (recalcula todo al final) y `deleteVentasDia(fecha)`
15. Los montos diarios ("Ingresos de Hoy", desglose Dashboard, agrupación de libros) SIEMPRE usan la fecha real del movimiento (`fecha === hoy`), no la fecha de carga — verificado en código y con E2E
16. **Reportes**: el Ranking Medios Electrónicos se calcula sobre TODO el histórico (`allVentas`, independiente del filtro de fechas) y Tendencia Mensual tiene chips `6/12/24/36/Todos` (estado `mesesHist`)
17. **Salud de Firebase** (Configuración): `utils/firebaseUsage.js` cuenta lecturas/escrituras/eliminaciones del día en localStorage (cero consumo de cuota) vía wrappers `_getDocs/_setDoc/_writeBatch...` en firestoreDB; muestra barras vs límites Spark (50k lecturas / 20k escrituras / 20k eliminaciones) con semáforo SALUDABLE/ATENCION/CRITICO
18. **Default de fechas = mes en curso** en todas las secciones (`dateUtils.defaultDateFrom` = día 1 del mes actual); **Gestión de Usuarios permite cambiar rol** (selector admin/operador solo para admins, método `updateUserRol`, efecto tras re-login, no permite cambiar la propia cuenta)
19. **Caché anti-relectura** (ahorro de cuota Firestore): `getAllRaw()` cachea lecturas completas de `caja`/`ventas` en sessionStorage (TTL 10 min, claves `gl_all_caja`/`gl_all_ventas`) y los wrappers de escritura (`_addDoc/_setDoc/_updateDoc/_deleteDoc`/batch commit) invalidan el caché — navegar entre secciones ya no relee miles de docs; cada escritura fuerza relectura fresca. La card Salud de Firebase aclara entorno: en emulador avisa que NO consume cuota real de Google. OJO: `probar-flujo-caja.mjs` ahora captura el total inicial de docs dinámicamente (antes esperaba 28 hardcodeado)
20. **500 resetea ambas categorías (fix saldo Negro)**: el500 es conteo FÍSICO del total de caja, no de una categoría. Antes solo reseteaba Blanco, Negro acumulaba sin tope desde 2022 (~$21.7M). Fix: `aplicarMovimiento()` tiene param `resetBoth` (true=ambas, false=solo la del movimiento). UI formulas (Dashboard/Caja/CierresCaja) también resetean ambas. Commits: `043dac0` (UI), `ba504bf` (DB). **After deploy: usuario debe clickear "Recalcular saldos"**
21. **Luxcar pulido** (commit `8127de4`): alta en cadena multi-tipo con backup Excel al FINAL, popups centrados sin cierre por clic exterior (los 5 modales), formatos de Día del Niño/Navidad unificados con fecha de referencia (15/08, 24/12) editable, capitalización de nombres, botón toolbar "Agregar" arreglado (pasaba `tab` en vez de `'choose'` y no abría nada). Ver sección Luxcar
22. **Sección Códigos de Barras nueva** (commit `814ee78`): generador de códigos 10 dígitos + 4 catalogs únicos en Firestore + contador transaccional de prendas + etiquetas Brother QL-800 vía popup + export TXT provisorio + `jsbarcode` como dependencia nueva. Ver sección completa arriba
23. **TXT definitivo del sistema de ventas en Códigos de Barras** (commit `60834a2`): export ahora sólo con lo impreso/agregado — card "TXT del sistema de ventas" en vivo, formato `Articulo<TAB>Descripcion<TAB>Marca` (10 dígitos, sin encabezado, UTF-8 sin BOM, LF), lista persistente en localStorage, botones Agregar al TXT / Imprimir / Imprimir todo (lote 1 etiqueta por código) / Vaciar / Exportar TXT. Sin cambios en la lógica de caja/ventas
24. **Catálogos en pestañas en Códigos de Barras** (commit a definir, Opción D elegida por el usuario): 1 sola card con pestañas Marcas/Prendas/Colores/Talles (antes 4 cards en grilla), swatch visual en Colores y leyenda del formato. Sin cambios en la lógica de caja/ventas

## Pendientes conocidos

- Resolver los ~36 días históricos que tienen DOS anclas 500 el mismo día
- El dedup vs base usa comparación por TODOS los campos (regla del usuario: "para no cargar tiene que coincidir todos los campos") — no cambiar esta regla sin consultar
- Al pasar a producción recordar: reglas de Firestore actuales solo exigen `request.auth != null` (sin roles). Evaluar endurecer por rol
- **Verificador de caja**: script `verificar-caja.mjs` en la raíz de glamours-app replica la fórmula v6 y audita integridad/estado/anclas dobles/conciliación contra el EMULADOR. Correr con `node verificar-caja.mjs` (emulador activo). Última corrida: 3949/3949 saldos íntegros, estado OK, 36 anclas dobles (dato histórico)
- **Códigos de Barras — impresión física**: falta validar con la Brother QL-800 real (medidas 62×30, que el popup no esté bloqueado y el tamaño del barrado lea bien)
- **Códigos de Barras — producción**: tablas vacías en prod (los datos sembrados son solo del emulador); el usuario debe cargar sus marcas/prendas/colores/talles

## Diagnóstico rápido de saldos (SI SE ROMPEN LOS SALDOS)

**Síntomas**: Dashboard o Caja muestra saldo incorrecto, o la columna "Saldo" del Libro de Caja no cuadra.

### Dónde atacar (en orden)

1. **Verificar fórmula en UI** — buscar `codigo === 500` en:
   - `Dashboard.jsx` (useMemo de saldos, ~L73)
   - `Caja.jsx` (stats ~L66 + runningBalanceByDate ~L101)
   - `CierresCaja.jsx` (~L53)
   - Todas deben hacer: `s.Blanco = m.monto; s.Negro = 0;` — **NUNCA** `s[cat] = m.monto` (eso solo resetea UNA categoría)

2. **Verificar `aplicarMovimiento()`** en `firestoreDB.js:105`:
   - Si el500 no resetea ambas categorías → Negro acumula sin tope
   - El parámetro `resetBoth` debe ser `true` en callers que procesan datos completos

3. **Verificar callers de `aplicarMovimiento()`**:
   - `computeSaldos()` → resetBoth=true
   - `addBulkCajaMovimientos()` → resetBoth=true
   - `_recalculateFromScratch()` → resetBoth=!onlyCategoria
   - `addCajaMovimiento()` → resetBoth=false (safe, crea temp object)
   - `addBulkVentas()` → resetBoth=false (solo pasa código 502)

4. **Verificar `_recalculateFromScratch()`**:
   - Si `onlyCategoria` se pasa, NO debe resetear la otra categoría (el fix actual usa `resetBoth = !onlyCategoria`)
   - Si NO se pasa, resetea ambas

5. **Recalcular después de cualquier fix de fórmula**:
   - Botón "Recalcular saldos" en Libro de Caja
   - O bien: `_recalculateFromScratch()` completo desde Configuración → "Reiniciar Solo Libro de Caja"

### Scripts de diagnóstico (en raíz del proyecto)

- `debug-saldo-v7.mjs` — audita fórmula v7 contra emulador
- `fix-saldos-emulador.mjs` — recalcula saldos del emulador
- `probar-flujo-caja.mjs` — E2E: carga desordenada → recalc → borrar → restaurar
- `verificar-caja.mjs` — **DEPRECATED**: replica fórmula v6 (503 resta), NO usar

## Producción (agosto 2026)

1. **Config**: `.env` base = proyecto real `glamours-control` (sin VITE_USE_EMULATOR); `.env.development` agrega emulador. `npm run build` verificado; servidor producción: `npx vite --mode production --port 5174` (log `vite-prod.log`; Vite 8 bindea IPv6 — probar con `localhost`, NO 127.0.0.1)
2. **Seguridad**: `firestore.rules` endurecido y **DESPLEGADO a producción** (agosto 2026) — leer/escribir exige login; **BORRAR solo admin** (rol leído de `users/{uid}`); crear el PROPIO perfil `users/{uid}` permitido para auto-migración. CLI autenticado como ssaavedra1969@gmail.com (la cuenta webfireone@gmail.com NO tiene permisos sobre el proyecto). Nota: esta versión del CLI no soporta `--add`; usar `firebase login --reauth --no-localhost`
3. **Usuarios con ID=uid**: `addUser()` ahora usa setDoc(users/{uid}); `ensurePerfilUid(perfil)` (llamado desde AuthContext en cada login) crea el perfil con ID=uid migrando el formato viejo — así las reglas encuentran el rol sin migración manual
4. **Smoke test prod**: Firestore producción responde 403 a anónimos (reglas activas, base no expuesta)
5. **Validado EN PRODUCCIÓN por el usuario**: primer login de ssaavedra1969@gmail.com (admin, auto-migrado por ensurePerfilUid) → alta de usuario operador desde Configuración funcionó (fix aplicado: addUser ANTES de fbSignOut de la app secundaria, porque las reglas solo permiten crear users/{uid} del propio autenticado) → login del operador OK. Pendiente probar: intento de borrado como operador debe ser rechazado
6. Nota: borrar el perfil en Gestión de Usuarios NO elimina la cuenta de Authentication (esa requiere consola de Firebase); sin perfil uid-keyed el usuario pierde permisos de borrado/admin

### Vercel — deploy real (octubre 2026)

- **Repo**: `github.com/ssaavedra1969-png/Glamours-Control` (branch `main`); vinculado a Vercel vía `.vercel/repo.json` (proyecto `glamours-control`, CLI auth `ssaavedra1969-3480`)
- **Flujo**: `git push origin main` → Vercel buildea y despliega SOLO (~2 min). **NO hay paso manual extra**. Los cambios locales NO llegan a Vercel hasta commitear y pushear
- **Dominios**: `glamours-control.vercel.app` (producción, con alias) · `glamours-control-git-main-sandro1969.vercel.app` (preview)
- **Verificar deploy**: `npx vercel inspect https://glamours-control.vercel.app` → muestra estado (`Ready`), id `dpl_...` y fecha. También se puede comprobar que el bundle nuevo tiene los cambios: bajar `/assets/index-<hash>.js` de la home y buscar un string propio de la feature
- **Deploy de Luxcar mejorado**: commit `8127de4` · **Deploy de Códigos de Barras**: commit `814ee78`
- Tras cada deploy: **Ctrl+F5** (los assets llevan hash y quedan cacheados). En local, `npx vite --mode production --port 5174` sigue sirviendo para smoke test sin tocar Vercel
- Deploy fallido → revisar dashboard de Vercel (Deployments); el push a `main` con build rojo NO rompe el deploy anterior bueno
