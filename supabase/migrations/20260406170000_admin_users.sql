-- 1. Tambahkan kolom status pada public.members
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- 2. Buat RPC untuk melihat keseluruhan user beserta Email (khusus admin!)
CREATE OR REPLACE FUNCTION public.get_all_users_admin()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  role public.member_role,
  status text,
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
    m.created_at
  FROM public.members m
  JOIN auth.users au ON au.id = m.user_id
  WHERE public.is_app_admin();  -- Hanya akan mereturn hasil apabila user pengeksekusi adalah Admin.
$$;

GRANT EXECUTE ON FUNCTION public.get_all_users_admin() TO authenticated;

-- Memaksa muat ulang skema untuk Supabase PostgREST 
NOTIFY pgrst, 'reload schema';
