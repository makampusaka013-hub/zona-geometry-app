import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { userId, email, fullName, currentRole, provider } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Gunakan Service Role Key untuk menembus RLS (Row Level Security)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const trialExpiry = new Date();
    trialExpiry.setDate(trialExpiry.getDate() + 8); // 1 hari sekarang + 7 hari trial

    // Cek apakah pengguna sudah ada di database
    const { data: existingUser } = await supabaseAdmin
      .from('members')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingUser) {
      // Jika pengguna sudah ada, JANGAN TIMPA DENGAN PAKSA role atau tanggal expired nya.
      const updateData = {};
      
      // Jika masih pending, ubah jadi active agar bisa login
      if (existingUser.approval_status === 'pending') {
        updateData.approval_status = 'active';
      }
      
      // Safety net: Jika benar-benar belum punya masa aktif, berikan masa percobaan 7 hari
      if (!existingUser.expired_at) {
        updateData.expired_at = trialExpiry.toISOString();
      }

      if (Object.keys(updateData).length > 0) {
        const { data: updatedMember, error: updateError } = await supabaseAdmin
          .from('members')
          .update(updateData)
          .eq('user_id', userId)
          .select()
          .single();
        if (updateError) throw updateError;
        return NextResponse.json({ success: true, member: updatedMember });
      }

      return NextResponse.json({ success: true, member: existingUser });
    }

    // Default ke 'normal' jika role saat ini adalah 'view', null, atau undefined
    const finalRole = (currentRole && !['view', 'guest', 'GUEST'].includes(currentRole)) ? currentRole : 'normal';
    const finalName = fullName || (email ? email.split('@')[0] : 'User');

    // Jika pengguna sama sekali belum ada, masukkan data percobaan
    const { data: activatedMember, error } = await supabaseAdmin
      .from('members')
      .insert({
        user_id: userId,
        full_name: finalName,
        approval_status: 'pending', // Wajib verifikasi email dulu
        role: finalRole,
        expired_at: trialExpiry.toISOString(),
        is_paid: false,
        is_verified_manual: false // Kaku: harus konfirmasi link email
      })
      .select()
      .single();

    if (error) {
      console.error('Auto-activate Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, member: activatedMember });

  } catch (err) {
    console.error('Server error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
