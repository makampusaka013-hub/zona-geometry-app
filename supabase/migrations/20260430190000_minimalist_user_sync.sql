-- =============================================================================
-- Migration: Minimalist User Sync (Phase 15 Stabilization)
-- Description: Implementasi trigger paling ringan untuk mencegah login hang.
--              Logic berat dipindah ke level aplikasi/API.
-- =============================================================================

-- 1. BERSIH TOTAL (Nuclear Cleanup)
-- Hapus semua trigger dan fungsi lama agar tidak ada konflik
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_sync() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 2. CREATE THE ONE DEFINITIVE FUNCTION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Menggunakan UPSERT (INSERT ... ON CONFLICT)
    -- Menjamin tidak akan pernah error "duplicate identifier"
    INSERT INTO public.members (
        user_id, 
        full_name, 
        email, 
        role, 
        approval_status, 
        status, 
        joined_at
    )
    VALUES (
        new.id, 
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        new.email,
        COALESCE(new.raw_user_meta_data->>'role', 'normal'),
        'active',
        'active',
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();

    RAISE NOTICE 'User successfully processed in handle_new_user: %', new.id;
    RETURN new;
END;
$$;

-- 3. BUAT TRIGGER BARU (Hanya satu trigger tunggal)
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Reload Schema
NOTIFY pgrst, 'reload schema';
