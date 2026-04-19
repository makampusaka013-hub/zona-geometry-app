import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId parameter is required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

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
      hasAppUrl: !!process.env.APP_URL,
      appUrlValue: process.env.APP_URL
    };

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      userId,
      configCheck,
      memberData: member || 'Not found',
      memberError: memberError || null,
      instruction: "If your role is still 'normal' and 'is_paid' is false, it means your last payment was not synced. Please try a NEW transaction now with the updated code."
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
