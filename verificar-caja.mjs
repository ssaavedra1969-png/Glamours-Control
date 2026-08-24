// ============================================================
//  VERIFICADOR DE CAJA - corre contra el EMULADOR (:8080)
//  Replica EXACTA de la formula SALDO_VERSION 6 y audita:
//   1) Integridad: cada doc guardado vs recalculo desde cero
//   2) Doc estado vs recalculo final
//   3) Dias con DOS anclas 500 (problema conocido del Excel)
//   4) Conciliacion mensual ventas-efectivo vs ingresos caja
// ============================================================
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'demo-api-key' });
const db = getFirestore(app);
connectFirestoreEmulator(db, 'localhost', 8080);

// Login en el emulador de Auth para pasar las reglas (request.auth != null)
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
await signInWithEmailAndPassword(auth, 'admin@glamours.com', 'glamours123');
console.log('Autenticado en el emulador ✔');

// --- Formula SAGRADA v6 (copia exacta de firestoreDB.js) ---
function compararCronologico(a, b) {
  if ((a.fecha || '') !== (b.fecha || '')) return (a.fecha || '').localeCompare(b.fecha || '');
  const pa = a.codigo === 500 ? 0 : 1;
  const pb = b.codigo === 500 ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return (a.creado || '').localeCompare(b.creado || '');
}
function aplicar(m, saldoActual) {
  const cat = m.categoria || 'Blanco';
  const anterior = saldoActual;
  let nuevo;
  if (m.codigo === 500) nuevo = m.monto;
  else nuevo = anterior + m.monto * ((m.codigo === 501 || m.codigo === 503) ? -1 : 1);
  return { anterior, nuevo };
}

const fmt = (n) => '$' + (n ?? 0).toLocaleString('es-AR');

console.log('Leyendo coleccion caja...');
const cajaSnap = await getDocs(collection(db, 'caja'));
const caja = cajaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
console.log(`Total movimientos de caja: ${caja.length}`);

// ---- 1) Integridad doc por doc ----
const sorted = [...caja].sort(compararCronologico);
const saldos = { Blanco: 0, Negro: 0 };
let mismatches = 0;
let sinSaldo = 0;
const ejemplos = [];
for (const m of sorted) {
  const { anterior, nuevo } = aplicar(m, saldos[m.categoria || 'Blanco']);
  saldos[m.categoria || 'Blanco'] = nuevo;
  if (typeof m.saldo_nuevo !== 'number') { sinSaldo++; continue; }
  if (m.saldo_anterior !== anterior || Math.abs(m.saldo_nuevo - nuevo) > 0.005) {
    mismatches++;
    if (ejemplos.length < 6) ejemplos.push({ fecha: m.fecha, cat: m.categoria, cod: m.codigo, guardado: [m.saldo_anterior, m.saldo_nuevo], recalc: [anterior, nuevo] });
  }
}

console.log('\n========== 1) INTEGRIDAD SALDOS ==========');
console.log(`Docs con saldo guardado distinto al recalculado: ${mismatches}`);
console.log(`Docs sin saldo guardado: ${sinSaldo}`);
if (ejemplos.length) console.log(JSON.stringify(ejemplos, null, 2));

// ---- 2) Doc estado ----
console.log('\n========== 2) DOC ESTADO ==========');
const estSnap = await getDoc(doc(db, 'estado', 'caja'));
const est = estSnap.exists() ? estSnap.data() : {};
console.log(`Estado guardado : Blanco=${fmt(est.saldo_blanco)} Negro=${fmt(est.saldo_negro)} version=${est._version ?? '(sin version)'}`);
console.log(`Recalculado     : Blanco=${fmt(saldos.Blanco)} Negro=${fmt(saldos.Negro)}`);
const okEstado = est.saldo_blanco === saldos.Blanco && est.saldo_negro === saldos.Negro;
console.log(okEstado ? '>>> COINCIDEN ✔' : '>>> NO COINCIDEN ✗');

