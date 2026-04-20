-- ============================================================
-- Migration: DEFINITIVE Policy Cleanup
-- Date: 2026-04-20
-- Strategy: Drop EVERY known policy variant by name across all
--           tables, then recreate clean, idempotent policies.
-- ============================================================


-- ============================================================
-- SUPPORT_TICKETS — drop semua varian lama & baru
-- ============================================================
DROP POLICY IF EXISTS "Users can insert their own tickets"    ON public.support_tickets;
DROP POLICY IF EXISTS "Users can view their own tickets"      ON public.support_tickets;
DROP POLICY IF EXISTS "Admins can manage all tickets"         ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_select"                ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_insert"                ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_admin"                 ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_own_select"            ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_own_insert"            ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_admin_all"             ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_update_admin"          ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_delete_admin"          ON public.support_tickets;

-- Kebijakan Gabungan (User + Admin) untuk SELECT dan INSERT
-- agar hanya ada SATU kebijakan permissive per operasi
CREATE POLICY "support_tickets_select" ON public.support_tickets
    FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        OR EXISTS (
            SELECT 1 FROM public.members
            WHERE members.user_id = (SELECT auth.uid())
            AND members.role = 'admin'
        )
    );

CREATE POLICY "support_tickets_insert" ON public.support_tickets
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        OR EXISTS (
            SELECT 1 FROM public.members
            WHERE members.user_id = (SELECT auth.uid())
            AND members.role = 'admin'
        )
    );

-- Kebijakan khusus Admin untuk UPDATE dan DELETE
CREATE POLICY "support_tickets_update_admin" ON public.support_tickets
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.members
            WHERE members.user_id = (SELECT auth.uid())
            AND members.role = 'admin'
        )
    );

CREATE POLICY "support_tickets_delete_admin" ON public.support_tickets
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.members
            WHERE members.user_id = (SELECT auth.uid())
            AND members.role = 'admin'
        )
    );


-- ============================================================
-- MASTER_AHSP — drop semua varian
-- ============================================================
DROP POLICY IF EXISTS "master_ahsp_public_read"                     ON public.master_ahsp;
DROP POLICY IF EXISTS "master_ahsp_select"                          ON public.master_ahsp;
DROP POLICY IF EXISTS "Allow authenticated users to read master_ahsp" ON public.master_ahsp;
DROP POLICY IF EXISTS "Public read master_ahsp"                     ON public.master_ahsp;
DROP POLICY IF EXISTS "Allow public read"                           ON public.master_ahsp;
DROP POLICY IF EXISTS "Authenticated read"                          ON public.master_ahsp;
DROP POLICY IF EXISTS "master_ahsp_authenticated_read"              ON public.master_ahsp;
DROP POLICY IF EXISTS "master_ahsp_anon_read"                       ON public.master_ahsp;
DROP POLICY IF EXISTS "Public Read Access for master_ahsp"          ON public.master_ahsp;
DROP POLICY IF EXISTS "master_ahsp_select_v2"                       ON public.master_ahsp;
DROP POLICY IF EXISTS "master_ahsp_select_vFinal"                   ON public.master_ahsp;
DROP POLICY IF EXISTS "master_ahsp_read_all"                        ON public.master_ahsp;

CREATE POLICY "master_ahsp_read_all" ON public.master_ahsp
    FOR SELECT USING (true);


-- ============================================================
-- MASTER_AHSP_DETAILS — drop semua varian
-- ============================================================
DROP POLICY IF EXISTS "master_ahsp_details_public_read"                           ON public.master_ahsp_details;
DROP POLICY IF EXISTS "master_ahsp_details_select"                                ON public.master_ahsp_details;
DROP POLICY IF EXISTS "Allow authenticated users to read master_ahsp_details"     ON public.master_ahsp_details;
DROP POLICY IF EXISTS "Public read master_ahsp_details"                           ON public.master_ahsp_details;
DROP POLICY IF EXISTS "master_ahsp_details_authenticated_read"                    ON public.master_ahsp_details;
DROP POLICY IF EXISTS "master_ahsp_details_anon_read"                             ON public.master_ahsp_details;
DROP POLICY IF EXISTS "Public Read Access for master_ahsp_details"                ON public.master_ahsp_details;
DROP POLICY IF EXISTS "master_ahsp_details_select_v3"                             ON public.master_ahsp_details;
DROP POLICY IF EXISTS "master_ahsp_details_select_vFinal"                         ON public.master_ahsp_details;
DROP POLICY IF EXISTS "master_ahsp_details_read_all"                              ON public.master_ahsp_details;

