import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(new URL('/login?message=Token verifikasi tidak ditemukan.', request.url));
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. Cari user berdasarkan token
    const { data: member, error: findError } = await supabaseAdmin
      .from('members')
      .select('user_id, full_name, role')
      .eq('verification_token', token)
      .maybeSingle();

    if (findError || !member) {
      console.error('Verify error: Token invalid or member not found');
      return NextResponse.redirect(new URL('/login?message=Link verifikasi tidak valid atau sudah kedaluwarsa.', request.url));
    }

    // 2. Aktivasi member & berikan Trial 8 Hari (1+7)
    const trialExpiry = new Date();
    trialExpiry.setDate(trialExpiry.getDate() + 8);

    const { error: updateError } = await supabaseAdmin
      .from('members')
      .update({
        is_verified_manual: true,
        approval_status: 'active',
        role: member.role === 'view' ? 'normal' : (member.role || 'normal'), // Pastikan minimal Normal
        expired_at: trialExpiry.toISOString(),
        verification_token: null // Hapus token setelah digunakan
      })
      .eq('user_id', member.user_id);

    if (updateError) throw updateError;

    // 3. Redirect ke Dashboard dengan pesan sukses
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${siteUrl}/dashboard?message=Berhasil verifikasi! Akun Anda aktif dengan Trial 8 Hari.`);

  } catch (err) {
    console.error('Verification system failure:', err);
    return NextResponse.redirect(new URL('/login?message=Terjadi kesalahan sistem saat verifikasi.', request.url));
  }
}
