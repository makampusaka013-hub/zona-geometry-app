'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { LockedOverlay } from '@/components/LockedOverlay';
import { supabase } from '@/lib/supabase';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LogoMark } from '@/components/LogoMark';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
          .select('role, expired_at, is_verified_manual, approval_status')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (data) {
          const isActive = data.approval_status === 'active';
          const isAdmin = data.role === 'admin';
          
          if (!isActive && !isAdmin && !pathname.includes('verify')) {
            router.replace('/verify-notice');
            return;
          }

          const gracePeriodEnd = data.expired_at ? new Date(new Date(data.expired_at).getTime() + (24 * 60 * 60 * 1000)) : null;
          const expired = gracePeriodEnd && gracePeriodEnd < new Date();
          setIsExpired(expired);
          setIsAdmin(admin);
        } else {
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

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-[#0f172a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-t-orange-500" />
      </div>
    );
  }

  const isLocked = isExpired && !isAdmin;
  const isOnUpgradePage = pathname === '/dashboard/upgrade';

  if (isLocked) {
    if (isOnUpgradePage) {
      return (
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      );
    }
    return <LockedOverlay />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-[#0f172a] transition-colors duration-200">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="lg:hidden flex items-center justify-between px-6 py-4 bg-white dark:bg-[#020617] border-b border-slate-100 dark:border-slate-800 shrink-0 z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <LogoMark className="w-8 h-8" />
              <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest leading-none">Zona<br/>Geometry</span>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 overflow-y-auto relative">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
