-- CCO (Contract Change Order)
CREATE TABLE IF NOT EXISTS public.project_cco (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    line_id UUID REFERENCES public.ahsp_lines(id) ON DELETE CASCADE,
    volume_orig NUMERIC NOT NULL DEFAULT 0,
    volume_cco NUMERIC NOT NULL DEFAULT 0,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, line_id)
);

-- MC (Mutual Check)
CREATE TABLE IF NOT EXISTS public.project_mc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    line_id UUID REFERENCES public.ahsp_lines(id) ON DELETE CASCADE,
    mc_type TEXT NOT NULL, -- 'MC-0', 'MC-100'
    volume_mc NUMERIC NOT NULL DEFAULT 0,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, line_id, mc_type)
);

-- RLS (Enable Security)
ALTER TABLE public.project_cco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_mc ENABLE ROW LEVEL SECURITY;

-- Simple RLS Policies (Assuming owner access via project_id)
CREATE POLICY "Project owners can manage CCO" ON public.project_cco
    FOR ALL USING (EXISTS (SELECT 1 FROM public.projects WHERE id = project_cco.project_id AND user_id = auth.uid()));

CREATE POLICY "Project owners can manage MC" ON public.project_mc
    FOR ALL USING (EXISTS (SELECT 1 FROM public.projects WHERE id = project_mc.project_id AND user_id = auth.uid()));

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_cco_project_id ON public.project_cco(project_id);
CREATE INDEX IF NOT EXISTS idx_mc_project_id ON public.project_mc(project_id);
