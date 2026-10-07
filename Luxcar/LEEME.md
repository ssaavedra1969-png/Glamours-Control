# Carpeta LUXCAR — Archivos de trabajo (Excel + exportaciones)

Datos de la sección **Luxcar** del sistema (cumpleaños, día del niño, navidad).

⚠️ Estos archivos contienen **datos personales** (nombres y fechas). El repo es
**público**: subirlos fue una decisión explícita del dueño del proyecto.

## Archivos

| Archivo | Qué es |
|---|---|
| `Cumples.xlsx` | Excel de trabajo original (histórico local). |
| `luxcar_export.json` | Export crudo de la colección `luxcar_personas` (producción), descargado con el script de `DESARROLLO.md`. |
| `LUXCAR_plantilla.xlsx` | Plantilla vacía lista para completar y cargar (3 hojas: CUMPLES · DÍA DEL ÑINO · NAVIDAD). |
| `LUXCAR_prueba_dev.xlsx` | Excel de prueba con datos ficticios para validar la carga en el emulador. |

## Cómo usar

Para cargar datos nuevos en la app:

1. Abrí `LUXCAR_plantilla.xlsx` (o una copia de tu lista actual) y completá las
   hojas según el formato de `DESARROLLO.md` (columna de fechas como **TEXTO**).
2. En la app → **Luxcar** → "Elegir archivo" → seleccioná el `.xlsx`.

⚠️ La carga **REEMPLAZA** toda la lista anterior: el archivo debe tener TODAS las
personas que quieras conservar más las nuevas.

> Nota: `LUXCAR_listas.xlsx` (la lista consolidada generada el 06/10/2026) se
> eliminó de la carpeta local; si reaparece, conviene subirla con un commit.