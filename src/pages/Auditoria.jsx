import { useState, useEffect } from 'react';
import { ShieldCheck, Download } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { formatDateTime, today } from '../utils/dateUtils';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { useSortableData, SortIcon } from '../hooks/useSortableData';
import DateFilter from '../components/DateFilter';
import toast from 'react-hot-toast';

export default function Auditoria() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [filterMod, setFilterMod] = useState('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { sorted, requestSort, sortConfig } = useSortableData(filtered, 'fecha', 'desc');

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    let result = [...logs];
    if (filterMod !== 'todos') result = result.filter((l) => l.modulo === filterMod);
    if (dateFrom) result = result.filter((l) => l.fecha >= dateFrom);
    if (dateTo) result = result.filter((l) => l.fecha <= dateTo + 'T23:59:59');
    setFiltered(result);
  }, [logs, filterMod, dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    try { setLogs(await mockDB.getAuditoria(500)); } catch {} finally { setLoading(false); }
  };

  const modulos = [...new Set(logs.map((l) => l.modulo))];
  const usuariosUnicos = [...new Set(logs.map((l) => l.usuario))].filter(Boolean);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  const handleExport = (type) => {
    const data = sorted.map((l) => ({ Fecha: formatDateTime(l.fecha), Usuario: l.usuario, Modulo: l.modulo, Accion: l.accion, Detalle: l.detalle }));
    if (type === 'xlsx') exportToExcel(data, `auditoria_${today()}`);
    else if (type === 'pdf') exportToPDF(data, [
      { key: 'Fecha', header: 'Fecha/Hora' }, { key: 'Usuario', header: 'Usuario' },
      { key: 'Modulo', header: 'Modulo' }, { key: 'Accion', header: 'Accion' }, { key: 'Detalle', header: 'Detalle' },
    ], 'Registro de Auditoria - GLAMOURS', `auditoria_${today()}`);
    toast.success(`Exportado como ${type.toUpperCase()}`);
  };

  const cols = [
    { key: 'fecha', label: 'Fecha/Hora' }, { key: 'usuario', label: 'Usuario' },
    { key: 'modulo', label: 'Modulo' }, { key: 'accion', label: 'Accion' }, { key: 'detalle', label: 'Detalle' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

      {/* ============================================ */}
      {/* SECCION 1: RESUMEN                         */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #d4af37 0%, #b8960c 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShieldCheck size={20} color="#000" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Registro de Auditoria</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>Ultimos {logs.length} registros (ahorro de cuota) | Trazabilidad del sistema</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>📋</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#e2e8f0', lineHeight: '1.2' }}>Total Registros</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>Eventos registrados</div>
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>{filtered.length.toLocaleString()}</div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>🧩</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#c4b5fd', lineHeight: '1.2' }}>Modulos Activos</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>Secciones con actividad</div>
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>{modulos.length}</div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #022c22 0%, #064e3b 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>👥</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#6ee7b7', lineHeight: '1.2' }}>Usuarios</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>Cuentas con actividad</div>
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#10b981', lineHeight: '1' }}>{usuariosUnicos.length}</div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 2: FILTROS Y ACCIONES              */}
      {/* ============================================ */}
      <section>
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '1rem 1.25rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d4af37' }}>
            <ShieldCheck size={14} />
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filtros</span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            <button className={`btn btn-outline btn-sm ${filterMod === 'todos' ? 'active' : ''}`} onClick={() => setFilterMod('todos')} style={{ fontSize: '0.75rem' }}>Todos</button>
            {modulos.map((m) => (
              <button key={m} className={`btn btn-outline btn-sm ${filterMod === m ? 'active' : ''}`} onClick={() => setFilterMod(m)} style={{ fontSize: '0.75rem' }}>{m}</button>
            ))}
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-outline" onClick={() => handleExport('xlsx')} style={{ fontSize: '0.85rem' }}><Download size={14} /> Excel</button>
            <button className="btn btn-outline" onClick={() => handleExport('pdf')} style={{ fontSize: '0.85rem' }}><Download size={14} /> PDF</button>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 3: HISTORIAL                       */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #d4af37 0%, #b8960c 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '1.2rem' }}>🔍</span>
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Historial de Eventos</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
              {sorted.length} registros
              {dateFrom && dateTo && ` (${dateFrom} al ${dateTo})`}
            </p>
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '14px', overflow: 'hidden',
        }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.key} style={{ cursor: 'pointer', userSelect: 'none', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}
                      onClick={() => requestSort(c.key)}>
                      {c.label}<SortIcon config={sortConfig} column={c.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: '600' }}>{formatDateTime(log.fecha)}</td>
                    <td>{log.usuario}</td>
                    <td><span className="badge badge-neutral">{log.modulo}</span></td>
                    <td>{log.accion}</td>
                    <td style={{ color: '#6b7280', fontSize: '0.85rem' }}>{log.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                Sin registros de auditoria en este periodo
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
