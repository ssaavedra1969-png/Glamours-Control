import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import firestoreDB from '../services/firestoreDB';
import {
  getCatalogos, addItem, updateItem, deleteItem, nextPrendaCodigo,
} from '../services/codigosDB';
import JsBarcode from 'jsbarcode';
import bwipjs from 'bwip-js';
import toast from 'react-hot-toast';
import {
  Barcode, Plus, Pencil, Trash2, Printer, X, Search, Tag, Shirt, Palette, Ruler, Download, ClipboardList, FilePlus,
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

// Swatch visual para colores (SOLO si el nombre coincide con un color conocido).
function swatchColor(nombre) {
  const key = (nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!key) return null;
  const conocidos = [
    ['blanco', '#f8fafc'], ['negro', '#1e293b'], ['gris', '#94a3b8'], ['plata', '#cbd5e1'],
    ['azul', '#3b82f6'], ['celeste', '#38bdf8'], ['amarillo', '#facc15'], ['verde', '#22c55e'],
    ['rojo', '#ef4444'], ['rosa', '#f472b6'], ['violeta', '#a78bfa'], ['lavanda', '#c4b5fd'],
    ['naranja', '#fb923c'], ['marron', '#a16207'], ['beige', '#d6d3d1'], ['dorado', '#d4af37'],
  ];
  const hit = conocidos.find(([palabra]) => key.includes(palabra));
  return hit ? hit[1] : null;
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
      {filtrados.length === 0 ? (
        <div className="cb-vacio">{busqueda ? `Sin resultados para "${busqueda}"` : 'Sin datos todavía.'}</div>
      ) : (
        <div className="cb-rows">
          {filtrados.map((item) => (
            <div className="cb-row" key={item.codigo}>
              <span className="cb-row-code">{item.codigo}</span>
              {tipo === 'colores' && (
                <i className="cb-dot" style={{ background: swatchColor(item.nombre) || '#334155' }} />
              )}
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
      )}
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
  const [tabActivo, setTabActivo] = useState('prendas');
  const [modal, setModal] = useState(null);          // {modo:'alta'|'edicion', tipo, codigo, nombre}
  const [confirmar, setConfirmar] = useState(null);  // {tipo, codigo, nombre}
  const [printData, setPrintData] = useState(null);  // {codigo, marca, prenda, color, talle, cantidad}
  const [barcodeUrl, setBarcodeUrl] = useState(null);
  const [etiquetas, setEtiquetas] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gl_codigos_etiquetas') || '[]'); } catch { return []; }
  });                                                // codigos agregados al TXT
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
            format: 'CODE128C', width: 2.4, height: 64, margin: 0,
            fontSize: 0, displayValue: false, background: '#ffffff', lineColor: '#000000',
          });
        } catch { /* codigo invalido: no deberia pasar */ }
      } else {
        genRef.current.innerHTML = '';
      }
    }
  }, [codigoCompleto]);

  // Barcode para la vista previa del modal (imagen PNG de pantalla)
  useEffect(() => {
    if (!printData) { setBarcodeUrl(null); return; }
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, printData.codigo, {
        format: 'CODE128C', width: 2.2, height: 60, margin: 0,
        fontSize: 0, displayValue: false, background: '#ffffff', lineColor: '#000000',
      });
      setBarcodeUrl(canvas.toDataURL('image/png'));
    } catch {
      setBarcodeUrl(null);
      toast.error('No se pudo generar el codigo de barras');
    }
  }, [printData]);

  // Persiste la lista de etiquetas impresas (sobrevive recargas de la app)
  useEffect(() => {
    localStorage.setItem('gl_codigos_etiquetas', JSON.stringify(etiquetas));
  }, [etiquetas]);

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

  // Exportacion TXT para el sistema de ventas.
  // Formato del archivo plano (igual a Muestras/Articulo_Descripcion_Marca.txt):
  //   Articulo <TAB> Descripcion <TAB> Marca
  // Contiene SOLO las etiquetas que se fueron imprimiendo (una fila por codigo,
  // sin encabezado, UTF-8 sin BOM y saltos de linea LF).
  function exportarTxt() {
    if (!etiquetas.length) {
      toast.error('Todavía no hay etiquetas en la lista');
      return;
    }
    const filas = [...etiquetas]
      .sort((a, b) => a.articulo.localeCompare(b.articulo))
      .map((e) => `${e.articulo}\t${e.descripcion}\t${e.marca}`);
    const blob = new Blob([filas.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Articulo_Descripcion_Marca.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`TXT generado con ${filas.length} artículos`);
    firestoreDB.addAuditLog(user?.email || 'sistema', 'EXPORT TXT', 'Codigos Barras', `${filas.length} articulos`);
  }

  // Agrega un codigo a la lista del TXT (sin duplicar por articulo).
  function agregarEtiqueta(d) {
    setEtiquetas((prev) => (
      prev.some((e) => e.articulo === d.codigo)
        ? prev
        : [...prev, {
          articulo: d.codigo, descripcion: d.prenda, marca: d.marca,
          color: d.color || '', talle: d.talle || '',
        }]
    ));
  }

  // Boton "Agregar al TXT": incorpora la seleccion actual.
  function agregarAlTxt() {
    if (!codigoCompleto) return;
    agregarEtiqueta({
      codigo: codigoCompleto, prenda: prenda.nombre, marca: marca.nombre,
      color: color.nombre, talle: talle.nombre,
    });
    toast.success(`Agregado ${fmtCodigo(codigoCompleto)} al TXT`);
  }

  function vaciarLista() {
    if (!etiquetas.length) return;
    setEtiquetas([]);
    toast.success('TXT vacío');
  }

  // Impresion: ventana dedicada con su propio @page (62 x 30 mm).
  // Aislada del DOM de la app: pagina bien aunque sean varias etiquetas
  // y no altera la impresion de las demas secciones.
  function abrirVentanaImpresion(tiendas) {
    if (!tiendas.length) return;
    const barcode = (codigo) => {
      try {
        // Bitmap negro puro a 300 dpi (bwip-js): cada barra = 6 puntos de impresion
        // enteros del cabezal termico. Sin anti-aliasing ni re-muestreo => negro solido.
        const opts = {
          bcid: 'code128', text: codigo, scale: 6, height: 7,
          paddingleft: 10, paddingright: 10, paddingtop: 0, paddingbottom: 0,
          includetext: false, backgroundcolor: 'ffffff', barcolor: '000000',
        };
        const c = document.createElement('canvas');
        bwipjs.toCanvas(c, opts);
        const mm = 25.4 / 300;
        const wmm = (c.width * mm).toFixed(2);
        const hmm = (c.height * mm).toFixed(2);
        return `<div class="bc"><img class="bcimg" src="${c.toDataURL('image/png')}" alt="" style="width:${wmm}mm; height:${hmm}mm;"></div>`;
      } catch { return ''; }
    };
    const labels = tiendas.map((t) => {
      const img = barcode(t.codigo);
      return `
      <div class="lbl">
        <div class="marca">${esc(t.marca)}</div>
        ${img || ''}
        <div class="num">${fmtCodigo(t.codigo)}</div>
        <div class="datos">
          <div class="prenda">${esc(t.prenda)}</div>
          <div class="extra">${t.color && t.talle ? `${esc(t.color)} · Talle ${esc(t.talle)}` : (t.color ? esc(t.color) : (t.talle ? `Talle ${esc(t.talle)}` : ''))}</div>
        </div>
      </div>`;
    }).join('');
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Etiquetas (${tiendas.length})</title>
<style>
  @page { size: 62mm 30mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; }
  .lbl {
    width: 62mm; height: 30mm; background: #fff; color: #000;
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
  .bc { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; background: #fff; }
  .bc img { display: block; image-rendering: pixelated; }
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

  // Imprimir la etiqueta individual (confirmada en el modal de vista previa).
  function imprimirPopup() {
    if (!printData) return;
    agregarEtiqueta(printData);
    const tiendas = Array.from({ length: printData.cantidad }).map(() => ({
      codigo: printData.codigo, marca: printData.marca, prenda: printData.prenda, color: printData.color, talle: printData.talle,
    }));
    abrirVentanaImpresion(tiendas);
  }

  // Imprimir todo lo cargado en el TXT (1 etiqueta por codigo).
  function imprimirTodo() {
    if (!etiquetas.length) { toast.error('No hay códigos en el TXT'); return; }
    const tiendas = [...etiquetas]
      .sort((a, b) => a.articulo.localeCompare(b.articulo))
      .map((e) => ({ codigo: e.articulo, marca: e.marca, prenda: e.descripcion, color: e.color || '', talle: e.talle || '' }));
    abrirVentanaImpresion(tiendas);
    firestoreDB.addAuditLog(user?.email || 'sistema', 'IMPRESION', 'Codigos Barras', `Lote de ${tiendas.length} etiquetas`);
  }

  return (
    <div className="cb-page">
      {/* Encabezado */}
      <div className="cb-header">
        <div className="cb-icon-box"><Barcode size={20} color="#12121f" /></div>
        <div>
          <div className="cb-title">Códigos de Barras</div>
          <div className="cb-subtitle">Generador de códigos y etiquetas · Brother QL-800 (62 × 30 mm)</div>
        </div>
        <span style={{ flex: 1 }} />
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
                <button className="cb-btn cb-btn-dark" onClick={agregarAlTxt}>
                  <FilePlus size={15} /> Agregar al TXT
                </button>
                <button className="cb-btn cb-btn-gold" onClick={imprimir}>
                  <Printer size={15} /> Imprimir
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* TXT del sistema de ventas (se va armando con lo impreso/agregado) */}
      <div className="cb-card">
        <div className="cb-card-title">
          <ClipboardList size={14} color="#d4af37" /> TXT del sistema de ventas
          <span className="count">{etiquetas.length}</span>
          <span style={{ flex: 1 }} />
          <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={vaciarLista} disabled={cargando || !etiquetas.length}>
            Vaciar
          </button>
          <button className="cb-btn cb-btn-dark cb-btn-sm" onClick={imprimirTodo} disabled={cargando || !etiquetas.length}>
            <Printer size={13} /> Imprimir todo
          </button>
          <button className="cb-btn cb-btn-gold cb-btn-sm" onClick={exportarTxt} disabled={cargando || !etiquetas.length}>
            <Download size={13} /> Exportar TXT
          </button>
        </div>
        <div className="cb-txt-hint">
          Cada código que imprimís o agregás aparece acá. Exportá para descargar{' '}
          <b>Articulo_Descripcion_Marca.txt</b> (Artículo &lt;TAB&gt; Descripción &lt;TAB&gt; Marca).
        </div>
        {etiquetas.length === 0 ? (
          <div className="cb-vacio">Todavía no hay códigos. Usá "Agregar al TXT" o imprimí una etiqueta.</div>
        ) : (
          <pre className="cb-txt">
            {[...etiquetas].sort((a, b) => a.articulo.localeCompare(b.articulo)).map((e) => `${e.articulo}\t${e.descripcion}\t${e.marca}`).join('\n')}
          </pre>
        )}
      </div>

      {/* Catalogos: 1 sola card con pestanas (marcas / prendas / colores / talles) */}
      <div className="cb-card cb-tabs-card">
        <div className="cb-tabs">
          {Object.keys(TIPOS_META).map((tipo) => {
            const I = TIPOS_META[tipo].icono;
            return (
              <button key={tipo} className={`cb-tab ${tabActivo === tipo ? 'cb-tab-on' : ''}`} onClick={() => setTabActivo(tipo)}>
                <I size={13} color={tabActivo === tipo ? TIPOS_META[tipo].color : '#94a3b8'} />
                {TIPOS_META[tipo].titulo}
                <span className="count">{cat[tipo].length}</span>
              </button>
            );
          })}
        </div>
        <TablaCatalogo
          tipo={tabActivo}
          items={cat[tabActivo]}
          busqueda={busquedas[tabActivo]}
          setBusqueda={(v) => setBusquedas((b) => ({ ...b, [tabActivo]: v }))}
          onAlta={() => abrirAlta(tabActivo)}
          onEditar={(item) => setModal({ modo: 'edicion', tipo: tabActivo, codigo: item.codigo, nombre: item.nombre })}
          onEliminar={(item) => setConfirmar({ tipo: tabActivo, codigo: item.codigo, nombre: item.nombre })}
        />
      </div>

      <div className="cb-legend">
        Código completo = <b>2 dígitos</b> marca + <b>4 dígitos</b> prenda + <b>2 dígitos</b> color + <b>2 dígitos</b> talle.{' '}
        Ej: <span className="mono">01</span> + <span className="mono">0001</span> + <span className="mono">01</span> +{' '}
        <span className="mono">01</span> = <span className="mono">01 0001 01 01</span>
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
                En el diálogo elegí la <b>Brother QL-800</b> y el tamaño <b>62 × 30 mm</b> (rollo
                continuo de 62 mm), escala 100% y sin márgenes. El rollo <b>DK-1201 de 29 × 90 mm</b>{' '}
                que trae la impresora <b>no sirve</b> para esta etiqueta: cargá el rollo continuo de 62 mm.
                Las etiquetas se imprimen una por página.
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
