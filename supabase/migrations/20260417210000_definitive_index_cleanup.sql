-- =============================================================================
-- MIGRATION: 20260417210000_DEFINITIVE_INDEX_CLEANUP
-- GOAL: Total cleanup of indexing naming, duplicates, and missing FK coverage.
-- =============================================================================

-- 1. CLEANUP: REMOVING KNOWN REDUNDANT/DUPLICATE INDEXES
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_ahsp_lines_project;
DROP INDEX IF EXISTS public.idx_cco_project_id;
DROP INDEX IF EXISTS public.idx_mc_project_id;
DROP INDEX IF EXISTS public.idx_snapshots_line;

-- 2. ENFORCING GOLD STANDARD FK COVERAGE (ONE PER FK)
-- Format: idx_<table_name>_<column_name>
-- -----------------------------------------------------------------------------

-- [projects]
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects (user_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'created_by') THEN
        CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects (created_by);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'location_id') THEN
        CREATE INDEX IF NOT EXISTS idx_projects_location_id ON public.projects (location_id);
    END IF;
END $$;

-- [project_members]
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_members') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_members' AND column_name = 'project_id') THEN
            CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members (project_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_members' AND column_name = 'user_id') THEN
            CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members (user_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_members' AND column_name = 'assigned_by') THEN
            CREATE INDEX IF NOT EXISTS idx_project_members_assigned_by ON public.project_members (assigned_by);
        END IF;
    END IF;
END $$;

-- [ahsp_lines]
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ahsp_lines') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ahsp_lines' AND column_name = 'project_id') THEN
            CREATE INDEX IF NOT EXISTS idx_ahsp_lines_project_id ON public.ahsp_lines (project_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ahsp_lines' AND column_name = 'master_ahsp_id') THEN
            CREATE INDEX IF NOT EXISTS idx_ahsp_lines_master_ahsp_id ON public.ahsp_lines (master_ahsp_id);
        END IF;
    END IF;
END $$;

-- [daily_reports]
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'daily_reports') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'daily_reports' AND column_name = 'project_id') THEN
            CREATE INDEX IF NOT EXISTS idx_daily_reports_project_id ON public.daily_reports (project_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'daily_reports' AND column_name = 'user_id') THEN
            CREATE INDEX IF NOT EXISTS idx_daily_reports_user_id ON public.daily_reports (user_id);
        END IF;
    END IF;
END $$;

-- [daily_progress]
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'daily_progress') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'daily_progress' AND column_name = 'report_id') THEN
            CREATE INDEX IF NOT EXISTS idx_daily_progress_report_id ON public.daily_progress (report_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'daily_progress' AND column_name = 'ahsp_line_id') THEN
            CREATE INDEX IF NOT EXISTS idx_daily_progress_ahsp_line_id ON public.daily_progress (ahsp_line_id);
        END IF;
    END IF;
END $$;

-- [project_cco]
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_cco') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_cco' AND column_name = 'project_id') THEN
            CREATE INDEX IF NOT EXISTS idx_project_cco_project_id ON public.project_cco (project_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_cco' AND column_name = 'line_id') THEN
            CREATE INDEX IF NOT EXISTS idx_project_cco_line_id ON public.project_cco (line_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_cco' AND column_name = 'created_by') THEN
            CREATE INDEX IF NOT EXISTS idx_project_cco_created_by ON public.project_cco (created_by);
        END IF;
    END IF;
END $$;

-- [project_mc]
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_mc') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_mc' AND column_name = 'project_id') THEN
            CREATE INDEX IF NOT EXISTS idx_project_mc_project_id ON public.project_mc (project_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_mc' AND column_name = 'line_id') THEN
            CREATE INDEX IF NOT EXISTS idx_project_mc_line_id ON public.project_mc (line_id);
        END IF;
    END IF;
END $$;

-- [project_revisions]
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_revisions') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_revisions' AND column_name = 'project_id') THEN
            CREATE INDEX IF NOT EXISTS idx_project_revisions_project_id ON public.project_revisions (project_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_revisions' AND column_name = 'created_by') THEN
            CREATE INDEX IF NOT EXISTS idx_project_revisions_created_by ON public.project_revisions (created_by);
        END IF;
    END IF;
END $$;

-- [master_catalogs]
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'master_ahsp_details') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'master_ahsp_details' AND column_name = 'master_ahsp_id') THEN
            CREATE INDEX IF NOT EXISTS idx_master_ahsp_details_master_ahsp_id ON public.master_ahsp_details (master_ahsp_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'master_ahsp_details' AND column_name = 'item_id') THEN
            CREATE INDEX IF NOT EXISTS idx_master_ahsp_details_item_id ON public.master_ahsp_details (item_id);
        END IF;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'master_harga_dasar') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'master_harga_dasar' AND column_name = 'location_id') THEN
            CREATE INDEX IF NOT EXISTS idx_master_harga_dasar_location_id ON public.master_harga_dasar (location_id);
        END IF;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'master_konversi') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'master_konversi' AND column_name = 'item_dasar_id') THEN
            CREATE INDEX IF NOT EXISTS idx_master_konversi_item_dasar_id ON public.master_konversi (item_dasar_id);
        END IF;
    END IF;
END $$;

-- [ahsp_line_snapshots]
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ahsp_line_snapshots') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ahsp_line_snapshots' AND column_name = 'ahsp_line_id') THEN
            CREATE INDEX IF NOT EXISTS idx_ahsp_line_snapshots_ahsp_line_id ON public.ahsp_line_snapshots (ahsp_line_id);
        END IF;
    END IF;
END $$;

-- 3. FINAL SCHEMA RELOAD
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
