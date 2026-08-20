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
import toast from 'react-hot-toast';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend, Filler);

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DEFAULT_FROM = defaultDateFrom();

export default function Reportes() {
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(DEFAULT_FROM);
  const [dateTo, setDateTo] = useState(today());
  const [ventas, setVentas] = useState([]);
  const [allVentas, setAllVentas] = useState([]);

  useEffect(() => { loadData(); }, [dateFrom, dateTo]);
  useEffect(() => { mockDB.getVentas().then(setAllVentas).catch(() => {}); }, []);

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

  const totalBlanco = ventas.filter((v) => v.categoria === 'Blanco').reduce((s, v) => s + v.monto, 0);
  const totalNegro = ventas.filter((v) => v.categoria === 'Negro').reduce((s, v) => s + v.monto, 0);
  const totalTarjeta = ventas.filter((v) => v.medio_pago === 'Tarjeta').reduce((s, v) => s + v.monto, 0);
  const totalVentas = totalBlanco + totalNegro + totalTarjeta;

  const daysInRange = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = format(d, 'yyyy-MM-dd');
    const dayVentas = ventas.filter((v) => v.fecha === dateStr);
    daysInRange.push({
      date: dateStr, label: format(d, 'dd/MM'),
      total: dayVentas.reduce((s, v) => s + v.monto, 0),
      blanco: dayVentas.filter((v) => v.categoria === 'Blanco').reduce((s, v) => s + v.monto, 0),
      negro: dayVentas.filter((v) => v.categoria === 'Negro').reduce((s, v) => s + v.monto, 0),
      tarjeta: dayVentas.filter((v) => v.medio_pago === 'Tarjeta').reduce((s, v) => s + v.monto, 0),
    });
  }

  const tarjetasMap = {};
  ventas.filter((v) => v.medio_pago === 'Tarjeta').forEach((v) => {
    const key = v.banco || 'Otra';
    tarjetasMap[key] = (tarjetasMap[key] || 0) + v.monto;
  });
  const tarjetasRanking = Object.entries(tarjetasMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const monthlyMap = {};
  allVentas.forEach((v) => {
    const ym = (v.fecha || '').slice(0, 7);
    if (!ym) return;
    if (!monthlyMap[ym]) monthlyMap[ym] = { total: 0, blanco: 0, negro: 0, tarjeta: 0 };
    monthlyMap[ym].total += v.monto;
    if (v.categoria === 'Blanco') monthlyMap[ym].blanco += v.monto;
    else if (v.categoria === 'Negro') monthlyMap[ym].negro += v.monto;
    if (v.medio_pago === 'Tarjeta') monthlyMap[ym].tarjeta += v.monto;
  });
  const monthlySorted = Object.entries(monthlyMap).sort((a, b) => a[0].localeCompare(b[0]));
  const monthly12 = monthlySorted.slice(-12);

  const yearlyMap = {};
  allVentas.forEach((v) => {
    const y = (v.fecha || '').slice(0, 4);
    if (!y) return;
    if (!yearlyMap[y]) yearlyMap[y] = { total: 0, blanco: 0, negro: 0, tarjeta: 0 };
    yearlyMap[y].total += v.monto;
    if (v.categoria === 'Blanco') yearlyMap[y].blanco += v.monto;
    else if (v.categoria === 'Negro') yearlyMap[y].negro += v.monto;
    if (v.medio_pago === 'Tarjeta') yearlyMap[y].tarjeta += v.monto;
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
  const chartCardStyle = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1.25rem' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

      {/* ===== HEADER + FILTROS ===== */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #d4af37 0%, #b8960c 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      {/* SECCION: FILTROS ACTIVOS                                     */}
      {/* ============================================================ */}
      <section>
        <div style={{ ...sectionHeaderStyle, marginBottom: '0.5rem' }}>
          <div style={iconBoxStyle('linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)')}>
            <Filter size={18} color="#d4af37" />
          </div>
          <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#d4af37' }}>Resultados con Filtros Activos</span>
          {hasActiveFilter && (
            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#f97316', background: 'rgba(249,115,22,0.12)', padding: '0.15rem 0.5rem', borderRadius: '10px', marginLeft: '0.25rem' }}>FILTRADO</span>
          )}
        </div>

        {/* KPIs */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ ...sectionHeaderStyle }}>
            <div style={iconBoxStyle('linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)')}>
              <TrendingUp size={18} color="#d4af37" />
            </div>
            <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text, #f3f4f6)' }}>Resumen de Ventas</span>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '16px', padding: '1.75rem 2rem', position: 'relative', overflow: 'hidden', marginBottom: '1rem' }}>
            <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '6rem', opacity: 0.03, fontWeight: '900' }}>$</div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Total Ventas del Periodo</div>
            <div style={{ fontSize: '2.8rem', fontWeight: '900', color: '#d4af37', lineHeight: '1', letterSpacing: '-0.02em' }}>{formatCurrency(totalVentas)}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {[
              { label: 'Blanco', sub: 'Efectivo declarado', value: totalBlanco, color: '#e2e8f0', grad: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', pct: pctOf(totalBlanco, totalVentas) },
              { label: 'Negro', sub: 'Efectivo no declarado', value: totalNegro, color: '#c4b5fd', grad: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', pct: pctOf(totalNegro, totalVentas) },
              { label: 'Tarjeta', sub: 'Credito / Debito', value: totalTarjeta, color: '#fbbf24', grad: 'linear-gradient(135deg, #422006 0%, #78350f 100%)', pct: pctOf(totalTarjeta, totalVentas) },
            ].map((card) => (
              <div key={card.label} style={{ background: card.grad, borderRadius: '14px', padding: '1.25rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.85rem', color: card.color }}>{card.label}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#6b7280', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>{card.pct}</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>{formatCurrency(card.value)}</div>
                <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.35rem' }}>{card.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* GRAFICOS FILTRADOS */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <div style={chartCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <TrendingUp size={16} color="#d4af37" />
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f3f4f6' }}>Tendencia Diaria de Ventas</span>
            </div>
            <div style={{ height: '300px' }}>
              <Line data={{
                labels: daysInRange.map((d) => d.label),
                datasets: [
                  { label: 'Total', data: daysInRange.map((d) => d.total), borderColor: '#d4af37', backgroundColor: 'rgba(212,175,55,0.08)', fill: true, tension: 0.4, pointRadius: 2, borderWidth: 2 },
                  { label: 'Blanco', data: daysInRange.map((d) => d.blanco), borderColor: '#9ca3af', borderDash: [5, 5], tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
                  { label: 'Negro', data: daysInRange.map((d) => d.negro), borderColor: '#818cf8', borderDash: [5, 5], tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
                  { label: 'Tarjeta', data: daysInRange.map((d) => d.tarjeta), borderColor: '#3b82f6', borderDash: [5, 5], tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
                ],
              }} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, color: '#9ca3af', font: { size: 11 } } } },
                scales: {
                  x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 10 } } },
                  y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 10 } } },
                },
              }} />
            </div>
          </div>

          <div style={chartCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <BarChart3 size={16} color="#d4af37" />
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f3f4f6' }}>Distribucion</span>
            </div>
            <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Doughnut data={{
                labels: ['Blanco', 'Negro', 'Tarjeta'],
                datasets: [{ data: [totalBlanco, totalNegro, totalTarjeta], backgroundColor: ['#e2e8f0', '#818cf8', '#fbbf24'], borderWidth: 0 }],
              }} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, color: '#9ca3af', font: { size: 11 } } } },
                cutout: '65%',
              }} />
            </div>
          </div>
        </div>

        {/* RANKING TARJETAS - FILTRADO */}
        <div style={{ marginTop: '1rem' }}>
          <div style={chartCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Award size={16} color="#d4af37" />
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f3f4f6' }}>Ranking Medios de Pago</span>
            </div>
            {tarjetasRanking.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {tarjetasRanking.map(([name, amount], i) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.75rem', background: i === 0 ? 'linear-gradient(135deg, #d4af37, #b8960c)' : 'rgba(255,255,255,0.05)', color: i === 0 ? '#fff' : '#6b7280' }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#d1d5db', fontWeight: '500' }}>{name}</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#fbbf24' }}>{formatCurrency(amount)}</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: (amount / tarjetasRanking[0][1] * 100) + '%', background: 'linear-gradient(90deg, #4338ca, #d4af37)', borderRadius: '3px' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280', fontSize: '0.85rem', fontStyle: 'italic' }}>
                No hay ventas con tarjeta en el periodo
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={iconBoxStyle('linear-gradient(135deg, #065f46 0%, #047857 100%)')}>
            <Database size={18} color="#6ee7b7" />
          </div>
          <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#6ee7b7' }}>Historico Completo</span>
          <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#6b7280', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.5rem', borderRadius: '10px', marginLeft: '0.25rem' }}>SIN FILTROS</span>
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
            <div style={chartCardStyle}>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f3f4f6', marginBottom: '1rem' }}>Ventas por Mes (Ultimos 12 meses)</div>
              <div style={{ height: '300px' }}>
                {monthly12.length > 0 ? (
                  <Bar data={{
                    labels: monthly12.map(([ym]) => { const [y, m] = ym.split('-'); return `${MONTHS_SHORT[parseInt(m) - 1]} ${y.slice(2)}`; }),
                    datasets: [
                      { label: 'Blanco', data: monthly12.map(([, d]) => d.blanco), backgroundColor: 'rgba(226,232,240,0.7)', borderRadius: 4 },
                      { label: 'Negro', data: monthly12.map(([, d]) => d.negro), backgroundColor: 'rgba(129,140,248,0.7)', borderRadius: 4 },
                      { label: 'Tarjeta', data: monthly12.map(([, d]) => d.tarjeta), backgroundColor: 'rgba(251,191,36,0.7)', borderRadius: 4 },
                    ],
                  }} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, color: '#9ca3af', font: { size: 11 } } } },
                    scales: {
                      x: { stacked: true, grid: { display: false }, ticks: { color: '#6b7280', font: { size: 10 } } },
                      y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 10 }, callback: (v) => formatCurrency(v) } },
                    },
                  }} />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '0.85rem' }}>Sin datos mensuales</div>
                )}
              </div>
            </div>

            <div style={chartCardStyle}>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f3f4f6', marginBottom: '1rem' }}>Evolucion Mensual</div>
              <div style={{ height: '300px' }}>
                {monthly12.length > 0 ? (
                  <Line data={{
                    labels: monthly12.map(([ym]) => { const [y, m] = ym.split('-'); return `${MONTHS_SHORT[parseInt(m) - 1]} ${y.slice(2)}`; }),
                    datasets: [
                      { label: 'Total', data: monthly12.map(([, d]) => d.total), borderColor: '#d4af37', backgroundColor: 'rgba(212,175,55,0.08)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#d4af37', borderWidth: 2.5 },
                    ],
                  }} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 10 } } },
                      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 10 }, callback: (v) => formatCurrency(v) } },
                    },
                  }} />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '0.85rem' }}>Sin datos</div>
                )}
              </div>
            </div>
          </div>

          {monthly12.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
              {monthly12.map(([ym, d]) => {
                const [y, m] = ym.split('-');
                return (
                  <div key={ym} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{MONTHS_SHORT[parseInt(m) - 1]} {y}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#d4af37', marginTop: '0.25rem' }}>{formatCurrency(d.total)}</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.25rem', fontSize: '0.6rem', color: '#6b7280' }}>
                      <span style={{ color: '#e2e8f0' }}>{formatCurrency(d.blanco)}</span>
                      <span style={{ color: '#818cf8' }}>{formatCurrency(d.negro)}</span>
                      <span style={{ color: '#fbbf24' }}>{formatCurrency(d.tarjeta)}</span>
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
            <div style={chartCardStyle}>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f3f4f6', marginBottom: '1rem' }}>Ventas por Anio</div>
              <div style={{ height: '300px' }}>
                {yearlySorted.length > 0 ? (
                  <Bar data={{
                    labels: yearlySorted.map(([y]) => y),
                    datasets: [
                      { label: 'Blanco', data: yearlySorted.map(([, d]) => d.blanco), backgroundColor: 'rgba(226,232,240,0.7)', borderRadius: 4 },
                      { label: 'Negro', data: yearlySorted.map(([, d]) => d.negro), backgroundColor: 'rgba(129,140,248,0.7)', borderRadius: 4 },
                      { label: 'Tarjeta', data: yearlySorted.map(([, d]) => d.tarjeta), backgroundColor: 'rgba(251,191,36,0.7)', borderRadius: 4 },
                    ],
                  }} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, color: '#9ca3af', font: { size: 11 } } } },
                    scales: {
                      x: { stacked: true, grid: { display: false }, ticks: { color: '#6b7280', font: { size: 11 } } },
                      y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 10 }, callback: (v) => formatCurrency(v) } },
                    },
                  }} />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '0.85rem' }}>Sin datos anuales</div>
                )}
              </div>
            </div>

            <div style={chartCardStyle}>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f3f4f6', marginBottom: '1rem' }}>Evolucion Anual</div>
              <div style={{ height: '300px' }}>
                {yearlySorted.length > 0 ? (
                  <Line data={{
                    labels: yearlySorted.map(([y]) => y),
                    datasets: [
                      { label: 'Total', data: yearlySorted.map(([, d]) => d.total), borderColor: '#9333ea', backgroundColor: 'rgba(147,51,234,0.08)', fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: '#9333ea', borderWidth: 2.5 },
                    ],
                  }} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 11 } } },
                      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 10 }, callback: (v) => formatCurrency(v) } },
                    },
                  }} />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '0.85rem' }}>Sin datos</div>
                )}
              </div>
            </div>
          </div>

          {yearlySorted.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
              {yearlySorted.map(([y, d]) => (
                <div key={y} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.75rem 1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '700' }}>{y}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#d4af37', marginTop: '0.25rem' }}>{formatCurrency(d.total)}</div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.25rem', fontSize: '0.6rem', color: '#6b7280' }}>
                    <span style={{ color: '#e2e8f0' }}>B: {formatCurrency(d.blanco)}</span>
                    <span style={{ color: '#818cf8' }}>N: {formatCurrency(d.negro)}</span>
                    <span style={{ color: '#fbbf24' }}>T: {formatCurrency(d.tarjeta)}</span>
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
