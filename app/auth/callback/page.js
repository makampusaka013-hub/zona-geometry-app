'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('Memproses login...');
  const [errorDetails, setErrorDetails] = useState(null);
  const authProcessed = useRef(false);

  useEffect(() => {
    async function handleAuth() {
      if (authProcessed.current) return;
      authProcessed.current = true;

      // Safety timeout: Jika 15 detik belum redirect, tampilkan opsi manual
      const timeout = setTimeout(() => {
        setStatus('Proses memakan waktu lebih lama dari biasanya...');
        setErrorDetails('Koneksi sedang lambat atau terjadi kendala sinkronisasi. Silakan coba masuk ke Dashboard langsung atau ualangi login.');
      }, 15000);
      try {
        const code = searchParams.get('code');
        const next = searchParams.get('next') ?? '/dashboard';
        const error = searchParams.get('error');
        const error_description = searchParams.get('error_description');

        console.log('--- Client Auth Callback ---');
        console.log('Code present:', !!code);
        
        if (error) {
          setStatus('Gagal Login');
          setErrorDetails(error_description || error);
          return;
        }

        if (code || searchParams.get('type') === 'signup' || searchParams.get('type') === 'recovery') {
          setStatus('Memverifikasi akun...');
          
          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              console.error('Exchange error:', exchangeError);
              setStatus('Gagal menukar kode');
              setErrorDetails(exchangeError.message);
              return;
            }
          }

          // [OTOMATISASI AKTIVASI PREMIUM & VERIFIKASI EMAIL]
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              console.log('Processing user for premium verification:', user.id);
              setStatus('Menyiapkan keamanan akun...');
              
              // Cek status member saat ini
              const { data: currentMember } = await supabase
                .from('members')
                .select('approval_status, role, expired_at, is_verified_manual')
                .eq('user_id', user.id)
                .maybeSingle();

              // JIKA BELUM VERIFIKASI MANUAL -> Kirim Email & Redirect ke Notice
              if (!currentMember?.is_verified_manual && currentMember?.role !== 'admin') {
                try {
                  clearTimeout(timeout);
                  setStatus('Hampir selesai! Mohon cek email Anda.');
                  router.replace('/verify-notice');
                  return;
                } catch (sendErr) {
                  console.error('Failed to send initial verification:', sendErr);
                }
              }

              // Jika sudah verifikasi manual, pastikan status active (Safety Net)
              if (currentMember?.is_verified_manual && currentMember?.approval_status !== 'active') {
                setStatus('Mengaktifkan akses premium...');
                await fetch('/api/auth/activate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: user.id, currentRole: currentMember?.role })
                });
              }
            }
          } catch (dbErr) {
            console.error('Gagal integrasi premium:', dbErr);
          }

          clearTimeout(timeout);
          setStatus('Login Berhasil! Mengalihkan...');
          router.replace(next);
          return;
        }

        // Cek jika sudah login (Silent Login)
        setStatus('Memeriksa sesi aktif...');
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          clearTimeout(timeout);
          setStatus('Sudah terlogin! Mengalihkan...');
          router.push(next);
        } else {
          clearTimeout(timeout);
          setStatus('Gagal Login');
          setErrorDetails('Tidak ada kode login atau sesi yang ditemukan di URL.');
        }
      } catch (err) {
        setStatus('Terjadi kesalahan sistem');
        setErrorDetails(err.message);
      }
    }

    handleAuth();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl text-center">
        <div className="mb-6 flex justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500/20 border-t-orange-500" />
        </div>
        
        <h1 className="text-xl font-bold text-white mb-2">{status}</h1>
        
        {errorDetails && (
          <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{errorDetails}</p>
            <button 
              onClick={() => router.push('/login')}
              className="mt-4 text-xs font-bold text-orange-400 uppercase tracking-widest hover:text-orange-300 transition-colors"
            >
              ← Kembali ke Login
            </button>
          </div>
        )}

        <p className="mt-6 text-xs text-slate-500 uppercase tracking-[0.2em]">Zona Geometry Auth</p>
      </div>
    </div>
  );
}
