import { useState } from 'react';
import { CheckCircle2, FileX2, CopyX, DatabaseZap, Trash2, Download } from 'lucide-react';
import { formatCurrency } from '../utils/formatCurrency';
import mockDB from '../services/firestoreDB';
import toast from 'react-hot-toast';

// Inspector de verificacion de carga: chips por categoria + panel de detalle.
// - "Dup. del archivo": filas repetidas dentro del Excel (omitidas por defecto).
//   Se pueden marcar y CARGARLAS IGUALMENTE si el usuario decide que son reales.
// - "Ya en la base": coinciden con registros existentes; se pueden marcar y
//   ELIMINARLOS de la base (auditoria + recalculo automaticos).
const MAX_FILAS = 200;

function Chip({ activo, n, color, icono: Icono, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="chk-chip"
      style={{
        borderColor: activo ? color : 'rgba(255,255,255,0.08)',
        background: activo ? `${color}1a` : 'rgba(255,255,255,0.02)',
        boxShadow: activo ? `0 0 12px ${color}22` : 'none',
      }}
    >
      <Icono size={13} color={activo ? color : '#6b7280'} />
      <span style={{ color: activo ? '#f3f4f6' : '#9ca3af' }}>{label}</span>
      {n !== null && <span className="chk-n" style={{ background: `${color}22`, color }}> {n} </span>}
    </button>
  );
}

function PanelVacio({ texto }) {
  return <div className="chk-panel"><div className="chk-vacio">{texto}</div></div>;
}

