# Guía de configuración — Inventario Frenos Pala

## Lo que hay que hacer (en orden)

---

## PASO 1 — Crear el proyecto en Supabase (5 minutos)

1. Ve a **https://supabase.com** y crea una cuenta gratuita
2. Clic en **"New project"**
   - Organization: tu nombre o Frenos Pala
   - Name: `inventario-frenospala`
   - Database Password: elige una contraseña segura y **guárdala**
   - Region: **South America (São Paulo)** — la más cercana a Colombia
3. Espera ~2 minutos a que el proyecto se cree
4. Ve a **Settings → API** (menú izquierdo)
5. Copia estos dos valores:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon public** key (empieza con `eyJhbG...`)

---

## PASO 2 — Crear las tablas en Supabase (2 minutos)

1. En tu proyecto de Supabase, ve a **SQL Editor** (menú izquierdo)
2. Clic en **"New query"**
3. Abre el archivo `supabase/schema.sql` de esta carpeta
4. Copia todo el contenido y pégalo en el editor de Supabase
5. Clic en **"Run"** (botón verde)
6. Deberías ver: `Success. No rows returned`
7. Ve a **Table Editor** — deberías ver las tablas `productos`, `movimientos` y `barras`

---

## PASO 3 — Configurar las credenciales en la app (1 minuto)

Abre el archivo `supabase.js` con el Bloc de Notas o cualquier editor y cambia:

```javascript
const SUPABASE_URL      = 'TU_URL_AQUI';   // ← pega tu Project URL aquí
const SUPABASE_ANON_KEY = 'TU_CLAVE_AQUI'; // ← pega tu anon key aquí
```

Por ejemplo:

```javascript
const SUPABASE_URL      = 'https://abcdefgh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6...';
```

Guarda el archivo.

---

## PASO 4A — Probar en el celular como PWA (más fácil, sin APK)

Esta opción es la más rápida y funciona perfectamente para el día a día.

1. Ve a **https://app.netlify.com/drop**
2. Arrastra **la carpeta completa** `inventario-frenospala` al recuadro
3. Netlify te da una dirección como `https://algo-123.netlify.app`
4. Ábrela en el celular con Chrome
5. Menú (tres puntos) → **"Añadir a pantalla de inicio"**
6. La app aparece como un ícono en el celular — **funciona sin APK**

✅ La cámara funciona porque es HTTPS  
✅ Los datos se sincronizan entre celulares  
✅ Funciona offline y sincroniza al volver la conexión  

---

## PASO 4B — Generar el APK (más complejo, opcional)

Esto te da un archivo `.apk` que puedes enviar por WhatsApp e instalar directamente.

### Requisitos previos
- [Node.js](https://nodejs.org) (versión 18 o superior)
- [Android Studio](https://developer.android.com/studio) (descarga gratuita, ~1 GB)

### Pasos

Abre PowerShell en la carpeta del proyecto:

```powershell
# 1. Instalar dependencias
npm install

# 2. Agregar la plataforma Android
npx cap add android

# 3. Copiar los archivos web al proyecto Android
npx cap sync android

# 4. Abrir en Android Studio
npx cap open android
```

En Android Studio:
1. Espera a que termine de indexar (barra de progreso abajo)
2. Menú **Build → Generate Signed App Bundle / APK**
3. Elige **APK**
4. Clic en **"Create new..."** para crear una keystore (guarda la contraseña)
5. Siguiente → **Build**
6. El APK queda en `android/app/release/app-release.apk`

### Instalar el APK en el celular
1. Pasa el APK por WhatsApp o cable USB
2. En el celular: Configuración → Seguridad → Permitir fuentes desconocidas
3. Abre el archivo `.apk` e instala

---

## ¿Qué hace cada archivo nuevo?

| Archivo | Para qué sirve |
|---|---|
| `supabase/schema.sql` | Crea las tablas en Supabase |
| `supabase.js` | Sincronización entre celulares |
| `package.json` | Dependencias para generar el APK |
| `capacitor.config.json` | Configuración del APK |

---

## Indicador de sincronización

En el header de la app, al lado del selector de bodega, hay un punto pequeño:

- 🟢 **Verde brillante** — sincronizado con la base de datos
- ⚪ **Gris** — sin internet (los movimientos se guardan local y se suben cuando vuelva)
- 🟡 **Amarillo parpadeando** — hay movimientos pendientes de subir
- ⬛ **Oscuro** — Supabase no está configurado (todavía funciona con localStorage)

---

## Si algo no funciona

**La app no abre / pantalla en blanco:**
- Abre la consola del navegador (F12 → Console) y busca errores en rojo

**Los datos no se sincronizan:**
- Verifica que el `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `supabase.js` sean correctos
- Verifica que en Supabase → Authentication → Policies, las políticas de RLS existan

**El APK no instala:**
- En Configuración del celular → Seguridad → activa "Fuentes desconocidas" o "Instalar apps desconocidas"
