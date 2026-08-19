import { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { formatDateTime } from '../utils/dateUtils';
import { useSortableData, SortIcon } from '../hooks/useSortableData';
import DateFilter from '../components/DateFilter';

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
    try { setLogs(await mockDB.getAuditoria()); } catch {} finally { setLoading(false); }
  };

  const modulos = [...new Set(logs.map((l) => l.modulo))];

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;

  const cols = [
    { key: 'fecha', label: 'Fecha/Hora' }, { key: 'usuario', label: 'Usuario' },
    { key: 'modulo', label: 'Modulo' }, { key: 'accion', label: 'Accion' }, { key: 'detalle', label: 'Detalle' },
  ];

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2><ShieldCheck size={18} /> Registro de Auditoria</h2>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{filtered.length} registros</span>
        </div>

        <div className="filter-bar" style={{ flexDirection: 'column', gap: '0.5rem' }}>
          <div className="btn-group">
            <button className={`btn btn-outline btn-sm ${filterMod === 'todos' ? 'active' : ''}`} onClick={() => setFilterMod('todos')}>Todos</button>
            {modulos.map((m) => (
              <button key={m} className={`btn btn-outline btn-sm ${filterMod === m ? 'active' : ''}`} onClick={() => setFilterMod(m)}>{m}</button>
            ))}
          </div>
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => requestSort(c.key)}>
                    {c.label}<SortIcon config={sortConfig} column={c.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.fecha)}</td>
                  <td>{log.usuario}</td>
                  <td><span className="badge badge-neutral">{log.modulo}</span></td>
                  <td>{log.accion}</td>
                  <td style={{ color: '#6b7280', fontSize: '0.85rem' }}>{log.detalle}</td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>Sin registros</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
