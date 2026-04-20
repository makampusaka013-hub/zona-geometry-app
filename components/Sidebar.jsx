'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

export function Sidebar({ isOpen, onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const [member, setMember] = useState(null);
  const [locations, setLocations] = useState([]);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const { data } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const isAdmin = data?.role === 'admin';
      const isVerified = data?.is_verified_manual || isAdmin;

      let finalData = data;
      // [Global Safety Net: Auto-Activate if pending or no expiry]
      if (isVerified && (!data || data.approval_status === 'pending' || !data.expired_at)) {
        try {
          const res = await fetch('/api/auth/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              email: user.email,
              fullName: user.user_metadata?.full_name || data?.full_name,
              currentRole: data?.role,
              provider: user.app_metadata?.provider
            })
          });
          const result = await res.json();
          if (result.success && result.member) {
            finalData = result.member;
          }
        } catch (err) {
          console.error('Sidebar Auto-Activate failed:', err);
        }
      }

      const approvalStatus = finalData?.approval_status || 'pending';
      const isExpired = finalData?.expired_at && new Date(finalData.expired_at) < new Date();
      const isActive = approvalStatus === 'active';

      const allowedPaths = ['/account-locked', '/dashboard/upgrade', '/dashboard/profile', '/verify-notice'];

      setMember(finalData ? { ...finalData, role: finalData.role || 'normal' } : { user_id: user.id, full_name: user.email, role: 'normal', status: 'active' });

      // Load locations
      const { data: locs } = await supabase.from('locations').select('*').order('name');
      if (locs) {
        setLocations(locs);
        
        // AUTO-ASSIGN: Jika user belum punya lokasi terpilih, ambil yang pertama
        if (finalData && !finalData.selected_location_id && locs.length > 0) {
          const firstLocId = locs[0].id;
          console.log('Sidebar: Auto-assigning default location...', firstLocId);
          
          await supabase
            .from('members')
            .update({ selected_location_id: firstLocId })
            .eq('user_id', user.id);
          
          setMember(prev => ({ ...prev, selected_location_id: firstLocId }));
          // Refresh untuk memastikan semua context page (terutama AHSP) terupdate
          router.refresh();
        }
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      // 1. Matikan status online segera di database
      await supabase.rpc('clear_user_session');
      // 2. Logout dari Supabase
      await supabase.auth.signOut();
      // 3. Redirect bersih menggunakan window.location agar menghapus cache router
      window.location.href = '/login';
    } catch (err) {
      console.error('Logout error:', err);
      // Fallback tetap logout meskipun RPC gagal
      await supabase.auth.signOut();
      window.location.href = '/login';
    }
  }
  
  async function handleLocationChange(locationId) {
    if (!member || isUpdatingLocation) return;
    setIsUpdatingLocation(true);
    try {
      const { error } = await supabase
        .from('members')
        .update({ selected_location_id: locationId })
        .eq('user_id', member.user_id);
      
      if (error) throw error;
      setMember({ ...member, selected_location_id: locationId });
      
      // Refresh the page to update all views that depend on selected_location_id
      router.refresh();
      // Force reload specific pages if needed
      if (pathname.includes('katalog-ahsp')) {
         window.location.reload(); 
      }
    } catch (err) {
      console.error('Error updating location:', err);
    } finally {
      setIsUpdatingLocation(false);
    }
  }

  const isNormal = member?.role === 'normal';
  const daysRemaining = member?.expired_at ? Math.ceil((new Date(member.expired_at) - new Date()) / (1000 * 60 * 60 * 24)) : 0;
  // Banner peringatan muncul 1 hari sebelum expired (daysRemaining <= 1) hingga selesai masa grace period (-1)
  const isExpiringSoon = member?.is_paid && member?.role !== 'admin' && daysRemaining <= 1 && daysRemaining >= -1;

  const navLinks = [
    {
      name: 'Dashboard', href: '/dashboard', icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      hidden: false // Always show
    },
    {
      name: 'Katalog AHSP', href: '/dashboard/katalog-ahsp', icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      hidden: false
    },
    {
      name: 'Katalog Harga', href: '/dashboard/katalog-harga', icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3-3v8a3 3 0 003 3z" />
        </svg>
      ),
      hidden: false
    },
    {
      name: 'Data Proyek', href: '/dashboard/rekap-proyek?tab=daftar', icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
      ),
      hidden: false
    },
    {
      name: 'Tentang Produk', href: '/dashboard/about', icon: (
        <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      hidden: false
    },
    {
      name: 'Upgrade ke Pro', href: '/dashboard/upgrade', icon: (
        <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ),
      hidden: member?.role === 'pro' || member?.role === 'advance' || member?.role === 'admin' || member?.is_paid
    }
  ];

  return (
    <>
      {/* Backdrop (Mobile Only) */}
      <div 
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 h-screen bg-white border-r border-slate-200 dark:bg-[#020617] dark:border-slate-800 flex flex-col transition-all duration-300 ease-in-out shrink-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="pt-10 px-6 pb-6 flex items-center justify-between">
          <Logo className="h-14" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {/* Close Button (Mobile Only) */}
            <button 
              onClick={onClose}
              className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {/* Regional Context Selector */}
        <div className="mb-6 mx-2">
          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Wilayah Harga
          </div>
          <div className="relative group">
            <select 
              value={member?.selected_location_id || ''}
              onChange={(e) => handleLocationChange(e.target.value)}
              disabled={isUpdatingLocation}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-black text-slate-700 dark:text-slate-200 outline-none focus:ring-2 ring-indigo-500/10 transition-all appearance-none cursor-pointer"
            >
              <option value="" disabled>Pilih Wilayah...</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-indigo-500 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4 4 4-4" />
              </svg>
            </div>
            {isUpdatingLocation && (
              <div className="absolute inset-0 bg-white/50 dark:bg-black/20 rounded-xl flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent animate-spin rounded-full" />
              </div>
            )}
          </div>
          <p className="text-[8px] font-bold text-slate-400 mt-1.5 leading-tight italic">
            * Menentukan konteks harga di Katalog AHSP dan Harga.
          </p>
        </div>

        <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-2">Main Menu</div>
        
        {isExpiringSoon && (
          <div className="mx-2 mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-xl relative overflow-hidden group hover:border-red-300 dark:hover:border-red-800 transition-colors">
            <div className="absolute top-0 right-0 p-2 opacity-10">
              <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" /></svg>
            </div>
            <div className="relative z-10">
              <p className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-1">Perhatian</p>
              <p className="text-[11px] text-red-700 dark:text-red-300 font-medium leading-snug">
                {daysRemaining < 0 
                  ? 'Langganan Anda telah melewati batas waktu (Masa Keterlambatan). Segera perpanjang!' 
                  : 'Sisa waktu langganan kurang dari 1 hari. Segera perpanjang akun Anda!'}
              </p>
              <Link href="/dashboard/upgrade" className="mt-2 text-[10px] bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-widest inline-flex items-center gap-1 transition-colors shadow-sm">
                Perpanjang
              </Link>
            </div>
          </div>
        )}
        
        {navLinks
          .filter(link => !link.hidden)
          .map((link) => {
            const baseHref = link.href.split('?')[0];
            const isActive = link.href === '/dashboard' 
              ? pathname === '/dashboard' 
              : pathname.startsWith(baseHref);

            return (
              <Link
                key={link.name}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-bold ${isActive
                  ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-200 dark:bg-orange-500/10 dark:text-orange-500 dark:border-orange-500/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-amber-400'
                  }`}
              >
                {link.icon}
                {link.name}
              </Link>
            );
          })}

        {member?.role === 'admin' && (
          <div className="mt-8">
            <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-2">Admin Panel</div>
            <Link
              href="/admin/upload-data"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-amber-400"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              Upload Data
            </Link>
            <Link
              href="/dashboard/admin/users"
              className="mt-1 flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-amber-400"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Kelola User
            </Link>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <div className="bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 p-3 rounded-xl shadow-sm">
          <Link href="/dashboard/profile" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="h-10 w-10 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-orange-500/10 dark:text-orange-400 font-bold shrink-0">
              {member?.full_name ? member.full_name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{member?.full_name || 'User'}</p>
                {member?.role === 'pro' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">PRO</span>
                )}
                {member?.role === 'advance' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30">ADV</span>
                )}
              </div>
              <p className="text-xs font-bold text-indigo-600 dark:text-orange-500 truncate uppercase mt-0.5">
                {(member?.role === 'normal' && !member?.is_paid) ? 'TRIAL' : (member?.role || 'Guest')}
              </p>
              {member?.expired_at && (member?.is_paid || member?.role === 'normal') && (
                <p className={`text-[10px] mt-1 font-bold ${daysRemaining <= 1 ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>
                  Masa Aktif: {Math.max(0, daysRemaining)} Hari {daysRemaining < 0 && <span className="italic opacity-80">(Keterlambatan)</span>}
                </p>
              )}
            </div>
          </Link>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/40 py-2.5 rounded-xl transition-all disabled:opacity-50"
          >
            {isLoggingOut ? (
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-red-500 border-t-transparent animate-spin rounded-full" />
                Memproses...
              </span>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
