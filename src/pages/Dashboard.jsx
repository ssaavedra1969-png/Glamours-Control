import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { format, subDays } from 'date-fns';
import { Wallet, CreditCard } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatCurrency';
import { today } from '../utils/dateUtils';
import toast from 'react-hot-toast';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const CARD_BRAND_COLORS = {
  'Visa': '#1a1f71', 'Mastercard': '#eb001b', 'Amex': '#006fcf', 'Cabal': '#0071ce',
  'Naranja': '#f37021', 'Mercado Pago': '#009ee3', 'Electron': '#1a1f71',
  'QR Francés': '#009ee3', 'QR Provincia': '#009ee3', 'QR Nación': '#009ee3',
  'Otra': '#6b7280',
};

const CAJA_CODE_INFO = {
  500: { label: 'En Caja', color: '#facc15', bg: 'rgba(250,204,21,0.12)' },
  501: { label: 'Egreso', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  502: { label: 'Ingreso', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  503: { label: 'Retiro', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    ventasHoy: 0, blancoHoy: 0, negroHoy: 0, tarjetaHoy: 0,
    saldoBlanco: 0, saldoNegro: 0, ingresosHoy: 0, egresosHoy: 0,
    totalBlancoVentas: 0, totalNegroVentas: 0, totalTarjetaVentas: 0, totalVentas: 0,
  });
  const [chartData, setChartData] = useState(null);
  const [pieData, setPieData] = useState(null);
  const [cardBrandData, setCardBrandData] = useState([]);
  const [cajaTypeData, setCajaTypeData] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ tipo: 'Ingreso en Caja', categoria: 'Blanco', monto: '', descripcion: '' });
  const [config, setConfig] = useState({ limites_caja: { minimo: 10000, maximo: 200000 } });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const hoy = today();
      const [caja, ventas, configData] = await Promise.all([
        mockDB.getCaja().catch((e) => { console.warn('Error caja:', e.message); return []; }),
        mockDB.getVentas().catch((e) => { console.warn('Error ventas:', e.message); return []; }),
        mockDB.getConfiguracion().catch((e) => { console.warn('Error config:', e.message); return { iva: 21, limites_caja: { minimo: 10000, maximo: 200000 } }; }),
      ]);
      setConfig(configData);

      const ventasHoy = ventas.filter((v) => v.fecha === hoy);
      const blancoHoy = ventasHoy.filter((v) => v.categoria === 'Blanco').reduce((s, v) => s + v.monto, 0);
      const negroHoy = ventasHoy.filter((v) => v.categoria === 'Negro').reduce((s, v) => s + v.monto, 0);
      const tarjetaHoy = ventasHoy.filter((v) => v.medio_pago === 'Tarjeta').reduce((s, v) => s + v.monto, 0);

      const movsHoy = caja.filter((m) => m.fecha === hoy);
      const ingresosHoy = movsHoy.filter((m) => m.codigo === 502).reduce((s, m) => s + m.monto, 0);
      const egresosHoy = movsHoy.filter((m) => [501, 503].includes(m.codigo)).reduce((s, m) => s + m.monto, 0);

      const saldoBlanco = caja.filter((m) => m.categoria === 'Blanco').length > 0
        ? caja.filter((m) => m.categoria === 'Blanco')[0].saldo_nuevo : 0;
      const saldoNegro = caja.filter((m) => m.categoria === 'Negro').length > 0
        ? caja.filter((m) => m.categoria === 'Negro')[0].saldo_nuevo : 0;

      const totalBlancoVentas = ventas.filter((v) => v.categoria === 'Blanco').reduce((s, v) => s + v.monto, 0);
      const totalNegroVentas = ventas.filter((v) => v.categoria === 'Negro').reduce((s, v) => s + v.monto, 0);
      const totalTarjetaVentas = ventas.filter((v) => v.medio_pago === 'Tarjeta').reduce((s, v) => s + v.monto, 0);

      setStats({
        ventasHoy: blancoHoy + negroHoy + tarjetaHoy, blancoHoy, negroHoy, tarjetaHoy,
        saldoBlanco, saldoNegro, ingresosHoy, egresosHoy,
        totalBlancoVentas, totalNegroVentas, totalTarjetaVentas,
        totalVentas: totalBlancoVentas + totalNegroVentas + totalTarjetaVentas,
      });
      setMovimientos(caja.slice(0, 10));

      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
        const label = format(subDays(new Date(), 6 - i), 'dd/MM');
        const dayVentas = ventas.filter((v) => v.fecha === d);
        return {
          label,
          blanco: dayVentas.filter((v) => v.categoria === 'Blanco').reduce((s, v) => s + v.monto, 0),
          negro: dayVentas.filter((v) => v.categoria === 'Negro').reduce((s, v) => s + v.monto, 0),
          tarjeta: dayVentas.filter((v) => v.medio_pago === 'Tarjeta').reduce((s, v) => s + v.monto, 0),
        };
      });

      setChartData({
        labels: last7.map((d) => d.label),
        datasets: [
          { label: 'Blanco', data: last7.map((d) => d.blanco), backgroundColor: '#e5e7eb', borderRadius: 4 },
          { label: 'Negro', data: last7.map((d) => d.negro), backgroundColor: '#1e1b4b', borderRadius: 4 },
          { label: 'Tarjeta', data: last7.map((d) => d.tarjeta), backgroundColor: '#d4af37', borderRadius: 4 },
        ],
      });

      setPieData({
        labels: ['Blanco', 'Negro', 'Tarjeta'],
        datasets: [{
          data: [totalBlancoVentas, totalNegroVentas, totalTarjetaVentas],
          backgroundColor: ['#e5e7eb', '#1e1b4b', '#d4af37'],
          borderWidth: 0,
        }],
      });

      const brandMap = {};
      ventas.filter((v) => v.medio_pago === 'Tarjeta').forEach((v) => {
        const brand = v.banco || 'Otra';
        if (!brandMap[brand]) brandMap[brand] = 0;
        brandMap[brand] += v.monto;
      });
      const brandList = Object.entries(brandMap)
        .map(([brand, monto]) => ({ brand, monto }))
        .sort((a, b) => b.monto - a.monto);
      setCardBrandData(brandList);

      const cajaMap = {};
      caja.forEach((m) => {
        const code = m.codigo;
        if (!cajaMap[code]) cajaMap[code] = { count: 0, monto: 0 };
        cajaMap[code].count++;
        cajaMap[code].monto += m.monto;
      });
      const cajaList = [502, 501, 503, 500]
        .filter((code) => cajaMap[code])
        .map((code) => ({ code, ...CAJA_CODE_INFO[code], ...cajaMap[code] }));
      setCajaTypeData(cajaList);
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterMovement = async (e) => {
    e.preventDefault();
    if (!form.monto || parseFloat(form.monto) <= 0) return toast.error('Ingrese un monto valido');
    const codigo = form.tipo === 'Ingreso en Caja' ? 502 : form.tipo === 'Egreso en Caja' ? 501 : 503;
    await mockDB.addCajaMovimiento({
      fecha: today(), tipo: form.tipo, codigo, categoria: form.categoria,
      descripcion: form.descripcion || form.tipo,
      monto: Math.abs(parseFloat(form.monto)), usuario: user.email,
    });
    mockDB.addAuditLog(user.email, `Registro de movimiento: ${form.tipo} (${form.categoria}) ${formatCurrency(form.monto)}`, 'Caja', form.descripcion);
    toast.success('Movimiento registrado');
    setShowModal(false);
    setForm({ tipo: 'Ingreso en Caja', categoria: 'Blanco', monto: '', descripcion: '' });
    loadData();
  };

  const alertas = [];
  if (stats.saldoBlanco < config.limites_caja.minimo) alertas.push({ type: 'warning', text: `El saldo Blanco esta por debajo del minimo recomendado (${formatCurrency(config.limites_caja.minimo)})` });
  if (stats.ingresosHoy === 0 && stats.egresosHoy === 0) alertas.push({ type: 'info', text: 'No hay movimientos registrados hoy' });

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;

  return (
    <div>
      {/* Alertas */}
      {alertas.map((a, i) => (
        <div key={i} className={`alert alert-${a.type}`}>{a.text}</div>
      ))}

      {/* Stats Principales */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Ventas Totales</h3>
          <div className="value">{formatCurrency(stats.totalVentas)}</div>
          <div className="subtitle">Blanco + Negro + Tarjeta</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #facc15' }}>
          <h3>Caja Blanco</h3>
          <div className="value" style={{ color: '#facc15' }}>{formatCurrency(stats.saldoBlanco)}</div>
          <div className="subtitle">Saldo declarado</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #6b7280' }}>
          <h3>Caja Negro</h3>
          <div className="value" style={{ color: '#9ca3af' }}>{formatCurrency(stats.saldoNegro)}</div>
          <div className="subtitle">Saldo no declarado</div>
        </div>
        <div className="stat-card success">
          <h3>Ingresos Hoy</h3>
          <div className="value">{formatCurrency(stats.ingresosHoy)}</div>
          <div className="subtitle">Movimientos entrantes</div>
        </div>
        <div className="stat-card danger">
          <h3>Egresos Hoy</h3>
          <div className="value">{formatCurrency(stats.egresosHoy)}</div>
          <div className="subtitle">Movimientos salientes</div>
        </div>
      </div>

      {/* Montos por Tipo (Totales) */}
      <div className="stats-grid">
        <div className="stat-card" style={{ borderLeftColor: '#d1d5db' }}>
          <h3>Blanco (declarada)</h3>
          <div className="value">{formatCurrency(stats.totalBlancoVentas)}</div>
          <div className="subtitle">Efectivo declarado - Total historico</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#818cf8' }}>
          <h3>Negro (no declarada)</h3>
          <div className="value">{formatCurrency(stats.totalNegroVentas)}</div>
          <div className="subtitle">Efectivo no declarado - Total historico</div>
        </div>
        <div className="stat-card info">
          <h3>Tarjeta</h3>
          <div className="value">{formatCurrency(stats.totalTarjetaVentas)}</div>
          <div className="subtitle">Credito / Debito - Total historico</div>
        </div>
      </div>

      {/* Montos por Tipo (Hoy) */}
      <div className="stats-grid">
        <div className="stat-card" style={{ borderLeftColor: '#d1d5db', opacity: 0.8 }}>
          <h3>Blanco Hoy</h3>
          <div className="value">{formatCurrency(stats.blancoHoy)}</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#818cf8', opacity: 0.8 }}>
          <h3>Negro Hoy</h3>
          <div className="value">{formatCurrency(stats.negroHoy)}</div>
        </div>
        <div className="stat-card info" style={{ opacity: 0.8 }}>
          <h3>Tarjeta Hoy</h3>
          <div className="value">{formatCurrency(stats.tarjetaHoy)}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="card">
          <div className="card-header"><h2>Ventas - Ultimos 7 dias</h2></div>
          <div className="chart-container">
            {chartData && (
              <Bar data={chartData} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15 } } },
                scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } },
              }} />
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h2>Distribucion Total por Tipo</h2></div>
          <div className="chart-container">
            {pieData && (
              <Doughnut data={pieData} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15 } } },
                cutout: '65%',
              }} />
            )}
          </div>
        </div>
      </div>

      {/* Ventas por Tipo de Tarjeta */}
      <div className="card">
        <div className="card-header"><h2><CreditCard size={18} /> Ventas por Tipo</h2></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Efectivo */}
          <div>
            <h3 style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Efectivo</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d1d5db', flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: '600', fontSize: '0.9rem' }}>Moneda Local (Blanco)</span>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Valor 0</span>
                <span style={{ fontWeight: '700', color: '#d1d5db' }}>{formatCurrency(stats.totalBlancoVentas)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#818cf8', flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: '600', fontSize: '0.9rem' }}>Moneda Local 1 (Negro)</span>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Valor 2</span>
                <span style={{ fontWeight: '700', color: '#818cf8' }}>{formatCurrency(stats.totalNegroVentas)}</span>
              </div>
            </div>
          </div>
          {/* Tarjetas */}
          <div>
            <h3 style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tarjetas</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {cardBrandData.length === 0 && <div style={{ color: '#6b7280', fontSize: '0.85rem', padding: '0.5rem' }}>Sin ventas con tarjeta</div>}
              {cardBrandData.map((item) => (
                <div key={item.brand} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: CARD_BRAND_COLORS[item.brand] || '#6b7280', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: '600', fontSize: '0.9rem' }}>{item.brand}</span>
                  <span style={{ fontWeight: '700', color: '#d4af37' }}>{formatCurrency(item.monto)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Caja por Tipo */}
      <div className="card">
        <div className="card-header"><h2><Wallet size={18} /> Caja por Tipo</h2></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {cajaTypeData.map((item) => (
            <div key={item.code} style={{ padding: '1rem', background: item.bg, borderRadius: '10px', border: `1px solid ${item.color}33` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color }} />
                <span style={{ fontWeight: '700', fontSize: '0.95rem', color: item.color }}>{item.label}</span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: 'auto' }}>Codigo {item.code}</span>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: '700', color: item.color }}>{formatCurrency(item.monto)}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{item.count} movimientos</div>
            </div>
          ))}
          {cajaTypeData.length === 0 && <div style={{ color: '#6b7280', padding: '1rem', textAlign: 'center' }}>Sin movimientos de caja</div>}
        </div>
      </div>

      {/* Recent Movements */}
      <div className="card">
        <div className="card-header">
          <h2>Últimos Movimientos</h2>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Registrar</button>
            <button className="btn btn-outline" onClick={() => navigate('/caja')}>Ver todo</button>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Cat.</th><th>Descripcion</th><th className="amount">Monto</th><th className="amount">Saldo</th></tr>
            </thead>
            <tbody>
              {movimientos.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>No hay movimientos registrados</td></tr>
              ) : movimientos.map((m) => (
                <tr key={m.id}>
                  <td>{m.fecha}</td>
                  <td>
                    <span className={`badge ${m.codigo === 502 ? 'badge-success' : m.codigo === 501 ? 'badge-danger' : 'badge-warning'}`}>
                      {m.tipo}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600',
                      background: m.categoria === 'Blanco' ? 'rgba(250,204,21,0.15)' : 'rgba(156,163,175,0.15)',
                      color: m.categoria === 'Blanco' ? '#facc15' : '#9ca3af',
                    }}>
                      {m.categoria || 'Blanco'}
                    </span>
                  </td>
                  <td>{m.descripcion}</td>
                  <td className="amount" style={{ color: m.codigo === 502 ? '#10b981' : '#ef4444' }}>
                    {m.codigo === 502 ? '+' : '-'}{formatCurrency(m.monto)}
                  </td>
                  <td className="amount">{formatCurrency(m.saldo_nuevo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <div className={`modal-overlay ${showModal ? 'active' : ''}`} onClick={() => setShowModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Registrar Movimiento</h2>
          <form onSubmit={handleRegisterMovement}>
            <div className="form-group">
              <label>Categoria</label>
              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                <option value="Blanco">Blanco (Declarado)</option>
                <option value="Negro">Negro (No declarado)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tipo de Movimiento</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="Ingreso en Caja">Ingreso en Caja</option>
                <option value="Egreso en Caja">Egreso en Caja</option>
                <option value="Retiro de Caja">Retiro de Caja</option>
              </select>
            </div>
            <div className="form-group">
              <label>Monto</label>
              <input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="0" min="0" required />
            </div>
            <div className="form-group">
              <label>Descripción</label>
              <input type="text" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción del movimiento" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Registrar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
