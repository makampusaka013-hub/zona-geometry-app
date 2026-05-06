import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

function logDebug(message) {
  console.log(`[VERIFICATION-EMAIL-RESEND] ${message}`);
}

export async function POST(request) {
  try {
    const { userId, email, fullName } = await request.json();

    logDebug(`MEMULAI PENGIRIMAN: User ${userId}, Email ${email}`);

    if (!userId || !email) {
      logDebug(`ERROR: Missing required fields`);
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. Generate Secure Token
    const { data: currentMember } = await supabaseAdmin
      .from('members')
      .select('verification_token')
      .eq('user_id', userId)
      .maybeSingle();

    const verificationToken = currentMember?.verification_token || crypto.randomBytes(32).toString('hex');

    // 2. Save Token (Upsert)
    // Catatan: Pastikan Trigger 'protect_member_sensitive_data' sudah di-disable di Supabase
    const { error: updateError } = await supabaseAdmin
      .from('members')
      .upsert({ 
        user_id: userId, 
        verification_token: verificationToken,
        full_name: fullName || (email ? email.split('@')[0] : 'User'),
        role: 'view',
        approval_status: 'pending',
        email: email // Pastikan email tersimpan
      }, { onConflict: 'user_id' });

    if (updateError) {
      logDebug(`DATABASE ERROR: ${JSON.stringify(updateError)}`);
      throw updateError;
    }

    logDebug(`DATABASE OK. Menyiapkan email via Resend...`);

    // 3. Prepare Email
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.zonageometry.id';
    const verifyLink = `${siteUrl}/api/auth/verify?token=${verificationToken}`;
    
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Zona Geometry <onboarding@resend.dev>',
      to: email,
      subject: '✨ Konfirmasi Verifikasi Akun Anda',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #f97316; text-align: center;">ZONA GEOMETRY</h2>
          <h1 style="text-align: center; color: #333;">Verifikasi Akun</h1>
          <p>Halo <strong>${fullName || 'User'}</strong>,</p>
          <p>Klik tombol di bawah ini untuk mengaktifkan akun Anda dan mendapatkan <strong>Akses Trial 8 Hari</strong>.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyLink}" style="background-color: #f97316; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Konfirmasi Akun</a>
          </div>
          <p style="color: #666; font-size: 12px; text-align: center;">Jika Anda tidak merasa mendaftar, abaikan email ini.</p>
        </div>
      `,
    });

    if (error) {
      logDebug(`RESEND ERROR: ${JSON.stringify(error)}`);
      throw error;
    }

    logDebug(`RESEND SUCCESS: Email terkirim ke ${email}`);
    return NextResponse.json({ success: true });

  } catch (err) {
    logDebug(`SERVER FATAL ERROR: ${err.message}`);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
