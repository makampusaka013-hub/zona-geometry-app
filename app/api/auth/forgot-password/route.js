import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Transporter Hostinger SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

function logDebug(message) {
  console.log(`[FORGOT-PASSWORD-SMTP] ${message}`);
}

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    logDebug(`MEMULAI RESET PASSWORD: Email ${email}`);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. Generate Recovery Link via Supabase Admin
    // redirectTo harus sesuai dengan yang didaftarkan di Supabase dashboard
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email.trim(),
      options: {
        redirectTo: `${siteUrl}/auth/update-password`,
      }
    });

    if (error) {
      logDebug(`SUPABASE ERROR: ${error.message}`);
      // Jika user tidak ditemukan, Supabase mungkin mengembalikan error tergantung config.
      // Untuk keamanan, kita bisa mengembalikan success true agar tidak membocorkan keberadaan user.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const recoveryLink = data.properties?.action_link;
    if (!recoveryLink) {
      throw new Error('Gagal menghasilkan link pemulihan.');
    }

    logDebug(`LINK GENERATED. Menyiapkan email...`);

    // 2. Prepare Email Template
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .body { font-family: 'Inter', -apple-system, sans-serif; background-color: #f1f5f9; padding: 40px 20px; }
            .card { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 32px; padding: 48px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; text-align: center; }
            .logo { color: #4f46e5; font-size: 14px; font-weight: 900; letter-spacing: 4px; margin-bottom: 24px; display: block; }
            h1 { color: #0f172a; font-size: 32px; font-weight: 800; margin-bottom: 24px; }
            .btn { display: inline-block; background: #4f46e5; color: #ffffff !important; padding: 20px 48px; border-radius: 20px; font-weight: 800; text-decoration: none; font-size: 18px; margin-bottom: 32px; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3); }
            p { color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 0; }
            .footer { margin-top: 48px; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
          </style>
        </head>
        <body class="body">
          <div class="card">
            <span class="logo">ZONA GEOMETRY</span>
            <h1>Reset Password</h1>
            
            <a href="${recoveryLink}" class="btn">Atur Ulang Password</a>

            <p>Halo,<br>Kami menerima permintaan untuk mereset kata sandi akun Anda. Klik tombol di atas untuk melanjutkan. Link ini berlaku selama 60 menit.</p>
            <p style="margin-top: 20px; font-size: 14px;">Jika Anda tidak merasa melakukan permintaan ini, abaikan email ini.</p>
            
            <div class="footer">&copy; ${new Date().getFullYear()} ZONA GEOMETRY APP</div>
          </div>
        </body>
      </html>
    `;

    // 3. Send Email via Hostinger SMTP
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Zona Geometry" <${process.env.ADMIN_EMAIL}>`,
      to: email,
      subject: '🔐 Reset Kata Sandi Anda - Zona Geometry',
      html: htmlContent,
    });

    logDebug(`SMTP SUCCESS: Email recovery terkirim ke ${email}`);
    return NextResponse.json({ success: true });

  } catch (err) {
    logDebug(`SERVER FATAL ERROR: ${err.message}`);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
