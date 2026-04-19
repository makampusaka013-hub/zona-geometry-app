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
    console.log('[MIDTRANS WEBHOOK] Received payload:', JSON.stringify(body, null, 2));

    // 1. Verify Signature
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    const combinedString = order_id + status_code + gross_amount + serverKey;
    const hash = crypto.createHash('sha512').update(combinedString).digest('hex');

    if (hash !== signature_key) {
      console.error('[MIDTRANS WEBHOOK] Invalid Signature. Calculated:', hash, 'Received:', signature_key);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }
    console.log('[MIDTRANS WEBHOOK] Signature valid.');

    // 2. Get UserId and plan from custom fields
    const userId = body.custom_field1;
    const plan = body.custom_field2; // 'advance', 'pro', or 'normal'

    if (!userId) {
      console.error('UserId missing in webhook payload');
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // 3. Determine which role to assign based on plan and order_id fallback
    // Fallback: parse plan from order_id if custom_field2 is missing or unreliable
    let parsedPlan = plan;
    const roleMap = {
      advance: 'advance',
      pro: 'pro',
      normal: 'normal',
    };
    
    if (!parsedPlan || !roleMap[parsedPlan]) {
      if (order_id.includes('ADVANCE')) parsedPlan = 'advance';
      else if (order_id.includes('PRO')) parsedPlan = 'pro';
      else if (order_id.includes('NORMAL')) parsedPlan = 'normal';
      else parsedPlan = 'normal'; // default
    }

    const newRole = roleMap[parsedPlan] || 'normal';

    // 4. Process Payment Status
    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      console.log(`Payment success for user: ${userId}, plan: ${plan}`);

      // Get current expiration
      const { data: member, error: fetchError } = await supabaseAdmin
        .from('members')
        .select('expired_at, role')
        .eq('user_id', userId)
        .single();

      if (fetchError) throw fetchError;

      // Calculate new expiration (stacks if already active)
      let baseDate = new Date();
      if (member.expired_at && new Date(member.expired_at) > new Date()) {
        baseDate = new Date(member.expired_at);
      }
      baseDate.setDate(baseDate.getDate() + 30);

      // Update Member to the correct role
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
      
      console.log(`User ${userId} upgraded to ${newRole} until ${baseDate.toISOString()}`);
    } else if (transaction_status === 'expire' || transaction_status === 'cancel') {
      console.log(`Payment failed/expired for user: ${userId}`);
    }

    return NextResponse.json({ status: 'OK' });

  } catch (error) {
    console.error('Midtrans Webhook Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
