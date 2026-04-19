-- Create Backup Volume Table
CREATE TABLE IF NOT EXISTS public.project_backup_volume (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    line_id UUID REFERENCES public.ahsp_lines(id) ON DELETE CASCADE,
    uraian TEXT NOT NULL DEFAULT 'Penampang 1',
    p NUMERIC DEFAULT 1,
    l NUMERIC DEFAULT 1,
    t NUMERIC DEFAULT 1,
    qty NUMERIC DEFAULT 1,
    konversi NUMERIC DEFAULT 1,
    satuan TEXT,
    total NUMERIC DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_backup_volume_line ON public.project_backup_volume(line_id);
CREATE INDEX IF NOT EXISTS idx_backup_volume_project ON public.project_backup_volume(project_id);

-- Trigger to calculate total automatically
CREATE OR REPLACE FUNCTION public.calculate_backup_total()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total := COALESCE(NEW.p, 1) * COALESCE(NEW.l, 1) * COALESCE(NEW.t, 1) * COALESCE(NEW.qty, 1) * COALESCE(NEW.konversi, 1);
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_backup_total ON public.project_backup_volume;
CREATE TRIGGER trg_calculate_backup_total
    BEFORE INSERT OR UPDATE ON public.project_backup_volume
    FOR EACH ROW EXECUTE FUNCTION public.calculate_backup_total();

-- Enable RLS
ALTER TABLE public.project_backup_volume ENABLE ROW LEVEL SECURITY;

-- Simple Policy: Anyone who can see the project can see the backup
DROP POLICY IF EXISTS "Users can view backup volumes of their projects" ON public.project_backup_volume;
CREATE POLICY "Users can view backup volumes of their projects"
    ON public.project_backup_volume FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            LEFT JOIN public.project_members pm ON p.id = pm.project_id
            WHERE p.id = project_backup_volume.project_id
            AND (p.created_by = auth.uid() OR pm.user_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can manage backup volumes of their projects" ON public.project_backup_volume;
CREATE POLICY "Users can manage backup volumes of their projects"
    ON public.project_backup_volume FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            LEFT JOIN public.project_members pm ON p.id = pm.project_id
            WHERE p.id = project_backup_volume.project_id
            AND (p.created_by = auth.uid() OR pm.user_id = auth.uid())
        )
    );

NOTIFY pgrst, 'reload schema';
