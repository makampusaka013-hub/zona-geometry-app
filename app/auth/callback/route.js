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

          // 1. Jika member belum ada (User baru login Google)
          if (!currentMember) {
            console.log(`[AUTH-CALLBACK] New user detected: ${user.email}. Initializing as PENDING.`);
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
          
          // 2. Jika member sudah ada tapi BELUM aktif (Pending atau belum verifikasi)
          const adminEmail = 'zulfitrigoma@gmail.com'; // Hard-coded safety
          const isAdmin = currentMember.role === 'admin' || user.email === adminEmail;
          const isActive = currentMember.approval_status === 'active';
          const isVerifiedManual = currentMember.is_verified_manual === true;

          // SYARAT MUTLAK: Harus Active DAN Verified (Kecuali Admin)
          if (!isAdmin && (!isActive || !isVerifiedManual)) {
            console.log(`[AUTH-CALLBACK] Blocking unverified user: ${user.email}. Status: ${currentMember.approval_status}`);
            return NextResponse.redirect(`${siteUrl}/verify-notice`);
          }

          console.log(`[AUTH-CALLBACK] Admin/Authorized User ${user.email} is AUTHORIZED.`);
        }
      } catch (err) {
        console.error('Callback Server Error:', err);
        return NextResponse.redirect(`${siteUrl}/login?message=Terjadi kesalahan sistem.`);
      }

      // 3. Hanya user yang lolos pengecekan di atas yang bisa masuk
      const finalTarget = next.startsWith('/') ? next : `/${next}`;
      return NextResponse.redirect(new URL(finalTarget, siteUrl).toString());
    }
  }

  // Return the user to an error page with some instructions
  const loginUrl = new URL('/login', siteUrl);
  loginUrl.searchParams.set('message', 'Gagal menukar kode login. Silakan coba lagi.');
  return NextResponse.redirect(loginUrl.toString());
}
