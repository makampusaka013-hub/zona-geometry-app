'use client';

import { useEffect } from 'react';
import { supabase, safeGetSession, getClientType } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function SessionGuard({ children }) {
  const router = useRouter();

  useEffect(() => {
    let interval;

    async function setupHeartbeat() {
      const { data: { session } } = await safeGetSession();
      
      if (!session) return;

      const clientType = getClientType();

      // 1. Sent heartbeat (RPC update_user_heartbeat)
      try {
        const { data: isValidFirst, error: hbError } = await supabase.rpc('update_user_heartbeat', { 
          p_session_id: session.access_token,
          p_client_type: clientType
        });
        
        if (hbError) {
          console.warn('Heartbeat RPC error (safe fallback):', hbError);
          return;
        }

        // Only invalidate if NOT on the login page to avoid race conditions during sign-in
        const isLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';
        
        if (isValidFirst === false && !isLoginPage) {
          console.error('Session invalidated by heartbeat check');
          await supabase.auth.signOut();
          router.push('/login?message=Sesi+Anda+telah+berakhir+karena+login+di+perangkat+lain.');
          return;
        }
      } catch (err) {
        console.error('Heartbeat fetch failed:', err);
      }

      // 2. Set interval to update every 60 seconds
      interval = setInterval(async () => {
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        
        if (!activeSession) {
          clearInterval(interval);
          return;
        }

        const { data: isValid } = await supabase.rpc('update_user_heartbeat', { 
          p_session_id: activeSession.access_token,
          p_client_type: clientType
        });

        if (isValid === false) {
          clearInterval(interval);
          await supabase.auth.signOut();
          window.location.href = '/login?message=Sesi+Anda+telah+berakhir+karena+login+di+perangkat+lain.';
        }
      }, 60000);
    }

    setupHeartbeat();

    // Cleanup on unmount
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [router]);

  // Listen for Auth State Changes (e.g. Invalidate session if needed)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return <>{children}</>;
}
