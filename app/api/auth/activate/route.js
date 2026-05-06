import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseAuth';

export async function POST(request) {
  try {
    const { userId, email, fullName, currentRole, provider } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // --- KEAMANAN: Verifikasi Sesi ---
    const supabaseServer = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser();

    if (authError || !user || user.id !== userId) {
      console.warn(`[SECURITY] Unauthorized activation attempt for ID: ${userId} by ${user?.id || 'unknown'}`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // --- AKHIR VERIFIKASI ---

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
      // PROTEKSI MUTLAK: Jika user sudah bayar, jangan pernah ubah statusnya di sini!
      if (existingUser.is_paid) {
        console.log(`[ACTIVATE] User ${userId} is already PAID. Blocking trial overwrite.`);
        return NextResponse.json({ success: true, member: existingUser });
      }

      const updateData = {};

      // KAKU: Tidak ada aktivasi otomatis, termasuk Google.
      // Semua user harus lewat alur klik link di email untuk menjadi 'active'
      if (existingUser.approval_status === 'pending') {
        // Jangan ubah status di sini, biarkan tetap pending
        console.log(`[ACTIVATE] User ${userId} exists but is PENDING. Waiting for email verification.`);
      }

      // Safety net: Jika benar-benar belum punya masa aktif, berikan masa percobaan 8 hari
      if (!existingUser.expired_at) {
        const trialExpiry = new Date();
        trialExpiry.setDate(trialExpiry.getDate() + 8);
        updateData.expired_at = trialExpiry.toISOString();
        console.log(`[ACTIVATE] Assigning trial to user ${userId} until ${updateData.expired_at}`);
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
