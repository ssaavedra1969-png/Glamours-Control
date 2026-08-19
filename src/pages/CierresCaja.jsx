import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { formatCurrency } from '../utils/formatCurrency';
import { useSortableData, SortIcon } from '../hooks/useSortableData';
import DateFilter from '../components/DateFilter';

export default function CierresCaja() {
  const [loading, setLoading] = useState(true);
  const [cierres, setCierres] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { sorted, requestSort, sortConfig } = useSortableData(filtered, 'fecha', 'desc');

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    let result = [...cierres];
    if (dateFrom) result = result.filter((c) => c.fecha >= dateFrom);
    if (dateTo) result = result.filter((c) => c.fecha <= dateTo);
    setFiltered(result);
  }, [cierres, dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    try { setCierres(await mockDB.getCierres()); } catch {} finally { setLoading(false); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;

  const cuadrados = filtered.filter((c) => c.diferencia === 0).length;
  const conDiferencia = filtered.filter((c) => c.diferencia !== 0);
  const totalDiferencia = conDiferencia.reduce((s, c) => s + c.diferencia, 0);
  const totalTeorico = filtered.reduce((s, c) => s + (c.saldo_teorico || 0), 0);
  const totalReal = filtered.reduce((s, c) => s + (c.saldo_real || 0), 0);

  const cols = [
    { key: 'fecha', label: 'Fecha' }, { key: 'usuario', label: 'Usuario' },
    { key: 'saldo_teorico_blanco', label: 'Teorico B', amount: true },
    { key: 'saldo_real_blanco', label: 'Real B', amount: true },
    { key: 'diferencia_blanco', label: 'Dif B', amount: true },
    { key: 'saldo_teorico_negro', label: 'Teorico N', amount: true },
    { key: 'saldo_real_negro', label: 'Real N', amount: true },
    { key: 'diferencia_negro', label: 'Dif N', amount: true },
    { key: 'observaciones', label: 'Observaciones' },
  ];

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card"><h3>Total Cierres</h3><div className="value">{filtered.length}</div></div>
        <div className="stat-card success"><h3>Sin Diferencia</h3><div className="value">{cuadrados}</div></div>
        <div className="stat-card danger"><h3>Con Diferencia</h3><div className="value">{conDiferencia.length}</div></div>
        <div className="stat-card warning"><h3>Diferencia Total</h3><div className="value">{formatCurrency(totalDiferencia)}</div></div>
      </div>

      <div className="stats-grid">
        <div className="stat-card accent"><h3>Total Teorico</h3><div className="value">{formatCurrency(totalTeorico)}</div></div>
        <div className="stat-card" style={{ borderLeft: '3px solid #facc15' }}><h3>Total Real</h3><div className="value" style={{ color: '#facc15' }}>{formatCurrency(totalReal)}</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2><Lock size={18} /> Historial de Cierres</h2>
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
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id}>
                  <td>{c.fecha}</td>
                  <td>{c.usuario}</td>
                  <td className="amount">{formatCurrency(c.saldo_teorico_blanco || 0)}</td>
                  <td className="amount">{formatCurrency(c.saldo_real_blanco || 0)}</td>
                  <td className="amount" style={{ color: (c.diferencia_blanco || 0) === 0 ? '#10b981' : '#ef4444', fontWeight: '700' }}>
                    {(c.diferencia_blanco || 0) === 0 ? '$0' : formatCurrency(c.diferencia_blanco || 0)}
                  </td>
                  <td className="amount">{formatCurrency(c.saldo_teorico_negro || 0)}</td>
                  <td className="amount">{formatCurrency(c.saldo_real_negro || 0)}</td>
                  <td className="amount" style={{ color: (c.diferencia_negro || 0) === 0 ? '#10b981' : '#ef4444', fontWeight: '700' }}>
                    {(c.diferencia_negro || 0) === 0 ? '$0' : formatCurrency(c.diferencia_negro || 0)}
                  </td>
                  <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.observaciones || '-'}</td>
                  <td><span className={`badge ${c.diferencia === 0 ? 'badge-success' : 'badge-danger'}`}>{c.diferencia === 0 ? 'Cuadra' : 'Diferencia'}</span></td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={cols.length + 1} style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>No hay cierres registrados</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
