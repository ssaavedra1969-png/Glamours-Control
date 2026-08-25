# Estado Actual: Libro de Caja — Correcciones Agosto 2026

## Problemas que se corrigieron

### 1. Saldos por documento en $0
**Problema:** Los campos `saldo_anterior` y `saldo_nuevo` de cada movimiento de caja mostraban $0.
**Causa:** `recalcularSaldosCompletos()` solo actualizaba `estado_saldos` (saldo acumulado), NO los campos individuales de cada documento.
**Fix:** `recalcularSaldosCompletos()` ahora llama `_recalculateFromScratch()` que lee TODOS los docs de caja, los ordena cronológicamente, y reescribe `saldo_anterior`/`saldo_nuevo` en cada uno.

### 2. Hero card "Saldo Total en Caja" mostraba cifras acumuladas incorrectas ($21.9M+)
**Problema:** El Dashboard y Caja usaban `getEstadoSaldos()` que devuelve el saldo acumulado histórico. Negro acumula 502s desde 2022 sin resets (no tiene 500), generando cifras gigantes.
**Fix:** Ambos heroes ahora calculan el saldo CRONOLÓGICAMENTE desde los datos cargados (sorteo por fecha + código: 500→502→501→503). Fórmula: 500 ancla (resetea categoría), 502 suma, 501 resta, 503 no participa.

### 3. Caja.jsx no recargaba datos después del recálculo automático
**Problema:** Al detectar versión vieja, llamaba `recalcularSaldosCompletos()` pero mostraba los datos viejos (sin saldos).
**Fix:** Después del recálculo, hace `getCaja()` otra vez para obtener datos frescos con saldos actualizados.

### 4. SALDO_VERSION debía subirse
**Problema:** Si el código nuevo se deployaba con `SALDO_VERSION = 7` (igual que producción), el recálculo automático NO se ejecutaba.
**Fix:** `SALDO_VERSION` subió a **8**. La primera vez que un usuario abre Caja en producción, detecta la versión vieja y ejecuta el recálculo completo.

### 5. Dashboard.jsx variable `c` no definida
**Problema:** El cálculo del hero usaba `c` (variable local del destructuring de loadData) en vez de `caja` (estado de React).
**Fix:** Cambiado a `[...caja]` en el cálculo del hero.

### 6. `_recalculateFromScratch()` no retornaba datos de progreso
**Fix:** Ahora retorna `{ total, updated }` para que la UI informe cuántos registros se procesaron.

---

## Fórmula de Saldos (recordatorio)

**Código 500** → ANCLA: `saldo[cat] = monto` (resetea el saldo de esa categoría)
**Código 502** → `saldo[cat] += monto`
**Código 501** → `saldo[cat] -= monto`
**Código 503** → **INFORMATIVO**: no participa en el saldo

**Orden dentro del mismo día:** 500 primero → 502 → 501 → 503

## Headers de día en Caja

- **Ingresos**: total de todos los 502 (todas las categorías)
- **Egresos**: total de todos los 501 (todas las categorías)
- **Blanco**: total de 502 con categoría Blanco Y origen 'venta' (solo ventas)
- **Negro**: total de 502 con categoría Negro Y origen 'venta' (solo ventas)
- **Caja**: saldo acumulado al final del día (calculado crónológicamente desde el inicio del rango)

## Datos de producción verificados (24/08/2026)

6 movimientos:
- 500 Blanco: $12,292 (ancla)
- 502 Blanco: +$17,000 (venta)
- 502 Negro: +$17,000 (venta)
- 502 Blanco: +$12,600 (ingreso excel)
- 501 Blanco: -$40,000 (egreso)

**Caja final 24/08 = $18,892** (B=$1,892 + N=$17,000)

## Archivos modificados

- `src/services/firestoreDB.js`: `SALDO_VERSION = 8`, `recalcularSaldosCompletos()`, `_recalculateFromScratch()` retorna datos
- `src/pages/Caja.jsx`: hero cronológico, re-fetch post-recalc, headers con etiquetas + "Caja" final del día
- `src/pages/Dashboard.jsx`: hero cronológico desde `caja` (no `getEstadoSaldos()`), eliminó estado/llamada innecesaria

## Advertencia importante

**NO bajar `SALDO_VERSION` por debajo de 8.** Si se baja, el recálculo automático se re-ejecuta innecesariamente cada vez que alguien abre Caja.

**En producción, `getEstadoSaldos()` puede tener valores desactualizados** hasta que alguien ejecute `recalcularSaldosCompletos()` manualmente (botón "Recalcular" en Caja) o abra Caja con la versión vieja.
