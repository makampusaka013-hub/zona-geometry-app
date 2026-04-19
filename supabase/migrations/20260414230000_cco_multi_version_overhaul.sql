-- 1) Update ahsp_lines to support items added during CCO
ALTER TABLE public.ahsp_lines ADD COLUMN IF NOT EXISTS is_additional BOOLEAN DEFAULT false;

-- 2) Overhaul project_cco table structure
-- Remove old unique constraint to allow multiple versions for the same line
ALTER TABLE public.project_cco DROP CONSTRAINT IF EXISTS project_cco_project_id_line_id_key;

-- Add new columns
ALTER TABLE public.project_cco ADD COLUMN IF NOT EXISTS price_orig NUMERIC DEFAULT 0;
ALTER TABLE public.project_cco ADD COLUMN IF NOT EXISTS price_cco NUMERIC DEFAULT 0;
ALTER TABLE public.project_cco ADD COLUMN IF NOT EXISTS jumlah_cco NUMERIC DEFAULT 0;
ALTER TABLE public.project_cco ADD COLUMN IF NOT EXISTS is_new_item BOOLEAN DEFAULT false;
ALTER TABLE public.project_cco ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.members(user_id) ON DELETE SET NULL;
ALTER TABLE public.project_cco ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'; -- 'draft', 'approved'
ALTER TABLE public.project_cco ADD COLUMN IF NOT EXISTS cco_type TEXT NOT NULL DEFAULT 'CCO-1';

-- New unique constraint including cco_type (version)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_cco_project_version_line_unique') THEN
        ALTER TABLE public.project_cco ADD CONSTRAINT project_cco_project_version_line_unique UNIQUE (project_id, cco_type, line_id);
    END IF;
END $$;

-- 3) Create a function to fetch the "Active/Latest Approved" budget for a project
-- This will be used by the Dashboard and S-Curve
CREATE OR REPLACE FUNCTION public.get_effective_project_budget(p_project_id UUID)
RETURNS TABLE (
    line_id UUID,
    uraian TEXT,
    satuan TEXT,
    volume NUMERIC,
    harga_satuan NUMERIC,
    jumlah NUMERIC,
    is_cco BOOLEAN,
    cco_version TEXT
) 
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_latest_cco_type TEXT;
BEGIN
    -- Find the latest approved version name (e.g. CCO-2 is higher than CCO-1)
    SELECT cco_type INTO v_latest_cco_type
    FROM public.project_cco
    WHERE project_id = p_project_id AND status = 'approved'
    ORDER BY cco_type DESC
    LIMIT 1;

    IF v_latest_cco_type IS NOT NULL THEN
        -- Return merged data: prioritize CCO values if they exist, fallback to ahsp_lines
        RETURN QUERY
        SELECT 
            al.id as line_id,
            COALESCE(al.uraian_custom, al.uraian) as uraian,
            al.satuan,
            COALESCE(c.volume_cco, al.volume) as volume,
            COALESCE(c.price_cco, al.harga_satuan) as harga_satuan,
            COALESCE(c.jumlah_cco, al.jumlah) as jumlah,
            (c.id IS NOT NULL) as is_cco,
            v_latest_cco_type as cco_version
        FROM public.ahsp_lines al
        LEFT JOIN public.project_cco c ON c.line_id = al.id AND c.cco_type = v_latest_cco_type AND c.status = 'approved'
        WHERE al.project_id = p_project_id;
    ELSE
        -- No approved CCO, return original contract
        RETURN QUERY
        SELECT 
            al.id as line_id,
            COALESCE(al.uraian_custom, al.uraian) as uraian,
            al.satuan,
            al.volume,
            al.harga_satuan,
            al.jumlah,
            false as is_cco,
            NULL::TEXT as cco_version
        FROM public.ahsp_lines al
        WHERE al.project_id = p_project_id;
    END IF;
END;
$$;

-- 4) Trigger for automatic total calculation in project_cco rows
CREATE OR REPLACE FUNCTION public.calculate_cco_jumlah()
RETURNS TRIGGER AS $$
BEGIN
    NEW.jumlah_cco := COALESCE(NEW.volume_cco, 0) * COALESCE(NEW.price_cco, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_cco_jumlah ON public.project_cco;
CREATE TRIGGER trg_calculate_cco_jumlah
    BEFORE INSERT OR UPDATE ON public.project_cco
    FOR EACH ROW EXECUTE FUNCTION public.calculate_cco_jumlah();

-- 5) Notification for schema reload
NOTIFY pgrst, 'reload schema';
