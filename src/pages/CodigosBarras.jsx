import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import firestoreDB from '../services/firestoreDB';
import {
  getCatalogos, addItem, updateItem, deleteItem, nextPrendaCodigo,
} from '../services/codigosDB';
import JsBarcode from 'jsbarcode';
import toast from 'react-hot-toast';
import {
  Barcode, Plus, Pencil, Trash2, Printer, Copy, X, Search, Tag, Shirt, Palette, Ruler, Download,
} from 'lucide-react';
import './CodigosBarras.css';

// ============================================================
// Formato del codigo (10 digitos):  XX  XXXX  XX  XX
//   2 marca + 4 prenda + 2 color + 2 talle
// ============================================================

const TIPOS_META = {
  marcas: { titulo: 'Marcas', label: 'Marca', campoLabel: 'Nombre de la marca', icono: Tag, color: '#d4af37', largo: 2, manual: true },
  prendas: { titulo: 'Prendas', label: 'Prenda', campoLabel: 'Descripcion de la prenda', icono: Shirt, color: '#60a5fa', largo: 4, manual: false },
  colores: { titulo: 'Colores', label: 'Color', campoLabel: 'Nombre del color', icono: Palette, color: '#f472b6', largo: 2, manual: true },
  talles: { titulo: 'Talles', label: 'Talle', campoLabel: 'Talle (ej: 4, S, XL)', icono: Ruler, color: '#34d399', largo: 2, manual: true },
};

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function fmtCodigo(c) {
  if (!c || c.length !== 10) return c || '';
  return `${c.slice(0, 2)} ${c.slice(2, 6)} ${c.slice(6, 8)} ${c.slice(8, 10)}`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function sugeridoCodigo(items, largo) {
  let max = 0;
  items.forEach((i) => {
    const v = parseInt(i.codigo, 10);
    if (Number.isFinite(v) && v > max) max = v;
  });
  const next = max + 1;
  if (next >= 10 ** largo) return '';
  return String(next).padStart(largo, '0');
}

// ---------- Tabla de catalogo (definida a nivel de modulo) ----------
function TablaCatalogo({ tipo, items, busqueda, setBusqueda, onAlta, onEditar, onEliminar }) {
  const meta = TIPOS_META[tipo];
  const Icon = meta.icono;
  const filtrados = items.filter((i) => norm(i.nombre).includes(norm(busqueda)));
  return (
    <div className="cb-card">
      <div className="cb-card-title">
        <Icon size={14} color={meta.color} />
        {meta.titulo}
        <span className="count">{items.length}</span>
        <span style={{ flex: 1 }} />
        <button className="cb-btn cb-btn-gold cb-btn-sm" onClick={onAlta}>
          <Plus size={13} /> Nuevo
        </button>
      </div>
      <div className="cb-toolbar">
        <input
          className="cb-input"
          placeholder="Buscar..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <span className="cb-ico-btn" style={{ cursor: 'default' }}><Search size={14} /></span>
      </div>
      <div className="cb-rows">
        {filtrados.length === 0 && (
          <div className="cb-vacio">{busqueda ? `Sin resultados para "${busqueda}"` : 'Sin datos todavía.'}</div>
        )}
        {filtrados.map((item) => (
          <div className="cb-row" key={item.codigo}>
            <span className="cb-row-code">{item.codigo}</span>
            <span className="cb-row-name" title={item.nombre}>{item.nombre}</span>
            <button className="cb-ico-btn edit" title="Editar" onClick={() => onEditar(item)}>
              <Pencil size={13} />
            </button>
            <button className="cb-ico-btn del" title="Eliminar" onClick={() => onEliminar(item)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CodigosBarras() {
  const { user } = useAuth();
  const [cat, setCat] = useState({ marcas: [], prendas: [], colores: [], talles: [] });
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState({ marcas: '', prendas: '', colores: '', talles: '' });
  const [cantidad, setCantidad] = useState(1);
  const [busquedas, setBusquedas] = useState({ marcas: '', prendas: '', colores: '', talles: '' });
  const [modal, setModal] = useState(null);          // {modo:'alta'|'edicion', tipo, codigo, nombre}
  const [confirmar, setConfirmar] = useState(null);  // {tipo, codigo, nombre}
  const [printData, setPrintData] = useState(null);  // {codigo, marca, prenda, color, talle, cantidad}
  const [barcodeUrl, setBarcodeUrl] = useState(null);
  const genRef = useRef(null);

  async function cargar() {
    try {
      setCargando(true);
      setCat(await getCatalogos());
    } catch (e) {
      toast.error('No se pudieron cargar los catalogos (¿emulador activo?)');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const marca = cat.marcas.find((i) => i.codigo === sel.marcas);
  const prenda = cat.prendas.find((i) => i.codigo === sel.prendas);
  const color = cat.colores.find((i) => i.codigo === sel.colores);
  const talle = cat.talles.find((i) => i.codigo === sel.talles);

  const codigoCompleto = useMemo(() => {
    if (marca && prenda && color && talle) {
      return marca.codigo + prenda.codigo + color.codigo + talle.codigo;
    }
    return '';
  }, [marca, prenda, color, talle]);

  // Vista previa del codigo de barras (SVG en pantalla)
  useEffect(() => {
    if (genRef.current) {
      if (codigoCompleto) {
        try {
          JsBarcode(genRef.current, codigoCompleto, {
            format: 'CODE128', width: 2.4, height: 64, margin: 0,
            fontSize: 0, displayValue: false, background: '#ffffff', lineColor: '#000000',
          });
        } catch { /* codigo invalido: no deberia pasar */ }
      } else {
        genRef.current.innerHTML = '';
      }
    }
  }, [codigoCompleto]);

  // Barcode para las etiquetas de impresion (PNG -> img)
  useEffect(() => {
    if (!printData) { setBarcodeUrl(null); return; }
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, printData.codigo, {
        format: 'CODE128', width: 2.2, height: 60, margin: 0,
        fontSize: 0, displayValue: false, background: '#ffffff', lineColor: '#000000',
      });
      setBarcodeUrl(canvas.toDataURL('image/png'));
    } catch {
      setBarcodeUrl(null);
      toast.error('No se pudo generar el codigo de barras');
    }
  }, [printData]);

  // ---------- Catalogos: altas / ediciones / bajas ----------
  function abrirAlta(tipo) {
    const meta = TIPOS_META[tipo];
    setModal({ modo: 'alta', tipo, codigo: meta.manual ? sugeridoCodigo(cat[tipo], meta.largo) : '', nombre: '' });
  }

  async function guardarModal() {
    if (!modal) return;
    const { modo, tipo } = modal;
    const nombre = modal.nombre.trim();
    if (!nombre) { toast.error('Ingresá un nombre'); return; }
    try {
      if (modo === 'alta') {
        let codigo = modal.codigo.trim();
        if (TIPOS_META[tipo].manual) {
          if (!/^\d+$/.test(codigo) || codigo.length !== TIPOS_META[tipo].largo) {
            toast.error(`El código debe tener ${TIPOS_META[tipo].largo} dígitos numéricos`);
            return;
          }
          if (cat[tipo].some((i) => i.codigo === codigo)) {
            toast.error(`El código ${codigo} ya está en uso`);
            return;
          }
        } else {
          codigo = await nextPrendaCodigo();
        }
        const nuevo = await addItem(tipo, codigo, nombre);
        setCat((c) => ({ ...c, [tipo]: [...c[tipo], nuevo].sort((a, b) => a.codigo.localeCompare(b.codigo)) }));
        toast.success(`${TIPOS_META[tipo].titulo.slice(0, -1)} ${codigo} creada`);
        await firestoreDB.addAuditLog(user?.email || 'sistema', 'ALTA', 'Codigos Barras', `${tipo}: ${codigo} "${nombre}"`);
      } else {
        await updateItem(tipo, modal.codigo, nombre);
        setCat((c) => ({ ...c, [tipo]: c[tipo].map((i) => (i.codigo === modal.codigo ? { ...i, nombre } : i)) }));
        toast.success('Actualizado');
        await firestoreDB.addAuditLog(user?.email || 'sistema', 'EDICION', 'Codigos Barras', `${tipo}: ${modal.codigo} "${nombre}"`);
      }
      setModal(null);
    } catch (e) {
      toast.error(e.message || 'Error al guardar');
    }
  }

  async function eliminarConfirmado() {
    if (!confirmar) return;
    const { tipo, codigo, nombre } = confirmar;
    try {
      await deleteItem(tipo, codigo);
      setCat((c) => ({ ...c, [tipo]: c[tipo].filter((i) => i.codigo !== codigo) }));
      setSel((s) => (s[tipo] === codigo ? { ...s, [tipo]: '' } : s));
      setConfirmar(null);
      toast.success(`Código ${codigo} eliminado`);
      await firestoreDB.addAuditLog(user?.email || 'sistema', 'ELIMINACION', 'Codigos Barras', `${tipo}: ${codigo} "${nombre}"`);
    } catch (e) {
      toast.error(e.message || 'No se pudo eliminar (¿permiso admin?)');
    }
  }

  // ---------- Impresion ----------
  function imprimir() {
    if (!codigoCompleto) return;
    setPrintData({
      codigo: codigoCompleto,
      marca: marca.nombre,
      prenda: prenda.nombre,
      color: color.nombre,
      talle: talle.nombre,
      cantidad: Math.min(Math.max(parseInt(cantidad, 10) || 1, 1), 100),
    });
    firestoreDB.addAuditLog(user?.email || 'sistema', 'IMPRESION', 'Codigos Barras',
      `Etiqueta ${fmtCodigo(codigoCompleto)} x${cantidad}`);
  }

  // Exportacion TXT de todo lo cargado (formato PROVISIONAL mientras el
  // sistema de ventas no define el definitivo: se adapta cuando este listo).
  function exportarTxt() {
    const total = cat.marcas.length + cat.prendas.length + cat.colores.length + cat.talles.length;
    if (!total) { toast.error('No hay datos para exportar'); return; }
    const hoy = new Date();
    const stamp = `${String(hoy.getDate()).padStart(2, '0')}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getFullYear()).slice(2)}`;
    const lineas = [
      '# GLAMOURS - Exportacion Codigos de Barras',
      `# Generado: ${hoy.toLocaleString('es-AR')}`,
      '# Formato PROVISIONAL - pendiente de definicion por el sistema de ventas',
      '# Registro: TIPO;CODIGO;NOMBRE',
      '',
    ];
    const agregar = (tipo, items) => items.forEach((i) => lineas.push(`${tipo};${i.codigo};${i.nombre}`));
    agregar('MARCA', cat.marcas);
    agregar('PRENDA', cat.prendas);
    agregar('COLOR', cat.colores);
    agregar('TALLE', cat.talles);
    const blob = new Blob(['\uFEFF' + lineas.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codigos_barras_${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`TXT generado con ${total} registros`);
    firestoreDB.addAuditLog(user?.email || 'sistema', 'EXPORT TXT', 'Codigos Barras', `${total} registros`);
  }

  function copiar() {
    if (!codigoCompleto) return;
    navigator.clipboard.writeText(codigoCompleto)
      .then(() => toast.success('Código copiado'))
      .catch(() => toast.error('No se pudo copiar'));
  }

  // Impresion: ventana dedicada con su propio @page (62 x 29 mm).
  // Aislada del DOM de la app: pagina bien aunque sean varias etiquetas
  // y no altera la impresion de las demas secciones.
  function imprimirPopup() {
    if (!printData) return;
    const labels = Array.from({ length: printData.cantidad }).map(() => `
      <div class="lbl">
        <div class="marca">${esc(printData.marca)}</div>
        ${barcodeUrl ? `<img src="${barcodeUrl}" alt="">` : ''}
        <div class="num">${fmtCodigo(printData.codigo)}</div>
        <div class="datos">
          <div class="prenda">${esc(printData.prenda)}</div>
          <div class="extra">${esc(printData.color)} · Talle ${esc(printData.talle)}</div>
        </div>
      </div>`).join('');
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Etiquetas ${fmtCodigo(printData.codigo)}</title>
<style>
  @page { size: 62mm 29mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; }
  .lbl {
    width: 62mm; height: 29mm; background: #fff; color: #000;
    padding: 1.2mm 2.2mm 1.2mm; display: flex; flex-direction: column;
    overflow: hidden; page-break-after: always; break-after: page;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .lbl:last-child { page-break-after: auto; break-after: auto; }
  .marca {
    width: 100%; text-align: center; font-size: 7.5pt; font-weight: 800;
    text-transform: uppercase; letter-spacing: .14em; line-height: 1.1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    padding-left: .14em;
  }
  img { width: 100%; flex: 1; min-height: 0; object-fit: contain; display: block; }
  .num {
    font-size: 8pt; font-weight: 800; text-align: center; letter-spacing: .28em;
    padding-left: .28em; line-height: 1.15; margin-top: .4mm;
  }
  .datos { text-align: center; margin-top: .5mm; }
  .prenda {
    font-size: 7.5pt; font-weight: 700; line-height: 1.15;
    max-height: 2.3em; overflow: hidden;
  }
  .extra { font-size: 6.5pt; font-weight: 500; color: #222; line-height: 1.15; }
</style>
</head>
<body>${labels}</body>
</html>`;
    const w = window.open('', '_blank', 'width=460,height=700');
    if (!w) { toast.error('Permití las ventanas emergentes para imprimir'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  }

  return (
    <div className="cb-page">
      {/* Encabezado */}
      <div className="cb-header">
        <div className="cb-icon-box"><Barcode size={20} color="#12121f" /></div>
        <div>
          <div className="cb-title">Códigos de Barras</div>
          <div className="cb-subtitle">Generador de códigos y etiquetas · Brother QL-800 (62 × 29 mm)</div>
        </div>
        <span style={{ flex: 1 }} />
        <button className="cb-btn cb-btn-ghost" onClick={exportarTxt} disabled={cargando}>
          <Download size={15} /> Exportar TXT
        </button>
      </div>

      {/* Generador */}
      <div className="cb-card">
        <div className="cb-card-title"><Barcode size={14} color="#d4af37" /> Generador de código</div>
        <div className="cb-selrow">
          {Object.keys(TIPOS_META).map((tipo) => {
            const meta = TIPOS_META[tipo];
            return (
              <div className="cb-field" key={tipo}>
                <div className="cb-field-head">
                  <label>{meta.label}</label>
                  <button className="cb-ico-btn" title={`Nueva ${meta.label.toLowerCase()}`} onClick={() => abrirAlta(tipo)}>
                    <Plus size={13} />
                  </button>
                </div>
                <select
                  className="cb-select"
                  value={sel[tipo]}
                  disabled={cargando || cat[tipo].length === 0}
                  onChange={(e) => setSel((s) => ({ ...s, [tipo]: e.target.value }))}
                >
                  <option value="">
                    {cargando ? 'Cargando...' : cat[tipo].length === 0 ? 'Sin datos (creá en la tabla)' : `Elegir ${meta.label.toLowerCase()}...`}
                  </option>
                  {cat[tipo].map((i) => (
                    <option key={i.codigo} value={i.codigo}>{i.codigo} · {i.nombre}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div className="cb-hero">
          {!codigoCompleto && (
            <div className="cb-hero-empty">
              Seleccioná marca, prenda, color y talle para ver el código de 10 dígitos
            </div>
          )}
          {codigoCompleto && (
            <>
              <div className="cb-code">{fmtCodigo(codigoCompleto)}</div>
              <div className="cb-chips">
                <span className="cb-chip">MARCA <b>{marca.nombre}</b></span>
                <span className="cb-chip">PRENDA <b>{prenda.nombre}</b></span>
                <span className="cb-chip">COLOR <b>{color.nombre}</b></span>
                <span className="cb-chip">TALLE <b>{talle.nombre}</b></span>
              </div>
              <div className="cb-barcode-box">
                <svg ref={genRef} />
                <div className="cb-barcode-num">{fmtCodigo(codigoCompleto)}</div>
              </div>
              <div className="cb-printrow">
                <div className="cb-qty">
                  <label>Cant.</label>
                  <input
                    type="number" min="1" max="100" value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                  />
                </div>
                <button className="cb-btn cb-btn-dark" onClick={copiar}>
                  <Copy size={15} /> Copiar
                </button>
                <button className="cb-btn cb-btn-gold" onClick={imprimir}>
                  <Printer size={15} /> Imprimir etiqueta
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Catalogos */}
      <div className="cb-grid">
        {Object.keys(TIPOS_META).map((tipo) => (
          <TablaCatalogo
            key={tipo}
            tipo={tipo}
            items={cat[tipo]}
            busqueda={busquedas[tipo]}
            setBusqueda={(v) => setBusquedas((b) => ({ ...b, [tipo]: v }))}
            onAlta={() => abrirAlta(tipo)}
            onEditar={(item) => setModal({ modo: 'edicion', tipo, codigo: item.codigo, nombre: item.nombre })}
            onEliminar={(item) => setConfirmar({ tipo, codigo: item.codigo, nombre: item.nombre })}
          />
        ))}
      </div>

      {/* Modal alta / edicion */}
      {modal && (
        <div className="cb-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="cb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cb-modal-head">
              <div className="cb-icon-sq" style={{ background: 'rgba(212,175,55,0.12)' }}>
                {modal.modo === 'alta' ? <Plus size={17} color="#d4af37" /> : <Pencil size={17} color="#d4af37" />}
              </div>
              <h3>{modal.modo === 'alta' ? `Nueva ${TIPOS_META[modal.tipo].label.toLowerCase()}` : 'Editar'}</h3>
              <button className="cb-ico-x" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="cb-modal-body">
              <div className="cb-field">
                <label>Código ({TIPOS_META[modal.tipo].largo} dígitos)</label>
                <input
                  className="cb-input"
                  style={{ letterSpacing: '0.15em' }}
                  value={modal.modo === 'edicion' ? modal.codigo : TIPOS_META[modal.tipo].manual ? modal.codigo : 'Se asigna automáticamente'}
                  readOnly={modal.modo === 'edicion' || !TIPOS_META[modal.tipo].manual}
                  maxLength={TIPOS_META[modal.tipo].largo}
                  inputMode="numeric"
                  onChange={(e) => setModal((m) => ({ ...m, codigo: e.target.value.replace(/\D/g, '') }))}
                />
              </div>
              <div className="cb-field">
                <label>{TIPOS_META[modal.tipo].campoLabel}</label>
                <input
                  className="cb-input"
                  autoFocus
                  value={modal.nombre}
                  placeholder={TIPOS_META[modal.tipo].manual ? 'Ej: Nike' : 'Ej: Remera manga corta'}
                  onChange={(e) => setModal((m) => ({ ...m, nombre: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') guardarModal(); }}
                />
              </div>
              {modal.modo === 'alta' && !TIPOS_META[modal.tipo].manual && (
                <div className="cb-hint" style={{ margin: 0 }}>
                  El contador nunca retrocede: si borrás una prenda, su código no se reutiliza.
                </div>
              )}
            </div>
            <div className="cb-modal-foot">
              <button className="cb-btn cb-btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button className="cb-btn cb-btn-gold" onClick={guardarModal}>
                {modal.modo === 'alta' ? 'Crear' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {confirmar && (
        <div className="cb-overlay" style={{ zIndex: 970 }} onClick={(e) => e.stopPropagation()}>
          <div className="cb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cb-modal-head">
              <div className="cb-icon-sq" style={{ background: 'rgba(127,29,29,0.35)' }}>
                <Trash2 size={17} color="#fca5a5" />
              </div>
              <h3>Eliminar código</h3>
              <button className="cb-ico-x" onClick={() => setConfirmar(null)}><X size={16} /></button>
            </div>
            <div className="cb-modal-body">
              <div className="cb-modal-text">
                Se eliminará <b>{confirmar.nombre}</b> con código <b>{confirmar.codigo}</b> de la tabla{' '}
                {TIPOS_META[confirmar.tipo].titulo.toLowerCase()}. Esta acción queda registrada en auditoría.
              </div>
            </div>
            <div className="cb-modal-foot">
              <button className="cb-btn cb-btn-ghost" onClick={() => setConfirmar(null)}>Cancelar</button>
              <button className="cb-btn cb-btn-danger" onClick={eliminarConfirmado}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal impresion */}
      {printData && (
        <div className="cb-overlay" style={{ zIndex: 980 }} onClick={() => setPrintData(null)}>
          <div className="cb-modal cb-print-preview" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="cb-modal-head">
              <div className="cb-icon-sq" style={{ background: 'rgba(212,175,55,0.12)' }}>
                <Printer size={17} color="#d4af37" />
              </div>
              <h3>Imprimir etiquetas</h3>
              <button className="cb-ico-x" onClick={() => setPrintData(null)}><X size={16} /></button>
            </div>
            <div className="cb-modal-body">
              <div className="cb-print-summary">
                <span><span className="code">{fmtCodigo(printData.codigo)}</span></span>
                <span><b>{printData.marca}</b> · {printData.prenda}</span>
                <span>Color: {printData.color} · Talle: {printData.talle} · Cantidad: <b>{printData.cantidad}</b></span>
              </div>
              <div className="cb-print-note">
                En el diálogo de impresión elegí la <b>Impresora Brother QL-800</b> y la plantilla{' '}
                <b>62 × 29 mm</b>. Las etiquetas se imprimen una por página.
              </div>
              <div className="cb-pre">
                <div className="cb-label">
                  <div className="cb-l-marca">{printData.marca}</div>
                  {barcodeUrl && <img className="cb-l-barcode" src={barcodeUrl} alt="" />}
                  <div className="cb-l-num">{fmtCodigo(printData.codigo)}</div>
                  <div className="cb-l-datos">
                    <div className="cb-l-prenda">{printData.prenda}</div>
                    <div className="cb-l-extra">{printData.color} · Talle {printData.talle}</div>
                  </div>
                </div>
                {printData.cantidad > 1 && (
                  <div className="cb-hint" style={{ margin: 0 }}>
                    Vista previa de 1 de {printData.cantidad} etiquetas
                  </div>
                )}
              </div>
            </div>
            <div className="cb-modal-foot">
              <button className="cb-btn cb-btn-ghost" onClick={() => setPrintData(null)}>Cerrar</button>
              <button className="cb-btn cb-btn-gold" onClick={imprimirPopup}>
                <Printer size={15} /> Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
