-- ============================================================
-- MIGRACIÓN: agregar el precio de compra (costo)
--
-- Ejecuta esto en Supabase → SQL Editor → New query → Run.
-- NO borra nada. Solo agrega la columna nueva a la tabla que ya existe.
-- Es seguro ejecutarlo varias veces.
-- ============================================================

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS costo NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN productos.precio IS 'Precio de VENTA sin IVA (base gravable)';
COMMENT ON COLUMN productos.costo  IS 'Precio de COMPRA sin IVA (lo que se le paga al proveedor)';

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'productos'
ORDER BY ordinal_position;

-- ============================================================
-- MIGRACIÓN 2: productos descontinuados
-- Un producto que se deja de pedir se marca como inactivo en vez de
-- borrarse, para no perder el historial de movimientos.
-- ============================================================

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN productos.activo IS 'FALSE = descontinuado: ya no se pide, pero conserva historial';
