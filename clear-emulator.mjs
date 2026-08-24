// clear-emulator.mjs - Clear ALL emulator data
// Usage: node clear-emulator.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'fake', authDomain: 'fake' });
const db = getFirestore(app);
const auth = getAuth(app);
connectFirestoreEmulator(db, 'localhost', 8080);
connectAuthEmulator(auth, 'http://localhost:9099');

async function clearCollection(name) {
  const snap = await getDocs(collection(db, name));
  let count = 0;
  for (const d of snap.docs) {
    await deleteDoc(doc(db, name, d.id));
    count++;
  }
  console.log(`  Cleared ${count} docs from "${name}"`);
  return count;
}

async function main() {
  // First sign in to pass Firestore rules
  console.log('Signing in...');
  try {
    await signInWithEmailAndPassword(auth, 'admin@glamours.com', 'admin123');
    console.log('Signed in OK');
  } catch (e) {
    console.log('Sign in failed (user may not exist yet):', e.code);
    console.log('Try creating user via Vite app first, or use firebase CLI.');
    return;
  }

  console.log('=== Clearing ALL emulator data ===');
  const collections = ['caja', 'ventas', 'cierres', 'conciliaciones', 'auditoria', 'configuracion', 'users'];
  let total = 0;
  for (const col of collections) {
    total += await clearCollection(col);
  }
  console.log(`\nTotal deleted: ${total}`);

  // Re-create user doc
  await setDoc(doc(db, 'users', 'admin'), {
    email: 'admin@glamours.com', nombre: 'Admin', rol: 'admin', creado: new Date().toISOString()
  });
  console.log('  User doc recreated');

  console.log('\n=== DONE - Emulator is clean ===');
}

main().catch(console.error);
