import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { userId, userEmail, fullName } = await request.json();

    if (!userId || !userEmail) {
      return NextResponse.json({ error: 'Missing user data' }, { status: 400 });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const resendApiKey = process.env.RESEND_API_KEY;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    // --- KEAMANAN: Verifikasi bahwa User memang ada (Anti Spam) ---
    const { createClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: userExists } = await supabaseAdmin
      .from('members')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!userExists) {
      console.warn(`[SECURITY] Blocked notify attempt for non-existent user ID: ${userId}`);
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }
    // --- AKHIR VERIFIKASI ---

    // Since approval is automatic, this is just an Info email for Admin
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Zona Geometry <onboarding@resend.dev>',
        to: [adminEmail],
        subject: `User Baru Terdaftar (Trial 7 Hari): ${fullName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #0f172a;">Notifikasi Pendaftaran Baru</h2>
            <p>Halo Admin, seorang user baru telah terdaftar di <strong>Zona Geometry</strong> dengan status <strong>Free Trial (7 Hari)</strong>:</p>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Nama:</strong> ${fullName}</li>
              <li><strong>Email:</strong> ${userEmail}</li>
              <li><strong>ID User:</strong> ${userId}</li>
              <li><strong>Berakhir pada:</strong> ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}</li>
            </ul>
            <p style="margin-top: 30px;">
              Persetujuan dilakukan secara otomatis oleh sistem setelah user memverifikasi email mereka.
            </p>
            <p style="font-size: 12px; color: #64748b; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
              Dibuat otomatis oleh Sistem Zona Geometry.
            </p>
          </div>
        `,
      }),
    });

    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Notification error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
