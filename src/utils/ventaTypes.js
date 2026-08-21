// ============================================================
//  GLAMOUR'S - Clasificacion unificada de tipos de venta
//  Misma logica en Dashboard, Ventas y Reportes.
//  No cambiar sin revisar los tres modulos.
// ============================================================

export function classificarVenta(v) {
  const banco = (v.banco || '').toLowerCase();
  const tipo = (v.tipo || '').toLowerCase();
  if (tipo.includes('transferencia') || banco.startsWith('qr') || banco.includes('mercadopago') || banco.includes('mpago')) return 'transferencia';
  if (banco.includes('debito') || banco.includes('electron') || banco.includes('maestro') || banco.includes('cad')) return 'debito';
  const medio = (v.medio_pago || '').toLowerCase();
  if (medio === 'tarjeta' || medio === 'electrónico') return 'tarjeta_credito';
  if (v.categoria === 'Negro') return 'negro';
  return 'blanco';
}

export const VENTA_TYPES = ['blanco', 'negro', 'tarjeta_credito', 'debito', 'transferencia'];

export const VENTA_TYPE_CFG = {
  blanco:          { label: 'Efectivo Blanco',  color: '#e2e8f0', accent: '#cbd5e1', icon: '💵', desc: 'Declarado',                  gradient: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' },
  negro:           { label: 'Efectivo Negro',   color: '#c4b5fd', accent: '#a78bfa', icon: '🖤', desc: 'No declarado',               gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' },
  tarjeta_credito: { label: 'Tarjeta Crédito',  color: '#fbbf24', accent: '#f59e0b', icon: '💳', desc: 'Visa / Mastercard',          gradient: 'linear-gradient(135deg, #422006 0%, #78350f 100%)' },
  debito:          { label: 'Débito',           color: '#60a5fa', accent: '#3b82f6', icon: '🏦', desc: 'Cabal / Electron / Maestro', gradient: 'linear-gradient(135deg, #172554 0%, #1e3a5f 100%)' },
  transferencia:   { label: 'Transferencia QR', color: '#34d399', accent: '#10b981', icon: '📱', desc: 'QR / MercadoPago',           gradient: 'linear-gradient(135deg, #022c22 0%, #064e3b 100%)' },
};

export const VENTA_BADGES = {
  blanco:          ['Blanco',  'rgba(209,213,219,0.12)', '#e2e8f0'],
  negro:           ['Negro',   'rgba(129,140,248,0.12)', '#a78bfa'],
  tarjeta_credito: ['Tarjeta', 'rgba(251,191,36,0.12)',  '#fbbf24'],
  debito:          ['Débito',  'rgba(96,165,250,0.12)',  '#60a5fa'],
  transferencia:   ['QR',      'rgba(52,211,153,0.12)',  '#34d399'],
};

// Colores para graficos chart.js (orden = VENTA_TYPES)
export const VENTA_CHART_COLORS = ['#e2e8f0', '#818cf8', '#fbbf24', '#3b82f6', '#34d399'];

export function totalesPorTipo(lista) {
  const t = { blanco: 0, negro: 0, tarjeta_credito: 0, debito: 0, transferencia: 0 };
  lista.forEach((v) => { t[classificarVenta(v)] += v.monto || 0; });
  return t;
}
