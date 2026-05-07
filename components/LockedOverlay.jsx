'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Lock, CreditCard, Terminal } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function LockedOverlay() {
  const router = useRouter();


  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] flex items-center justify-center p-6 text-center transition-colors duration-200">
      <div className="max-w-md w-full space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-blue-500/20 dark:bg-orange-500/20 blur-3xl rounded-full" />
          <div className="relative bg-white dark:bg-slate-900 p-8 rounded-[40px] shadow-2xl shadow-blue-500/10 dark:shadow-orange-500/10 border border-slate-100 dark:border-slate-800">
            <div className="w-20 h-20 bg-blue-50 dark:bg-orange-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-blue-600 dark:text-orange-500" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Masa Aktif Habis</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Masa aktif langganan Anda (30 Hari) telah berakhir dan melewati batas waktu keterlambatan. <br />
            Data Anda tetap <span className="text-slate-900 dark:text-slate-100 font-bold uppercase">Aman</span>, namun akses ke fitur utama dikunci.
          </p>
        </div>

        <div className="grid gap-4">
          <button
            onClick={() => router.push('/dashboard/upgrade')}
            className="w-full bg-blue-600 dark:bg-gradient-to-r dark:from-orange-500 dark:to-rose-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-500/20 dark:shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
          >
            <CreditCard className="w-4 h-4" />
            Perpanjang / Upgrade Sekarang
          </button>
          
          <button
            onClick={() => window.location.href = '/login'}
            className="text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors uppercase tracking-widest"
          >
            Kembali ke Login
          </button>

        </div>

        <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Zona Geometry Security Management</p>
        </div>
      </div>
    </div>
  );
}
