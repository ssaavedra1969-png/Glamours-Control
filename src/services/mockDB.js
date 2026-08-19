import { processData } from '../utils/excelParser';

const generateId = () => Math.random().toString(36).substring(2, 15);

function generateDates(days) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function generateDemoCaja() {
  const dates = generateDates(14);
  const movimientos = [];
  let saldoBlanco = 50000;
  let saldoNegro = 20000;

  dates.forEach((fecha) => {
    const numMov = Math.floor(Math.random() * 5) + 2;
    for (let i = 0; i < numMov; i++) {
      const tipos = [
        { tipo: 'Ingreso en Caja', codigo: 502, mult: 1 },
        { tipo: 'Egreso en Caja', codigo: 501, mult: -1 },
        { tipo: 'Retiro de Caja', codigo: 503, mult: -1 },
      ];
      const t = tipos[Math.floor(Math.random() * tipos.length)];
      const categoria = Math.random() > 0.4 ? 'Blanco' : 'Negro';
      const monto = Math.floor(Math.random() * 15000) + 500;
      const saldoAntB = saldoBlanco;
      const saldoAntN = saldoNegro;

      if (categoria === 'Blanco') {
        saldoBlanco += monto * t.mult;
        if (saldoBlanco < 0) saldoBlanco = 0;
      } else {
        saldoNegro += monto * t.mult;
        if (saldoNegro < 0) saldoNegro = 0;
      }

      movimientos.push({
        id: generateId(), fecha, tipo: t.tipo, codigo: t.codigo,
        categoria,
        descripcion: t.tipo === 'Ingreso en Caja' ? 'Ingreso manual' : t.tipo === 'Egreso en Caja' ? 'Pago proveedor' : 'Retiro personal',
        monto,
        saldo_anterior: categoria === 'Blanco' ? saldoAntB : saldoAntN,
        saldo_nuevo: categoria === 'Blanco' ? saldoBlanco : saldoNegro,
        usuario: 'admin@glamours.com', origen: 'manual',
        creado: `${fecha}T${String(8 + i).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`,
      });
    }
  });

  return movimientos.sort((a, b) => new Date(b.creado) - new Date(a.creado));
}

function generateDemoVentas() {
  const dates = generateDates(14);
  const ventas = [];
  const tarjetas = ['Visa - Banco Nación', 'Mastercard - Banco Galicia', 'Visa - Banco Santander', 'Amex - BBVA', 'Cabal - Banco Macro', 'Naranja'];

  dates.forEach((fecha) => {
    const numVentas = Math.floor(Math.random() * 8) + 3;
    for (let i = 0; i < numVentas; i++) {
      const r = Math.random();
      let venta;
      if (r < 0.3) {
        venta = { tipo: 'Moneda Local', categoria: 'Blanco', medio_pago: 'Efectivo', banco: null, cuotas: 1 };
      } else if (r < 0.55) {
        venta = { tipo: 'Moneda Local 1', categoria: 'Negro', medio_pago: 'Efectivo', banco: null, cuotas: 1 };
      } else {
        const tarjeta = tarjetas[Math.floor(Math.random() * tarjetas.length)];
        venta = { tipo: 'Tarjeta de Crédito / Débito', categoria: null, medio_pago: 'Tarjeta', banco: tarjeta, cuotas: Math.floor(Math.random() * 12) + 1 };
      }
      const monto = Math.floor(Math.random() * 30000) + 1000;
      ventas.push({
        id: generateId(), fecha, ...venta, monto,
        descripcion: venta.categoria ? `Venta ${venta.categoria.toLowerCase()}` : `Venta ${venta.banco}`,
        usuario: 'admin@glamours.com',
        creado: `${fecha}T${String(9 + i).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`,
      });
    }
  });

  return ventas.sort((a, b) => new Date(b.creado) - new Date(a.creado));
}

