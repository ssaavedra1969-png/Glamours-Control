// seed-test.mjs - Seed emulator with known test data for 08/08/2026
// Expected after: Blanco +$13,692 | Negro $0
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, addDoc, getDoc, doc, setDoc } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'fake', authDomain: 'fake' });
const db = getFirestore(app);
const auth = getAuth(app);
connectFirestoreEmulator(db, 'localhost', 8080);
connectAuthEmulator(auth, 'http://localhost:9099');

// 4 caja records for 08/08/2026 - exactly like Excel upload would create
const TEST_CAJA = [
  // 500 Blanco - opening balance
  { fecha: '2026-08-08', tipo: 'En Caja', codigo: 500, categoria: 'Blanco', descripcion: 'Saldo inicial', monto: 13692, origen: 'excel', creado: '2026-08-08T20:00:00' },
  // 500 Negro - opening balance
  { fecha: '2026-08-08', tipo: 'En Caja', codigo: 500, categoria: 'Negro', descripcion: 'Saldo inicial', monto: 0, origen: 'excel', creado: '2026-08-08T20:01:00' },
  // 502 Blanco - ingreso (venta efectivo)
  { fecha: '2026-08-08', tipo: 'Ingreso en Caja', codigo: 502, categoria: 'Blanco', descripcion: 'Venta Blanco - Test', monto: 400, origen: 'excel', creado: '2026-08-08T20:02:00' },
  // 501 Blanco - egreso
  { fecha: '2026-08-08', tipo: 'Egreso', codigo: 501, categoria: 'Blanco', descripcion: 'Egreso test', monto: 0, origen: 'excel', creado: '2026-08-08T20:03:00' },
];

async function main() {
  console.log('Signing in...');
  await signInWithEmailAndPassword(auth, 'admin@glamours.com', 'admin123');
  console.log('Signed in OK\n');

  console.log('=== Seeding 4 test caja records for 08/08/2026 ===');
  for (const rec of TEST_CAJA) {
    const ref = await addDoc(collection(db, 'caja'), rec);
    console.log(`  Added: cod=${rec.codigo} ${rec.categoria} $${rec.monto} -> ${ref.id}`);
  }

  // Manually compute expected saldo: 500 Blanco +13692, 500 Negro +0, 502 Blanco +400, 501 Blanco -0
  console.log('\n=== Expected saldos (by hand) ===');
  console.log('  Blanco: +$13,692 + $400 + (-$0) = $14,092');
  console.log('  Negro: $0');

  // Now call computeSaldos through recalcularSaldosCompletos
  // Instead, let's manually check by writing estado doc
  console.log('\n=== Expected estado after recalc ===');
  console.log('  saldo_blanco: 14092');
  console.log('  saldo_negro: 0');
  console.log('  _version: 5');

  console.log('\n=== DONE - Now open http://localhost:5173 to verify ===');
}

main().catch(console.error);
