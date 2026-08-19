import { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { Download } from 'lucide-react';
import { format, subDays } from 'date-fns';
import mockDB from '../services/firestoreDB';
import { formatCurrency } from '../utils/formatCurrency';
import { today } from '../utils/dateUtils';
import { exportToCSV, exportToExcel, exportToPDF } from '../utils/exportUtils';
import { useSortableData, SortIcon } from '../hooks/useSortableData';
import DateFilter from '../components/DateFilter';
import toast from 'react-hot-toast';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend, Filler);

export default function Reportes() {
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(today());
  const [ventas, setVentas] = useState([]);
  const [caja, setCaja] = useState([]);
  const [cierres, setCierres] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [v, c, ci] = await Promise.all([mockDB.getVentas(), mockDB.getCaja(), mockDB.getCierres()]);
      setVentas(v); setCaja(c); setCierres(ci);
    } catch {} finally { setLoading(false); }
  };

  const filteredVentas = ventas.filter((v) => v.fecha >= dateFrom && v.fecha <= dateTo);
  const filteredCaja = caja.filter((m) => m.fecha >= dateFrom && m.fecha <= dateTo);
  const filteredCierres = cierres.filter((c) => c.fecha >= dateFrom && c.fecha <= dateTo);

  const totalBlanco = filteredVentas.filter((v) => v.categoria === 'Blanco').reduce((s, v) => s + v.monto, 0);
  const totalNegro = filteredVentas.filter((v) => v.categoria === 'Negro').reduce((s, v) => s + v.monto, 0);
  const totalTarjeta = filteredVentas.filter((v) => v.medio_pago === 'Tarjeta').reduce((s, v) => s + v.monto, 0);
  const totalVentas = totalBlanco + totalNegro + totalTarjeta;

  const blancoCaja = filteredCaja.filter((m) => m.categoria === 'Blanco' && m.codigo === 502).reduce((s, m) => s + m.monto, 0);
  const negroCaja = filteredCaja.filter((m) => m.categoria === 'Negro' && m.codigo === 502).reduce((s, m) => s + m.monto, 0);
  const totalIngresos = filteredCaja.filter((m) => m.codigo === 502).reduce((s, m) => s + m.monto, 0);
  const totalEgresos = filteredCaja.filter((m) => [501, 503].includes(m.codigo)).reduce((s, m) => s + m.monto, 0);
  const egresoBlanco = filteredCaja.filter((m) => m.categoria === 'Blanco' && [501, 503].includes(m.codigo)).reduce((s, m) => s + m.monto, 0);
  const egresoNegro = filteredCaja.filter((m) => m.categoria === 'Negro' && [501, 503].includes(m.codigo)).reduce((s, m) => s + m.monto, 0);

  const daysInRange = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = format(d, 'yyyy-MM-dd');
    const dayVentas = filteredVentas.filter((v) => v.fecha === dateStr);
    daysInRange.push({
      date: dateStr, label: format(d, 'dd/MM'),
      total: dayVentas.reduce((s, v) => s + v.monto, 0),
      blanco: dayVentas.filter((v) => v.categoria === 'Blanco').reduce((s, v) => s + v.monto, 0),
      negro: dayVentas.filter((v) => v.categoria === 'Negro').reduce((s, v) => s + v.monto, 0),
      tarjeta: dayVentas.filter((v) => v.medio_pago === 'Tarjeta').reduce((s, v) => s + v.monto, 0),
    });
  }

  const tarjetasMap = {};
  filteredVentas.filter((v) => v.medio_pago === 'Tarjeta').forEach((v) => {
    const key = v.banco || 'Otra';
    tarjetasMap[key] = (tarjetasMap[key] || 0) + v.monto;
  });
  const tarjetasRanking = Object.entries(tarjetasMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const { sorted: sortedCierres, requestSort: sortCierres, sortConfig: sortCierresConfig } = useSortableData(filteredCierres, 'fecha', 'desc');

  const handleExport = (type) => {
    const data = filteredVentas.map((v) => ({ Fecha: v.fecha, Tipo: v.tipo, Categoria: v.categoria || 'Tarjeta', Medio: v.medio_pago, Banco: v.banco || '-', Monto: v.monto }));
    if (type === 'csv') exportToCSV(data, `reporte_ventas_${today()}`);
    else if (type === 'xlsx') exportToExcel(data, `reporte_ventas_${today()}`);
    else if (type === 'pdf') exportToPDF(data, [
      { key: 'Fecha', header: 'Fecha' }, { key: 'Categoria', header: 'Tipo' }, { key: 'Banco', header: 'Banco' },
      { key: 'Monto', header: 'Monto', format: 'currency' },
    ], 'Reporte de Ventas - GLAMOURS', `reporte_ventas_${today()}`);
    toast.success(`Exportado como ${type.toUpperCase()}`);
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;

  const cierreCols = [
    { key: 'fecha', label: 'Fecha' }, { key: 'saldo_teorico', label: 'Saldo Teorico', amount: true },
    { key: 'saldo_real', label: 'Saldo Real', amount: true }, { key: 'diferencia', label: 'Diferencia', amount: true },
  ];

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>Filtros de Periodo</h2>
          <div className="btn-group">
            <button className="btn btn-outline btn-sm" onClick={() => handleExport('xlsx')}><Download size={14} /> Excel</button>
            <button className="btn btn-outline btn-sm" onClick={() => handleExport('pdf')}><Download size={14} /> PDF</button>
            <button className="btn btn-outline btn-sm" onClick={() => handleExport('csv')}><Download size={14} /> CSV</button>
          </div>
        </div>
        <div style={{ padding: '0.75rem 1rem' }}>
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>
      </div>

      {/* KPIs Ventas */}
      <div className="stats-grid">
        <div className="stat-card accent"><h3>Ventas Totales</h3><div className="value">{formatCurrency(totalVentas)}</div></div>
        <div className="stat-card success"><h3>Blanco + Negro</h3><div className="value">{formatCurrency(totalBlanco + totalNegro)}</div></div>
        <div className="stat-card info"><h3>Tarjeta</h3><div className="value">{formatCurrency(totalTarjeta)}</div></div>
      </div>

      <div className="stats-grid">
        <div className="stat-card" style={{ borderLeftColor: '#d1d5db' }}><h3>Blanco</h3><div className="value">{formatCurrency(totalBlanco)}</div>
          <div className="subtitle">{totalVentas > 0 ? `${((totalBlanco / totalVentas) * 100).toFixed(1)}%` : '0%'}</div></div>
        <div className="stat-card" style={{ borderLeftColor: '#1e1b4b' }}><h3>Negro</h3><div className="value">{formatCurrency(totalNegro)}</div>
          <div className="subtitle">{totalVentas > 0 ? `${((totalNegro / totalVentas) * 100).toFixed(1)}%` : '0%'}</div></div>
        <div className="stat-card info"><h3>Tarjeta</h3><div className="value">{formatCurrency(totalTarjeta)}</div>
          <div className="subtitle">{totalVentas > 0 ? `${((totalTarjeta / totalVentas) * 100).toFixed(1)}%` : '0%'}</div></div>
      </div>

      {/* KPIs Caja */}
      <div className="stats-grid">
        <div className="stat-card success"><h3>Ingresos Caja</h3><div className="value">{formatCurrency(totalIngresos)}</div></div>
        <div className="stat-card danger"><h3>Egresos Caja</h3><div className="value">{formatCurrency(totalEgresos)}</div></div>
        <div className="stat-card" style={{ borderLeft: '3px solid #facc15' }}><h3>Ingreso Blanco</h3><div className="value" style={{ color: '#facc15' }}>{formatCurrency(blancoCaja)}</div></div>
        <div className="stat-card" style={{ borderLeft: '3px solid #6b7280' }}><h3>Ingreso Negro</h3><div className="value" style={{ color: '#9ca3af' }}>{formatCurrency(negroCaja)}</div></div>
        <div className="stat-card warning"><h3>Egreso Blanco</h3><div className="value">{formatCurrency(egresoBlanco)}</div></div>
        <div className="stat-card" style={{ borderLeft: '3px solid #6b7280' }}><h3>Egreso Negro</h3><div className="value">{formatCurrency(egresoNegro)}</div></div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="card">
          <div className="card-header"><h2>Tendencia Diaria de Ventas</h2></div>
          <div className="chart-container" style={{ height: '320px' }}>
            <Line data={{
              labels: daysInRange.map((d) => d.label),
              datasets: [
                { label: 'Total', data: daysInRange.map((d) => d.total), borderColor: '#d4af37', backgroundColor: 'rgba(212,175,55,0.1)', fill: true, tension: 0.4, pointRadius: 2 },
                { label: 'Blanco', data: daysInRange.map((d) => d.blanco), borderColor: '#9ca3af', borderDash: [5, 5], tension: 0.4, pointRadius: 0 },
                { label: 'Negro', data: daysInRange.map((d) => d.negro), borderColor: '#1e1b4b', borderDash: [5, 5], tension: 0.4, pointRadius: 0 },
                { label: 'Tarjeta', data: daysInRange.map((d) => d.tarjeta), borderColor: '#3b82f6', borderDash: [5, 5], tension: 0.4, pointRadius: 0 },
              ],
            }} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } } },
              scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
            }} />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h2>Distribucion</h2></div>
          <div className="chart-container">
            <Doughnut data={{
              labels: ['Blanco', 'Negro', 'Tarjeta'],
              datasets: [{ data: [totalBlanco, totalNegro, totalTarjeta], backgroundColor: ['#d1d5db', '#1e1b4b', '#d4af37'], borderWidth: 0 }],
            }} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } } },
              cutout: '65%',
            }} />
          </div>
        </div>
      </div>

      {/* Tarjetas ranking */}
      <div className="card">
        <div className="card-header"><h2>Ranking de Medios de Pago (Tarjeta)</h2></div>
        {tarjetasRanking.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0 1rem 1rem' }}>
            {tarjetasRanking.map(([name, amount], i) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ width: '20px', textAlign: 'center', fontWeight: '700', color: i === 0 ? '#d4af37' : '#9ca3af' }}>{i + 1}</span>
                <div style={{ flex: 1, height: '28px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(amount / tarjetasRanking[0][1]) * 100}%`, background: 'linear-gradient(90deg, #4338ca, #d4af37)', borderRadius: '6px', display: 'flex', alignItems: 'center', paddingLeft: '8px', minWidth: '60px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'white', fontWeight: '600' }}>{formatCurrency(amount)}</span>
                  </div>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#6b7280', minWidth: '140px' }}>{name}</span>
              </div>
            ))}
          </div>
        ) : <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>No hay ventas con tarjeta en el periodo</p>}
      </div>

      {/* Cierres de caja */}
      <div className="card">
        <div className="card-header"><h2>Cierres de Caja en el Periodo</h2></div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                {cierreCols.map((c) => (
                  <th key={c.key} className={c.amount ? 'amount' : ''} style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => sortCierres(c.key)}>
                    {c.label}<SortIcon config={sortCierresConfig} column={c.key} />
                  </th>
                ))}
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {sortedCierres.map((c) => (
                <tr key={c.id}>
                  <td>{c.fecha}</td>
                  <td className="amount">{formatCurrency(c.saldo_teorico)}</td>
                  <td className="amount">{formatCurrency(c.saldo_real)}</td>
                  <td className="amount" style={{ color: c.diferencia === 0 ? '#10b981' : '#ef4444', fontWeight: '600' }}>{formatCurrency(c.diferencia)}</td>
                  <td><span className={`badge ${c.diferencia === 0 ? 'badge-success' : 'badge-danger'}`}>{c.diferencia === 0 ? 'Cuadra' : 'Diferencia'}</span></td>
                </tr>
              ))}
              {sortedCierres.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: '1.5rem' }}>Sin cierres en el periodo</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