function generateDemoCierres() {
  const dates = generateDates(7);
  return dates.slice(1).map((fecha) => {
    const base = { id: generateId(), fecha, usuario: 'admin@glamours.com', creado: `${fecha}T20:00:00` };
    base.saldo_teorico = Math.floor(Math.random() * 50000) + 20000;
    base.saldo_real = base.saldo_teorico + (Math.random() > 0.7 ? Math.floor(Math.random() * 2000) - 1000 : 0);
    base.diferencia = base.saldo_real - base.saldo_teorico;
    base.observaciones = '';
    return base;
  });
}

function generateDemoConciliaciones() {
  const dates = generateDates(7);
  const bancos = ['Banco Nación', 'Banco Galicia', 'Banco Santander', 'BBVA'];
  return dates.slice(0, 5).map((fecha, i) => {
    const montoVentas = Math.floor(Math.random() * 100000) + 20000;
    const montoExtracto = montoVentas + (Math.random() > 0.6 ? Math.floor(Math.random() * 5000) - 2500 : 0);
    return {
      id: generateId(), fecha, banco: bancos[i % bancos.length],
      monto_ventas: montoVentas, monto_extracto: montoExtracto, diferencia: montoExtracto - montoVentas,
      estado: montoExtracto === montoVentas ? 'Conciliado' : 'Pendiente',
      usuario: 'admin@glamours.com', creado: `${fecha}T10:00:00`,
    };
  });
}

