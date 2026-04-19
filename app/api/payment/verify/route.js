import { NextResponse } from 'next/server';
import midtransClient from 'midtrans-client';
import { createClient } from '@supabase/supabase-js';

// Initialize CoreApi to check transaction status
const coreApi = new midtransClient.CoreApi({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { order_id, userId: fallbackUserId, plan: fallbackPlan } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    console.log(`[VERIFY] Checking status for order: ${order_id}`);

    // 1. Check status from Midtrans
    const statusResponse = await coreApi.transaction.status(order_id);
    const { 
      transaction_status, 
      custom_field1: midtransUserId, 
      custom_field2: midtransPlan 
    } = statusResponse;

    // Gunakan userId dari midtrans, jika tidak ada (sandbox bug) gunakan dari client-side fallback
    const userId = midtransUserId || fallbackUserId;
    const plan = midtransPlan || fallbackPlan;

    console.log(`[VERIFY] Midtrans Status: ${transaction_status}, User: ${userId}, Plan: ${plan}`);

    if (!userId) {
      return NextResponse.json({ error: 'No userId found in transaction or fallback' }, { status: 400 });
    }

    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      // 2. Identify Plan
      let parsedPlan = plan;
      const roleMap = { advance: 'advance', pro: 'pro', normal: 'normal' };
      
      if (!parsedPlan || !roleMap[parsedPlan]) {
        if (order_id.includes('ADVANCE')) parsedPlan = 'advance';
        else if (order_id.includes('PRO')) parsedPlan = 'pro';
        else if (order_id.includes('NORMAL')) parsedPlan = 'normal';
        else parsedPlan = 'normal';
      }
      const newRole = roleMap[parsedPlan] || 'normal';

      // 3. Process Expiration & Update DB
      const { data: member, error: fetchError } = await supabaseAdmin
        .from('members')
        .select('expired_at, is_paid')
        .eq('user_id', userId)
        .single();

      if (fetchError) throw fetchError;

      // Jika sudah is_paid di waktu yang sama, mungkin webhook sudah lari. Kita pastikan tetap benar.
      let baseDate = new Date();
      if (member.expired_at && new Date(member.expired_at) > new Date()) {
        baseDate = new Date(member.expired_at);
      }
      
      // Karena trial 8 hari masih ada, jika kita asumsikan langganan 30 hari
      // Kita tambahkan 30 hari ke sisa masa aktif
      baseDate.setDate(baseDate.getDate() + 30);

      const { error: updateError } = await supabaseAdmin
        .from('members')
        .update({
          role: newRole,
          is_paid: true,
          expired_at: baseDate.toISOString(),
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) throw updateError;
      
      return NextResponse.json({ success: true, message: 'Payment verified and DB updated' });
    }

    return NextResponse.json({ 
      success: false, 
      message: `Transaction status is ${transaction_status}` 
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    // Jika tidak ditemukan di midtrans (biasanya 404), return false
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
