import { useState, useEffect } from 'react';
import { format, subMonths, startOfMonth, endOfMonth, subDays, isWithinInterval, parseISO } from 'date-fns';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Wallet, ShoppingBag, ChevronDown, ChevronRight } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { formatCurrency } from '../utils/formatCurrency';
import { classificarVenta, VENTA_TYPES as TYPES, VENTA_TYPE_CFG as TIPO_CFG } from '../utils/ventaTypes';
import toast from 'react-hot-toast';
import Calendario from '../components/Calendario';

function getMonthRange(monthsAgo = 0) {
  const d = subMonths(new Date(), monthsAgo);
  return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, 'MMMM yyyy') };
}

function isInRange(fechaStr, start, end) {
  if (!fechaStr) return false;
  try { return isWithinInterval(parseISO(fechaStr), { start, end }); } catch { return false; }
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [ventas, setVentas] = useState([]);
  const [caja, setCaja] = useState([]);
  const [showCajaDetail, setShowCajaDetail] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const prevMonthStart = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
      const curMonthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
      const [v, c] = await Promise.all([
        mockDB.getVentas(prevMonthStart, curMonthEnd).catch(() => []),
        mockDB.getCaja().catch(() => []),
      ]);
      setVentas(v);
      setCaja(c);
    } catch { toast.error('Error al cargar datos'); }
    finally { setLoading(false); }
  };

  const curMonth = getMonthRange(0);
  const prevMonth = getMonthRange(1);

  const agrupar = (lista) => {
    const totales = {};
    const porBanco = {};
    TYPES.forEach((t) => { totales[t] = 0; porBanco[t] = {}; });
    for (const v of lista) {
      const tipo = classificarVenta(v);
      totales[tipo] += v.monto;
      const brand = v.banco || (tipo === 'blanco' ? 'Efectivo' : tipo === 'negro' ? 'Efectivo' : 'Otro');
      porBanco[tipo][brand] = (porBanco[tipo][brand] || 0) + v.monto;
    }
    return { totales, porBanco };
  };

  const cur = agrupar(ventas.filter((v) => isInRange(v.fecha, curMonth.start, curMonth.end)));
  const prev = agrupar(ventas.filter((v) => isInRange(v.fecha, prevMonth.start, prevMonth.end)));
  const totalCur = TYPES.reduce((s, t) => s + cur.totales[t], 0);
  const totalPrev = TYPES.reduce((s, t) => s + prev.totales[t], 0);

  const saldoCalc = (() => {
    const sorted = [...caja].sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      const o = { 500: 0, 502: 1, 501: 2, 503: 3 };
      return (o[a.codigo] ?? 9) - (o[b.codigo] ?? 9);
    });
    const s = { Blanco: 0, Negro: 0 };
    for (const m of sorted) {
      const cat = m.categoria || 'Blanco';
      if (m.codigo === 500) { s.Blanco = m.monto; s.Negro = 0; }
      else if (m.codigo === 502) s[cat] += m.monto;
      else if (m.codigo === 501) s[cat] -= m.monto;
    }
    return s;
  })();
  const saldoBlanco = saldoCalc.Blanco;
  const saldoNegro = saldoCalc.Negro;
  const saldoFisico = saldoBlanco + saldoNegro;

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Burbuja flotante de días hábiles (arriba a la derecha) */}
      <Calendario />

      {/* ============================================ */}
      {/* FILA SUPERIOR: HEROES VENTAS | CAJA         */}
      {/* ============================================ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
        {/* Hero: Total Ventas del mes */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          border: '1px solid rgba(212,175,55,0.2)',
          borderRadius: '16px', padding: '1.75rem 2rem',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '6rem', opacity: 0.03, fontWeight: '900' }}>$</div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
            Total Ventas {curMonth.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: '900', color: '#d4af37', letterSpacing: '-0.02em' }}>
              {formatCurrency(totalCur)}
            </span>
            {totalPrev > 0 && (() => {
              const diff = totalCur - totalPrev;
              const pct = ((diff / totalPrev) * 100).toFixed(0);
              return (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  fontSize: '0.85rem', fontWeight: '700',
                  color: diff >= 0 ? '#10b981' : '#ef4444',
                  background: diff >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                  padding: '0.25rem 0.75rem', borderRadius: '20px',
                }}>
                  {diff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {diff >= 0 ? '+' : ''}{pct}%
                </span>
              );
            })()}
          </div>
          {totalPrev > 0 && (
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>
              Mes anterior: {formatCurrency(totalPrev)}
            </div>
          )}
        </div>

        {/* Hero: Saldo al abrir caja */}
        <div style={{
          background: 'linear-gradient(135deg, #854d0e 0%, #a16207 40%, #ca8a04 100%)',
          borderRadius: '16px', padding: '1.75rem 2rem',
          border: '1px solid rgba(250,204,21,0.3)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '6rem', opacity: 0.04, fontWeight: '900' }}>$</div>
          <div style={{ fontSize: '0.75rem', color: '#fde68a', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '700', marginBottom: '0.5rem' }}>
            Saldo al Abrir Caja
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', lineHeight: '1.1', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
            {formatCurrency(saldoFisico)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
            Efectivo físico disponible hoy
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* SECCION 1: DETALLE DE VENTAS                */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #d4af37 0%, #b8960c 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShoppingBag size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Ventas por Medio de Pago</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>Detalle del mes actual ({curMonth.label})</p>
          </div>
        </div>

        {/* Cards por tipo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {TYPES.map((tipo) => {
            const cfg = TIPO_CFG[tipo];
            const valCur = cur.totales[tipo];
            const valPrev = prev.totales[tipo];
            const diff = valCur - valPrev;
            const pct = valPrev > 0 ? ((diff / valPrev) * 100).toFixed(0) : null;
            const subItems = Object.entries(cur.porBanco[tipo]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

            return (
              <div key={tipo} style={{
                background: cfg.gradient,
                borderRadius: '14px', padding: '1.25rem',
                border: '1px solid rgba(255,255,255,0.06)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'default',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>{cfg.icon}</span>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.85rem', color: cfg.color, lineHeight: '1.2' }}>{cfg.label}</div>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280', lineHeight: '1.2' }}>{cfg.desc}</div>
                    </div>
                  </div>
                  {pct !== null && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.15rem',
                      fontSize: '0.7rem', fontWeight: '700',
                      color: diff >= 0 ? '#10b981' : '#ef4444',
                      background: diff >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      padding: '0.15rem 0.5rem', borderRadius: '12px',
                    }}>
                      {diff >= 0 ? '+' : ''}{pct}%
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', lineHeight: '1', marginBottom: '0.25rem' }}>
                  {formatCurrency(valCur)}
                </div>

                {valPrev > 0 && (
                  <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Ant.: {formatCurrency(valPrev)}
                  </div>
                )}

                {subItems.length > 0 && (
                  <div style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.6rem' }}>
                    {subItems.map(([brand, monto]) => (
                      <div key={brand} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.15rem 0' }}>
                        <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{brand}</span>
                        <span style={{ fontSize: '0.75rem', color: cfg.color, fontWeight: '600' }}>{formatCurrency(monto)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {subItems.length === 0 && (
                  <div style={{ fontSize: '0.7rem', color: '#4b5563', marginTop: '0.5rem', fontStyle: 'italic' }}>Sin registros</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 2: CAJA - DESGLOSE                  */}
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
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Caja</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>Desglose del día ({format(new Date(), 'dd/MM/yyyy')})</p>
          </div>
        </div>

        {/* Desplegable: Desglose */}
        <div>
          <button
            onClick={() => setShowCajaDetail(!showCajaDetail)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', padding: '0.75rem 1rem',
              cursor: 'pointer', color: '#d4af37',
              fontSize: '0.85rem', fontWeight: '600',
              width: '100%', textAlign: 'left',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.03)'}
          >
            {showCajaDetail ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Ver desglose de caja
          </button>

          {showCajaDetail && (() => {
            const hoy = format(new Date(), 'yyyy-MM-dd');
            const cajaHoy = caja.filter((m) => m.fecha === hoy);
            const ventasHoy = ventas.filter((v) => v.fecha === hoy);

            const ingHoy = cajaHoy.filter((m) => m.codigo === 502).reduce((s, m) => s + m.monto, 0);
            const egrHoy = cajaHoy.filter((m) => m.codigo === 501).reduce((s, m) => s + m.monto, 0);
            const retHoy = cajaHoy.filter((m) => m.codigo === 503).reduce((s, m) => s + m.monto, 0);
            const vBlancoHoy = ventasHoy.filter((v) => classificarVenta(v) === 'blanco').reduce((s, v) => s + v.monto, 0);
            const vNegroHoy = ventasHoy.filter((v) => classificarVenta(v) === 'negro').reduce((s, v) => s + v.monto, 0);

            // Saldo de ayer = saldo actual cacheado menos el neto de los movimientos de hoy
            // Nota v7: retiros (503) son informativos, no restan (ya estan en el 501)
            const netoHoy = ingHoy + vBlancoHoy + vNegroHoy - egrHoy;
            const saldoAyerTotal = saldoFisico - netoHoy;
            const totalHoy = saldoAyerTotal + netoHoy;

            const filas = [
              { code: 500, label: 'Apertura', value: saldoAyerTotal, color: '#facc15', sign: 1 },
              { code: 502, label: 'Ingresos', value: ingHoy, color: '#10b981', sign: 1 },
              { code: 'VB', label: 'Ventas Blanco', value: vBlancoHoy, color: '#e2e8f0', sign: 1 },
              { code: 'VN', label: 'Ventas Negro', value: vNegroHoy, color: '#a78bfa', sign: 1 },
              { code: 501, label: 'Egresos', value: egrHoy, color: '#ef4444', sign: -1 },
              { code: 503, label: 'Retiros (informativo)', value: retHoy, color: '#f97316', sign: 0 },
            ].filter((f) => f.value > 0);

            const movsByCode = {};
            cajaHoy.filter((m) => m.codigo !== 500).forEach((m) => { if (!movsByCode[m.codigo]) movsByCode[m.codigo] = []; movsByCode[m.codigo].push(m); });

            return (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px', padding: '1rem 1.25rem',
                marginTop: '0.5rem',
                fontFamily: 'var(--font-mono, monospace)',
              }}>

                {/* SALDO ANTERIOR */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.6rem 0.75rem', borderRadius: '8px',
                  background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)',
                  marginBottom: '0.5rem',
                }}>
                  <span style={{ fontSize: '0.78rem', color: '#a78bfa', fontWeight: '700' }}>
                    🏦 CAJA DÍA {format(subDays(new Date(), 1), 'dd/MM/yy')}
                  </span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '900', color: '#a78bfa' }}>
                    {formatCurrency(saldoAyerTotal)}
                  </span>
                </div>

                {/* SEPARADOR */}
                <div style={{ borderTop: '1px dashed rgba(255,255,255,0.08)', margin: '0.35rem 0' }} />

                {/* TITULO MOVIMIENTOS */}
                <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 0.5rem', marginBottom: '0.25rem' }}>
                  Movimientos del {format(new Date(), 'dd/MM/yy')}
                </div>

                {/* FILAS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {filas.map((f) => (
                    <div key={f.code}>
                      <div style={{
                        display: 'grid', gridTemplateColumns: '32px 1fr auto',
                        gap: '0.5rem', alignItems: 'center',
                        padding: '0.4rem 0.5rem',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                      }}>
                        <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textAlign: 'center' }}>
                          {String(f.code).padStart(2, '0')}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#d1d5db', fontWeight: '500' }}>
                          {f.label}
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: '800', color: f.sign === 0 ? '#6b7280' : f.color, textAlign: 'right', fontStyle: f.sign === 0 ? 'italic' : 'normal' }}>
                          {f.sign > 0 ? '+' : f.sign < 0 ? '-' : ''}{formatCurrency(f.value)}
                        </span>
                      </div>
                      {/* Items individuales */}
                      {movsByCode[f.code] && movsByCode[f.code].map((m) => (
                        <div key={m.id} style={{
                          display: 'grid', gridTemplateColumns: '32px 1fr auto',
                          gap: '0.5rem', alignItems: 'center',
                          padding: '0.2rem 0.5rem 0.2rem 1.5rem',
                        }}>
                          <span></span>
                          <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>• {m.descripcion || m.tipo}</span>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'right' }}>{formatCurrency(m.monto)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* TOTAL */}
                <div style={{ borderTop: '2px solid rgba(255,255,255,0.1)', margin: '0.25rem 0 0' }} />
                <div style={{
                  display: 'grid', gridTemplateColumns: '32px 1fr auto',
                  gap: '0.5rem', alignItems: 'center',
                  padding: '0.5rem 0.5rem',
                }}>
                  <span></span>
                  <span style={{ fontSize: '0.8rem', color: '#d4af37', fontWeight: '800' }}>TOTAL CAJA FÍSICO</span>
                  <span style={{ fontSize: '1rem', fontWeight: '900', color: '#fbbf24', textAlign: 'right' }}>
                    {formatCurrency(totalHoy)}
                  </span>
                </div>

                {filas.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '1rem', color: '#4b5563', fontSize: '0.78rem', fontStyle: 'italic' }}>
                    Sin movimientos registrados
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </section>
    </div>
  );
}
