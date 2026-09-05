-- ============================================================
-- INVENTARIO FRENOS PALA — Migración de seguridad (versión 1.7)
--
-- Reemplaza el login con contraseñas en texto plano por
-- autenticación real de Supabase, y cierra el acceso público que
-- tenían las tablas del inventario.
--
-- IMPORTANTE — orden de ejecución:
--   1. Primero crea los 4 usuarios reales en:
--      Supabase → Authentication → Users → Add user
--      Correo:    <usuario>@frenospala.app   (ej. danieltove@frenospala.app)
--      Contraseña: una NUEVA para cada uno (las viejas quedaron expuestas
--                  en texto plano y no se deben reutilizar)
--      Auto Confirm User: SÍ (para que no pida verificar el correo)
--
--   2. Después corre TODO este script en SQL Editor → New query → Run.
--
--   3. Solo entonces instala el APK nuevo en los celulares.
--
-- Si instalas el APK nuevo antes del paso 1, el login no va a
-- funcionar todavía porque los usuarios de autenticación no existen.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA DE PERFILES — directorio público de nombres, SIN
--    contraseñas. Vincula cada usuario de autenticación con su
--    nombre para mostrar y con su rol.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfiles (
  id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  usuario TEXT UNIQUE NOT NULL,   -- el nombre corto con el que inicia sesión
  nombre  TEXT NOT NULL,          -- el nombre que se muestra en la app
  rol     TEXT NOT NULL DEFAULT 'operario',
  activo  BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "perfiles_lectura_publica" ON perfiles;

-- Cualquiera puede LEER el directorio (solo nombres, nada sensible;
-- así el login puede sugerir el usuario mientras se escribe). Nadie
-- puede escribir desde la app: los perfiles se administran aquí, en
-- el SQL Editor.
CREATE POLICY "perfiles_lectura_publica" ON perfiles
  FOR SELECT TO anon, authenticated USING (true);

-- ------------------------------------------------------------
-- 2. VINCULAR LOS 4 PERFILES A SUS USUARIOS DE AUTENTICACIÓN
--
-- Este paso falla si todavía no creaste los usuarios en
-- Authentication → Users (ver arriba). El correo debe coincidir
-- EXACTAMENTE con el que usaste al crearlos.
-- ------------------------------------------------------------
INSERT INTO perfiles (id, usuario, nombre, rol)
SELECT id, 'juansaenz0105', 'Juan Saenz', 'admin'
FROM auth.users WHERE email = 'juansaenz0105@frenospala.app'
ON CONFLICT (id) DO UPDATE SET usuario = EXCLUDED.usuario, nombre = EXCLUDED.nombre, rol = EXCLUDED.rol;

INSERT INTO perfiles (id, usuario, nombre, rol)
SELECT id, 'danieltove', 'Daniel', 'operario'
FROM auth.users WHERE email = 'danieltove@frenospala.app'
ON CONFLICT (id) DO UPDATE SET usuario = EXCLUDED.usuario, nombre = EXCLUDED.nombre, rol = EXCLUDED.rol;

INSERT INTO perfiles (id, usuario, nombre, rol)
SELECT id, 'marcel', 'Marcel', 'operario'
FROM auth.users WHERE email = 'marcel@frenospala.app'
ON CONFLICT (id) DO UPDATE SET usuario = EXCLUDED.usuario, nombre = EXCLUDED.nombre, rol = EXCLUDED.rol;

INSERT INTO perfiles (id, usuario, nombre, rol)
SELECT id, 'carlos', 'Carlos', 'operario'
FROM auth.users WHERE email = 'carlos@frenospala.app'
ON CONFLICT (id) DO UPDATE SET usuario = EXCLUDED.usuario, nombre = EXCLUDED.nombre, rol = EXCLUDED.rol;

-- Si alguna de las 4 filas no aparece en el SELECT de verificación
-- del final, es porque ese usuario todavía no existe en
-- Authentication → Users con ese correo exacto.

-- ------------------------------------------------------------
-- 3. BORRAR LA TABLA INSEGURA — tenía las contraseñas en texto
--    plano y estaba abierta al público.
-- ------------------------------------------------------------
DROP TABLE IF EXISTS usuarios CASCADE;

-- ------------------------------------------------------------
-- 4. REGISTRO DE ACTIVIDAD — quién crea, edita o da de baja un
--    producto (los movimientos de stock ya tenían su columna
--    'usuario'; esto es aparte, para las demás acciones).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario TEXT NOT NULL,
  accion  TEXT NOT NULL,
  detalle TEXT NOT NULL DEFAULT '',
  fecha   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auditoria_personal" ON auditoria;
CREATE POLICY "auditoria_personal" ON auditoria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON auditoria FROM anon;
GRANT SELECT, INSERT ON auditoria TO authenticated;

-- ------------------------------------------------------------
-- 5. CERRAR EL ACCESO PÚBLICO A LAS TABLAS DEL INVENTARIO
--
-- Hasta ahora "anon" podía leer y escribir productos, movimientos
-- y barras directamente — incluido el precio de compra. Eso es lo
-- que hacía posible que la clave pública (la misma que está en el
-- repositorio y dentro del APK) sirviera para ver todo desde
-- afuera de la app. De aquí en adelante, solo el personal que
-- inició sesión puede leer o escribir esas tablas.
-- ------------------------------------------------------------
REVOKE ALL ON productos    FROM anon;
REVOKE ALL ON movimientos  FROM anon;
REVOKE ALL ON barras       FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON productos    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON movimientos  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON barras       TO authenticated;

ALTER TABLE productos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE barras       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_all"               ON productos;
DROP POLICY IF EXISTS "acceso_publico_productos"   ON productos;
DROP POLICY IF EXISTS "Enable all for anon"        ON productos;
DROP POLICY IF EXISTS "acceso_publico_movimientos" ON movimientos;
DROP POLICY IF EXISTS "Enable all for anon"        ON movimientos;
DROP POLICY IF EXISTS "acceso_publico_barras"      ON barras;
DROP POLICY IF EXISTS "Enable all for anon"        ON barras;

CREATE POLICY "solo_personal_productos" ON productos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "solo_personal_movimientos" ON movimientos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "solo_personal_barras" ON barras
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 6. VISTA PÚBLICA PARA UN FUTURO CATÁLOGO EN LÍNEA
--
-- Si más adelante publicas una página de solo consulta para
-- clientes, esta vista es la única que "anon" podrá leer: nunca
-- expone el precio de compra ni el stock exacto.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW catalogo_publico AS
SELECT
  ref, nombre, cat, marca,
  ROUND(precio * 1.19) AS precio_con_iva,
  CASE
    WHEN stock IS NULL THEN 'consultar'
    WHEN stock <= 0     THEN 'agotado'
    WHEN stock <= 3      THEN 'ultimas'
    ELSE                      'disponible'
  END AS disponibilidad
FROM productos
WHERE activo IS NOT FALSE AND precio > 0;

GRANT SELECT ON catalogo_publico TO anon;

-- ------------------------------------------------------------
-- 7. VERIFICACIÓN
-- ------------------------------------------------------------
SELECT usuario, nombre, rol, activo FROM perfiles ORDER BY usuario;
-- Deben salir las 4 filas. Si falta alguna, revisa el paso 1.
