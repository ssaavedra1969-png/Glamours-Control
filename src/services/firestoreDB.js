import { db } from '../config/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  query, where, writeBatch, getDoc, setDoc, limit as firestoreLimit,
} from 'firebase/firestore';
import { processData } from '../utils/excelParser';

function col(name) { return collection(db, name); }
function docRef(name, id) { return doc(db, name, id); }

function sortByCreadoDesc(docs) {
  return docs.sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));
}

async function getAll(collectionName) {
  const snap = await getDocs(col(collectionName));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return sortByCreadoDesc(docs);
}

async function queryFiltered(collectionName, filters = []) {
  let q = col(collectionName);
  const constraints = [];
  for (const f of filters) {
    if (f.field && f.op && f.value !== undefined && f.value !== null) {
      constraints.push(where(f.field, f.op, f.value));
    }
  }
  if (constraints.length > 0) {
    q = query(q, ...constraints);
  }
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return sortByCreadoDesc(docs);
}

async function filterByDateRange(collectionName, fechaInicio, fechaFin) {
  const snap = await getDocs(col(collectionName));
  let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (fechaInicio) results = results.filter((r) => r.fecha >= fechaInicio);
  if (fechaFin) results = results.filter((r) => r.fecha <= fechaFin);
  return results.sort((a, b) => new Date(b.creado) - new Date(a.creado));
}

class FirestoreDB {
  async getCaja(fechaInicio, fechaFin) {
    if (fechaInicio || fechaFin) {
      return filterByDateRange('caja', fechaInicio, fechaFin);
    }
    return getAll('caja');
  }

  async addCajaMovimiento(mov) {
    const existing = await this.getCaja();
    const categoria = mov.categoria || 'Blanco';
    const relevantes = existing.filter((m) => m.categoria === categoria);
    const lastSaldo = relevantes.length > 0 ? relevantes[0].saldo_nuevo : 0;
    const mult = mov.codigo === 502 ? 1 : -1;
    const nuevoSaldo = lastSaldo + mov.monto * mult;
    if (nuevoSaldo < 0) {
      throw new Error(`Saldo insuficiente. Saldo actual: ${lastSaldo}, movimiento: ${mov.monto * mult}`);
    }
    const docData = {
      fecha: mov.fecha, tipo: mov.tipo, codigo: mov.codigo,
      categoria, descripcion: mov.descripcion, monto: mov.monto,
      saldo_anterior: lastSaldo, saldo_nuevo: nuevoSaldo,
      origen: mov.origen || 'manual', creado: new Date().toISOString(),
    };
    const ref = await addDoc(col('caja'), docData);
    return { id: ref.id, ...docData };
  }

