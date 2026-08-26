import { useState, useEffect, Fragment } from 'react';
import { Lock, ChevronDown, ChevronRight, Wallet } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { formatCurrency } from '../utils/formatCurrency';
import { today } from '../utils/dateUtils';
import { useSortableData, SortIcon } from '../hooks/useSortableData';
import DateFilter from '../components/DateFilter';
import toast from 'react-hot-toast';

export default function CierresCaja() {
  const [loading, setLoading] = useState(true);
  const [combinedList, setCombinedList] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Estados para tarjetas de totales
  const [liveSaldos, setLiveSaldos] = useState({ Blanco: 0, Negro: 0 });
  const [showSaldosDesglose, setShowSaldosDesglose] = useState(false);
  const [totalRetirosPeriodo, setTotalRetirosPeriodo] = useState(0);
  const [totalDiferencia, setTotalDiferencia] = useState(0);
  
  // Control de desplegables de filas
  const [expandedDates, setExpandedDates] = useState({});

  const { sorted, requestSort, sortConfig } = useSortableData(combinedList, 'fecha', 'desc');

  useEffect(() => {
    loadData();
  }, [dateFrom, dateTo]);

  const toggleDate = (date) => {
    setExpandedDates((prev) => ({ ...prev, [date]: !prev[date] }));
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [cierresData, cajaData, allCaja] = await Promise.all([
        mockDB.getCierres(dateFrom || undefined, dateTo || undefined),
        mockDB.getCaja(dateFrom || undefined, dateTo || undefined),
        mockDB.getCaja(),
      ]);

      const saldosCalc = (() => {
        const sorted = [...allCaja].sort((a, b) => {
          if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
          const o = { 500: 0, 502: 1, 501: 2, 503: 3 };
          return (o[a.codigo] ?? 9) - (o[b.codigo] ?? 9);
        });
        const s = { Blanco: 0, Negro: 0 };
        for (const m of sorted) {
          const cat = m.categoria || 'Blanco';
          if (m.codigo === 500) s[cat] = m.monto;
          else if (m.codigo === 502) s[cat] += m.monto;
          else if (m.codigo === 501) s[cat] -= m.monto;
        }
        return s;
      })();
      setLiveSaldos(saldosCalc);

      // Agrupar retiros y cierres por fecha
      const combined = {};

      // 1) Cargar cierres
      cierresData.forEach((c) => {
        if (!combined[c.fecha]) {
          combined[c.fecha] = {
            fecha: c.fecha,
            cierre: null,
            retiros: [],
            total_retiros_blanco: 0,
            total_retiros_negro: 0,
          };
        }
        combined[c.fecha].cierre = c;
      });

      // 2) Cargar retiros (codigo 503) y sumarlos
      const retiros503 = cajaData.filter((m) => m.codigo === 503);
      let sumRetiros = 0;

      retiros503.forEach((m) => {
        sumRetiros += m.monto;
        if (!combined[m.fecha]) {
          combined[m.fecha] = {
            fecha: m.fecha,
            cierre: null,
            retiros: [],
            total_retiros_blanco: 0,
            total_retiros_negro: 0,
          };
        }
        combined[m.fecha].retiros.push(m);
        if (m.categoria === 'Blanco') {
          combined[m.fecha].total_retiros_blanco += m.monto;
        } else {
          combined[m.fecha].total_retiros_negro += m.monto;
        }
      });

      setTotalRetirosPeriodo(sumRetiros);

      // Calcular diferencia acumulada del periodo
      const sumDiferencias = cierresData.reduce((s, c) => s + (c.diferencia || 0), 0);
      setTotalDiferencia(sumDiferencias);

      // Mapear a formato plano para ordenamiento y desplegado
      const mapped = Object.values(combined).map((item) => {
        const total_retiros = item.total_retiros_blanco + item.total_retiros_negro;
        return {
          id: item.fecha,
          fecha: item.fecha,
          cierre: item.cierre,
          retiros: item.retiros,
          total_retiros_blanco: item.total_retiros_blanco,
          total_retiros_negro: item.total_retiros_negro,
          
          // Campos planos para usar con useSortableData
          cierre_teorico: item.cierre ? item.cierre.saldo_teorico : 0,
          cierre_real: item.cierre ? item.cierre.saldo_real : 0,
          cierre_diferencia: item.cierre ? item.cierre.diferencia : 0,
          total_retiros: total_retiros,
          usuario: item.cierre ? item.cierre.usuario : (item.retiros[0] ? item.retiros[0].usuario : '-'),
          observaciones: item.cierre ? item.cierre.observaciones : '-',
        };
      });

      setCombinedList(mapped);
    } catch (err) {
      toast.error('Error al cargar datos de cierres y retiros');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  const cols = [
    { key: 'fecha', label: 'Fecha' },
    { key: 'cierre_teorico', label: 'Teorico Caja', amount: true },
    { key: 'cierre_real', label: 'Real Contado', amount: true },
    { key: 'cierre_diferencia', label: 'Diferencia', amount: true },
    { key: 'total_retiros', label: 'Retiros Físicos', amount: true },
    { key: 'usuario', label: 'Usuario' },
    { key: 'observaciones', label: 'Observaciones' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ============================================ */}
      {/* SECCION 1: ENCABEZADO                        */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #d4af37 0%, #b8960c 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={20} color="#000" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Cierres de Caja</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>Historial unificado de arqueos y retiros de efectivo</p>
          </div>
        </div>

        {/* Card principal: Falta retirar de caja */}
        <div style={{
          background: 'linear-gradient(135deg, #854d0e 0%, #a16207 40%, #ca8a04 100%)',
          borderRadius: '16px', padding: '1.5rem 2rem',
          border: '1px solid rgba(250,204,21,0.3)',
          position: 'relative', overflow: 'hidden',
          marginBottom: '1rem',
        }}>
          <div style={{ position: 'absolute', top: '-30px', right: '-30px', fontSize: '8rem', opacity: 0.04, fontWeight: '900' }}>$</div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '700' }}>
              Efectivo en Caja a la Fecha (Falta Retirar)
            </div>
            <button 
              onClick={() => setShowSaldosDesglose(!showSaldosDesglose)}
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
                borderRadius: '8px',
                padding: '0.25rem 0.6rem',
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontWeight: '600',
                transition: 'all 0.2s',
              }}
            >
              {showSaldosDesglose ? 'Ocultar Desglose 🔼' : 'Ver Desglose 🔽'}
            </button>
          </div>
          
          <div style={{ fontSize: '3rem', fontWeight: '900', color: '#fff', lineHeight: '1.1', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
            {formatCurrency(liveSaldos.Blanco + liveSaldos.Negro)}
          </div>
          
          {showSaldosDesglose && (
            <div style={{ 
              display: 'flex', 
              gap: '2rem', 
              marginTop: '0.75rem', 
              paddingTop: '0.75rem', 
              borderTop: '1px solid rgba(255,255,255,0.15)',
            }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: '#fbbf24', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Blanco (Declarado)</span>
                <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#fff' }}>{formatCurrency(liveSaldos.Blanco)}</span>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Negro (No Declarado)</span>
                <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#fff' }}>{formatCurrency(liveSaldos.Negro)}</span>
              </div>
            </div>
          )}

          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
            Efectivo total acumulado en caja física del local pendiente de retiro formal.
          </div>
        </div>

        {/* Cards secundarias */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          
          {/* Card 1: Retiros del periodo */}
          <div style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>💸</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#c4b5fd', lineHeight: '1.2' }}>Retiros Realizados</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>Total de retiros del periodo</div>
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>
              {formatCurrency(totalRetirosPeriodo)}
            </div>
          </div>

          {/* Card 2: Diferencia Acumulada */}
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>⚖️</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#e2e8f0', lineHeight: '1.2' }}>Diferencia Acumulada</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>Faltante/Sobrante de cierres</div>
              </div>
            </div>
            <div style={{ 
              fontSize: '1.6rem', 
              fontWeight: '900', 
              color: totalDiferencia === 0 ? '#10b981' : totalDiferencia < 0 ? '#ef4444' : '#fb923c', 
              lineHeight: '1' 
            }}>
              {formatCurrency(totalDiferencia)}
            </div>
          </div>

          {/* Card 3: Arqueos del rango */}
          <div style={{
            background: 'linear-gradient(135deg, #022c22 0%, #064e3b 100%)',
            borderRadius: '14px', padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>🔒</span>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#6ee7b7', lineHeight: '1.2' }}>Arqueos Realizados</div>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>Cierres registrados en rango</div>
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#10b981', lineHeight: '1' }}>
              {combinedList.filter(c => c.cierre).length} de {combinedList.length} días
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 2: FILTROS                           */}
      {/* ============================================ */}
      <section>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '0.75rem 1.25rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d4af37' }}>
            <Wallet size={14} />
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Periodo</span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 3: HISTORIAL UNIFICADO               */}
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
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Historial Unificado</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
              {sorted.length} registros {dateFrom && dateTo && `(${dateFrom} al ${dateTo})`}
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
                    <th 
                      key={c.key} 
                      className={c.amount ? 'amount' : ''} 
                      style={{ cursor: 'pointer', userSelect: 'none', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}
                      onClick={() => requestSort(c.key)}
                    >
                      {c.label}<SortIcon config={sortConfig} column={c.key} />
                    </th>
                  ))}
                  <th style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>Estado</th>
                  <th style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', textAlign: 'center' }}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const hasCierre = !!c.cierre;
                  const hasRetiro = c.total_retiros > 0;
                  const isExpanded = !!expandedDates[c.fecha];

                  let badgeClass = 'badge-success';
                  let badgeText = 'Cuadra';

                  if (hasCierre) {
                    if (c.cierre_diferencia !== 0) {
                      badgeClass = 'badge-danger';
                      badgeText = 'Diferencia';
                    }
                  } else if (hasRetiro) {
                    badgeClass = 'badge-warning';
                    badgeText = 'Solo Retiro';
                  }

                  return (
                    <Fragment key={c.fecha}>
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ fontWeight: '600' }}>{c.fecha}</td>
                        <td className="amount">{hasCierre ? formatCurrency(c.cierre_teorico) : '-'}</td>
                        <td className="amount">{hasCierre ? formatCurrency(c.cierre_real) : '-'}</td>
                        <td className="amount" style={{ 
                          color: !hasCierre ? 'inherit' : c.cierre_diferencia === 0 ? '#10b981' : '#ef4444', 
                          fontWeight: hasCierre ? '700' : 'normal' 
                        }}>
                          {hasCierre ? (c.cierre_diferencia === 0 ? '$0' : formatCurrency(c.cierre_diferencia)) : '-'}
                        </td>
                        <td className="amount" style={{ color: hasRetiro ? '#fb923c' : 'inherit', fontWeight: hasRetiro ? '700' : 'normal' }}>
                          {hasRetiro ? formatCurrency(c.total_retiros) : '$0'}
                        </td>
                        <td>{c.usuario}</td>
                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.observaciones}
                        </td>
                        <td>
                          <span className={`badge ${badgeClass}`}>{badgeText}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            className="btn-icon" 
                            onClick={() => toggleDate(c.fecha)}
                            title="Ver desglose del día"
                            style={{
                              color: '#d4af37',
                              background: 'rgba(212,175,55,0.08)',
                              padding: '0.3rem',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan="9" style={{ padding: '0.75rem 1.25rem 1.25rem' }}>
                            <div style={{
                              background: 'linear-gradient(135deg, #0c1524 0%, #111a2e 100%)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '12px',
                              padding: '1.25rem',
                              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                              display: 'flex',
                              gap: '2rem',
                              flexWrap: 'wrap'
                            }}>
                              {/* Panel 1: Desglose Cierre */}
                              <div style={{ flex: '1 1 300px' }}>
                                <h4 style={{ fontSize: '0.8rem', color: '#d4af37', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.75rem 0', fontWeight: '700', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.25rem' }}>
                                  Arqueo de Caja (Cierre)
                                </h4>
                                {hasCierre ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div style={{ 
                                      display: 'grid', 
                                      gridTemplateColumns: '1fr 1fr 1fr', 
                                      gap: '0.5rem 1rem', 
                                      background: 'rgba(255,255,255,0.02)', 
                                      padding: '0.75rem', 
                                      borderRadius: '8px',
                                      border: '1px solid rgba(255,255,255,0.04)'
                                    }}>
                                      <div></div>
                                      <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '700', textAlign: 'right' }}>Blanco</div>
                                      <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '700', textAlign: 'right' }}>Negro</div>
                                      
                                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Teórico</div>
                                      <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#fff', textAlign: 'right' }}>{formatCurrency(c.cierre.saldo_teorico_blanco || 0)}</div>
                                      <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#fff', textAlign: 'right' }}>{formatCurrency(c.cierre.saldo_teorico_negro || 0)}</div>
                                      
                                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Real Contado</div>
                                      <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#fff', textAlign: 'right' }}>{formatCurrency(c.cierre.saldo_real_blanco || 0)}</div>
                                      <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#fff', textAlign: 'right' }}>{formatCurrency(c.cierre.saldo_real_negro || 0)}</div>
                                      
                                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: '600' }}>Diferencia</div>
                                      <div style={{ fontSize: '0.85rem', fontWeight: '700', textAlign: 'right', color: (c.cierre.diferencia_blanco || 0) === 0 ? '#10b981' : '#ef4444' }}>
                                        {formatCurrency(c.cierre.diferencia_blanco || 0)}
                                      </div>
                                      <div style={{ fontSize: '0.85rem', fontWeight: '700', textAlign: 'right', color: (c.cierre.diferencia_negro || 0) === 0 ? '#10b981' : '#ef4444' }}>
                                        {formatCurrency(c.cierre.diferencia_negro || 0)}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic', padding: '0.5rem 0' }}>
                                    No se registró arqueo de caja para este día.
                                  </div>
                                )}
                              </div>

                              {/* Panel 2: Desglose Retiros */}
                              <div style={{ flex: '1 1 300px' }}>
                                <h4 style={{ fontSize: '0.8rem', color: '#d4af37', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.75rem 0', fontWeight: '700', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.25rem' }}>
                                  Retiros Físicos del Día
                                </h4>
                                {hasRetiro ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {c.retiros.map((r) => (
                                      <div key={r.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.5rem 0.75rem',
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.04)',
                                        borderRadius: '8px',
                                        gap: '1rem'
                                      }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1 }}>
                                          <span style={{ fontSize: '0.8rem', color: '#e5e7eb', fontWeight: '600' }}>{r.descripcion}</span>
                                          <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>Registrado por {r.usuario || 'sistema'}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: '700',
                                            padding: '0.15rem 0.4rem',
                                            borderRadius: '4px',
                                            background: r.categoria === 'Blanco' ? 'rgba(250,204,21,0.1)' : 'rgba(156,163,175,0.1)',
                                            color: r.categoria === 'Blanco' ? '#facc15' : '#9ca3af',
                                          }}>
                                            {r.categoria}
                                          </span>
                                          <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#fb923c' }}>
                                            {formatCurrency(r.monto)}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic', padding: '0.5rem 0' }}>
                                    No se registraron retiros físicos para este día.
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '3rem',
                color: '#6b7280',
              }}>
                Sin registros en este periodo
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
