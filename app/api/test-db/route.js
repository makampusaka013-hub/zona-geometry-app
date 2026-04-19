import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  
  if (!userId) {
    // Just fetch to see schema or existing members for debugging without args
    const { data: cols } = await supabaseAdmin.from('members').select('*').limit(1);
    return NextResponse.json({ cols });
  }

  // Update member forcefully
  const trialExpiry = new Date();
  trialExpiry.setDate(trialExpiry.getDate() + 7);

  const { data, error } = await supabaseAdmin
    .from('members')
    .upsert({
      user_id: userId,
      approval_status: 'active',
      role: 'normal',
      expired_at: trialExpiry.toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id', ignoreDuplicates: false })
    .select();
    
  return NextResponse.json({ data, error });
}
