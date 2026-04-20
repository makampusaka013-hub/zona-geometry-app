-- ============================================================
-- Migration: Fix Schema Issues & Harden RLS Security
-- Date: 2026-04-20
-- Issues Fixed:
--   1. daily_reports.documentation_url → ganti ARRAY ke text[]
--   2. project_items.total_harga → hapus DEFAULT yang tidak valid
--   3. support_tickets.user_id → tambah FK ke auth.users
--   4. Aktifkan RLS di tabel yang belum aman
--   5. Tambah kebijakan RLS yang ketat untuk tiap tabel
-- ============================================================


-- ============================================================
-- BAGIAN 1: PERBAIKAN KRITIS — TIPE & CONSTRAINT
-- ============================================================

-- 1a. Perbaiki tipe kolom documentation_url di daily_reports
--     dari ARRAY (tidak valid) menjadi text[]
ALTER TABLE public.daily_reports
  ALTER COLUMN documentation_url TYPE text[]
  USING documentation_url::text[];

-- 1b. Perbaiki kolom generated total_harga di project_items
--     Kolom ini adalah GENERATED COLUMN, bukan DEFAULT biasa.
--     Gunakan DROP EXPRESSION untuk menghapus ekspresi generated-nya.
ALTER TABLE public.project_items
  ALTER COLUMN total_harga DROP EXPRESSION IF EXISTS;

-- 1c. Tambahkan FK yang hilang di support_tickets.user_id
--     (tanpa FK, data bisa orphan jika user dihapus)
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ============================================================
-- BAGIAN 2: AKTIFKAN RLS DI TABEL YANG BELUM AMAN
-- ============================================================

ALTER TABLE public.active_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_progress          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_photos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_revisions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manpower_analysis       ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- BAGIAN 3: KEBIJAKAN RLS — ACTIVE_SESSIONS
-- User hanya bisa melihat & mengelola sesinya sendiri.
-- ============================================================

DROP POLICY IF EXISTS "sessions_own_select"  ON public.active_sessions;
DROP POLICY IF EXISTS "sessions_own_insert"  ON public.active_sessions;
DROP POLICY IF EXISTS "sessions_own_delete"  ON public.active_sessions;
DROP POLICY IF EXISTS "sessions_own_update"  ON public.active_sessions;

CREATE POLICY "sessions_own_select" ON public.active_sessions
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "sessions_own_insert" ON public.active_sessions
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "sessions_own_update" ON public.active_sessions
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "sessions_own_delete" ON public.active_sessions
  FOR DELETE USING ((select auth.uid()) = user_id);


-- ============================================================
-- BAGIAN 4: KEBIJAKAN RLS — DAILY_REPORTS
-- Hanya pemilik & member proyek yang bisa melihat laporan.
-- ============================================================

DROP POLICY IF EXISTS "daily_reports_select" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_insert" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_update" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_delete" ON public.daily_reports;

CREATE POLICY "daily_reports_select" ON public.daily_reports
  FOR SELECT USING (
    (select auth.uid()) = created_by
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = daily_reports.project_id
      AND pm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = daily_reports.project_id
      AND p.created_by = (select auth.uid())
    )
  );

CREATE POLICY "daily_reports_insert" ON public.daily_reports
  FOR INSERT WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY "daily_reports_update" ON public.daily_reports
  FOR UPDATE USING ((select auth.uid()) = created_by);

CREATE POLICY "daily_reports_delete" ON public.daily_reports
  FOR DELETE USING ((select auth.uid()) = created_by);


-- ============================================================
-- BAGIAN 5: KEBIJAKAN RLS — DAILY_PROGRESS
-- Ikut kebijakan daily_reports (melalui report_id).
-- ============================================================

DROP POLICY IF EXISTS "daily_progress_select" ON public.daily_progress;
DROP POLICY IF EXISTS "daily_progress_insert" ON public.daily_progress;
DROP POLICY IF EXISTS "daily_progress_delete" ON public.daily_progress;

CREATE POLICY "daily_progress_select" ON public.daily_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = daily_progress.report_id
      AND (
        dr.created_by = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = dr.project_id
          AND pm.user_id = (select auth.uid())
        )
      )
    )
  );

