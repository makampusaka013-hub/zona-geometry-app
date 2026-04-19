const fs = require('fs');
const path = require('path');

const dashContent = `'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const isViewMode = member?.role === 'view';
  const canAddProject = member?.role === 'pro' || member?.role === 'admin';

  const loadData = useCallback(async () => {
    setLoadError(null);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace('/login');
      return;
    }

    const { data: row, error: memberError } = await supabase
      .from('members')
      .select('user_id, full_name, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      setLoadError(memberError.message);
      setMember(null);
    } else {
      setMember(row ?? { user_id: user.id, full_name: null, role: 'view' });
    }

    const { data: projectRows, error: projectsError } = await supabase
      .from('projects')
      .select('id, updated_at')
      .order('updated_at', { ascending: false });

    if (projectsError) {
      setProjects([]);
    } else {
      setProjects(projectRows ?? []);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0f172a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-slate-900 dark:border-t-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a]">
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e293b]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
            {member?.full_name ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">{member.full_name}</p>
            ) : null}
          </div>
          {member?.role === 'admin' ? (
            <Link
              href="/admin/upload-data"
              className="hidden md:inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1e293b] px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-[#0f172a] focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Update Data Master
            </Link>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1e293b] px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-[#0f172a] focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {loadError && (
          <div
            className="mb-6 rounded-lg border border-amber-200 dark:border-amber-700/30 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-400"
            role="status"
          >
            Gagal memuat profil: {loadError}
          </div>
        )}

        {isViewMode && (
          <div
            className="mb-6 rounded-xl border border-amber-200 dark:border-amber-700/30 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-950 dark:text-amber-300 sm:px-5 sm:py-4"
            role="region"
            aria-label="Mode View"
          >
            <p className="font-medium">
              Anda dalam Mode View. Hubungi Admin untuk membuat proyek (Upgrade ke Pro)
            </p>
          </div>
        )}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Proyek</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/katalog-ahsp"
              className="inline-flex items-center justify-center rounded-lg border border-indigo-200 dark:border-amber-700/50 bg-indigo-50 dark:bg-amber-900/20 px-4 py-2.5 text-sm font-semibold text-indigo-700 dark:text-amber-400 shadow-sm transition hover:bg-indigo-100 dark:hover:bg-amber-900/40 focus:outline-none"
            >
              Katalog AHSP Lengkap
            </Link>
            {canAddProject ? (
              <Link
                href="/dashboard/new-project"
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 dark:bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              >
                Tambah Proyek Baru
              </Link>
            ) : (
              <button
                type="button"
                disabled
                title={
                  isViewMode
                    ? 'Mode View — hubungi Admin untuk upgrade ke Pro'
                    : 'Hanya akun Pro atau Admin yang dapat menambah proyek'
                }
                className="rounded-lg bg-slate-400 px-4 py-2.5 text-sm font-semibold text-white shadow-sm cursor-not-allowed opacity-90"
              >
                Tambah Proyek Baru
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e293b] shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 dark:bg-[#0f172a]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100 sm:px-6">
                    Nama proyek
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100 sm:px-6">
                    Kode
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100 sm:px-6">
                    Terakhir diubah
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400 sm:px-6">
                      Belum ada proyek. {isViewMode ? 'Mode View tidak dapat menambah proyek baru.' : ''}
                    </td>
                  </tr>
                ) : (
                  projects.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:bg-[#0f172a]/80">
                      <td className="px-4 py-3 text-slate-900 dark:text-slate-100 sm:px-6">{p.name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 sm:px-6">{p.code ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 sm:px-6">
                        {p.updated_at
                          ? new Date(p.updated_at).toLocaleString('id-ID', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
`;

fs.writeFileSync(path.join(__dirname, 'app/dashboard/page.js'), dashContent);
console.log('Restored and patched dashboard successfully');
