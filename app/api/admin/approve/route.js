import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('id');
  const token = searchParams.get('token');

  if (!userId || !token) {
    return new Response('Invalid request', { status: 400 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return new Response('Server configuration error', { status: 500 });
  }

  // Verify token
  const secret = resendApiKey;
  const expectedToken = crypto.createHmac('sha256', secret).update(userId).digest('hex');

  if (token !== expectedToken) {
    return new Response('Forbidden: Invalid Token', { status: 403 });
  }

  // Use Service Role to bypass RLS and activate user
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY 
  );

  // In Next.js App Router, we should use the activation RPC or direct update
  const { data, error } = await supabase
    .from('members')
    .update({ approval_status: 'active' })
    .eq('user_id', userId);

  if (error) {
    console.error('Approval Error:', error);
    return new Response(`Error activating user: ${error.message}`, { status: 500 });
  }

  // Return a nice success page
  return new Response(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>User Approved</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; }
          .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 90%; }
          .icon { font-size: 3rem; margin-bottom: 1rem; color: #22c55e; }
          h1 { color: #0f172a; margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { color: #64748b; margin: 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <h1>User Berhasil Disetujui!</h1>
          <p>User sekarang sudah memiliki akses ke aplikasi Zona Geometry.</p>
        </div>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' },
  });
}
