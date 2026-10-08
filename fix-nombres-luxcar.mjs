import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc } from 'firebase/firestore';

const EMAIL = 'admin@glamours.com';
const PASS = 'glamours123';

const capitalizar = (s) => String(s || '').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'fake', authDomain: 'fake' });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
connectFirestoreEmulator(db, 'localhost', 8080);

await signInWithEmailAndPassword(auth, EMAIL, PASS);

let total = 0;
for (const tipo of ['cumple', 'nino', 'navidad']) {
  const ref = doc(db, 'luxcar_personas', tipo);
  const snap = await getDoc(ref);
  if (!snap.exists()) continue;
  const d = snap.data();
  const personas = (d.personas || []).map((p) => {
    const c = capitalizar(p.nombre);
    if (c !== p.nombre) total++;
    return { ...p, nombre: c };
  });
  await setDoc(ref, { ...d, personas, actualizado: new Date().toISOString() });
}
console.log(`Nombres corregidos: ${total}`);
process.exit(0);
