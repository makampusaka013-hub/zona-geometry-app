-- 1. Perbarui RPC get_all_users_admin agar mengembalikan kolom expired_at
DROP FUNCTION IF EXISTS public.get_all_users_admin();

CREATE OR REPLACE FUNCTION public.get_all_users_admin()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  role public.member_role,
  status text,
  expired_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    m.user_id,
    au.email::text,
    m.full_name,
    m.role,
    m.status,
    m.expired_at,
    m.created_at
  FROM public.members m
  JOIN auth.users au ON au.id = m.user_id
  WHERE public.is_app_admin();
$$;

GRANT EXECUTE ON FUNCTION public.get_all_users_admin() TO authenticated;

-- Memaksa muat ulang skema untuk Supabase PostgREST agar kolom baru terdeteksi
NOTIFY pgrst, 'reload schema';