// ---- 3) Dias con dos anclas 500 ----
console.log('\n========== 3) DIAS CON DOS ANCLAS 500 ==========');
const porDiaCat = {};
for (const m of caja) {
  if (m.codigo !== 500) continue;
  const k = `${m.fecha}|${m.categoria || 'Blanco'}`;
  (porDiaCat[k] ||= []).push(m);
}
const dobles = Object.entries(porDiaCat).filter(([, arr]) => arr.length > 1);
console.log(`Cantidad de dias/categoria con mas de un 500: ${dobles.length}`);
dobles.slice(0, 10).forEach(([k, arr]) => {
  const [fecha, cat] = k.split('|');
  console.log(`  ${fecha} (${cat}): montos ${arr.map((a) => fmt(a.monto)).join(', ')}`);
});
if (dobles.length > 10) console.log(`  ...y ${dobles.length - 10} mas`);

// ---- 4) Conciliacion mensual ventas vs caja ----
console.log('\n========== 4) CONCILIACION MENSUAL (ventas efectivo vs ingresos 502 caja) ==========');
const ventSnap = await getDocs(collection(db, 'ventas'));
const ventas = ventSnap.docs.map((d) => d.data());
const ingMes = {}, egrMes = {}, venMes = {};
for (const m of caja) {
  if (!m.fecha) continue;
  const ym = m.fecha.slice(0, 7);
  const cat = m.categoria || 'Blanco';
  if (m.codigo === 502) (ingMes[ym] ||= { B: 0, N: 0 })[cat[0]] += m.monto;
  if (m.codigo === 501 || m.codigo === 503) (egrMes[ym] ||= { B: 0, N: 0 })[cat[0]] += m.monto;
}
for (const v of ventas) {
  if (!v.fecha) continue;
  if ((v.medio_pago || '').toLowerCase() === 'tarjeta') continue; // solo efectivo
  (venMes[v.fecha.slice(0, 7)] ||= { B: 0, N: 0 })[(v.categoria || 'Blanco')[0]] += v.monto;
}
const meses = [...new Set([...Object.keys(ingMes), ...Object.keys(venMes)])].sort().slice(-12);
console.log('Mes        | Ventas Efvo | Ing.Caja | Neto Caja | Dif(V-I)');
for (const ym of meses) {
  const v = venMes[ym] || { B: 0, N: 0 };
  const i = ingMes[ym] || { B: 0, N: 0 };
  const e = egrMes[ym] || { B: 0, N: 0 };
  const neto = i.B + i.N - e.B - e.N;
  const dif = (v.B + v.N) - (i.B + i.N);
  console.log(`${ym}   | ${fmt(v.B + v.N).padStart(11)} | ${fmt(i.B + i.N).padStart(8)} | ${fmt(neto).padStart(9)} | ${fmt(dif)}`);
}

// Ultimos 30 dias: detalle diario de cuadre
console.log('\n========== ULTIMOS 20 DIAS CON MOVIMIENTOS (cuadre diario) ==========');
const diasConMov = [...new Set(caja.map((m) => m.fecha))].sort().slice(-20);
let cuadrados = 0, noCuadrados = 0;
for (const f of diasConMov) {
  const delDia = caja.filter((m) => m.fecha === f);
  const vDia = ventas.filter((v) => v.fecha === f && (v.medio_pago || '').toLowerCase() !== 'tarjeta');
  const vTot = vDia.reduce((s, v) => s + v.monto, 0);
  const ancla = delDia.find((m) => m.codigo === 500);
  const ing = delDia.filter((m) => m.codigo === 502).reduce((s, m) => s + m.monto, 0);
  const dif = ancla ? (ancla.monto - ing - vTot) : null;
  const cuadra = dif !== null && Math.abs(dif) < 1;
  if (dif === null) { console.log(`${f}  (sin ancla 500)`); continue; }
  cuadra ? cuadrados++ : noCuadrados++;
  console.log(`${f}  ancla=${fmt(ancla.monto)} ing=${fmt(ing)} vEfvo=${fmt(vTot)} dif=${fmt(dif)} ${cuadra ? '✔' : '✗'}`);
}
console.log(`\nResumen ultimos 20 dias: ${cuadrados} cuadran / ${noCuadrados} no cuadran`);
console.log('\nFIN VERIFICACION');
process.exit(0);
