import * as XLSX from 'xlsx';

const TARJETAS_MAP = {
  'vi': 'Visa',
  'visa': 'Visa',
  'ma': 'Mastercard',
  'mastercard': 'Mastercard',
  'am': 'Amex',
  'amex': 'Amex',
  'ca': 'Cabal',
  'cabal': 'Cabal',
  'na': 'Naranja',
  'naranja': 'Naranja',
  'mp': 'Mendoza Plaza Shopping',
  'mpago': 'MercadoPago',
  'el': 'Electron (Debito)',
  'electron': 'Electron (Debito)',
  'qrfra': 'QR Frances',
  'qrpro': 'QR Provincia',
  'qrnac': 'QR Nacion',
  'mae': 'Maestro (Debito)',
  'cad': 'Cabal Debito',
  'ac': 'Alto Check',
  'ag': 'Argencard',
  'az': 'Azul',
  'pl': 'C&APrivateLabel',
  'cf': 'Carta Franca',
  'cfi': 'CIA Financiera',
  'cmr': 'CMR',
  'co': 'Conflina',
  'cr': 'Credencial',
  'ci': 'Credicred',
  'di': 'Diners',
  'dt': 'Data2000',
  'it': 'Ital Cred',
  'kd': 'Kadicard',
  'li': 'Lider',
  'mi': 'Mira',
  'ms': 'Musimundo',
  'ne': 'Nevada',
  'nep': 'Nevada Plan',
  'nt': 'Nativa',
  'pr': 'Provencred',
  'ts': 'Tarjeta Shopping',
  'cht': 'Cheque de Terceros',
  'cp': 'Cheque Propio',
  'ch': 'Cheques',
  'c': 'Cuenta Corriente',
  'ajcup': 'Ajuste de Cupon',
};

const TIPO_NORMALIZER = {
  'efectivo': 'Efectivo',
  'efect': 'Efectivo',
  'efect ': 'Efectivo',
  'efecto': 'Efectivo',
  'moneda local': 'Moneda Local',
  'moneda local 1': 'Moneda Local 1',
  'tarjeta de crédito / débito': 'Tarjeta de Crédito / Débito',
  'pago electrónico': 'Pago Electrónico',
  'electron': 'Pago Electrónico',
  'pesos': 'Moneda Local',
  'tranferencia': 'Transferencia',
  'transferencia': 'Transferencia',
  'cheque': 'Cheque',
  'cc': 'Cuenta Corriente',
  'cupon': 'Cupon',
};

function normalizeColumn(col) {
  const lower = col.toLowerCase().trim();
  if (lower === 'descripcion') return 'Descripcion';
  if (lower === 'descripción') return 'Descripcion';
  if (lower === 'descripcion_original') return 'Descripcion_original';
  if (lower === 'descripción original') return 'Descripcion_original';
  if (lower === 'cuotas') return 'Cuotas';
  if (lower === 'monto') return 'Monto';
  if (lower === 'valor') return 'Valor';
  if (lower === 'tipo') return 'Tipo';
  if (lower === 'fecha') return 'Fecha';
  if (lower === 'orden') return 'Orden';
  return col;
}

function normalizeRow(row) {
  const normalized = {};
  Object.entries(row).forEach(([key, val]) => {
    normalized[normalizeColumn(key)] = val;
  });
  return normalized;
}

