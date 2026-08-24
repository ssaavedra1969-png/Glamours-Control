// debug-saldo-v7.mjs - Audita el EMULADOR con la formula v7 EXACTA (500 ancla, 501 -, 502 +, 503 informativo)
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'demo-api-key' });
const db = getFirestore(app);
connectFirestoreEmulator(db, 'localhost', 8080);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
await signInWithEmailAndPassword(auth, 'admin@glamours.com', 'glamours123');

const cajaSnap = await getDocs(collection(db, 'caja'));
const caja = cajaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
console.log(`Total movimientos caja en emulador: ${caja.length}`);

const compararCronologico = (a, b) => {
  if ((a.fecha || '') !== (b.fecha || '')) return (a.fecha || '').localeCompare(b.fecha || '');
  const pa = a.codigo === 500 ? 0 : 1;
  const pb = b.codigo === 500 ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return (a.creado || '').localeCompare(b.creado || '');
};

const fmt = (n) => '$' + (n ?? 0).toLocaleString('es-AR');

// Formula v7: Saldo = 500(ancla fija) + 502 - 501. El 503 NO participa.
const saldos = { Blanco: 0, Negro: 0 };
let mismatches = 0;
const sorted = [...caja].sort(compararCronologico);
console.log('\n--- DETALLE CRONOLOGICO (v7) ---');
let ultimaFecha = null;
for (const m of sorted) {
  const cat = m.categoria || 'Blanco';
  const antes = saldos[cat];
  let nuevo;
  if (m.codigo === 500) nuevo = m.monto;
  else if (m.codigo === 501) nuevo = antes - m.monto;
  else if (m.codigo === 502) nuevo = antes + m.monto;
  else nuevo = antes; // 503 informativo
  saldos[cat] = nuevo;
  const bad = typeof m.saldo_nuevo === 'number' && (m.saldo_anterior !== antes || Math.abs(m.saldo_nuevo - nuevo) > 0.005);
  if (bad) mismatches++;
  if (m.fecha !== ultimaFecha) { ultimaFecha = m.fecha; console.log(`\n== ${m.fecha} ==`); }
  const flag = m.codigo === 500 ? 'ANCLA' : m.codigo === 503 ? '(info)' : '';
  console.log(`  ${cat.padEnd(6)} cod=${m.codigo} ${String(m.tipo || '').padEnd(15)} ${fmt(m.monto).padStart(12)} -> saldo=${fmt(nuevo).padStart(12)} ${flag}${bad ? '  *** SALDO GUARDADO DISTINTO' : ''}`);
}

console.log('\n--- RESUMEN POR DIA/CATEGORIA ---');
const porDia = {};
for (const m of caja) {
  const k = `${m.fecha}|${m.categoria || 'Blanco'}`;
  const r = (porDia[k] ||= { c500: 0, s500: 0, s501: 0, s502: 0, s503: 0, n501: 0, n502: 0 });
  if (m.codigo === 500) { r.c500++; r.s500 += m.monto; }
  if (m.codigo === 501) { r.s501 += m.monto; r.n501++; }
  if (m.codigo === 502) { r.s502 += m.monto; r.n502++; }
  if (m.codigo === 503) r.s503 += m.monto;
}
for (const k of Object.keys(porDia).sort()) {
  const [f, c] = k.split('|');
  const r = porDia[k];
  const formula = r.c500 ? `${fmt(r.s500)} + ${fmt(r.s502)} - ${fmt(r.s501)}` : `(sin ancla) + ${fmt(r.s502)} - ${fmt(r.s501)}`;
  console.log(`${f} ${c.padEnd(6)} | 500x${r.c500}=${fmt(r.s500).padStart(10)} | 502(${r.n502})=${fmt(r.s502).padStart(11)} | 501(${r.n501})=${fmt(r.s501).padStart(11)} | 503=${fmt(r.s503).padStart(11)} | formula: ${formula}`);
}

console.log('\n--- RESULTADO FINAL v7 ---');
console.log(`Blanco: ${fmt(saldos.Blanco)}   Negro: ${fmt(saldos.Negro)}`);

const estSnap = await getDoc(doc(db, 'estado', 'caja'));
const est = estSnap.exists() ? estSnap.data() : {};
console.log(`Doc estado : Blanco=${fmt(est.saldo_blanco)} Negro=${fmt(est.saldo_negro)} version=${est._version ?? '(sin version)'}`);
console.log(est.saldo_blanco === saldos.Blanco && est.saldo_negro === saldos.Negro ? '>>> estado COINCIDE con recalculo ✔' : '>>> estado DISTINTO del recalculo ✗');

const fechas = [...new Set(caja.map((m) => m.fecha))].sort();
console.log(`\nFechas presentes: ${fechas.join(', ')}`);
console.log(`Docs con saldo guardado distinto al recalculado v7: ${mismatches}`);
process.exit(0);
