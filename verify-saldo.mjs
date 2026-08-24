// verify-saldo.mjs - Check what the emulator data looks like
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, getDoc, doc, query, orderBy } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'fake', authDomain: 'fake' });
const db = getFirestore(app);
const auth = getAuth(app);
connectFirestoreEmulator(db, 'localhost', 8080);
connectAuthEmulator(auth, 'http://localhost:9099');

function computeSaldos(list) {
  const sorted = [...list].sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
  const saldos = { Blanco: 0, Negro: 0 };
  for (const m of sorted) {
    const cat = m.categoria || 'Blanco';
    const mult = m.codigo === 501 ? -1 : m.codigo === 503 ? 0 : 1;
    saldos[cat] += m.monto * mult;
  }
  return saldos;
}

async function main() {
  await signInWithEmailAndPassword(auth, 'admin@glamours.com', 'admin123');

  console.log('=== All caja records (sorted by creado) ===');
  const snap = await getDocs(query(collection(db, 'caja'), orderBy('creado')));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  for (const m of all) {
    const mult = m.codigo === 501 ? -1 : m.codigo === 503 ? 0 : 1;
    console.log(`  ${m.fecha} cod=${m.codigo} ${m.categoria} $${m.monto} mult=${mult} => $${m.monto * mult}`);
  }

  console.log('\n=== Running computeSaldos ===');
  const saldos = computeSaldos(all);
  console.log(`  Blanco: $${saldos.Blanco}`);
  console.log(`  Negro: $${saldos.Negro}`);
  console.log(`  Total: $${saldos.Blanco + saldos.Negro}`);

  // Check estado doc
  const estadoSnap = await getDoc(doc(db, 'estado', 'caja'));
  if (estadoSnap.exists()) {
    console.log('\n=== Estado doc ===');
    console.log(`  ${JSON.stringify(estadoSnap.data())}`);
  } else {
    console.log('\n=== No estado doc yet (will be created on first page load) ===');
  }

  console.log('\n=== EXPECTED: Blanco=$14,092 Negro=$0 ===');
}

main().catch(console.error);
