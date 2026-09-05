-- ============================================================
-- INVENTARIO FRENOS PALA — Migración versión 1.6 (Usuarios)
-- Ejecuta todo esto en: SQL Editor → New query → Run
--
-- Este script es seguro para ejecutarse varias veces (idempotente).
-- Por favor, personaliza los nombres y PINs después de ejecutarlo.
-- Ejecutar en Supabase SQL Editor antes de instalar el nuevo APK.
-- ============================================================

-- 1. Crear tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id       TEXT PRIMARY KEY,
  nombre   TEXT NOT NULL,
  pin      TEXT NOT NULL,
  rol      TEXT NOT NULL DEFAULT 'operario',
  activo   BOOLEAN NOT NULL DEFAULT TRUE
);

-- RLS policy (mismo patrón de acceso abierto que otras tablas)
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuarios_all" ON usuarios FOR ALL TO anon USING (true) WITH CHECK (true);

-- 2. Agregar columna usuario a la tabla movimientos
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS usuario TEXT;

-- 3. Insertar (o actualizar) los usuarios reales del taller
INSERT INTO usuarios (id, nombre, pin, rol) VALUES
('JuanSaenz0105', 'Juan Saenz', '1033178313Js*',  'admin'),
('Danieltove',    'Daniel',     'arkno13.',       'operario'),
('Marcel',        'Marcel',     'Marcel18546600', 'operario'),
('Carlos',        'Carlos',     'CarlosTorres123','operario')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  pin    = EXCLUDED.pin,
  rol    = EXCLUDED.rol,
  activo = TRUE;
