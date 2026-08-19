import { useState, useEffect } from 'react';
import { Plus, Download, Trash2, Edit3, ChevronDown, ChevronRight } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatCurrency';
import { today } from '../utils/dateUtils';
import { exportToCSV, exportToExcel, exportToPDF } from '../utils/exportUtils';
import { useSortableData } from '../hooks/useSortableData';
import DateFilter from '../components/DateFilter';
import toast from 'react-hot-toast';

const TARJETAS = ['Visa - Banco Nacion', 'Mastercard - Banco Galicia', 'Visa - Banco Santander', 'Amex - BBVA', 'Cabal - Banco Macro', 'Naranja'];

export default function Ventas() {
  const { user } = useAuth();
  const [ventas, setVentas] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [stats, setStats] = useState({ blanco: 0, negro: 0, tarjeta: 0, total: 0 });
  const [form, setForm] = useState({ categoria: 'Blanco', monto: '', descripcion: '', banco: TARJETAS[0], cuotas: '1' });
  const [editForm, setEditForm] = useState({ id: '', categoria: '', monto: '', descripcion: '', banco: '', cuotas: '' });
  const [expandedDates, setExpandedDates] = useState({});

  const { sorted } = useSortableData(filtered, 'fecha', 'desc');

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    let result = [...ventas];
    if (filter === 'Blanco') result = result.filter((v) => v.categoria === 'Blanco');
    else if (filter === 'Negro') result = result.filter((v) => v.categoria === 'Negro');
    else if (filter === 'Tarjeta') result = result.filter((v) => v.medio_pago === 'Tarjeta');
    if (dateFrom) result = result.filter((v) => v.fecha >= dateFrom);
    if (dateTo) result = result.filter((v) => v.fecha <= dateTo);
    setFiltered(result);
  }, [ventas, filter, dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await mockDB.getVentas();
      setVentas(data);
      const blanco = data.filter((v) => v.categoria === 'Blanco').reduce((s, v) => s + v.monto, 0);
      const negro = data.filter((v) => v.categoria === 'Negro').reduce((s, v) => s + v.monto, 0);
      const tarjeta = data.filter((v) => v.medio_pago === 'Tarjeta').reduce((s, v) => s + v.monto, 0);
      setStats({ blanco, negro, tarjeta, total: blanco + negro + tarjeta });
    } catch { toast.error('Error al cargar ventas'); }
    finally { setLoading(false); }
  };

  const groupedByDate = {};
  sorted.forEach((v) => {
    if (!groupedByDate[v.fecha]) groupedByDate[v.fecha] = [];
    groupedByDate[v.fecha].push(v);
  });
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  const toggleDate = (date) => setExpandedDates((prev) => ({ ...prev, [date]: !prev[date] }));

  const dayStats = (date) => {
    const items = groupedByDate[date] || [];
    const total = items.reduce((s, v) => s + v.monto, 0);
    const blanco = items.filter((v) => v.categoria === 'Blanco').reduce((s, v) => s + v.monto, 0);
    const negro = items.filter((v) => v.categoria === 'Negro').reduce((s, v) => s + v.monto, 0);
    const tarjeta = items.filter((v) => v.medio_pago === 'Tarjeta').reduce((s, v) => s + v.monto, 0);
    const count = items.length;
    return { total, blanco, negro, tarjeta, count };
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const monto = parseFloat(form.monto);
    if (!monto || monto <= 0) return toast.error('Monto invalido');
    const esTarjeta = form.categoria === 'Tarjeta';
    await mockDB.addVenta({
      fecha: today(), tipo: esTarjeta ? 'Tarjeta de Crédito / Débito' : (form.categoria === 'Blanco' ? 'Moneda Local' : 'Moneda Local 1'),
      categoria: esTarjeta ? null : form.categoria, medio_pago: esTarjeta ? 'Tarjeta' : 'Efectivo',
      banco: esTarjeta ? form.banco : null, cuotas: esTarjeta ? parseInt(form.cuotas) || 1 : 1,
      monto, descripcion: form.descripcion || `Venta ${form.categoria}`, usuario: user.email,
    });
    mockDB.addAuditLog(user.email, `Venta ${form.categoria}: ${formatCurrency(monto)}`, 'Ventas', form.descripcion);
    toast.success('Venta registrada');
    setShowModal(false);
    setForm({ categoria: 'Blanco', monto: '', descripcion: '', banco: TARJETAS[0], cuotas: '1' });
    loadData();
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const monto = parseFloat(editForm.monto);
    if (!monto || monto <= 0) return toast.error('Monto invalido');
    const esTarjeta = editForm.categoria === 'Tarjeta';
    await mockDB.updateVenta(editForm.id, {
      tipo: esTarjeta ? 'Tarjeta de Crédito / Débito' : (editForm.categoria === 'Blanco' ? 'Moneda Local' : 'Moneda Local 1'),
      categoria: esTarjeta ? null : editForm.categoria, medio_pago: esTarjeta ? 'Tarjeta' : 'Efectivo',
      banco: esTarjeta ? editForm.banco : null, cuotas: esTarjeta ? parseInt(editForm.cuotas) || 1 : 1,
      monto, descripcion: editForm.descripcion,
    });
    mockDB.addAuditLog(user.email, `Edicion venta`, 'Ventas', `${editForm.categoria} ${formatCurrency(monto)}`);
    toast.success('Venta actualizada');
    setShowEdit(false);
    loadData();
  };

  const openEdit = (v) => {
    setEditForm({ id: v.id, categoria: v.categoria || 'Tarjeta', monto: String(v.monto), descripcion: v.descripcion || '', banco: v.banco || TARJETAS[0], cuotas: String(v.cuotas || 1) });
    setShowEdit(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminar esta venta?')) return;
    await mockDB.deleteVenta(id, user.email);
    mockDB.addAuditLog(user.email, 'Eliminacion de venta', 'Ventas', `ID: ${id}`);
    toast.success('Venta eliminada');
    loadData();
  };

  const handleExport = (type) => {
    const data = sorted.map((v) => ({ Fecha: v.fecha, Tipo: v.tipo, Categoria: v.categoria || 'Tarjeta', Medio: v.medio_pago, Banco: v.banco || '-', Cuotas: v.cuotas, Monto: v.monto }));
    if (type === 'csv') exportToCSV(data, `ventas_${today()}`);
    else if (type === 'xlsx') exportToExcel(data, `ventas_${today()}`);
    else if (type === 'pdf') exportToPDF(data, [{ key: 'Fecha', header: 'Fecha' }, { key: 'Categoria', header: 'Tipo' },       { key: 'Monto', header: 'Monto', format: 'currency' }], 'Ventas - GLAMOURS', `ventas_${today()}`);
    toast.success(`Exportado como ${type.toUpperCase()}`);
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;
  const esTarjeta = form.categoria === 'Tarjeta';
  const editEsTarjeta = editForm.categoria === 'Tarjeta';

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card" style={{ borderLeftColor: '#d1d5db' }}><h3>Blanco (declarada)</h3><div className="value">{formatCurrency(stats.blanco)}</div><div className="subtitle">Efectivo declarado oficialmente</div></div>
        <div className="stat-card" style={{ borderLeftColor: '#818cf8' }}><h3>Negro (no declarada)</h3><div className="value">{formatCurrency(stats.negro)}</div><div className="subtitle">Efectivo no declarado</div></div>
        <div className="stat-card info"><h3>Tarjeta</h3><div className="value">{formatCurrency(stats.tarjeta)}</div><div className="subtitle">Credito / Debito</div></div>
        <div className="stat-card accent"><h3>Total Ventas</h3><div className="value">{formatCurrency(stats.total)}</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Listado de Ventas</h2>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Registrar Venta</button>
            <button className="btn btn-outline" onClick={() => handleExport('xlsx')}><Download size={16} /> Excel</button>
            <button className="btn btn-outline" onClick={() => handleExport('pdf')}><Download size={16} /> PDF</button>
          </div>
        </div>
        <div className="alert alert-info"><strong>Relacion con Caja:</strong> Las ventas en <strong>Efectivo (Blanco/Negro)</strong> se registran automaticamente como "Ingreso en Caja". Las ventas con <strong>Tarjeta</strong> NO impactan en caja.</div>
        <div className="filter-bar" style={{ flexDirection: 'column', gap: '0.5rem' }}>
          <div className="btn-group">
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'Blanco', label: 'Blanco (declarada)' },
              { key: 'Negro', label: 'Negro (no declarada)' },
              { key: 'Tarjeta', label: 'Tarjeta' },
            ].map((f) => (<button key={f.key} className={`btn btn-outline btn-sm ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>))}
          </div>
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>

        {/* Grouped by date */}
        <div style={{ padding: '0.5rem 0' }}>
          {sortedDates.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>Sin ventas</div>}
          {sortedDates.map((date) => {
            const expanded = expandedDates[date];
            const ds = dayStats(date);
            return (
              <div key={date} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div onClick={() => toggleDate(date)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', cursor: 'pointer', transition: 'background 0.2s', background: expanded ? 'rgba(255,255,255,0.03)' : 'transparent' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = expanded ? 'rgba(255,255,255,0.03)' : 'transparent'}>
                  {expanded ? <ChevronDown size={16} color="#d4af37" /> : <ChevronRight size={16} color="#9ca3af" />}
                  <strong style={{ minWidth: '100px', fontSize: '0.9rem' }}>{date}</strong>
                  <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{ds.count} ventas</span>
                  {ds.blanco > 0 && <span style={{ fontSize: '0.7rem', color: '#d1d5db', background: 'rgba(209,213,219,0.1)', padding: '2px 6px', borderRadius: '4px' }}>B: {formatCurrency(ds.blanco)}</span>}
                  {ds.negro > 0 && <span style={{ fontSize: '0.7rem', color: '#818cf8', background: 'rgba(129,140,248,0.1)', padding: '2px 6px', borderRadius: '4px' }}>N: {formatCurrency(ds.negro)}</span>}
                  {ds.tarjeta > 0 && <span style={{ fontSize: '0.7rem', color: '#22d3ee', background: 'rgba(34,211,238,0.1)', padding: '2px 6px', borderRadius: '4px' }}>T: {formatCurrency(ds.tarjeta)}</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontWeight: '700', color: '#d4af37' }}>{formatCurrency(ds.total)}</span>
                </div>
                {expanded && (
                  <div style={{ padding: '0 1rem 0.75rem 2.5rem' }}>
                    <table style={{ width: '100%' }}>
                      <thead><tr><th>Categoria</th><th>Medio</th><th>Banco</th><th>Cuotas</th><th>Descripcion</th><th className="amount">Monto</th><th>Acciones</th></tr></thead>
                      <tbody>
                        {(groupedByDate[date] || []).map((v) => (
                          <tr key={v.id}>
                            <td>
                              {v.medio_pago === 'Tarjeta'
                                ? <span className="badge badge-info">Tarjeta</span>
                                : v.categoria === 'Blanco'
                                  ? <span className="badge badge-neutral" style={{ background: 'rgba(209,213,219,0.15)', color: '#d1d5db', border: '1px solid rgba(209,213,219,0.3)' }}>Blanco (declarada)</span>
                                  : <span className="badge" style={{ background: 'rgba(129,140,248,0.15)', color: '#818cf8', border: '1px solid rgba(129,140,248,0.3)' }}>Negro (no declarada)</span>
                              }
                            </td>
                            <td>{v.medio_pago}</td>
                            <td>{v.banco || '-'}</td>
                            <td>{v.cuotas}</td>
                            <td style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{v.descripcion || '-'}</td>
                            <td className="amount" style={{ fontWeight: '700' }}>{formatCurrency(v.monto)}</td>
                            <td style={{ display: 'flex', gap: '0.25rem' }}>
                              <button className="btn-icon" onClick={() => openEdit(v)} title="Editar"><Edit3 size={14} /></button>
                              <button className="btn-icon" onClick={() => handleDelete(v.id)} title="Eliminar"><Trash2 size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Registrar */}
      <div className={`modal-overlay ${showModal ? 'active' : ''}`} onClick={() => setShowModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Registrar Venta</h2>
          <form onSubmit={handleAdd}>
            <div className="form-group"><label>Tipo de Venta</label><select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}><option value="Blanco">Efectivo Blanco (declarada)</option><option value="Negro">Efectivo Negro (no declarada)</option><option value="Tarjeta">Tarjeta de Credito/Debito</option></select></div>
            {esTarjeta && (<div className="form-row"><div className="form-group"><label>Banco/Marca</label><select value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })}>{TARJETAS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div><div className="form-group"><label>Cuotas</label><input type="number" value={form.cuotas} onChange={(e) => setForm({ ...form, cuotas: e.target.value })} min="1" max="48" /></div></div>)}
            <div className="form-group"><label>Monto ($)</label><input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} min="1" required /></div>
            <div className="form-group"><label>Descripcion</label><input type="text" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Detalle de la venta" /></div>
            <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary">Registrar Venta</button></div>
          </form>
        </div>
      </div>

      {/* Modal Editar */}
      <div className={`modal-overlay ${showEdit ? 'active' : ''}`} onClick={() => setShowEdit(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2><Edit3 size={18} /> Editar Venta</h2>
          <form onSubmit={handleEdit}>
            <div className="form-group"><label>Tipo de Venta</label><select value={editForm.categoria} onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value })}><option value="Blanco">Efectivo Blanco (declarada)</option><option value="Negro">Efectivo Negro (no declarada)</option><option value="Tarjeta">Tarjeta de Credito/Debito</option></select></div>
            {editEsTarjeta && (<div className="form-row"><div className="form-group"><label>Banco/Marca</label><select value={editForm.banco} onChange={(e) => setEditForm({ ...editForm, banco: e.target.value })}>{TARJETAS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div><div className="form-group"><label>Cuotas</label><input type="number" value={editForm.cuotas} onChange={(e) => setEditForm({ ...editForm, cuotas: e.target.value })} min="1" max="48" /></div></div>)}
            <div className="form-group"><label>Monto ($)</label><input type="number" value={editForm.monto} onChange={(e) => setEditForm({ ...editForm, monto: e.target.value })} min="1" required /></div>
            <div className="form-group"><label>Descripcion</label><input type="text" value={editForm.descripcion} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} /></div>
            <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowEdit(false)}>Cancelar</button><button type="submit" className="btn btn-primary">Guardar Cambios</button></div>
          </form>
        </div>
      </div>
    </div>
  );
}
