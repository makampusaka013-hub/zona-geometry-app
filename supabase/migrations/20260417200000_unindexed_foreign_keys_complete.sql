-- =============================================================================
-- MIGRATION: 20260417200000_UNINDEXED_FOREIGN_KEYS_COMPLETE
-- GOAL: Resolve 100% of remaining FK audit warnings for production stability.
-- =============================================================================

-- 1. TRANSACTIONAL & MONITORING TABLES
-- -----------------------------------------------------------------------------

-- daily_reports: missing user_id
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'daily_reports' AND column_name = 'user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_daily_reports_user_id ON public.daily_reports (user_id);
    END IF;
END $$;

-- daily_progress: missing ahsp_line_id
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'daily_progress' AND column_name = 'ahsp_line_id') THEN
        CREATE INDEX IF NOT EXISTS idx_daily_progress_ahsp_line_id ON public.daily_progress (ahsp_line_id);
    END IF;
END $$;

-- project_cco: missing project_id
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_cco' AND column_name = 'project_id') THEN
        -- Cleanup redundant old index name if exists
        DROP INDEX IF EXISTS public.idx_cco_project_id;
        CREATE INDEX IF NOT EXISTS idx_project_cco_project_id ON public.project_cco (project_id);
    END IF;
END $$;

-- project_members: missing project_id and user_id
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_members' AND column_name = 'project_id') THEN
        CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members (project_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_members' AND column_name = 'user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members (user_id);
    END IF;
END $$;

-- project_revisions: missing project_id (handled with safety check)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_revisions') THEN
        CREATE INDEX IF NOT EXISTS idx_project_revisions_project_id ON public.project_revisions (project_id);
    END IF;
END $$;


-- 2. MASTER & REFERENCE TABLES
-- -----------------------------------------------------------------------------

-- master_ahsp_details: missing master_ahsp_id and item_id
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'master_ahsp_details') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'master_ahsp_details' AND column_name = 'master_ahsp_id') THEN
            CREATE INDEX IF NOT EXISTS idx_master_ahsp_details_ahsp_id ON public.master_ahsp_details (master_ahsp_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'master_ahsp_details' AND column_name = 'item_id') THEN
            CREATE INDEX IF NOT EXISTS idx_master_ahsp_details_item_id ON public.master_ahsp_details (item_id);
        END IF;
    END IF;
END $$;

-- master_harga_custom: (skipped if column user_id missing, verified missing)
-- master_harga_dasar: missing location_id
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'master_harga_dasar' AND column_name = 'location_id') THEN
        CREATE INDEX IF NOT EXISTS idx_master_harga_dasar_location_id ON public.master_harga_dasar (location_id);
    END IF;
END $$;

-- master_konversi: missing item_dasar_id
CREATE INDEX IF NOT EXISTS idx_master_konversi_item_dasar_id 
    ON public.master_konversi (item_dasar_id);

-- manpower_analysis: safety fallback (indexed broadly if exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'manpower_analysis') THEN
        -- Standard master reference patterns
        PERFORM NULL FROM pg_attribute WHERE attrelid = 'public.manpower_analysis'::regclass AND attname = 'project_id';
        IF FOUND THEN CREATE INDEX IF NOT EXISTS idx_manpower_analysis_project_id ON public.manpower_analysis (project_id); END IF;
    END IF;
END $$;


-- 3. FINAL SCHEMA RELOAD
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
