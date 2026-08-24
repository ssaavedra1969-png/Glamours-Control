// valida-entrada.mjs
// Valida el parser y la formula de saldos contra TODOS los Excel reales de ENTRADA/
// Uso: node valida-entrada.mjs
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
const readFileX = (p) => XLSX.read(readFileSync(p), { type: 'buffer' });
import { readdirSync } from 'fs';
import { classifyRow, processData, identifyFileTypeAndDateFromContent, extractDateFromFilename } from './src/utils/excelParser.js';

function aplicar(saldos, cat, codigo, monto) {
  const anterior = saldos[cat];
  let nuevo;
  if (codigo === 500) { nuevo = monto; }
  else { const mult = (codigo === 501 || codigo === 503) ? -1 : 1; nuevo = anterior + monto * mult; }
  saldos[cat] = nuevo;
  return { anterior, nuevo };
}

const dir = './ENTRADA';
const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx'));

console.log('================= 1) CLASIFICACION POR ARCHIVO =================');
const allCaja = [];
const resumen = [];
for (const f of files) {
  try {
    const wb = readFileX(`${dir}/${f}`);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const det = identifyFileTypeAndDateFromContent(rows, f);
    const fechaNombre = extractDateFromFilename(f);
    const res = processData(rows, null, null);
    resumen.push({ f, filas: rows.length, tipo: det.type, fechaContent: det.date, fechaNombre,
      caja: res.caja.length, ventas: res.ventas.length, skipped: res.skipped });
    // acumular caja con creado sintetico estable (fecha + orden de fila)
    res.caja.forEach((m, i) => allCaja.push({ ...m, _f: f, _i: i }));
  } catch (e) {
    resumen.push({ f, error: e.message });
  }
}
for (const r of resumen) {
  if (r.error) { console.log(`ERROR  ${r.f}: ${r.error}`); continue; }
  const flag = r.skipped > 0 ? ' <<< SKIPPED!' : '';
  console.log(`${r.f.padEnd(34)} filas=${String(r.filas).padStart(4)} tipo=${r.tipo.padEnd(6)} fechaNom=${r.fechaNombre || '-'} caja=${String(r.caja).padStart(3)} ventas=${String(r.ventas).padStart(3)} skip=${r.skipped}${flag}`);
}

console.log('\n================= 2) SKIPPED (motivos) =================');
let totalSkip = 0;
for (const f of files) {
  try {
    const wb = readFileX(`${dir}/${f}`);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const res = processData(rows, null, null);
    totalSkip += res.skipped;
    for (const s of res.skippedRows.slice(0, 5)) {
      console.log(`  ${f} fila ${s.fila}: ${s.motivo} | Tipo="${s.tipo}" Valor="${s.valor}" Monto="${s.monto}"`);
    }
  } catch { /* ya reportado */ }
}
if (totalSkip === 0) console.log('  (ninguna fila descartada)');

console.log('\n================= 3) FORMULA DE SALDOS vs EN CAJA (concatenado) =================');
// Usar solo el archivo grande para la validacion dia a dia
const wbBig = readFileX(`${dir}/TEST CONCATENAR_ultimo.xlsx`);
const rowsBig = XLSX.utils.sheet_to_json(wbBig.Sheets[wbBig.SheetNames[0]], { defval: '' });
const big = processData(rowsBig, null, null);
const saldos = { Blanco: 0, Negro: 0 };
// ordenar por fecha (los registros del mismo dia conservan orden del archivo)
big.caja.sort((a, b) => a.fecha.localeCompare(b.fecha));
let cierrePorDia = {};   // fecha -> saldo al cierre
let mismatches = [], okCount = 0, sinPrevio = 0;
for (const m of big.caja) {
  const { nuevo } = aplicar(saldos, m.categoria || 'Blanco', m.codigo, m.monto);
  cierrePorDia[m.fecha] = nuevo;
  if (m.codigo === 500) {
    // El 500 declara el conteo fisico de apertura. Compara contra cierre del dia anterior.
    const fechas = Object.keys(cierrePorDia).filter((x) => x < m.fecha).sort();
    const previa = fechas.length ? cierrePorDia[fechas[fechas.length - 1]] : null;
    if (previa === null) { sinPrevio++; }
    else if (Math.abs(previa - m.monto) > 1) {
      mismatches.push({ fecha: m.fecha, declarado: m.monto, calculado: previa, dif: m.monto - previa });
    } else okCount++;
  }
}
console.log(`Registros caja: ${big.caja.length} | Ventas: ${big.ventas.length}`);
console.log(`Rango fechas caja: ${big.caja[0]?.fecha} .. ${big.caja[big.caja.length - 1]?.fecha}`);
console.log(`\n"En caja"(500) que COINCIDEN con cierre del dia anterior: ${okCount}`);
console.log(`Primeros 500 sin dia previo (inicio historico): ${sinPrevio}`);
console.log(`MISMATCHES: ${mismatches.length}`);
const porFecha = {};
for (const mm of mismatches) {
  const ym = mm.fecha.slice(0, 7);
  porFecha[ym] = porFecha[ym] || [];
  if (porFecha[ym].length < 3) porFecha[ym].push(mm);
}
for (const [ym, lista] of Object.entries(porFecha)) {
  console.log(`  ${ym}: ${mismatches.filter((x) => x.fecha.startsWith(ym)).length} mismatch(es), ej:`);
  for (const mm of lista) console.log(`     ${mm.fecha} declarado=${mm.declarado.toLocaleString()} calculado=${mm.calculado.toLocaleString()} dif=${mm.dif.toLocaleString()}`);
}
console.log(`\nSALDO FINAL Blanco=${saldos.Blanco.toLocaleString('es-ar')} Negro=${saldos.Negro.toLocaleString('es-ar')}`);

console.log('\n================= 4) MUESTRA DE VENTAS PARSEADAS (tipos unicos) =================');
const tiposVentas = {};
for (const v of big.ventas) {
  const key = `${v.tipo} | medio=${v.medio_pago} | banco=${v.banco} | cat=${v.categoria}`;
  tiposVentas[key] = (tiposVentas[key] || 0) + 1;
}
Object.entries(tiposVentas).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));

