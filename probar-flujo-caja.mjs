// probar-flujo-caja.mjs - E2E contra EMULADOR: carga desordenada -> recalc -> borrar dias completos -> recalc
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, addDoc, doc, writeBatch } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'demo-api-key' });
const db = getFirestore(app);
connectFirestoreEmulator(db, 'localhost', 8080);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
await signInWithEmailAndPassword(auth, 'admin@glamours.com', 'glamours123');

const compararCronologico = (a, b) => {
  if ((a.fecha || '') !== (b.fecha || '')) return (a.fecha || '').localeCompare(b.fecha || '');
  const pa = a.codigo === 500 ? 0 : 1;
  const pb = b.codigo === 500 ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return (a.creado || '').localeCompare(b.creado || '');
};
const aplicar = (saldos, cat, codigo, monto) => {
  const anterior = saldos[cat];
  let nuevo;
  if (codigo === 500) nuevo = monto;
  else if (codigo === 501) nuevo = anterior - monto;
  else if (codigo === 502) nuevo = anterior + monto;
  else nuevo = anterior;
  return { anterior, nuevo };
};
const fmt = (n) => '$' + (n ?? 0).toLocaleString('es-AR');

const leerCaja = async () => {
  const s = await getDocs(collection(db, 'caja'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
};

async function recalcularTodo() {
  const all = (await leerCaja()).sort(compararCronologico);
  const saldos = { Blanco: 0, Negro: 0 };
  let batch = writeBatch(db);
  let n = 0;
  const problemas = [];
  for (const m of all) {
    const cat = m.categoria || 'Blanco';
    const { anterior, nuevo } = aplicar(saldos, cat, m.codigo, m.monto);
    saldos[cat] = nuevo;
    if (m.saldo_anterior !== anterior || m.saldo_nuevo !== nuevo) {
      batch.update(doc(db, 'caja', m.id), { saldo_anterior: anterior, saldo_nuevo: nuevo });
      n++;
      if (n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
    }
  }
  if (n % 400 !== 0) await batch.commit();
  const eb = writeBatch(db);
  eb.set(doc(db, 'estado', 'caja'), { saldo_blanco: saldos.Blanco, saldo_negro: saldos.Negro, _version: 7, actualizado: new Date().toISOString() }, { merge: true });
  await eb.commit();
  return { corregidos: n, saldos };
}

async function integridad() {
  const all = (await leerCaja()).sort(compararCronologico);
  const saldos = { Blanco: 0, Negro: 0 };
  let mal = 0;
  for (const m of all) {
    const cat = m.categoria || 'Blanco';
    const { anterior, nuevo } = aplicar(saldos, cat, m.codigo, m.monto);
    saldos[cat] = nuevo;
    if (m.saldo_anterior !== anterior || Math.abs((m.saldo_nuevo ?? 0) - nuevo) > 0.005) mal++;
  }
  return { mal, total: all.length };
}

const dia = (fecha, a500, a501, a502, a503) => [
  { fecha, tipo: 'En caja', codigo: 500, categoria: 'Blanco', descripcion: 'Prueba', monto: a500, origen: 'excel', creado: `${fecha}T20:00:00` },
  { fecha, tipo: 'Egreso', codigo: 501, categoria: 'Blanco', descripcion: 'Prueba', monto: a501, origen: 'excel', creado: `${fecha}T21:00:00` },
  { fecha, tipo: 'Ingreso', codigo: 502, categoria: 'Blanco', descripcion: 'Prueba', monto: a502, origen: 'excel', creado: `${fecha}T22:00:00` },
  { fecha, tipo: 'Retiro', codigo: 503, categoria: 'Blanco', descripcion: 'Prueba', monto: a503, origen: 'excel', creado: `${fecha}T23:00:00` },
];

const fail = (msg) => { console.error('FALLÓ: ' + msg); process.exit(1); };

// ESTADO INICIAL esperado: 28 docs, 12292
let chk = await integridad();
if (chk.mal !== 0) fail(`estado inicial inconsistente (${chk.mal})`);
console.log(`INICIO: ${chk.total} docs, integridad OK`);

// PASO 1: carga DESORDENADA - dia 16 intercalado y dia 22 al final (en un solo lote, como addBulk)
const nuevos = [...dia('2026-08-22', 1000, 200, 500, 200), ...dia('2026-08-16', 7777, 111, 222, 333)];
for (const m of nuevos) await addDoc(collection(db, 'caja'), m);
console.log(`\nPASO 1: insertados ${nuevos.length} movs (dia 16 intercalado SIN saldos validos + dia 22)`);

// PASO 2: recalc (lo que ahora hace addBulk automaticamente)
const r2 = await recalcularTodo();
chk = await integridad();
console.log(`PASO 2: recalc corrigio ${r2.corregidos} docs | integridad: ${chk.mal === 0 ? 'OK' : 'MAL ' + chk.mal}`);
if (chk.mal !== 0) fail('recalc no dejo cadenas consistentes');
if (r2.saldos.Blanco !== 1300) fail(`saldo final esperado 1300 (ancla dia 22: 1000+500-200), obtuvo ${r2.saldos.Blanco}`);
console.log(`        saldo final = ${fmt(r2.saldos.Blanco)} (esperado $13.000, gobierna la ancla del dia 22) ✔`);

// PASO 3: borrar dia COMPLETO intermedio (16) - replica deleteCajaDia
async function borrarDia(fecha) {
  const s = await getDocs(collection(db, 'caja'));
  const docs = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.fecha === fecha);
  let batch = writeBatch(db);
  for (let i = 0; i < docs.length; i++) {
    batch.delete(doc(db, 'caja', docs[i].id));
    if ((i + 1) % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  if (docs.length % 400 !== 0) await batch.commit();
  return docs.length;
}
const borrados16 = await borrarDia('2026-08-16');
const r3 = await recalcularTodo();
chk = await integridad();
console.log(`\nPASO 3: borrado dia 16 completo (${borrados16} docs) | recalc: ${r3.corregidos} fixes | integridad ${chk.mal === 0 ? 'OK' : 'MAL'}`);
if (borrados16 !== 4 || chk.mal !== 0) fail('borrado dia intermedio no restauro consistencia');
if (r3.saldos.Blanco !== 1300) fail(`tras borrar dia 16 el saldo debia seguir 1300, obtuvo ${r3.saldos.Blanco}`);
console.log(`        saldo sigue ${fmt(r3.saldos.Blanco)} ✔ (el dia 16 ya no afecta)`);

// PASO 4: borrar ultimo dia (22) -> debe volver EXACTAMENTE a 12.292
const borrados22 = await borrarDia('2026-08-22');
const r4 = await recalcularTodo();
chk = await integridad();
console.log(`\nPASO 4: borrado dia 22 completo (${borrados22} docs) | total docs: ${chk.total} | integridad ${chk.mal === 0 ? 'OK' : 'MAL'}`);
if (borrados22 !== 4 || chk.total !== 28 || chk.mal !== 0) fail('no volvio al estado original');
if (r4.saldos.Blanco !== 12292) fail(`saldo final debia ser 12292, obtuvo ${r4.saldos.Blanco}`);
console.log(`        saldo final = ${fmt(r4.saldos.Blanco)} ✔ RESTAURADO AL VALOR ORIGINAL`);

console.log('\n===== TODO OK =====');
process.exit(0);
