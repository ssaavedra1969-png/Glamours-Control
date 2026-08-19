import { useState, useEffect } from 'react';
import { Plus, Download, Trash2, Edit3, ChevronDown, ChevronRight } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatCurrency';
import { today } from '../utils/dateUtils';
import { exportToCSV, exportToExcel, exportToPDF } from '../utils/exportUtils';
import DateFilter from '../components/DateFilter';
import toast from 'react-hot-toast';

export default function Caja() {
  const { user } = useAuth();
  const [movimientos, setMovimientos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todos');
  const [filterCat, setFilterCat] = useState('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCierre, setShowCierre] = useState(false);
  const [form, setForm] = useState({ tipo: 'Ingreso en Caja', categoria: 'Blanco', monto: '', descripcion: '' });
  const [editForm, setEditForm] = useState({ id: '', tipo: '', categoria: '', monto: '', descripcion: '' });
  const [cierreForm, setCierreForm] = useState({ saldo_real_blanco: '', saldo_real_negro: '', observaciones: '' });
  const [stats, setStats] = useState({ saldo_blanco: 0, saldo_negro: 0, ingresos_hoy: 0, egresos_hoy: 0 });
  const [expandedDates, setExpandedDates] = useState({});

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    let result = [...movimientos];
    if (filter === 'Ingreso') result = result.filter((m) => m.codigo === 502);
    else if (filter === 'Egreso') result = result.filter((m) => m.codigo === 501);
    else if (filter === 'Retiro') result = result.filter((m) => m.codigo === 503);
    if (filterCat === 'Blanco') result = result.filter((m) => m.categoria === 'Blanco');
    else if (filterCat === 'Negro') result = result.filter((m) => m.categoria === 'Negro');
    if (dateFrom) result = result.filter((m) => m.fecha >= dateFrom);
    if (dateTo) result = result.filter((m) => m.fecha <= dateTo);
    setFiltered(result);
  }, [movimientos, filter, filterCat, dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await mockDB.getCaja();
      setMovimientos(data);
      const saldoBlanco = data.filter((m) => m.categoria === 'Blanco').length > 0 ? data.filter((m) => m.categoria === 'Blanco')[0].saldo_nuevo : 0;
      const saldoNegro = data.filter((m) => m.categoria === 'Negro').length > 0 ? data.filter((m) => m.categoria === 'Negro')[0].saldo_nuevo : 0;
      const hoy = today();
      const movsHoy = data.filter((m) => m.fecha === hoy);
      const ingresos = movsHoy.filter((m) => m.codigo === 502).reduce((s, m) => s + m.monto, 0);
      const egresos = movsHoy.filter((m) => [501, 503].includes(m.codigo)).reduce((s, m) => s + m.monto, 0);
      setStats({ saldo_blanco: saldoBlanco, saldo_negro: saldoNegro, ingresos_hoy: ingresos, egresos_hoy: egresos });
    } catch { toast.error('Error al cargar caja'); }
    finally { setLoading(false); }
  };

  const groupedByDate = {};
  filtered.forEach((m) => {
    if (!groupedByDate[m.fecha]) groupedByDate[m.fecha] = [];
    groupedByDate[m.fecha].push(m);
  });
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  const toggleDate = (date) => setExpandedDates((prev) => ({ ...prev, [date]: !prev[date] }));

  const dayStats = (date) => {
    const items = groupedByDate[date] || [];
    const ingresos = items.filter((m) => m.codigo === 502).reduce((s, m) => s + m.monto, 0);
    const egresos = items.filter((m) => [501, 503].includes(m.codigo)).reduce((s, m) => s + m.monto, 0);
    const blanco = items.filter((m) => m.categoria === 'Blanco').reduce((s, m) => s + (m.codigo === 502 ? m.monto : -m.monto), 0);
    const negro = items.filter((m) => m.categoria === 'Negro').reduce((s, m) => s + (m.codigo === 502 ? m.monto : -m.monto), 0);
    return { count: items.length, ingresos, egresos, blanco, negro };
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.monto || parseFloat(form.monto) <= 0) return toast.error('Monto invalido');
    const codigo = form.tipo === 'Ingreso en Caja' ? 502 : form.tipo === 'Egreso en Caja' ? 501 : 503;
    try {
      await mockDB.addCajaMovimiento({ fecha: today(), tipo: form.tipo, codigo, categoria: form.categoria, descripcion: form.descripcion || form.tipo, monto: Math.abs(parseFloat(form.monto)), usuario: user.email });
      mockDB.addAuditLog(user.email, `${form.tipo} (${form.categoria}): ${formatCurrency(form.monto)}`, 'Caja', form.descripcion);
      toast.success('Movimiento registrado');
      setShowModal(false);
      setForm({ tipo: 'Ingreso en Caja', categoria: 'Blanco', monto: '', descripcion: '' });
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editForm.monto || parseFloat(editForm.monto) <= 0) return toast.error('Monto invalido');
    const codigo = editForm.tipo === 'Ingreso en Caja' ? 502 : editForm.tipo === 'Egreso en Caja' ? 501 : 503;
    await mockDB.updateCajaMovimiento(editForm.id, {
      tipo: editForm.tipo, codigo, categoria: editForm.categoria,
      monto: Math.abs(parseFloat(editForm.monto)), descripcion: editForm.descripcion,
    });
    mockDB.addAuditLog(user.email, 'Edicion movimiento caja', 'Caja', `${editForm.tipo} ${formatCurrency(editForm.monto)}`);
    toast.success('Movimiento actualizado');
    setShowEdit(false);
    loadData();
  };

  const openEdit = (m) => {
    setEditForm({ id: m.id, tipo: m.tipo, categoria: m.categoria || 'Blanco', monto: String(m.monto), descripcion: m.descripcion });
    setShowEdit(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminar este movimiento?')) return;
    await mockDB.deleteCajaMovimiento(id, user.email);
    mockDB.addAuditLog(user.email, 'Eliminacion de movimiento', 'Caja', `ID: ${id}`);
    toast.success('Movimiento eliminado');
    loadData();
  };

  const handleCierre = async (e) => {
    e.preventDefault();
    const saldoRealB = parseFloat(cierreForm.saldo_real_blanco) || 0;
    const saldoRealN = parseFloat(cierreForm.saldo_real_negro) || 0;
    const diffBlanco = saldoRealB - stats.saldo_blanco;
    const diffNegro = saldoRealN - stats.saldo_negro;
    const diffTotal = diffBlanco + diffNegro;
    await mockDB.addCierre({
      fecha: today(), saldo_teorico_blanco: stats.saldo_blanco, saldo_real_blanco: saldoRealB, diferencia_blanco: diffBlanco,
      saldo_teorico_negro: stats.saldo_negro, saldo_real_negro: saldoRealN, diferencia_negro: diffNegro,
      saldo_teorico: stats.saldo_blanco + stats.saldo_negro, saldo_real: saldoRealB + saldoRealN, diferencia: diffTotal,
      observaciones: cierreForm.observaciones, usuario: user.email,
    });
    mockDB.addAuditLog(user.email, 'Cierre de caja', 'Caja', `Dif: ${formatCurrency(diffTotal)}`);
    toast.success(diffTotal === 0 ? 'Cierre perfecto' : `Cierre con diferencia: ${formatCurrency(diffTotal)}`);
    setShowCierre(false);
    setCierreForm({ saldo_real_blanco: '', saldo_real_negro: '', observaciones: '' });
  };

  const handleExport = (type) => {
    const data = filtered.map((m) => ({ Fecha: m.fecha, Tipo: m.tipo, Categoria: m.categoria, Descripcion: m.descripcion, Monto: m.monto, Saldo: m.saldo_nuevo, Origen: m.origen }));
    if (type === 'csv') exportToCSV(data, `caja_${today()}`);
    else if (type === 'xlsx') exportToExcel(data, `caja_${today()}`);
    else if (type === 'pdf') exportToPDF(data, [{ key: 'Fecha', header: 'Fecha' }, { key: 'Tipo', header: 'Tipo' }, { key: 'Categoria', header: 'Cat.' }, { key: 'Descripcion', header: 'Descripcion' }, { key: 'Monto', header: 'Monto', format: 'currency' }, { key: 'Saldo', header: 'Saldo', format: 'currency' }], 'Libro de Caja - GLAMOURS', `caja_${today()}`);
    toast.success(`Exportado como ${type.toUpperCase()}`);
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card" style={{ borderLeft: '3px solid #facc15' }}><h3>Saldo Blanco</h3><div className="value" style={{ color: '#facc15' }}>{formatCurrency(stats.saldo_blanco)}</div><div className="subtitle">Efectivo declarado</div></div>
        <div className="stat-card" style={{ borderLeft: '3px solid #6b7280' }}><h3>Saldo Negro</h3><div className="value" style={{ color: '#9ca3af' }}>{formatCurrency(stats.saldo_negro)}</div><div className="subtitle">Efectivo no declarado</div></div>
        <div className="stat-card success"><h3>Ingresos Hoy</h3><div className="value">{formatCurrency(stats.ingresos_hoy)}</div><div className="subtitle">502 - Ingreso en Caja</div></div>
        <div className="stat-card danger"><h3>Egresos Hoy</h3><div className="value">{formatCurrency(stats.egresos_hoy)}</div><div className="subtitle">501/503 - Egreso/Retiro</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Libro de Caja</h2>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Registrar</button>
            <button className="btn btn-accent" onClick={() => setShowCierre(true)}>Cerrar Caja</button>
            <button className="btn btn-outline" onClick={() => handleExport('xlsx')}><Download size={16} /> Excel</button>
            <button className="btn btn-outline" onClick={() => handleExport('pdf')}><Download size={16} /> PDF</button>
          </div>
        </div>
        <div className="filter-bar" style={{ flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="btn-group">
              {['todos', 'Ingreso', 'Egreso', 'Retiro'].map((f) => (<button key={f} className={`btn btn-outline btn-sm ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f === 'todos' ? 'Todos' : f + 's'}</button>))}
            </div>
            <div className="btn-group">
              {['todos', 'Blanco', 'Negro'].map((c) => (<button key={c} className={`btn btn-outline btn-sm ${filterCat === c ? 'active' : ''}`} onClick={() => setFilterCat(c)} style={c === 'Blanco' ? { borderColor: c === filterCat ? '#facc15' : undefined, color: c === filterCat ? '#facc15' : undefined } : c === 'Negro' ? { borderColor: c === filterCat ? '#9ca3af' : undefined, color: c === filterCat ? '#9ca3af' : undefined } : {}}>{c === 'todos' ? 'Todas' : c}</button>))}
            </div>
          </div>
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>

        {/* Grouped by date */}
        <div style={{ padding: '0.5rem 0' }}>
          {sortedDates.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>Sin movimientos</div>}
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
                  <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{ds.count} movs</span>
                  {ds.ingresos > 0 && <span style={{ fontSize: '0.7rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: '4px' }}>+{formatCurrency(ds.ingresos)}</span>}
                  {ds.egresos > 0 && <span style={{ fontSize: '0.7rem', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: '4px' }}>-{formatCurrency(ds.egresos)}</span>}
                  {ds.blanco !== 0 && <span style={{ fontSize: '0.7rem', color: '#facc15', background: 'rgba(250,204,21,0.1)', padding: '2px 6px', borderRadius: '4px' }}>B: {ds.blanco > 0 ? '+' : ''}{formatCurrency(ds.blanco)}</span>}
                  {ds.negro !== 0 && <span style={{ fontSize: '0.7rem', color: '#9ca3af', background: 'rgba(156,163,175,0.1)', padding: '2px 6px', borderRadius: '4px' }}>N: {ds.negro > 0 ? '+' : ''}{formatCurrency(ds.negro)}</span>}
                </div>
                {expanded && (
                  <div style={{ padding: '0 1rem 0.75rem 2.5rem' }}>
                    <table style={{ width: '100%' }}>
                      <thead>
                        <tr><th>Tipo</th><th>Categoria</th><th>Descripcion</th><th>Origen</th><th className="amount">Monto</th><th className="amount">Saldo</th><th>Acciones</th></tr>
                      </thead>
                      <tbody>
                        {(groupedByDate[date] || []).map((m) => (
                          <tr key={m.id}>
                            <td><span className={`badge ${m.codigo === 502 ? 'badge-success' : m.codigo === 501 ? 'badge-danger' : 'badge-warning'}`}>{m.tipo}</span></td>
                            <td>
                              <span style={{
                                display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600',
                                background: m.categoria === 'Blanco' ? 'rgba(250,204,21,0.15)' : 'rgba(156,163,175,0.15)',
                                color: m.categoria === 'Blanco' ? '#facc15' : '#9ca3af',
                              }}>
                                {m.categoria || 'Blanco'}
                              </span>
                            </td>
                            <td style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{m.descripcion}</td>
                            <td><span className="badge badge-neutral">{m.origen}</span></td>
                            <td className="amount" style={{ color: m.codigo === 502 ? '#10b981' : '#ef4444', fontWeight: '700' }}>
                              {m.codigo === 502 ? '+' : '-'}{formatCurrency(m.monto)}
                            </td>
                            <td className="amount">{formatCurrency(m.saldo_nuevo)}</td>
                            <td style={{ display: 'flex', gap: '0.25rem' }}>
                              <button className="btn-icon" onClick={() => openEdit(m)} title="Editar"><Edit3 size={14} /></button>
                              {m.origen === 'manual' && <button className="btn-icon" onClick={() => handleDelete(m.id)} title="Eliminar"><Trash2 size={14} /></button>}
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
          <h2>Registrar Movimiento de Caja</h2>
          <form onSubmit={handleAdd}>
            <div className="form-group"><label>Categoria</label><select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}><option value="Blanco">Blanco (Declarado)</option><option value="Negro">Negro (No declarado)</option></select></div>
            <div className="form-group"><label>Tipo</label><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="Ingreso en Caja">Ingreso en Caja (502)</option><option value="Egreso en Caja">Egreso en Caja (501)</option><option value="Retiro de Caja">Retiro de Caja (503)</option></select></div>
            <div className="form-group"><label>Monto ($)</label><input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} min="1" required /></div>
            <div className="form-group"><label>Descripcion</label><input type="text" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Motivo del movimiento" /></div>
            <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary">Registrar</button></div>
          </form>
        </div>
      </div>

      {/* Modal Editar */}
      <div className={`modal-overlay ${showEdit ? 'active' : ''}`} onClick={() => setShowEdit(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2><Edit3 size={18} /> Editar Movimiento</h2>
          <form onSubmit={handleEdit}>
            <div className="form-group"><label>Categoria</label><select value={editForm.categoria} onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value })}><option value="Blanco">Blanco (Declarado)</option><option value="Negro">Negro (No declarado)</option></select></div>
            <div className="form-group"><label>Tipo</label><select value={editForm.tipo} onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })}><option value="Ingreso en Caja">Ingreso en Caja (502)</option><option value="Egreso en Caja">Egreso en Caja (501)</option><option value="Retiro de Caja">Retiro de Caja (503)</option></select></div>
            <div className="form-group"><label>Monto ($)</label><input type="number" value={editForm.monto} onChange={(e) => setEditForm({ ...editForm, monto: e.target.value })} min="1" required /></div>
            <div className="form-group"><label>Descripcion</label><input type="text" value={editForm.descripcion} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} /></div>
            <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowEdit(false)}>Cancelar</button><button type="submit" className="btn btn-primary">Guardar Cambios</button></div>
          </form>
        </div>
      </div>

      {/* Modal Cierre */}
      <div className={`modal-overlay ${showCierre ? 'active' : ''}`} onClick={() => setShowCierre(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Cierre de Caja Diario</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', background: 'rgba(250,204,21,0.08)', borderRadius: '8px', border: '1px solid rgba(250,204,21,0.2)' }}>
              <div style={{ fontSize: '0.8rem', color: '#facc15', marginBottom: '0.25rem' }}>Saldo Teorico Blanco</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#facc15' }}>{formatCurrency(stats.saldo_blanco)}</div>
            </div>
            <div style={{ padding: '1rem', background: 'rgba(156,163,175,0.08)', borderRadius: '8px', border: '1px solid rgba(156,163,175,0.2)' }}>
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.25rem' }}>Saldo Teorico Negro</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#9ca3af' }}>{formatCurrency(stats.saldo_negro)}</div>
            </div>
          </div>
          <form onSubmit={handleCierre}>
            <div className="form-group"><label>Saldo Real Blanco</label><input type="number" value={cierreForm.saldo_real_blanco} onChange={(e) => setCierreForm({ ...cierreForm, saldo_real_blanco: e.target.value })} min="0" required placeholder="Efectivo declarado" /></div>
            <div className="form-group"><label>Saldo Real Negro</label><input type="number" value={cierreForm.saldo_real_negro} onChange={(e) => setCierreForm({ ...cierreForm, saldo_real_negro: e.target.value })} min="0" required placeholder="Efectivo no declarado" /></div>
            <div className="form-group"><label>Observaciones</label><textarea value={cierreForm.observaciones} onChange={(e) => setCierreForm({ ...cierreForm, observaciones: e.target.value })} placeholder="Observaciones (opcional)" /></div>
            {cierreForm.saldo_real_blanco && (<div style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', marginBottom: '0.5rem', background: parseFloat(cierreForm.saldo_real_blanco) === stats.saldo_blanco ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${parseFloat(cierreForm.saldo_real_blanco) === stats.saldo_blanco ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}><span style={{ fontSize: '0.85rem' }}>Dif. Blanco: <strong style={{ color: parseFloat(cierreForm.saldo_real_blanco) === stats.saldo_blanco ? '#10b981' : '#ef4444' }}>{formatCurrency(parseFloat(cierreForm.saldo_real_blanco) - stats.saldo_blanco)}</strong></span></div>)}
            {cierreForm.saldo_real_negro && (<div style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', marginBottom: '1rem', background: parseFloat(cierreForm.saldo_real_negro) === stats.saldo_negro ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${parseFloat(cierreForm.saldo_real_negro) === stats.saldo_negro ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}><span style={{ fontSize: '0.85rem' }}>Dif. Negro: <strong style={{ color: parseFloat(cierreForm.saldo_real_negro) === stats.saldo_negro ? '#10b981' : '#ef4444' }}>{formatCurrency(parseFloat(cierreForm.saldo_real_negro) - stats.saldo_negro)}</strong></span></div>)}
            <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowCierre(false)}>Cancelar</button><button type="submit" className="btn btn-accent">Confirmar Cierre</button></div>
          </form>
        </div>
      </div>
    </div>
  );
}
