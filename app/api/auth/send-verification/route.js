import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const resend = new Resend(process.env.RESEND_API_KEY);

function logDebug(message) {
  console.log(`[VERIFICATION-EMAIL] ${message}`);
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

    // 1. Generate Secure Token (Hanya jika belum ada atau kadaluwarsa)
    const { data: currentMember } = await supabaseAdmin
      .from('members')
      .select('verification_token')
      .eq('user_id', userId)
      .maybeSingle();

    const verificationToken = currentMember?.verification_token || crypto.randomBytes(32).toString('hex');

    // 2. Save Token (Upsert) - Ini penting agar user baru terdaftar dengan status pending
    const { error: updateError } = await supabaseAdmin
      .from('members')
      .upsert({ 
        user_id: userId, 
        verification_token: verificationToken,
        full_name: fullName || (email ? email.split('@')[0] : 'User'),
        role: 'view', // Diberi role view dulu sampai klik konfirmasi
        approval_status: 'pending'
      }, { onConflict: 'user_id' });

    if (updateError) {
      logDebug(`DATABASE ERROR: ${JSON.stringify(updateError)}`);
      throw updateError;
    }

    logDebug(`DATABASE OK. Menyiapkan email...`);

    // 3. Prepare Email Template (Modern Premium Design)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const verifyLink = `${siteUrl}/api/auth/verify?token=${verificationToken}`;
    
    // Desain Email Premium (Tombol Lebih Tinggi & Warna Lebih Tegas)
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .body { font-family: 'Inter', -apple-system, sans-serif; background-color: #f1f5f9; padding: 40px 20px; }
            .card { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 32px; padding: 48px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; text-align: center; }
            .logo { color: #f97316; font-size: 14px; font-weight: 900; letter-spacing: 4px; margin-bottom: 24px; display: block; }
            h1 { color: #0f172a; font-size: 32px; font-weight: 800; margin-bottom: 24px; }
            .btn { display: inline-block; background: #f97316; color: #ffffff !important; padding: 20px 48px; border-radius: 20px; font-weight: 800; text-decoration: none; font-size: 18px; margin-bottom: 32px; box-shadow: 0 10px 15px -3px rgba(249, 115, 22, 0.3); }
            p { color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 0; }
            .footer { margin-top: 48px; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
          </style>
        </head>
        <body class="body">
          <div class="card">
            <span class="logo">ZONA GEOMETRY</span>
            <h1>Verifikasi Akun</h1>
            
            <a href="${verifyLink}" class="btn">Konfirmasi Akun</a>

            <p>Halo <strong>${fullName || 'User'}</strong>,<br>E-mail ini dikirim sebagai langkah verifikasi keamanan. Klik tombol di atas untuk mendapatkan akses Premium dan trial 8 hari Anda.</p>
            
            <div class="footer">&copy; ${new Date().getFullYear()} ZONA GEOMETRY APP</div>
          </div>
        </body>
      </html>
    `;

    logDebug(`Mengirim ke Resend menggunakan pengirim: ${process.env.EMAIL_FROM || 'Zona Geometry <noreply@zonageometry.id>'}`);

    // 4. Send Email (Ditambah BCC ke Admin agar Anda bisa memantau)
    const { data, error: emailError } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Zona Geometry <noreply@zonageometry.id>',
      to: email,
      bcc: 'makampusaka013@gmail.com', // Salinan untuk Anda (Admin)
      subject: '✨ Konfirmasi Verifikasi Akun Anda',
      html: htmlContent,
    });

    if (emailError) {
      logDebug(`RESEND ERROR DETECTED: ${JSON.stringify(emailError)}`);
      
      // Cek apakah error karena domain tidak terverifikasi (Common issue)
      const isDomainIssue = emailError.message?.toLowerCase().includes('domain') || 
                           emailError.name?.toLowerCase().includes('validation');

      logDebug(isDomainIssue ? 'TERDETEKSI MASALAH DOMAIN/DNS. Memberikan jalur bypass.' : 'ERROR TEKNIS LAINNYA.');

      // Kembalikan success: false agar UI tahu pengiriman gagal
      return NextResponse.json({ 
        success: false, 
        debugLink: verifyLink, 
        error: isDomainIssue 
          ? 'Domain @zonageometry.id belum aktif di Resend. Hubungi Admin atau cek DNS.' 
          : 'Gagal mengirim email verifikasi.',
        warning: 'Gunakan Link di bawah jika Anda adalah developer.'
      });
    }

    logDebug(`RESEND SUCCESS: ${JSON.stringify(data)}`);
    return NextResponse.json({ success: true, data });

  } catch (err) {
    logDebug(`SERVER FATAL ERROR: ${err.message}`);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
