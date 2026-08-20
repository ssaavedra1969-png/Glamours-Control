import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, Copy, ChevronDown, ChevronRight, Wallet, ShoppingCart, Layers } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import { parseExcelFile, identifyFileType, identifyFileTypeAndDateFromContent, extractDateFromFilename, validateExcelStructure, processData } from '../utils/excelParser';
import { formatCurrency } from '../utils/formatCurrency';
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
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [duplicateDialog, setDuplicateDialog] = useState(null);
  const [showSkipped, setShowSkipped] = useState({});
  const [progress, setProgress] = useState(null);

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
        newFiles.push({
          file: f, name: fileName, raw: data, type: detectedType, date: detectedDate, tab: activeTab,
          status: validation.valid ? 'ready' : 'error', error: validation.valid ? null : validation.error,
          totalRows: data.length, cajaRows: analysis.caja.length, ventasRows: analysis.ventas.length,
          skippedRows: analysis.skipped, skippedDetails: analysis.skippedRows || [],
          columnas: data.length > 0 ? Object.keys(data[0]).join(', ') : '',
        });
      } catch (err) {
        newFiles.push({ file: f, name: f.name, raw: [], type: 'error', date: null, tab: activeTab, status: 'error', error: err.message, totalRows: 0, cajaRows: 0, ventasRows: 0, skippedRows: 0, columnas: '' });
      }
    }
    setFiles((prev) => [...prev, ...newFiles]);
    setResults([]);
  }, [activeTab]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    maxSize: 10 * 1024 * 1024,
  });

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const processFiles = async () => {
    if (files.length === 0) return toast.error('Selecciona archivos primero');
    setProcessing(true);
    setProgress({ phase: 'Iniciando...', step: 0, total: 0 });
    const newResults = [];

    for (const fileObj of files) {
      try {
        if (fileObj.status === 'error') {
          newResults.push({ name: fileObj.name, status: 'error', message: fileObj.error });
          continue;
        }

        const result = await mockDB.processExcelFile(fileObj.raw, fileObj.name, fileObj.date, (p) => {
          setProgress(p);
        });

        if (result.hasDuplicates) {
          setDuplicateDialog({
            fileName: fileObj.name, fileObj, result,
            duplicates: result.duplicates,
            remainingFiles: files.filter((_, i) => i !== files.indexOf(fileObj)),
          });
          setProcessing(false);
          setProgress(null);
          return;
        }

        newResults.push({ name: fileObj.name, status: 'success', type: fileObj.type, date: fileObj.date, ...result,
          analyzedCaja: fileObj.cajaRows, analyzedVentas: fileObj.ventasRows, analyzedSkipped: fileObj.skippedRows, analyzedTotal: fileObj.totalRows,
        });
        mockDB.addAuditLog(user.email, `Carga de archivo: ${fileObj.name}`, 'Carga', `Caja: ${result.cajaCount}, Ventas: ${result.ventasCount}, Saltados: ${result.skipped}`);
      } catch (err) {
        newResults.push({ name: fileObj.name, status: 'error', message: err.message });
      }
    }

    setResults(newResults);
    setFiles([]);
    setProcessing(false);
    setProgress(null);
    const ok = newResults.filter((r) => r.status === 'success');
    const err = newResults.filter((r) => r.status === 'error');
    if (ok.length > 0) toast.success(`${ok.length} archivo(s) procesado(s)`);
    if (err.length > 0) toast.error(`${err.length} archivo(s) con errores`);
  };

  const handleDuplicateDecision = async (action) => {
    if (!duplicateDialog) return;
    const { result, fileObj } = duplicateDialog;
    const newResults = [...results];

    if (action === 'skip') {
      newResults.push({
        name: fileObj.name, status: 'success', type: fileObj.type, date: fileObj.date,
        cajaCount: result.cajaCount, ventasCount: result.ventasCount,
        skipped: result.skipped + result.duplicates.caja.length + result.duplicates.ventas.length,
        duplicateSkipped: result.duplicates.caja.length + result.duplicates.ventas.length,
      });
      toast.success(`Duplicados omitidos. Nuevos: Caja ${result.cajaCount}, Ventas ${result.ventasCount}`);
    } else if (action === 'include') {
      let extraCaja = 0;
      let extraVentas = 0;
      if (result.duplicates.caja.length > 0) {
        const saved = await mockDB.addBulkCajaMovimientos(result.duplicates.caja.map((d) => d.incoming));
        extraCaja = saved.length;
      }
      if (result.duplicates.ventas.length > 0) {
        const saved = await mockDB.addBulkVentas(result.duplicates.ventas.map((d) => ({ ...d.incoming, usuario: 'admin@glamours.com' })));
        extraVentas = saved.length;
      }
      newResults.push({
        name: fileObj.name, status: 'success', type: fileObj.type, date: fileObj.date,
        cajaCount: result.cajaCount + extraCaja, ventasCount: result.ventasCount + extraVentas,
        skipped: result.skipped,
        duplicatesIncluded: result.duplicates.caja.length + result.duplicates.ventas.length,
      });
      toast.success(`Todos los registros incluidos. Caja: ${result.cajaCount + extraCaja}, Ventas: ${result.ventasCount + extraVentas}`);
    }

    mockDB.addAuditLog(user.email, `Carga: ${fileObj.name}`, 'Carga', `Decision duplicados: ${action}`);
    setResults(newResults);
    setDuplicateDialog(null);

    const remaining = duplicateDialog.remainingFiles || [];
    if (remaining.length > 0) {
      setFiles(remaining);
    } else {
      setFiles([]);
      setProcessing(false);
    }
  };

  const activeTabCfg = TABS.find((t) => t.key === activeTab);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

      {/* ============================================ */}
      {/* SECCION 1: HEADER                           */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
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

        {/* Info de formatos */}
        <div style={{
          background: 'rgba(212,175,55,0.05)',
          border: '1px solid rgba(212,175,55,0.15)',
          borderRadius: '12px', padding: '1rem 1.25rem',
          fontSize: '0.8rem', color: '#9ca3af', lineHeight: '1.7',
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
                <div>Se detectan por <strong style={{ color: '#e2e8f0' }}>fecha + monto + tipo</strong></div>
                <div>Se le consultara antes de omitir o incluir</div>
                <div>El sistema detecta tipo, fecha y clasifica cada fila</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 2: SELECTOR DE MODO                 */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <div key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                background: isActive ? `linear-gradient(135deg, ${tab.color}15 0%, ${tab.color}08 100%)` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isActive ? `${tab.color}40` : 'rgba(255,255,255,0.06)'}`,
                borderRadius: '14px', padding: '1.25rem', cursor: 'pointer',
                transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Icon size={18} color={isActive ? tab.color : '#6b7280'} />
                  <span style={{ fontWeight: '700', fontSize: '0.9rem', color: isActive ? tab.color : '#9ca3af' }}>{tab.label}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: '1.4' }}>{tab.desc}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 3: DROPZONE + COLA                  */}
      {/* ============================================ */}
      <section>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem',
        }}>
          <span style={{ fontSize: '1rem' }}>{activeTabCfg.icon && <activeTabCfg.icon size={16} color={activeTabCfg.color} />}</span>
          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: activeTabCfg.color }}>
            Carga de {activeTabCfg.label}
          </span>
        </div>

        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dragover' : ''}`} style={{
          border: `2px dashed ${isDragActive ? activeTabCfg.color : 'rgba(255,255,255,0.1)'}`,
          borderRadius: '14px', padding: '2.5rem 2rem', textAlign: 'center', cursor: 'pointer',
          background: isDragActive ? `${activeTabCfg.color}08` : 'rgba(255,255,255,0.02)',
          transition: 'all 0.2s',
        }}>
          <input {...getInputProps()} />
          <div style={{ color: isDragActive ? activeTabCfg.color : '#6b7280', marginBottom: '0.5rem' }}>
            <Upload size={40} />
          </div>
          <div style={{ fontWeight: '700', fontSize: '0.9rem', color: isDragActive ? activeTabCfg.color : '#9ca3af', marginBottom: '0.25rem' }}>
            {isDragActive ? 'Suelta los archivos aqui...' : 'Arrastra archivos Excel o haz clic para seleccionar'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Archivos .xlsx, maximo 10MB. Multiples archivos permitidos.
          </div>
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
                          {f.skippedRows > 0 && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: '#6b7280' }}>{f.skippedRows} saltados</span>}
                        </>
                      ) : <span style={{ color: '#ef4444' }}>{f.error}</span>}
                    </div>
                    {f.skippedDetails && f.skippedDetails.length > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setShowSkipped((p) => ({ ...p, ['file_' + i]: !p['file_' + i] }))} style={{ fontSize: '0.65rem', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {showSkipped['file_' + i] ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          Ver filas saltadas
                        </button>
                        {showSkipped['file_' + i] && (
                          <div style={{ marginTop: '4px', maxHeight: '150px', overflow: 'auto', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.65rem' }}>
                            <table style={{ width: '100%' }}>
                              <thead><tr><th>Fila</th><th>Fecha</th><th>Tipo</th><th>Valor</th><th>Monto</th><th>Motivo</th></tr></thead>
                              <tbody>
                                {f.skippedDetails.map((s, j) => (
                                  <tr key={j}>
                                    <td style={{ color: '#6b7280' }}>{s.fila}</td>
                                    <td>{s.fecha}</td>
                                    <td>{s.tipo}</td>
                                    <td><span style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem', borderRadius: '3px', background: 'rgba(255,255,255,0.05)' }}>{s.valor}</span></td>
                                    <td>{s.monto}</td>
                                    <td style={{ color: '#ef4444' }}>{s.motivo}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button className="btn-icon" onClick={() => removeFile(i)}><X size={14} /></button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={processFiles} disabled={processing}>
                {processing ? 'Procesando...' : `Procesar ${files.length} archivo(s)`}
              </button>
            </div>

            {processing && progress && (
              <div style={{
                marginTop: '1rem', padding: '1rem', borderRadius: '10px',
                background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#93c5fd', fontWeight: '600' }}>{progress.phase}</span>
                  {progress.total > 0 && <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>{progress.step}/{progress.total} filas</span>}
                </div>
                {progress.total > 0 && (
                  <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '3px', background: 'linear-gradient(90deg, #3b82f6, #10b981)', width: `${Math.min(100, (progress.step / progress.total) * 100)}%`, transition: 'width 0.3s ease' }} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ============================================ */}
      {/* DIALOGO DE DUPLICADOS                       */}
      {/* ============================================ */}
      {duplicateDialog && (
        <section style={{
          background: 'rgba(245,158,11,0.05)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: '14px', padding: '1.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Copy size={18} color="#f59e0b" />
            <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#f59e0b' }}>Duplicados Detectados</span>
            <span style={{ fontSize: '0.8rem', color: '#6b7280', marginLeft: '0.5rem' }}>{duplicateDialog.fileName}</span>
          </div>
          <p style={{ color: '#9ca3af', marginBottom: '1rem', fontSize: '0.82rem' }}>Se encontraron registros que ya existen en la base (fecha + monto + tipo coinciden):</p>

          {duplicateDialog.duplicates.caja.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.82rem', marginBottom: '0.5rem', color: '#facc15' }}>Caja ({duplicateDialog.duplicates.caja.length} duplicados)</h4>
              <div style={{ maxHeight: '200px', overflow: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <table>
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th></tr></thead>
                  <tbody>
                    {duplicateDialog.duplicates.caja.slice(0, 20).map((d, i) => (
                      <tr key={i}>
                        <td>{d.incoming.fecha}</td>
                        <td><span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(250,204,21,0.12)', color: '#facc15' }}>{d.incoming.tipo}</span></td>
                        <td style={{ fontWeight: '700' }}>{formatCurrency(d.incoming.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {duplicateDialog.duplicates.ventas.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.82rem', marginBottom: '0.5rem', color: '#818cf8' }}>Ventas ({duplicateDialog.duplicates.ventas.length} duplicados)</h4>
              <div style={{ maxHeight: '200px', overflow: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <table>
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th></tr></thead>
                  <tbody>
                    {duplicateDialog.duplicates.ventas.slice(0, 20).map((d, i) => (
                      <tr key={i}>
                        <td>{d.incoming.fecha}</td>
                        <td><span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(129,140,248,0.12)', color: '#818cf8' }}>{d.incoming.tipo}</span></td>
                        <td style={{ fontWeight: '700' }}>{formatCurrency(d.incoming.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-accent" onClick={() => handleDuplicateDecision('skip')}>Omitir Duplicados</button>
            <button className="btn btn-primary" onClick={() => handleDuplicateDecision('include')}>Incluir Todos</button>
          </div>
        </section>
      )}

      {/* ============================================ */}
      {/* RESULTADOS                                  */}
      {/* ============================================ */}
      {results.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle size={18} color="#fff" />
            </div>
            <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text, #f3f4f6)' }}>Resultados</span>
          </div>

          {results.map((r, i) => (
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
                    <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '4px', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {r.cajaCount > 0 && <span>Caja: <strong style={{ color: '#10b981' }}>{r.cajaCount}</strong></span>}
                      {r.ventasCount > 0 && <span>Ventas: <strong style={{ color: '#10b981' }}>{r.ventasCount}</strong></span>}
                      {r.duplicateSkipped > 0 && <span style={{ color: '#f59e0b' }}>Duplicados omitidos: {r.duplicateSkipped}</span>}
                      {r.duplicatesIncluded > 0 && <span style={{ color: '#3b82f6' }}>Duplicados incluidos: {r.duplicatesIncluded}</span>}
                      {r.skipped > 0 && <span style={{ color: '#6b7280' }}>No clasificadas: {r.skipped}</span>}
                    </div>
                    {r.analyzedTotal && (
                      <div style={{
                        marginTop: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '8px',
                        background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)',
                        fontSize: '0.72rem',
                      }}>
                        <div style={{ color: '#93c5fd', fontWeight: '600', marginBottom: '4px' }}>Verificacion del archivo</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '2px 12px', color: '#9ca3af' }}>
                          <span>Filas:</span><span><strong>{r.analyzedTotal}</strong></span><span></span><span></span>
                          <span>Caja:</span><span><strong style={{ color: '#10b981' }}>{r.cajaCount}</strong></span><span>vs analisis:</span><span>{r.analyzedCaja}</span>
                          <span>Ventas:</span><span><strong style={{ color: '#10b981' }}>{r.ventasCount}</strong></span><span>vs analisis:</span><span>{r.analyzedVentas}</span>
                          <span>Saltadas:</span><span><strong style={{ color: '#6b7280' }}>{r.skipped}</strong></span><span>vs analisis:</span><span>{r.analyzedSkipped}</span>
                        </div>
                        {r.cajaCount + r.ventasCount + r.skipped === r.analyzedTotal ? (
                          <div style={{ marginTop: '4px', color: '#10b981', fontSize: '0.7rem' }}>Todos los registros verificados correctamente</div>
                        ) : (
                          <div style={{ marginTop: '4px', color: '#f59e0b', fontSize: '0.7rem' }}>Diferencia: {r.analyzedTotal - r.cajaCount - r.ventasCount - r.skipped} filas</div>
                        )}
                      </div>
                    )}
                  </>
                ) : <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '4px' }}>{r.message}</div>}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ============================================ */}
      {/* REFERENCIA DE CODIFICACIONES                */}
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
          <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text, #f3f4f6)' }}>Referencia de Codificaciones</span>
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
