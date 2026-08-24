// crear-admin-emulador.mjs - Recrea el usuario de prueba en el Auth del EMULADOR
// Uso: node crear-admin-emulador.mjs   (emulador activo)
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from 'firebase/firestore';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'fake', authDomain: 'fake' });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, 'http://localhost:9099');
connectFirestoreEmulator(db, 'localhost', 8080);

const EMAIL = 'admin@glamours.com';
const PASS = 'glamours123';

try {
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASS);
  await setDoc(doc(db, 'users', cred.user.uid), {
    uid: cred.user.uid,
    email: EMAIL,
    nombre: 'Administrador',
    rol: 'admin',
    creado: new Date().toISOString(),
  });
  console.log('OK - usuario creado con perfil admin:', cred.user.uid);
} catch (e) {
  if (e?.code === 'auth/email-already-in-use') {
    console.log('El usuario ya existe en el emulador');
  } else {
    console.error('ERROR:', e?.code || e?.message);
    process.exit(1);
  }
}
