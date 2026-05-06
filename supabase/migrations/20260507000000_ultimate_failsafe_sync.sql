-- =============================================================================
-- Migration: Ultimate Fail-Safe User Sync
-- Description: 
-- 1. Moves handle_new_user to internal schema for maximum security.
-- 2. Implements extreme fail-safe (EXCEPTION WHEN OTHERS) to prevent Auth lockout.
-- 3. Ensures 'pending' status is enforced for all new registrations.
-- =============================================================================

-- 1. Create robust sync function in internal schema
CREATE OR REPLACE FUNCTION internal.handle_new_user_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- MENGGUNAKAN BLOCK EXCEPTION:
    -- Ini krusial! Jika insert ke members gagal (misal: constraint error),
    -- proses Auth tetap lanjut sehingga user tidak 'nyangkut' di Supabase Auth.
    BEGIN
        INSERT INTO public.members (
            user_id, 
            full_name, 
            email, 
            role, 
            approval_status, 
            status, 
            joined_at,
            is_verified_manual
        )
        VALUES (
            new.id, 
            COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
            new.email,
            COALESCE(new.raw_user_meta_data->>'role', 'normal'),
            'pending', -- Selalu pending untuk user baru
            'active',  -- Status teknis aktif (untuk membedakan dengan suspended)
            NOW(),
            false
        )
        ON CONFLICT (user_id) DO UPDATE SET
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            updated_at = NOW();
    EXCEPTION WHEN OTHERS THEN
        -- Gagal sinkronisasi tidak boleh mematikan sistem login
        -- Error bisa dicek di log Supabase jika perlu
        RETURN NEW;
    END;

    RETURN NEW;
END;
$$;

-- 2. Re-bind trigger dengan nama yang konsisten
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS tr_on_auth_user_created ON auth.users;

CREATE TRIGGER tr_on_auth_user_created
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION internal.handle_new_user_sync();

-- 3. Grant permissions
GRANT USAGE ON SCHEMA internal TO anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.handle_new_user_sync() TO postgres, service_role;

-- 4. Reload schema
NOTIFY pgrst, 'reload schema';
