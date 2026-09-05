-- ============================================================
-- INVENTARIO FRENOS PALA — Migración: Auditoría de productos
-- Ejecuta esto en: SQL Editor → New query → Run
--
-- Este script es seguro para ejecutarse varias veces (idempotente).
-- Registra quién crea, edita, descontinúa o elimina un producto.
-- ============================================================

-- 1. Crear tabla de auditoría
CREATE TABLE IF NOT EXISTS audit_productos (
  id        UUID         NOT NULL DEFAULT gen_random_uuid(),
  ref       TEXT         NOT NULL,
  accion    TEXT         NOT NULL,
  usuario   TEXT,
  detalle   JSONB,
  fecha     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_productos_pkey PRIMARY KEY (id),
  CONSTRAINT audit_productos_accion CHECK (
    accion IN ('CREAR','EDITAR','DESCONTINUAR','REACTIVAR','ELIMINAR')
  )
);

CREATE INDEX IF NOT EXISTS idx_audit_ref   ON audit_productos (ref);
CREATE INDEX IF NOT EXISTS idx_audit_fecha ON audit_productos (fecha DESC);

-- 2. RLS (mismo patrón actual; se restringirá cuando se migre a Supabase Auth)
ALTER TABLE audit_productos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'audit_productos' AND policyname = 'audit_all'
  ) THEN
    CREATE POLICY "audit_all" ON audit_productos FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Verificación
SELECT 'audit_productos creada' AS resultado,
       (SELECT COUNT(*) FROM audit_productos) AS registros;
