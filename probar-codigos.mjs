// E2E de la seccion Codigos de Barras (emulador local).
// Valida: unicidad de codigos (doc id), contador transaccional de prendas,
// no-reutilizacion de codigos borrados. Siembra marcas/colores/talles de
// prueba y limpia las prendas y el contador al finalizar.
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, collection, getDocs, getDoc,
  setDoc, deleteDoc, doc, runTransaction,
} from 'firebase/firestore';

const EMAIL = 'admin@glamours.com';
const PASS = 'glamours123';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'fake', authDomain: 'fake' });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
connectFirestoreEmulator(db, 'localhost', 8080);

const COLS = {
  marcas: 'codigos_marcas',
  prendas: 'codigos_prendas',
  colores: 'codigos_colores',
  talles: 'codigos_talles',
};
const LARGO = { marcas: 2, prendas: 4, colores: 2, talles: 2 };

let ok = 0, fallos = 0;
function check(cond, msg) {
  if (cond) { ok++; console.log(`  OK   ${msg}`); }
  else { fallos++; console.log(`  FAIL ${msg}`); }
}

async function addItem(tipo, codigo, nombre) {
  const c = String(codigo ?? '').trim();
  if (!/^\d+$/.test(c) || c.length !== LARGO[tipo]) {
    throw new Error(`El codigo debe tener ${LARGO[tipo]} digitos numericos`);
  }
  const snap = await getDoc(doc(db, COLS[tipo], c));
  if (snap.exists()) throw new Error(`El codigo ${c} ya esta en uso`);
  await setDoc(doc(db, COLS[tipo], c), { codigo: c, nombre, creado: new Date().toISOString() });
  return { codigo: c, nombre };
}

async function nextPrendaCodigo() {
  const ref = doc(db, 'codigos_meta', 'prenda_counter');
  let inicial = null;
  const actual = await getDoc(ref);
  if (!actual.exists()) {
    const ps = await getDocs(collection(db, COLS.prendas));
    let max = 0;
    ps.forEach((d) => { const v = parseInt(d.id, 10); if (v > max) max = v; });
    inicial = max + 1;
  }
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const n = snap.exists() ? (Number(snap.data().next) || 1) : inicial;
    tx.set(ref, { next: n + 1, actualizado: new Date().toISOString() });
    return n;
  });
  return String(next).padStart(LARGO.prendas, '0');
}

async function main() {
  console.log('== Login emulador ==');
  await signInWithEmailAndPassword(auth, EMAIL, PASS);
  console.log('  OK login');

  console.log('== Semilla marcas/colores/talles ==');
  const semilla = {
    marcas: [['01', 'Nike'], ['02', 'Adidas'], ['03', 'Puma']],
    colores: [['01', 'Negro'], ['02', 'Blanco'], ['03', 'Rojo']],
    talles: [['01', 'XS'], ['02', 'S'], ['03', 'M'], ['04', 'L'], ['05', 'XL']],
  };
  for (const [tipo, items] of Object.entries(semilla)) {
    for (const [codigo, nombre] of items) {
      try { await addItem(tipo, codigo, nombre); } catch { /* ya existe de una corrida previa */ }
    }
    const snap = await getDocs(collection(db, COLS[tipo]));
    check(snap.size >= items.length, `${tipo}: ${snap.size} docs`);
  }

  console.log('== Unicidad ==');
  let dupFallo = false;
  try { await addItem('marcas', '01', 'Repetida'); } catch { dupFallo = true; }
  check(dupFallo, 'marca 01 duplicada rechazada');

  let largoFallo = false;
  try { await addItem('marcas', '5', 'Digito corto'); } catch { largoFallo = true; }
  check(largoFallo, 'codigo con 1 digito rechazado');

  console.log('== Contador de prendas (tolerante a datos existentes) ==');
  const counterAntes = await getDoc(doc(db, 'codigos_meta', 'prenda_counter'));
  const c1 = await nextPrendaCodigo();
  const c2 = await nextPrendaCodigo();
  check(/^\d{4}$/.test(c1), `primer codigo de 4 digitos (dio ${c1})`);
  check(parseInt(c2, 10) === parseInt(c1, 10) + 1, `segundo = primero + 1 (dio ${c1} -> ${c2})`);

  await setDoc(doc(db, COLS.prendas, c1), { codigo: c1, nombre: 'Prenda de prueba', creado: new Date().toISOString() });
  await deleteDoc(doc(db, COLS.prendas, c1));
  const c3 = await nextPrendaCodigo();
  check(parseInt(c3, 10) === parseInt(c2, 10) + 1, `borrar ${c1} no libera el codigo: sigue ${c3}`);

  console.log('== Limpieza (solo prendas de prueba del test) ==');
  const ps = await getDocs(collection(db, COLS.prendas));
  for (const d of ps.docs) {
    if (d.data().nombre === 'Prenda de prueba') await deleteDoc(d.ref);
  }
  const psFinal = await getDocs(collection(db, COLS.prendas));
  check(!psFinal.docs.some((d) => d.data().nombre === 'Prenda de prueba'), 'prendas de prueba eliminadas');
  // Solo borrar el contador si NO existia antes del test (no tocar el real)
  if (!counterAntes.exists()) {
    await deleteDoc(doc(db, 'codigos_meta', 'prenda_counter'));
    check(true, 'contador de prueba eliminado (el real se conserva)');
  } else {
    check(true, 'contador real conservado (queda con huecos, no afecta unicidad)');
  }

  console.log(`\n== RESULTADO: ${ok} OK, ${fallos} FAIL ==`);
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
