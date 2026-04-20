-- ============================================================
-- Migration: Fix All Supabase Security Advisor Warnings
-- Date: 2026-04-20
-- Issues Fixed:
--   1. Auth RLS Initialization Plan (support_tickets)
--   2. Multiple Permissive Policies (master_ahsp, master_ahsp_details,
--      master_harga_dasar, support_tickets)
--   3. Leaked Password Protection → manual action required (see below)
-- ============================================================

-- ============================================================
-- BAGIAN 1: SUPPORT_TICKETS
-- Masalah: Auth RLS Initialization Plan + Multiple Permissive Policies
-- Solusi:  Ganti auth.uid() dengan (select auth.uid()) untuk performa,
--          dan hapus kebijakan duplikat/tumpang tindih.
-- ============================================================

-- Hapus semua kebijakan lama yang bertumpang tindih
DROP POLICY IF EXISTS "Users can insert their own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Users can view their own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins can manage all tickets" ON public.support_tickets;
-- Hapus kebijakan lain yang mungkin dibuat oleh migrasi sebelumnya
DROP POLICY IF EXISTS "support_tickets_select" ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_insert" ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_admin" ON public.support_tickets;

-- Buat ulang kebijakan yang bersih dan efisien
-- Menggunakan (select auth.uid()) untuk menghindari "Auth RLS Initialization Plan"
CREATE POLICY "support_tickets_own_select" ON public.support_tickets
    FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "support_tickets_own_insert" ON public.support_tickets
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- Policy admin menggunakan role check yang efisien
CREATE POLICY "support_tickets_admin_all" ON public.support_tickets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.members
            WHERE members.user_id = (select auth.uid())
            AND members.role = 'admin'
        )
    );


-- ============================================================
-- BAGIAN 2: MASTER_AHSP
-- Masalah: Multiple Permissive Policies
-- Solusi:  Gabungkan kebijakan SELECT yang tumpang tindih menjadi satu.
-- ============================================================

-- Hapus semua kebijakan SELECT lama yang mungkin tumpang tindih
DROP POLICY IF EXISTS "master_ahsp_public_read" ON public.master_ahsp;
DROP POLICY IF EXISTS "master_ahsp_select" ON public.master_ahsp;
DROP POLICY IF EXISTS "Allow authenticated users to read master_ahsp" ON public.master_ahsp;
DROP POLICY IF EXISTS "Public read master_ahsp" ON public.master_ahsp;
DROP POLICY IF EXISTS "Allow public read" ON public.master_ahsp;
DROP POLICY IF EXISTS "Authenticated read" ON public.master_ahsp;
DROP POLICY IF EXISTS "master_ahsp_authenticated_read" ON public.master_ahsp;
DROP POLICY IF EXISTS "master_ahsp_anon_read" ON public.master_ahsp;

-- Buat satu kebijakan SELECT yang menggabungkan semua akses
CREATE POLICY "master_ahsp_read_all" ON public.master_ahsp
    FOR SELECT USING (true);


-- ============================================================
-- BAGIAN 3: MASTER_AHSP_DETAILS
-- Masalah: Multiple Permissive Policies
-- Solusi:  Sama seperti master_ahsp.
-- ============================================================

DROP POLICY IF EXISTS "master_ahsp_details_public_read" ON public.master_ahsp_details;
DROP POLICY IF EXISTS "master_ahsp_details_select" ON public.master_ahsp_details;
DROP POLICY IF EXISTS "Allow authenticated users to read master_ahsp_details" ON public.master_ahsp_details;
DROP POLICY IF EXISTS "Public read master_ahsp_details" ON public.master_ahsp_details;
DROP POLICY IF EXISTS "Allow public read" ON public.master_ahsp_details;
DROP POLICY IF EXISTS "Authenticated read" ON public.master_ahsp_details;
DROP POLICY IF EXISTS "master_ahsp_details_authenticated_read" ON public.master_ahsp_details;
DROP POLICY IF EXISTS "master_ahsp_details_anon_read" ON public.master_ahsp_details;

CREATE POLICY "master_ahsp_details_read_all" ON public.master_ahsp_details
    FOR SELECT USING (true);


-- ============================================================
-- BAGIAN 4: MASTER_HARGA_DASAR
-- Masalah: Multiple Permissive Policies
-- Solusi:  Sama seperti tabel master lainnya.
-- ============================================================

DROP POLICY IF EXISTS "master_harga_dasar_public_read" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_select" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "Allow authenticated users to read master_harga_dasar" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "Public read master_harga_dasar" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "Allow public read" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "Authenticated read" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_authenticated_read" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_anon_read" ON public.master_harga_dasar;

CREATE POLICY "master_harga_dasar_read_all" ON public.master_harga_dasar
    FOR SELECT USING (true);


-- ============================================================
-- CATATAN: Leaked Password Protection Disabled
-- Masalah ini TIDAK bisa diselesaikan lewat SQL/migration.
-- Solusi manual: Buka Dashboard Supabase → Authentication → 
--   Settings → Scroll ke "Password Protection" → 
--   Aktifkan toggle "Leaked Password Protection"
-- ============================================================