CREATE POLICY "master_ahsp_details_read_all" ON public.master_ahsp_details
    FOR SELECT USING (true);


-- ============================================================
-- MASTER_HARGA_DASAR — drop semua varian
-- ============================================================
DROP POLICY IF EXISTS "master_harga_dasar_public_read"                          ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_select"                               ON public.master_harga_dasar;
DROP POLICY IF EXISTS "Allow authenticated users to read master_harga_dasar"    ON public.master_harga_dasar;
DROP POLICY IF EXISTS "Public read master_harga_dasar"                          ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_authenticated_read"                   ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_anon_read"                            ON public.master_harga_dasar;
DROP POLICY IF EXISTS "Public Read Access for master_harga_dasar"               ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_select_v3"                            ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_select_vFinal"                        ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_insert_admin_vFinal"                  ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_update_admin_vFinal"                  ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_delete_admin_vFinal"                  ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_insert_v3"                            ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_update_v3"                            ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_delete_v3"                            ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_read_all"                             ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_write_admin"                          ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_insert_admin"                         ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_update_admin"                         ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_delete_admin"                         ON public.master_harga_dasar;

-- Kebijakan bersih: anon & authenticated bisa SELECT
-- hanya admin yang bisa INSERT/UPDATE/DELETE
CREATE POLICY "master_harga_dasar_read_all" ON public.master_harga_dasar
    FOR SELECT USING (true);

-- Gunakan FOR INSERT, UPDATE, DELETE (bukan ALL) agar tidak bertabrakan dengan SELECT
CREATE POLICY "master_harga_dasar_write_admin" ON public.master_harga_dasar
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.members WHERE user_id = (SELECT auth.uid()) AND role = 'admin')
    );

CREATE POLICY "master_harga_dasar_update_admin" ON public.master_harga_dasar
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.members WHERE user_id = (SELECT auth.uid()) AND role = 'admin')
    );

CREATE POLICY "master_harga_dasar_delete_admin" ON public.master_harga_dasar
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.members WHERE user_id = (SELECT auth.uid()) AND role = 'admin')
    );


-- ============================================================
-- ACTIVE_SESSIONS — drop semua varian
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own sessions"    ON public.active_sessions;
DROP POLICY IF EXISTS "sessions_own_select"              ON public.active_sessions;
DROP POLICY IF EXISTS "sessions_own_insert"              ON public.active_sessions;
DROP POLICY IF EXISTS "sessions_own_update"              ON public.active_sessions;
DROP POLICY IF EXISTS "sessions_own_delete"              ON public.active_sessions;
DROP POLICY IF EXISTS "active_sessions_manage_v1"        ON public.active_sessions;
DROP POLICY IF EXISTS "active_sessions_manage_v2"        ON public.active_sessions;

CREATE POLICY "active_sessions_manage_v2" ON public.active_sessions
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);


-- ============================================================
-- DAILY_REPORTS — drop semua varian
-- ============================================================
DROP POLICY IF EXISTS "daily_reports_select"            ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_insert"            ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_update"            ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_delete"            ON public.daily_reports;
DROP POLICY IF EXISTS daily_reports_select_if_readable  ON public.daily_reports;
DROP POLICY IF EXISTS daily_reports_insert_if_writable  ON public.daily_reports;

CREATE POLICY "daily_reports_select" ON public.daily_reports
    FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = created_by
        OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = daily_reports.project_id
            AND pm.user_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = daily_reports.project_id
            AND p.created_by = (SELECT auth.uid())
        )
    );

CREATE POLICY "daily_reports_insert" ON public.daily_reports
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = created_by);

CREATE POLICY "daily_reports_update" ON public.daily_reports
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = created_by);

CREATE POLICY "daily_reports_delete" ON public.daily_reports
    FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = created_by);


