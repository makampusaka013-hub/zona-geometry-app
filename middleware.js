import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * Middleware for enforcing authentication on dashboard routes.
 * Redirects unauthorized users to /login.
 */
export async function middleware(request) {
  const host = request.headers.get('host');
  const url = request.nextUrl.clone();

  // 1. Canonical Redirect (zonageometry.id -> www.zonageometry.id)
  // Ini krusial untuk Auth PKCE agar cookie tidak hilang karena beda domain
  if (host === 'zonageometry.id') {
    url.hostname = 'www.zonageometry.id';
    return NextResponse.redirect(url, 301);
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // 2. Supabase Auth Context
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  
  // Debugging User
  console.log('MIDDLEWARE USER:', user ? 'VALID' : 'INVALID');

  // 3. Protected Routes
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
