import * as XLSX from 'xlsx';

// Parser del Excel de LUXCAR (cumpleaños / día del niño / navidad).
// Replica la lógica de cumple/Cumples.html pero tolerante con los encabezados.
// Hojas esperadas: CUMPLES (Cunpleaños/FechaCUMPLE/Estado), DIA DEL ÑINO (Nombre/Fecha), NAVIDAD (Nombre/Fecha)

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]+/g, '');
}

function findCol(row, candidates) {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const c = normKey(cand);
    const exact = keys.find((k) => normKey(k) === c);
    if (exact !== undefined) return row[exact];
  }
  for (const cand of candidates) {
    const c = normKey(cand);
    const parcial = keys.find((k) => normKey(k).includes(c));
    if (parcial !== undefined) return row[parcial];
  }
  return undefined;
}

export function excelSerialToDate(serial) {
  // Número serial de Excel: días desde 1900-01-00
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

// Devuelve { dia, mes } (mes 0-11) o null si no se puede interpretar.
// Acepta: serial de Excel, Date de xlsx (cellDates), "yyyy-mm-dd [hh:mm:ss]", "dd/mm/yyyy", "dd/mm"
export function parseFechaCumple(valor) {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return { dia: valor.getDate(), mes: valor.getMonth() };
  }
  const s = String(valor).trim();
  if (!s) return null;

  if (!isNaN(s)) {
    const d = excelSerialToDate(parseFloat(s));
    if (!isNaN(d.getTime())) return { dia: d.getDate(), mes: d.getMonth() };
    return null;
  }

  let d = null;
  if (s.includes('-')) {
    const p = s.split(' ')[0].split('-');
    if (p.length >= 3) d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  } else if (s.includes('/')) {
    const p = s.split('/');
    if (p.length >= 3) d = new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
    else {
      const dia = parseInt(p[0], 10);
      const mes = parseInt(p[1], 10) - 1;
      if (!isNaN(dia) && !isNaN(mes) && mes >= 0 && mes <= 11) return { dia, mes };
      return null;
    }
  }
  if (!d || isNaN(d.getTime())) return null;
  return { dia: d.getDate(), mes: d.getMonth() };
}

function parseEstado(valor) {
  // 1 = Activo, cualquier otra cosa = A confirmar. Si la columna no existe, asumimos activo.
  if (valor == null || valor === '') return 1;
  const n = Number(valor);
  if (!isNaN(n)) return n === 1 ? 1 : 2;
  return String(valor).toLowerCase().includes('activ') ? 1 : 2;
}

function findSheet(wb, keywords) {
  const name = wb.SheetNames.find((n) => {
    const k = normKey(n);
    return keywords.some((kw) => k.includes(kw));
  });
  return name ? wb.Sheets[name] : null;
}

function sheetRows(sheet) {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

// Parsea el ArrayBuffer del Excel y devuelve { cumples, nino, navidad, hojas }.
// cumples: [{ nombre, dia, mes, estado }]
// nino/navidad: [{ nombre, fecha }]
export function parseLuxcarWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  const hojaCumples = findSheet(wb, ['cumple']);
  const hojaNino = findSheet(wb, ['nino']);
  const hojaNavidad = findSheet(wb, ['navidad']);

  const cumples = [];
  const filasCumple = sheetRows(hojaCumples);
  for (const item of filasCumple) {
    const nombre = String(findCol(item, ['Cunpleaños', 'Cumpleaños', 'Nombre']) || '').trim();
    if (!nombre) continue;
    const fecha = parseFechaCumple(findCol(item, ['FechaCUMPLE', 'Fecha Cumple', 'Fecha']));
    if (!fecha) continue;
    cumples.push({
      nombre,
      dia: fecha.dia,
      mes: fecha.mes,
      estado: parseEstado(findCol(item, ['Estado'])),
    });
  }

  const mapSimple = (sheet) => {
    const out = [];
    for (const item of sheetRows(sheet)) {
      const nombre = String(findCol(item, ['Nombre']) || '').trim();
      if (!nombre) continue;
      const rawFecha = findCol(item, ['Fecha']);
      const fecha = rawFecha instanceof Date && !isNaN(rawFecha.getTime())
        ? `${String(rawFecha.getDate()).padStart(2, '0')}/${String(rawFecha.getMonth() + 1).padStart(2, '0')}`
        : String(rawFecha || '').trim();
      out.push({ nombre, fecha });
    }
    return out;
  };

  return {
    cumples,
    nino: mapSimple(hojaNino),
    navidad: mapSimple(hojaNavidad),
    hojas: {
      cumples: !!hojaCumples,
      nino: !!hojaNino,
      navidad: !!hojaNavidad,
    },
  };
}

export const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Días que faltan para el próximo cumpleaños (0 = hoy)
export function diasParaCumple(mes, dia, hoy = new Date()) {
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let next = new Date(hoy.getFullYear(), mes, dia);
  if (next < hoy0) next = new Date(hoy.getFullYear() + 1, mes, dia);
  return Math.round((next - hoy0) / (1000 * 60 * 60 * 24));
}
