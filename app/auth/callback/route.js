import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin;
  const code = searchParams.get('code');
  // if "next" is in search params, use it as the redirect URL
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
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

          // Jika member belum ada (Google user baru)
          if (!currentMember) {
            // 1. Buat data member dulu (status otomatis pending)
            await fetch(`${origin}/api/auth/activate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                email: user.email,
                fullName: user.user_metadata?.full_name,
                currentRole: 'normal',
                provider: 'google'
              })
            });

            // 2. Kirim email verifikasi secara otomatis
            await fetch(`${origin}/api/auth/send-verification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                email: user.email,
                fullName: user.user_metadata?.full_name
              })
            });

            return NextResponse.redirect(`${siteUrl}/verify-notice`);
          }

          // Jika sudah ada tapi belum terverifikasi (baik Google lama atau Email)
          if (!currentMember.is_verified_manual || currentMember.approval_status !== 'active') {
            // Cek apakah perlu kirim ulang email jika token tidak ada? 
            // (Opsional, tapi untuk keamanan kita arahkan saja ke notice)
            return NextResponse.redirect(`${siteUrl}/verify-notice`);
          }
        }
      } catch (err) {
        console.error('Callback Server Error:', err);
      }

      // Pastikan URL redirect bersih dan absolut
      const finalTarget = next.startsWith('/') ? next : `/${next}`;
      const finalUrl = new URL(finalTarget, siteUrl);

      return NextResponse.redirect(finalUrl.toString());
    }
  }

  // Return the user to an error page with some instructions
  const loginUrl = new URL('/login', siteUrl);
  loginUrl.searchParams.set('message', 'Gagal menukar kode login. Silakan coba lagi.');
  return NextResponse.redirect(loginUrl.toString());
}
