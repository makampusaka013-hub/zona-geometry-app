-- =============================================================================
-- PERFORMANCE HARDENING: FINAL RLS TWEAKS (v2)
-- Resolves: 
--  1. Multiple Permissive Policies (SELECT overlap)
--  2. Suboptimal auth.uid() re-evaluation
-- =============================================================================

-- 1. FIX MULTIPLE PERMISSIVE POLICIES (SELECT Conflict)
-- We separate SELECT from other actions to avoid "Permissive" overlap warnings.
-- Note: SQL CREATE POLICY requires separate statements for each specific action if not using ALL.
-- -----------------------------------------------------------------------------

-- [manpower_analysis]
DROP POLICY IF EXISTS "manpower_analysis_select_vFinal" ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_manage_admin_vFinal" ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_insert_admin_vFinal" ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_update_admin_vFinal" ON public.manpower_analysis;
DROP POLICY IF EXISTS "manpower_analysis_delete_admin_vFinal" ON public.manpower_analysis;

CREATE POLICY "manpower_analysis_select_vFinal" ON public.manpower_analysis
    FOR SELECT TO authenticated 
    USING ( true );

CREATE POLICY "manpower_analysis_insert_admin_vFinal" ON public.manpower_analysis
    FOR INSERT TO authenticated 
    WITH CHECK ( (SELECT public.is_app_admin()) );

CREATE POLICY "manpower_analysis_update_admin_vFinal" ON public.manpower_analysis
    FOR UPDATE TO authenticated 
    USING ( (SELECT public.is_app_admin()) )
    WITH CHECK ( (SELECT public.is_app_admin()) );

CREATE POLICY "manpower_analysis_delete_admin_vFinal" ON public.manpower_analysis
    FOR DELETE TO authenticated 
    USING ( (SELECT public.is_app_admin()) );


-- [master_harga_dasar]
DROP POLICY IF EXISTS "master_harga_dasar_select_vFinal" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_manage_admin_vFinal" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_insert_admin_vFinal" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_update_admin_vFinal" ON public.master_harga_dasar;
DROP POLICY IF EXISTS "master_harga_dasar_delete_admin_vFinal" ON public.master_harga_dasar;

CREATE POLICY "master_harga_dasar_select_vFinal" ON public.master_harga_dasar
    FOR SELECT TO authenticated 
    USING ( true );

CREATE POLICY "master_harga_dasar_insert_admin_vFinal" ON public.master_harga_dasar
    FOR INSERT TO authenticated 
    WITH CHECK ( (SELECT public.is_app_admin()) );

CREATE POLICY "master_harga_dasar_update_admin_vFinal" ON public.master_harga_dasar
    FOR UPDATE TO authenticated 
    USING ( (SELECT public.is_app_admin()) )
    WITH CHECK ( (SELECT public.is_app_admin()) );

CREATE POLICY "master_harga_dasar_delete_admin_vFinal" ON public.master_harga_dasar
    FOR DELETE TO authenticated 
    USING ( (SELECT public.is_app_admin()) );


-- 2. OPTIMIZE AUTH.UID() SUBQUERIES
-- Resolves "suboptimal query performance at scale" by wrapping auth.uid() in (SELECT auth.uid())
-- -----------------------------------------------------------------------------

-- [user_ahsp_price_override]
DROP POLICY IF EXISTS uapo_user_policy ON public.user_ahsp_price_override;
DROP POLICY IF EXISTS uapo_insert_policy ON public.user_ahsp_price_override;
DROP POLICY IF EXISTS uapo_select_policy ON public.user_ahsp_price_override;
DROP POLICY IF EXISTS uapo_update_policy ON public.user_ahsp_price_override;
DROP POLICY IF EXISTS uapo_delete_policy ON public.user_ahsp_price_override;

CREATE POLICY uapo_select_policy ON public.user_ahsp_price_override
    FOR SELECT TO authenticated
    USING ( user_id = (SELECT auth.uid()) );

CREATE POLICY uapo_insert_policy ON public.user_ahsp_price_override
    FOR INSERT TO authenticated
    WITH CHECK ( user_id = (SELECT auth.uid()) );

CREATE POLICY uapo_update_policy ON public.user_ahsp_price_override
    FOR UPDATE TO authenticated
    USING ( user_id = (SELECT auth.uid()) )
    WITH CHECK ( user_id = (SELECT auth.uid()) );

CREATE POLICY uapo_delete_policy ON public.user_ahsp_price_override
    FOR DELETE TO authenticated
    USING ( user_id = (SELECT auth.uid()) );


-- 3. FINAL SCHEMA RELOAD
NOTIFY pgrst, 'reload schema';
