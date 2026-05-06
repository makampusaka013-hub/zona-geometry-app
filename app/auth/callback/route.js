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
              // Ignore cookie setting errors in server components
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      try {
        const user = data?.user;

        if (user) {
          const { data: currentMember, error: memberError } = await supabase
            .from('members')
            .select('approval_status, role, is_verified_manual')
            .eq('user_id', user.id)
            .maybeSingle();

          if (memberError) console.error('Callback: Member lookup error:', memberError);

          // Jika member belum ada (User baru via Google)
          if (!currentMember) {
            console.log('Callback: Creating new member for Google user:', user.email);
            
            // Gunakan siteUrl agar request internal konsisten
            await fetch(`${siteUrl}/api/auth/activate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                email: user.email,
                fullName: user.user_metadata?.full_name,
                currentRole: 'normal',
                provider: 'google'
              })
            }).catch(e => console.error('Callback: Activate failed:', e));

            await fetch(`${siteUrl}/api/auth/send-verification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                email: user.email,
                fullName: user.user_metadata?.full_name
              })
            }).catch(e => console.error('Callback: Send verification failed:', e));

            return NextResponse.redirect(`${siteUrl}/verify-notice`);
          }

          // Jika belum terverifikasi atau tidak aktif
          if (!currentMember.is_verified_manual || currentMember.approval_status !== 'active') {
            console.log('Callback: Redirecting unverified user to notice:', user.email);
            return NextResponse.redirect(`${siteUrl}/verify-notice`);
          }
        }
      } catch (err) {
        console.error('Callback Server-Side Error:', err);
      }

      const finalTarget = next.startsWith('/') ? next : `/${next}`;
      return NextResponse.redirect(`${siteUrl}${finalTarget}`);
    } else {
      console.error('Callback: Code exchange error:', error.message);
    }
  }

  // Final fallback to login with error message
  const errorUrl = new URL('/login', siteUrl);
  const finalMessage = error?.message || 'Gagal menukar kode login. Silakan coba lagi.';
  errorUrl.searchParams.set('message', finalMessage);
  if (error?.description) errorUrl.searchParams.set('error_description', error.description);
  
  console.error('[AUTH-CALLBACK-FINAL-ERROR]', {
    message: finalMessage,
    description: error?.description,
    code: error?.code
  });

  return NextResponse.redirect(errorUrl.toString());
}
