'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { LogoMark } from '@/components/LogoMark';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check if session exists (Supabase automatically handles hash from URL)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // We might want to allow some time for hash parsing, but generally 
        // if no session, they shouldn't be here.
      }
    };
    checkSession();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.');
      return;
    }
    if (password.length < 6) {
      setError('Password minimal 6 karakter.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;
      
      setSuccess(true);
      setTimeout(() => {
        router.push('/login?message=Password berhasil diperbarui. Silakan login kembali.');
      }, 3000);
    } catch (err) {
      setError(err.message || 'Gagal memperbarui password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#f8fafc] dark:bg-slate-950">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 dark:bg-indigo-600/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-orange-500/10 dark:bg-orange-600/20 blur-[120px] animate-pulse" />
      </div>

      <header className="fixed top-0 w-full z-50 bg-white/20 dark:bg-slate-950/20 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <LogoMark className="w-7 h-7" />
            <span className="font-black text-slate-900 dark:text-white text-sm tracking-widest uppercase">Zona Geometry</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
            Perbarui Password
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Masukkan kata sandi baru untuk akun Anda.
          </p>
        </div>

        <div className="relative rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
          {success ? (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
                <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Berhasil!</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Password Anda telah diperbarui. Mengalihkan ke halaman login...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400 text-center animate-in fade-in slide-in-from-top-2">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                  Password Baru
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-3 text-slate-900 dark:text-white focus:border-orange-500/50 outline-none"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                  Konfirmasi Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-3 text-slate-900 dark:text-white focus:border-orange-500/50 outline-none"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full h-12 overflow-hidden rounded-xl bg-indigo-600 dark:bg-gradient-to-r dark:from-orange-500 dark:to-rose-500 font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? 'Memperbarui...' : 'Perbarui Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
