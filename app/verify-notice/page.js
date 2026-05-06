'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Mail, ArrowLeft, RefreshCcw, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function VerifyNoticePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const router = useRouter();

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      // Cek jika tiba-tiba sudah terverifikasi (refresh otomatis)
      const { data: member } = await supabase
        .from('members')
        .select('is_verified_manual, approval_status')
        .eq('user_id', session.user.id)
        .maybeSingle();
      
      const isVerified = member?.is_verified_manual || member?.approval_status === 'active';
      
      if (isVerified) {
        router.push('/dashboard');
      } else {
        // AUTO-SEND: Jika masuk halaman ini dan belum ada pesan, pastikan email terkirim
        if (!message && !loading) {
          triggerInitialSend(session.user);
        }
      }
    }
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function triggerInitialSend(currentUser) {
    try {
      await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          email: currentUser.email,
          fullName: currentUser.user_metadata?.full_name
        })
      });
    } catch (e) {
      console.error('Initial auto-send failed:', e);
    }
  }

  async function handleResend() {
    if (!user) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          fullName: user.user_metadata?.full_name
        })
      });
      
      let result;
      const rawText = await res.text();
      try {
        result = JSON.parse(rawText);
      } catch (parseErr) {
        console.error("Raw server response:", rawText);
        throw new Error(`Server tidak mengembalikan JSON yang valid. Response: ${rawText.substring(0, 50)}...`);
      }

      if (result.success) {
        setMessage({ type: 'success', text: 'Email verifikasi baru telah dikirim!' });
      } else {
        if (result.debugLink) {
          setMessage({ 
            type: 'warning', 
            text: result.error || 'Email gagal dikirim (Masalah DNS).', 
            link: result.debugLink 
          });
        } else {
          throw new Error(result.error || 'Terjadi kesalahan pada server email.');
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal mengirim email: ' + err.message });

    } finally {
      setLoading(false);
    }
  }
  
  const getMailProviderUrl = (email) => {
    if (!email) return 'https://mail.google.com';
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain?.includes('gmail')) return 'https://mail.google.com';
    if (domain?.includes('yahoo') || domain?.includes('ymail')) return 'https://mail.yahoo.com';
    if (domain?.includes('outlook') || domain?.includes('hotmail') || domain?.includes('live')) return 'https://outlook.live.com';
    return `https://${domain}`;
  };

  const handleExitToEmail = async () => {
    const mailUrl = getMailProviderUrl(user?.email);
    // Redirect ke webmail (di tab baru agar user tidak kehilangan halaman aplikasi)
    window.open(mailUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-500/10 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />

      <div className="relative z-10 max-w-md w-full">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-orange-500/10 border border-orange-500/20 mb-6 shadow-2xl shadow-orange-500/10">
            <Mail className="w-10 h-10 text-orange-500" />
          </div>
          <h1 className="text-3xl font-black text-white mb-3 tracking-tight">Verifikasi Email</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Kami telah mengirimkan link verifikasi premium ke 
            <span className="block font-bold text-white mt-1">{user?.email || 'email Anda'}</span>
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-3xl shadow-2xl shadow-black/50">
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
              <CheckCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-xs text-indigo-100/70 leading-relaxed">
                  Silakan klik tombol <strong>"Konfirmasi Akun"</strong> di dalam email tersebut untuk mendapatkan akses Trial 8 Hari.
                </p>
                <div className="pt-2 border-t border-white/5">
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic">
                    * Jika sudah klik konfirmasi di email dan masuk otomatis, silakan <strong>Keluar (Logout)</strong> terlebih dahulu lalu login kembali untuk sinkronisasi data.
                  </p>
                </div>
              </div>
            </div>

            {message && (
              <div className={`p-4 rounded-2xl text-xs font-bold text-center animate-in fade-in slide-in-from-top-2 ${
                message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                message.type === 'warning' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {message.text}
                {message.link && (
                  <a href={message.link} className="block mt-2 underline text-white font-black">
                    KLIK DI SINI UNTUK VERIFIKASI (MODE TES)
                  </a>
                )}
              </div>
            )}

            <button
              onClick={handleExitToEmail}
              className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl bg-indigo-600 dark:bg-orange-600 text-white font-black text-sm shadow-xl shadow-indigo-500/20 dark:shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all group"
            >
              Verifikasi di Email Saya
              <div className="w-5 h-5 rounded-lg bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
            </button>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-white/5"></div>
              <span className="flex-shrink mx-4 text-[8px] font-black text-slate-600 uppercase tracking-widest">Atau Kirim Ulang</span>
              <div className="flex-grow border-t border-white/5"></div>
            </div>

            <button
              onClick={handleResend}
              disabled={loading}
              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-700 transition-all disabled:opacity-50"
            >
              {loading ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
              {loading ? 'Mengirim...' : 'Kirim Ulang Email Link'}
            </button>

            {/* DEVELOPER BYPASS: Hanya muncul jika di localhost untuk memudahkan pengetesan */}
            {(typeof window !== 'undefined' && window.location.hostname === 'localhost') && (
              <div className="pt-2">
                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await fetch('/api/auth/send-verification', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: user?.id, email: user?.email })
                      });
                      const result = await res.json();
                      if (result.debugLink) {
                        window.location.href = result.debugLink;
                      } else {
                        alert('Link bypass tidak ditemukan. Pastikan API mengembalikan debugLink.');
                      }
                    } catch (e) {
                      alert('Error bypass: ' + e.message);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="w-full py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 hover:text-white transition-all"
                >
                  🚀 Aktifkan Manual (Khusus Developer)
                </button>
              </div>
            )}
            
            <Link 
              href="/login"
              className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Kembali ke Login
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">
          Zona Geometry App
        </p>
      </div>
    </div>
  );
}
