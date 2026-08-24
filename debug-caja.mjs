import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'fake', authDomain: 'fake' });
const db = getFirestore(app);
const auth = getAuth(app);
connectFirestoreEmulator(db, 'localhost', 8080);
connectAuthEmulator(auth, 'http://localhost:9099');

async function main() {
  await signInWithEmailAndPassword(auth, 'admin@glamours.com', 'admin123');

  const snap = await getDocs(collection(db, 'caja'));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Total caja records: ${all.length}\n`);

  // Group by code
  const byCode = {};
  for (const m of all) {
    const key = m.codigo || 'undefined';
    if (!byCode[key]) byCode[key] = { count: 0, total: 0, tipo: m.tipo, cat: {} };
    byCode[key].count++;
    byCode[key].total += m.monto;
    const cat = m.categoria || 'Blanco';
    if (!byCode[key].cat[cat]) byCode[key].cat[cat] = { count: 0, total: 0 };
    byCode[key].cat[cat].count++;
    byCode[key].cat[cat].total += m.monto;
  }

  console.log('=== By Code ===');
  for (const [code, data] of Object.entries(byCode).sort((a, b) => a[0] - b[0])) {
    console.log(`  Code ${code} (${data.tipo}): ${data.count} records, total $${data.total.toLocaleString()}`);
    for (const [cat, cd] of Object.entries(data.cat)) {
      const mult = code == 501 ? -1 : code == 503 ? 0 : 1;
      console.log(`    ${cat}: ${cd.count} records, monto sum=$${cd.total.toLocaleString()}, effect=$${(cd.total * mult).toLocaleString()}`);
    }
  }

  // Compute expected balance
  let blanco = 0, negro = 0;
  for (const m of all) {
    const cat = m.categoria || 'Blanco';
    const mult = m.codigo === 501 ? -1 : m.codigo === 503 ? 0 : 1;
    if (cat === 'Blanco') blanco += m.monto * mult;
    else negro += m.monto * mult;
  }
  console.log(`\n=== Expected Balance ===`);
  console.log(`  Blanco: $${blanco.toLocaleString()}`);
  console.log(`  Negro: $${negro.toLocaleString()}`);

  // Show date range
  const dates = [...new Set(all.map(m => m.fecha))].sort();
  console.log(`\n=== Date Range ===`);
  console.log(`  From: ${dates[0]} To: ${dates[dates.length - 1]}`);
  console.log(`  Total days: ${dates.length}`);
}

main().catch(console.error);
