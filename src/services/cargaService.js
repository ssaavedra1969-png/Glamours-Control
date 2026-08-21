// Gestor de carga masiva que vive FUERA de React: si el usuario cambia de
// seccion a mitad del proceso, este sigue ejecutandose y al terminar notifica
// con el resumen completo (lo cargado y lo que quedo afuera).
import toast from 'react-hot-toast';
import mockDB from './firestoreDB';

let job = null;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(job));
}

export function suscribirseCarga(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function obtenerCarga() {
  return job;
}

export function limpiarCarga() {
  job = null;
  emit();
}

export async function iniciarCarga(archivos, usuario) {
  if (job && job.estado === 'procesando') {
    toast.error('Ya hay una carga en proceso');
    return false;
  }

  job = {
    estado: 'procesando',
    totalArchivos: archivos.length,
    indiceActual: 0,
    archivoActual: '',
    progreso: null,
    resultados: [],
    inicio: Date.now(),
    fin: null,
    usuario,
  };
  emit();

  for (let i = 0; i < archivos.length; i++) {
    const f = archivos[i];
    job.indiceActual = i + 1;
    job.archivoActual = f.name;
    emit();

    if (f.status === 'error') {
      job.resultados.push({ name: f.name, status: 'error', message: f.error });
      continue;
    }

    try {
      const result = await mockDB.processExcelFile(f.raw, f.name, f.date, (p) => {
        job.progreso = p;
        emit();
      });
      job.progreso = null;

      const dupArchivo = (result.internos?.caja || 0) + (result.internos?.ventas || 0);
      const dupBase = (result.duplicadosBase?.caja || 0) + (result.duplicadosBase?.ventas || 0);

      job.resultados.push({
        name: f.name, status: 'success', type: f.type, date: f.date,
        ...result,
        analyzedCaja: f.cajaRows, analyzedVentas: f.ventasRows, analyzedSkipped: f.skippedRows, analyzedTotal: f.totalRows,
        _dupArchivo: dupArchivo, _dupBase: dupBase,
      });

      await mockDB.addAuditLog(
        usuario,
        `Carga de archivo: ${f.name}`,
        'Carga',
        `Caja: ${result.cajaCount}, Ventas: ${result.ventasCount}, Dup archivo: ${dupArchivo}, Dup base: ${dupBase}, Sin clasificar: ${result.skipped}`,
      );
      emit();
    } catch (err) {
      job.progreso = null;
      job.resultados.push({ name: f.name, status: 'error', message: err.message });
      emit();
    }
  }

  job.estado = 'completada';
  job.fin = Date.now();
  emit();

  // Notificacion global visible desde cualquier seccion
  const ok = job.resultados.filter((r) => r.status === 'success');
  const conError = job.resultados.filter((r) => r.status === 'error');
  let cargados = 0;
  let afuera = 0;
  ok.forEach((r) => {
    cargados += (r.cajaCount || 0) + (r.ventasCount || 0);
    afuera += ((r.internos?.caja || 0) + (r.internos?.ventas || 0))
      + ((r.duplicadosBase?.caja || 0) + (r.duplicadosBase?.ventas || 0))
      + (r.skipped || 0);
  });
  const dur = Math.max(1, Math.round((job.fin - job.inicio) / 1000));

  if (ok.length > 0) {
    const detalleAfuera = afuera > 0 ? ` | Quedaron afuera: ${afuera}` : '';
    toast.success(`Carga terminada (${dur}s): ${cargados} registros cargados${detalleAfuera}`, { duration: 12000 });
  }
  if (conError.length > 0) {
    toast.error(`${conError.length} archivo(s) con error`, { duration: 8000 });
  }
  return true;
}
