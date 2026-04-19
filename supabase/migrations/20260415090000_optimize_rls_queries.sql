-- =============================================================================
-- PERFORMANCE OPTIMIZATION: RLS QUERY WRAPPING
-- Resolves suboptimal performance by wrapping auth.uid() in (SELECT auth.uid())
-- =============================================================================

-- 1. Optimize public.members policies
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    -- members_select_v3
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'members' AND policyname = 'members_select_v3') THEN
        ALTER POLICY "members_select_v3" ON public.members 
        USING (
            user_id = (SELECT auth.uid())
            OR public.can_view_profile(user_id, (SELECT auth.uid()))
            OR public.is_app_admin()
        );
    END IF;

    -- members_insert_self
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'members' AND policyname = 'members_insert_self') THEN
        ALTER POLICY "members_insert_self" ON public.members
        WITH CHECK (user_id = (SELECT auth.uid()));
    END IF;

    -- members_update_own_or_admin
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'members' AND policyname = 'members_update_own_or_admin') THEN
        ALTER POLICY "members_update_own_or_admin" ON public.members
        USING (user_id = (SELECT auth.uid()) OR public.is_app_admin())
        WITH CHECK (user_id = (SELECT auth.uid()) OR public.is_app_admin());
    END IF;
END $$;


-- 2. Optimize public.profiles policies
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        
        -- profiles_select_policy
        IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_policy') THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id') THEN
                ALTER POLICY profiles_select_policy ON public.profiles USING ((SELECT auth.uid()) = user_id OR public.is_app_admin());
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id') THEN
                ALTER POLICY profiles_select_policy ON public.profiles USING ((SELECT auth.uid()) = id OR public.is_app_admin());
            END IF;
        END IF;

        -- profiles_insert_policy
        IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_insert_policy') THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id') THEN
                ALTER POLICY profiles_insert_policy ON public.profiles WITH CHECK ((SELECT auth.uid()) = user_id);
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id') THEN
                ALTER POLICY profiles_insert_policy ON public.profiles WITH CHECK ((SELECT auth.uid()) = id);
            END IF;
        END IF;

        -- profiles_update_policy
        IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_policy') THEN
             IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id') THEN
                ALTER POLICY profiles_update_policy ON public.profiles 
                USING ((SELECT auth.uid()) = user_id OR public.is_app_admin())
                WITH CHECK ((SELECT auth.uid()) = user_id OR public.is_app_admin());
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id') THEN
                ALTER POLICY profiles_update_policy ON public.profiles 
                USING ((SELECT auth.uid()) = id OR public.is_app_admin())
                WITH CHECK ((SELECT auth.uid()) = id OR public.is_app_admin());
            END IF;
        END IF;

        -- profiles_delete_policy
        IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_delete_policy') THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id') THEN
                ALTER POLICY profiles_delete_policy ON public.profiles USING ((SELECT auth.uid()) = user_id OR public.is_app_admin());
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id') THEN
                ALTER POLICY profiles_delete_policy ON public.profiles USING ((SELECT auth.uid()) = id OR public.is_app_admin());
            END IF;
        END IF;

    END IF;
END $$;

-- 3. Reload Schema
NOTIFY pgrst, 'reload schema';
