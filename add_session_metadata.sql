-- ============================================================================
-- Agregar nombre de cliente y número de personas a table_sessions
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================

ALTER TABLE public.table_sessions
    ADD COLUMN IF NOT EXISTS client_name TEXT,
    ADD COLUMN IF NOT EXISTS guest_count INTEGER DEFAULT 0;
