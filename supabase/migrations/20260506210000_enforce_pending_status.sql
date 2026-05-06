-- =============================================================================
-- Migration: Enforce Pending Status for New Users
-- Description: Updates the handle_new_user() trigger to set 'pending' status by default.
--              This prevents users from bypassing email verification.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Menggunakan UPSERT (INSERT ... ON CONFLICT)
    -- Default status diatur ke 'pending' agar user harus verifikasi email
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
        'pending', -- KAKU: Wajib pending dulu
        'active',  -- Akun auth aktif, tapi akses aplikasi terbatas
        NOW(),
        false      -- Belum terverifikasi
    )
    ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();

    RETURN new;
END;
$$;

-- No need to recreate the trigger if it already exists, 
-- but we can ensure it's there.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
