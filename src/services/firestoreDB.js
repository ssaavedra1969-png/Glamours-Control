import { db } from '../config/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  query, where, writeBatch, getDoc, setDoc, limit as firestoreLimit, orderBy,
  getCountFromServer,
} from 'firebase/firestore';
import { processData, separarDuplicadosInternos } from '../utils/excelParser';

function col(name) { return collection(db, name); }
function docRef(name, id) { return doc(db, name, id); }

// Evita cuelgues eternos: si Firebase no responde en X segundos, falla con
// un mensaje accionable (tipicamente emulador apagado).
function conTimeout(promesa, ms = 15000) {
  return Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Sin respuesta de Firebase (emulador en localhost:8080?). Verifica que este corriendo "firebase emulators:start".')), ms)),
  ]);
}

const ESTADO_DOC = 'caja';

// ============================================================
//  FORMULA UNICA DE SALDOS v7 (usar SIEMPRE esta funcion)
//  500 "En caja"       -> ANCLA: fija el saldo = monto (conteo fisico real,
//                         "saldo del dia anterior"). No se suma ni se resta.
//  501 "Egreso"        -> resta (sale dinero de la caja)
//  502 "Ingreso"       -> suma (entra dinero a la caja)
//  503 "Retiro"        -> INFORMATIVO: no afecta el saldo. La salida de
//                         dinero ya esta reflejada en el 501 (Egreso). El 503
//                         solo documenta que hubo un retiro fisico.
//  Formula: Saldo = 500 + 502 - 501  (el 503 NO participa)
//  Ejemplo verificado con datos del usuario (dia 20/08):
//    500=10592, 502=482300, 501=480600, 503=480600
//    Saldo = 10592 + 482300 - 480600 = 12292 (503 NO resta)
// ============================================================
export const SALDO_VERSION = 7;