function excelDateToJS(serial) {
  if (typeof serial === 'string' && serial.includes('/')) {
    const parts = serial.split('/');
    if (parts.length === 3) {
      let [p1, p2, p3] = parts;
      p1 = parseInt(p1); p2 = parseInt(p2); p3 = parseInt(p3);
      if (p1 > 12 && p2 <= 12 && p3 <= 12) {
        if (p3 < 100) p3 += 2000;
        return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      }
      if (p3 > 12 && p2 <= 12 && p1 <= 12) {
        if (p3 < 100) p3 += 2000;
        return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      }
      if (p1 <= 12 && p2 <= 12 && p3 > 31) {
        return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      }
      let [d, m, y] = parts;
      d = parseInt(d); m = parseInt(m); y = parseInt(y);
      if (y < 100) y += 2000;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  if (typeof serial === 'number' && serial > 30000 && serial < 60000) {
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + serial * 86400000);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof serial === 'string' && serial.includes('-')) {
    return serial;
  }

  return null;
}

function parseMonto(val) {
  if (val === '' || val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;

  let str = String(val).trim();
  if (!str || str === '') return 0;

  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      str = str.replace(/\./g, '');
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function parseCuotas(val) {
  if (val === '' || val === null || val === undefined) return 1;
  const num = parseInt(val);
  return isNaN(num) || num < 1 ? 1 : num;
}

function normalizeTipo(tipo) {
  if (!tipo) return '';
  const key = String(tipo).toLowerCase().trim();
  return TIPO_NORMALIZER[key] || tipo;
}

function getBankFromValor(valor) {
  if (!valor) return null;
  const key = String(valor).toLowerCase().trim();
  if (TARJETAS_MAP[key]) return TARJETAS_MAP[key];
  return String(valor);
}

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        resolve({ data: json, sheetName, fileName: file.name });
      } catch (err) {
        reject(new Error(`Error al leer ${file.name}: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

export function identifyFileType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.includes('.caja.') || lower.endsWith('_caja.xlsx')) return 'caja';
  if (lower.includes('caja')) return 'caja';
  if (lower.includes('ventas') || lower.includes('venta')) return 'ventas';
  return 'desconocido';
}

export function extractDateFromFilename(fileName) {
  const base = fileName.replace(/\.xlsx?$/i, '');

  const m1 = base.match(/(\d{6})_(?:Caja|Ventas)/i);
  if (m1) {
    const s = m1[1];
    return `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
  }

  const m2 = base.match(/ventas(\d{2})\.(\d{2})\.(\d{2})/i);
  if (m2) {
    const [, dd, mm, yy] = m2;
    return `20${yy}-${mm}-${dd}`;
  }

  return null;
}

export function identifyFileTypeAndDateFromContent(data, fileName) {
  if (!data || data.length === 0) return { type: 'desconocido', date: null };

  const normalized = data.map(normalizeRow);
  const hasEfectivo = normalized.some((r) => r.Tipo === 'Efectivo' || r.Tipo === 'Efect');
  const hasMonedaLocal = normalized.some((r) => r.Tipo?.startsWith('Moneda Local'));
  const hasTarjeta = normalized.some((r) => r.Tipo?.includes('Tarjeta'));

  const firstDate = normalized[0]?.Fecha;
  const date = excelDateToJS(firstDate);

  const typeFromFile = identifyFileType(fileName);

  if (typeFromFile === 'caja') return { type: 'caja', date };

  if (typeFromFile === 'ventas') return { type: 'ventas', date };

  const hasValor500 = normalized.some((r) => parseInt(r.Valor) === 500);
  const hasValor501 = normalized.some((r) => parseInt(r.Valor) === 501);
  const hasValor502 = normalized.some((r) => parseInt(r.Valor) === 502);
  const hasValor503 = normalized.some((r) => parseInt(r.Valor) === 503);

  if (hasValor500 || hasValor501 || hasValor502 || hasValor503) {
    return { type: 'caja', date };
  }

  if (hasMonedaLocal || hasTarjeta || hasEfectivo) {
    const esSoloEfectivo = normalized.every((r) => r.Tipo === 'Efectivo' || !r.Tipo);
    if (esSoloEfectivo && normalized.every((r) => parseInt(r.Valor) >= 500)) {
      return { type: 'caja', date };
    }
  }

  return { type: 'ventas', date };
}

export function classifyRow(row) {
  const tipo = normalizeTipo(row.Tipo);
  const valor = String(row.Valor || '').toLowerCase().trim();

  if (tipo === 'Efectivo' || tipo === 'Efect') {
    const numValor = parseInt(row.Valor);
    if (numValor >= 500 && numValor <= 503) return 'caja';
    if (row.Valor === '' || row.Valor === null) return 'caja';
  }

  if (['Moneda Local', 'Moneda Local 1', 'Tarjeta de Crédito / Débito', 'Pago Electrónico', 'Transferencia', 'Cheque', 'Cuenta Corriente', 'Cupon'].includes(tipo)) {
    return 'ventas';
  }

  const numValor = parseInt(row.Valor);
  if (numValor >= 500 && numValor <= 503) return 'caja';
  if (numValor === 0 || numValor === 2) return 'ventas';
  if (TARJETAS_MAP[valor]) return 'ventas';

  if (tipo && tipo.length > 0) return 'ventas';

  return 'desconocido';
}

export function processData(data, expectedType, fileDate) {
  const normalized = data.map(normalizeRow);
  const results = { caja: [], ventas: [], skipped: 0, skippedRows: [], errors: [] };

  normalized.forEach((row, idx) => {
    try {
      const rowType = expectedType || classifyRow(row);
      const fecha = excelDateToJS(row.Fecha) || fileDate;

      if (!fecha) {
        const reason = 'Sin fecha valida';
        results.errors.push(`Fila ${idx + 1}: ${reason}`);
        results.skippedRows.push({ fila: idx + 1, fecha: row.Fecha || '', tipo: row.Tipo || '', valor: String(row.Valor || ''), monto: row.Monto || '', descripcion: row.Descripcion || row['Descripcion_original'] || '', motivo: reason });
        results.skipped++;
        return;
      }

      if (rowType === 'caja') {
        const codigo = parseInt(row.Valor);
        if (isNaN(codigo) || codigo < 500 || codigo > 503) {
          results.skippedRows.push({ fila: idx + 1, fecha, tipo: row.Tipo || '', valor: String(row.Valor || ''), monto: row.Monto || '', descripcion: row.Descripcion || row['Descripcion_original'] || '', motivo: `Codigo ${row.Valor} no es caja (500-503)` });
          results.skipped++;
          return;
        }
        const monto = parseMonto(row.Monto);

        const tipoMap = { 500: 'En caja', 501: 'Egreso en Caja', 502: 'Ingreso en Caja', 503: 'Retiro de Caja' };

        results.caja.push({
          fecha,
          tipo: tipoMap[codigo],
          codigo,
          categoria: 'Blanco',
          descripcion: row.Descripcion || tipoMap[codigo],
          monto: Math.abs(monto),
          origen: 'excel',
        });
      } else if (rowType === 'ventas') {
        const tipo = normalizeTipo(row.Tipo);
        const valor = String(row.Valor || '').toLowerCase().trim();
        const cuotas = parseCuotas(row.Cuotas);
        const monto = parseMonto(row.Monto);

        let categoria, medio_pago, banco;

        if (tipo === 'Moneda Local') {
          categoria = 'Blanco';
          medio_pago = 'Efectivo';
          banco = null;
        } else if (tipo === 'Moneda Local 1') {
          categoria = 'Negro';
          medio_pago = 'Efectivo';
          banco = null;
        } else if (tipo.includes('Tarjeta') || tipo === 'Pago Electrónico') {
          const bankCandidate = getBankFromValor(row.Valor);
          if (['0', '2'].includes(valor) || (!bankCandidate && !row.Descripcion && !TARJETAS_MAP[valor])) {
            categoria = valor === '0' ? 'Blanco' : 'Negro';
            medio_pago = 'Efectivo';
            banco = null;
          } else {
            medio_pago = 'Tarjeta';
            banco = bankCandidate || row.Descripcion || 'Otra';
            categoria = null;
            if (tipo === 'Pago Electrónico') {
              medio_pago = 'Electrónico';
            }
          }
        } else if (tipo === 'Transferencia') {
          const bankCandidate = getBankFromValor(row.Valor);
          medio_pago = 'Transferencia';
          banco = bankCandidate || row.Descripcion || 'Otra';
          categoria = null;
        } else if (tipo === 'Cheque') {
          medio_pago = 'Cheque';
          banco = row.Descripcion || 'Cheque';
          categoria = null;
        } else if (tipo === 'Cuenta Corriente') {
          medio_pago = 'Cuenta Corriente';
          banco = row.Descripcion || 'CC';
          categoria = null;
        } else if (tipo === 'Cupon') {
          medio_pago = 'Cupon';
          banco = row.Descripcion || 'Cupon';
          categoria = null;
        } else {
          if (['0', '2'].includes(valor)) {
            categoria = valor === '0' ? 'Blanco' : 'Negro';
            medio_pago = 'Efectivo';
            banco = null;
          } else if (TARJETAS_MAP[valor]) {
            medio_pago = 'Tarjeta';
            banco = TARJETAS_MAP[valor];
            categoria = null;
          } else {
            medio_pago = 'Efectivo';
            categoria = 'Blanco';
            banco = null;
          }
        }

        results.ventas.push({
          fecha,
          tipo: medio_pago === 'Efectivo' ? (categoria === 'Blanco' ? 'Moneda Local' : 'Moneda Local 1') : tipo || 'Tarjeta de Crédito / Débito',
          categoria,
          medio_pago,
          banco,
          cuotas,
          monto: Math.abs(monto),
          descripcion: row.Descripcion || `${categoria || banco || tipo}`,
          origen: 'excel',
        });
      } else {
        results.skippedRows.push({ fila: idx + 1, fecha, tipo: row.Tipo || '', valor: String(row.Valor || ''), monto: row.Monto || '', descripcion: row.Descripcion || row['Descripcion_original'] || '', motivo: `Tipo "${rowType}" no reconocido (Tipo="${row.Tipo}", Valor="${row.Valor}")` });
        results.skipped++;
      }
    } catch (err) {
      results.errors.push(`Fila ${idx + 1}: ${err.message}`);
      results.skippedRows.push({ fila: idx + 1, fecha: row?.Fecha || '', tipo: row?.Tipo || '', valor: String(row?.Valor || ''), monto: row?.Monto || '', descripcion: row?.Descripcion || '', motivo: err.message });
      results.skipped++;
    }
  });

  return results;
}

export function validateExcelStructure(data) {
  if (!data || data.length === 0) {
    return { valid: false, error: 'El archivo esta vacio' };
  }

  const sample = data[0];
  const columns = Object.keys(sample);
  const normalizedCols = columns.map(normalizeColumn);

  const required = ['Fecha', 'Tipo', 'Valor', 'Monto'];
  for (const col of required) {
    if (!normalizedCols.includes(col)) {
      return {
        valid: false,
        error: `Falta columna: "${col}". Encontradas: ${columns.join(', ')}`,
      };
    }
  }

  return { valid: true, rowCount: data.length, columns };
}
