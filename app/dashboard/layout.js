'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { LockedOverlay } from '@/components/LockedOverlay';
import { supabase } from '@/lib/supabase';

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter(); // Pastikan useRouter diimport
  const [loading, setLoading] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.replace('/login');
          return;
        }

        const { data } = await supabase
          .from('members')
          .select('role, expired_at, is_verified_manual')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (data) {
          const admin = data.role === 'admin';
          
          // CRITICAL: Jika belum verifikasi email premium, langsung buang keluar
          if (!data.is_verified_manual && !admin) {
            router.replace('/verify-notice');
            return; // JANGAN matikan loading agar DashboardPage tidak sempat dirender sama sekali
          }

          // Grace period: Aplikasi terkunci 1 hari (24 jam) SETELAH expired_at
          const gracePeriodEnd = data.expired_at ? new Date(new Date(data.expired_at).getTime() + (24 * 60 * 60 * 1000)) : null;
          const expired = gracePeriodEnd && gracePeriodEnd < new Date();
          setIsExpired(expired);
          setIsAdmin(admin);
        } else {
          // Jika member belum ada sama sekali di tabel members, lempar ke verifikasi dulu
          router.replace('/verify-notice');
          return;
        }
      } catch (err) {
        console.error('Layout Status Check failed:', err);
      } finally {
        setLoading(false);
      }
    }
    checkStatus();
  }, [pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-[#0f172a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-t-orange-500" />
      </div>
    );
  }

  const isLocked = isExpired && !isAdmin;
  const isOnUpgradePage = pathname === '/dashboard/upgrade';

  // JIKA TERKUNCI
  if (isLocked) {
    // Hanya perbolehkan halaman upgrade tanpa sidebar
    if (isOnUpgradePage) {
      return (
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      );
    }
    // Lainnya tampilkan full lock screen (tanpa sidebar)
    return <LockedOverlay />;
  }

  // NORMAL (AKKTIF ATAU ADMIN)
  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-[#0f172a] transition-colors duration-200">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
