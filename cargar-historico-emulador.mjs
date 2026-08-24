// cargar-historico-emulador.mjs - Carga TEST CONCATENAR_ultimo.xlsx al EMULADOR replicando processExcelFile
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { processData, separarDuplicadosInternos } from './src/utils/excelParser.js';

const XLSX_PATH = 'C:/AI/sil/PAGINA DE APP/Version HTML/entrada/TEST CONCATENAR_ultimo.xlsx';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'demo-api-key' });
const db = getFirestore(app);
connectFirestoreEmulator(db, 'localhost', 8080);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
await signInWithEmailAndPassword(auth, 'admin@glamours.com', 'glamours123');

// 1) Parsear igual que parseExcelFile en el navegador
const wb = XLSX.read(readFileSync(XLSX_PATH), { type: 'buffer' });
const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
console.log(`Filas leidas del Excel: ${data.length}`);

// 2) Clasificar + duplicados internos
const parsed = processData(data, null, null);
const limpio = separarDuplicadosInternos(parsed.caja, parsed.ventas);
const nuevaCaja = limpio.caja;
const nuevasVentas = limpio.ventas;
console.log(`Caja clasificada: ${parsed.caja.length} (dup internos: ${limpio.dupCaja.length}) | Ventas: ${parsed.ventas.length} (dup internos: ${limpio.dupVentas.length})`);

// 3) Duplicados vs base (regla TODOS los campos, como processExcelFile)
const leer = async (colName) => (await getDocs(collection(db, colName))).docs.map((d) => ({ id: d.id, ...d.data() }));
const baseCaja = await leer('caja');
const baseVentas = await leer('ventas');
const dupCaja = nuevaCaja.filter((m) => baseCaja.some((e) => e.fecha === m.fecha && e.tipo === m.tipo && e.codigo === m.codigo && (e.categoria || '') === (m.categoria || '') && (e.descripcion || '') === (m.descripcion || '') && e.monto === m.monto));
const dupVentas = nuevasVentas.filter((v) => baseVentas.some((e) => e.fecha === v.fecha && e.tipo === v.tipo && (e.categoria || '') === (v.categoria || '') && (e.medio_pago || '') === (v.medio_pago || '') && (e.banco || '') === (v.banco || '') && (e.descripcion || '') === (v.descripcion || '') && (e.cuotas ?? 1) === (v.cuotas ?? 1) && e.monto === v.monto));
const insCaja = nuevaCaja.filter((m) => !dupCaja.includes(m));
const insVentas = nuevasVentas.filter((v) => !dupVentas.includes(v));
console.log(`Ya en base -> se omiten: caja ${dupCaja.length}, ventas ${dupVentas.length}`);
console.log(`A insertar -> caja ${insCaja.length}, ventas ${insVentas.length}`);

// 4) Insertar en batches (caja SIN saldos provisionales; el recalculo final los completa)
async function insertar(colName, docs) {
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    for (const m of docs.slice(i, i + 450)) {
      const { saldo_anterior, saldo_nuevo, ...limpia } = m;
      batch.set(doc(collection(db, colName)), limpia);
    }
    await batch.commit();
    if ((i / 450) % 4 === 0) console.log(`  ${colName}: ${Math.min(i + 450, docs.length)}/${docs.length}`);
  }
}
const compararCronologico = (a, b) => {
  if ((a.fecha || '') !== (b.fecha || '')) return (a.fecha || '').localeCompare(b.fecha || '');
  const pa = a.codigo === 500 ? 0 : 1;
  const pb = b.codigo === 500 ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return (a.creado || '').localeCompare(b.creado || '');
};
const cajaOrdenada = [...insCaja].map((m, i) => ({ ...m, origen: m.origen || 'excel', creado: `${m.fecha}T${String(20 + i).padStart(2, '0')}:00:00` })).sort(compararCronologico);
const ventasListas = insVentas.map((v, i) => ({ ...v, origen: v.origen || 'excel', usuario: 'admin@glamours.com', creado: `${v.fecha}T${String(10 + (i % 45)).padStart(2, '0')}:00:00` }));
if (cajaOrdenada.length) await insertar('caja', cajaOrdenada);
if (ventasListas.length) await insertar('ventas', ventasListas);

// 5) Recalculo cronologico completo v7 (identico a _recalculateFromScratch)
const aplicar = (saldos, cat, codigo, monto) => {
  const anterior = saldos[cat];
  let nuevo;
  if (codigo === 500) nuevo = monto;
  else if (codigo === 501) nuevo = anterior - monto;
  else if (codigo === 502) nuevo = anterior + monto;
  else nuevo = anterior;
  return { anterior, nuevo };
};
const all = (await leer('caja')).sort(compararCronologico);
const saldos = { Blanco: 0, Negro: 0 };
let batch = writeBatch(db);
let fixes = 0;
for (let j = 0; j < all.length; j++) {
  const m = all[j];
  const cat = m.categoria || 'Blanco';
  const { anterior, nuevo } = aplicar(saldos, cat, m.codigo, m.monto);
  saldos[cat] = nuevo;
  if (m.saldo_anterior !== anterior || m.saldo_nuevo !== nuevo) {
    batch.update(doc(db, 'caja', m.id), { saldo_anterior: anterior, saldo_nuevo: nuevo });
    fixes++;
    if (fixes % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
}
if (fixes % 400 !== 0) await batch.commit();
const eb = writeBatch(db);
eb.set(doc(db, 'estado', 'caja'), { saldo_blanco: saldos.Blanco, saldo_negro: saldos.Negro, _version: 7, actualizado: new Date().toISOString() }, { merge: true });
await eb.commit();

const fechas = [...new Set(all.map((m) => m.fecha))].sort();
console.log(`\nRECARGA COMPLETA:`);
console.log(`  Caja total en emulador: ${all.length} (${fixes} con saldo corregido)`);
console.log(`  Rango de fechas: ${fechas[0]} -> ${fechas[fechas.length - 1]} (${fechas.length} dias)`);
console.log(`  Ventas totales: ${(await leer('ventas')).length}`);
console.log(`  SALDO FINAL v7: Blanco=${saldos.Blanco} Negro=${saldos.Negro}`);
process.exit(0);
