-- =================================================================================
-- PREPARATIVOS PARA LA NUEVA BASE DE DATOS Y ESTACIÓN MAESTRA (TASAS AL DIA 2.0)
-- =================================================================================
-- Ejecuta este script SQL en tu NUEVA base de datos de Supabase en el panel "SQL Editor".
-- Así quedará todo preparado para el registro de correos, licenciamiento y acceso
-- desde la futura Estación Maestra.

-- 1. Tabla: cloud_backups -> (Almacena los respaldos en vivo del usuario)
CREATE TABLE IF NOT EXISTS public.cloud_backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    backup_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Si la tabla cloud_backups ya existía, añadir índices útiles (Opcional)
-- CREATE INDEX IF NOT EXISTS idx_cloud_backups_email ON public.cloud_backups(email);

-- 2. Tabla: cloud_licenses -> (Para manejar Licencia Permanente y Por Días desde la Estación Maestra)
CREATE TABLE IF NOT EXISTS public.cloud_licenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL, -- El correo asocia a la persona con su licencia
    device_id TEXT NOT NULL, 
    license_type TEXT NOT NULL DEFAULT 'trial', -- Valores: 'trial', 'days', 'permanent'
    days_remaining INTEGER DEFAULT 15,
    business_name TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Habilitar Seguridad Básica (Row Level Security - RLS)
-- Opcional según cómo gestiones la seguridad. 
-- Si prefieres leerlo directo, puedes desactivarlo o dejarlo así para empezar.
ALTER TABLE public.cloud_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_licenses ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas iniciales (Para la etapa de desarrollo/migración de la app local a la nube)
-- **OJO**: En el futuro podemos limitar esto a "apenas el usuario autenticado (auth.uid())"
DROP POLICY IF EXISTS "Permitir todo a cloud_backups" ON public.cloud_backups;
CREATE POLICY "Permitir todo a cloud_backups" ON public.cloud_backups FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo a cloud_licenses" ON public.cloud_licenses;
CREATE POLICY "Permitir todo a cloud_licenses" ON public.cloud_licenses FOR ALL USING (true) WITH CHECK (true);

-- =================================================================================
-- RECORDATORIOS IMPORTANTES PARA SUPABASE DASHBOARD:
-- 1. Ve a "Authentication" -> "Providers" -> Activa "Email".
-- 2. Asegúrate de habilitar "Confirm Email" / "Email Verification".
-- 3. Ajusta los "Redirect URLs" (Settings -> Auth -> URL Configuration) 
--    Agrega todas las direcciones desde las que se usará la app. Por ejemplo:
--      http://localhost:5173/*       (Para pruebas locales)
--      https://tu-app.vercel.app/*   (Para la app final en Vercel)
--    Supabase solo permitirá redireccionar a los dominios listados ahí.
-- =================================================================================
