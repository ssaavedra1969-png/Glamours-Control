import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'fake', authDomain: 'fake' });
const db = getFirestore(app);
const auth = getAuth(app);
connectFirestoreEmulator(db, 'localhost', 8080);
connectAuthEmulator(auth, 'http://localhost:9099');

async function main() {
  await signInWithEmailAndPassword(auth, 'admin@glamours.com', 'admin123');

  // Show a few days of data
  const days = ['2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11'];
  
  for (const day of days) {
    const snap = await getDocs(query(collection(db, 'caja'), where('fecha', '==', day), orderBy('creado')));
    const records = snap.docs.map(d => d.data());
    
    let dayBalance = 0;
    console.log(`\n=== ${day} (${records.length} records) ===`);
    for (const r of records) {
      const mult = r.codigo === 501 ? -1 : r.codigo === 503 ? 0 : 1;
      const effect = r.monto * mult;
      dayBalance += effect;
      console.log(`  cod=${r.codigo} ${r.tipo.padEnd(20)} $${r.monto.toLocaleString().padStart(12)} mult=${mult} => $${effect.toLocaleString().padStart(12)} | desc: ${r.descripcion}`);
    }
    console.log(`  DAY BALANCE: $${dayBalance.toLocaleString()}`);
  }

  // Also show first and last few 500 records to see if they represent opening or closing
  console.log('\n=== First 5 records (by creado) ===');
  const first = await getDocs(query(collection(db, 'caja'), orderBy('creado')));
  const firstRecords = first.docs.slice(0, 5).map(d => d.data());
  for (const r of firstRecords) {
    console.log(`  ${r.fecha} cod=${r.codigo} $${r.monto} ${r.descripcion}`);
  }

  console.log('\n=== Last 5 records (by creado) ===');
  const allSnap = await getDocs(collection(db, 'caja'));
  const all = allSnap.docs.map(d => d.data()).sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));
  for (const r of all.slice(0, 5)) {
    console.log(`  ${r.fecha} cod=${r.codigo} $${r.monto} ${r.descripcion}`);
  }
}

main().catch(console.error);
