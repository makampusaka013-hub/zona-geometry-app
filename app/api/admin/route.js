import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseAuth';

// Inisialisasi Supabase Admin (Bypass RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Verifikasi apakah user yang memanggil adalah Admin
 */
async function verifyAdmin() {
  const supabaseServer = await createServerSupabaseClient();
  const { data: { user }, error } = await supabaseServer.auth.getUser();

  if (error || !user) return { error: 'Unauthorized', status: 401 };

  const { data: member, error: memberError } = await supabaseAdmin
    .from('members')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (memberError || member?.role !== 'admin') {
    return { error: 'Forbidden: Admin access required', status: 403 };
  }

  return { user };
}

/**
 * GET: Mengambil data user (Pengganti RPC get_all_users_admin)
 */
export async function GET(request) {
  const adminCheck = await verifyAdmin();
  if (adminCheck.error) return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });

  const { action } = Object.fromEntries(new URL(request.url).searchParams);

  if (action === 'get_profit') {
    const { data, error } = await supabaseAdmin.rpc('get_global_profit');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  const { data, error } = await supabaseAdmin.rpc('get_all_users_admin');
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/**
 * POST: Melakukan aksi administratif (Pengganti berbagai RPC Admin)
 */
export async function POST(request) {
  const adminCheck = await verifyAdmin();
  if (adminCheck.error) return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });

  try {
    const { action, payload } = await request.json();

    let result;

    switch (action) {
      case 'activate_user':
        result = await supabaseAdmin.rpc('activate_user_admin', { p_user_id: payload.userId });
        break;
      
      case 'set_role':
        result = await supabaseAdmin.rpc('admin_set_user_role', { 
          target_id: payload.userId, 
          new_role: payload.role 
        });
        break;

      case 'set_status':
        result = await supabaseAdmin.rpc('admin_set_user_status', { 
          target_id: payload.userId, 
          new_status: payload.status 
        });
        break;

      case 'set_expiry':
        result = await supabaseAdmin.rpc('admin_set_user_expiry', { 
          target_id: payload.userId, 
          new_expiry: payload.expiry 
        });
        break;

      case 'delete_user':
        result = await supabaseAdmin.rpc('delete_user_entirely', { 
          target_user_id: payload.userId 
        });
        break;

      case 'update_profit':
        result = await supabaseAdmin.rpc('update_global_profit', { 
          p_profit: payload.profit 
        });
        break;

      case 'sync_catalog':
        result = await supabaseAdmin.rpc('sync_all_catalog_to_konversi');
        break;

      case 'sync_master_konversi':
        result = await supabaseAdmin.rpc('sync_master_konversi');
        break;

      case 'upload_ahsp':
        result = await supabaseAdmin.rpc('upload_ahsp_csv', { p_rows: payload.rows });
        break;

      case 'upload_harga':
        result = await supabaseAdmin.rpc('upload_harga_dasar_csv', { p_rows: payload.rows });
        break;

      case 'auto_map':
        result = await supabaseAdmin.rpc('auto_map_same_items');
        break;

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    if (result.error) throw result.error;

    return NextResponse.json({ success: true, data: result.data });

  } catch (err) {
    console.error(`[ADMIN API] Error in action ${request.action}:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
