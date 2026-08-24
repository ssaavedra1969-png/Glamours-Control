// firebaseUsage.js - Contador LOCAL de operaciones Firestore del dia (plan Spark).
// NO consume cuota: se guarda en localStorage. Aproxima la facturacion de Google
// (1 doc leido = 1 lectura; cada set/update/add = 1 escritura; cada delete = 1 eliminacion).

const KEY = 'gl_fb_usage_v1';

// Limites del plan Spark (gratis) por dia
export const SPARK_LIMITS = { lectura: 50000, escritura: 20000, eliminacion: 20000 };

function hoyStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.fecha === hoyStr()) {
      return { fecha: raw.fecha, lectura: raw.lectura || 0, escritura: raw.escritura || 0, eliminacion: raw.eliminacion || 0 };
    }
  } catch { /* datos corruptos -> reiniciar */ }
  return { fecha: hoyStr(), lectura: 0, escritura: 0, eliminacion: 0 };
}

export function trackOp(tipo, n = 1) {
  try {
    const u = load();
    u[tipo] += n;
    localStorage.setItem(KEY, JSON.stringify(u));
  } catch { /* localStorage lleno/bloqueado: nunca romper la app por esto */ }
}

export function getUsageHoy() {
  return load();
}

// Estado de salud global segun el peor porcentaje de consumo
export function saludFirebase() {
  const u = getUsageHoy();
  const detalles = Object.entries(SPARK_LIMITS).map(([tipo, limite]) => {
    const pct = Math.min(100, (u[tipo] / limite) * 100);
    return { tipo, usado: u[tipo], limite, pct };
  });
  const peor = Math.max(...detalles.map((d) => d.pct));
  const nivel = peor >= 85 ? 'critico' : peor >= 60 ? 'alerta' : 'ok';
  return { detalles, peorPct: peor, nivel };
}
