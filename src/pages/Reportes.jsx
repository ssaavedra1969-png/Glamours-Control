import { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js';
import { Doughnut, Line, Bar } from 'react-chartjs-2';
import { Download, BarChart3, TrendingUp, Award, Calendar, Clock, X, Filter, Database } from 'lucide-react';
import { format } from 'date-fns';
import mockDB from '../services/firestoreDB';
import { formatCurrency } from '../utils/formatCurrency';
import { today, defaultDateFrom } from '../utils/dateUtils';
import { exportToCSV, exportToExcel, exportToPDF } from '../utils/exportUtils';
import DateFilter from '../components/DateFilter';
import { classificarVenta, VENTA_TYPES, VENTA_TYPE_CFG, VENTA_CHART_COLORS, totalesPorTipo } from '../utils/ventaTypes';
import toast from 'react-hot-toast';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend, Filler);

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DEFAULT_FROM = defaultDateFrom();

const TIPO_LINE_COLOR = { blanco: '#9ca3af', negro: '#818cf8', tarjeta_credito: '#fbbf24', debito: '#3b82f6', transferencia: '#34d399' };
const TIPO_RGB = { blanco: '226,232,240', negro: '129,140,248', tarjeta_credito: '251,191,36', debito: '59,130,246', transferencia: '52,211,153' };
const TIPO_LABEL_CORTO = { blanco: 'Blanco', negro: 'Negro', tarjeta_credito: 'Tarjeta Créd.', debito: 'Débito', transferencia: 'Transf. QR' };
const TIPO_CHIP = { blanco: ['B:', '#e2e8f0'], negro: ['N:', '#818cf8'], tarjeta_credito: ['TC:', '#fbbf24'], debito: ['D:', '#60a5fa'], transferencia: ['QR:', '#34d399'] };

// ---- Estetica moderna de graficos ----
const formatCompact = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(1).replace('.', ',') + 'B';
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1).replace('.', ',') + 'M';
  if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + n;
};

