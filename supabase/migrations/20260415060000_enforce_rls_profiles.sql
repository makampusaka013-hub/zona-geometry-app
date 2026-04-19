-- Enforce Row Level Security (RLS) on Profiles Table
-- Created: 2026-04-15
-- Target Table: public.profiles

DO $$
BEGIN
    -- Check if the table exists before attempting to enable RLS
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        
        -- 1. Enable RLS
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

        -- 2. Clean up existing policies if any
        DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
        DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
        DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
        DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
        DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
        DROP POLICY IF EXISTS profiles_all_admin ON public.profiles;
        DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;
        DROP POLICY IF EXISTS profiles_insert_policy ON public.profiles;
        DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;
        DROP POLICY IF EXISTS profiles_delete_policy ON public.profiles;
        DROP POLICY IF EXISTS profiles_admin_only ON public.profiles;

        -- 3. Create new standard policies
        
        -- Select: Allow users to see their own profile or allow admins to see all
        -- We try to detect if it's 'id' or 'user_id' column
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id') THEN
            CREATE POLICY profiles_select_policy ON public.profiles
                FOR SELECT TO authenticated
                USING (auth.uid() = id OR public.is_app_admin());
                
            CREATE POLICY profiles_insert_policy ON public.profiles
                FOR INSERT TO authenticated
                WITH CHECK (auth.uid() = id);
                
            CREATE POLICY profiles_update_policy ON public.profiles
                FOR UPDATE TO authenticated
                USING (auth.uid() = id OR public.is_app_admin())
                WITH CHECK (auth.uid() = id OR public.is_app_admin());
                
            CREATE POLICY profiles_delete_policy ON public.profiles
                FOR DELETE TO authenticated
                USING (auth.uid() = id OR public.is_app_admin());
        
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id') THEN
            CREATE POLICY profiles_select_policy ON public.profiles
                FOR SELECT TO authenticated
                USING (auth.uid() = user_id OR public.is_app_admin());
                
            CREATE POLICY profiles_insert_policy ON public.profiles
                FOR INSERT TO authenticated
                WITH CHECK (auth.uid() = user_id);
                
            CREATE POLICY profiles_update_policy ON public.profiles
                FOR UPDATE TO authenticated
                USING (auth.uid() = user_id OR public.is_app_admin())
                WITH CHECK (auth.uid() = user_id OR public.is_app_admin());
                
            CREATE POLICY profiles_delete_policy ON public.profiles
                FOR DELETE TO authenticated
                USING (auth.uid() = user_id OR public.is_app_admin());
        ELSE
            -- No ID/User_ID found? Default to Admin-only for safety
            CREATE POLICY profiles_admin_only ON public.profiles
                FOR ALL TO authenticated
                USING (public.is_app_admin());
        END IF;

        -- 4. Reload Schema
        NOTIFY pgrst, 'reload schema';
        
    END IF;
END $$;
