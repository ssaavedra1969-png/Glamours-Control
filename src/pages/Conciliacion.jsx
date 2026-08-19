import { useState, useEffect } from 'react';
import { Plus, CheckCircle, Clock } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatCurrency';
import { today } from '../utils/dateUtils';
import { useSortableData, SortIcon } from '../hooks/useSortableData';
import DateFilter from '../components/DateFilter';
import toast from 'react-hot-toast';

export default function Conciliacion() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [conciliaciones, setConciliaciones] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ banco: '', monto_ventas: '', monto_extracto: '' });

  const { sorted, requestSort, sortConfig } = useSortableData(filtered, 'fecha', 'desc');

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    let result = [...conciliaciones];
    if (dateFrom) result = result.filter((c) => c.fecha >= dateFrom);
    if (dateTo) result = result.filter((c) => c.fecha <= dateTo);
    setFiltered(result);
  }, [conciliaciones, dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    try { setConciliaciones(await mockDB.getConciliaciones()); } catch {} finally { setLoading(false); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const mv = parseFloat(form.monto_ventas);
    const me = parseFloat(form.monto_extracto);
    if (!form.banco || isNaN(mv) || isNaN(me)) return toast.error('Complete todos los campos');
    await mockDB.addConciliacion({
      fecha: today(), banco: form.banco, monto_ventas: mv, monto_extracto: me,
      diferencia: me - mv, estado: me === mv ? 'Conciliado' : 'Pendiente', usuario: user.email,
    });
    mockDB.addAuditLog(user.email, `Conciliacion: ${form.banco}`, 'Conciliacion', `Diferencia: ${formatCurrency(me - mv)}`);
    toast.success('Conciliacion registrada');
    setShowModal(false);
    setForm({ banco: '', monto_ventas: '', monto_extracto: '' });
    loadData();
  };

  const stats = {
    total: filtered.length,
    conciliadas: filtered.filter((c) => c.estado === 'Conciliado').length,
    pendientes: filtered.filter((c) => c.estado === 'Pendiente').length,
    diferencias: filtered.filter((c) => c.diferencia !== 0).reduce((s, c) => s + Math.abs(c.diferencia), 0),
    totalVentas: filtered.reduce((s, c) => s + c.monto_ventas, 0),
    totalExtracto: filtered.reduce((s, c) => s + c.monto_extracto, 0),
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;

  const cols = [
    { key: 'fecha', label: 'Fecha' }, { key: 'banco', label: 'Banco' },
    { key: 'monto_ventas', label: 'Ventas Tarjeta', amount: true }, { key: 'monto_extracto', label: 'Extracto', amount: true },
    { key: 'diferencia', label: 'Diferencia', amount: true }, { key: 'estado', label: 'Estado' },
  ];

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card"><h3>Total</h3><div className="value">{stats.total}</div></div>
        <div className="stat-card success"><h3>Conciliadas</h3><div className="value">{stats.conciliadas}</div></div>
        <div className="stat-card warning"><h3>Pendientes</h3><div className="value">{stats.pendientes}</div></div>
        <div className="stat-card danger"><h3>Diferencias</h3><div className="value">{formatCurrency(stats.diferencias)}</div></div>
      </div>
      <div className="stats-grid">
        <div className="stat-card accent"><h3>Total Ventas Tarjeta</h3><div className="value">{formatCurrency(stats.totalVentas)}</div></div>
        <div className="stat-card" style={{ borderLeft: '3px solid #facc15' }}><h3>Total Extracto</h3><div className="value" style={{ color: '#facc15' }}>{formatCurrency(stats.totalExtracto)}</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Conciliaciones Bancarias</h2>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Nueva Conciliacion</button>
        </div>

        <div className="alert alert-info">
          <strong>Conciliacion:</strong> Compare las ventas con tarjeta registradas contra los extractos bancarios.
        </div>

        <div style={{ padding: '0.75rem 1rem' }}>
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className={c.amount ? 'amount' : ''} style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => requestSort(c.key)}>
                    {c.label}<SortIcon config={sortConfig} column={c.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id}>
                  <td>{c.fecha}</td>
                  <td><strong>{c.banco}</strong></td>
                  <td className="amount">{formatCurrency(c.monto_ventas)}</td>
                  <td className="amount">{formatCurrency(c.monto_extracto)}</td>
                  <td className="amount" style={{ color: c.diferencia === 0 ? '#10b981' : '#ef4444', fontWeight: '600' }}>{formatCurrency(c.diferencia)}</td>
                  <td><span className={`badge ${c.estado === 'Conciliado' ? 'badge-success' : 'badge-warning'}`}>{c.estado === 'Conciliado' ? <><CheckCircle size={12} /> Conciliado</> : <><Clock size={12} /> Pendiente</>}</span></td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>Sin conciliaciones registradas</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`modal-overlay ${showModal ? 'active' : ''}`} onClick={() => setShowModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Nueva Conciliacion</h2>
          <form onSubmit={handleAdd}>
            <div className="form-group"><label>Banco</label><select value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} required><option value="">Seleccionar banco...</option><option value="Banco Nacion">Banco Nacion</option><option value="Banco Galicia">Banco Galicia</option><option value="Banco Santander">Banco Santander</option><option value="BBVA">BBVA</option><option value="Banco Macro">Banco Macro</option></select></div>
            <div className="form-row">
              <div className="form-group"><label>Monto Ventas Tarjeta ($)</label><input type="number" value={form.monto_ventas} onChange={(e) => setForm({ ...form, monto_ventas: e.target.value })} min="0" required /></div>
              <div className="form-group"><label>Monto Extracto ($)</label><input type="number" value={form.monto_extracto} onChange={(e) => setForm({ ...form, monto_extracto: e.target.value })} min="0" required /></div>
            </div>
            {form.monto_ventas && form.monto_extracto && (
              <div style={{ padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', background: parseFloat(form.monto_extracto) === parseFloat(form.monto_ventas) ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${parseFloat(form.monto_extracto) === parseFloat(form.monto_ventas) ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                <strong>Diferencia: {formatCurrency(parseFloat(form.monto_extracto) - parseFloat(form.monto_ventas))}</strong>
              </div>
            )}
            <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary">Registrar</button></div>
          </form>
        </div>
      </div>
    </div>
  );
}