const fillDown = (rgb, strong = 0.35) => (context) => {
  const { ctx, chartArea } = context.chart;
  if (!chartArea) return `rgba(${rgb},0.08)`;
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, `rgba(${rgb},${strong})`);
  g.addColorStop(0.65, `rgba(${rgb},${(strong * 0.35).toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  return g;
};

const barGrad = (rgb) => (context) => {
  const { ctx, chartArea } = context.chart;
  if (!chartArea) return `rgba(${rgb},0.7)`;
  const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  g.addColorStop(0, `rgba(${rgb},0.15)`);
  g.addColorStop(1, `rgba(${rgb},0.95)`);
  return g;
};

const LEGEND = { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, color: '#9ca3af', font: { size: 11 } } };

const TOOLTIP = {
  backgroundColor: 'rgba(12,12,22,0.94)',
  borderColor: 'rgba(212,175,55,0.35)',
  borderWidth: 1,
  titleColor: '#f3f4f6',
  bodyColor: '#d1d5db',
  titleFont: { weight: '700' },
  padding: 12,
  cornerRadius: 10,
  displayColors: true,
  usePointStyle: true,
  boxPadding: 4,
};

const moneyTip = { ...TOOLTIP, callbacks: { label: (c) => ` ${c.dataset.label}: ${formatCurrency(c.parsed.y ?? c.parsed)}` } };

// Plugin: total en el centro del doughnut
const centerTotalPlugin = {
  id: 'centerTotal',
  afterDraw(chart) {
    const cfg = chart.options.plugins.centerTotal;
    if (!cfg || !cfg.total) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta.data.length) return;
    const { x, y } = meta.data[0];
    const ctx = chart.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6b7280';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillText('TOTAL DEL PERIODO', x, y - 13);
    ctx.fillStyle = '#d4af37';
    ctx.font = '800 21px Inter, sans-serif';
    ctx.fillText(formatCompact(cfg.total), x, y + 9);
    ctx.restore();
  },
};

export default function Reportes() {
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(DEFAULT_FROM);
  const [dateTo, setDateTo] = useState(today());
  const [ventas, setVentas] = useState([]);
  const [allVentas, setAllVentas] = useState([]);

  useEffect(() => { loadData(); }, [dateFrom, dateTo]);

  // Historico completo con cache de sesion (10 min): evita releer ~2.700 ventas en cada visita
  useEffect(() => {
    const KEY = 'gl_reportes_ventas';
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const { t, data } = JSON.parse(raw);
        if (Date.now() - t < 10 * 60 * 1000 && Array.isArray(data)) { setAllVentas(data); return; }
      }
    } catch {}
    mockDB.getVentas().then((data) => {
      setAllVentas(data);
      try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), data })); } catch {}
    }).catch(() => {});
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const v = await mockDB.getVentas(dateFrom, dateTo);
      setVentas(v);
    } catch {} finally { setLoading(false); }
  };

  const hasActiveFilter = dateFrom !== DEFAULT_FROM || dateTo !== today();

  const clearFilters = () => {
    setDateFrom(DEFAULT_FROM);
    setDateTo(today());
  };

  // Totales por los 5 tipos (misma clasificacion que Dashboard y Ventas)
  const tot = totalesPorTipo(ventas);
  const totalVentas = VENTA_TYPES.reduce((s, t) => s + tot[t], 0);

  const daysInRange = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = format(d, 'yyyy-MM-dd');
    const dayVentas = ventas.filter((v) => v.fecha === dateStr);
    daysInRange.push({ date: dateStr, label: format(d, 'dd/MM'), total: dayVentas.reduce((s, v) => s + v.monto, 0), ...totalesPorTipo(dayVentas) });
  }

  // Ranking de medios de pago electronicos (tarjeta + debito + QR) por banco
  const mediosMap = {};
  ventas.filter((v) => ['tarjeta_credito', 'debito', 'transferencia'].includes(classificarVenta(v))).forEach((v) => {
    const key = v.banco || 'Otro';
    mediosMap[key] = (mediosMap[key] || 0) + v.monto;
  });
  const mediosRanking = Object.entries(mediosMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const monthlyMap = {};
  allVentas.forEach((v) => {
    const ym = (v.fecha || '').slice(0, 7);
    if (!ym) return;
    if (!monthlyMap[ym]) monthlyMap[ym] = { total: 0, blanco: 0, negro: 0, tarjeta_credito: 0, debito: 0, transferencia: 0 };
    monthlyMap[ym].total += v.monto;
    monthlyMap[ym][classificarVenta(v)] += v.monto;
  });
  const monthlySorted = Object.entries(monthlyMap).sort((a, b) => a[0].localeCompare(b[0]));
  const monthly12 = monthlySorted.slice(-12);

  const yearlyMap = {};
  allVentas.forEach((v) => {
    const y = (v.fecha || '').slice(0, 4);
    if (!y) return;
    if (!yearlyMap[y]) yearlyMap[y] = { total: 0, blanco: 0, negro: 0, tarjeta_credito: 0, debito: 0, transferencia: 0 };
    yearlyMap[y].total += v.monto;
    yearlyMap[y][classificarVenta(v)] += v.monto;
  });
  const yearlySorted = Object.entries(yearlyMap).sort((a, b) => a[0].localeCompare(b[0]));

  const handleExport = (type) => {
    const data = ventas.map((v) => ({ Fecha: v.fecha, Tipo: v.tipo, Categoria: v.categoria || 'Tarjeta', Medio: v.medio_pago, Banco: v.banco || '-', Monto: v.monto }));
    if (type === 'csv') exportToCSV(data, `reporte_ventas_${today()}`);
    else if (type === 'xlsx') exportToExcel(data, `reporte_ventas_${today()}`);
    else if (type === 'pdf') exportToPDF(data, [
      { key: 'Fecha', header: 'Fecha' }, { key: 'Categoria', header: 'Tipo' }, { key: 'Banco', header: 'Banco' },
      { key: 'Monto', header: 'Monto', format: 'currency' },
    ], 'Reporte de Ventas - GLAMOURS', `reporte_ventas_${today()}`);
    toast.success(`Exportado como ${type.toUpperCase()}`);
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  const pctOf = (part, total) => total > 0 ? ((part / total) * 100).toFixed(1) + '%' : '0%';

  const sectionHeaderStyle = { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' };
  const iconBoxStyle = (grad) => ({ width: '36px', height: '36px', borderRadius: '10px', background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center' });
  const chartCardStyle = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '18px',
    padding: '1.5rem',
    boxShadow: '0 16px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)',
    position: 'relative',
    overflow: 'hidden',
  };

  // Card de grafico con profundidad: glow dorado decorativo + sombra proyectada en el trazo
  const ChartCard = ({ title, icon: Icon, children }) => (
    <div style={chartCardStyle}>
      <div style={{ position: 'absolute', top: -50, right: -50, width: 170, height: 170, borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,175,55,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', position: 'relative' }}>
        {Icon && <Icon size={16} color="#d4af37" />}
        <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f3f4f6' }}>{title}</span>
      </div>
      <div style={{ position: 'relative', height: '300px', filter: 'drop-shadow(0 10px 16px rgba(0,0,0,0.45))' }}>{children}</div>
    </div>
  );

  const barDatasets = (entries) => VENTA_TYPES.map((t) => ({
    label: TIPO_LABEL_CORTO[t],
    data: entries.map(([, d]) => d[t]),
    backgroundColor: barGrad(TIPO_RGB[t]),
    borderRadius: 7,
    borderSkipped: false,
    maxBarThickness: 30,
  }));

  const axisCommon = {
    grid: { display: false },
    ticks: { color: '#6b7280', font: { size: 10 } },
    border: { display: false },
  };
  const yAxis = {
    beginAtZero: true,
    grid: { color: 'rgba(255,255,255,0.05)' },
    border: { display: false },
    ticks: { color: '#6b7280', font: { size: 10 }, callback: (v) => formatCompact(v) },
  };
  const lineCommon = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: LEGEND, tooltip: moneyTip },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ===== HEADER + FILTROS ===== */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #d4af37 0%, #b8960c 100%)', boxShadow: '0 8px 20px rgba(212,175,55,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart3 size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Reportes y Estadisticas</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
              Periodo: {dateFrom} al {dateTo} | {ventas.length} ventas
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, flexWrap: 'wrap' }}>
            <Filter size={14} color="#d4af37" />
            <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
            {hasActiveFilter && (
              <button className="btn btn-outline btn-sm" onClick={clearFilters} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderColor: '#ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}>
                <X size={12} /> Limpiar Filtros
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-outline btn-sm" onClick={() => handleExport('xlsx')}><Download size={14} /> Excel</button>
            <button className="btn btn-outline btn-sm" onClick={() => handleExport('pdf')}><Download size={14} /> PDF</button>
            <button className="btn btn-outline btn-sm" onClick={() => handleExport('csv')}><Download size={14} /> CSV</button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECCION: RESULTADOS DEL PERIODO                              */}
      {/* ============================================================ */}
      <section>
        <div style={sectionHeaderStyle}>
          <div style={iconBoxStyle('linear-gradient(135deg, #d4af37 0%, #b8960c 100%)')}>
            <TrendingUp size={18} color="#fff" />
          </div>
          <span style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text, #f3f4f6)' }}>Resultados del Periodo</span>
          {hasActiveFilter && (
            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#f97316', background: 'rgba(249,115,22,0.12)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>FILTRADO</span>
          )}
        </div>

        {/* HERO */}
        <div style={{ background: 'linear-gradient(135deg, #854d0e 0%, #a16207 40%, #ca8a04 100%)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '16px', padding: '1.75rem 2rem', position: 'relative', overflow: 'hidden', marginBottom: '1rem', boxShadow: '0 16px 40px rgba(202,138,4,0.18)' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '9rem', opacity: 0.06, fontWeight: '900', lineHeight: '1' }}>$</div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Total Ventas del Periodo</div>
          <div style={{ fontSize: '3.5rem', fontWeight: '900', color: '#fff', lineHeight: '1', letterSpacing: '-0.02em', textShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>{formatCurrency(totalVentas)}</div>
        </div>

        {/* KPIs POR TIPO (5 tipos, igual que Dashboard y Ventas) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {VENTA_TYPES.map((t) => {
            const cfg = VENTA_TYPE_CFG[t];
            return (
              <div key={t} style={{ background: cfg.gradient, borderRadius: '14px', padding: '1.25rem', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 10px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.85rem', color: cfg.color }}>{cfg.icon} {cfg.label}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#6b7280', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>{pctOf(tot[t], totalVentas)}</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>{formatCurrency(tot[t])}</div>
                <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.35rem' }}>{cfg.desc}</div>
              </div>
            );
          })}
        </div>

        {/* GRAFICOS DEL PERIODO */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <ChartCard title="Tendencia Diaria de Ventas" icon={TrendingUp}>
            <Line data={{
              labels: daysInRange.map((d) => d.label),
              datasets: [
                { label: 'Total', data: daysInRange.map((d) => d.total), borderColor: '#d4af37', backgroundColor: fillDown('212,175,55'), fill: true, tension: 0.45, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#fff', pointHoverBorderColor: '#d4af37', pointHoverBorderWidth: 2, borderWidth: 2.5 },
                ...VENTA_TYPES.map((t) => ({ label: TIPO_LABEL_CORTO[t], data: daysInRange.map((d) => d[t]), borderColor: TIPO_LINE_COLOR[t], backgroundColor: 'transparent', borderDash: [6, 5], tension: 0.45, pointRadius: 0, pointHoverRadius: 4, borderWidth: 1.5 })),
              ],
            }} options={{
              ...lineCommon,
              scales: { x: axisCommon, y: yAxis },
            }} />
          </ChartCard>

          <ChartCard title="Distribucion" icon={BarChart3}>
            <Doughnut data={{
              labels: VENTA_TYPES.map((t) => VENTA_TYPE_CFG[t].label),
              datasets: [{ data: VENTA_TYPES.map((t) => tot[t]), backgroundColor: VENTA_CHART_COLORS, borderWidth: 0, borderRadius: 6, spacing: 3, hoverOffset: 14 }],
            }} options={{
              responsive: true, maintainAspectRatio: false,
              cutout: '68%',
              plugins: { legend: LEGEND, tooltip: moneyTip, centerTotal: { total: totalVentas } },
            }} plugins={[centerTotalPlugin]} />
          </ChartCard>
        </div>

        {/* RANKING MEDIOS DE PAGO ELECTRONICOS - FILTRADO */}
        <div style={{ marginTop: '1rem' }}>
          <div style={chartCardStyle}>
            <div style={{ position: 'absolute', top: -50, right: -50, width: 170, height: 170, borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,175,55,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', position: 'relative' }}>
              <Award size={16} color="#d4af37" />
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f3f4f6' }}>Ranking Medios de Pago Electronicos</span>
            </div>
            {mediosRanking.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', position: 'relative' }}>
                {mediosRanking.map(([name, amount], i) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.75rem', background: i === 0 ? 'linear-gradient(135deg, #d4af37, #b8960c)' : 'rgba(255,255,255,0.05)', color: i === 0 ? '#fff' : '#6b7280', boxShadow: i === 0 ? '0 4px 12px rgba(212,175,55,0.35)' : 'none' }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#d1d5db', fontWeight: '500' }}>{name}</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#fbbf24' }}>{formatCurrency(amount)}</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: (amount / mediosRanking[0][1] * 100) + '%', background: 'linear-gradient(90deg, #4338ca, #d4af37)', borderRadius: '3px', boxShadow: '0 0 8px rgba(212,175,55,0.35)' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280', fontSize: '0.85rem', fontStyle: 'italic', position: 'relative' }}>
                No hay pagos electronicos en el periodo
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== DIVISOR ===== */}
      <div style={{ borderTop: '2px solid rgba(212,175,55,0.15)', margin: '0.5rem 0' }} />

      {/* ============================================================ */}
      {/* SECCION: HISTORICO COMPLETO (FIJO - NO USA FILTROS)         */}
      {/* ============================================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={iconBoxStyle('linear-gradient(135deg, #065f46 0%, #047857 100%)')}>
            <Database size={18} color="#6ee7b7" />
          </div>
          <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#6ee7b7' }}>Historico Completo</span>
          <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#6b7280', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>SIN FILTROS</span>
        </div>

        {/* TENDENCIA MENSUAL */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={sectionHeaderStyle}>
            <div style={iconBoxStyle('linear-gradient(135deg, #065f46 0%, #047857 100%)')}>
              <Calendar size={18} color="#6ee7b7" />
            </div>
            <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text, #f3f4f6)' }}>Tendencia Mensual</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <ChartCard title="Ventas por Mes (Ultimos 12 meses)">
              {monthly12.length > 0 ? (
                <Bar data={{
                  labels: monthly12.map(([ym]) => { const [y, m] = ym.split('-'); return `${MONTHS_SHORT[parseInt(m) - 1]} ${y.slice(2)}`; }),
                  datasets: barDatasets(monthly12),
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: LEGEND, tooltip: moneyTip },
                  scales: {
                    x: { ...axisCommon, stacked: true },
                    y: { ...yAxis, stacked: true },
                  },
                }} />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '0.85rem' }}>Sin datos mensuales</div>
              )}
            </ChartCard>

            <ChartCard title="Evolucion Mensual">
              {monthly12.length > 0 ? (
                <Line data={{
                  labels: monthly12.map(([ym]) => { const [y, m] = ym.split('-'); return `${MONTHS_SHORT[parseInt(m) - 1]} ${y.slice(2)}`; }),
                  datasets: [
                    { label: 'Total', data: monthly12.map(([, d]) => d.total), borderColor: '#d4af37', backgroundColor: fillDown('212,175,55', 0.3), fill: true, tension: 0.45, pointRadius: 4, pointBackgroundColor: '#12121f', pointBorderColor: '#d4af37', pointBorderWidth: 2, pointHoverRadius: 6, borderWidth: 2.5 },
                  ],
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { display: false }, tooltip: moneyTip },
                  scales: { x: axisCommon, y: yAxis },
                }} />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '0.85rem' }}>Sin datos</div>
              )}
            </ChartCard>
          </div>

          {monthly12.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
              {monthly12.map(([ym, d]) => {
                const [y, m] = ym.split('-');
                return (
                  <div key={ym} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{MONTHS_SHORT[parseInt(m) - 1]} {y}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#d4af37', marginTop: '0.25rem' }}>{formatCurrency(d.total)}</div>
                    <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem', fontSize: '0.6rem', color: '#6b7280' }}>
                      {VENTA_TYPES.map((t) => (
                        <span key={t} style={{ color: TIPO_CHIP[t][1] }}>{TIPO_CHIP[t][0]} {formatCurrency(d[t])}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* TENDENCIA ANUAL */}
        <div>
          <div style={sectionHeaderStyle}>
            <div style={iconBoxStyle('linear-gradient(135deg, #7e22ce 0%, #9333ea 100%)')}>
              <Clock size={18} color="#e9d5ff" />
            </div>
            <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text, #f3f4f6)' }}>Tendencia Anual</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <ChartCard title="Ventas por Anio">
              {yearlySorted.length > 0 ? (
                <Bar data={{
                  labels: yearlySorted.map(([y]) => y),
                  datasets: barDatasets(yearlySorted),
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: LEGEND, tooltip: moneyTip },
                  scales: {
                    x: { ...axisCommon, stacked: true, ticks: { color: '#6b7280', font: { size: 11 } } },
                    y: { ...yAxis, stacked: true },
                  },
                }} />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '0.85rem' }}>Sin datos anuales</div>
              )}
            </ChartCard>

            <ChartCard title="Evolucion Anual">
              {yearlySorted.length > 0 ? (
                <Line data={{
                  labels: yearlySorted.map(([y]) => y),
                  datasets: [
                    { label: 'Total', data: yearlySorted.map(([, d]) => d.total), borderColor: '#a855f7', backgroundColor: fillDown('168,85,247', 0.3), fill: true, tension: 0.45, pointRadius: 5, pointBackgroundColor: '#12121f', pointBorderColor: '#a855f7', pointBorderWidth: 2, pointHoverRadius: 7, borderWidth: 2.5 },
                  ],
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { display: false }, tooltip: moneyTip },
                  scales: { x: axisCommon, y: yAxis },
                }} />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '0.85rem' }}>Sin datos</div>
              )}
            </ChartCard>
          </div>

          {yearlySorted.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
              {yearlySorted.map(([y, d]) => (
                <div key={y} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.75rem 1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '700' }}>{y}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#d4af37', marginTop: '0.25rem' }}>{formatCurrency(d.total)}</div>
                  <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem', fontSize: '0.6rem', color: '#6b7280' }}>
                    {VENTA_TYPES.map((t) => (
                      <span key={t} style={{ color: TIPO_CHIP[t][1] }}>{TIPO_CHIP[t][0]} {formatCurrency(d[t])}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
