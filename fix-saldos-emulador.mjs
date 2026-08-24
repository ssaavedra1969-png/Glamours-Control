// fix-saldos-emulador.mjs - Recalcula saldos v7 desde cero EN EL EMULADOR (equivalente a _recalculateFromScratch)
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, doc, writeBatch } from 'firebase/firestore';
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

const snap = await getDocs(collection(db, 'caja'));
const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(compararCronologico);
const saldos = { Blanco: 0, Negro: 0 };
let batch = writeBatch(db);
let count = 0;
for (const m of all) {
  const cat = m.categoria || 'Blanco';
  const { anterior, nuevo } = aplicar(saldos, cat, m.codigo, m.monto);
  saldos[cat] = nuevo;
  if (m.saldo_anterior !== anterior || m.saldo_nuevo !== nuevo) {
    batch.update(doc(db, 'caja', m.id), { saldo_anterior: anterior, saldo_nuevo: nuevo });
    count++;
    console.log(`Corregido: ${m.fecha} cod=${m.codigo} ${cat} ${JSON.stringify(m.saldo_anterior)}->${JSON.stringify(m.saldo_nuevo)} => ${anterior}->${nuevo}`);
  }
}
if (count % 500 !== 0) await batch.commit();
await new Promise((r) => setTimeout(r, 300));
const eb = writeBatch(db);
eb.set(doc(db, 'estado', 'caja'), { saldo_blanco: saldos.Blanco, saldo_negro: saldos.Negro, _version: 7, actualizado: new Date().toISOString() }, { merge: true });
await eb.commit();
console.log(`\nListo: ${count} docs corregidos. Estado -> Blanco=${saldos.Blanco} Negro=${saldos.Negro}`);
process.exit(0);
