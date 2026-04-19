import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// We use service role to bypass RLS because the webhook is an automated system call
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
      console.error('[MIDTRANS WEBHOOK] Malformed JSON payload');
      return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
    }

    const {
      transaction_status,
      status_code,
      gross_amount,
      order_id,
      signature_key,
      custom_field1: midtransUserId,
      custom_field2: midtransPlan,
      custom_field3: midtransEmail
    } = body || {};

    console.log('[MIDTRANS WEBHOOK] Received payload for Order:', order_id);

    // 2. Verify Signature
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    const combinedString = order_id + status_code + gross_amount + serverKey;
    const hash = crypto.createHash('sha512').update(combinedString).digest('hex');

    if (hash !== signature_key) {
      console.error('[MIDTRANS WEBHOOK] Signature Mismatch for Order:', order_id);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    // 3. Identification Synthesis
    let userId = midtransUserId;
    let plan = midtransPlan;
    let userEmail = midtransEmail;

    // RECOVERY LOGIC: Parse from order_id if metadata is missing (ZPN-UUID-RAND)
    if ((!userId || !plan) && order_id) {
      const parts = order_id.split('-');
      if (parts.length >= 6) {
        if (!userId) userId = parts.slice(1, -1).join('-');
        const prefix = parts[0];
        if (prefix === 'ZPA') plan = 'advance';
        else if (prefix === 'ZPP') plan = 'pro';
        else if (prefix === 'ZPN') plan = 'normal';
      }
    }

    // Map Role
    let parsedPlan = (plan || '').toLowerCase();
    const roleMap = { advance: 'advance', pro: 'pro', normal: 'normal' };
    if (order_id.startsWith('ZPA')) parsedPlan = 'advance';
    else if (order_id.startsWith('ZPP')) parsedPlan = 'pro';
    else if (order_id.startsWith('ZPN')) parsedPlan = 'normal';
    const newRole = roleMap[parsedPlan] || 'normal';

    // 4. FIND USER (Primary: userId, Fallback: Email)
    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      try {
        let member = null;
        
        if (userId) {
          const { data: mById } = await supabaseAdmin.from('members').select('*').eq('user_id', userId).maybeSingle();
          member = mById;
        }

        if (!member && userEmail) {
          console.log(`[MIDTRANS WEBHOOK] User ID not found. Trying Metadata Email: ${userEmail}`);
          const { data: mByEmail } = await supabaseAdmin.from('members').select('*').eq('email', userEmail).maybeSingle();
          member = mByEmail;
        }

        if (!member) {
          console.error(`[MIDTRANS WEBHOOK] ABORT: User NOT FOUND (ID: ${userId}, Email: ${userEmail}). Notification orphaned.`);
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const actualUserId = member.user_id;

        // 4.5. IDEMPOTENCY CHECK (Anti Double-Count)
        if (member.last_order_id === order_id) {
          console.log(`[MIDTRANS WEBHOOK] Order ${order_id} already processed for user ${actualUserId}. Skipping.`);
          return NextResponse.json({ success: true, message: 'Order already processed' });
        }

        // 5. Update Status and Expiry (Non-Accumulative for Upgrades/Trials)
        let baseDate = new Date();

        // JIKA perpanjangan paket yang SAMA, baru kita akumulasikan waktunya
        // JIKA pindah paket (Normal -> Pro) atau baru pertama bayar (Trial -> Paid), reset dari HARI INI
        if (member.is_paid && member.role === newRole && member.expired_at) {
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
            expired_at: baseDate.toISOString(),
            status: 'active',
            approval_status: 'active',
            last_order_id: order_id // Kunci idempotensi
          })
          .eq('user_id', actualUserId);

        if (updateError) {
          console.error(`[MIDTRANS WEBHOOK] Database Update Failed for ${actualUserId}:`, updateError);
          return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
        }
        
        console.log(`[MIDTRANS WEBHOOK] SYNC SUCCESS! User ${actualUserId} is now ${newRole}`);
        return NextResponse.json({ success: true, message: 'Notification processed' });

      } catch (dbErr) {
        console.error('[MIDTRANS WEBHOOK] Internal Sync Logic Crash:', dbErr);
        return NextResponse.json({ error: dbErr.message }, { status: 500 });
      }
    } else if (transaction_status === 'expire' || transaction_status === 'cancel') {
      console.log(`[MIDTRANS WEBHOOK] Payment failed/expired for Order: ${order_id}`);
      return NextResponse.json({ status: 'handled_failure' });
    }

    return NextResponse.json({ status: 'pending/unhandled' });

  } catch (error) {
    console.error('[MIDTRANS WEBHOOK] Fatal Global Error:', error);
    return NextResponse.json({ error: error.message || 'Webhook internal error' }, { status: 500 });
  }
}
