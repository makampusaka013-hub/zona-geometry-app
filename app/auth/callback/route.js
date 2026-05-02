import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // if "next" is in search params, use it as the redirect URL
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
          set(name, value, options) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name, options) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      try {
        // Logika Tambahan: Cek status member & Aktivasi Premium
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data: currentMember } = await supabase
            .from('members')
            .select('approval_status, role, is_verified_manual')
            .eq('user_id', user.id)
            .maybeSingle();

          // 1. Cek Verifikasi
          if (!currentMember?.is_verified_manual && currentMember?.role !== 'admin') {
            return NextResponse.redirect(`${origin}/verify-notice`);
          }

          // 2. Cek Aktivasi Premium jika sudah diverifikasi tapi belum aktif
          if (currentMember?.is_verified_manual && currentMember?.approval_status !== 'active') {
            // Kita panggil internal API activation
            await fetch(`${origin}/api/auth/activate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.id, currentRole: currentMember?.role })
            });
          }
        }
      } catch (err) {
        console.error('Callback Server Error:', err);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with some instructions
  return NextResponse.redirect(`${origin}/login?message=Gagal menukar kode login. Silakan coba lagi.`);
}
