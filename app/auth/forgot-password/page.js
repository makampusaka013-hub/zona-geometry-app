'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authService } from '@/lib/services/authService';
import { LogoMark } from '@/components/LogoMark';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const { error } = await authService.forgotPassword(email);
      if (error) throw error;
      
      setMessage('Link reset password telah dikirim ke email Anda. Silakan cek Inbox atau folder Spam.');
    } catch (err) {
      console.error('Forgot Password UI Error:', err);
      
      // Handle specific Supabase error messages for better UX
      let errorMessage = err.message || 'Gagal mengirim email reset.';
      
      if (errorMessage.toLowerCase().includes('rate limit')) {
        errorMessage = 'Terlalu banyak permintaan. Silakan tunggu 60 detik sebelum mencoba lagi.';
      } else if (errorMessage.toLowerCase().includes('email provider')) {
        errorMessage = 'Layanan email sedang bermasalah atau belum dikonfigurasi. Hubungi Admin.';
      } else if (errorMessage.toLowerCase().includes('network')) {
        errorMessage = 'Koneksi internet bermasalah. Periksa jaringan Anda.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#f8fafc] dark:bg-slate-950">
      {/* Background Mesh */}
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
            Lupa Password?
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Masukkan email Anda untuk menerima link reset password.
          </p>
        </div>

        <div className="relative rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
          {message && (
            <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 text-center animate-in fade-in slide-in-from-top-2">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400 text-center animate-in fade-in slide-in-from-top-2">
              {error}
            </div>
          )}

          {!message && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                  Email Terdaftar
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-3 text-slate-900 dark:text-white transition focus:border-orange-500/50 focus:outline-none focus:ring-4 focus:ring-orange-500/10 outline-none"
                  placeholder="email@anda.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full h-12 overflow-hidden rounded-xl bg-indigo-600 dark:bg-gradient-to-r dark:from-orange-500 dark:to-rose-500 font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? 'Mengirim...' : 'Kirim Link Reset'}
              </button>
            </form>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/login"
              className="text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-orange-400 transition-colors"
            >
              ← Kembali ke Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
