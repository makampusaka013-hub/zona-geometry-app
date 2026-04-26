import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const { type, subject, description } = await request.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: request.headers.get('Authorization'),
          },
        },
      }
    );

    // 1. Get User Session
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Save to Database
    const { data: ticket, error: dbError } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        type,
        subject,
        description,
        status: 'open'
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // 3. Send Email Notification to Admin
    const adminEmail = 'admin@zonageometry.id';
    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #f97316;">⚠️ Laporan Masalah Baru</h2>
        <p>Halo Admin, ada laporan baru dari user <strong>${user.email}</strong>.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px;">
          <p><strong>Tipe:</strong> ${type.toUpperCase()}</p>
          <p><strong>Subjek:</strong> ${subject}</p>
          <p><strong>Pesan:</strong><br>${description.replace(/\n/g, '<br>')}</p>
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
          Ticket ID: ${ticket.id}<br>
          Waktu: ${new Date().toLocaleString()}
        </p>
      </div>
    `;

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Sistem Notifikasi Zona Geometry <admin@zonageometry.id>',
      to: adminEmail,
      reply_to: user.email,
      subject: `[${type.toUpperCase()}] ${subject}`,
      html: htmlContent,
    });

    if (emailError) {
      throw new Error(`Resend Error: ${emailError.message}`);
    }

    return NextResponse.json({ success: true, ticket });

  } catch (err) {
    console.error('Support API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
