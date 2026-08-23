import { useState, useEffect, useRef } from 'react';
import { Car, Cake, Baby, Gift, Upload, Users, CalendarDays, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import firestoreDB from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import { parseLuxcarWorkbook, MESES_ES, diasParaCumple } from '../utils/luxcarParser';

const iconBox = (bg) => ({
  width: 42, height: 42, borderRadius: 12, background: bg,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 4px 14px rgba(0,0,0,0.35)', flexShrink: 0,
});

const cardBase = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16, padding: '1rem 1.25rem',
};

function StatCard({ icon: Icon, color, grad, label, value }) {
  return (
    <div style={{ ...cardBase, display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
      <div style={iconBox(grad)}><Icon size={20} color={color} /></div>
      <div>
        <div style={{ fontSize: '1.6rem', fontWeight: '900', color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: '600', marginTop: '0.2rem' }}>{label}</div>
      </div>
    </div>
  );
}

function PersonCard({ icon: Icon, color, nombre, detalle, chip, chipColor, atenuado }) {
  return (
    <div style={{
      ...cardBase, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.8rem',
      opacity: atenuado ? 0.55 : 1,
      borderColor: chipColor ? `${chipColor}44` : undefined,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `${color}1f`, border: `1px solid ${color}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombre}</div>
        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>{detalle}</div>
      </div>
      {chip && (
        <span style={{
          fontSize: '0.62rem', fontWeight: '800', padding: '0.25rem 0.6rem', borderRadius: 20,
          background: `${chipColor}22`, color: chipColor, border: `1px solid ${chipColor}55`, whiteSpace: 'nowrap',
        }}>{chip}</span>
      )}
    </div>
  );
}

export default function Luxcar() {
  const { user } = useAuth();
  const [data, setData] = useState({ cumple: [], nino: [], navidad: [] });
  const [loading, setLoading] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [tab, setTab] = useState('cumple');
  const fileRef = useRef(null);

  async function cargar() {
    setLoading(true);
    try {
      setData(await firestoreDB.getLuxcarAll());
    } catch (e) {
      toast.error('Error al leer datos de Luxcar');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCargando(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseLuxcarWorkbook(buf);
      const total = parsed.cumples.length + parsed.nino.length + parsed.navidad.length;
      if (total === 0) throw new Error('No se encontraron datos. Verifique que el Excel tenga hojas CUMPLES / DIA DEL ÑINO / NAVIDAD');
      await firestoreDB.guardarLuxcarPersonas('cumple', parsed.cumples);
      await firestoreDB.guardarLuxcarPersonas('nino', parsed.nino);
      await firestoreDB.guardarLuxcarPersonas('navidad', parsed.navidad);
      await firestoreDB.addAuditLog(user?.email || 'sistema', 'CARGA', 'Luxcar',
        `Excel ${file.name}: ${parsed.cumples.length} cumpleaños, ${parsed.nino.length} día del niño, ${parsed.navidad.length} navidad`);
      toast.success(`Cargado: ${parsed.cumples.length} cumpleaños, ${parsed.nino.length} niño, ${parsed.navidad.length} navidad`);
      await cargar();
    } catch (err) {
      toast.error(err.message || 'Error al procesar el Excel');
    } finally {
      setCargando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // ---- Derivados Cumpleaños ----
  const hoy = new Date();
  const activos = data.cumple.filter((p) => p.estado === 1);
  const proximos = activos
    .map((p) => ({ ...p, dias: diasParaCumple(p.mes, p.dia, hoy) }))
    .filter((p) => p.dias >= 0 && p.dias <= 30)
    .sort((a, b) => a.dias - b.dias);

  const porMes = {};
  for (const p of data.cumple) {
    if (!porMes[p.mes]) porMes[p.mes] = [];
    porMes[p.mes].push(p);
  }
  const mesesOrdenados = Object.keys(porMes).map(Number).sort((a, b) => a - b);

  const TABS = [
    { id: 'cumple', label: 'Cumpleaños', icon: Cake },
    { id: 'nino', label: 'Día del Niño', icon: Baby },
    { id: 'navidad', label: 'Navidad', icon: Gift },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
        <div style={iconBox('linear-gradient(135deg, #d4af37 0%, #b8962e 100%)')}>
          <Car size={20} color="#12121f" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '800', color: '#f3f4f6' }}>Luxcar</h1>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#9ca3af' }}>Cumpleaños y eventos de clientes</p>
        </div>
      </div>

      {/* Mini-secciones (tabs) */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const activo = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: '0.45rem',
              padding: '0.5rem 1rem', borderRadius: 12, cursor: 'pointer',
              border: activo ? '1px solid #d4af37aa' : '1px solid rgba(255,255,255,0.08)',
              background: activo ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
              color: activo ? '#d4af37' : '#9ca3af',
              fontWeight: 700, fontSize: '0.82rem',
            }}>
              <Icon size={15} /> {label}
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <StatCard icon={Users} color="#d4af37" grad="linear-gradient(135deg, #713f12 0%, #a16207 100%)" label="Cumpleaños Activos" value={activos.length} />
        <StatCard icon={CalendarDays} color="#34d399" grad="linear-gradient(135deg, #065f46 0%, #047857 100%)" label="Próximos 30 Días" value={proximos.length} />
        <StatCard icon={Baby} color="#818cf8" grad="linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)" label="Día del Niño" value={data.nino.length} />
        <StatCard icon={Gift} color="#f87171" grad="linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)" label="Navidad" value={data.navidad.length} />
      </div>

      {/* Carga de Excel */}
      <div style={{ ...cardBase, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={iconBox('linear-gradient(135deg, #374151 0%, #4b5563 100%)')}>
          <Upload size={18} color="#d1d5db" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f3f4f6' }}>Actualizar listas desde Excel</div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Hojas: CUMPLES · DIA DEL ÑINO · NAVIDAD (reemplaza lo anterior)</div>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} disabled={cargando} style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.6rem 1.1rem', borderRadius: 10, cursor: cargando ? 'wait' : 'pointer',
          border: 'none', background: 'linear-gradient(135deg, #d4af37 0%, #b8962e 100%)',
          color: '#12121f', fontWeight: '800', fontSize: '0.82rem', opacity: cargando ? 0.6 : 1,
        }}>
          <Upload size={15} /> {cargando ? 'Procesando...' : 'Elegir archivo'}
        </button>
        <button onClick={cargar} title="Recargar" style={{
          padding: '0.6rem', borderRadius: 10, cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#9ca3af',
          display: 'flex', alignItems: 'center',
        }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="loading-screen"><div className="spinner" /></div>
      ) : tab === 'cumple' ? (
        <>
          {/* Próximos 30 días */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
              <div style={iconBox('linear-gradient(135deg, #065f46 0%, #047857 100%)')}>
                <CalendarDays size={18} color="#34d399" />
              </div>
              <span style={{ fontSize: '1.05rem', fontWeight: '800', color: '#34d399' }}>Próximos 30 Días</span>
            </div>
            {proximos.length === 0 ? (
              <div style={{ ...cardBase, textAlign: 'center', padding: '2rem', color: '#6b7280', fontSize: '0.85rem' }}>
                No hay cumpleaños en los próximos 30 días
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {proximos.map((p, i) => (
                  <PersonCard key={`${p.nombre}${i}`} icon={Cake} color="#d4af37"
                    nombre={p.nombre}
                    detalle={`${p.dia} de ${MESES_ES[p.mes]}`}
                    chip={p.dias === 0 ? '¡HOY!' : p.dias === 1 ? 'MAÑANA' : `EN ${p.dias} DÍAS`}
                    chipColor={p.dias <= 1 ? '#f87171' : '#34d399'} />
                ))}
              </div>
            )}
          </section>

          {/* Por mes */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
              <div style={iconBox('linear-gradient(135deg, #713f12 0%, #a16207 100%)')}>
                <Cake size={18} color="#d4af37" />
              </div>
              <span style={{ fontSize: '1.05rem', fontWeight: '800', color: '#d4af37' }}>Todos los Cumpleaños</span>
            </div>
            {mesesOrdenados.length === 0 ? (
              <div style={{ ...cardBase, textAlign: 'center', padding: '2rem', color: '#6b7280', fontSize: '0.85rem' }}>
                Sin datos. Cargue el Excel de cumpleaños para comenzar.
              </div>
            ) : mesesOrdenados.map((mes) => (
              <div key={mes} style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
                  {MESES_ES[mes]} · {porMes[mes].length}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.6rem' }}>
                  {[...porMes[mes]].sort((a, b) => a.dia - b.dia).map((p, i) => (
                    <PersonCard key={`${p.nombre}${i}`} icon={Cake} color="#d4af37"
                      nombre={p.nombre}
                      detalle={`${p.dia} de ${MESES_ES[p.mes]}`}
                      chip={p.estado === 1 ? 'ACTIVO' : 'A CONFIRMAR'}
                      chipColor={p.estado === 1 ? '#34d399' : '#9ca3af'}
                      atenuado={p.estado !== 1} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : tab === 'nino' ? (
        data.nino.length === 0 ? (
          <div style={{ ...cardBase, textAlign: 'center', padding: '2rem', color: '#6b7280', fontSize: '0.85rem' }}>
            No hay datos del Día del Niño. Cargue el Excel.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {data.nino.map((p, i) => (
              <PersonCard key={`${p.nombre}${i}`} icon={Baby} color="#818cf8"
                nombre={p.nombre} detalle={p.fecha || 'Día del Niño'} chip="REGALO PENDIENTE" chipColor="#818cf8" />
            ))}
          </div>
        )
      ) : (
        data.navidad.length === 0 ? (
          <div style={{ ...cardBase, textAlign: 'center', padding: '2rem', color: '#6b7280', fontSize: '0.85rem' }}>
            No hay datos de Navidad. Cargue el Excel.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {data.navidad.map((p, i) => (
              <PersonCard key={`${p.nombre}${i}`} icon={Gift} color="#f87171"
                nombre={p.nombre} detalle={p.fecha || 'Navidad'} chip="REGALO PENDIENTE" chipColor="#f87171" />
            ))}
          </div>
        )
      )}
    </div>
  );
}