export default function ResultadoCarga({ r, soloRevision = false, usuario }) {
  const [cat, setCat] = useState(null);
  const [listaBase, setListaBase] = useState(r.duplicates || { caja: [], ventas: [] });
  const [listaArchivo, setListaArchivo] = useState({
    caja: r.internosDetalle?.caja || [], ventas: r.internosDetalle?.ventas || [],
  });
  const [selBase, setSelBase] = useState(new Set());
  const [selArchivo, setSelArchivo] = useState(new Set());
  const [confirmando, setConfirmando] = useState(null); // 'base' | 'archivo' | null
  const [ejecutando, setEjecutando] = useState(false);

  const nCargados = (r.cajaCount || 0) + (r.ventasCount || 0);
  const dupArchivo = [...listaArchivo.caja.map((m) => ({ ...m, _sec: 'caja' })), ...listaArchivo.ventas.map((m) => ({ ...m, _sec: 'ventas' }))];
  const dupBase = [...(listaBase.caja || []).map((d) => ({ ...d, _sec: 'caja' })), ...(listaBase.ventas || []).map((d) => ({ ...d, _sec: 'ventas' }))];
  const saltadas = r.skippedRows || [];

  const cats = [
    { key: 'cargados', label: 'Cargados', n: soloRevision ? null : nCargados, color: '#10b981', icono: CheckCircle2 },
    { key: 'archivo', label: 'Dup. del archivo', n: dupArchivo.length, color: '#f59e0b', icono: CopyX },
    { key: 'base', label: 'Ya en la base', n: soloRevision ? null : dupBase.length, color: '#fb923c', icono: DatabaseZap },
    { key: 'saltadas', label: 'Sin clasificar', n: saltadas.length, color: '#94a3b8', icono: FileX2 },
  ].filter((c) => c.n !== null);

  const toggle = (k) => { setCat(cat === k ? null : k); setConfirmando(null); };

  // ---- seleccion: dup. del archivo (incluir en la carga) ----
  const keyArch = (m, i) => `${m._sec}|${i}`;
  const toggleArch = (m, i) => {
    setSelArchivo((prev) => {
      const nx = new Set(prev);
      if (nx.has(keyArch(m, i))) nx.delete(keyArch(m, i)); else nx.add(keyArch(m, i));
      return nx;
    });
    setConfirmando(null);
  };
  const todosArch = dupArchivo.length > 0 && dupArchivo.every((m, i) => selArchivo.has(keyArch(m, i)));
  const toggleTodosArch = () => {
    setSelArchivo(todosArch ? new Set() : new Set(dupArchivo.map((m, i) => keyArch(m, i))));
    setConfirmando(null);
  };

  const cargarSeleccionados = async () => {
    if (confirmando !== 'archivo') { setConfirmando('archivo'); return; }
    setEjecutando(true);
    const elegidos = dupArchivo.filter((m, i) => selArchivo.has(keyArch(m, i)));
    const cajaElegidos = elegidos.filter((m) => m._sec === 'caja');
    const ventasElegidos = elegidos.filter((m) => m._sec === 'ventas');
    let ok = 0;
    try {
      if (cajaElegidos.length > 0) ok += (await mockDB.addBulkCajaMovimientos(cajaElegidos)).length;
      if (ventasElegidos.length > 0) ok += (await mockDB.addBulkVentas(ventasElegidos.map((v) => ({ ...v, usuario: usuario || 'sistema' })))).length;
    } catch (e) {
      toast.error(`Error al incluir: ${e.message}`);
    }
    setListaArchivo((prev) => ({
      caja: prev.caja.filter((m) => !cajaElegidos.includes(m)),
      ventas: prev.ventas.filter((m) => !ventasElegidos.includes(m)),
    }));
    setSelArchivo(new Set());
    setConfirmando(null);
    setEjecutando(false);
    if (ok > 0) toast.success(`${ok} registro(s) incluido(s) en la carga`);
  };

  // ---- seleccion: ya en la base (eliminar de la base) ----
  const keyOf = (d) => `${d._sec}|${d.existing.id}`;
  const toggleSel = (d) => {
    setSelBase((prev) => {
      const nx = new Set(prev);
      if (nx.has(keyOf(d))) nx.delete(keyOf(d)); else nx.add(keyOf(d));
      return nx;
    });
    setConfirmando(null);
  };
  const todosBase = dupBase.length > 0 && dupBase.every((d) => selBase.has(keyOf(d)));
  const toggleTodosBase = () => {
    setSelBase(todosBase ? new Set() : new Set(dupBase.map((d) => keyOf(d))));
    setConfirmando(null);
  };

  const eliminarSeleccionados = async () => {
    if (confirmando !== 'base') { setConfirmando('base'); return; }
    setEjecutando(true);
    const elegidos = dupBase.filter((d) => selBase.has(keyOf(d)));
    let ok = 0;
    let fallos = 0;
    for (const d of elegidos) {
      try {
        if (d._sec === 'caja') await mockDB.deleteCajaMovimiento(d.existing.id, usuario);
        else await mockDB.deleteVenta(d.existing.id, usuario);
        ok++;
      } catch {
        fallos++;
      }
    }
    setListaBase((prev) => ({
      caja: (prev.caja || []).filter((d) => !selBase.has(`caja|${d.existing.id}`)),
      ventas: (prev.ventas || []).filter((d) => !selBase.has(`ventas|${d.existing.id}`)),
    }));
    setSelBase(new Set());
    setConfirmando(null);
    setEjecutando(false);
    if (ok > 0) toast.success(`${ok} registro(s) eliminado(s) de la base`);
    if (fallos > 0) toast.error(`${fallos} no pudieron eliminarse`);
  };

  return (
    <div className="chk-wrap">
      <div className="chk-tabs">
        {cats.map((c) => (
          <Chip key={c.key} activo={cat === c.key} n={c.n} color={c.color} icono={c.icono} label={c.label} onClick={() => toggle(c.key)} />
        ))}
      </div>

      {cat === 'cargados' && (
        <div className="chk-panel">
          <div className="chk-resumen">
            <div><span className="chk-k">Caja</span><strong style={{ color: '#10b981' }}>{r.cajaCount || 0} movimientos</strong></div>
            <div><span className="chk-k">Ventas</span><strong style={{ color: '#10b981' }}>{r.ventasCount || 0} registros</strong></div>
            {r.analyzedTotal > 0 && (
              <>
                <div><span className="chk-k">Filas del archivo</span><strong>{r.analyzedTotal}</strong></div>
                <div>
                  <span className="chk-k">Cuadre</span>
                  {(nCargados + (r.internos?.caja || 0) + (r.internos?.ventas || 0) + ((listaBase.caja?.length || 0) + (listaBase.ventas?.length || 0)) + (r.skipped || 0) === r.analyzedTotal)
                    ? <strong style={{ color: '#10b981' }}>exacto</strong>
                    : <strong style={{ color: '#f59e0b' }}>dif. {r.analyzedTotal - nCargados - ((r.internos?.caja || 0) + (r.internos?.ventas || 0)) - ((listaBase.caja?.length || 0) + (listaBase.ventas?.length || 0)) - (r.skipped || 0)}</strong>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {cat === 'archivo' && (
        <>
          {dupArchivo.length === 0 ? (
            <PanelVacio texto="No hay duplicados internos en este archivo." />
          ) : (
            <>
              <div className="chk-nota">Repetidos dentro del propio Excel: se omiten por defecto. Marcalos y usá el boton si alguno es un movimiento real que queres cargar.</div>
              {selArchivo.size > 0 && (
                <div className="chk-acciones">
                  <button
                    className="chk-borrar chk-incluir"
                    onClick={cargarSeleccionados}
                    disabled={ejecutando}
                    style={{
                      background: confirmando === 'archivo' ? '#10b981' : 'rgba(16,185,129,0.12)',
                      color: confirmando === 'archivo' ? '#fff' : '#10b981',
                      borderColor: 'rgba(16,185,129,0.35)',
                    }}
                  >
                    <Download size={13} />
                    {ejecutando ? 'Incluyendo...' : confirmando === 'archivo' ? `Confirmar inclusion (${selArchivo.size})` : `Cargar igualmente (${selArchivo.size})`}
                  </button>
                  {confirmando === 'archivo' && <span className="chk-aviso">Se agregaran a la base como movimientos normales.</span>}
                </div>
              )}
              <div className="chk-panel">
                <table className="chk-table">
                  <thead>
                    <tr>
                      <th className="chk-col-check"><input type="checkbox" checked={todosArch} onChange={toggleTodosArch} /></th>
                      <th>Fecha</th><th>Seccion</th><th>Tipo</th><th className="chk-num">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dupArchivo.slice(0, MAX_FILAS).map((m, i) => (
                      <tr key={i} style={{ opacity: selArchivo.has(keyArch(m, i)) ? 0.55 : 1 }}>
                        <td className="chk-col-check"><input type="checkbox" checked={selArchivo.has(keyArch(m, i))} onChange={() => toggleArch(m, i)} /></td>
                        <td>{m.fecha}</td>
                        <td><span className="chk-badge" style={{ background: m.codigo ? 'rgba(250,204,21,0.12)' : 'rgba(129,140,248,0.12)', color: m.codigo ? '#facc15' : '#818cf8' }}>{m.codigo ? 'Caja' : 'Ventas'}</span></td>
                        <td>{m.tipo}</td>
                        <td className="chk-num">{formatCurrency(m.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dupArchivo.length > MAX_FILAS && <div className="chk-mas">Mostrando {MAX_FILAS} de {dupArchivo.length} filas...</div>}
              </div>
            </>
          )}
        </>
      )}

      {cat === 'base' && (
        <>
          {dupBase.length === 0 ? (
            <PanelVacio texto="Ningun registro coincide con lo ya cargado en la base." />
          ) : (
            <>
              <div className="chk-nota">Coinciden con registros existentes. Marcalos para ELIMINARLOS de la base (con auditoria y recalculo de saldo).</div>
              {selBase.size > 0 && (
                <div className="chk-acciones">
                  <button
                    className="chk-borrar"
                    onClick={eliminarSeleccionados}
                    disabled={ejecutando}
                    style={{
                      background: confirmando === 'base' ? '#ef4444' : 'rgba(239,68,68,0.12)',
                      color: confirmando === 'base' ? '#fff' : '#ef4444',
                    }}
                  >
                    <Trash2 size={13} />
                    {ejecutando ? 'Eliminando...' : confirmando === 'base' ? `Confirmar eliminacion (${selBase.size})` : `Eliminar de la base (${selBase.size})`}
                  </button>
                  {confirmando === 'base' && <span className="chk-aviso">Se borran definitivamente. Quedan en auditoria.</span>}
                </div>
              )}
              <div className="chk-panel">
                <table className="chk-table">
                  <thead>
                    <tr>
                      <th className="chk-col-check"><input type="checkbox" checked={todosBase} onChange={toggleTodosBase} /></th>
                      <th>Fecha</th><th>Seccion</th><th>Tipo</th><th className="chk-num">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dupBase.slice(0, MAX_FILAS).map((d, i) => (
                      <tr key={i} style={{ opacity: selBase.has(keyOf(d)) ? 0.55 : 1 }}>
                        <td className="chk-col-check"><input type="checkbox" checked={selBase.has(keyOf(d))} onChange={() => toggleSel(d)} /></td>
                        <td>{d.incoming.fecha}</td>
                        <td><span className="chk-badge" style={{ background: d.incoming.codigo ? 'rgba(250,204,21,0.12)' : 'rgba(129,140,248,0.12)', color: d.incoming.codigo ? '#facc15' : '#818cf8' }}>{d.incoming.codigo ? 'Caja' : 'Ventas'}</span></td>
                        <td>{d.incoming.tipo}</td>
                        <td className="chk-num">{formatCurrency(d.incoming.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dupBase.length > MAX_FILAS && <div className="chk-mas">Mostrando {MAX_FILAS} de {dupBase.length} filas...</div>}
              </div>
            </>
          )}
        </>
      )}

      {cat === 'saltadas' && (
        <>
          {saltadas.length === 0 ? (
            <PanelVacio texto="No hubo filas sin clasificar." />
          ) : (
            <div className="chk-panel">
              <table className="chk-table">
                <thead><tr><th>Fila</th><th>Fecha</th><th>Tipo</th><th>Valor</th><th className="chk-num">Monto</th><th>Motivo</th></tr></thead>
                <tbody>
                  {saltadas.slice(0, MAX_FILAS).map((s, j) => (
                    <tr key={j}>
                      <td style={{ color: '#6b7280' }}>{s.fila}</td>
                      <td>{s.fecha}</td>
                      <td>{s.tipo}</td>
                      <td><span className="chk-valor">{String(s.valor)}</span></td>
                      <td className="chk-num">{s.monto}</td>
                      <td style={{ color: '#ef4444' }}>{s.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {saltadas.length > MAX_FILAS && <div className="chk-mas">Mostrando {MAX_FILAS} de {saltadas.length} filas...</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