-- ============================================================
-- DAILY_PROGRESS — drop semua varian
-- ============================================================
DROP POLICY IF EXISTS "daily_progress_select"               ON public.daily_progress;
DROP POLICY IF EXISTS "daily_progress_insert"               ON public.daily_progress;
DROP POLICY IF EXISTS "daily_progress_delete"               ON public.daily_progress;
DROP POLICY IF EXISTS daily_progress_select_if_readable     ON public.daily_progress;
DROP POLICY IF EXISTS daily_progress_insert_if_writable     ON public.daily_progress;

CREATE POLICY "daily_progress_select" ON public.daily_progress
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.daily_reports dr
            WHERE dr.id = daily_progress.report_id
            AND (
                dr.created_by = (SELECT auth.uid())
                OR EXISTS (
                    SELECT 1 FROM public.project_members pm
                    WHERE pm.project_id = dr.project_id
                    AND pm.user_id = (SELECT auth.uid())
                )
            )
        )
    );

CREATE POLICY "daily_progress_insert" ON public.daily_progress
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.daily_reports dr
            WHERE dr.id = daily_progress.report_id
            AND dr.created_by = (SELECT auth.uid())
        )
    );

CREATE POLICY "daily_progress_delete" ON public.daily_progress
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.daily_reports dr
            WHERE dr.id = daily_progress.report_id
            AND dr.created_by = (SELECT auth.uid())
        )
    );


-- ============================================================
-- PROJECT_PHOTOS — drop semua varian
-- ============================================================
DROP POLICY IF EXISTS "project_photos_select"            ON public.project_photos;
DROP POLICY IF EXISTS "project_photos_insert"            ON public.project_photos;
DROP POLICY IF EXISTS "project_photos_delete"            ON public.project_photos;
DROP POLICY IF EXISTS "project_photos_select_if_readable" ON public.project_photos;
DROP POLICY IF EXISTS "project_photos_insert_if_writable" ON public.project_photos;

CREATE POLICY "project_photos_select" ON public.project_photos
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.daily_reports dr
            WHERE dr.id = project_photos.report_id
            AND (
                dr.created_by = (SELECT auth.uid())
                OR EXISTS (
                    SELECT 1 FROM public.project_members pm
                    WHERE pm.project_id = dr.project_id
                    AND pm.user_id = (SELECT auth.uid())
                )
            )
        )
    );

CREATE POLICY "project_photos_insert" ON public.project_photos
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.daily_reports dr
            WHERE dr.id = project_photos.report_id
            AND dr.created_by = (SELECT auth.uid())
        )
    );

CREATE POLICY "project_photos_delete" ON public.project_photos
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.daily_reports dr
            WHERE dr.id = project_photos.report_id
            AND dr.created_by = (SELECT auth.uid())
        )
    );


-- ============================================================
-- PROJECT_REVISIONS — drop semua varian
-- ============================================================
DROP POLICY IF EXISTS "project_revisions_select"        ON public.project_revisions;
DROP POLICY IF EXISTS "project_revisions_insert"        ON public.project_revisions;
DROP POLICY IF EXISTS "project_revisions_update"        ON public.project_revisions;
DROP POLICY IF EXISTS "project_revisions_admin_update"  ON public.project_revisions;
DROP POLICY IF EXISTS "project_revisions_owner_access"  ON public.project_revisions;
DROP POLICY IF EXISTS "project_revisions_v1"            ON public.project_revisions;

CREATE POLICY "project_revisions_select" ON public.project_revisions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_revisions.project_id
            AND (
                p.created_by = (SELECT auth.uid())
                OR EXISTS (
                    SELECT 1 FROM public.project_members pm
                    WHERE pm.project_id = p.id AND pm.user_id = (SELECT auth.uid())
                )
            )
        )
    );

CREATE POLICY "project_revisions_insert" ON public.project_revisions
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_revisions.project_id
            AND (
                p.created_by = (SELECT auth.uid())
                OR EXISTS (
                    SELECT 1 FROM public.project_members pm
                    WHERE pm.project_id = p.id AND pm.user_id = (SELECT auth.uid())
                )
            )
        )
    );