function generateDemoAuditoria() {
  const acciones = [
    'Carga de archivo Excel: 260409_Caja.xlsx', 'Registro de venta manual: $15.000',
    'Cierre de caja diario', 'Modificación de configuración: comisiones',
    'Inicio de sesión', 'Registro de movimiento: Ingreso $5.000',
    'Exportación de reporte: Ventas mensuales', 'Carga de archivo Excel: 260409_Ventas.xlsx',
    'Anulación de venta: justificación - error de carga', 'Cierre de caja con diferencia: -$350',
  ];
  const modulos = ['Caja', 'Ventas', 'Caja', 'Configuración', 'Auth', 'Caja', 'Reportes', 'Carga', 'Ventas', 'Caja'];
  const dates = generateDates(7);
  return dates.flatMap((fecha, di) =>
    Array.from({ length: Math.floor(Math.random() * 4) + 1 }, (_, i) => {
      const idx = (di + i) % acciones.length;
      return {
        id: generateId(),
        fecha: `${fecha}T${String(8 + i * 2).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`,
        usuario: i % 3 === 0 ? 'vendedor@glamours.com' : 'admin@glamours.com',
        accion: acciones[idx], modulo: modulos[idx], detalle: 'Operación realizada desde la interfaz',
      };
    })
  ).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

class MockDB {
  constructor() {
    const isEmpty = localStorage.getItem('glamours_empty') === '1';

    this.caja = isEmpty ? [] : (JSON.parse(localStorage.getItem('glamours_caja')) || generateDemoCaja());
    this.ventas = isEmpty ? [] : (JSON.parse(localStorage.getItem('glamours_ventas')) || generateDemoVentas());
    this.cierres = isEmpty ? [] : (JSON.parse(localStorage.getItem('glamours_cierres')) || generateDemoCierres());
    this.conciliaciones = isEmpty ? [] : (JSON.parse(localStorage.getItem('glamours_conciliaciones')) || generateDemoConciliaciones());
    this.auditoria = isEmpty ? [] : (JSON.parse(localStorage.getItem('glamours_auditoria')) || generateDemoAuditoria());
    this.users = JSON.parse(localStorage.getItem('glamours_users')) || [
      { uid: 'admin-001', email: 'admin@glamours.com', nombre: 'Administrador', rol: 'admin', creado: '2026-01-01T00:00:00' },
      { uid: 'user-001', email: 'vendedor@glamours.com', nombre: 'Vendedor 1', rol: 'user', creado: '2026-02-01T00:00:00' },
    ];
    this.configuracion = isEmpty ? {
      iva: 21,
      limites_caja: { minimo: 10000, maximo: 200000 },
    } : (JSON.parse(localStorage.getItem('glamours_config')) || {
      iva: 21,
      limites_caja: { minimo: 10000, maximo: 200000 },
    });

    if (!isEmpty) this._save();
  }

  _save() {
    localStorage.setItem('glamours_caja', JSON.stringify(this.caja));
    localStorage.setItem('glamours_ventas', JSON.stringify(this.ventas));
    localStorage.setItem('glamours_cierres', JSON.stringify(this.cierres));
    localStorage.setItem('glamours_conciliaciones', JSON.stringify(this.conciliaciones));
    localStorage.setItem('glamours_auditoria', JSON.stringify(this.auditoria));
    localStorage.setItem('glamours_users', JSON.stringify(this.users));
    localStorage.setItem('glamours_config', JSON.stringify(this.configuracion));
  }

  _getSaldos() {
    const sorted = [...this.caja].sort((a, b) => new Date(a.creado) - new Date(b.creado));
    const saldos = { Blanco: 0, Negro: 0 };
    for (const m of sorted) {
      const cat = m.categoria || 'Blanco';
      saldos[cat] = m.saldo_nuevo;
    }
    return saldos;
  }

  _recalculateAllSaldo() {
    const sorted = [...this.caja].sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      return new Date(a.creado) - new Date(b.creado);
    });
    const saldos = { Blanco: 0, Negro: 0 };
    for (const m of sorted) {
      const cat = m.categoria || 'Blanco';
      const mult = m.codigo === 502 ? 1 : -1;
      m.saldo_anterior = saldos[cat];
      saldos[cat] += m.monto * mult;
      if (saldos[cat] < 0) saldos[cat] = 0;
      m.saldo_nuevo = saldos[cat];
    }
    this._save();
  }

  async getCaja(fechaInicio, fechaFin) {
    let result = [...this.caja];
    if (fechaInicio) result = result.filter((m) => m.fecha >= fechaInicio);
    if (fechaFin) result = result.filter((m) => m.fecha <= fechaFin);
    return result.sort((a, b) => new Date(b.creado) - new Date(a.creado));
  }

  async addCajaMovimiento(mov) {
    const categoria = mov.categoria || 'Blanco';
    const relevantes = this.caja.filter((m) => m.categoria === categoria);
    const lastSaldo = relevantes.length > 0 ? relevantes[0].saldo_nuevo : 0;
    const mult = mov.codigo === 502 ? 1 : -1;
    const nuevoSaldo = lastSaldo + mov.monto * mult;
    if (nuevoSaldo < 0) {
      throw new Error(`Saldo insuficiente. Saldo actual: ${lastSaldo}, movimiento: ${mov.monto * mult}`);
    }
    const nuevo = {
      id: generateId(), ...mov, categoria,
      saldo_anterior: lastSaldo, saldo_nuevo: nuevoSaldo,
      origen: mov.origen || 'manual', creado: new Date().toISOString(),
    };
    this.caja.unshift(nuevo);
    this._save();
    return nuevo;
  }

  async addBulkCajaMovimientos(movimientos) {
    const allSorted = [...this.caja, ...movimientos.map((m, i) => ({
      ...m, _bulkIndex: i, creado: `${m.fecha}T${String(20 + i).padStart(2, '0')}:00:00`,
    }))].sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      return new Date(a.creado) - new Date(b.creado);
    });

    const saldos = { Blanco: 0, Negro: 0 };
    const existentes = [...this.caja].sort((a, b) => new Date(a.creado) - new Date(b.creado));
    for (const m of existentes) {
      const cat = m.categoria || 'Blanco';
      saldos[cat] = m.saldo_nuevo;
    }

    const saved = [];
    for (const item of allSorted) {
      if (item._bulkIndex !== undefined) {
        const cat = item.categoria || 'Blanco';
        const mult = item.codigo === 502 ? 1 : -1;
        const anterior = saldos[cat];
        saldos[cat] += item.monto * mult;
        if (saldos[cat] < 0) saldos[cat] = 0;
        const nuevo = {
          id: generateId(),
          fecha: item.fecha, tipo: item.tipo, codigo: item.codigo,
          categoria: cat, descripcion: item.descripcion, monto: item.monto,
          saldo_anterior: anterior, saldo_nuevo: saldos[cat],
          origen: item.origen || 'excel', creado: item.creado,
        };
        this.caja.push(nuevo);
        saved.push(nuevo);
      } else {
        const cat = item.categoria || 'Blanco';
        saldos[cat] = item.saldo_nuevo;
      }
    }

    this.caja.sort((a, b) => new Date(b.creado) - new Date(a.creado));
    this._save();
    return saved;
  }

  async deleteCajaMovimiento(id, usuario) {
    const mov = this.caja.find((m) => m.id === id);
    if (mov) {
      this.auditoria.unshift({
        id: generateId(), fecha: mov.fecha, usuario: usuario || 'sistema',
        accion: 'ELIMINACION', modulo: 'Caja',
        detalle: `Eliminado: ${mov.tipo} (${mov.categoria}) cod=${mov.codigo} monto=$${mov.monto} saldo_nuevo=$${mov.saldo_nuevo} origen=${mov.origen} desc="${mov.descripcion}"`,
        datos_completos: JSON.stringify(mov),
        creado: new Date().toISOString(),
      });
    }
    this.caja = this.caja.filter((m) => m.id !== id);
    this._recalculateAllSaldo();
    this._save();
  }

  async updateCajaMovimiento(id, updates) {
    const idx = this.caja.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    this.caja[idx] = { ...this.caja[idx], ...updates };
    this._recalculateAllSaldo();
    return this.caja[idx];
  }

  async getVentas(fechaInicio, fechaFin) {
    let result = [...this.ventas];
    if (fechaInicio) result = result.filter((v) => v.fecha >= fechaInicio);
    if (fechaFin) result = result.filter((v) => v.fecha <= fechaFin);
    return result.sort((a, b) => new Date(b.creado) - new Date(a.creado));
  }

  async addVenta(venta) {
    const nuevo = {
      id: generateId(), ...venta,
      creado: new Date().toISOString(),
    };
    this.ventas.unshift(nuevo);

    if (venta.medio_pago === 'Efectivo') {
      const categoria = venta.categoria || 'Blanco';
      const relevantes = this.caja.filter((m) => m.categoria === categoria);
      const lastSaldo = relevantes.length > 0 ? relevantes[0].saldo_nuevo : 0;
      this.caja.unshift({
        id: generateId(), fecha: venta.fecha, tipo: 'Ingreso en Caja', codigo: 502,
        categoria,
        descripcion: `Venta ${categoria} - ${venta.descripcion || ''}`,
        monto: venta.monto, saldo_anterior: lastSaldo, saldo_nuevo: lastSaldo + venta.monto,
        usuario: venta.usuario, origen: 'venta', creado: new Date().toISOString(),
      });
    }

    this._save();
    return nuevo;
  }

  async addBulkVentas(ventas) {
    const saved = [];
    for (const venta of ventas) {
      saved.push(await this.addVenta(venta));
    }
    return saved;
  }

  async deleteVenta(id, usuario) {
    const venta = this.ventas.find((v) => v.id === id);
    if (venta) {
      this.auditoria.unshift({
        id: generateId(), fecha: venta.fecha, usuario: usuario || 'sistema',
        accion: 'ELIMINACION', modulo: 'Ventas',
        detalle: `Eliminada: ${venta.tipo} (${venta.categoria || 'Tarjeta'}) monto=$${venta.monto} medio=${venta.medio_pago} banco=${venta.banco || '-'} cuotas=${venta.cuotas} desc="${venta.descripcion}"`,
        datos_completos: JSON.stringify(venta),
        creado: new Date().toISOString(),
      });
      if (venta.medio_pago === 'Efectivo') {
        const categoria = venta.categoria || 'Blanco';
        const idx = this.caja.findIndex((m) =>
          m.origen === 'venta' && m.fecha === venta.fecha && m.monto === venta.monto && m.categoria === categoria
        );
        if (idx !== -1) {
          this.caja.splice(idx, 1);
          this._recalculateAllSaldo();
        }
      }
    }
    this.ventas = this.ventas.filter((v) => v.id !== id);
    this._save();
  }

  async updateVenta(id, updates) {
    const idx = this.ventas.findIndex((v) => v.id === id);
    if (idx === -1) return null;
    this.ventas[idx] = { ...this.ventas[idx], ...updates };
    this._save();
    return this.ventas[idx];
  }

  async getCierres(fechaInicio, fechaFin) {
    let result = [...this.cierres];
    if (fechaInicio) result = result.filter((c) => c.fecha >= fechaInicio);
    if (fechaFin) result = result.filter((c) => c.fecha <= fechaFin);
    return result.sort((a, b) => new Date(b.creado) - new Date(a.creado));
  }

  async addCierre(cierre) {
    const nuevo = { id: generateId(), ...cierre, creado: new Date().toISOString() };
    this.cierres.unshift(nuevo);
    this._save();
    return nuevo;
  }

  async getConciliaciones() {
    return [...this.conciliaciones].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }

  async addConciliacion(conc) {
    const nuevo = { id: generateId(), ...conc, creado: new Date().toISOString() };
    this.conciliaciones.unshift(nuevo);
    this._save();
    return nuevo;
  }

  async getAuditoria() {
    return [...this.auditoria].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }

  async addAuditoria(log) {
    const nuevo = { id: generateId(), ...log, fecha: new Date().toISOString() };
    this.auditoria.unshift(nuevo);
    this._save();
  }

  async getConfiguracion() {
    return { ...this.configuracion };
  }

  async updateConfiguracion(config) {
    this.configuracion = { ...this.configuracion, ...config };
    this._save();
  }

  async getUsers() {
    return [...this.users];
  }

  async addUser(userData) {
    const nuevo = { uid: `user-${Date.now()}`, creado: new Date().toISOString(), ...userData };
    this.users.push(nuevo);
    this._save();
    return nuevo;
  }

  async addAuditLog(usuario, accion, modulo, detalle) {
    return this.addAuditoria({ usuario, accion, modulo, detalle });
  }

  async processExcelFile(rawData, fileName, fileDate, onProgress) {
    localStorage.removeItem('glamours_empty');
    if (onProgress) onProgress({ phase: 'Analizando filas...', step: 0, total: rawData.length });

    await new Promise((r) => setTimeout(r, 50));
    const result = processData(rawData, null, fileDate);

    if (onProgress) onProgress({ phase: 'Detectando duplicados...', step: rawData.length, total: rawData.length });

    await new Promise((r) => setTimeout(r, 50));
    const duplicates = { caja: [], ventas: [] };

    for (const mov of result.caja) {
      const match = this.caja.find((existing) =>
        existing.fecha === mov.fecha && existing.monto === mov.monto && existing.codigo === mov.codigo
      );
      if (match) duplicates.caja.push({ incoming: mov, existing: match });
    }

    for (const venta of result.ventas) {
      const match = this.ventas.find((existing) =>
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
      if (onProgress) onProgress({ phase: `Guardando caja (0/${newCaja.length})...`, step: rawData.length, total: rawData.length });
      await new Promise((r) => setTimeout(r, 50));
      const saved = await this.addBulkCajaMovimientos(newCaja);
      cajaCount = saved.length;
      if (onProgress) onProgress({ phase: `Caja guardada: ${cajaCount}`, step: rawData.length, total: rawData.length });
      await new Promise((r) => setTimeout(r, 50));
    }

    if (newVentas.length > 0) {
      if (onProgress) onProgress({ phase: `Guardando ventas (0/${newVentas.length})...`, step: rawData.length, total: rawData.length });
      await new Promise((r) => setTimeout(r, 50));
      const saved = await this.addBulkVentas(newVentas.map((v) => ({
        ...v, usuario: 'admin@glamours.com',
      })));
      ventasCount = saved.length;
      if (onProgress) onProgress({ phase: `Ventas guardadas: ${ventasCount}`, step: rawData.length, total: rawData.length });
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
}

const mockDB = new MockDB();
export default mockDB;
