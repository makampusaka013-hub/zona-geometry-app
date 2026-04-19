'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [toast, setToast] = useState('');

  // Editable fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data: { user: authUser }, error } = await supabase.auth.getUser();
    if (error || !authUser) {
      router.replace('/login');
      return;
    }
    setUser(authUser);

    const { data: row } = await supabase
      .from('members')
      .select('*')
      .eq('user_id', authUser.id)
      .maybeSingle();

    let finalRow = row;
    if (!row || row.approval_status === 'pending' || !row.expired_at) {
      try {
        const res = await fetch('/api/auth/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: authUser.id,
            email: authUser.email,
            fullName: row?.full_name || authUser.user_metadata?.full_name,
            currentRole: row?.role
          })
        });
        const result = await res.json();
        if (result.success && result.member) {
          finalRow = result.member;
        }
      } catch (err) {
        console.error('Profile Auto-Activate failed:', err);
      }
    }

    const m = finalRow || { user_id: authUser.id, full_name: '', role: 'normal', phone: '', company: '', position: '' };
    setMember(m);
    setFullName(m.full_name || authUser.user_metadata?.full_name || '');
    setPhone(m.phone || '');
    setCompany(m.company || '');
    setPosition(m.position || '');
    setLoading(false);
  }, [router]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setToast('');

    const payload = {
      user_id: user.id,
      full_name: fullName.trim() || null,
      phone: phone.trim() || null,
      company: company.trim() || null,
      position: position.trim() || null,
    };

    const { error } = await supabase
      .from('members')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      setToast('Gagal menyimpan: ' + error.message);
    } else {
      setToast('Profil berhasil diperbarui!');
      setTimeout(() => setToast(''), 3000);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-800 border-t-indigo-600 dark:border-t-orange-500" />
      </div>
    );
  }

  const roleBadge = {
    admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    advance: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    pro: 'bg-indigo-100 text-indigo-700 dark:bg-orange-900/30 dark:text-orange-400',
    normal: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Profile Header Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-black/20">
        {/* Banner */}
        <div className="h-28 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-400 dark:from-orange-600 dark:via-orange-700 dark:to-slate-900 relative">
          <div className="absolute -bottom-10 left-6">
            <div className="h-20 w-20 rounded-2xl bg-white dark:bg-slate-800 border-4 border-white dark:border-slate-800 shadow-lg flex items-center justify-center text-3xl font-bold text-indigo-600 dark:text-orange-400 select-none">
              {fullName ? fullName.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          </div>
        </div>

        <div className="pt-14 px-6 pb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{fullName || 'Belum ada nama'}</h1>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${roleBadge[member?.role] || roleBadge.normal}`}>
              {member?.role || 'normal'}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
          {company && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{position ? `${position} di ` : ''}{company}</p>}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mt-4 rounded-lg px-4 py-3 text-sm font-medium shadow-sm transition-all ${
          toast.startsWith('Gagal') 
            ? 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800' 
            : 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
        }`}>
          {toast}
        </div>
      )}

      {/* Edit Form */}
      <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Informasi Profil</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Perbarui data personal Anda</p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Email (Read-only) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              readOnly
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Email tidak dapat diubah melalui halaman ini</p>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nama Lengkap</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 dark:focus:border-orange-500 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-orange-500 outline-none transition-colors"
              placeholder="Masukkan nama lengkap"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nomor Telepon</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 dark:focus:border-orange-500 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-orange-500 outline-none transition-colors"
              placeholder="08xxxxxxxxxx"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {/* Company */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Perusahaan / Instansi</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 dark:focus:border-orange-500 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-orange-500 outline-none transition-colors"
                placeholder="CV / PT / Dinas"
              />
            </div>

            {/* Position */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Jabatan</label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 dark:focus:border-orange-500 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-orange-500 outline-none transition-colors"
                placeholder="Estimator / PM / Direktur"
              />
            </div>
          </div>

          {/* Role (Read-only) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Role Akun</label>
            <input
              type="text"
              value={(member?.role || 'normal').toUpperCase()}
              readOnly
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed uppercase font-mono"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Role hanya dapat diubah oleh Admin</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-indigo-600 dark:bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 dark:hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </div>

      {/* Account Info */}
      <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Informasi Akun</h2>
        </div>
        <div className="px-6 py-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">User ID</span>
            <span className="font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{user?.id?.slice(0, 12)}...</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Provider</span>
            <span className="text-slate-700 dark:text-slate-300">{user?.app_metadata?.provider || 'email'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Terakhir Login</span>
            <span className="text-slate-700 dark:text-slate-300">
              {user?.last_sign_in_at
                ? new Date(user.last_sign_in_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                : '-'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Akun Dibuat</span>
            <span className="text-slate-700 dark:text-slate-300">
              {user?.created_at
                ? new Date(user.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                : '-'}
            </span>
          </div>
          <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 font-bold">Masa Aktif Akun</span>
            <span className={`font-bold ${
              member?.expired_at && new Date(member.expired_at) < new Date()
                ? 'text-red-500'
                : 'text-indigo-600 dark:text-orange-500'
            }`}>
              {member?.expired_at
                ? new Date(member.expired_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                : 'Tanpa Batas'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
