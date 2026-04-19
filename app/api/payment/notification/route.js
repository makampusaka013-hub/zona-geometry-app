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

    // 2. Get UserId and plan from custom fields
    let userId = body.custom_field1;
    let plan = body.custom_field2; // 'advance', 'pro', or 'normal'

    // 3. RECOVERY LOGIC: If custom fields are missing (Midtrans Sandbox bug), 
    // try to recover them from the order_id: ZP[X]-USERID-TIME
    if ((!userId || !plan) && order_id) {
      console.log('[MIDTRANS WEBHOOK] Attempting recovery from order_id:', order_id);
      const parts = order_id.split('-');
      if (parts.length >= 6) { // ZPX (1) + UUID (5) + TIME (1) = 7 parts
        const prefix = parts[0];
        // userId is between the prefix and the last part
        userId = parts.slice(1, -1).join('-');
        
        if (prefix === 'ZPA') plan = 'advance';
        else if (prefix === 'ZPP') plan = 'pro';
        else if (prefix === 'ZPN') plan = 'normal';
        
        console.log('[MIDTRANS WEBHOOK] Recovered data:', { userId, plan });
      }
    }

    if (!userId) {
      console.error('UserId missing in webhook payload after recovery attempt');
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // 4. Determine which role to assign (Primary Source of Truth: Order ID Prefix)
    let parsedPlan = plan;
    const roleMap = {
      advance: 'advance',
      pro: 'pro',
      normal: 'normal',
    };
    
    // Always check prefix first to avoid metadata loss issues
    if (order_id.startsWith('ZPA')) parsedPlan = 'advance';
    else if (order_id.startsWith('ZPP')) parsedPlan = 'pro';
    else if (order_id.startsWith('ZPN')) parsedPlan = 'normal';
    else if (!parsedPlan || !roleMap[parsedPlan]) parsedPlan = 'normal';

    const newRole = roleMap[parsedPlan] || 'normal';

    // 5. Process Payment Status
    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      console.log(`[MIDTRANS WEBHOOK] PROCESSING SUCCESS: User=${userId}, Plan=${parsedPlan}, OrderId=${order_id}`);

      try {
        // Get current expiration
        const { data: member, error: fetchError } = await supabaseAdmin
          .from('members')
          .select('expired_at, role')
          .eq('user_id', userId)
          .single();

        if (fetchError) {
          console.error(`[MIDTRANS WEBHOOK] DB Fetch Error for user ${userId}:`, fetchError);
          return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
        }

        console.log(`[MIDTRANS WEBHOOK] Current DB State: Role=${member.role}, ExpiredAt=${member.expired_at}`);

        // Safe Date Calculation
        let baseDate = new Date();
        if (member.expired_at) {
          const currentExp = new Date(member.expired_at);
          // Jika masa aktif masih di masa depan, tambahkan dari sana. Jika sudah lewat, tambahkan dari hari ini.
          if (!isNaN(currentExp.getTime()) && currentExp > new Date()) {
            baseDate = currentExp;
          }
        }
        
        console.log(`[MIDTRANS WEBHOOK] Base date for calculation:`, baseDate.toISOString());
        
        // Add 30 days
        baseDate.setDate(baseDate.getDate() + 30);
        const finalExpiry = baseDate.toISOString();

        console.log(`[MIDTRANS WEBHOOK] Updating user ${userId} to Role=${newRole}, Expiry=${finalExpiry}`);

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
          .eq('user_id', userId);

        if (updateError) {
          console.error(`[MIDTRANS WEBHOOK] DB Update Error for user ${userId}:`, updateError);
          throw updateError;
        }
        
        console.log(`[MIDTRANS WEBHOOK] DB Update SUCCESS for user: ${userId}`);
        return NextResponse.json({ success: true, message: 'Notification processed' });

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
