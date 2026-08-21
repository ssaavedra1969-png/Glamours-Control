import { useState, useEffect } from 'react';
import { Lock, Download } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { formatCurrency } from '../utils/formatCurrency';
import { today } from '../utils/dateUtils';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { useSortableData, SortIcon } from '../hooks/useSortableData';
import DateFilter from '../components/DateFilter';
import toast from 'react-hot-toast';

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

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  const cuadrados = filtered.filter((c) => c.diferencia === 0).length;
  const conDiferencia = filtered.filter((c) => c.diferencia !== 0);
  const totalDiferencia = conDiferencia.reduce((s, c) => s + c.diferencia, 0);
  const totalTeorico = filtered.reduce((s, c) => s + (c.saldo_teorico || 0), 0);
  const totalReal = filtered.reduce((s, c) => s + (c.saldo_real || 0), 0);
  const precision = filtered.length > 0 ? Math.round((cuadrados / filtered.length) * 100) : 100;

  const handleExport = (type) => {
    const data = sorted.map((c) => ({
      Fecha: c.fecha, Usuario: c.usuario,
      'Teorico B': c.saldo_teorico_blanco || 0, 'Real B': c.saldo_real_blanco || 0, 'Dif B': c.diferencia_blanco || 0,
      'Teorico N': c.saldo_teorico_negro || 0, 'Real N': c.saldo_real_negro || 0, 'Dif N': c.diferencia_negro || 0,
      Observaciones: c.observaciones || '',
    }));
    if (type === 'xlsx') exportToExcel(data, `cierres_${today()}`);
    else if (type === 'pdf') exportToPDF(data, [
      { key: 'Fecha', header: 'Fecha' }, { key: 'Usuario', header: 'Usuario' },
      { key: 'Teorico B', header: 'Teorico B', format: 'currency' }, { key: 'Real B', header: 'Real B', format: 'currency' }, { key: 'Dif B', header: 'Dif B', format: 'currency' },
      { key: 'Teorico N', header: 'Teorico N', format: 'currency' }, { key: 'Real N', header: 'Real N', format: 'currency' }, { key: 'Dif N', header: 'Dif N', format: 'currency' },
    ], 'Historial de Cierres - GLAMOURS', `cierres_${today()}`);
    toast.success(`Exportado como ${type.toUpperCase()}`);
  };

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

      {/* ============================================ */}
      {/* SECCION 1: RESUMEN DE CIERRES              */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #d4af37 0%, #b8960c 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={20} color="#000" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Cierres de Caja</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>Control de arqueos diarios: efectivo declarado vs contado</p>
          </div>
        </div>

        {/* Card principal: Diferencia acumulada */}
        <div style={{
          background: 'linear-gradient(135deg, #854d0e 0%, #a16207 40%, #ca8a04 100%)',
          borderRadius: '16px', padding: '2rem 2.5rem',
          border: '1px solid rgba(250,204,21,0.3)',
          position: 'relative', overflow: 'hidden',
          marginBottom: '1.25rem',
        }}>
          <div style={{ position: 'absolute', top: '-30px', right: '-30px', fontSize: '8rem', opacity: 0.04, fontWeight: '900' }}>$</div>
          <div style={{ fontSize: '0.8rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '700', marginBottom: '0.5rem' }}>
            Diferencia Acumulada del Periodo
          </div>
          <div style={{ fontSize: '3.5rem', fontWeight: '900', color: '#fff', lineHeight: '1', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
            {formatCurrency(totalDiferencia)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
            Teorico: {formatCurrency(totalTeorico)} | Real contado: {formatCurrency(totalReal)} | {cuadrados} de {filtered.length} cierres cuadrados
          </div>
        </div>

        {/* Cards secundarias */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>📋</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#e2e8f0', lineHeight: '1.2' }}>Total Cierres</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>Arqueos registrados</div>
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>{filtered.length}</div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #022c22 0%, #064e3b 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>✅</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#6ee7b7', lineHeight: '1.2' }}>Sin Diferencia</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>Cajas que cuadran</div>
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#10b981', lineHeight: '1' }}>{cuadrados}</div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>⚠️</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#fca5a5', lineHeight: '1.2' }}>Con Diferencia</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>Faltante o sobrante</div>
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#ef4444', lineHeight: '1' }}>{conDiferencia.length}</div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>🎯</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#c4b5fd', lineHeight: '1.2' }}>Precision</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>% de cierres exactos</div>
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>{precision}%</div>
          </div>
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
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d4af37' }}>
            <Lock size={14} />
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Periodo</span>
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
            <span style={{ fontSize: '1.2rem' }}>🔒</span>
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Historial de Cierres</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
              {sorted.length} cierres
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
                    <th key={c.key} className={c.amount ? 'amount' : ''} style={{ cursor: 'pointer', userSelect: 'none', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}
                      onClick={() => requestSort(c.key)}>
                      {c.label}<SortIcon config={sortConfig} column={c.key} />
                    </th>
                  ))}
                  <th style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: '600' }}>{c.fecha}</td>
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
              </tbody>
            </table>
            {sorted.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '3rem',
                color: '#6b7280',
              }}>
                Sin cierres registrados en este periodo
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
