'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CheckCircle, Clock, Ban, Trash2, UserCog } from 'lucide-react';
import { toast } from '@/lib/toast';

const STATUS_CONFIG = {
  active:    { label: 'Aktif',    color: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle },
  pending:   { label: 'Menunggu', color: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock },
  suspended: { label: 'Suspend',  color: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-400', icon: Ban },
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) { router.replace('/login'); return; }
    const { data: memberData } = await supabase.from('members').select('role').eq('user_id', user.id).single();
    if (memberData?.role !== 'admin') { router.replace('/dashboard'); return; }
    const { data: usersData, error: rpcError } = await supabase.rpc('get_all_users_admin');
    if (rpcError) setError(`Gagal mengambil data user: ${rpcError.message}. Pastikan Anda telah menjalankan skrip SQL di Supabase.`);
    else setUsers(usersData || []);
    setLoading(false);
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleApproveStatus(id, newStatus) {
    try {
      const label = { active: 'Aktifkan', pending: 'Set Pending', suspended: 'Suspend' }[newStatus];
      const confirmed = await toast.confirm(`${label} akun ini?`, `User akan diubah statusnya menjadi ${label}.`);
      if (!confirmed) return;
      setLoading(true);
      
      const { data: wasUpdated, error } = await supabase.rpc('admin_set_user_status', {
        target_id: id,
        new_status: newStatus
      });

      if (error) throw error;
      
      if (!wasUpdated) {
        toast.warning('Gagal: User tidak ditemukan di database.');
      } else {
        toast.success('Berhasil memperbarui status!');
        await loadData();
      }
    } catch (err) {
      console.error('RPC Error:', err);
      toast.error(`Gagal Update Status: ${err.message || 'Cek koneksi'}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(id, newRole) {
    try {
      const confirmed = await toast.confirm(`Ubah role menjadi ${newRole.toUpperCase()}?`, `Hak akses user ini akan segera berubah ke tier ${newRole}.`);
      if (!confirmed) return;
      setLoading(true);

      const { data: wasUpdated, error } = await supabase.rpc('admin_set_user_role', {
        target_id: id,
        new_role: newRole
      });

      if (error) throw error;

      if (!wasUpdated) {
        toast.warning('Gagal: ID User tidak ditemukan.');
      } else {
        toast.success('Berhasil memperbarui role!');
        await loadData();
      }
    } catch (err) {
      console.error('RPC Error:', err);
      toast.error(`Gagal Update Role: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleExpiredChange(id, newDate) {
    try {
      setLoading(true);
      const { error } = await supabase.rpc('admin_set_user_expiry', {
        target_id: id,
        new_expiry: newDate ? new Date(newDate).toISOString() : null
      });

      if (error) throw error;
      
      await loadData();
    } catch (err) {
      console.error('RPC Error:', err);
      toast.error(`Gagal Update Masa Aktif: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(id, userName) {
    const confirmed = await toast.confirm(`Hapus user ${userName || 'ini'}?`, 'Tindakan ini permanen dan tidak dapat dibatalkan.');
    if (!confirmed) return;
    setLoading(true);
    // Note: delete_user_entirely might still need the actual user_id (Auth ID), 
    // so we need to find the auth_user_id from the user data if needed.
    // For now, assuming it still uses the user_id returned by RPC.
    const target = users.find(u => u.user_id === id);
    const { error } = await supabase.rpc('delete_user_entirely', { target_user_id: target?.auth_user_id || id });
    if (error) toast.error(`Gagal menghapus user: ${error.message}`);
    loadData();
    setLoading(false);
  }

  const filtered = filterStatus === 'all' ? users : users.filter(u => {
    const status = u.user_role === 'admin' ? 'active' : (u.user_status || 'pending');
    return status === filterStatus;
  });

  const pendingCount = users.filter(u => u.user_role !== 'admin' && (u.user_status || 'pending') === 'pending').length;

  if (loading) return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-indigo-600 dark:border-t-orange-500" />
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <UserCog className="w-6 h-6 text-indigo-600 dark:text-orange-500" />
            Manajemen User Zona Geometry-App
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Kelola hak akses, persetujuan, dan role pengguna.</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-xl text-sm font-bold">
            <Clock className="w-4 h-4" />
            {pendingCount} user menunggu persetujuan
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: 'all', label: 'Semua' },
          { key: 'pending', label: `Menunggu (${users.filter(u => (u.user_status||'pending') === 'pending').length})` },
          { key: 'active', label: `Aktif (${users.filter(u => u.user_status === 'active').length})` },
          { key: 'suspended', label: `Suspend (${users.filter(u => u.user_status === 'suspended').length})` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFilterStatus(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${filterStatus === key ? 'bg-indigo-600 dark:bg-orange-500 text-white border-transparent' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-sm dark:bg-red-900/10 dark:border-red-900/30 dark:text-red-400">{error}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e293b] shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-left text-sm">
              <thead className="bg-slate-50 dark:bg-[#0f172a]">
                <tr>
                  <th scope="col" className="px-5 py-3 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-widest">Email / Nama</th>
                  <th scope="col" className="px-5 py-3 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-widest">Tgl Bergabung</th>
                  <th scope="col" className="px-5 py-3 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-widest text-center">Status Akun</th>
                  <th scope="col" className="px-5 py-3 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-widest text-center">Masa Aktif</th>
                  <th scope="col" className="px-5 py-3 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-widest text-center">Role Tier</th>
                  <th scope="col" className="px-5 py-3 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-widest text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">Belum ada user pada filter ini.</td></tr>
                ) : filtered.map((u) => {
                  const isAdmin = u.user_role === 'admin';
                  const approvalStatus = isAdmin ? 'active' : (u.user_status || 'pending');
                  const sCfg = STATUS_CONFIG[approvalStatus];
                  const SIcon = sCfg.icon;
                  return (
                    <tr key={u.user_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{u.user_email || 'Tanpa Email'}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{u.user_full_name || 'Tanpa Nama'}</div>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(u.user_created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {Object.entries(STATUS_CONFIG).map(([s, cfg]) => {
                            const Icon = cfg.icon;
                            const isActive = approvalStatus === s;
                            
                            // Untuk admin, hanya tampilkan status Aktif
                            if (isAdmin && s !== 'active') return null;

                            return (
                              <button key={s} 
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (!isActive && !isAdmin) handleApproveStatus(u.user_id, s);
                                }}
                                disabled={loading || isAdmin}
                                title={isAdmin ? 'Admin selalu aktif' : (isActive ? `Status: ${cfg.label}` : `Set ${cfg.label}`)}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset transition-all 
                                  ${isActive 
                                    ? cfg.color + ' scale-105' 
                                    : 'bg-slate-50 text-slate-400 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 opacity-50 hover:opacity-100 hover:ring-slate-300'} 
                                  ${isAdmin ? 'cursor-default' : (loading ? 'cursor-wait' : 'cursor-pointer')}`}
                              >
                                <Icon className="w-2.5 h-2.5" />
                                {cfg.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <input type="date"
                          value={u.user_expired_at ? new Date(u.user_expired_at).toISOString().split('T')[0] : ''}
                          onChange={e => handleExpiredChange(u.user_id, e.target.value)}
                          disabled={loading}
                          className="block w-full max-w-[130px] mx-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f172a] text-slate-800 dark:text-slate-100 px-2 py-1 text-xs font-semibold focus:border-indigo-500 dark:focus:border-orange-500 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-orange-500 shadow-sm disabled:opacity-50"
                        />
                      </td>
                      <td className="px-5 py-4 text-center">
                        <select value={u.user_role} onChange={e => handleRoleChange(u.user_id, e.target.value)}
                          disabled={loading}
                          className="block w-full max-w-[110px] mx-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f172a] text-slate-800 dark:text-slate-100 px-2 py-1 text-xs font-bold focus:border-indigo-500 dark:focus:border-orange-500 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-orange-500 shadow-sm disabled:opacity-50">
                          <option value="normal">Normal</option>
                          <option value="pro">PRO</option>
                          <option value="advance">ADVANCE</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <button onClick={() => handleDeleteUser(u.user_id, u.user_full_name)} title="Hapus user permanen"
                          disabled={loading}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all focus:outline-none disabled:opacity-30">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
