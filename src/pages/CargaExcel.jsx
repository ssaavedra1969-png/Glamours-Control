import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, Wallet, ShoppingCart, Layers, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { parseExcelFile, identifyFileType, identifyFileTypeAndDateFromContent, extractDateFromFilename, validateExcelStructure, processData, separarDuplicadosInternos } from '../utils/excelParser';
import { suscribirseCarga, obtenerCarga, iniciarCarga, limpiarCarga } from '../services/cargaService';
import ResultadoCarga from '../components/ResultadoCarga';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'caja', label: 'Caja', icon: Wallet, color: '#facc15', desc: 'Solo archivos de caja (codigos 500-503)' },
  { key: 'ventas', label: 'Ventas', icon: ShoppingCart, color: '#818cf8', desc: 'Solo archivos de ventas (Blanco, Negro, Tarjeta)' },
  { key: 'combinado', label: 'Combinado', icon: Layers, color: '#d4af37', desc: 'Archivos con caja y ventas juntos' },
];

export default function CargaExcel() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('caja');
  const [files, setFiles] = useState([]);
  const [inspectorCola, setInspectorCola] = useState({});
  // Estado de carga vivo en el servicio: sobrevive cambios de seccion
  const [carga, setCarga] = useState(obtenerCarga());
  useEffect(() => suscribirseCarga((j) => setCarga(j ? { ...j } : null)), []);

  const onDrop = useCallback(async (acceptedFiles) => {
    const newFiles = [];
    for (const f of acceptedFiles) {
      try {
        const { data, fileName } = await parseExcelFile(f);
        const fileDate = extractDateFromFilename(fileName);
        const validation = validateExcelStructure(data, null);
        let detectedType = identifyFileType(fileName);
        if (detectedType === 'desconocido' && data.length > 0) {
          detectedType = identifyFileTypeAndDateFromContent(data, fileName).type;
        }
        const detectedDate = fileDate || (data.length > 0 ? identifyFileTypeAndDateFromContent(data, fileName).date : null);
        const analysis = processData(data, null, detectedDate);
        const limpio = separarDuplicadosInternos(analysis.caja, analysis.ventas);
        newFiles.push({
          file: f, name: fileName, raw: data, type: detectedType, date: detectedDate, tab: activeTab,
          status: validation.valid ? 'ready' : 'error', error: validation.valid ? null : validation.error,
          totalRows: data.length, cajaRows: analysis.caja.length, ventasRows: analysis.ventas.length,
          dupInternos: limpio.dupCaja.length + limpio.dupVentas.length,
          internosDetalle: { caja: limpio.dupCaja, ventas: limpio.dupVentas },
          skippedRows: analysis.skipped, skippedDetails: analysis.skippedRows || [],
          columnas: data.length > 0 ? Object.keys(data[0]).join(', ') : '',
        });
      } catch (err) {
        newFiles.push({ file: f, name: f.name, raw: [], type: 'error', date: null, tab: activeTab, status: 'error', error: err.message, totalRows: 0, cajaRows: 0, ventasRows: 0, skippedRows: 0, columnas: '' });
      }
    }
    setFiles((prev) => [...prev, ...newFiles]);
  }, [activeTab]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    maxSize: 10 * 1024 * 1024,
  });

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const processFiles = () => {
    if (files.length === 0) return toast.error('Selecciona archivos primero');
    if (carga && carga.estado === 'procesando') return toast.error('Ya hay una carga en proceso');
    const lista = [...files];
    setFiles([]);
    // Corre en el servicio de fondo: puede navegarse por otras secciones
    iniciarCarga(lista, user?.email || 'sistema');
  };

  const procesando = carga && carga.estado === 'procesando';
  const resultados = carga ? carga.resultados : [];

  // Cronometro de la carga en curso
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!procesando) return undefined;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [procesando]);
  const transcurrido = carga?.inicio
    ? Math.max(1, Math.round(((procesando ? ahora : carga.fin || ahora) - carga.inicio) / 1000))
    : null;

  // Barra: determinante si hay conteo parcial; pulsante si la fase no reporta conteo o esta al 100% esperando Firebase
  const prog = carga?.progreso;
  const pct = prog && prog.total > 0 ? Math.min(100, Math.round((prog.step / prog.total) * 100)) : null;
  const barraDet = pct !== null && pct < 100;

  const activeTabCfg = TABS.find((t) => t.key === activeTab);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ============================================ */}
      {/* SECCION 1: HEADER                           */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #d4af37 0%, #b8960c 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Upload size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Carga Masiva</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>Importar archivos Excel de caja y ventas</p>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* PASO 1: SELECTOR DE MODO                    */}
      {/* ============================================ */}
      <section>
        <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#d4af37', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.6rem' }}>
          Paso 1 · Elegi el tipo de carga
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <div key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                background: isActive ? `linear-gradient(135deg, ${tab.color}15 0%, ${tab.color}08 100%)` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isActive ? `${tab.color}40` : 'rgba(255,255,255,0.06)'}`,
                borderRadius: '14px', padding: '1rem 1.1rem', cursor: 'pointer',
                transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <Icon size={17} color={isActive ? tab.color : '#6b7280'} />
                  <span style={{ fontWeight: '700', fontSize: '0.88rem', color: isActive ? tab.color : '#9ca3af' }}>{tab.label}</span>
                  {isActive && <CheckCircle size={13} color={tab.color} style={{ marginLeft: 'auto' }} />}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#6b7280', lineHeight: '1.4' }}>{tab.desc}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================================ */}
      {/* PASO 2: DROPZONE + COLA                     */}
      {/* ============================================ */}
      <section>
        <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#d4af37', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.6rem' }}>
          Paso 2 · Carga de {activeTabCfg.label}
        </div>

        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dragover' : ''}`} style={{
          display: 'flex', alignItems: 'center', gap: '0.9rem',
          border: `1.5px dashed ${isDragActive ? activeTabCfg.color : 'rgba(255,255,255,0.12)'}`,
          borderRadius: '12px', padding: '0.9rem 1.25rem', cursor: 'pointer',
          background: isDragActive ? `${activeTabCfg.color}08` : 'rgba(255,255,255,0.02)',
          transition: 'all 0.2s',
        }}>
          <input {...getInputProps()} />
          <Upload size={20} color={isDragActive ? activeTabCfg.color : '#d4af37'} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: '700', fontSize: '0.85rem', color: isDragActive ? activeTabCfg.color : '#e5e7eb' }}>
              {isDragActive ? 'Suelta los archivos aqui...' : 'Arrastra el Excel aca o hace clic para buscarlo'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>
              Archivos .xlsx / .xls · maximo 10MB · podes seleccionar varios a la vez
            </div>
          </div>
          <span style={{ flexShrink: 0, fontSize: '0.72rem', fontWeight: '700', color: '#d4af37', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.28)', padding: '0.4rem 0.9rem', borderRadius: '8px' }}>
            Elegir archivos
          </span>
        </div>

        {/* Cola de archivos */}
        {files.length > 0 && (
          <div style={{
            marginTop: '1rem',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '14px', padding: '1.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f3f4f6' }}>Archivos en cola ({files.length})</span>
              <button className="btn btn-outline btn-sm" onClick={() => setFiles([])} style={{ fontSize: '0.72rem' }}>Limpiar</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {files.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${f.status === 'ready' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                }}>
                  <FileSpreadsheet size={18} color={f.status === 'ready' ? '#10b981' : '#ef4444'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '0.85rem', color: '#e2e8f0' }}>{f.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '2px', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {f.status === 'ready' ? (
                        <>
                          <span style={{ fontSize: '0.65rem', fontWeight: '700', padding: '0.1rem 0.4rem', borderRadius: '4px', background: f.type === 'caja' ? 'rgba(250,204,21,0.15)' : 'rgba(129,140,248,0.15)', color: f.type === 'caja' ? '#facc15' : '#818cf8' }}>
                            {f.type === 'caja' ? 'CAJA' : 'VENTAS'}
                          </span>
                          {f.date && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: '#9ca3af' }}>{f.date}</span>}
                          {f.cajaRows > 0 && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>{f.cajaRows} caja</span>}
                          {f.ventasRows > 0 && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(129,140,248,0.1)', color: '#818cf8' }}>{f.ventasRows} ventas</span>}
                          {f.dupInternos > 0 && <span style={{ fontSize: '0.65rem', fontWeight: '700', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>{f.dupInternos} duplicados internos</span>}
                          {f.skippedRows > 0 && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: '#6b7280' }}>{f.skippedRows} saltados</span>}
                        </>
                      ) : <span style={{ color: '#ef4444' }}>{f.error}</span>}
                    </div>
                    {((f.internosDetalle?.caja?.length || 0) + (f.internosDetalle?.ventas?.length || 0) + (f.skippedDetails?.length || 0)) > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        <button
                          className="chk-chip"
                          onClick={() => setInspectorCola((p) => ({ ...p, [i]: !p[i] }))}
                          style={{ fontSize: '0.65rem', padding: '0.3rem 0.7rem' }}
                        >
                          Inspeccionar antes de cargar
                          <span className="chk-n" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                            {(f.internosDetalle?.caja?.length || 0) + (f.internosDetalle?.ventas?.length || 0)} dup + {f.skippedDetails?.length || 0} saltadas
                          </span>
                        </button>
                        {inspectorCola[i] && (
                          <ResultadoCarga r={{
                            internos: { caja: f.internosDetalle?.caja.length || 0, ventas: f.internosDetalle?.ventas.length || 0 },
                            internosDetalle: f.internosDetalle,
                            skipped: f.skippedRows,
                            skippedRows: f.skippedDetails,
                          }} soloRevision />
                        )}
                      </div>
                    )}
                  </div>
                  <button className="btn-icon" onClick={() => removeFile(i)}><X size={14} /></button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={processFiles} disabled={procesando}>
                {procesando ? 'Procesando...' : `Procesar ${files.length} archivo(s)`}
              </button>
            </div>
          </div>
        )}

        {/* Progreso EN VIVO: vive en el servicio, sigue aunque cambies de seccion */}
        {procesando && (
          <div style={{
            marginTop: '1rem', padding: '1rem 1.25rem', borderRadius: '12px',
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <Loader2 size={16} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '0.85rem', color: '#93c5fd', fontWeight: '700' }}>
                Carga en proceso ({carga.indiceActual}/{carga.totalArchivos}): {carga.archivoActual}
              </span>
              {transcurrido !== null && <span style={{ fontSize: '0.72rem', color: '#6b7280', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{transcurrido}s</span>}
            </div>
            {carga.progreso && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#93c5fd', fontWeight: '600' }}>{carga.progreso.phase}</span>
                {carga.progreso.total > 0 && <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>{carga.progreso.step}/{carga.progreso.total} filas</span>}
              </div>
            )}
            <div className={`carga-barra ${barraDet ? '' : 'carga-indet'}`}>
              <div style={barraDet ? { width: `${pct}%` } : undefined} />
            </div>
            {carga.resultados.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                Ya terminados: {carga.resultados.filter((r) => r.status === 'success').length} archivo(s)
              </div>
            )}
            <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#6b7280', fontStyle: 'italic' }}>
              Podes navegar por otras secciones: el proceso sigue y te avisamos con una notificacion al terminar.
            </div>
          </div>
        )}
      </section>

      {/* ============================================ */}
      {/* RESULTADOS (viven en el servicio de fondo)  */}
      {/* ============================================ */}
      {resultados.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: procesando ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {procesando ? <Loader2 size={18} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={18} color="#fff" />}
            </div>
            <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text, #f3f4f6)' }}>Resultados</span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{procesando ? '(en proceso...)' : `(terminado en ${Math.max(1, Math.round((carga.fin - carga.inicio) / 1000))}s)`}</span>
            {!procesando && (
              <button className="btn btn-outline btn-sm" onClick={() => limpiarCarga()} style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>Cerrar</button>
            )}
          </div>

          {resultados.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem 1.25rem',
              borderRadius: '12px', marginBottom: '0.5rem',
              background: r.status === 'success' ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)',
              border: `1px solid ${r.status === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`,
            }}>
              {r.status === 'success' ? <CheckCircle size={20} color="#10b981" style={{ marginTop: '2px', flexShrink: 0 }} /> : <AlertCircle size={20} color="#ef4444" style={{ marginTop: '2px', flexShrink: 0 }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#e2e8f0' }}>{r.name}</div>
                {r.status === 'success' ? (
                  <>
                    <div style={{ fontSize: '0.72rem', color: '#6b7280', margin: '4px 0 2px' }}>
                      Hace clic en cada categoria para ver el detalle. En "Ya en la base" podes marcar y eliminar registros viejos.
                    </div>
                    <ResultadoCarga r={r} usuario={user?.email || 'sistema'} />
                  </>
                ) : <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '4px' }}>{r.message}</div>}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ============================================ */}
      {/* AYUDA: FORMATOS + REFERENCIA                */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '1rem' }}>📖</span>
          </div>
          <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text, #f3f4f6)' }}>Referencia y Ayuda</span>
        </div>

        <div style={{
          background: 'rgba(212,175,55,0.05)',
          border: '1px solid rgba(212,175,55,0.15)',
          borderRadius: '12px', padding: '1rem 1.25rem',
          fontSize: '0.8rem', color: '#9ca3af', lineHeight: '1.7',
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <strong style={{ color: '#d4af37', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Formatos soportados</strong>
              <div style={{ marginTop: '0.4rem' }}>
                <div><code style={{ background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.72rem' }}>YYMMDD_Caja.xlsx</code></div>
                <div><code style={{ background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.72rem' }}>YYMMDD_Ventas.xlsx</code></div>
                <div><code style={{ background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.72rem' }}>ventasDD.MM.YY.caja.xlsx</code></div>
                <div><code style={{ background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.72rem' }}>ventasDD.MM.YY.xlsx</code></div>
                <div>Archivos combinados (caja + ventas)</div>
              </div>
            </div>
            <div>
              <strong style={{ color: '#d4af37', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duplicados</strong>
              <div style={{ marginTop: '0.4rem' }}>
                <div>Duplicados <strong style={{ color: '#e2e8f0' }}>dentro del archivo</strong> (dias repetidos): se omiten siempre</div>
                <div>Contra la base solo cuenta si coinciden <strong style={{ color: '#e2e8f0' }}>TODOS los campos</strong>; si algo difiere, se carga</div>
                <div>El proceso sigue aunque cambies de seccion y avisa al terminar</div>
                <div>El sistema detecta tipo, fecha y clasifica cada fila</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '14px', padding: '1.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Wallet size={16} color="#facc15" />
              <span style={{ fontWeight: '700', fontSize: '0.85rem', color: '#facc15' }}>Caja (Valores 500-503)</span>
            </div>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: '0.65rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 0.5rem' }}>Cod</th>
                  <th style={{ textAlign: 'left', fontSize: '0.65rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 0.5rem' }}>Tipo</th>
                  <th style={{ textAlign: 'left', fontSize: '0.65rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 0.5rem' }}>Efecto</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ padding: '0.4rem 0' }}><span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: '#9ca3af' }}>500</span></td><td style={{ fontSize: '0.8rem', color: '#d1d5db' }}>En caja</td><td style={{ fontSize: '0.8rem', color: '#6b7280' }}>Saldo actual</td></tr>
                <tr><td style={{ padding: '0.4rem 0' }}><span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>501</span></td><td style={{ fontSize: '0.8rem', color: '#d1d5db' }}>Egreso en Caja</td><td style={{ fontSize: '0.8rem', color: '#6b7280' }}>Resta saldo</td></tr>
                <tr><td style={{ padding: '0.4rem 0' }}><span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>502</span></td><td style={{ fontSize: '0.8rem', color: '#d1d5db' }}>Ingreso en Caja</td><td style={{ fontSize: '0.8rem', color: '#6b7280' }}>Suma saldo</td></tr>
                <tr><td style={{ padding: '0.4rem 0' }}><span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(249,115,22,0.12)', color: '#f97316' }}>503</span></td><td style={{ fontSize: '0.8rem', color: '#d1d5db' }}>Retiro de Caja</td><td style={{ fontSize: '0.8rem', color: '#6b7280' }}>Resta saldo</td></tr>
              </tbody>
            </table>
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '14px', padding: '1.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <ShoppingCart size={16} color="#818cf8" />
              <span style={{ fontWeight: '700', fontSize: '0.85rem', color: '#818cf8' }}>Ventas</span>
            </div>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: '0.65rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 0.5rem' }}>Tipo (Excel)</th>
                  <th style={{ textAlign: 'left', fontSize: '0.65rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 0.5rem' }}>Valor</th>
                  <th style={{ textAlign: 'left', fontSize: '0.65rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 0.5rem' }}>Significado</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ fontSize: '0.8rem', color: '#d1d5db', padding: '0.4rem 0' }}>Moneda Local</td><td><span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(209,213,219,0.12)', color: '#e2e8f0' }}>0</span></td><td style={{ fontSize: '0.8rem', color: '#6b7280' }}>Blanco (declarada)</td></tr>
                <tr><td style={{ fontSize: '0.8rem', color: '#d1d5db', padding: '0.4rem 0' }}>Moneda Local 1</td><td><span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(129,140,248,0.12)', color: '#818cf8' }}>2</span></td><td style={{ fontSize: '0.8rem', color: '#6b7280' }}>Negro (no declarada)</td></tr>
                <tr><td style={{ fontSize: '0.8rem', color: '#d1d5db', padding: '0.4rem 0' }}>Tarjeta C/D</td><td><span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>VI/MA/AM</span></td><td style={{ fontSize: '0.8rem', color: '#6b7280' }}>Venta tarjeta</td></tr>
                <tr><td style={{ fontSize: '0.8rem', color: '#d1d5db', padding: '0.4rem 0' }}>Pago Electronico</td><td><span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(34,211,238,0.12)', color: '#22d3ee' }}>EL/MP</span></td><td style={{ fontSize: '0.8rem', color: '#6b7280' }}>Transferencia QR</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
