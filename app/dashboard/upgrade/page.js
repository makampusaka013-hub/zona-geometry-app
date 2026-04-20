"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Script from 'next/script';
import { useRouter } from 'next/navigation';

export default function UpgradePage() {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      setMember(data);
    }
    load();
  }, []);

  const handleUpgrade = async (planType = 'pro') => {
    setLoading(planType);
    try {
      // 1. Cek sesi user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('Sesi sudah habis, silakan login kembali.');
      }

      // 2. Buat transaksi di API
      const res = await fetch('/api/payment/create-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          userEmail: session.user.email,
          fullName: member?.full_name || 'User',
          plan: planType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Gagal tersambung ke server pembayaran');
      }

      // 3. Panggil Midtrans Snap
      if (data.token) {
        if (!window.snap) {
          throw new Error('Sistem pembayaran sedang dimuat, silakan coba sesaat lagi.');
        }

        window.snap.pay(data.token, {
          onSuccess: async (result) => {
            console.log('Payment success:', result);
            setLoading(true); // Tahan UI tetap disabled saat redirect
            try {
              if (result.order_id) {
                await fetch('/api/payment/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    order_id: result.order_id,
                    userId: session.user.id,
                    plan: planType
                  })
                });
              }
            } catch (err) {
              console.error('Verify Fallback Error:', err);
            }
            router.push(`/dashboard?payment=success&order_id=${result.order_id}`);
          },
          onPending: (result) => {
            console.log('Payment pending:', result);
            router.push(`/dashboard?payment=pending&order_id=${result.order_id}`);
          },
          onError: (result) => {
            console.error('Payment error:', result);
            alert('Pembayaran gagal atau dibatalkan.');
            setLoading(false);
          },
          onClose: () => {
            console.log('Payment popup closed');
            setLoading(false);
          }
        });
      } else {
        throw new Error(data.error || 'Gagal membuat transaksi');
      }
    } catch (error) {
      console.error('Upgrade Error:', error);
      alert('Error: ' + error.message);
      setLoading(false);
    }
  };

  const currentRole = member?.role || 'normal';
  const isExpired = member?.expired_at ? new Date(member.expired_at) < new Date() : true;

  const isNormalActive   = currentRole === 'normal'   && member?.is_paid && !isExpired;
  const isProActive      = currentRole === 'pro'      && !isExpired;
  const isAdvanceActive  = currentRole === 'advance'  && !isExpired;
  
  const isTrial = currentRole === 'normal' && !member?.is_paid;
  const daysRemaining = member?.expired_at ? Math.ceil((new Date(member.expired_at) - new Date()) / (1000 * 60 * 60 * 24)) : 0;
  const isExpiringSoon = daysRemaining <= 1;

  // Visibility logic
  const showNormal = isExpired || isTrial || (isNormalActive && isExpiringSoon);
  const showPro = isExpired || isTrial || isNormalActive || (isProActive && isExpiringSoon);
  const showAdvance = isExpired || isTrial || isNormalActive || isProActive || (isAdvanceActive && isExpiringSoon);

  const showMaxTierMessage = isAdvanceActive && !isExpiringSoon;

  const CheckIcon = () => (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );

  const LockIcon = () => (
    <svg className="w-3 h-3 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] p-4 flex flex-col items-center justify-center transition-colors duration-200">
      <Script
        src={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY?.startsWith('Mid-client-')
          ? "https://app.midtrans.com/snap/snap.js"
          : "https://app.sandbox.midtrans.com/snap/snap.js"
        }
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
        strategy="afterInteractive"
      />

      <div className="max-w-5xl w-full mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="inline-block px-3 py-1 rounded-full bg-blue-50 dark:bg-orange-500/10 border border-blue-100 dark:border-orange-500/20 mb-2">
            <span className="text-[10px] font-black text-blue-600 dark:text-orange-500 uppercase tracking-widest">Membership Plan</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Pilih <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-orange-500 dark:to-amber-400">Plan Terbaik</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-lg mx-auto leading-relaxed">
            Pilih paket yang sesuai kebutuhan proyek konstruksi Anda.
          </p>
        </div>

        {/* 3 Plan Cards */}
        <div className="grid md:grid-cols-3 gap-5 items-stretch">

          {/* === NORMAL PLAN === */}
          {showNormal && (
            <div className="relative p-5 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between backdrop-blur-sm transition-all hover:border-blue-500/50">
              <div>
                <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest">Normal Plan</h3>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[11px] font-bold text-slate-400">Rp</span>
                  <span className="text-3xl font-black text-slate-900 dark:text-white">29.000</span>
                  <span className="text-[11px] font-bold text-slate-400">/bln</span>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {[
                    'Semua Kalkulator RAB',
                    'Penyimpanan Awan',
                    'Eksport Excel Standar',
                    'Maks. 1 Proyek',
                    'Masa Aktif 30 Hari',
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                      <span className="text-emerald-500"><CheckIcon /></span>
                      {f}
                    </li>
                  ))}
                  {['Gabung Proyek', 'BIM IFC Analysis'].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-600 font-medium line-through">
                      <LockIcon />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => handleUpgrade('normal')}
                disabled={!!loading || isNormalActive || isProActive || isAdvanceActive}
                className={`mt-6 w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all transform active:scale-95 flex items-center justify-center gap-2 ${
                  isNormalActive || isProActive || isAdvanceActive
                  ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 cursor-not-allowed'
                  : 'bg-slate-900 dark:bg-slate-800 text-white hover:bg-black dark:hover:bg-slate-700 shadow-xl'
                }`}
              >
                {loading === 'normal' ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                ) : isNormalActive ? 'Normal Aktif' : (isProActive || isAdvanceActive) ? 'Downgrade Tidak Tersedia' : 'Pilih Normal'}
              </button>
            </div>
          )}

          {/* === PRO PLAN (Most Popular) === */}
          {showPro && (
            <div className="relative p-5 rounded-2xl bg-white dark:bg-[#0f172a] border-2 border-indigo-600 dark:border-orange-500 shadow-2xl shadow-indigo-500/10 dark:shadow-orange-500/10 flex flex-col transition-all hover:scale-[1.01]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 dark:bg-orange-500 text-white text-[9px] font-black uppercase tracking-widest px-4 py-1 rounded-full shadow-lg text-center">Paling Populer</div>

              <div className="flex-1">
                <h3 className="text-[10px] font-bold text-indigo-600 dark:text-orange-500 uppercase tracking-widest">Professional Pro</h3>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[11px] font-bold text-slate-400">Rp</span>
                  <span className="text-4xl font-black text-slate-900 dark:text-white">299.000</span>
                  <span className="text-[11px] font-bold text-slate-400">/bln</span>
                </div>

                <ul className="mt-5 space-y-2.5">
                  {[
                    'Semua Fitur Normal',
                    'Penyimpanan Tak Terbatas',
                    'Custom Branding Laporan',
                    'Export PDF Premium (A4)',
                    'Maks. 3 Proyek',
                    'Akses Multi-Device',
                    'Prioritas Support WA',
                    'Gabung Proyek (Member)',
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-[11px] text-slate-700 dark:text-slate-300 font-bold">
                      <div className="h-5 w-5 rounded-full bg-indigo-600/10 dark:bg-orange-500/10 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-indigo-600 dark:text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      {feature}
                    </li>
                  ))}
                  {['BIM IFC Analysis (Advance)'].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-600 font-medium line-through">
                      <LockIcon />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => handleUpgrade('pro')}
                disabled={!!loading || isProActive || isAdvanceActive}
                className={`mt-6 w-full py-3.5 rounded-xl font-black text-sm transition-all transform active:scale-95 flex items-center justify-center gap-3 ${
                  isProActive || isAdvanceActive
                  ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 cursor-not-allowed'
                  : 'bg-indigo-600 dark:bg-orange-500 text-white shadow-lg shadow-indigo-500/30 dark:shadow-orange-500/30 hover:bg-indigo-700 dark:hover:bg-orange-600'
                }`}
              >
                {loading === 'pro' ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                ) : isProActive ? 'Pro Aktif' : isAdvanceActive ? 'Downgrade Tidak Tersedia' : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Beli Pro Sekarang
                  </>
                )}
              </button>
            </div>
          )}

          {/* === ADVANCE PLAN === */}
          {showAdvance && (
            <div className="relative p-5 rounded-2xl bg-gradient-to-br from-purple-950 to-slate-900 border-2 border-purple-500 shadow-2xl shadow-purple-500/20 flex flex-col transition-all hover:scale-[1.01]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white text-[9px] font-black uppercase tracking-widest px-4 py-1 rounded-full shadow-lg text-center whitespace-nowrap">Premium BIM</div>

              <div className="flex-1">
                <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Advance Plan</h3>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[11px] font-bold text-slate-400">Rp</span>
                  <span className="text-4xl font-black text-white">499.000</span>
                  <span className="text-[11px] font-bold text-slate-400">/bln</span>
                </div>

                <ul className="mt-5 space-y-2.5">
                  {[
                    'Semua Fitur Pro',
                    'BIM IFC Auto-Volume Extractor',
                    'Kolaborasi Penuh (Share & Join)',
                    'Maks. 5 Proyek',
                    'Priority Support Dedicated',
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-[11px] text-slate-200 font-bold">
                      <div className="h-5 w-5 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => handleUpgrade('advance')}
                disabled={!!loading || isAdvanceActive}
                className={`mt-6 w-full py-3.5 rounded-xl font-black text-sm transition-all transform active:scale-95 flex items-center justify-center gap-3 ${
                  isAdvanceActive
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/30 hover:from-purple-500 hover:to-fuchsia-500'
                }`}
              >
                {loading === 'advance' ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                ) : isAdvanceActive ? 'Advance Aktif' : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                    </svg>
                    Beli Advance Sekarang
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Empty State / Max Tier State */}
        {showMaxTierMessage && (
          <div className="text-center py-12 px-6 border border-purple-500/20 bg-purple-500/5 rounded-[32px] mx-auto max-w-2xl mt-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-purple-600 to-fuchsia-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-purple-500/20">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-white tracking-wide mb-2">Tingkat Maksimal Tercapai</h3>
            <p className="text-slate-400 font-medium">Anda sedang dalam paket premium tertinggi (Advance). Anda dapat memperpanjang paket 1 hari sebelum masa aktif berakhir.</p>
          </div>
        )}

        {/* Info Footer */}
        <div className="grid grid-cols-2 gap-4 bg-white/50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-200 dark:border-slate-800 backdrop-blur-sm">
          <div className="space-y-1">
            <h4 className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">Masa Aktif Habis?</h4>
            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Data aman terenkripsi, fitur edit terkunci sampai diperpanjang.</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">Berhenti Langganan?</h4>
            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Sistem prabayar manual. Tidak ada tagihan otomatis ke kartu.</p>
          </div>
        </div>
        
        <div className="flex items-center justify-center gap-4 text-[9px] text-slate-400 font-bold uppercase tracking-widest">
          <span className="flex items-center gap-1.5 opacity-60">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
            Secure Payment
          </span>
          <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
          <span className="flex items-center gap-1.5 opacity-60">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
            QRIS/Bank Transfer
          </span>
        </div>
      </div>
    </div>
  );
}
