# Cambios — versión 1.2

## 1. Escanear un código nuevo → crear producto nuevo

Antes, al leer un código desconocido la pantalla empujaba a **asociarlo a un producto
que ya existía**. Ahora la primera opción, en amarillo, es:

> **＋ Crear producto nuevo con este código**

y debajo, como opción secundaria, queda la búsqueda para asociarlo a uno existente.

Además:

- Si el código escaneado **tiene letras** (ej. `K1968-CR`), se propone como referencia.
- Si es un **EAN/UPC de puros números** (ej. `7701234567890`), la referencia queda en
  blanco para que escribas la del repuesto, y aparece un aviso explicándolo. El código
  de barras se asocia igual, así que la próxima vez que lo escanees abre el producto solo.
- Si escribes una referencia que **no existe** en el buscador, ahora también te ofrece
  crearla en vez de solo decir "no se encontró".

## 2. Descargas que sí descargan

**El problema:** la app usaba `<a download>`, que el WebView de Android ignora en
silencio. Por eso decía "descargado" y no aparecía ningún archivo.

**La solución:** se agregó un plugin nativo (`DescargasPlugin.java`) que:

- Escribe el archivo en **Descargas/Frenos Pala/** del teléfono.
- Lanza una **notificación de Android** "Descarga completa" — al tocarla se abre el archivo.
- Muestra en la app una tarjeta con el nombre, la ruta y un botón **Abrir archivo**.
- Si algo falla, **lo dice**. Ya no miente diciendo que descargó.

En Android 10 o superior no pide ningún permiso de almacenamiento.

### Elegir el formato

En **Informes → Inventario y respaldo** hay un botón nuevo:
**⬇ Descargar inventario (PDF o Excel)**, que abre un selector con:

| Opción | Qué genera |
|---|---|
| 📄 PDF | Tabla agrupada por categoría, con totales y número de página |
| 📊 Excel | Hoja *Inventario* + hoja *Por bodega* (existencias de las 5 bodegas) |
| Los dos | Genera el PDF y el Excel de una sola vez |
| JSON | Copia técnica completa, para restaurar la app |

Los nombres incluyen fecha y hora: `inventario-frenospala-2026-09-03_1420.pdf`

## 3. Funciona sin internet

Antes jsPDF y SheetJS se bajaban de un CDN. En la bodega sin señal, exportar fallaba.
Ahora las librerías viven en `vendor/` dentro del APK.

---

# Cómo compilar el APK

El motivo por el que "no se actualizaba" es casi siempre que no se corrió `build.js`
y `cap sync` antes de compilar, o que Android Studio reusó un build viejo.

```bash
npm run build          # copia los archivos web (incluida vendor/) a www/
npx cap sync android   # los pasa al proyecto Android
npx cap open android   # abre Android Studio
```

O de un solo golpe:

```bash
npm run apk
```

En Android Studio: **Build → Clean Project**, luego **Build → Build APK(s)**.

> El `versionCode` subió de 1 a **3** y el `versionName` a **1.2**. Si el teléfono
> sigue mostrando la versión vieja, **desinstala la app** antes de instalar el APK
> nuevo (pasa cuando el APK anterior se firmó con otra clave).

## Verificar que quedó bien instalada

1. Abre **Informes → Inventario y respaldo** → debe verse el botón amarillo
   **⬇ Descargar inventario (PDF o Excel)**.
2. Escanea cualquier código que no esté en el sistema → el título debe decir
   **"Código nuevo"** con el botón amarillo de crear producto.

Si no ves eso, el APK sigue siendo el viejo.

## Permisos que pide ahora

- **Notificaciones** (Android 13+) — para el aviso de "Descarga completa".
  Si lo rechazas, el archivo se guarda igual, solo que sin notificación.
- **Almacenamiento** — solo en Android 9 o menor.

## Archivos tocados

```
index.html                                          librerías locales + descargas.js
app.js                                              escaneo, selector de formato, exportación
descargas.js                                        NUEVO — puente de guardado
vendor/                                             NUEVO — jsPDF, autoTable, SheetJS
build.js                                            copia descargas.js y vendor/
android/.../DescargasPlugin.java                    NUEVO — guardado + notificación
android/.../MainActivity.java                       registra el plugin y pide permisos
android/app/src/main/AndroidManifest.xml            permisos nuevos
android/app/src/main/res/xml/file_paths.xml         rutas del FileProvider
android/app/build.gradle                            versionCode 3 / versionName 1.2
```
