import { db } from '../config/firebase';
import {
  collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc,
  runTransaction,
} from 'firebase/firestore';
import { trackOp } from '../utils/firebaseUsage';

// ============================================================
// Seccion "Codigos de Barras" — catalogs AISLADOS del resto de la app.
// Cada catalogo guarda un doc por codigo: el ID del doc ES el codigo,
// lo que garantiza unicidad e irrepetibilidad a nivel de base de datos.
//
// Formato del codigo (10 digitos):  XX  XXXX  XX  XX
//   2 marca  +  4 prenda  +  2 color  +  2 talle
//
// El contador de prendas vive en codigos_meta/prenda_counter y es
// monotonico (nunca retrocede): borrar una prenda NO libera su codigo.
// ============================================================

export const CODIGOS_COLS = {
  marcas: 'codigos_marcas',
  prendas: 'codigos_prendas',
  colores: 'codigos_colores',
  talles: 'codigos_talles',
};

const META_COL = 'codigos_meta';
const PRENDA_COUNTER_ID = 'prenda_counter';
const LARGO = { marcas: 2, prendas: 4, colores: 2, talles: 2 };

function colRef(tipo) { return collection(db, CODIGOS_COLS[tipo]); }
function docRef(tipo, codigo) { return doc(db, CODIGOS_COLS[tipo], codigo); }

export function padCodigo(tipo, n) {
  return String(n).padStart(LARGO[tipo], '0');
}

// Lectura unica de los 4 catalogs (4 lecturas por visita a la pagina).
export async function getCatalogos() {
  const tipos = Object.keys(CODIGOS_COLS);
  const snaps = await Promise.all(tipos.map((t) => getDocs(colRef(t))));
  trackOp('lectura', snaps.reduce((a, s) => a + s.size, 0));
  const out = {};
  tipos.forEach((t, i) => {
    out[t] = snaps[i].docs
      .map((d) => ({ codigo: d.id, ...d.data() }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  });
  return out;
}

export async function addItem(tipo, codigo, nombre) {
  const largo = LARGO[tipo];
  const c = String(codigo ?? '').trim();
  if (!/^\d+$/.test(c) || c.length !== largo) {
    throw new Error(`El codigo debe tener ${largo} digitos numericos`);
  }
  const n = String(nombre ?? '').trim();
  if (!n) throw new Error('Ingresá un nombre / descripcion');
  const snap = await getDoc(docRef(tipo, c));
  trackOp('lectura', 1);
  if (snap.exists()) throw new Error(`El codigo ${c} ya esta en uso`);
  await setDoc(docRef(tipo, c), {
    codigo: c, nombre: n, creado: new Date().toISOString(),
  });
  trackOp('escritura', 1);
  return { codigo: c, nombre: n };
}

export async function updateItem(tipo, codigo, nombre) {
  const n = String(nombre ?? '').trim();
  if (!n) throw new Error('Ingresá un nombre / descripcion');
  await updateDoc(docRef(tipo, codigo), { nombre: n });
  trackOp('escritura', 1);
}

export async function deleteItem(tipo, codigo) {
  await deleteDoc(docRef(tipo, codigo));
  trackOp('eliminacion', 1);
}

// Proximo codigo de prenda (contador 0001..9999, transaccional:
// dos pestañas a la vez nunca reciben el mismo numero).
// OJO: la lectura de la coleccion NO se hace dentro de la transaccion
// (tx.get con query rompe en este build del SDK); se resuelve antes y la
// transaccion solo toca el doc contador, que es quien garantiza unicidad.
export async function nextPrendaCodigo() {
  const ref = doc(db, META_COL, PRENDA_COUNTER_ID);
  let inicial = null;
  const actual = await getDoc(ref);
  trackOp('lectura', 1);
  if (!actual.exists()) {
    // Primera vez: arrancar desde el maximo existente (por si hay datos
    // cargados a mano o restaurados de un backup) para no pisar codigos.
    const ps = await getDocs(colRef('prendas'));
    trackOp('lectura', Math.max(ps.size, 1));
    let max = 0;
    ps.forEach((d) => {
      const v = parseInt(d.id, 10);
      if (Number.isFinite(v) && v > max) max = v;
    });
    inicial = max + 1;
  }
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    trackOp('lectura', 1);
    const n = snap.exists() ? (Number(snap.data().next) || 1) : inicial;
    if (n > 9999) throw new Error('Contador de prendas completo (9999)');
    tx.set(ref, { next: n + 1, actualizado: new Date().toISOString() });
    trackOp('escritura', 1);
    return n;
  });
  return padCodigo('prendas', next);
}
