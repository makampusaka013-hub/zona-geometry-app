import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const forceUpgrade = searchParams.get('force') === 'true';

    if (!userId) {
      return NextResponse.json({ error: 'userId parameter is required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // --- EMERGENCY FORCE UPGRADE ---
    let forceResult = null;
    if (forceUpgrade) {
      console.log(`[DEBUG] Emergency Force Upgrade triggered for: ${userId}`);
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 30);
      
      const { data: updated, error: updError } = await supabaseAdmin
        .from('members')
        .update({
          role: 'pro',
          is_paid: true,
          expired_at: newExpiry.toISOString(),
          approval_status: 'active',
          status: 'active'
        })
        .eq('user_id', userId)
        .select()
        .single();
      
      if (updError) forceResult = { success: false, error: updError.message };
      else forceResult = { success: true, member: updated };
    }

    // --- MIDTRANS CONFIG CHECK ---
    let midtransCheck = 'Untested';
    try {
      const auth = Buffer.from(process.env.MIDTRANS_SERVER_KEY + ':').toString('base64');
      const midRes = await fetch('https://api.sandbox.midtrans.com/v2/charge', {
         method: 'POST',
         headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
         body: JSON.stringify({ payment_type: 'bank_transfer', transaction_details: { order_id: 'test-' + Date.now(), gross_amount: 100 } })
      });
      // We expect a 400 or something, but if it's 401, the key is WRONG.
      if (midRes.status === 401) midtransCheck = 'ERROR: INVALID SERVER KEY (401 Unauthorized)';
      else midtransCheck = `OK (Status ${midRes.status})`;
    } catch (e) {
      midtransCheck = 'CONNECTION ERROR: ' + e.message;
    }

    // Check Member Row
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Check Config
    const configCheck = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasMidtransServerKey: !!process.env.MIDTRANS_SERVER_KEY,
      midtransKeyValidity: midtransCheck,
      hasAppUrl: !!process.env.APP_URL,
      appUrlValue: process.env.APP_URL
    };

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      userId,
      forceUpgradeResult: forceResult,
      configCheck,
      memberData: member || 'Not found',
      memberError: memberError || null,
      instruction: forceUpgrade ? "Account should be PRO now. Check your Dashboard!" : "To manually bypass the payment bug for this user, add '&force=true' to this URL."
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
