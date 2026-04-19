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
    // 1. Safe Body Parsing
    let body;
    try {
      body = await request.json();
    } catch (e) {
      console.error('[VERIFY] Malformed JSON body');
      return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
    }

    const { order_id, userId: fallbackUserId, userEmail: dashboardEmail, plan: fallbackPlan } = body || {};

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    console.log(`[VERIFY] Checking status for order: ${order_id}`);

    // 2. Defensive Midtrans Status Check (Prevent 500 if order_id not found)
    let statusResponse = null;
    try {
      statusResponse = await coreApi.transaction.status(order_id);
    } catch (midtransError) {
      console.error(`[VERIFY] Midtrans API Call Failed for ${order_id}:`, midtransError.message);
      // Jika error adalah 404 (Not Found), jangan langsung crash. 
      // Tetap lanjutkan pencarian jika kita punya data lain, atau kembalikan 404 yang sopan.
      if (midtransError.message.includes('404')) {
        return NextResponse.json({ 
          success: false, 
          error: 'Transaction not found in Midtrans. Please wait a few seconds and try again.',
          can_retry: true 
        }, { status: 404 });
      }
      throw midtransError; // Lempar ke global catch jika error serius (koneksi, auth)
    }

    const { 
      transaction_status, 
      custom_field1: midtransUserId, 
      custom_field2: midtransPlan,
      custom_field3: midtransEmail 
    } = statusResponse || {};

    // 3. Identification Synthesis
    let userId = midtransUserId || fallbackUserId;
    let plan = midtransPlan || fallbackPlan;
    let userEmail = midtransEmail; // Email dari metadata pembayaran

    // RECOVERY LOGIC: Parse from order_id if still missing (ZPN-UUID-RAND)
    if ((!userId || !plan) && order_id) {
      console.log('[VERIFY] Attempting recovery from order_id structure:', order_id);
      const parts = order_id.split('-');
      if (parts.length >= 6) {
        if (!userId) {
          userId = parts.slice(1, -1).join('-');
        }
        const prefix = parts[0];
        if (prefix === 'ZPA') plan = 'advance';
        else if (prefix === 'ZPP') plan = 'pro';
        else if (prefix === 'ZPN') plan = 'normal';
      }
    }

    // Identify Desired Role
    let parsedPlan = (plan || '').toLowerCase();
    const roleMap = { advance: 'advance', pro: 'pro', normal: 'normal' };
    if (order_id.startsWith('ZPA')) parsedPlan = 'advance';
    else if (order_id.startsWith('ZPP')) parsedPlan = 'pro';
    else if (order_id.startsWith('ZPN')) parsedPlan = 'normal';
    const newRole = roleMap[parsedPlan] || 'normal';

    console.log(`[VERIFY] Final Logic -> Status: ${transaction_status}, TargetUser: ${userId}, Role: ${newRole}`);

    // 4. Synchronization Guard
    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      try {
        let member = null;
        
        // Strategy A: Lookup by User ID
        if (userId) {
          const { data: mById } = await supabaseAdmin.from('members').select('*').eq('user_id', userId).maybeSingle();
          member = mById;
        }

        // Strategy B: Lookup by Midtrans Metadata Email
        if (!member && userEmail) {
          console.log(`[VERIFY] User ID not found. Trying Midtrans Metadata Email: ${userEmail}`);
          const { data: mByMidEmail } = await supabaseAdmin.from('members').select('*').eq('email', userEmail).maybeSingle();
          member = mByMidEmail;
        }

        // Strategy C: Lookup by Dashboard Current Session Email
        if (!member && dashboardEmail) {
          console.log(`[VERIFY] Still not found. Trying Session Email: ${dashboardEmail}`);
          const { data: mByDashEmail } = await supabaseAdmin.from('members').select('*').eq('email', dashboardEmail).maybeSingle();
          member = mByDashEmail;
        }

        if (!member) {
          console.error(`[VERIFY] ABORT: User NOT FOUND in database (Tried ID:${userId}, MidEmail:${userEmail}, DashEmail:${dashboardEmail})`);
          return NextResponse.json({ error: 'User does not exist in our database. Sync failed.' }, { status: 404 });
        }

        const actualUserId = member.user_id;

        // 5. Update Status and Expiry
        let baseDate = new Date();
        if (member.expired_at) {
          const currentExp = new Date(member.expired_at);
          if (!isNaN(currentExp.getTime()) && currentExp > new Date()) {
            baseDate = currentExp;
          }
        }
        baseDate.setDate(baseDate.getDate() + 30);
        
        const { error: updateError } = await supabaseAdmin
          .from('members')
          .update({
            role: newRole,
            is_paid: true,
            expired_at: baseDate.toISOString(),
            status: 'active',
            approval_status: 'active'
          })
          .eq('user_id', actualUserId);

        if (updateError) {
          console.error(`[VERIFY] Database Update Failed for ${actualUserId}:`, updateError);
          return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
        }
        
        console.log(`[VERIFY] SYNC SUCCESS for ${actualUserId}. Status: ${newRole}, Expiry: ${baseDate.toISOString()}`);
        return NextResponse.json({ 
          success: true, 
          message: 'Payment verified and status updated!',
          member: { userId: actualUserId, role: newRole }
        });

      } catch (dbErr) {
        console.error('[VERIFY] Internal Sync Logic Crash:', dbErr);
        return NextResponse.json({ error: dbErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: false, 
      message: `Transaction status is '${transaction_status}'. Waiting for settlement.` 
    });

  } catch (error) {
    console.error('[VERIFY] Fatal Global Error:', error);
    return NextResponse.json({ error: error.message || 'System verification error' }, { status: 500 });
  }
}
