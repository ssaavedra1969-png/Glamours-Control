import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import { parseExcelFile, identifyFileType, identifyFileTypeAndDateFromContent, extractDateFromFilename, validateExcelStructure, processData } from '../utils/excelParser';
import { formatCurrency } from '../utils/formatCurrency';
import toast from 'react-hot-toast';

export default function CargaExcel() {
  const { user } = useAuth();
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
          file: f, name: fileName, raw: data, type: detectedType, date: detectedDate,
          status: validation.valid ? 'ready' : 'error', error: validation.valid ? null : validation.error,
          totalRows: data.length, cajaRows: analysis.caja.length, ventasRows: analysis.ventas.length,
          skippedRows: analysis.skipped, skippedDetails: analysis.skippedRows || [],
          columnas: data.length > 0 ? Object.keys(data[0]).join(', ') : '',
        });
      } catch (err) {
        newFiles.push({ file: f, name: f.name, raw: [], type: 'error', date: null, status: 'error', error: err.message, totalRows: 0, cajaRows: 0, ventasRows: 0, skippedRows: 0, columnas: '' });
      }
    }
    setFiles((prev) => [...prev, ...newFiles]);
    setResults([]);
  }, []);

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

  return (
    <div>
      <div className="card">
        <div className="card-header"><h2>Carga de Archivos Excel</h2></div>
        <div className="alert alert-info">
          <strong>Formatos soportados:</strong>
          <br />- <code>YYMMDD_Caja.xlsx</code> / <code>YYMMDD_Ventas.xlsx</code>
          <br />- <code>ventasDD.MM.YY.caja.xlsx</code> / <code>ventasDD.MM.YY.xlsx</code>
          <br />- Archivos combinados (caja + ventas en el mismo archivo)
          <br />- El sistema detecta automaticamente el tipo, la fecha y clasifica cada fila.
          <br /><strong>Duplicados:</strong> Se detectan por fecha + monto + tipo. Se le consultara antes de omitir o incluir.
        </div>

        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dragover' : ''}`}>
          <input {...getInputProps()} />
          <div className="dropzone-icon"><Upload size={48} /></div>
          <div className="dropzone-text">{isDragActive ? 'Suelta los archivos aqui...' : 'Arrastra archivos Excel o haz clic para seleccionar'}</div>
          <div className="dropzone-hint">Archivos .xlsx, maximo 10MB. Multiples archivos permitidos.</div>
        </div>

        {files.length > 0 && (
          <div className="file-preview">
            <h4>Archivos detectados ({files.length})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${f.status === 'ready' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                  <FileSpreadsheet size={18} color={f.status === 'ready' ? '#10b981' : '#ef4444'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{f.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
                      {f.status === 'ready' ? (
                        <>
                          <span className={`badge ${f.type === 'caja' ? 'badge-warning' : 'badge-info'}`} style={{ marginRight: '4px' }}>{f.type === 'caja' ? 'CAJA' : 'VENTAS'}</span>
                          {f.date && <span className="badge badge-neutral" style={{ marginRight: '4px' }}>{f.date}</span>}
                          {f.cajaRows > 0 && <span className="badge badge-success" style={{ marginRight: '4px' }}>{f.cajaRows} caja</span>}
                          {f.ventasRows > 0 && <span className="badge badge-primary" style={{ marginRight: '4px' }}>{f.ventasRows} ventas</span>}
                          {f.skippedRows > 0 && <span className="badge badge-neutral">{f.skippedRows} saltados</span>}
                        </>
                      ) : <span style={{ color: '#ef4444' }}>{f.error}</span>}
                    </div>
                    {f.skippedDetails && f.skippedDetails.length > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setShowSkipped((p) => ({ ...p, ['file_' + i]: !p['file_' + i] }))} style={{ fontSize: '0.7rem', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {showSkipped['file_' + i] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          Ver filas saltadas
                        </button>
                        {showSkipped['file_' + i] && (
                          <div style={{ marginTop: '4px', maxHeight: '150px', overflow: 'auto', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.7rem' }}>
                            <table style={{ width: '100%' }}>
                              <thead><tr><th>Fila</th><th>Fecha</th><th>Tipo</th><th>Valor</th><th>Descripcion</th><th>Monto</th><th>Motivo</th></tr></thead>
                              <tbody>
                                {f.skippedDetails.map((s, j) => (
                                  <tr key={j}>
                                    <td style={{ color: '#6b7280' }}>{s.fila}</td>
                                    <td>{s.fecha}</td>
                                    <td>{s.tipo}</td>
                                    <td><span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{s.valor}</span></td>
                                    <td style={{ color: '#9ca3af', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.descripcion}</td>
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
              <button className="btn btn-primary" onClick={processFiles} disabled={processing}>{processing ? 'Procesando...' : `Procesar ${files.length} archivo(s)`}</button>
              <button className="btn btn-outline" onClick={() => setFiles([])}>Limpiar todo</button>
            </div>
            {processing && progress && (
              <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#93c5fd', fontWeight: '600' }}>{progress.phase}</span>
                  {progress.total > 0 && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{progress.step}/{progress.total} filas</span>}
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
      </div>

      {/* Duplicate Dialog */}
      {duplicateDialog && (
        <div className="card" style={{ border: '1px solid rgba(245,158,11,0.4)' }}>
          <div className="card-header" style={{ background: 'rgba(245,158,11,0.05)' }}>
            <h2 style={{ color: '#f59e0b' }}><Copy size={18} /> Duplicados Detectados - {duplicateDialog.fileName}</h2>
          </div>
          <div style={{ padding: '1rem' }}>
            <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>Se encontraron registros que ya existen en la base (fecha + monto + tipo coinciden):</p>

            {duplicateDialog.duplicates.caja.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Caja ({duplicateDialog.duplicates.caja.length} duplicados)</h4>
                <div style={{ maxHeight: '200px', overflow: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <table>
                    <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Estado</th></tr></thead>
                    <tbody>
                      {duplicateDialog.duplicates.caja.slice(0, 20).map((d, i) => (
                        <tr key={i}>
                          <td>{d.incoming.fecha}</td>
                          <td><span className="badge badge-warning">{d.incoming.tipo}</span></td>
                          <td className="amount">{formatCurrency(d.incoming.monto)}</td>
                          <td><span className="badge badge-danger">Duplicado</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {duplicateDialog.duplicates.ventas.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Ventas ({duplicateDialog.duplicates.ventas.length} duplicados)</h4>
                <div style={{ maxHeight: '200px', overflow: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <table>
                    <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Estado</th></tr></thead>
                    <tbody>
                      {duplicateDialog.duplicates.ventas.slice(0, 20).map((d, i) => (
                        <tr key={i}>
                          <td>{d.incoming.fecha}</td>
                          <td><span className="badge badge-info">{d.incoming.tipo}</span></td>
                          <td className="amount">{formatCurrency(d.incoming.monto)}</td>
                          <td><span className="badge badge-danger">Duplicado</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn btn-accent" onClick={() => handleDuplicateDecision('skip')}>
                Omitir Duplicados (cargar solo nuevos)
              </button>
              <button className="btn btn-primary" onClick={() => handleDuplicateDecision('include')}>
                Incluir Todos (cargar duplicados tambien)
              </button>
            </div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="card">
          <div className="card-header"><h2>Resultados de la Carga</h2></div>
          {results.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem', borderRadius: '8px', marginBottom: '0.5rem', background: r.status === 'success' ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)', border: `1px solid ${r.status === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
              {r.status === 'success' ? <CheckCircle size={20} color="#10b981" style={{ marginTop: '2px' }} /> : <AlertCircle size={20} color="#ef4444" style={{ marginTop: '2px' }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{r.name}</div>
                {r.status === 'success' ? (
                  <>
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px', lineHeight: '1.6' }}>
                    {r.cajaCount > 0 && <span style={{ marginRight: '8px' }}>Caja: <strong style={{ color: '#10b981' }}>{r.cajaCount}</strong></span>}
                    {r.ventasCount > 0 && <span style={{ marginRight: '8px' }}>Ventas: <strong style={{ color: '#10b981' }}>{r.ventasCount}</strong></span>}
                    {r.duplicateSkipped > 0 && <span style={{ color: '#f59e0b' }}>Duplicados omitidos: {r.duplicateSkipped}</span>}
                    {r.duplicatesIncluded > 0 && <span style={{ color: '#3b82f6' }}>Duplicados incluidos: {r.duplicatesIncluded}</span>}
                    {r.skipped > 0 && <span style={{ marginLeft: '8px', color: '#6b7280' }}>Fila(s) no clasificada(s): {r.skipped}</span>}
                  </div>
                  {r.analyzedTotal && (
                    <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', fontSize: '0.75rem' }}>
                      <div style={{ color: '#93c5fd', fontWeight: '600', marginBottom: '4px' }}>Verificacion del archivo Excel</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '2px 12px', color: '#9ca3af' }}>
                        <span>Filas en archivo:</span><span><strong>{r.analyzedTotal}</strong></span><span></span><span></span>
                        <span>Caja importada:</span><span><strong style={{ color: '#10b981' }}>{r.cajaCount}</strong></span><span>vs analisis:</span><span>{r.analyzedCaja}</span>
                        <span>Ventas importadas:</span><span><strong style={{ color: '#10b981' }}>{r.ventasCount}</strong></span><span>vs analisis:</span><span>{r.analyzedVentas}</span>
                        <span>Saltadas:</span><span><strong style={{ color: '#6b7280' }}>{r.skipped}</strong></span><span>vs analisis:</span><span>{r.analyzedSkipped}</span>
                        <span>Total importado:</span><span><strong style={{ color: r.cajaCount + r.ventasCount + r.skipped === r.analyzedTotal ? '#10b981' : '#f59e0b' }}>{r.cajaCount + r.ventasCount + r.skipped}</strong></span><span>de</span><span>{r.analyzedTotal} filas</span>
                      </div>
                      {r.cajaCount + r.ventasCount + r.skipped !== r.analyzedTotal && (
                        <div style={{ marginTop: '4px', color: '#f59e0b', fontSize: '0.7rem' }}>Diferencia detectada ({r.analyzedTotal - r.cajaCount - r.ventasCount - r.skipped} filas)</div>
                      )}
                      {r.cajaCount + r.ventasCount + r.skipped === r.analyzedTotal && (
                        <div style={{ marginTop: '4px', color: '#10b981', fontSize: '0.7rem' }}>Todos los registros verificados correctamente</div>
                      )}
                    </div>
                  )}
                  {r.skippedRows && r.skippedRows.length > 0 && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setShowSkipped((p) => ({ ...p, [i]: !p[i] }))} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                        {showSkipped[i] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        Ver filas no incorporadas ({r.skippedRows.length})
                      </button>
                      {showSkipped[i] && (
                        <div style={{ marginTop: '0.5rem', maxHeight: '300px', overflow: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <table style={{ width: '100%', fontSize: '0.75rem' }}>
                            <thead>
                              <tr>
                                <th>Fila</th>
                                <th>Fecha</th>
                                <th>Tipo</th>
                                <th>Valor</th>
                                <th>Monto</th>
                                <th>Descripcion</th>
                                <th>Motivo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.skippedRows.map((s, j) => (
                                <tr key={j}>
                                  <td style={{ color: '#6b7280' }}>{s.fila}</td>
                                  <td>{s.fecha}</td>
                                  <td>{s.tipo}</td>
                                  <td><span className="badge badge-neutral">{s.valor}</span></td>
                                  <td style={{ textAlign: 'right' }}>{s.monto}</td>
                                  <td style={{ color: '#9ca3af', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.descripcion}</td>
                                  <td style={{ color: '#ef4444', fontSize: '0.7rem' }}>{s.motivo}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                  </>
                ) : <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '4px' }}>{r.message}</div>}
              </div>
              <span className={`badge ${r.status === 'success' ? 'badge-success' : 'badge-danger'}`}>{r.status === 'success' ? 'OK' : 'Error'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-header"><h2>Referencia de Codificaciones</h2></div>
        <div className="alert alert-info"><strong>Todo maneja efectivo.</strong> Los valores 500-503 corresponden a movimientos de caja. Los demas tipos (Moneda Local, Tarjeta, etc.) corresponden a ventas.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', color: '#facc15' }}>Caja (Valores 500-503)</h3>
            <table>
              <thead><tr><th>Cod</th><th>Tipo</th><th>Efecto</th></tr></thead>
              <tbody>
                <tr><td><span className="badge badge-neutral">500</span></td><td>En caja</td><td>Saldo actual</td></tr>
                <tr><td><span className="badge badge-danger">501</span></td><td>Egreso en Caja</td><td>Resta saldo</td></tr>
                <tr><td><span className="badge badge-success">502</span></td><td>Ingreso en Caja</td><td>Suma saldo</td></tr>
                <tr><td><span className="badge badge-warning">503</span></td><td>Retiro de Caja</td><td>Resta saldo</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', color: '#facc15' }}>Ventas</h3>
            <table>
              <thead><tr><th>Tipo (en Excel)</th><th>Valor</th><th>Significado real</th></tr></thead>
              <tbody>
                <tr><td>Moneda Local</td><td><span className="badge badge-neutral">0</span></td><td>Blanco (declarada)</td></tr>
                <tr><td>Moneda Local 1</td><td><span className="badge badge-primary">2</span></td><td>Negro (no declarada)</td></tr>
                <tr><td>Tarjeta C/D</td><td><span className="badge badge-info">VI/MA/AM...</span></td><td>Venta efectivo (débito/credito)</td></tr>
                <tr><td>Pago Electrónico</td><td><span className="badge badge-info">EL/MP...</span></td><td>Retiro de caja (efectivo)</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
