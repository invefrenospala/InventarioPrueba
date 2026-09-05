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

---

# Cambios — versión 1.3

## 1. Precio de compra

Cada producto ahora tiene **dos precios**: el de compra (lo que le pagas al proveedor)
y el de venta. Ambos se editan en **✎ Editar** dentro de la ficha del producto, y
también al crear uno nuevo.

Mientras escribes, un recuadro muestra en vivo cómo quedan los precios y el **margen**,
con color: rojo si estás perdiendo, naranja si el margen es menor al 15%, verde si va bien.

## 2. IVA — cómo quedó y por qué

Los precios se guardan **sin IVA** y el IVA del 19% se calcula al mostrarlos.

Como te dieron los precios nuevos ya con IVA incluido, en el formulario hay una casilla:
**"Los precios que escribí ya incluyen IVA del 19%"**. Al marcarla, la app divide entre
1,19 y guarda la base. Digitas lo que te pasaron, sin hacer cuentas.

La ficha del producto muestra las tres cifras: compra sin IVA, venta sin IVA y venta con IVA.

## 3. Informes de inversión

La sección **Qué conviene comprar** ahora calcula plata, no solo unidades. Al elegir
1, 3 o 6 meses aparece arriba un recuadro con:

- La **inversión estimada** sin IVA
- El mismo total **con IVA**
- Cuántas unidades y cuántas referencias
- Un aviso si hay referencias sin precio de compra, porque esas no suman y la
  inversión real sería mayor

Cada producto muestra además cuánto cuesta *ese* pedido en particular. La lista se
ordena por inversión, no por cantidad: primero lo que más plata pesa.

Arriba, en las tarjetas de resumen, se agregó **Valor a precio de compra** junto al
valor a precio de venta que ya estaba.

## 4. Los exportes incluyen los precios

**PDF:** columnas de compra y venta, totales del inventario a ambos precios, y una
**página final con el plan de compras** del período seleccionado.

**Excel:** tres hojas ahora — *Inventario* (con compra, venta, venta con IVA y valor
total por línea), *Compras sugeridas* y *Por bodega*.

## 5. Ajustes visuales

- **Catálogo:** el buscador y los filtros ya no van pegados. Se agregó el rótulo
  "Filtrar por", más aire entre los dos, y una línea que separa la zona de filtros de
  la lista. Los filtros quedan fijos al hacer scroll.
- **Chips redondeados**, más grandes y con sombra suave el que está activo.
- Mismo espaciado aplicado en Movimientos e Informes.

## 6. Pantalla completa

