import { useState, useEffect } from 'react';
import { Plus, Download, Trash2, Edit3, ChevronDown, ChevronRight, ShoppingCart, Filter } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatCurrency';
import { today, defaultDateFrom, defaultDateTo } from '../utils/dateUtils';
import { exportToCSV, exportToExcel, exportToPDF } from '../utils/exportUtils';
import { useSortableData } from '../hooks/useSortableData';
import DateFilter from '../components/DateFilter';
import { classificarVenta, VENTA_TYPES as TYPES, VENTA_TYPE_CFG as TIPO_CFG, VENTA_BADGES as BADGES } from '../utils/ventaTypes';
import toast from 'react-hot-toast';

const TARJETAS = ['Visa - Banco Nacion', 'Mastercard - Banco Galicia', 'Visa - Banco Santander', 'Amex - BBVA', 'Cabal - Banco Macro', 'Naranja'];

export default function Ventas() {
  const { user, isAdmin } = useAuth();
  const [ventas, setVentas] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todos');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [dateTo, setDateTo] = useState(defaultDateTo());
  const [showModal, setShowModal] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [stats, setStats] = useState({ blanco: 0, negro: 0, tarjeta_credito: 0, debito: 0, transferencia: 0, total: 0 });
  const [form, setForm] = useState({ categoria: 'Blanco', monto: '', descripcion: '', banco: TARJETAS[0], cuotas: '1' });
  const [editForm, setEditForm] = useState({ id: '', categoria: '', monto: '', descripcion: '', banco: '', cuotas: '' });
  const [expandedDates, setExpandedDates] = useState({});

  const { sorted } = useSortableData(filtered, 'fecha', 'desc');

  useEffect(() => { loadData(); }, [dateFrom, dateTo]);

  useEffect(() => {
    let result = [...ventas];
    if (filter !== 'todos') result = result.filter((v) => classificarVenta(v) === filter);
    setFiltered(result);
  }, [ventas, filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await mockDB.getVentas(dateFrom || undefined, dateTo || undefined);
      setVentas(data);
      const st = { blanco: 0, negro: 0, tarjeta_credito: 0, debito: 0, transferencia: 0 };
      data.forEach((v) => { st[classificarVenta(v)] += v.monto; });
      st.total = TYPES.reduce((s, t) => s + st[t], 0);
      setStats(st);
    } catch (err) { console.error('Error cargando ventas:', err); toast.error('Error al cargar ventas: ' + (err.message || err.code || 'desconocido')); }
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
    const t = { blanco: 0, negro: 0, tarjeta_credito: 0, debito: 0, transferencia: 0 };
    items.forEach((v) => { t[classificarVenta(v)] += v.monto; });
    return { ...t, total: items.reduce((s, v) => s + v.monto, 0), count: items.length };
  };

  // Desglose por banco para las cards de tipo
  const porBanco = {};
  TYPES.forEach((t) => { porBanco[t] = {}; });
  filtered.forEach((v) => {
    const k = classificarVenta(v);
    const brand = v.banco || (k === 'blanco' || k === 'negro' ? 'Efectivo' : 'Otro');
    porBanco[k][brand] = (porBanco[k][brand] || 0) + v.monto;
  });

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
    mockDB.addAuditLog(user.email, 'Edicion venta', 'Ventas', `${editForm.categoria} ${formatCurrency(monto)}`);
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

  const handleDeleteDia = async (date) => {
    const items = groupedByDate[date] || [];
    if (!confirm(`Eliminar TODAS las ventas del dia ${date} (${items.length})? Esta accion no se puede deshacer.`)) return;
    try {
      const n = await mockDB.deleteVentasDia(date, user.email);
      toast.success(`Dia ${date} eliminado (${n} ventas)`);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleExport = (type) => {
    const data = sorted.map((v) => ({ Fecha: v.fecha, Tipo: v.tipo, Categoria: v.categoria || 'Tarjeta', Medio: v.medio_pago, Banco: v.banco || '-', Cuotas: v.cuotas, Monto: v.monto }));
    if (type === 'csv') exportToCSV(data, `ventas_${today()}`);
    else if (type === 'xlsx') exportToExcel(data, `ventas_${today()}`);
    else if (type === 'pdf') exportToPDF(data, [{ key: 'Fecha', header: 'Fecha' }, { key: 'Categoria', header: 'Tipo' }, { key: 'Monto', header: 'Monto', format: 'currency' }], 'Libro de Ventas - GLAMOURS', `ventas_${today()}`);
    toast.success(`Exportado como ${type.toUpperCase()}`);
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  const esTarjeta = form.categoria === 'Tarjeta';
  const editEsTarjeta = editForm.categoria === 'Tarjeta';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ============================================ */}
      {/* SECCION 1: RESUMEN DE VENTAS                */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #d4af37 0%, #b8960c 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShoppingCart size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Libro de Ventas</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>Ventas del periodo seleccionado</p>
          </div>
        </div>

        {/* Hero: Total */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          border: '1px solid rgba(212,175,55,0.2)',
          borderRadius: '16px', padding: '1.75rem 2rem',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '6rem', opacity: 0.03, fontWeight: '900' }}>$</div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '700', marginBottom: '0.5rem' }}>
            Total Ventas del Periodo
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#d4af37', lineHeight: '1.1', letterSpacing: '-0.02em' }}>
            {formatCurrency(stats.total)}
          </div>
        </div>

        {/* Cards por tipo (5) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          {TYPES.map((tipo) => {
            const cfg = TIPO_CFG[tipo];
            const val = stats[tipo];
            const subItems = Object.entries(porBanco[tipo]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

            return (
              <div key={tipo} style={{
                background: cfg.gradient,
                borderRadius: '14px', padding: '1.25rem',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>{cfg.icon}</span>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '0.85rem', color: cfg.color, lineHeight: '1.2' }}>{cfg.label}</div>
                    <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>{cfg.desc}</div>
                  </div>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>{formatCurrency(val)}</div>

                {subItems.length > 0 && (
                  <div style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.6rem' }}>
                    {subItems.slice(0, 4).map(([brand, monto]) => (
                      <div key={brand} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.15rem 0' }}>
                        <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{brand}</span>
                        <span style={{ fontSize: '0.75rem', color: cfg.color, fontWeight: '600' }}>{formatCurrency(monto)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 2: FILTROS Y ACCIONES              */}
      {/* ============================================ */}
      <section>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '1rem 1.25rem',
          marginBottom: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ fontSize: '0.85rem' }}><Plus size={16} /> Registrar Venta</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => handleExport('xlsx')} style={{ fontSize: '0.85rem' }}><Download size={14} /> Excel</button>
            <button className="btn btn-outline" onClick={() => handleExport('pdf')} style={{ fontSize: '0.85rem' }}><Download size={14} /> PDF</button>
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '1rem 1.25rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#d4af37' }}>
            <Filter size={14} />
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filtros</span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'blanco', label: 'Blanco', color: '#e2e8f0' },
              { key: 'negro', label: 'Negro', color: '#a78bfa' },
              { key: 'tarjeta_credito', label: 'Tarjeta', color: '#fbbf24' },
              { key: 'debito', label: 'Débito', color: '#60a5fa' },
              { key: 'transferencia', label: 'QR', color: '#34d399' },
            ].map((f) => (
              <button key={f.key} className={`btn btn-outline btn-sm ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}
                style={{ fontSize: '0.75rem', borderColor: filter === f.key ? f.color : undefined, color: filter === f.key ? f.color : undefined }}>
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 3: MOVIMIENTOS POR DIA             */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #d4af37 0%, #b8960c 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '1.2rem' }}>📋</span>
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Movimientos</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
              {filtered.length} ventas en {sortedDates.length} dias
              {dateFrom && dateTo && ` (${dateFrom} al ${dateTo})`}
            </p>
          </div>
        </div>

        <div style={{
          background: 'rgba(212,175,55,0.05)',
          border: '1px solid rgba(212,175,55,0.15)',
          borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem',
          fontSize: '0.78rem', color: '#9ca3af',
        }}>
          <strong style={{ color: '#d4af37' }}>Relacion con Caja:</strong> Las ventas en <strong>Efectivo (Blanco/Negro)</strong> se registran automaticamente como "Ingreso en Caja". Las ventas con <strong>Tarjeta</strong> NO impactan en caja.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sortedDates.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '3rem',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '14px', color: '#6b7280',
            }}>
              Sin ventas en este periodo
            </div>
          )}

          {sortedDates.map((date) => {
            const expanded = expandedDates[date];
            const ds = dayStats(date);
            return (
              <div key={date} style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px', overflow: 'hidden',
              }}>
                <div onClick={() => toggleDate(date)} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '1rem 1.25rem', cursor: 'pointer',
                  background: expanded ? 'rgba(255,255,255,0.04)' : 'transparent',
                  transition: 'background 0.2s',
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = expanded ? 'rgba(255,255,255,0.04)' : 'transparent'}>
                  {expanded ? <ChevronDown size={18} color="#d4af37" /> : <ChevronRight size={18} color="#6b7280" />}

                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: '0.95rem', color: '#f3f4f6' }}>{date}</strong>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem' }}>
                      {ds.count} venta{ds.count !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {ds.blanco > 0 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#e2e8f0', background: 'rgba(209,213,219,0.1)', padding: '0.2rem 0.5rem', borderRadius: '8px' }}>
                        B: {formatCurrency(ds.blanco)}
                      </span>
                    )}
                    {ds.negro > 0 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#a78bfa', background: 'rgba(129,140,248,0.1)', padding: '0.2rem 0.5rem', borderRadius: '8px' }}>
                        N: {formatCurrency(ds.negro)}
                      </span>
                    )}
                    {ds.tarjeta_credito > 0 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#fbbf24', background: 'rgba(251,191,36,0.1)', padding: '0.2rem 0.5rem', borderRadius: '8px' }}>
                        TC: {formatCurrency(ds.tarjeta_credito)}
                      </span>
                    )}
                    {ds.debito > 0 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', padding: '0.2rem 0.5rem', borderRadius: '8px' }}>
                        D: {formatCurrency(ds.debito)}
                      </span>
                    )}
                    {ds.transferencia > 0 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#34d399', background: 'rgba(52,211,153,0.1)', padding: '0.2rem 0.5rem', borderRadius: '8px' }}>
                        QR: {formatCurrency(ds.transferencia)}
                      </span>
                    )}
                    <span style={{ fontSize: '0.9rem', fontWeight: '900', color: '#d4af37', marginLeft: '0.25rem' }}>
                      {formatCurrency(ds.total)}
                    </span>
                  </div>

                  {isAdmin && (
                    <button
                      className="btn-icon"
                      title="Eliminar el dia completo"
                      onClick={(e) => { e.stopPropagation(); handleDeleteDia(date); }}
                      style={{ color: '#ef4444', flexShrink: 0 }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {expanded && (
                  <div style={{
                    padding: '0 1.25rem 1.25rem',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Categoria</th>
                          <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Medio</th>
                          <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Banco</th>
                          <th style={{ textAlign: 'center', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Cuotas</th>
                          <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Descripcion</th>
                          <th style={{ textAlign: 'right', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Monto</th>
                          <th style={{ textAlign: 'right', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(groupedByDate[date] || []).map((v) => (
                          <tr key={v.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '0.6rem 0.5rem' }}>
                              {(() => {
                                const [label, bg, color] = BADGES[classificarVenta(v)];
                                return <span style={{ fontSize: '0.72rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '6px', background: bg, color }}>{label}</span>;
                              })()}
                            </td>
                            <td style={{ padding: '0.6rem 0.5rem', color: '#9ca3af', fontSize: '0.82rem' }}>{v.medio_pago}</td>
                            <td style={{ padding: '0.6rem 0.5rem', color: '#9ca3af', fontSize: '0.82rem' }}>{v.banco || '-'}</td>
                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: '#6b7280', fontSize: '0.82rem' }}>{v.cuotas}</td>
                            <td style={{ padding: '0.6rem 0.5rem', color: '#9ca3af', fontSize: '0.82rem' }}>{v.descripcion || '-'}</td>
                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: '#d4af37', fontWeight: '800', fontSize: '0.85rem' }}>
                              {formatCurrency(v.monto)}
                            </td>
                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                <button className="btn-icon" onClick={() => openEdit(v)} title="Editar"><Edit3 size={14} /></button>
                                <button className="btn-icon" onClick={() => handleDelete(v.id)} title="Eliminar"><Trash2 size={14} /></button>
                              </div>
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
      </section>

      {/* ============================================ */}
      {/* MODALS                                      */}
      {/* ============================================ */}

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
