'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogoMark } from '@/components/LogoMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { authService } from '@/lib/services/authService';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const message = searchParams?.get('message');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(null);


  const [showPassword, setShowPassword] = useState(false);

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError(null);
    const { error } = await authService.loginWithGoogle();
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: loginError } = await authService.login(email, password);

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }

    // 1. Cek status di tabel members
    const { data: member } = await authService.supabase
      .from('members')
      .select('approval_status, role')
      .eq('user_id', data.user.id)
      .maybeSingle();

    // 2. Tentukan tujuan redirect
    const adminEmail = 'zulfitrigoma@gmail.com';
    let target = '/dashboard';
    
    // Failsafe: Jika dia adalah admin utama, langsung ke dashboard
    if (data.user.email === adminEmail) {
      target = '/dashboard';
    } else if (!member || (member.approval_status !== 'active' && member.role !== 'admin')) {
      target = '/verify-notice';
    }

    // Success: Allow a tiny bit of time for cookies to sync then redirect
    setTimeout(() => {
      window.location.href = target;
    }, 500);
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#f8fafc] dark:bg-slate-950">
      {/* ── Background Mesh Orbs ─────────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 dark:bg-indigo-600/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-orange-500/10 dark:bg-orange-600/20 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* ── Nav/Header ────────────────────────────────────────── */}
      <header className="fixed top-0 w-full z-50 bg-white/20 dark:bg-slate-950/20 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <LogoMark className="w-7 h-7" />
            <span className="font-black text-slate-900 dark:text-white text-sm tracking-widest uppercase">Zona Geometry</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="relative z-10 w-full max-w-md my-6">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">
            Selamat Datang
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Masuk ke App RAB Anda
          </p>
        </div>

        {/* ── Glassmorphism Card ─────────────────────────────────── */}
        <div className="relative rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
          {message && (
            <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 text-center animate-in fade-in slide-in-from-top-2">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 text-center animate-in fade-in slide-in-from-top-2">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-3 text-slate-900 dark:text-white transition focus:border-orange-500/50 focus:outline-none focus:ring-4 focus:ring-orange-500/10 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none"
                placeholder="email@anda.com"
              />
            </div>

            <div className="relative">
              <div className="flex items-center justify-between mb-1.5 ml-1">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Kata Sandi
                </label>
                <Link 
                  href="/auth/forgot-password" 
                  className="text-[10px] font-bold text-indigo-600 dark:text-orange-400 hover:underline uppercase tracking-wider"
                >
                  Lupa Password?
                </Link>
              </div>
              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-3 text-slate-900 dark:text-white transition focus:border-orange-500/50 focus:outline-none focus:ring-4 focus:ring-orange-500/10 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-orange-500 transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="group relative w-full h-12 overflow-hidden rounded-xl bg-indigo-600 dark:bg-gradient-to-r dark:from-orange-500 dark:to-rose-500 font-bold text-white shadow-lg shadow-indigo-500/20 dark:shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              <div className="relative z-10 flex items-center justify-center gap-2">
                {loading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />}
                {loading ? 'Menghubungkan...' : 'Masuk'}
              </div>
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-white/5" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-[#0f172a] px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Atau
              </span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading || googleLoading}
            className="flex w-full h-11 items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-bold text-slate-700 dark:text-white transition-all hover:bg-slate-50 dark:hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
          >
            {googleLoading ? (
               <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-slate-700 dark:border-white/20 dark:border-t-white" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            Masuk dengan Google
          </button>

          <div className="mt-8 text-center space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Belum punya akun?{' '}
              <Link
                href="/register"
                className="font-bold text-blue-600 hover:text-blue-700 dark:text-orange-400 dark:hover:text-orange-300 transition-colors"
              >
                Daftar Gratis
              </Link>
            </p>
            <Link
              href="/"
              className="inline-block text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 hover:text-slate-400 transition-all"
            >
              ← Kembali ke Beranda
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
