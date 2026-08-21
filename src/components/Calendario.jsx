// ============================================================
//  GLAMOUR'S - Calendario de Días Hábiles
//  Widget colapsable para el Dashboard.
//  - Marcar/desmarcar días hábiles (click en el día)
//  - Flag 'cargado' por día (verde)
//  - Verificación de días pendientes al abrir (modal)
//  Persistencia: Firestore, 1 doc por mes (ver services/calendarioDB.js)
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  CalendarDays, AlertTriangle, Check, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { getCalendarioMes, saveCalendarioMes, marcarDiasCargados, crearRegistrosVacios } from '../services/calendarioDB';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

function fmtKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m: m - 1, d };
}
function fmtDDMMYYYY(key) {
  const { y, m, d } = parseKey(key);
  return `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
}

export default function Calendario() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [mesRef, setMesRef] = useState(() => new Date());
  const [dias, setDias] = useState({});
  const [loading, setLoading] = useState(true);

  // Modal de acción sobre un día concreto
  const [diaAccion, setDiaAccion] = useState(null); // fechaKey
  // Modal de días pendientes
  const [pendientes, setPendientes] = useState(null); // array de fechaKeys
  const [procesando, setProcesando] = useState(false);

  const cargarMes = useCallback(async (refDate) => {
    setLoading(true);
    try {
      const mk = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}`;
      const d = await getCalendarioMes(mk);
      setDias({ ...d });
    } catch {
      toast.error('Error al cargar calendario');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarMes(mesRef); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Verificación automática de días pendientes al abrir el Dashboard
  useEffect(() => {
    if (loading || pendientes) return;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const pend = Object.keys(dias)
      .filter((k) => dias[k].seleccionado && !dias[k].cargado)
      .filter((k) => { const { y, m, d } = parseKey(k); const dt = new Date(y, m, d); return dt < hoy; })
      .sort();
    if (pend.length > 0) setPendientes(pend);
  }, [loading, dias]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarMes = (delta) => {
    const nuevo = new Date(mesRef.getFullYear(), mesRef.getMonth() + delta, 1);
    setMesRef(nuevo);
    cargarMes(nuevo);
  };

  const guardarDias = async (nuevos) => {
    setDias(nuevos);
    const mk = `${mesRef.getFullYear()}-${String(mesRef.getMonth() + 1).padStart(2, '0')}`;
    try {
      await saveCalendarioMes(mk, nuevos);
    } catch {
      toast.error('Error al guardar calendario');
    }
  };

  const clickDia = (fechaKey) => {
    const info = dias[fechaKey];
    if (!info) {
      guardarDias({ ...dias, [fechaKey]: { seleccionado: true, cargado: false } });
    } else {
      setDiaAccion(fechaKey);
    }
  };

  const quitarDia = () => {
    if (!diaAccion) return;
    const nuevos = { ...dias };
    delete nuevos[diaAccion];
    guardarDias(nuevos);
    setDiaAccion(null);
  };

  const marcarCargadoManual = async () => {
    if (!diaAccion || procesando) return;
    setProcesando(true);
    try {
      await crearRegistrosVacios([diaAccion], user?.email);
      await marcarDiasCargados([diaAccion]);
      setDias((prev) => ({ ...prev, [diaAccion]: { ...prev[diaAccion], cargado: true } }));
      toast.success(`Día ${fmtDDMMYYYY(diaAccion)} marcado como cargado`);
      setDiaAccion(null);
    } catch {
      toast.error('Error al marcar el día');
    } finally {
      setProcesando(false);
    }
  };

  // Acepta la carga automática de los días pendientes
  const aceptarPendientes = async () => {
    if (procesando) return;
    setProcesando(true);
    try {
      const res = await crearRegistrosVacios(pendientes, user?.email);
      await marcarDiasCargados(pendientes);
      setDias((prev) => {
        const nuevos = { ...prev };
        pendientes.forEach((f) => { if (nuevos[f]) nuevos[f] = { ...nuevos[f], cargado: true }; });
        return nuevos;
      });
      toast.success(`${res.caja} registros de caja y ${res.ventas} de ventas creados`);
      setPendientes(null);
    } catch {
      toast.error('Error al crear registros vacíos');
    } finally {
      setProcesando(false);
    }
  };

  // ---- Render del grid del mes ----
  const year = mesRef.getFullYear();
  const month = mesRef.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysPrev = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const hoyKey = fmtKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const cells = [];
  let diaNum = 1;
  let proxNum = 1;
  for (let i = 0; i < totalCells; i++) {
    if (i < firstDay) {
      cells.push({ num: daysPrev - firstDay + i + 1, otroMes: true, key: null });
    } else if (i >= firstDay + daysInMonth) {
      cells.push({ num: proxNum++, otroMes: true, key: null });
    } else {
      const key = fmtKey(year, month, diaNum);
      const info = dias[key];
      cells.push({
        num: diaNum, otroMes: false, key,
        seleccionado: !!info?.seleccionado,
        cargado: !!info?.cargado,
        esHoy: key === hoyKey,
      });
      diaNum++;
    }
  }

  const cantHabiles = Object.keys(dias).length;
  const cantCargados = Object.values(dias).filter((d) => d.cargado).length;
  const completo = cantHabiles > 0 && cantCargados === cantHabiles;
  const badgeColor = completo ? '#10b981' : '#d4af37';
  const badgeBg = completo ? 'rgba(16,185,129,0.12)' : 'rgba(212,175,55,0.12)';

  return (
    <>
      <div className="cal-float">
        {!visible && (
          <button className="cal-bubble-btn" onClick={() => setVisible(true)} title="Mostrar calendario de días hábiles">
            <CalendarDays size={16} color="#d4af37" />
            Días Hábiles
            <span className="cal-bubble-badge" style={{ color: badgeColor, background: badgeBg }}>
              {cantCargados}/{cantHabiles}
            </span>
            <ChevronDown size={14} color="#9ca3af" />
          </button>
        )}
        {visible && (
        <div style={{
          background: 'var(--bg-card)',
          backdropFilter: 'blur(24px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '16px',
          padding: '14px 16px',
          width: '300px',
          boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
        }}>
          {/* Cabecera del widget */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: visible ? '10px' : '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CalendarDays size={16} color="#d4af37" />
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#e5e7eb', letterSpacing: '0.04em' }}>
                Días Hábiles
              </span>
              <span className="cal-bubble-badge" style={{ color: badgeColor, background: badgeBg }}>
                {cantCargados}/{cantHabiles}
              </span>
            </div>
            <button
              onClick={() => setVisible(!visible)}
              title={visible ? 'Ocultar calendario' : 'Mostrar calendario'}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#c8d0e0',
              }}
            >
              {visible ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {visible && (
            <>
              {/* Navegación de mes */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <button onClick={() => cambiarMes(-1)} className="cal-nav-btn"><ChevronLeft size={15} /></button>
                <span style={{ fontWeight: '700', fontSize: '0.85rem', color: '#f3f4f6' }}>
                  {MESES[month]} {year}
                </span>
                <button onClick={() => cambiarMes(1)} className="cal-nav-btn"><ChevronRight size={15} /></button>
              </div>

              {/* Grid */}
              <div className="cal-grid">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="cal-weekday">{w}</div>
                ))}
                {cells.map((c, idx) => c.otroMes ? (
                  <div key={idx} className="cal-day cal-day-otro">{c.num}</div>
                ) : (
                  <div
                    key={c.key}
                    onClick={() => clickDia(c.key)}
                    title={c.seleccionado ? (c.cargado ? 'Día cargado — click para opciones' : 'Día hábil sin carga — click para opciones') : 'Marcar como día hábil'}
                    className={[
                      'cal-day',
                      c.esHoy ? 'cal-hoy' : '',
                      c.seleccionado ? (c.cargado ? 'cal-cargado' : 'cal-habil') : '',
                    ].join(' ')}
                  >
                    {c.num}
                  </div>
                ))}
              </div>

              {/* Leyenda */}
              <div className="cal-legend">
                <span><span className="cal-dot" style={{ borderColor: '#d4af37', background: 'rgba(212,175,55,0.2)' }} /> Día hábil</span>
                <span><span className="cal-dot" style={{ borderColor: '#10b981', background: 'rgba(16,185,129,0.2)' }} /> Cargado</span>
              </div>
            </>
          )}
        </div>
        )}
      </div>

      {/* ===== Modal: acciones sobre un día ===== */}
      {diaAccion && (
        <div className="modal-overlay active" onClick={() => setDiaAccion(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <h3 style={{ marginTop: 0 }}>Día {fmtDDMMYYYY(diaAccion)}</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
              {dias[diaAccion]?.cargado
                ? 'Este día ya tiene carga de datos registrada.'
                : 'Este día está marcado como hábil pero aún no tiene carga de datos.'}
            </p>
            <div className="modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={quitarDia}>
                <X size={14} /> Quitar día hábil
              </button>
              {!dias[diaAccion]?.cargado && (
                <button className="btn btn-primary" disabled={procesando} onClick={marcarCargadoManual}>
                  <Check size={14} /> {procesando ? 'Procesando...' : 'Marcar como cargado'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: días pendientes de carga ===== */}
      {pendientes && (
        <div className="modal-overlay active">
          <div className="modal" style={{ maxWidth: '440px' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} color="#d4af37" /> Días hábiles sin carga
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '0.88rem', lineHeight: 1.5 }}>
              Hay días hábiles sin carga de datos. ¿Desea cargar automáticamente movimientos vacíos para estos días?
            </p>
            <div className="cal-pending-list">
              {pendientes.map((f) => <div key={f}>{fmtDDMMYYYY(f)}</div>)}
            </div>
            <div className="modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" disabled={procesando} onClick={() => setPendientes(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={procesando} onClick={aceptarPendientes}>
                {procesando ? 'Procesando...' : 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
