import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Konfigurasi Transporter Hostinger SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true, // Port 465 menggunakan SSL/TLS
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
  // Opsi tambahan untuk stabilitas Hostinger
  pool: true,
  maxConnections: 5,
  rateDelta: 1000,
  rateLimit: 5
});

function logDebug(message) {
  console.log(`[VERIFICATION-EMAIL-SMTP] ${message}`);
}

export async function POST(request) {
  try {
    const { userId, email, fullName } = await request.json();

    logDebug(`MEMULAI PENGIRIMAN SMTP: User ${userId}, Email ${email}`);

    if (!userId || !email) {
      logDebug(`ERROR: Data user atau email kosong`);
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. Generate atau Ambil Token Verifikasi
    const { data: currentMember } = await supabaseAdmin
      .from('members')
      .select('verification_token')
      .eq('user_id', userId)
      .maybeSingle();

    const verificationToken = currentMember?.verification_token || crypto.randomBytes(32).toString('hex');

    // 2. Simpan/Update Token ke Database
    const { error: updateError } = await supabaseAdmin
      .from('members')
      .upsert({ 
        user_id: userId, 
        verification_token: verificationToken,
        full_name: fullName || (email ? email.split('@')[0] : 'User'),
        role: 'view',
        approval_status: 'pending',
        email: email
      }, { onConflict: 'user_id' });

    if (updateError) {
      logDebug(`DATABASE ERROR: ${updateError.message}`);
      throw updateError;
    }

    // 3. Siapkan Link Verifikasi (Pastikan menggunakan SITE_URL asli)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.zonageometry.id';
    const verifyLink = `${siteUrl}/api/auth/verify?token=${verificationToken}`;
    
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="color: #f97316; margin: 0; letter-spacing: 2px;">ZONA GEOMETRY</h2>
        </div>
        <h1 style="color: #0f172a; font-size: 24px; text-align: center; margin-bottom: 20px;">Konfirmasi Akun Anda</h1>
        <p style="color: #475569; line-height: 1.6; text-align: center;">Halo <strong>${fullName || 'User'}</strong>, terima kasih telah mendaftar. Klik tombol di bawah untuk mengaktifkan akun dan mendapatkan <strong>Trial 8 Hari</strong>.</p>
        <div style="text-align: center; margin: 40px 0;">
          <a href="${verifyLink}" style="background-color: #f97316; color: #ffffff; padding: 16px 40px; border-radius: 12px; font-weight: bold; text-decoration: none; display: inline-block; box-shadow: 0 10px 15px -3px rgba(249, 115, 22, 0.3);">Konfirmasi Akun</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;">
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">Jika Anda tidak merasa mendaftar, silakan abaikan email ini.</p>
      </div>
    `;

    // 4. Kirim Email via SMTP Hostinger
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Zona Geometry" <${process.env.ADMIN_EMAIL}>`,
      to: email,
      subject: '✨ Konfirmasi Verifikasi Akun Anda',
      html: htmlContent,
    });

    logDebug(`SMTP SUCCESS: Email terkirim ke ${email}. MessageId: ${info.messageId}`);
    return NextResponse.json({ success: true });

  } catch (err) {
    logDebug(`SMTP FATAL ERROR: ${err.message}`);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