CREATE POLICY "daily_progress_insert" ON public.daily_progress
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = daily_progress.report_id
      AND dr.created_by = (select auth.uid())
    )
  );

CREATE POLICY "daily_progress_delete" ON public.daily_progress
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = daily_progress.report_id
      AND dr.created_by = (select auth.uid())
    )
  );


-- ============================================================
-- BAGIAN 6: KEBIJAKAN RLS — PROJECT_PHOTOS
-- Ikut kebijakan daily_reports (melalui report_id).
-- ============================================================

DROP POLICY IF EXISTS "project_photos_select" ON public.project_photos;
DROP POLICY IF EXISTS "project_photos_insert" ON public.project_photos;
DROP POLICY IF EXISTS "project_photos_delete" ON public.project_photos;

CREATE POLICY "project_photos_select" ON public.project_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = project_photos.report_id
      AND (
        dr.created_by = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = dr.project_id
          AND pm.user_id = (select auth.uid())
        )
      )
    )
  );

CREATE POLICY "project_photos_insert" ON public.project_photos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = project_photos.report_id
      AND dr.created_by = (select auth.uid())
    )
  );

CREATE POLICY "project_photos_delete" ON public.project_photos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = project_photos.report_id
      AND dr.created_by = (select auth.uid())
    )
  );


-- ============================================================
-- BAGIAN 7: KEBIJAKAN RLS — PROJECT_REVISIONS
-- Hanya member proyek & admin yang bisa mengakses revisi.
-- ============================================================

DROP POLICY IF EXISTS "project_revisions_select" ON public.project_revisions;
DROP POLICY IF EXISTS "project_revisions_insert" ON public.project_revisions;
DROP POLICY IF EXISTS "project_revisions_update" ON public.project_revisions;

CREATE POLICY "project_revisions_select" ON public.project_revisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_revisions.project_id
      AND (
        p.created_by = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = (select auth.uid())
        )
      )
    )
  );

CREATE POLICY "project_revisions_insert" ON public.project_revisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_revisions.project_id
      AND (
        p.created_by = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = (select auth.uid())
        )
      )
    )
  );

CREATE POLICY "project_revisions_admin_update" ON public.project_revisions
  FOR UPDATE USING (
    (select auth.uid()) = approved_by
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.user_id = (select auth.uid()) AND m.role = 'admin'
    )
  );


-- ============================================================
-- BAGIAN 8: KEBIJAKAN RLS — PROJECT_ITEMS
-- Hanya member proyek yang relevan yang bisa mengakses.
-- ============================================================

DROP POLICY IF EXISTS "project_items_select" ON public.project_items;
DROP POLICY IF EXISTS "project_items_insert" ON public.project_items;
DROP POLICY IF EXISTS "project_items_update" ON public.project_items;
DROP POLICY IF EXISTS "project_items_delete" ON public.project_items;

CREATE POLICY "project_items_select" ON public.project_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id
      AND (
        p.created_by = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = (select auth.uid())
        )
      )
    )
  );

CREATE POLICY "project_items_insert" ON public.project_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id
      AND (
        p.created_by = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = (select auth.uid()) AND pm.can_write = true
        )
      )
    )
  );

CREATE POLICY "project_items_update" ON public.project_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id
      AND (
        p.created_by = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = (select auth.uid()) AND pm.can_write = true
        )
      )
    )
  );

CREATE POLICY "project_items_delete" ON public.project_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id
      AND p.created_by = (select auth.uid())
    )
  );


-- ============================================================
-- BAGIAN 9: KEBIJAKAN RLS — MANPOWER_ANALYSIS
-- Ikut akses project_items.
-- ============================================================

DROP POLICY IF EXISTS "manpower_select" ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_insert" ON public.manpower_analysis;

CREATE POLICY "manpower_select" ON public.manpower_analysis
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.project_items pi
      JOIN public.projects p ON p.id = pi.project_id
      WHERE pi.id = manpower_analysis.item_id
      AND (
        p.created_by = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = (select auth.uid())
        )
      )
    )
  );

CREATE POLICY "manpower_insert" ON public.manpower_analysis
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_items pi
      JOIN public.projects p ON p.id = pi.project_id
      WHERE pi.id = manpower_analysis.item_id
      AND p.created_by = (select auth.uid())
    )
  );