La franja blanca era la barra de estado de Android, que venía con el color de fábrica.
Ahora la barra de estado y la de navegación van en el gris del panel (#26282B), con
iconos claros, así que se funden con la cabecera. Se corrigió en el tema de Android
y también en tiempo de ejecución, para que aplique en todas las versiones.

## Antes de instalar esta versión

Hay que agregar la columna nueva en Supabase. Entra a **SQL Editor → New query**,
pega el contenido de `supabase/migracion-costo.sql` y dale Run. No borra nada.

Si no lo haces, la app funciona igual pero el precio de compra no se sincroniza
entre dispositivos.

## Cómo cargar los precios de compra

Son 164 referencias. Dos opciones:

1. **Poco a poco**, desde la app, a medida que los vas necesitando. Los informes
   te avisan cuántas faltan.
2. **De una**, si tienes la lista del proveedor en Excel: se puede armar un
   `UPDATE` masivo en Supabase. Si quieres esa vía, pásame el archivo.

---

# Cambios — versión 1.4

## El botón "Abrir archivo" no hacía nada

**El problema:** el botón se construía así:

```js
onclick="Descargas.abrir(${JSON.stringify(res.uri)}, ...)"
```

`JSON.stringify` devuelve el texto **entre comillas dobles**, y el atributo `onclick`
también va entre comillas dobles. El navegador cerraba el atributo en la primera
comilla interna, así que el `onclick` real quedaba en `Descargas.abrir(` — código
incompleto que no ejecuta nada. Por eso el botón se veía bien y no respondía.

**La solución:** los archivos recién guardados quedan en una variable
(`_archivosDescargados`) y el botón solo pasa el índice: `_abrirDescargado(0)`.
Nada de URIs dentro del HTML.

El mismo error estaba en la lista de **asociar código de barras**: si un código traía
comillas, la fila no respondía al toque. También quedó corregido, con una función
`attr()` que escapa el texto.

## Si el celular no tiene con qué abrir el archivo

Antes fallaba en silencio. Ahora la app revisa si hay alguna app capaz de abrir ese
tipo de archivo:

- **Sí hay:** abre el selector "Abrir con", como siempre.
- **No hay:** te lleva a la pantalla de Descargas de Android y te avisa por qué.
- **Ni eso funciona:** mensaje claro diciendo que no tienes lector de PDF (o de Excel)
  y en qué carpeta quedó el archivo.

---

# Cambios — versión 1.5

## Dar de baja productos

En la ficha de cada producto, junto a **✏️ Editar**, hay ahora **🗑️ Dar de baja**,
que abre dos caminos distintos. La diferencia importa:

### Descontinuar (lo normal)

El producto sale del catálogo y de las sugerencias de compra, pero **conserva su
historial de movimientos, sus conteos y sus códigos de barras**. Es reversible.

Es lo que se necesita casi siempre: el proveedor dejó de traerlo, pero lo que salió
el año pasado sigue siendo cierto y hace falta para los informes.

- El catálogo los oculta, y aparece un chip **Descontinuados (n)** para verlos.
- En la lista salen tachados y con el ícono 📦.
- En la ficha aparece un aviso con el botón **Volver a activarlo**.
- **Siguen en el inventario exportado si todavía tienen existencias**, marcados como
  `(DESCONTINUADO)`. Esa mercancía sigue siendo del negocio y tiene que aparecer en el
  conteo físico.

### Eliminar definitivamente

Borra el producto, sus movimientos y sus códigos de barras. No se puede deshacer.
Es para productos creados por error, no para los que se dejaron de pedir.

Antes de borrar, la app muestra cuántas existencias, movimientos y códigos se van a
perder. Si el producto **tiene movimientos registrados**, exige escribir la referencia
exacta para confirmar. Si no tiene ninguno, basta con aceptar.

También avisa aparte si todavía quedan unidades en bodega, porque esas desaparecen
del inventario y del valor total.

## Bug encontrado de paso

`supabase.js` y `app.js` habían quedado los dos con una función llamada
`eliminarProducto`. Como los dos archivos comparten el ámbito global del navegador,
la segunda declaración pisaba a la primera y `window.SB.eliminarProducto` terminaba
llamándose a sí misma: recursión infinita y la app se congelaba al borrar. Se renombró
la de Supabase a `eliminarProductoSupabase`.

## Antes de instalar

Ejecuta de nuevo `supabase/migracion-costo.sql` en Supabase. Se le agregó al final la
columna `activo`. El archivo es seguro de correr varias veces: no borra nada.

---

# Cambios — versión 1.7.1

## El ícono de la app nunca se había reemplazado

Al revisar el proyecto a fondo, encontré que el ícono que aparece en el
celular y la pantalla de carga al abrir la app seguían siendo **la
plantilla por defecto de Capacitor** (una X azul genérica) — no el ícono
personalizado que se creía tener puesto. Pasaba inadvertido porque dentro
de la app todo el diseño sí está hecho a la medida; solo el ícono del
sistema operativo y el splash screen habían quedado sin tocar.

## Logo nuevo

Un disco de freno con caliper, en el amarillo y asfalto ya establecidos
en toda la aplicación. No usa las letras "FP" para no repetir lo que ya
tiene el turnero.

Se reemplazó en todos los lugares donde debía ir:
- Ícono adaptativo de Android (las 5 densidades, foreground + color de fondo)
- Ícono clásico y "round" (para launchers que no soportan ícono adaptativo)
- Splash screen, en las 11 combinaciones de densidad y orientación
- Íconos del manifest web (192px y 512px)

## Revisión de seguridad

Se encontró un archivo de migración viejo (`migracion-usuarios.sql`) que
creaba una tabla con contraseñas en texto plano y acceso público — pero
resultó ser código muerto: la app nunca llegó a usarlo. El sistema que sí
está en uso (`migracion-seguridad-perfiles.sql`, con autenticación real
de Supabase) es correcto y ya estaba bien implementado. Se eliminó el
archivo viejo del repositorio para que nadie lo corra por error más
adelante.

## Revisión de la sincronización entre dispositivos

La lógica que trae los movimientos de todas las bodegas y los mantiene
sincronizados en tiempo real quedó revisada y probada; no se encontraron
errores.
