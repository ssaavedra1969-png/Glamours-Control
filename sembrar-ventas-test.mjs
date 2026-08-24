// sembrar-ventas-test.mjs - Siembra ventas de prueba en el EMULADOR: ultimos 24 meses, 5 tipos por dia
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, addDoc } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'demo-api-key' });
const db = getFirestore(app);
connectFirestoreEmulator(db, 'localhost', 8080);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
await signInWithEmailAndPassword(auth, 'admin@glamours.com', 'glamours123');

const hoy = new Date();
let n = 0;
for (let i = 23; i >= 0; i--) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const estacional = 1 + 0.25 * Math.sin((d.getMonth() + 1) / 2); // variacion por mes
  for (const dia of [10, 20]) {
    const fecha = `${ym}-${String(dia).padStart(2, '0')}`;
    const base = Math.round(180000 * estacional + i * 3500);
    const filas = [
      { fecha, tipo: 'Moneda Local', categoria: 'Blanco', medio_pago: 'Efectivo', monto: base, descripcion: 'Test Blanco' },
      { fecha, tipo: 'Moneda Local 1', categoria: 'Negro', medio_pago: 'Efectivo', monto: Math.round(base * 0.6), descripcion: 'Test Negro' },
      { fecha, tipo: 'Tarjeta de Credito / Debito', categoria: null, medio_pago: 'Tarjeta', banco: 'Visa - Banco Nacion', cuotas: 1, monto: Math.round(base * 0.8), descripcion: 'Test TC' },
      { fecha, tipo: 'Pago Electronico', categoria: null, medio_pago: 'Debito', banco: 'Debito - Cabal', cuotas: 1, monto: Math.round(base * 0.35), descripcion: 'Test Debito' },
      { fecha, tipo: 'Transferencia', categoria: null, medio_pago: 'Electronico', banco: 'QR MercadoPago', cuotas: 1, monto: Math.round(base * 0.45), descripcion: 'Test QR' },
    ];
    for (const f of filas) {
      await addDoc(collection(db, 'ventas'), { ...f, origen: 'test', usuario: 'seed', creado: `${fecha}T12:00:00` });
      n++;
    }
  }
}
console.log(`Sembradas ${n} ventas de prueba (24 meses x 2 dias x 5 tipos).`);
process.exit(0);
