# DESARROLLO — Guía para levantar el proyecto en cualquier PC

Proyecto: **Glamours Control** — Sistema de gestión contable (React 19 + Vite + Firebase).

- Producción: https://glamours-control.vercel.app
- GitHub: https://github.com/ssaavedra1969-png/Glamours-Control
- Backend: Firebase (project `glamours-control`) — Auth + Firestore.
- En desarrollo se usan los **emuladores locales** de Firebase; la base real de producción **no se toca**.

---

## 1. Requisitos

| Herramienta | Dónde | Nota |
|---|---|---|
| Node.js 20+ | https://nodejs.org | para Vite / scripts |
| Java 21 (JRE) | https://adoptium.net | necesario para el emulador de Firestore |
| Firebase CLI | `npm i -g firebase-tools` | |
| Git | https://git-scm.com | opcional, para clonar |

> **Java sin instalar:** se usa un JRE portable. Descargalo una vez:
> `https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse`
> (zip ~49 MB). Descomprimí dentro de la carpeta del repo como `.tools\` y el
> script `iniciar-desarrollo.cmd` lo toma solo.

## 2. Puesta en marcha en una PC nueva

```powershell
git clone https://github.com/ssaavedra1969-png/Glamours-Control.git
cd Glamours-Control
npm install
```

Configurá el entorno local (NO subir el `.env` real):

```powershell
copy .env.example .env
```

`VITE_USE_EMULATOR=true` hace que el front use Auth/Firestore **locales**.
La `VITE_FIREBASE_API_KEY` del ejemplo es ficticia, a propósito.

### Opción A — automática (Windows)

```powershell
iniciar-desarrollo.cmd
```

Levanta emuladores + app en dos ventanas.

### Opción B — manual

```powershell
# 1) Emuladores (Auth en :9099, Firestore en :8080, UI en :4000)
#    Asegurate de tener JAVA_HOME apuntando a un JDK/JRE 21.
firebase emulators:start --project glamours-control

# 2) En otra terminal: crear el usuario admin del emulador
node crear-admin-emulador.mjs

# 3) App de desarrollo
npm run dev
```

### URLs y acceso

| Qué | URL |
|---|---|
| App (Vite, dev) | http://localhost:5173 |
| Emulador UI | http://localhost:4000 |
| Emulador Auth | http://localhost:9099 |
| Emulador Firestore | http://localhost:8080 |

Usuario de prueba del emulador:

```
email:    admin@glamours.com
clave:    glamours123
```

> El emulador se crea "vacio": no tiene los datos de producción. Para probar con
> datos, cargá un Excel de Luxcar o sembrá manualmente con scripts.

## 3. Despliegue a producción

Vercel está conectado al repo GitHub (`main`):

```powershell
git add -A
git commit -m "..."   # usa usuario con permisos: gh auth login → cuenta dueña
git push origin main
```

Al hacer push, Vercel recompila y publica automáticamente.

---

# SECCIÓN LUXCAR (cumpleaños / día del niño / navidad)

## Cómo funciona

- Ruta: `/luxcar` → `src/pages/Luxcar.jsx`
- Parser de Excel: `src/utils/luxcarParser.js`
- Datos: Firestore, colección `luxcar_personas` con 3 documentos:
  - `cumple` → `[{ nombre, dia, mes, estado }]` (estado: 1 = Activo, 2 = A confirmar)
  - `nino` → `[{ nombre, fecha }]`
  - `navidad` → `[{ nombre, fecha }]`
- Acceso a datos: `firestoreDB.getLuxcarAll()` y `firestoreDB.guardarLuxcarPersonas()`
  - `guardarLuxcarPersonas` hace `setDoc` → **REEMPLAZA el array completo**.

## Cómo cargar el Excel (2 pasos)

1. Prepará un archivo `.xlsx` con **3 hojas** (los nombres deben contener esas palabras):

   | Hoja | Columnas |
   |---|---|
   | `CUMPLES` | `Cumpleaños` · `Fecha Cumple` (dd/mm) · `Estado` |
   | `DIA DEL ÑINO` | `Nombre` · `Fecha` |
   | `NAVIDAD` | `Nombre` · `Fecha` |

   Reglas del parser:
   - **Cumpleaños/Nombre:** obligatorio. Fila sin nombre → se ignora.
   - **Fecha Cumple:** texto `dd/mm` (o `dd/mm/aaaa`, `aaaa-mm-dd`, o celda de fecha).
     ⚠️ En Excel, la columna debe estar en formato **TEXTO** (Formato de celda → Texto):
     si se guarda como fecha real, puede correr un día al cargar.
   - **Estado:** `1` o `Activo` = activo. `2` o cualquier otro texto = a confirmar.
     Vacío = activo.
   - **Columnas extra** (teléfono, dirección, etc.) **no se guardan**.
   - Si una hoja está vacía, esa lista se guarda **vacía** (borra lo anterior).

2. En la app → sección **Luxcar** → botón **"Elegir archivo"** → seleccionar el Excel.

   ⚠️ **La carga REEMPLAZA todo lo anterior.** El archivo debe contener TODAS las
   personas que quieras conservar + las nuevas. Cada carga queda registrada en auditoría.

## Exportar los datos actuales de Luxcar (producción)

No hay botón de exportación; para bajar la data real (desde una PC con la sesión
iniciada en https://glamours-control.vercel.app):

1. Abrí DevTools (`F12`) → pestaña **Console** → escribí `allow pasting` + Enter.
2. Pegá el siguiente script y Enter. Descarga `luxcar_export.json`.

```js
const API_KEY = 'AIzaSyC5I36IGeWB9FIlvU9c-COmKdZu0xrBhyk';
(async () => {
  const openReq = indexedDB.open('firebaseLocalStorageDb');
  const db = await new Promise((res, rej) => { openReq.onsuccess = () => res(openReq.result); openReq.onerror = () => rej(openReq.error); });
  const store = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage');
  const records = await new Promise((res, rej) => { const r = store.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  let user = null;
  for (const rec of records) {
    if (rec == null) continue;
    let v = rec.value ?? rec;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { continue; } }
    if (v && v.stsTokenManager && (v.stsTokenManager.accessToken || v.stsTokenManager.refreshToken)) {
      if (!user || v.apiKey === API_KEY) user = v;
    }
  }
  if (!user) { alert('No se encontró la sesión guardada'); return; }
  let token = user.stsTokenManager.accessToken;
  if (Date.now() > (user.stsTokenManager.expirationTime || 0) - 60000) {
    const rr = await fetch('https://securetoken.googleapis.com/v1/token?key=' + API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(user.stsTokenManager.refreshToken) });
    const j = await rr.json();
    if (j.access_token) token = j.access_token; else { alert('No se pudo renovar sesión'); return; }
  }
  const resp = await fetch('https://firestore.googleapis.com/v1/projects/glamours-control/databases/(default)/documents/luxcar_personas', { headers: { Authorization: 'Bearer ' + token } });
  const data = await resp.json();
  if (data.error) { alert('Error: ' + JSON.stringify(data.error)); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'luxcar_export.json'; a.click();
  alert('Descargado luxcar_export.json (' + ((data.documents || []).length) + ' documentos)');
})();
```

3. Con `luxcar_export.json` se puede armar el Excel (`LUXCAR_listas.xlsx`) y
   completar con personas nuevas antes de volver a cargar.