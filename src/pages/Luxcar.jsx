import { useState, useEffect, useRef } from 'react';
import { Cake, Baby, Gift, Upload, Users, CalendarDays, RefreshCw, Info, Search, Pencil, Trash2, X, Download, ShieldAlert, Save, ChevronRight, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import firestoreDB from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import { parseLuxcarWorkbook, MESES_ES, diasParaCumple, descargarBackupLuxcar, nombreBackupLuxcar } from '../utils/luxcarParser';

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

function StatStripItem({ icon: Icon, color, grad, label, value }) {
  return (
    <div className="lx-strip-item">
      <span className="lx-strip-ico" style={{ background: grad }}>
        <Icon size={16} color={color} />
      </span>
      <div className="lx-strip-txt">
        <span className="lx-strip-num" style={{ color }}>{value}</span>
        <span className="lx-strip-lab">{label}</span>
      </div>
    </div>
  );
}

function PersonCard({ icon: Icon, color, nombre, detalle, chip, chipColor, atenuado, onEdit, onDelete }) {
  return (
    <div className={`lx-card${atenuado ? ' off' : ''}`} style={chip && chipColor ? { borderColor: `${chipColor}55` } : undefined}>
      <span className="lx-card-ico" style={{ background: `${color}1f`, borderColor: `${color}55` }}>
        <Icon size={15} color={color} />
      </span>
      <div className="lx-card-body">
        <div className="lx-card-row1">
          <span className="lx-card-nombre" title={nombre}>{nombre}</span>
          <div className="lx-acc">
            <button className="lx-btn-ico edit" title="Editar" onClick={onEdit}><Pencil size={13} /></button>
            <button className="lx-btn-ico del" title="Eliminar" onClick={onDelete}><Trash2 size={13} /></button>
          </div>
        </div>
        <div className="lx-card-row2">
          <span className="lx-card-det">{detalle}</span>
          {chip && (
            <span className="lx-card-chip" style={{ color: chipColor, background: `${chipColor}1f`, borderColor: `${chipColor}66` }}>{chip}</span>
          )}
        </div>
      </div>
    </div>
  );
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const capitalizar = (s) => String(s || '').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
const parseFecha = (f) => {
  const [d, m] = String(f || '').split('/');
  const dia = parseInt(d, 10);
  const mes = parseInt(m, 10) - 1;
  return { dia: dia >= 1 && dia <= 31 ? dia : 1, mes: mes >= 0 && mes <= 11 ? mes : 0 };
};
const fechaDeDM = (dia, mes) => `${String(dia).padStart(2, '0')}/${String(mes + 1).padStart(2, '0')}`;
const FECHA_REF = { nino: { dia: 15, mes: 7 }, navidad: { dia: 24, mes: 11 } }; // 15/08 y 24/12

function FechaRefHint({ tipo }) {
  const ref = FECHA_REF[tipo];
  if (!ref) return null;
  return (
    <p className="lx-fecha-ref">
      Referencia habitual: <b>{fechaDeDM(ref.dia, ref.mes)}</b> — {TITULOS_REF[tipo]} casi siempre se carga con esta fecha, cambiala si esta vez es otra.
    </p>
  );
}
const TITULOS_REF = { nino: 'el Día del Niño', navidad: 'la Navidad' };

export default function Luxcar() {
  const { user } = useAuth();
  const [data, setData] = useState({ cumple: [], nino: [], navidad: [] });
  const [loading, setLoading] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [tab, setTab] = useState('cumple');
  const [busqueda, setBusqueda] = useState('');
  const [mesModal, setMesModal] = useState(null);
  const [editando, setEditando] = useState(null);
  const [pendiente, setPendiente] = useState(null); // {accion, tipo, idx, form}
  const [agregandoTipo, setAgregandoTipo] = useState(null); // null | 'choose' | 'cumple' | 'nino' | 'navidad'
  const [agregandoTipos, setAgregandoTipos] = useState([]);
  const [enCadena, setEnCadena] = useState(false);
  const [agregando, setAgregando] = useState(null); // { tipo, nombre, dia, mes, estado, fecha }
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

  // ---- Derivados ----
  const hoy = new Date();
  const activos = data.cumple.filter((p) => p.estado === 1);
  const proximos = data.cumple
    .map((p, idx) => ({ ...p, idx, dias: diasParaCumple(p.mes, p.dia, hoy) }))
    .filter((p) => p.estado === 1 && p.dias >= 0 && p.dias <= 30)
    .sort((a, b) => a.dias - b.dias);

  const TABS = [
    { id: 'cumple', label: 'Cumpleaños', icon: Cake },
    { id: 'nino', label: 'Día del Niño', icon: Baby },
    { id: 'navidad', label: 'Navidad', icon: Gift },
  ];

  const TITULOS = { cumple: 'Cumpleaños', nino: 'Día del Niño', navidad: 'Navidad' };

  // ---- Backup obligatorio ----
  function hacerBackup(datos = data) {
    try {
      const nombre = descargarBackupLuxcar(datos);
      toast.success(`Backup descargado: ${nombre}`);
      return nombre;
    } catch (e) {
      toast.error('No se pudo generar el backup');
      return false;
    }
  }

  function pedirCambio(pend) {
    setPendiente(pend);
  }

  function confirmarBackup() {
    if (!hacerBackup()) return;
    const p = pendiente;
    setPendiente(null);
    if (p.accion === 'edit') {
      setEditando(p.form);
    } else {
      aplicarDelete(p.tipo, p.idx, p.nombre);
    }
  }

  // ---- Edición / borrado ----
  function abrirEdicion(tipo, idx) {
    const p = data[tipo][idx];
    if (!p) return;
    const form = { tipo, idx, nombre: capitalizar(p.nombre) };
    if (tipo === 'cumple') {
      form.dia = p.dia;
      form.mes = p.mes;
      form.estado = p.estado ?? 1;
    } else {
      const { dia, mes } = parseFecha(p.fecha);
      form.dia = dia;
      form.mes = mes;
      form.fecha = p.fecha || '';
    }
    pedirCambio({ accion: 'edit', tipo, idx, form, nombre: capitalizar(p.nombre) });
  }

  function pedirDelete(tipo, idx) {
    const p = data[tipo][idx];
    if (!p) return;
    pedirCambio({ accion: 'delete', tipo, idx, nombre: p.nombre });
  }

  async function guardarEdicion() {
    const { tipo, idx, ...vals } = editando;
    const nombre = capitalizar(vals.nombre);
    if (!nombre) { toast.error('Ingrese un nombre'); return; }
    const nueva = [...data[tipo]];
    const dia = parseInt(vals.dia, 10);
    const mes = parseInt(vals.mes, 10);
    if (!dia || dia < 1 || dia > 31) { toast.error('Día inválido (1-31)'); return; }
    if (isNaN(mes) || mes < 0 || mes > 11) { toast.error('Mes inválido'); return; }
    if (tipo === 'cumple') {
      nueva[idx] = { nombre, dia, mes, estado: parseInt(vals.estado, 10) === 1 ? 1 : 2 };
    } else {
      nueva[idx] = { nombre, fecha: fechaDeDM(dia, mes) };
    }
    try {
      await firestoreDB.guardarLuxcarPersonas(tipo, nueva);
      await firestoreDB.addAuditLog(user?.email || 'sistema', 'EDICION', 'Luxcar',
        `${TITULOS[tipo]}: "${data[tipo][idx].nombre}" → "${nombre}"`);
      setData((d) => ({ ...d, [tipo]: nueva }));
      setEditando(null);
      toast.success('Guardado');
    } catch (e) {
      toast.error('Error al guardar');
    }
  }

  async function aplicarDelete(tipo, idx, nombre) {
    const nueva = data[tipo].filter((_, i) => i !== idx);
    try {
      await firestoreDB.guardarLuxcarPersonas(tipo, nueva);
      await firestoreDB.addAuditLog(user?.email || 'sistema', 'ELIMINACION', 'Luxcar',
        `${TITULOS[tipo]} eliminado: "${nombre}"`);
      setData((d) => ({ ...d, [tipo]: nueva }));
      toast.success(`Eliminado: ${nombre}`);
    } catch (e) {
      toast.error('Error al eliminar');
    }
  }

  // ---- Alta manual ----
  function valoresIniciales(tipo, nombre = '') {
    const ref = FECHA_REF[tipo];
    const ahora = new Date();
    return {
      tipo, nombre,
      dia: ref ? ref.dia : ahora.getDate(),
      mes: ref ? ref.mes : ahora.getMonth(),
      estado: 1, fecha: '',
    };
  }

  function setAgregandoTipoHandler(tipo) {
    setAgregandoTipo(null);
    setAgregando(valoresIniciales(tipo));
  }

  async function guardarAgregar() {
    if (!agregando) return;
    const { tipo, ...vals } = agregando;
    const nombre = capitalizar(vals.nombre);
    if (!nombre) { toast.error('Ingrese un nombre'); return; }
    const dia = parseInt(vals.dia, 10);
    const mes = parseInt(vals.mes, 10);
    if (!dia || dia < 1 || dia > 31) { toast.error('Día inválido (1-31)'); return; }
    if (isNaN(mes) || mes < 0 || mes > 11) { toast.error('Mes inválido'); return; }
    let nuevoItem = null;
    if (tipo === 'cumple') {
      nuevoItem = { nombre, dia, mes, estado: parseInt(vals.estado, 10) === 1 ? 1 : 2 };
    } else {
      nuevoItem = { nombre, fecha: fechaDeDM(dia, mes) };
    }
    const lista = [...(data[tipo] || [])];
    const existe = lista.some((p) => {
      if (norm(p.nombre) !== norm(nombre)) return false;
      if (tipo === 'cumple') return p.dia === nuevoItem.dia && p.mes === nuevoItem.mes;
      return String(p.fecha || '') === String(nuevoItem.fecha || '');
    });
    if (existe) { toast.error('Ya existe una persona con esos datos en esta lista'); return; }
    aplicarAgregar(tipo, nuevoItem, nombre);
  }

  async function aplicarAgregar(tipo, nuevoItem, nombre) {
    const lista = [...(data[tipo] || [])];
    const nuevaLista = [...lista, nuevoItem];
    try {
      await firestoreDB.guardarLuxcarPersonas(tipo, nuevaLista);
      await firestoreDB.addAuditLog(user?.email || 'sistema', 'ALTA', 'Luxcar', `${TITULOS[tipo]} agregado: "${nombre}"`);
      setData((d) => ({ ...d, [tipo]: nuevaLista }));
      const pendientes = agregandoTipos.filter((t) => t !== tipo);
      setAgregandoTipos(pendientes);
      if (pendientes.length > 0) {
        setEnCadena(true);
        setAgregando(valoresIniciales(pendientes[0], nombre));
        toast.success(`Guardado en ${TITULOS[tipo]}. Ahora completá ${TITULOS[pendientes[0]]}`);
      } else {
        setEnCadena(false);
        setAgregando(null);
        const bk = hacerBackup({ ...data, [tipo]: nuevaLista });
        toast.success(`"${nombre}" agregada en todas las listas${bk ? ` · Backup: ${bk}` : ''}`);
      }
    } catch (e) { toast.error('Error al agregar'); }
  }

  function cerrarFormularioAlta() {
    const quedan = enCadena && agregandoTipos.length > 0;
    setAgregando(null);
    setEnCadena(false);
    setAgregandoTipos([]);
    if (quedan) {
      hacerBackup();
      toast('Carga cancelada: se respaldó el estado actual y las listas restantes quedaron sin registrar', { icon: '⚠️' });
    }
  }



  function buscar(base) {
    if (!busqueda.trim()) return base;
    const q = norm(busqueda);
    return base.filter((x) => norm(x.p?.nombre ?? x.nombre).includes(q));
  }

  // ---- Bloques por mes (cumpleaños) ----
  const bloquesMes = MESES_ES.map((nombreMes, mes) => {
    const items = data.cumple
      .map((p, idx) => ({ p, idx }))
      .filter((x) => x.p.mes === mes)
      .sort((a, b) => a.p.dia - b.p.dia);
    return { mes, nombreMes, items };
  });

  // ---- Listas para niño / navidad ----
  const listaSimple = data[tab].map((p, idx) => ({ p, idx }));

  function renderLista(base, tipo) {
    const filtrados = buscar(base);
    if (filtrados.length === 0) {
      return <div className="lx-vacio">{busqueda ? `Sin resultados para "${busqueda}"` : 'Sin datos. Cargue el Excel.'}</div>;
    }
    return (
            <div className="lx-grid lx-grid-lista">
        {filtrados.map(({ p, idx }) => (
          <PersonCard
            key={`${tipo}${idx}`}
            icon={tipo === 'cumple' ? Cake : tipo === 'nino' ? Baby : Gift}
            color={tipo === 'cumple' ? '#d4af37' : tipo === 'nino' ? '#818cf8' : '#f87171'}
            nombre={p.nombre}
            detalle={tipo === 'cumple' ? `${p.dia} de ${MESES_ES[p.mes]}` : (p.fecha || TITULOS[tipo])}
            chip={tipo === 'cumple' ? (p.estado === 1 ? 'ACTIVO' : 'A CONFIRMAR') : undefined}
            chipColor={p.estado === 1 ? '#34d399' : '#9ca3af'}
            atenuado={tipo === 'cumple' && p.estado !== 1}
            onEdit={() => abrirEdicion(tipo, idx)}
            onDelete={() => pedirDelete(tipo, idx)}
          />
        ))}
      </div>
    );
  }

  const resumenNombre = `${nombreBackupLuxcar()}.xlsx`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
        <div style={iconBox('linear-gradient(135deg, #d4af37 0%, #b8962e 100%)')}>
          <Gift size={20} color="#12121f" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '800', color: '#f3f4f6' }}>Regalos Empresariales</h1>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#9ca3af' }}>Cumpleaños y eventos de clientes</p>
        </div>
      </div>

      {/* Toolbar unificado: tabs + buscador + acciones */}
      <div className="lx-toolbar">
        <div className="lx-tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`lx-tab${tab === id ? ' on' : ''}`} onClick={() => { setTab(id); setBusqueda(''); }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="lx-buscar">
          <Search size={15} color="#9ca3af" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={`Buscar en ${TITULOS[tab]}...`}
          />
          {busqueda && (
            <button className="lx-btn-ico" title="Limpiar" onClick={() => setBusqueda('')}><X size={13} /></button>
          )}
        </div>
        <div className="lx-toolbar-acc">
          {!busqueda && (
            <button className="lx-btn lx-btn-gold" onClick={() => setAgregandoTipo('choose')}>
              <Plus size={14} /> Agregar
            </button>
          )}
          <button className="lx-btn lx-btn-ghost" onClick={hacerBackup} title="Descargar copia de seguridad en Excel">
            <Download size={14} /> Backup
          </button>
          <button className="lx-btn lx-btn-gold" onClick={() => fileRef.current?.click()} disabled={cargando}>
            <Upload size={14} /> {cargando ? 'Procesando...' : 'Cargar Excel'}
          </button>
          <button className="lx-btn lx-btn-ghost" onClick={cargar} title="Recargar">
            <RefreshCw size={14} />
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: 'none' }} />
      </div>

      {/* Franja de métricas */}
      <div className="lx-strip">
        <StatStripItem icon={Users} color="#d4af37" grad="linear-gradient(135deg, #713f12 0%, #a16207 100%)" label="Cumpleaños Activos" value={activos.length} />
        <StatStripItem icon={CalendarDays} color="#34d399" grad="linear-gradient(135deg, #065f46 0%, #047857 100%)" label="Próximos 30 Días" value={proximos.length} />
        <StatStripItem icon={Baby} color="#818cf8" grad="linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)" label="Día del Niño" value={data.nino.length} />
        <StatStripItem icon={Gift} color="#f87171" grad="linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)" label="Navidad" value={data.navidad.length} />
      </div>

      {/* Ayuda (colapsable: una línea) */}
      <details className="lx-hint">
        <summary>
          <Info size={14} className="lx-hint-ico" />
          <span>¿Cómo funciona?</span>
          <span className="lx-hint-res">
            Cada mes es un bloque con click para abrir · buscador por nombre · <b>backup obligatorio</b> antes de editar o eliminar
          </span>
          <ChevronRight size={14} className="lx-hint-arrow" />
        </summary>
        <ul className="lx-hint-grid">
          <li><b>Bloques por mes:</b> Cada mes es un bloque. Hacé <b>clic</b> para abrir y ver/editar todas las personas de ese mes.</li>
          <li><b>Próximos 30 días:</b> Sólo para Cumpleaños (activos). Se ocultan cuando hay una búsqueda activa.</li>
          <li><b>Búsqueda:</b> Filtra por nombre dentro de la pestaña activa. Limpiá con la <b>X</b> para volver a la vista agrupada.</li>
          <li><b>Agregar manual:</b> Suma <b>una persona por vez</b> (modo <span className="gold">append</span>). <b>No reemplaza</b> el listado. Pregunta primero a dónde cargar y evita duplicados.</li>
          <li><b>Carga desde Excel:</b> Es <b>masiva</b> y <span className="warn"><b>REEMPLAZA TODO</b></span>. El archivo debe incluir <b>todas</b> las personas que querés conservar.</li>
          <li><b>Seguridad:</b> Antes de <b>editar o eliminar</b> se descarga <b className="gold">obligatoriamente</b> un backup Excel (<i>{resumenNombre}</i>) con formato original.</li>
        </ul>
      </details>

      {/* Bloque unificado: Agregar manual + Carga desde Excel (2 columnas) */}
      <div className="lx-data-block">
        <div className="lx-data-col">
          <div className="lx-data-head">
            <div className="lx-data-title">
              <span className="lx-data-dot" style={{ background: '#d4af37' }} />
              Agregar manual (uno por vez)
            </div>
          </div>
          <p className="lx-data-desc">
            <b>Individual:</b> suma una sola persona sin tocar lo cargado. Ideal para <b>altas puntuales</b>.
            Te pregunta <b>antes</b> si va a <b>Cumpleaños / Día del Niño / Navidad</b>.
            Evita duplicados por <span className="gold">nombre + fecha</span>.
          </p>
          <div className="lx-data-actions">
            <button className="lx-btn lx-btn-gold" onClick={() => setAgregandoTipo('choose')}>
              <Plus size={14} /> Agregar persona
            </button>
          </div>
        </div>

        <div className="lx-data-col">
          <div className="lx-data-head">
            <div className="lx-data-title">
              <span className="lx-data-dot" style={{ background: '#34d399' }} />
              Carga masiva desde Excel
            </div>
            <div className="lx-data-actions" style={{ marginTop: 0 }}>
              <button className="lx-btn lx-btn-ghost" onClick={hacerBackup}>
                <Download size={14} /> Backup
              </button>
              <button className="lx-btn lx-btn-gold" onClick={() => fileRef.current?.click()} disabled={cargando}>
                <Upload size={14} /> {cargando ? 'Procesando...' : 'Cargar Excel'}
              </button>
            </div>
          </div>
          <p className="lx-data-desc">
            Hojas: <b>CUMPLES</b> · <b>DIA DEL ÑINO</b> · <b>NAVIDAD</b>.
            Este modo <span className="warn"><b>REEMPLAZA TODO</b></span>: el Excel debe incluir <b>todas</b> las personas a conservar + las nuevas.
          </p>
          <div className="lx-data-actions">
            <button className="lx-btn lx-btn-ghost" onClick={cargar} title="Recargar desde Firestore">
              <RefreshCw size={14} /> Recargar
            </button>
          </div>
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="loading-screen"><div className="spinner" /></div>
      ) : tab === 'cumple' ? (
        <>
          {/* Próximos 30 días (solo sin búsqueda) */}
          {!busqueda && proximos.length > 0 && (
            <section>
              <div className="lx-sec-head">
                <span className="lx-sec-ico" style={{ background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)' }}>
                  <CalendarDays size={16} color="#34d399" />
                </span>
                <span className="lx-sec-tit" style={{ color: '#34d399' }}>Próximos 30 Días</span>
                <span className="lx-sec-count">{proximos.length}</span>
              </div>
              <div className="lx-grid lx-grid-lista">
                {proximos.map((p) => (
                    <PersonCard key={`prox-${p.idx}`} icon={Cake} color="#d4af37"
                      nombre={p.nombre}
                      detalle={`${p.dia} de ${MESES_ES[p.mes]}`}
                      chip={p.dias === 0 ? '¡HOY!' : p.dias === 1 ? 'MAÑANA' : `EN ${p.dias} DÍAS`}
                      chipColor={p.dias <= 1 ? '#f87171' : '#34d399'}
                      onEdit={() => abrirEdicion('cumple', p.idx)}
                      onDelete={() => pedirDelete('cumple', p.idx)} />
                ))}
              </div>
            </section>
          )}

          {/* Bloques por mes o resultados de búsqueda */}
          <section>
            <div className="lx-sec-head">
              <span className="lx-sec-ico" style={{ background: 'linear-gradient(135deg, #713f12 0%, #a16207 100%)' }}>
                <Cake size={16} color="#d4af37" />
              </span>
              <span className="lx-sec-tit">
                {busqueda ? 'Resultados de Búsqueda' : 'Cumpleaños por Mes'}
              </span>
              <span className="lx-sec-count">
                {busqueda ? data.cumple.filter((p) => norm(p.nombre).includes(norm(busqueda))).length : data.cumple.length}
              </span>
            </div>

            {busqueda ? (
              renderLista(data.cumple.map((p, idx) => ({ p, idx })), 'cumple')
            ) : bloquesMes.every((b) => b.items.length === 0) ? (
              <div className="lx-vacio">Sin datos. Cargue el Excel de cumpleaños para comenzar.</div>
            ) : (
              <div className="lx-grid">
                {bloquesMes.map((b, i) => {
                  const esHoy = hoy.getMonth() === b.mes;
                  const primeros = b.items.slice(0, 3).map((x) => x.p.nombre);
                  return (
                    <div
                      key={b.mes}
                      className={`lx-mes${esHoy ? ' hoy' : ''}`}
                      style={{ animationDelay: `${i * 45}ms` }}
                      onClick={() => b.items.length > 0 && setMesModal(b.mes)}
                    >
                      <div className="lx-mes-top">
                        <span className="lx-mes-nombre">{b.nombreMes}</span>
                        <div className="lx-mes-top-r">
                          {esHoy && <span className="lx-mes-hoy">HOY</span>}
                          <span className="lx-mes-cont">{b.items.length}</span>
                          {b.items.length > 0 && <ChevronRight size={14} className="lx-mes-arrow" />}
                        </div>
                      </div>
                      {b.items.length === 0 ? (
                        <div className="lx-mes-vacio">Sin cumpleaños</div>
                      ) : (
                        <div className="lx-mes-nombres">
                          {primeros.map((n, j) => <span key={`${n}-${j}`} className="lx-mini">{n}</span>)}
                          {b.items.length > 3 && <span className="lx-mas">+{b.items.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <section>
          <div className="lx-sec-head">
            <span className="lx-sec-ico" style={{ background: tab === 'nino'
              ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)'
              : 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)' }}>
              {tab === 'nino' ? <Baby size={16} color="#818cf8" /> : <Gift size={16} color="#f87171" />}
            </span>
            <span className="lx-sec-tit">
              {busqueda ? 'Resultados de Búsqueda' : TITULOS[tab]}
            </span>
            <span className="lx-sec-count">
              {busqueda ? listaSimple.filter((x) => norm(x.p.nombre).includes(norm(busqueda))).length : listaSimple.length}
            </span>
          </div>
          {renderLista(listaSimple, tab)}
        </section>
      )}

      {/* Modal: lista de un mes */}
      {mesModal !== null && (
        <div className="lx-overlay">
          <div className="lx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lx-modal-head">
              <div style={iconBox('linear-gradient(135deg, #713f12 0%, #a16207 100%)')}>
                <Cake size={18} color="#d4af37" />
              </div>
              <span className="lx-modal-title">{MESES_ES[mesModal]} · {bloquesMes[mesModal].items.length} cumpleaños</span>
              <button className="lx-btn-ico" onClick={() => setMesModal(null)}><X size={16} /></button>
            </div>
            <div className="lx-modal-body">
              {bloquesMes[mesModal].items.map(({ p, idx }) => (
                <PersonCard key={`modal${idx}`} icon={Cake} color="#d4af37"
                  nombre={p.nombre}
                  detalle={`${p.dia} de ${MESES_ES[p.mes]}`}
                  chip={p.estado === 1 ? 'ACTIVO' : 'A CONFIRMAR'}
                  chipColor={p.estado === 1 ? '#34d399' : '#9ca3af'}
                  atenuado={p.estado !== 1}
                  onEdit={() => abrirEdicion('cumple', idx)}
                  onDelete={() => pedirDelete('cumple', idx)} />
              ))}
            </div>
            <div className="lx-modal-foot">
              <button className="lx-btn lx-btn-ghost" onClick={() => setMesModal(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmación de backup obligatorio */}
      {pendiente && (
        <div className="lx-overlay" style={{ zIndex: 950 }}>
          <div className="lx-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="lx-modal-head">
              <div style={iconBox('linear-gradient(135deg, #713f12 0%, #a16207 100%)')}>
                <ShieldAlert size={18} color="#facc15" />
              </div>
              <span className="lx-modal-title">
                {pendiente.accion === 'edit' ? 'Editar' : pendiente.accion === 'add' ? 'Agregar' : 'Eliminar'}: {pendiente.nombre}
              </span>
            </div>
            <div className="lx-modal-body">
              <div className="lx-aviso">
                <ShieldAlert size={20} color="#facc15" style={{ flexShrink: 0, marginTop: 2 }} />
                <p>
                  Antes de <b>{pendiente.accion === 'edit' ? 'editar' : pendiente.accion === 'add' ? 'agregar' : 'eliminar'}</b> cualquier dato se descarga
                  una copia de seguridad en Excel con el <b>formato original</b> (hojas CUMPLES / DIA DEL ÑINO / NAVIDAD):
                  <br /><code>{resumenNombre}</code>
                </p>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.6 }}>
                {pendiente.accion === 'edit'
                  ? 'Al continuar se descargará el backup y se abrirá el formulario de edición.'
                  : pendiente.accion === 'add'
                    ? 'Al continuar se descargará el backup y el registro se guardará en la lista.'
                    : 'Al continuar se descargará el backup y la persona se eliminará de la lista.'}
              </p>
            </div>
            <div className="lx-modal-foot">
              <button className="lx-btn lx-btn-ghost" onClick={() => { setPendiente(null); setAgregandoTipos([]); setEnCadena(false); }}>Cancelar</button>
              <button className="lx-btn lx-btn-gold" onClick={confirmarBackup}>
                <Download size={15} /> Descargar backup y continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: edición */}
      {editando && (
        <div className="lx-overlay">
          <div className="lx-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="lx-modal-head">
              <div style={iconBox('linear-gradient(135deg, #713f12 0%, #a16207 100%)')}>
                <Pencil size={17} color="#d4af37" />
              </div>
              <span className="lx-modal-title">Editar {TITULOS[editando.tipo]}</span>
              <button className="lx-btn-ico" onClick={() => setEditando(null)}><X size={16} /></button>
            </div>
            <div className="lx-modal-body">
              <div className="lx-form">
                <div className="lx-field">
                  <label>Nombre</label>
                  <input value={editando.nombre} autoFocus
                    onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
                </div>
                {editando.tipo === 'cumple' ? (
                  <div className="lx-row3">
                    <div className="lx-field">
                      <label>Día</label>
                      <input type="number" min="1" max="31" value={editando.dia}
                        onChange={(e) => setEditando({ ...editando, dia: e.target.value })} />
                    </div>
                    <div className="lx-field">
                      <label>Mes</label>
                      <select value={editando.mes}
                        onChange={(e) => setEditando({ ...editando, mes: Number(e.target.value) })}>
                        {MESES_ES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                      </select>
                    </div>
                    <div className="lx-field">
                      <label>Estado</label>
                      <select value={editando.estado}
                        onChange={(e) => setEditando({ ...editando, estado: Number(e.target.value) })}>
                        <option value={1}>Activo</option>
                        <option value={2}>A confirmar</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="lx-row2">
                    <div className="lx-field">
                      <label>Día</label>
                      <input type="number" min="1" max="31" value={editando.dia}
                        onChange={(e) => setEditando({ ...editando, dia: e.target.value })} />
                    </div>
                    <div className="lx-field">
                      <label>Mes</label>
                      <select value={editando.mes}
                        onChange={(e) => setEditando({ ...editando, mes: Number(e.target.value) })}>
                        {MESES_ES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                <FechaRefHint tipo={editando.tipo} />
              </div>
            </div>
            <div className="lx-modal-foot">
              <button className="lx-btn lx-btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="lx-btn lx-btn-gold" onClick={guardarEdicion}>
                <Save size={15} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: elegir tipo de alta manual */}
      {agregandoTipo === 'choose' && (
        <div className="lx-overlay">
          <div className="lx-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="lx-modal-head">
              <div style={iconBox('linear-gradient(135deg, #d4af37 0%, #b8962e 100%)')}>
                <Plus size={18} color="#12121f" />
              </div>
              <span className="lx-modal-title">¿A dónde agregar?</span>
              <button className="lx-btn-ico" onClick={() => setAgregandoTipo(null)}><X size={16} /></button>
            </div>
            <div className="lx-modal-body" style={{ flexDirection: 'column', gap: 0.5 }}>
              {[
                { id: 'cumple', label: 'Cumpleaños', icon: Cake, color: '#d4af37' },
                { id: 'nino', label: 'Día del Niño', icon: Baby, color: '#818cf8' },
                { id: 'navidad', label: 'Navidad', icon: Gift, color: '#f87171' },
              ].map(({ id, label, icon: Icon, color }) => (
                <button
                  key={id}
                  className="lx-btn lx-btn-ghost"
                  style={{ width: '100%', minHeight: 44, justifyContent: 'flex-start', borderColor: agregandoTipos.includes(id) ? color : undefined, background: agregandoTipos.includes(id) ? `${color}15` : undefined }}
                  onClick={() => {
                    setAgregandoTipos((prev) =>
                      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
                    );
                  }}
                >
                  <Icon size={16} color={color} /> {label}
                  {agregandoTipos.includes(id) && <span style={{ marginLeft: 'auto', color }}>✓</span>}
                </button>
              ))}
            </div>
            <div className="lx-modal-foot">
              <button className="lx-btn lx-btn-ghost" onClick={() => { setAgregandoTipo(null); setAgregandoTipos([]); }}>Cancelar</button>
              <button
                className="lx-btn lx-btn-gold"
                disabled={agregandoTipos.length === 0}
                onClick={() => {
                  setAgregandoTipo(null);
                  setAgregandoTipoHandler(agregandoTipos[0]);
                }}
              >
                Continuar con {agregandoTipos.length} seleccionado{agregandoTipos.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: formulario de alta manual */}
      {agregando && (
        <div className="lx-overlay">
          <div className="lx-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="lx-modal-head">
              <div style={iconBox('linear-gradient(135deg, #d4af37 0%, #b8962e 100%)')}>
                <Plus size={17} color="#12121f" />
              </div>
              <span className="lx-modal-title">Agregar a {TITULOS[agregando.tipo]}</span>
              <button className="lx-btn-ico" onClick={cerrarFormularioAlta}><X size={16} /></button>
            </div>
            <div className="lx-modal-body">
              <div className="lx-form">
                <div className="lx-field">
                  <label>Nombre</label>
                  <input value={agregando.nombre} autoFocus placeholder="Nombre y Apellido"
                    onChange={(e) => setAgregando({ ...agregando, nombre: e.target.value })} />
                </div>
                {agregando.tipo === 'cumple' ? (
                  <div className="lx-row3">
                    <div className="lx-field">
                      <label>Día</label>
                      <input type="number" min="1" max="31" value={agregando.dia}
                        onChange={(e) => setAgregando({ ...agregando, dia: e.target.value })} />
                    </div>
                    <div className="lx-field">
                      <label>Mes</label>
                      <select value={agregando.mes}
                        onChange={(e) => setAgregando({ ...agregando, mes: Number(e.target.value) })}>
                        {MESES_ES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                      </select>
                    </div>
                    <div className="lx-field">
                      <label>Estado</label>
                      <select value={agregando.estado}
                        onChange={(e) => setAgregando({ ...agregando, estado: Number(e.target.value) })}>
                        <option value={1}>Activo</option>
                        <option value={2}>A confirmar</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="lx-row2">
                    <div className="lx-field">
                      <label>Día</label>
                      <input type="number" min="1" max="31" value={agregando.dia}
                        onChange={(e) => setAgregando({ ...agregando, dia: e.target.value })} />
                    </div>
                    <div className="lx-field">
                      <label>Mes</label>
                      <select value={agregando.mes}
                        onChange={(e) => setAgregando({ ...agregando, mes: Number(e.target.value) })}>
                        {MESES_ES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                <FechaRefHint tipo={agregando.tipo} />
              </div>
            </div>
            <div className="lx-modal-foot">
              <button className="lx-btn lx-btn-ghost" onClick={cerrarFormularioAlta}>Cancelar</button>
              <button className="lx-btn lx-btn-gold" onClick={guardarAgregar}>
                <Save size={15} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
