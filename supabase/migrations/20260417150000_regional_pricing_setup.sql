-- =============================================================================
-- MIGRATION: 20260417150000_REGIONAL_PRICING_SETUP
-- GOAL: Introduce multi-regional master price lists
-- =============================================================================

-- 1. CREATE LOCATIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Initial Location
INSERT INTO public.locations (name) VALUES ('Kota Kotamobagu') ON CONFLICT (name) DO NOTHING;

-- 2. UPDATE MEMBERS (Profile Context)
-- -----------------------------------------------------------------------------
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS selected_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

-- Set default browsing context to Kotamobagu for everyone
UPDATE public.members 
SET selected_location_id = (SELECT id FROM public.locations WHERE name = 'Kota Kotamobagu')
WHERE selected_location_id IS NULL;

-- 3. UPDATE MASTER_HARGA_DASAR
-- -----------------------------------------------------------------------------
ALTER TABLE public.master_harga_dasar ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE;

-- Migrate existing data to Kotamobagu
UPDATE public.master_harga_dasar
SET location_id = (SELECT id FROM public.locations WHERE name = 'Kota Kotamobagu')
WHERE location_id IS NULL;

-- Make location_id NOT NULL after migration
ALTER TABLE public.master_harga_dasar ALTER COLUMN location_id SET NOT NULL;

-- Adjust Unique Constraint: kode_item must now be unique PER LOCATION
ALTER TABLE public.master_harga_dasar DROP CONSTRAINT IF EXISTS master_harga_dasar_kode_item_key;
ALTER TABLE public.master_harga_dasar DROP CONSTRAINT IF EXISTS master_harga_dasar_kode_location_key;
ALTER TABLE public.master_harga_dasar ADD CONSTRAINT master_harga_dasar_kode_location_key UNIQUE (kode_item, location_id);

-- 4. UPDATE PROJECTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

-- Migrate existing projects to Kotamobagu
UPDATE public.projects
SET location_id = (SELECT id FROM public.locations WHERE name = 'Kota Kotamobagu')
WHERE location_id IS NULL;

-- 5. UPDATE RLS FOR LOCATIONS
-- -----------------------------------------------------------------------------
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locations_select_v1" ON public.locations;
CREATE POLICY "locations_select_v1" ON public.locations
    FOR SELECT TO authenticated USING ( true );

DROP POLICY IF EXISTS "locations_manage_v1" ON public.locations;
CREATE POLICY "locations_manage_v1" ON public.locations
    FOR INSERT, UPDATE, DELETE TO authenticated
    USING ( (SELECT public.is_app_admin()) )
    WITH CHECK ( (SELECT public.is_app_admin()) );

-- 6. RELOAD SCHEMA
NOTIFY pgrst, 'reload schema';
