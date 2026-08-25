import { useState, useEffect, Fragment } from 'react';
import { Plus, Download, Trash2, Edit3, ChevronDown, ChevronRight, Wallet, Filter, RefreshCw } from 'lucide-react';
import mockDB, { SALDO_VERSION } from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatCurrency';
import { today, defaultDateFrom, defaultDateTo } from '../utils/dateUtils';
import { exportToCSV, exportToExcel, exportToPDF } from '../utils/exportUtils';
import DateFilter from '../components/DateFilter';
import toast from 'react-hot-toast';

export default function Caja() {
  const { user, isAdmin } = useAuth();
  const [movimientos, setMovimientos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todos');
  const [filterCat, setFilterCat] = useState('todos');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [dateTo, setDateTo] = useState(defaultDateTo());
  const [showModal, setShowModal] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCierre, setShowCierre] = useState(false);
  const [form, setForm] = useState({ tipo: 'Ingreso en Caja', categoria: 'Blanco', monto: '', descripcion: '' });
  const [editForm, setEditForm] = useState({ id: '', tipo: '', categoria: '', monto: '', descripcion: '' });
  const [cierreForm, setCierreForm] = useState({ saldo_real_blanco: '', saldo_real_negro: '', observaciones: '' });
  const [stats, setStats] = useState({ saldo_blanco: 0, saldo_negro: 0, ingresos_hoy: 0, retiros_hoy: 0 });
  const [expandedDates, setExpandedDates] = useState({});


  useEffect(() => { loadData(); }, [dateFrom, dateTo]);

  useEffect(() => {
    let result = [...movimientos];
    if (filter === 'Ingreso') result = result.filter((m) => m.codigo === 502);
    else if (filter === 'Egreso') result = result.filter((m) => m.codigo === 501);
    else if (filter === 'Retiro') result = result.filter((m) => m.codigo === 503);
    else if (filter === 'En caja') result = result.filter((m) => m.codigo === 500);
    if (filterCat === 'Blanco') result = result.filter((m) => m.categoria === 'Blanco');
    else if (filterCat === 'Negro') result = result.filter((m) => m.categoria === 'Negro');
    setFiltered(result);
  }, [movimientos, filter, filterCat]);

  const loadData = async () => {
    setLoading(true);
    try {
      const t = today();
      const needTodaySeparately = t < dateFrom || t > dateTo;
      const [data, saldos, hoyDataExtra] = await Promise.all([
        mockDB.getCaja(dateFrom || undefined, dateTo || undefined),
        mockDB.getEstadoSaldos(),
        needTodaySeparately ? mockDB.getCaja(t, t) : Promise.resolve(null),
      ]);
      setMovimientos(data);
      const hoyData = hoyDataExtra || data.filter((m) => m.fecha === t);
      const ingresos = hoyData.filter((m) => m.codigo === 502).reduce((s, m) => s + m.monto, 0);
      const retiros = hoyData.filter((m) => m.codigo === 503).reduce((s, m) => s + m.monto, 0);

      const cronologico = [...data].sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        const order = { 500: 0, 502: 1, 501: 2, 503: 3 };
        return (order[a.codigo] ?? 9) - (order[b.codigo] ?? 9);
      });
      const s = { Blanco: 0, Negro: 0 };
      for (const m of cronologico) {
        const cat = m.categoria || 'Blanco';
        if (m.codigo === 500) s[cat] = m.monto;
        else if (m.codigo === 502) s[cat] += m.monto;
        else if (m.codigo === 501) s[cat] -= m.monto;
      }
      setStats({ saldo_blanco: s.Blanco, saldo_negro: s.Negro, ingresos_hoy: ingresos, retiros_hoy: retiros });

      const SALDO_VERSION_MIN = SALDO_VERSION;
      if ((saldos._version || 0) < SALDO_VERSION_MIN) {
        const result = await mockDB.recalcularSaldosCompletos();
        toast.success(`Saldos recalculados (${result.total} registros)`, { duration: 4000 });
        const freshData = await mockDB.getCaja(dateFrom || undefined, dateTo || undefined);
        setMovimientos(freshData);
        setStats((prev) => ({ ...prev, saldo_blanco: result.blanco, saldo_negro: result.negro }));
      }
    } catch { toast.error('Error al cargar caja'); }
    finally { setLoading(false); }
  };

  const groupedByDate = {};
  filtered.forEach((m) => {
    if (!groupedByDate[m.fecha]) groupedByDate[m.fecha] = [];
    groupedByDate[m.fecha].push(m);
  });
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  const runningBalanceByDate = (() => {
    const allSorted = [...filtered].sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      const order = { 500: 0, 502: 1, 501: 2, 503: 3 };
      return (order[a.codigo] ?? 9) - (order[b.codigo] ?? 9);
    });
    const s = { Blanco: 0, Negro: 0 };
    const result = {};
    for (const m of allSorted) {
      const cat = m.categoria || 'Blanco';
      if (m.codigo === 500) s[cat] = m.monto;
      else if (m.codigo === 502) s[cat] += m.monto;
      else if (m.codigo === 501) s[cat] -= m.monto;
      result[m.fecha] = { Blanco: s.Blanco, Negro: s.Negro, total: s.Blanco + s.Negro };
    }
    return result;
  })();

  const toggleDate = (date) => setExpandedDates((prev) => ({ ...prev, [date]: !prev[date] }));

  const dayStats = (date) => {
    const items = groupedByDate[date] || [];
    const ingresos = items.filter((m) => m.codigo === 502).reduce((s, m) => s + m.monto, 0);
    const egresos = items.filter((m) => m.codigo === 501).reduce((s, m) => s + m.monto, 0);
    const blanco = items.filter((m) => m.categoria === 'Blanco' && m.codigo === 502 && m.origen === 'venta').reduce((s, m) => s + m.monto, 0);
    const negro = items.filter((m) => m.categoria === 'Negro' && m.codigo === 502 && m.origen === 'venta').reduce((s, m) => s + m.monto, 0);
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

  const handleDeleteDia = async (date) => {
    const items = groupedByDate[date] || [];
    if (!confirm(`Eliminar TODOS los movimientos del dia ${date} (${items.length})? Esta accion no se puede deshacer.`)) return;
    try {
      const n = await mockDB.deleteCajaDia(date, user.email);
      toast.success(`Dia ${date} eliminado (${n} movimientos)`);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
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

  const handleRecalcular = async () => {
    toast.loading('Recalculando saldos...');
    try {
      const result = await mockDB.recalcularSaldosCompletos();
      toast.dismiss();
      toast.success(`Saldos recalculados: Blanco $${result.blanco.toLocaleString()} / Negro $${result.negro.toLocaleString()} (${result.total} docs)`);
      loadData();
    } catch (err) {
      toast.dismiss();
      toast.error('Error recalculando: ' + err.message);
    }
  };

  const handleExport = (type) => {
    const data = filtered.map((m) => ({ Fecha: m.fecha, Tipo: `${m.tipo} (${m.codigo})`, Descripcion: m.descripcion, Monto: m.monto, Saldo: m.saldo_nuevo, Origen: m.origen }));
    if (type === 'csv') exportToCSV(data, `caja_${today()}`);
    else if (type === 'xlsx') exportToExcel(data, `caja_${today()}`);
    else if (type === 'pdf') exportToPDF(data, [{ key: 'Fecha', header: 'Fecha' }, { key: 'Tipo', header: 'Tipo' }, { key: 'Descripcion', header: 'Descripcion' }, { key: 'Monto', header: 'Monto', format: 'currency' }, { key: 'Saldo', header: 'Saldo', format: 'currency' }], 'Libro de Caja - GLAMOURS', `caja_${today()}`);
    toast.success(`Exportado como ${type.toUpperCase()}`);
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ============================================ */}
      {/* SECCION 1: SALDOS                          */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #facc15 0%, #f59e0b 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Wallet size={20} color="#000" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Libro de Caja</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>Saldos y movimientos del periodo seleccionado</p>
          </div>
        </div>

        {/* Fila de heroes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
          {/* Hero: Saldo Total */}
          <div style={{
            background: 'linear-gradient(135deg, #854d0e 0%, #a16207 40%, #ca8a04 100%)',
            borderRadius: '16px', padding: '1.75rem 2rem',
            border: '1px solid rgba(250,204,21,0.3)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '6rem', opacity: 0.04, fontWeight: '900' }}>$</div>
            <div style={{ fontSize: '0.75rem', color: '#fde68a', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '700', marginBottom: '0.5rem' }}>
              Saldo Total en Caja
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', lineHeight: '1.1', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
              {formatCurrency(stats.saldo_blanco + stats.saldo_negro)}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
              Blanco: {formatCurrency(stats.saldo_blanco)} | Negro: {formatCurrency(stats.saldo_negro)}
            </div>
          </div>

          {/* Hero: Ingresos de hoy */}
          <div style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            border: '1px solid rgba(212,175,55,0.2)',
            borderRadius: '16px', padding: '1.75rem 2rem',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '6rem', opacity: 0.03, fontWeight: '900' }}>+</div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '700', marginBottom: '0.5rem' }}>
              Ingresos de Hoy (502)
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#10b981', lineHeight: '1.1', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
              {formatCurrency(stats.ingresos_hoy)}
            </div>
            <div style={{ fontSize: '0.8rem', color: stats.retiros_hoy > 0 ? '#fb923c' : 'rgba(255,255,255,0.5)' }}>
              Retiros de hoy: -{formatCurrency(stats.retiros_hoy)}
            </div>
          </div>
        </div>

        {/* Cards secundarias */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>💵</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#e2e8f0', lineHeight: '1.2' }}>Saldo Blanco</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>Efectivo declarado</div>
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>{formatCurrency(stats.saldo_blanco)}</div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>🖤</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#c4b5fd', lineHeight: '1.2' }}>Saldo Negro</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>Efectivo no declarado</div>
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>{formatCurrency(stats.saldo_negro)}</div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 2: FILTROS Y ACCIONES              */}
      {/* ============================================ */}
      <section>
        {/* Barra de acciones */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '1rem 1.25rem',
          marginBottom: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ fontSize: '0.85rem' }}><Plus size={16} /> Registrar</button>
            <button className="btn btn-accent" onClick={() => setShowCierre(true)} style={{ fontSize: '0.85rem' }}>Cerrar Caja</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => handleExport('xlsx')} style={{ fontSize: '0.85rem' }}><Download size={14} /> Excel</button>
            <button className="btn btn-outline" onClick={() => handleExport('pdf')} style={{ fontSize: '0.85rem' }}><Download size={14} /> PDF</button>
            <button className="btn btn-outline" onClick={handleRecalcular} title="Recalcular saldos desde cero" style={{ fontSize: '0.85rem' }}><RefreshCw size={14} /> Recalcular</button>
          </div>
        </div>

        {/* Barra de filtros */}
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
            {['todos', 'En caja', 'Ingreso', 'Egreso', 'Retiro'].map((f) => (
              <button key={f} className={`btn btn-outline btn-sm ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)} style={{ fontSize: '0.75rem' }}>
                {f === 'todos' ? 'Todos' : f === 'En caja' ? f : f + 's'}
              </button>
            ))}
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {['todos', 'Blanco', 'Negro'].map((c) => (
              <button key={c} className={`btn btn-outline btn-sm ${filterCat === c ? 'active' : ''}`} onClick={() => setFilterCat(c)}
                style={{
                  fontSize: '0.75rem',
                  borderColor: c === 'Blanco' ? (filterCat === c ? '#facc15' : undefined) : c === 'Negro' ? (filterCat === c ? '#9ca3af' : undefined) : undefined,
                  color: c === 'Blanco' ? (filterCat === c ? '#facc15' : undefined) : c === 'Negro' ? (filterCat === c ? '#9ca3af' : undefined) : undefined,
                }}>
                {c === 'todos' ? 'Todas' : c}
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
              {filtered.length} movimientos en {sortedDates.length} dias
              {dateFrom && dateTo && ` (${dateFrom} al ${dateTo})`}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sortedDates.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '3rem',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '14px', color: '#6b7280',
            }}>
              Sin movimientos en este periodo
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
                {/* Header del dia */}
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
                      {ds.count} movimiento{ds.count !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {ds.ingresos > 0 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '0.2rem 0.6rem', borderRadius: '8px' }}>
                        Ingresos: +{formatCurrency(ds.ingresos)}
                      </span>
                    )}
                    {ds.egresos > 0 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#ef4444', background: 'rgba(239,68,68,0.12)', padding: '0.2rem 0.6rem', borderRadius: '8px' }}>
                        Egresos: -{formatCurrency(ds.egresos)}
                      </span>
                    )}
                    {ds.blanco !== 0 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#facc15', background: 'rgba(250,204,21,0.1)', padding: '0.2rem 0.5rem', borderRadius: '8px' }}>
                        Blanco: +{formatCurrency(ds.blanco)}
                      </span>
                    )}
                    {ds.negro !== 0 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#9ca3af', background: 'rgba(156,163,175,0.1)', padding: '0.2rem 0.5rem', borderRadius: '8px' }}>
                        Negro: +{formatCurrency(ds.negro)}
                      </span>
                    )}
                    {runningBalanceByDate[date] && (
                      <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#d4af37', background: 'rgba(212,175,55,0.12)', padding: '0.2rem 0.6rem', borderRadius: '8px' }}>
                        Caja: {formatCurrency(runningBalanceByDate[date].total)}
                      </span>
                    )}
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

                {/* Detalle del dia (expandible) */}
                {expanded && (
                  <div style={{
                    padding: '0 1.25rem 1.25rem',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {(() => {
                      const items = groupedByDate[date] || [];
                      const regulares = items.filter((m) => m.codigo !== 503).sort((a, b) => {
                        const order = { 500: 0, 502: 1, 501: 2 };
                        return (order[a.codigo] ?? 9) - (order[b.codigo] ?? 9);
                      });
                      const retiros = items.filter((m) => m.codigo === 503);
                      return (
                        <>
                          {/* Movimientos regulares */}
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Tipo</th>
                                <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Descripcion</th>
                                <th style={{ textAlign: 'left', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Origen</th>
                                <th style={{ textAlign: 'right', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Monto</th>
                                <th style={{ textAlign: 'right', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Saldo</th>
                                <th style={{ textAlign: 'right', fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.75rem 0.5rem 0.5rem' }}>Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {regulares.map((m) => (
                                <Fragment key={m.id}>
                                  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                    <td style={{ padding: '0.6rem 0.5rem' }}>
                                      <span style={{
                                        fontSize: '0.72rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '6px',
                                        background: m.codigo === 500 ? 'rgba(156,163,175,0.12)' : m.codigo === 501 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                                        color: m.codigo === 500 ? '#9ca3af' : m.codigo === 501 ? '#ef4444' : '#10b981',
                                      }}>
                                        {m.tipo} ({m.codigo})
                                      </span>
                                    </td>
                                    <td style={{ padding: '0.6rem 0.5rem', color: '#9ca3af', fontSize: '0.82rem' }}>{m.descripcion}</td>
                                    <td style={{ padding: '0.6rem 0.5rem' }}>
                                      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#6b7280', background: 'rgba(255,255,255,0.05)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{m.origen}</span>
                                    </td>
                                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: m.codigo === 500 ? '#9ca3af' : m.codigo === 501 ? '#ef4444' : '#10b981', fontWeight: '800', fontSize: '0.85rem' }}>
                                      {m.codigo === 500 ? formatCurrency(m.monto) : `${m.codigo === 501 ? '-' : '+'}${formatCurrency(m.monto)}`}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: '#d4af37', fontWeight: '700', fontSize: '0.82rem' }}>{formatCurrency(m.saldo_nuevo)}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                        <button className="btn-icon" onClick={() => openEdit(m)} title="Editar"><Edit3 size={14} /></button>
                                        <button className="btn-icon" onClick={() => handleDelete(m.id)} title="Eliminar"><Trash2 size={14} /></button>
                                      </div>
                                    </td>
                                  </tr>
                                </Fragment>
                              ))}
                            </tbody>
                          </table>

                          {/* Retiros informativos (503) */}
                          {retiros.length > 0 && (
                            <div style={{
                              marginTop: '1rem',
                              background: 'linear-gradient(135deg, #0c1a3a 0%, #0f2340 100%)',
                              border: '1px solid rgba(59,130,246,0.2)',
                              borderRadius: '10px',
                              padding: '0.6rem 0.75rem',
                              boxShadow: '0 2px 12px rgba(59,130,246,0.08)',
                            }}>
                              <div style={{ fontSize: '0.6rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
                                💸 Retiro de Caja
                              </div>
                              {retiros.map((m) => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                  <span style={{ fontSize: '0.82rem', color: '#e5e7eb', flex: 1 }}>{m.descripcion}</span>
                                  <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#fb923c', marginRight: '0.75rem' }}>{formatCurrency(m.monto)}</span>
                                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button className="btn-icon" onClick={() => openEdit(m)} title="Editar" style={{ color: '#94a3b8' }}><Edit3 size={13} /></button>
                                    <button className="btn-icon" onClick={() => handleDelete(m.id)} title="Eliminar" style={{ color: '#94a3b8' }}><Trash2 size={13} /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
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
      <div className={`modal-overlay ${showModal ? 'active' : ''}`}>
        <div className="modal">
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
      <div className={`modal-overlay ${showEdit ? 'active' : ''}`}>
        <div className="modal">
          <h2><Edit3 size={18} /> Editar Movimiento</h2>
          <form onSubmit={handleEdit}>
            <div className="form-group"><label>Tipo</label><select value={editForm.tipo} onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })}><option value="Ingreso en Caja">Ingreso en Caja (502)</option><option value="Egreso en Caja">Egreso en Caja (501)</option><option value="Retiro de Caja">Retiro de Caja (503)</option></select></div>
            <div className="form-group"><label>Monto ($)</label><input type="number" value={editForm.monto} onChange={(e) => setEditForm({ ...editForm, monto: e.target.value })} min="1" required /></div>
            <div className="form-group"><label>Descripcion</label><input type="text" value={editForm.descripcion} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} /></div>
            <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowEdit(false)}>Cancelar</button><button type="submit" className="btn btn-primary">Guardar Cambios</button></div>
          </form>
        </div>
      </div>

      {/* Modal Cierre */}
      <div className={`modal-overlay ${showCierre ? 'active' : ''}`}>
        <div className="modal">
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