CREATE POLICY "project_revisions_admin_update" ON public.project_revisions
    FOR UPDATE TO authenticated
    USING (
        (SELECT auth.uid()) = approved_by
        OR EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.user_id = (SELECT auth.uid()) AND m.role = 'admin'
        )
    );


-- ============================================================
-- PROJECT_ITEMS — drop semua varian
-- ============================================================
DROP POLICY IF EXISTS "project_items_select"       ON public.project_items;
DROP POLICY IF EXISTS "project_items_insert"       ON public.project_items;
DROP POLICY IF EXISTS "project_items_update"       ON public.project_items;
DROP POLICY IF EXISTS "project_items_delete"       ON public.project_items;
DROP POLICY IF EXISTS "project_items_owner_access" ON public.project_items;
DROP POLICY IF EXISTS "project_items_v1"           ON public.project_items;
DROP POLICY IF EXISTS "project_items_v2"           ON public.project_items;

CREATE POLICY "project_items_select" ON public.project_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_items.project_id
            AND (
                p.created_by = (SELECT auth.uid())
                OR EXISTS (
                    SELECT 1 FROM public.project_members pm
                    WHERE pm.project_id = p.id AND pm.user_id = (SELECT auth.uid())
                )
            )
        )
    );

CREATE POLICY "project_items_insert" ON public.project_items
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_items.project_id
            AND (
                p.created_by = (SELECT auth.uid())
                OR EXISTS (
                    SELECT 1 FROM public.project_members pm
                    WHERE pm.project_id = p.id
                    AND pm.user_id = (SELECT auth.uid())
                    AND pm.can_write = true
                )
            )
        )
    );

CREATE POLICY "project_items_update" ON public.project_items
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_items.project_id
            AND (
                p.created_by = (SELECT auth.uid())
                OR EXISTS (
                    SELECT 1 FROM public.project_members pm
                    WHERE pm.project_id = p.id
                    AND pm.user_id = (SELECT auth.uid())
                    AND pm.can_write = true
                )
            )
        )
    );

CREATE POLICY "project_items_delete" ON public.project_items
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_items.project_id
            AND p.created_by = (SELECT auth.uid())
        )
    );


-- ============================================================
-- MANPOWER_ANALYSIS — drop semua varian (termasuk vFinal)
-- ============================================================
DROP POLICY IF EXISTS "manpower_select"                             ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_insert"                             ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_select_v2"                 ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_insert_v2"                 ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_update_v2"                 ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_delete_v2"                 ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_select_vFinal"             ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_insert_admin_vFinal"       ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_update_admin_vFinal"       ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_delete_admin_vFinal"       ON public.manpower_analysis;
DROP POLICY IF EXISTS "View manpower analysis"                      ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_read_v1"                   ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_admin_v1"                  ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_select"                    ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_manage"                    ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_insert"                    ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_update"                    ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_delete"                    ON public.manpower_analysis;

-- Satu kebijakan saja: semua authenticated bisa SELECT
CREATE POLICY "manpower_analysis_select" ON public.manpower_analysis
    FOR SELECT TO authenticated
    USING (true);

-- Gunakan INSERT, UPDATE, DELETE secara eksplisit (bukan ALL)
CREATE POLICY "manpower_analysis_insert" ON public.manpower_analysis
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.project_items pi
            JOIN public.projects p ON p.id = pi.project_id
            WHERE pi.id = manpower_analysis.item_id
            AND p.created_by = (SELECT auth.uid())
        )
    );

CREATE POLICY "manpower_analysis_update" ON public.manpower_analysis
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.project_items pi
            JOIN public.projects p ON p.id = pi.project_id
            WHERE pi.id = manpower_analysis.item_id
            AND p.created_by = (SELECT auth.uid())
        )
    );

CREATE POLICY "manpower_analysis_delete" ON public.manpower_analysis
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.project_items pi
            JOIN public.projects p ON p.id = pi.project_id
            WHERE pi.id = manpower_analysis.item_id
            AND p.created_by = (SELECT auth.uid())
        )
    );


-- ============================================================
-- PASTIKAN RLS AKTIF DI SEMUA TABEL YANG BARU
-- ============================================================
ALTER TABLE public.active_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_photos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manpower_analysis ENABLE ROW LEVEL SECURITY;
