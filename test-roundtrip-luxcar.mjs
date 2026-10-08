import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { parseLuxcarWorkbook, descargarBackupLuxcar, nombreBackupLuxcar } from './src/utils/luxcarParser.js';

const archivo = 'Luxcar/LUXCAR_prueba_dev.xlsx';
const buf = readFileSync(archivo);
const original = parseLuxcarWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const nombre = descargarBackupLuxcar({ cumple: original.cumples, nino: original.nino, navidad: original.navidad });
console.log('Backup generado:', nombre);

if (!existsSync(nombre)) { console.error('FAIL: no se generó el archivo'); process.exit(1); }

const bbuf = readFileSync(nombre);
const recargado = parseLuxcarWorkbook(bbuf.buffer.slice(bbuf.byteOffset, bbuf.byteOffset + bbuf.byteLength));

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const okC = eq(original.cumples, recargado.cumples);
const okN = eq(original.nino, recargado.nino);
const okV = eq(original.navidad, recargado.navidad);

console.log('cumples round-trip:', okC ? 'OK' : 'FAIL');
console.log('nino    round-trip:', okN ? 'OK' : 'FAIL');
console.log('navidad round-trip:', okV ? 'OK' : 'FAIL');
if (!okC) { console.log('  orig:', JSON.stringify(original.cumples).slice(0, 300)); console.log('  back:', JSON.stringify(recargado.cumples).slice(0, 300)); }
if (!okN) { console.log('  orig:', JSON.stringify(original.nino)); console.log('  back:', JSON.stringify(recargado.nino)); }
if (!okV) { console.log('  orig:', JSON.stringify(original.navidad)); console.log('  back:', JSON.stringify(recargado.navidad)); }

unlinkSync(nombre);
process.exit(okC && okN && okV ? 0 : 1);
