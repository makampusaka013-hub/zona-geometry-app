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
    let userId = midtransUserId || fallbackUserId;
    let plan = midtransPlan || fallbackPlan;
    let userEmail = statusResponse.custom_field3;

    // RECOVERY LOGIC: Parse from order_id if still missing
    if ((!userId || !plan) && order_id) {
      console.log('[VERIFY] Attempting recovery from order_id:', order_id);
      const parts = order_id.split('-');
      if (parts.length >= 6) {
        const prefix = parts[0];
        if (!userId) {
          userId = parts.slice(1, -1).join('-');
        }
        if (prefix === 'ZPA') plan = 'advance';
        else if (prefix === 'ZPP') plan = 'pro';
        else if (prefix === 'ZPN') plan = 'normal';
        console.log('[VERIFY] Recovered:', { userId, plan });
      }
    }

    // Identify Plan
    let parsedPlan = (plan || '').toLowerCase();
    const roleMap = { advance: 'advance', pro: 'pro', normal: 'normal' };
    if (order_id.startsWith('ZPA')) parsedPlan = 'advance';
    else if (order_id.startsWith('ZPP')) parsedPlan = 'pro';
    else if (order_id.startsWith('ZPN')) parsedPlan = 'normal';
    const newRole = roleMap[parsedPlan] || 'normal';

    console.log(`[VERIFY] Midtrans Status: ${transaction_status}, User: ${userId}, Plan: ${newRole}`);

    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      try {
        // 4. FIND USER (Primary: userId, Fallback: Email)
        let member = null;
        const { data: memberById } = await supabaseAdmin.from('members').select('*').eq('user_id', userId).maybeSingle();
        member = memberById;

        if (!member && userEmail) {
          console.log(`[VERIFY] User ID ${userId} not found. Trying fallback to Email: ${userEmail}`);
          const { data: memberByEmail } = await supabaseAdmin.from('members').select('*').eq('email', userEmail).maybeSingle();
          member = memberByEmail;
        }

        if (!member) {
          console.error(`[VERIFY] User NOT FOUND (ID: ${userId}, Email: ${userEmail}). Cannot verify.`);
          return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
        }

        const actualUserId = member.user_id;
        console.log(`[VERIFY API] SUCCESS for ${actualUserId} (${member.full_name})`);

        // 3. Process Expiration & Update DB
        // Safe Date Calculation
        let baseDate = new Date();
        if (member.expired_at) {
          const currentExp = new Date(member.expired_at);
          if (!isNaN(currentExp.getTime()) && currentExp > new Date()) {
            baseDate = currentExp;
          }
        }
        
        baseDate.setDate(baseDate.getDate() + 30);
        const finalExpiry = baseDate.toISOString();

        const { error: updateError } = await supabaseAdmin
          .from('members')
          .update({
            role: newRole,
            is_paid: true,
            expired_at: finalExpiry,
            status: 'active',
            approval_status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', actualUserId);

        if (updateError) {
          console.error(`[VERIFY API] DB Update Error for user ${userId}:`, updateError);
          throw updateError;
        }
        
        console.log(`[VERIFY API] DB Update SUCCESS for user: ${userId}`);
        return NextResponse.json({ success: true, message: 'Payment verified and DB updated' });

      } catch (dbErr) {
        console.error('[VERIFY API] Internal Process Error:', dbErr);
        return NextResponse.json({ success: false, error: dbErr.message }, { status: 500 });
      }
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