async function getAllRaw(collectionName) {
  const snap = await getDocs(col(collectionName));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function aplicarMovimiento(saldos, cat, codigo, monto) {
  const anterior = saldos[cat];
  let nuevo;
  if (codigo === 500) {
    nuevo = monto;
  } else {
    // 501 resta, 502 suma, 503 es informativo (mult 0)
    const mult = codigo === 501 ? -1 : codigo === 503 ? 0 : 1;
    nuevo = anterior + monto * mult;
  }
  saldos[cat] = nuevo;
  return { anterior, nuevo };
}

// Orden cronologico canonico: por fecha; dentro del mismo dia la ancla 500
// ("En caja", apertura/conteo fisico) va PRIMERO para fijar el saldo antes de
// aplicar los movimientos de ese dia (en los Excels historicos el 500 a veces
// aparece al final del dia). Desempate estable por creado.
function compararCronologico(a, b) {
  if ((a.fecha || '') !== (b.fecha || '')) return (a.fecha || '').localeCompare(b.fecha || '');
  const pa = a.codigo === 500 ? 0 : 1;
  const pb = b.codigo === 500 ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return (a.creado || '').localeCompare(b.creado || '');
}

// Calcula saldos en orden canonico por categoria.
function computeSaldos(list) {
  const sorted = [...list].sort(compararCronologico);
  const saldos = { Blanco: 0, Negro: 0 };
  for (const m of sorted) {
    const cat = m.categoria || 'Blanco';
    aplicarMovimiento(saldos, cat, m.codigo, m.monto);
  }
  return saldos;
}

class FirestoreDB {
  async getCaja(fechaInicio, fechaFin) {
    if (fechaInicio || fechaFin) {
      let q = col('caja');
      const constraints = [];
      if (fechaInicio) constraints.push(where('fecha', '>=', fechaInicio));
      if (fechaFin) constraints.push(where('fecha', '<=', fechaFin));
      q = query(q, ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));
    }
    return getAllRaw('caja');
  }

  async _getLastSaldo(categoria) {
    const saldos = await this.getEstadoSaldos();
    return saldos[categoria] || 0;
  }

  // Devuelve los saldos cacheados (1 lectura) o los calcula desde la coleccion completa (1ra vez).
  async getEstadoSaldos() {
    try {
      const snap = await getDoc(docRef('estado', ESTADO_DOC));
      if (snap.exists()) {
        const d = snap.data();
        if (typeof d.saldo_blanco === 'number') return { Blanco: d.saldo_blanco, Negro: d.saldo_negro || 0, _version: d._version || 0 };
      }
    } catch (e) {
      console.warn('getEstadoSaldos fallback:', e.message);
    }
    const all = await this.getCaja();
    const saldos = computeSaldos(all);
    await this.setEstadoSaldos(saldos);
    return saldos;
  }

  async setEstadoSaldos(saldos) {
    try {
      const data = {
        saldo_blanco: saldos.Blanco || 0,
        saldo_negro: saldos.Negro || 0,
        actualizado: new Date().toISOString(),
      };
      if (saldos._version != null) data._version = saldos._version;
      await setDoc(docRef('estado', ESTADO_DOC), data, { merge: true });
    } catch (e) {
      console.warn('setEstadoSaldos fallback:', e.message);
    }
  }

  async addCajaMovimiento(mov) {
    const categoria = mov.categoria || 'Blanco';
    const lastSaldo = await this._getLastSaldo(categoria);
    const { nuevo: nuevoSaldo } = aplicarMovimiento({ [categoria]: lastSaldo }, categoria, mov.codigo, mov.monto);
    if (mov.codigo !== 500 && nuevoSaldo < 0) {
      throw new Error(`Saldo insuficiente. Saldo actual: ${lastSaldo}, movimiento: ${mov.monto}`);
    }
    const docData = {
      fecha: mov.fecha, tipo: mov.tipo, codigo: mov.codigo,
      categoria, descripcion: mov.descripcion, monto: mov.monto,
      saldo_anterior: lastSaldo, saldo_nuevo: nuevoSaldo,
      origen: mov.origen || 'manual', creado: new Date().toISOString(),
    };
    const ref = await addDoc(col('caja'), docData);
    const saldosEstado = await this.getEstadoSaldos();
    saldosEstado[categoria] = nuevoSaldo;
    await this.setEstadoSaldos(saldosEstado);
    return { id: ref.id, ...docData };
  }

  async addBulkCajaMovimientos(movimientos, existing, onProgress) {
    // Siembra el saldo desde el doc estado cacheado (1 lectura) en lugar de releer toda la coleccion
    const saldos = await this.getEstadoSaldos();

    const newSorted = movimientos.map((m, i) => ({
      ...m, creado: `${m.fecha}T${String(20 + i).padStart(2, '0')}:00:00`,
    })).sort(compararCronologico);

    const newDocs = [];
    for (const item of newSorted) {
      const cat = item.categoria || 'Blanco';
      const { anterior, nuevo } = aplicarMovimiento(saldos, cat, item.codigo, item.monto);
      newDocs.push({
        fecha: item.fecha, tipo: item.tipo, codigo: item.codigo,
        categoria: cat, descripcion: item.descripcion, monto: item.monto,
        saldo_anterior: anterior, saldo_nuevo: nuevo,
        origen: item.origen || 'excel', creado: item.creado,
      });
    }

    const saved = [];
    const BATCH_SIZE = 500;
    for (let i = 0; i < newDocs.length; i += BATCH_SIZE) {
      const chunk = newDocs.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      const refs = [];
      for (const d of chunk) {
        const ref = doc(col('caja'));
        batch.set(ref, d);
        refs.push({ ref, data: d });
      }
      await batch.commit();
      for (const { ref, data } of refs) {
        saved.push({ id: ref.id, ...data });
      }
      if (onProgress) onProgress(saved.length);
      if (i + BATCH_SIZE < newDocs.length) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    await this.setEstadoSaldos(saldos);
    return saved;
  }

  async deleteCajaMovimiento(id, usuario) {
    const movSnap = await getDoc(docRef('caja', id));
    if (movSnap.exists()) {
      const mov = movSnap.data();
      await addDoc(col('auditoria'), {
        fecha: mov.fecha, usuario: usuario || 'sistema',
        accion: 'ELIMINACION', modulo: 'Caja',
        detalle: `Eliminado: ${mov.tipo} (${mov.categoria}) cod=${mov.codigo} monto=$${mov.monto} saldo_nuevo=$${mov.saldo_nuevo} origen=${mov.origen} desc="${mov.descripcion}"`,
        datos_completos: JSON.stringify(mov),
        creado: new Date().toISOString(),
      });
    }
    await deleteDoc(docRef('caja', id));
    await this._recalculateFromScratch(mov.categoria);
  }

  async updateCajaMovimiento(id, updates) {
    await updateDoc(docRef('caja', id), updates);
    await this._recalculateFromScratch(updates.categoria);
    const snap = await getDoc(docRef('caja', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  async _recalculateFromScratch(onlyCategoria) {
    let all;
    if (onlyCategoria) {
      const snap = await getDocs(query(col('caja'), where('categoria', '==', onlyCategoria)));
      all = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(compararCronologico);
    } else {
      const allSnap = await getDocs(col('caja'));
      all = allSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(compararCronologico);
    }
    const estado = await this.getEstadoSaldos();
    const saldos = onlyCategoria
      ? { ...estado, [onlyCategoria]: 0 }
      : { Blanco: 0, Negro: 0 };
    let batch = writeBatch(db);
    let count = 0;
    for (const m of all) {
      const cat = m.categoria || 'Blanco';
      const { anterior, nuevo } = aplicarMovimiento(saldos, cat, m.codigo, m.monto);
      // Solo escribimos si el saldo realmente cambio (evita reescribir toda la coleccion)
      if (m.saldo_anterior !== anterior || m.saldo_nuevo !== nuevo) {
        batch.update(docRef('caja', m.id), { saldo_anterior: anterior, saldo_nuevo: nuevo });
        count++;
        if (count % 500 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
    }
    if (count % 500 !== 0) await batch.commit();
    await this.setEstadoSaldos({ Blanco: saldos.Blanco, Negro: saldos.Negro, _version: SALDO_VERSION });
  }

  async getVentas(fechaInicio, fechaFin) {
    if (fechaInicio || fechaFin) {
      let q = col('ventas');
      const constraints = [];
      if (fechaInicio) constraints.push(where('fecha', '>=', fechaInicio));
      if (fechaFin) constraints.push(where('fecha', '<=', fechaFin));
      q = query(q, ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));
    }
    return getAllRaw('ventas');
  }

  async addVenta(venta) {
    const docData = {
      ...venta, creado: new Date().toISOString(),
    };
    const ref = await addDoc(col('ventas'), docData);

    if (venta.medio_pago === 'Efectivo') {
      const categoria = venta.categoria || 'Blanco';
      const lastSaldo = await this._getLastSaldo(categoria);
      const nuevoSaldo = lastSaldo + venta.monto;
      await addDoc(col('caja'), {
        fecha: venta.fecha, tipo: 'Ingreso en Caja', codigo: 502,
        categoria,
        descripcion: `Venta ${categoria} - ${venta.descripcion || ''}`,
        monto: venta.monto, saldo_anterior: lastSaldo, saldo_nuevo: nuevoSaldo,
        usuario: venta.usuario, origen: 'venta', creado: new Date().toISOString(),
      });
      const saldos = await this.getEstadoSaldos();
      saldos[categoria] = nuevoSaldo;
      await this.setEstadoSaldos(saldos);
    }

    return { id: ref.id, ...docData };
  }

  async addBulkVentas(ventas, onProgress) {
    const saved = [];
    const BATCH_SIZE = 500;
    for (let i = 0; i < ventas.length; i += BATCH_SIZE) {
      const chunk = ventas.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      const refs = [];
      for (const venta of chunk) {
        const docData = { ...venta, creado: new Date().toISOString() };
        const ref = doc(col('ventas'));
        batch.set(ref, docData);
        refs.push({ ref, data: docData });
      }
      await batch.commit();
      for (const { ref, data } of refs) {
        saved.push({ id: ref.id, ...data });
      }
      if (onProgress) onProgress(saved.length);
      if (i + BATCH_SIZE < ventas.length) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    return saved;
  }

  async deleteVenta(id, usuario) {
    const ventaSnap = await getDoc(docRef('ventas', id));
    if (ventaSnap.exists()) {
      const venta = ventaSnap.data();
      await addDoc(col('auditoria'), {
        fecha: venta.fecha, usuario: usuario || 'sistema',
        accion: 'ELIMINACION', modulo: 'Ventas',
        detalle: `Eliminada: ${venta.tipo} (${venta.categoria || 'Tarjeta'}) monto=$${venta.monto} medio=${venta.medio_pago} banco=${venta.banco || '-'} cuotas=${venta.cuotas} desc="${venta.descripcion}"`,
        datos_completos: JSON.stringify(venta),
        creado: new Date().toISOString(),
      });
      if (venta.medio_pago === 'Efectivo') {
        const categoria = venta.categoria || 'Blanco';
        const cajaSnap = await getDocs(query(col('caja'),
          where('origen', '==', 'venta'),
          where('fecha', '==', venta.fecha),
          where('monto', '==', venta.monto),
          where('categoria', '==', categoria),
        ));
        if (!cajaSnap.empty) {
          await deleteDoc(docRef('caja', cajaSnap.docs[0].id));
          await this._recalculateFromScratch(categoria);
        }
      }
    }
    await deleteDoc(docRef('ventas', id));
  }

  async updateVenta(id, updates) {
    await updateDoc(docRef('ventas', id), updates);
    const snap = await getDoc(docRef('ventas', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  async getCierres(fechaInicio, fechaFin) {
    if (fechaInicio || fechaFin) {
      let q = col('cierres');
      const constraints = [];
      if (fechaInicio) constraints.push(where('fecha', '>=', fechaInicio));
      if (fechaFin) constraints.push(where('fecha', '<=', fechaFin));
      q = query(q, ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));
    }
    return getAllRaw('cierres');
  }

  async addCierre(cierre) {
    const docData = { ...cierre, creado: new Date().toISOString() };
    const ref = await addDoc(col('cierres'), docData);
    return { id: ref.id, ...docData };
  }

  async getConciliaciones() {
    return getAllRaw('conciliaciones');
  }

  async addConciliacion(conc) {
    const docData = { ...conc, creado: new Date().toISOString() };
    const ref = await addDoc(col('conciliaciones'), docData);
    return { id: ref.id, ...docData };
  }

  async getAuditoria(limite) {
    if (limite) {
      // Solo los ultimos N registros (1 lectura por doc, ahorra cuota)
      const snap = await getDocs(query(col('auditoria'), orderBy('creado', 'desc'), firestoreLimit(limite)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    return getAllRaw('auditoria');
  }

  async addAuditoria(log) {
    const docData = { ...log, fecha: new Date().toISOString() };
    const ref = await addDoc(col('auditoria'), docData);
    return { id: ref.id, ...docData };
  }

  async getConfiguracion() {
    try {
      const snap = await getDocs(query(col('configuracion'), firestoreLimit(1)));
      if (snap.empty) {
        const defaultConfig = { iva: 21, limites_caja: { minimo: 10000, maximo: 200000 } };
        const ref = await addDoc(col('configuracion'), defaultConfig);
        return { id: ref.id, ...defaultConfig };
      }
      return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (e) {
      console.warn('getConfiguracion fallback:', e.message);
      return { iva: 21, limites_caja: { minimo: 10000, maximo: 200000 } };
    }
  }

  async updateConfiguracion(config) {
    const snap = await getDocs(query(col('configuracion'), firestoreLimit(1)));
    if (!snap.empty) {
      await updateDoc(docRef('configuracion', snap.docs[0].id), config);
    } else {
      await addDoc(col('configuracion'), config);
    }
  }

  async getUsers() {
    return getAllRaw('users');
  }

  async addUser(userData) {
    const docData = { creado: new Date().toISOString(), ...userData };
    // Doc con ID = uid: las reglas de Firestore verifican el rol leyendo users/{uid}
    if (userData.uid) {
      await setDoc(docRef('users', userData.uid), docData);
      return { id: userData.uid, ...docData };
    }
    const ref = await addDoc(col('users'), docData);
    return { id: ref.id, ...docData };
  }

  // Asegura que exista el perfil con ID = uid para el usuario logueado.
  // Migra automaticamente el formato viejo (ID automatico + campo uid).
  async ensurePerfilUid(perfil) {
    try {
      const ref = docRef('users', perfil.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) return snap.data();
      const all = await getAllRaw('users');
      const legacy = all.find((u) => u.uid === perfil.uid || u.email === perfil.email);
      const data = {
        uid: perfil.uid,
        email: perfil.email,
        nombre: legacy?.nombre || perfil.nombre,
        rol: legacy?.rol || perfil.rol,
        creado: legacy?.creado || new Date().toISOString(),
        migrado: new Date().toISOString(),
      };
      await setDoc(ref, data);
      return data;
    } catch (e) {
      console.warn('ensurePerfilUid:', e?.message || e);
      return null;
    }
  }

  async addAuditLog(usuario, accion, modulo, detalle) {
    return this.addAuditoria({ usuario, accion, modulo, detalle });
  }

  async recalcularSaldosCompletos() {
    const allSnap = await getDocs(col('caja'));
    const all = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const saldos = computeSaldos(all);
    await this.setEstadoSaldos({ Blanco: saldos.Blanco, Negro: saldos.Negro, _version: SALDO_VERSION });
    return { blanco: saldos.Blanco, negro: saldos.Negro, total: all.length, updated: 0 };
  }

  async processExcelFile(rawData, fileName, fileDate, onProgress) {
    if (onProgress) onProgress({ phase: 'Analizando filas...', step: 0, total: rawData.length });
    await new Promise((r) => setTimeout(r, 50));

    const parsed = processData(rawData, null, fileDate);

    // 1) Duplicados INTERNOS del archivo (dias pegados dos veces al concatenar).
    //    Se descartan siempre: son artefactos del Excel, no dinero real.
    const limpio = separarDuplicadosInternos(parsed.caja, parsed.ventas);
    const result = { ...parsed, caja: limpio.caja, ventas: limpio.ventas };
    const internos = { caja: limpio.dupCaja.length, ventas: limpio.dupVentas.length };
    const internosDetalle = { caja: limpio.dupCaja, ventas: limpio.dupVentas };

    if (onProgress) onProgress({ phase: 'Detectando duplicados...', step: rawData.length, total: rawData.length });
    await new Promise((r) => setTimeout(r, 50));

    // Rango REAL de fechas del archivo: los concatenados abarcan anios y la
    // fecha del nombre/primera fila no alcanza para cubrir todo.
    const fechasPresentes = [...result.caja.map((m) => m.fecha), ...result.ventas.map((v) => v.fecha)].sort();
    const fMin = fechasPresentes[0] || fileDate;
    const fMax = fechasPresentes[fechasPresentes.length - 1] || fileDate;
    const [existingCaja, existingVentas] = await Promise.all([
      conTimeout((fMin && fMax) ? this.getCaja(fMin, fMax) : this.getCaja()),
      conTimeout((fMin && fMax) ? this.getVentas(fMin, fMax) : this.getVentas()),
    ]);

    const duplicates = { caja: [], ventas: [] };

    // Regla del negocio: solo cuenta como duplicado si coinciden TODOS los campos
    // (los campos calculados saldo_anterior/saldo_nuevo se excluyen).
    for (const mov of result.caja) {
      const match = existingCaja.find((existing) =>
        existing.fecha === mov.fecha && existing.tipo === mov.tipo && existing.codigo === mov.codigo
        && (existing.categoria || '') === (mov.categoria || '')
        && (existing.descripcion || '') === (mov.descripcion || '')
        && existing.monto === mov.monto
      );
      if (match) duplicates.caja.push({ incoming: mov, existing: match });
    }

    for (const venta of result.ventas) {
      const match = existingVentas.find((existing) =>
        existing.fecha === venta.fecha && existing.tipo === venta.tipo
        && (existing.categoria || '') === (venta.categoria || '')
        && (existing.medio_pago || '') === (venta.medio_pago || '')
        && (existing.banco || '') === (venta.banco || '')
        && (existing.descripcion || '') === (venta.descripcion || '')
        && (existing.cuotas ?? 1) === (venta.cuotas ?? 1)
        && existing.monto === venta.monto
      );
      if (match) duplicates.ventas.push({ incoming: venta, existing: match });
    }

    const newCaja = result.caja.filter((mov) =>
      !duplicates.caja.some((d) => d.incoming === mov)
    );
    const newVentas = result.ventas.filter((venta) =>
      !duplicates.ventas.some((d) => d.incoming === venta)
    );

    let cajaCount = 0;
    let ventasCount = 0;

    if (newCaja.length > 0) {
      const saved = await this.addBulkCajaMovimientos(newCaja, existingCaja, (count) => {
        if (onProgress) onProgress({ phase: `Guardando caja (${count}/${newCaja.length})...`, step: count, total: newCaja.length });
      });
      cajaCount = saved.length;
      if (onProgress) onProgress({ phase: `Caja guardada: ${cajaCount}`, step: cajaCount, total: newCaja.length });
      await new Promise((r) => setTimeout(r, 50));
    }

    if (newVentas.length > 0) {
      const saved = await this.addBulkVentas(newVentas.map((v) => ({
        ...v, usuario: 'admin@glamours.com',
      })), (count) => {
        if (onProgress) onProgress({ phase: `Guardando ventas (${count}/${newVentas.length})...`, step: count, total: newVentas.length });
      });
      ventasCount = saved.length;
      if (onProgress) onProgress({ phase: `Ventas guardadas: ${ventasCount}`, step: ventasCount, total: newVentas.length });
      await new Promise((r) => setTimeout(r, 50));
    }

    if (onProgress) onProgress({ phase: 'Completado', step: rawData.length, total: rawData.length });

    return {
      cajaCount, ventasCount,
      totalCaja: result.caja.length + internos.caja,
      totalVentas: result.ventas.length + internos.ventas,
      totalSkipped: result.skipped,
      internos,
      internosDetalle,
      duplicadosBase: { caja: duplicates.caja.length, ventas: duplicates.ventas.length },
      skipped: result.skipped, skippedRows: result.skippedRows, errors: result.errors,
      duplicates,
    };
  }

  async exportAllData() {
    const collections = ['caja', 'ventas', 'cierres', 'conciliaciones', 'auditoria', 'configuracion', 'users'];
    const data = {};
    for (const name of collections) {
      const snap = await getDocs(col(name));
      data[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    data._meta = { fecha: new Date().toISOString(), collections };
    return data;
  }

  async deleteAllCollections() {
    const collections = ['caja', 'ventas', 'cierres', 'conciliaciones', 'auditoria', 'configuracion', 'users'];
    for (const name of collections) {
      const snap = await getDocs(col(name));
      let batch = writeBatch(db);
      let count = 0;
      for (const d of snap.docs) {
        batch.delete(d.ref);
        count++;
        if (count % 500 === 0) {
          await batch.commit();
          batch = writeBatch(db);
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      if (count % 500 !== 0) {
        await batch.commit();
      }
    }
  }

  // Restaura un backup generado por exportAllData. No borra lo existente:
  // los documentos con el mismo id se sobrescriben, el resto se agrega.
  async importData(backup) {
    const collections = ['caja', 'ventas', 'cierres', 'conciliaciones', 'auditoria', 'configuracion', 'users'];
    let total = 0;
    for (const name of collections) {
      const items = backup[name];
      if (!Array.isArray(items)) continue;
      let batch = writeBatch(db);
      let count = 0;
      for (const item of items) {
        const { id, ...data } = item;
        const ref = id ? doc(db, name, id) : doc(collection(db, name));
        batch.set(ref, data);
        count++; total++;
        if (count % 450 === 0) {
          await batch.commit();
          batch = writeBatch(db);
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      if (count % 450 !== 0) await batch.commit();
    }
    return total;
  }

  // ===== LUXCAR (cumpleaños / día del niño / navidad) =====
  // Un doc por tipo con el array completo de personas: 1 lectura por tipo,
  // la carga sobrescribe (setDoc) y nunca borra -> no requiere permiso admin.
  async getLuxcarAll() {
    const snap = await getDocs(col('luxcar_personas'));
    const out = { cumple: [], nino: [], navidad: [] };
    snap.docs.forEach((d) => {
      if (out[d.id]) out[d.id] = d.data().personas || [];
    });
    return out;
  }

  async guardarLuxcarPersonas(tipo, personas) {
    await setDoc(docRef('luxcar_personas', tipo), {
      personas,
      cantidad: personas.length,
      actualizado: new Date().toISOString(),
    });
    return personas.length;
  }

  async getCollectionCounts() {
    const names = ['caja', 'ventas', 'cierres', 'auditoria'];
    const counts = {};
    for (const name of names) {
      try {
        const snap = await conTimeout(getCountFromServer(col(name)), 10000);
        counts[name] = snap.data().count;
      } catch { counts[name] = -1; }
    }
    return counts;
  }
}

const firestoreDB = new FirestoreDB();
export default firestoreDB;
