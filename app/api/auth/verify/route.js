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

    // 2. Lakukan Update Status (Aktifkan User)
    const { data: updatedData, error: updateError, count } = await supabaseAdmin
      .from('members')
      .update({
        is_verified_manual: true,
        approval_status: 'active',
        role: member.role === 'admin' ? 'admin' : 'normal',
        expired_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        verification_token: null 
      })
      .eq('user_id', member.user_id)
      .select();

    if (updateError) {
      throw new Error(`Database Update Error: ${updateError.message}`);
    }

    if (!updatedData || updatedData.length === 0) {
      throw new Error('Tidak ada data yang diupdate. Pastikan User ID benar.');
    }

    console.log(`VERIFY SUCCESS: User ${member.user_id} is now ACTIVE.`);

    // 3. Redirect ke Dashboard dengan pesan sukses
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.zonageometry.id';
    
    // Gunakan redirect permanen atau pastikan URL bersih
    const redirectUrl = new URL('/dashboard', siteUrl);
    redirectUrl.searchParams.set('message', 'Berhasil verifikasi! Akun Anda aktif dengan Trial 8 Hari.');
    redirectUrl.searchParams.set('v', Date.now().toString());
    
    return NextResponse.redirect(redirectUrl.toString());

  } catch (err) {
    console.error('Verification system failure:', err);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.zonageometry.id';
    // Berikan pesan error asli di URL agar kita bisa debug
    const errorMsg = encodeURIComponent(err.message || 'Kesalahan sistem tidak diketahui');
    return NextResponse.redirect(new URL(`/login?message=Gagal Verifikasi: ${errorMsg}`, siteUrl));
  }
}
