-- =============================================================================
-- Migration: Audit Logs and Soft Delete
-- =============================================================================

-- 1. Add deleted_at to core tables
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_id UUID DEFAULT NULL;
ALTER TABLE public.ahsp_lines ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE public.ahsp_lines ADD COLUMN IF NOT EXISTS client_id UUID DEFAULT NULL;

-- 2. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.members(user_id),
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    entity_type TEXT NOT NULL, -- 'project', 'ahsp_line'
    entity_id UUID NOT NULL,
    data_before JSONB,
    data_after JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view audit logs for their projects"
    ON public.audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p 
            WHERE p.id = entity_id AND p.created_by = auth.uid()
        )
    );

-- 3. Function to log changes (Trigger compatible)
CREATE OR REPLACE FUNCTION public.log_entity_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, data_before)
        VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Only log if it's not a soft delete update
        IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
            INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, data_before)
            VALUES (auth.uid(), 'SOFT_DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
        ELSE
            INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, data_before, data_after)
            VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD), to_jsonb(NEW));
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, data_after)
        VALUES (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

-- Attach triggers
CREATE TRIGGER tr_audit_projects AFTER INSERT OR UPDATE OR DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.log_entity_changes();
CREATE TRIGGER tr_audit_ahsp_lines AFTER INSERT OR UPDATE OR DELETE ON public.ahsp_lines FOR EACH ROW EXECUTE FUNCTION public.log_entity_changes();

NOTIFY pgrst, 'reload schema';
