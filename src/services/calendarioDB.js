// ============================================================
//  Servicio de Calendario de Días Hábiles
//  Optimizado para consumo mínimo de cuota de Firestore:
//  - 1 solo documento por mes: calendario/{YYYY-MM}
//  - 1 lectura al cargar un mes (cache en memoria)
//  - 1 escritura por cambio (setDoc merge)
//  - Registros vacíos se guardan en UN solo batch
// ============================================================
import { db } from '../config/firebase';
import { doc, getDoc, setDoc, writeBatch, collection } from 'firebase/firestore';

// Cache en memoria de la sesión: { '2026-08': { dias: {...} } }
const cache = {};

function mesKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Devuelve los días hábiles de un mes.
 * Estructura del doc: { dias: { '2026-08-03': { seleccionado: true, cargado: false } } }
 * @param {string} mesKey formato 'YYYY-MM'
 * @returns {Promise<Object>} mapa fechaKey -> { seleccionado, cargado }
 */
export async function getCalendarioMes(mesKey) {
  if (cache[mesKey]) return cache[mesKey];
  const snap = await getDoc(doc(db, 'calendario', mesKey));
  const dias = snap.exists() ? (snap.data().dias || {}) : {};
  // Normalizar estructura
  for (const k of Object.keys(dias)) {
    if (typeof dias[k] !== 'object' || dias[k] === null) dias[k] = { seleccionado: true, cargado: false };
    if (dias[k].cargado === undefined) dias[k].cargado = false;
    dias[k].seleccionado = true;
  }
  cache[mesKey] = dias;
  return dias;
}

/**
 * Guarda el mapa completo de días de un mes (1 escritura).
 * @param {string} mesKey formato 'YYYY-MM'
 * @param {Object} dias mapa fechaKey -> { seleccionado, cargado }
 */
export async function saveCalendarioMes(mesKey, dias) {
  cache[mesKey] = dias;
  await setDoc(doc(db, 'calendario', mesKey), {
    dias,
    actualizado: new Date().toISOString(),
  }, { merge: true });
}

/**
 * Actualiza el flag cargado de varias fechas de un mismo mes (1 escritura).
 * @param {string[]} fechas lista de 'YYYY-MM-DD' (todas del mismo mes idealmente)
 */
export async function marcarDiasCargados(fechas) {
  const porMes = {};
  for (const f of fechas) {
    const mk = f.slice(0, 7);
    if (!porMes[mk]) porMes[mk] = [];
    porMes[mk].push(f);
  }
  for (const mk of Object.keys(porMes)) {
    const dias = await getCalendarioMes(mk);
    for (const f of porMes[mk]) {
      if (dias[f]) dias[f] = { ...dias[f], cargado: true };
    }
    await saveCalendarioMes(mk, dias);
  }
}

/**
 * Crea registros vacíos (carga automática) para las fechas indicadas.
 * Por cada día genera:
 *  - 1 movimiento de caja código 500 "En caja" con monto 0
 *  - 1 venta "Moneda Local" con monto 0
 * Todo en batches de 500 ops SIN lecturas previas (monto 0 no altera saldos).
 * @param {string[]} fechas lista de 'YYYY-MM-DD'
 * @param {string} usuario email del usuario que confirma
 */
export async function crearRegistrosVacios(fechas, usuario) {
  if (!fechas || fechas.length === 0) return { caja: 0, ventas: 0 };
  let batch = writeBatch(db);
  let ops = 0;
  let cajaCount = 0;
  let ventasCount = 0;

  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  };

  for (const fecha of fechas) {
    const creado = `${fecha}T23:59:00`;
    const cajaRef = doc(collection(db, 'caja'));
    batch.set(cajaRef, {
      fecha,
      tipo: 'En caja',
      codigo: 500,
      categoria: 'Blanco',
      descripcion: 'Carga automática vacía (calendario)',
      monto: 0,
      saldo_anterior: 0,
      saldo_nuevo: 0,
      usuario: usuario || 'sistema',
      origen: 'calendario',
      creado,
    });
    ops++; cajaCount++;

    const ventaRef = doc(collection(db, 'ventas'));
    batch.set(ventaRef, {
      fecha,
      tipo: 'Moneda Local',
      categoria: 'Blanco',
      medio_pago: 'Efectivo',
      banco: null,
      cuotas: 1,
      monto: 0,
      descripcion: 'Carga automática vacía (calendario)',
      usuario: usuario || 'sistema',
      origen: 'calendario',
      creado,
    });
    ops++; ventasCount++;

    if (ops >= 500) await flush();
  }
  await flush();
  return { caja: cajaCount, ventas: ventasCount };
}

export default { getCalendarioMes, saveCalendarioMes, marcarDiasCargados, crearRegistrosVacios, mesKeyFromDate };