  async addBulkCajaMovimientos(movimientos, onProgress) {
    const existing = await this.getCaja();

    const existingSorted = [...existing].sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
    const saldos = { Blanco: 0, Negro: 0 };
    for (const m of existingSorted) {
      const cat = m.categoria || 'Blanco';
      saldos[cat] = m.saldo_nuevo;
    }

    const newSorted = movimientos.map((m, i) => ({
      ...m, _bulkIndex: i, creado: `${m.fecha}T${String(20 + i).padStart(2, '0')}:00:00`,
    })).sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      return (a.creado || '').localeCompare(b.creado || '');
    });

    const newDocs = [];
    for (const item of newSorted) {
      const cat = item.categoria || 'Blanco';
      const mult = item.codigo === 502 ? 1 : -1;
      const anterior = saldos[cat];
      saldos[cat] += item.monto * mult;
      if (saldos[cat] < 0) saldos[cat] = 0;
      newDocs.push({
        fecha: item.fecha, tipo: item.tipo, codigo: item.codigo,
        categoria: cat, descripcion: item.descripcion, monto: item.monto,
        saldo_anterior: anterior, saldo_nuevo: saldos[cat],
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
    await this._recalculateAllSaldo();
  }

  async updateCajaMovimiento(id, updates) {
    await updateDoc(docRef('caja', id), updates);
    await this._recalculateAllSaldo();
    const snap = await getDoc(docRef('caja', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  async _recalculateAllSaldo() {
    const allSnap = await getDocs(col('caja'));
    const all = allSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
    const saldos = { Blanco: 0, Negro: 0 };
    const batch = writeBatch(db);
    for (const m of all) {
      const cat = m.categoria || 'Blanco';
      const mult = m.codigo === 502 ? 1 : -1;
      const anterior = saldos[cat];
      saldos[cat] += m.monto * mult;
      if (saldos[cat] < 0) saldos[cat] = 0;
      batch.update(docRef('caja', m.id), {
        saldo_anterior: anterior, saldo_nuevo: saldos[cat],
      });
    }
    await batch.commit();
  }

  async getVentas(fechaInicio, fechaFin) {
    if (fechaInicio || fechaFin) {
      return filterByDateRange('ventas', fechaInicio, fechaFin);
    }
    return getAll('ventas');
  }

  async addVenta(venta) {
    const docData = {
      ...venta, creado: new Date().toISOString(),
    };
    const ref = await addDoc(col('ventas'), docData);

    if (venta.medio_pago === 'Efectivo') {
      const existing = await this.getCaja();
      const categoria = venta.categoria || 'Blanco';
      const relevantes = existing.filter((m) => m.categoria === categoria);
      const lastSaldo = relevantes.length > 0 ? relevantes[0].saldo_nuevo : 0;
      await addDoc(col('caja'), {
        fecha: venta.fecha, tipo: 'Ingreso en Caja', codigo: 502,
        categoria,
        descripcion: `Venta ${categoria} - ${venta.descripcion || ''}`,
        monto: venta.monto, saldo_anterior: lastSaldo, saldo_nuevo: lastSaldo + venta.monto,
        usuario: venta.usuario, origen: 'venta', creado: new Date().toISOString(),
      });
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
        const existing = await this.getCaja();
        const categoria = venta.categoria || 'Blanco';
        const cajaIdx = existing.findIndex((m) =>
          m.origen === 'venta' && m.fecha === venta.fecha && m.monto === venta.monto && m.categoria === categoria
        );
        if (cajaIdx !== -1) {
          await deleteDoc(docRef('caja', existing[cajaIdx].id));
          await this._recalculateAllSaldo();
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
      return filterByDateRange('cierres', fechaInicio, fechaFin);
    }
    return getAll('cierres');
  }

  async addCierre(cierre) {
    const docData = { ...cierre, creado: new Date().toISOString() };
    const ref = await addDoc(col('cierres'), docData);
    return { id: ref.id, ...docData };
  }

  async getConciliaciones() {
    return getAll('conciliaciones');
  }

  async addConciliacion(conc) {
    const docData = { ...conc, creado: new Date().toISOString() };
    const ref = await addDoc(col('conciliaciones'), docData);
    return { id: ref.id, ...docData };
  }

  async getAuditoria() {
    return getAll('auditoria');
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
    return getAll('users');
  }

  async addUser(userData) {
    const docData = { creado: new Date().toISOString(), ...userData };
    const ref = await addDoc(col('users'), docData);
    return { id: ref.id, ...docData };
  }

  async addAuditLog(usuario, accion, modulo, detalle) {
    return this.addAuditoria({ usuario, accion, modulo, detalle });
  }

  async processExcelFile(rawData, fileName, fileDate, onProgress) {
    if (onProgress) onProgress({ phase: 'Analizando filas...', step: 0, total: rawData.length });
    await new Promise((r) => setTimeout(r, 50));

    const result = processData(rawData, null, fileDate);

    if (onProgress) onProgress({ phase: 'Detectando duplicados...', step: rawData.length, total: rawData.length });
    await new Promise((r) => setTimeout(r, 50));

    const existingCaja = await this.getCaja();
    const existingVentas = await this.getVentas();

    const duplicates = { caja: [], ventas: [] };

    for (const mov of result.caja) {
      const match = existingCaja.find((existing) =>
        existing.fecha === mov.fecha && existing.monto === mov.monto && existing.codigo === mov.codigo
      );
      if (match) duplicates.caja.push({ incoming: mov, existing: match });
    }

    for (const venta of result.ventas) {
      const match = existingVentas.find((existing) =>
        existing.fecha === venta.fecha && existing.monto === venta.monto && existing.tipo === venta.tipo
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
      const saved = await this.addBulkCajaMovimientos(newCaja, (count) => {
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
      totalCaja: result.caja.length,
      totalVentas: result.ventas.length,
      totalSkipped: result.skipped,
      skipped: result.skipped, skippedRows: result.skippedRows, errors: result.errors,
      duplicates,
      hasDuplicates: duplicates.caja.length > 0 || duplicates.ventas.length > 0,
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
      const batch = writeBatch(db);
      let count = 0;
      for (const d of snap.docs) {
        batch.delete(d.ref);
        count++;
        if (count % 500 === 0) {
          await batch.commit();
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      if (count % 500 !== 0) {
        await batch.commit();
      }
    }
  }
}

const firestoreDB = new FirestoreDB();
export default firestoreDB;
