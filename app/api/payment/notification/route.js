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
    const body = await request.json();
    const {
      transaction_status,
      status_code,
      gross_amount,
      order_id,
      signature_key,
    } = body;
    console.log('[MIDTRANS WEBHOOK] Received payload:', JSON.stringify(body, null, 2));

    // 1. Verify Signature
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    
    // Midtrans gross_amount can be tricky (sometimes has .00)
    // We try to match what Midtrans sends exactly
    const combinedString = order_id + status_code + gross_amount + serverKey;
    const hash = crypto.createHash('sha512').update(combinedString).digest('hex');

    if (hash !== signature_key) {
      console.error('[MIDTRANS WEBHOOK] Signature Mismatch!');
      console.log('[MIDTRANS WEBHOOK] OrderId:', order_id);
      console.log('[MIDTRANS WEBHOOK] Status:', status_code);
      console.log('[MIDTRANS WEBHOOK] Gross:', gross_amount);
      // Don't log full server key, just first 4 chars for safety check
      console.log('[MIDTRANS WEBHOOK] ServerKey Check:', serverKey ? serverKey.substring(0, 4) + '...' : 'MISSING');
      
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }
    console.log('[MIDTRANS WEBHOOK] Signature valid for Order:', order_id);

    // 2. Get identifying metadata (with fallbacks)
    let userId = body.custom_field1;
    let plan = body.custom_field2;
    let userEmail = body.custom_field3; // Fallback cadangan

    // 3. RECOVERY LOGIC: ID & Plan extraction from order_id prefix
    const parts = order_id.split('-');
    if (parts.length >= 6) { 
      if (!userId) {
        userId = parts.slice(1, -1).join('-');
        console.log('[MIDTRANS WEBHOOK] userId recovered from order_id:', userId);
      }
      
      const prefix = parts[0];
      if (prefix === 'ZPA') plan = 'advance';
      else if (prefix === 'ZPP') plan = 'pro';
      else if (prefix === 'ZPN') plan = 'normal';
    }

    // Determine target role (normalize casing)
    let parsedPlan = (plan || '').toLowerCase();
    const roleMap = { advance: 'advance', pro: 'pro', normal: 'normal' };
    if (order_id.startsWith('ZPA')) parsedPlan = 'advance';
    else if (order_id.startsWith('ZPP')) parsedPlan = 'pro';
    else if (order_id.startsWith('ZPN')) parsedPlan = 'normal';
    const newRole = roleMap[parsedPlan] || 'normal';

    // 4. FIND USER (Primary: userId, Fallback: Email)
    let member = null;
    const { data: memberById } = await supabaseAdmin.from('members').select('*').eq('user_id', userId).maybeSingle();
    member = memberById;

    if (!member && userEmail) {
      console.log(`[MIDTRANS WEBHOOK] User ID ${userId} not found. Trying fallback to Email: ${userEmail}`);
      const { data: memberByEmail } = await supabaseAdmin.from('members').select('*').eq('email', userEmail).maybeSingle();
      member = memberByEmail;
    }

    if (!member) {
      console.error(`[MIDTRANS WEBHOOK] User NOT FOUND (ID: ${userId}, Email: ${userEmail}). Cannot process payment.`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const actualUserId = member.user_id;

    // 5. Process Payment Status
    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      console.log(`[MIDTRANS WEBHOOK] PROCESSING SUCCESS: Role=${newRole} for User=${actualUserId} (${member.full_name})`);
      
      // Calculate Expiry (Accumulative)
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
          approval_status: 'active',
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', actualUserId);

      if (updateError) {
        console.error(`[MIDTRANS WEBHOOK] DB Update Error for user ${actualUserId}:`, updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      
      console.log(`[MIDTRANS WEBHOOK] SYNC SUCCESS! User ${actualUserId} is now ${newRole}`);
      return NextResponse.json({ success: true, message: 'Notification processed' });
    }

      } catch (dbErr) {
        console.error('[MIDTRANS WEBHOOK] Internal Process Error:', dbErr);
        return NextResponse.json({ error: dbErr.message }, { status: 500 });
      }
    } else if (transaction_status === 'expire' || transaction_status === 'cancel') {
      console.log(`Payment failed/expired for user: ${userId}`);
    }

    return NextResponse.json({ status: 'OK' });

  } catch (error) {
    console.error('Midtrans Webhook Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
