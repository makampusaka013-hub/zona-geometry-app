'use client';

export const dynamic = 'force-dynamic';

import { Logo } from '@/components/Logo';
import { LogoMark } from '@/components/LogoMark';

import { useCallback, useEffect, useState, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, safeGetSession } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine, Label, ComposedChart, Line
} from 'recharts';
import {
  ChevronRight, ArrowUpRight, LayoutDashboard, Clock,
  Wallet, HardHat, ClipboardList, Hammer, Construction,
  Activity, BarChart2, Zap
} from 'lucide-react';
import { computeManpower, getSequencedSchedule } from '@/lib/manpower';

function formatIdr(n) {
  const s = new Intl.NumberFormat('id-ID', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0);
  return `Rp ${s}`;
}

function formatIdrFull(n) {
  const s = new Intl.NumberFormat('id-ID', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
  return `Rp ${s}-`;
}

function romanize(num) {
  if (isNaN(num)) return '';
  const digits = String(+num).split("");
  const key = ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM",
    "", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC",
    "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  let roman = "", i = 3;
  while (i--) roman = (key[+digits.pop() + (i * 10)] || "") + roman;
  return Array(+digits.join("") + 1).join("M") + roman;
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  const configs = {
    indigo_primary: {
      card: 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100/50 dark:bg-orange-500/5 dark:border-orange-500/10 dark:hover:bg-orange-500/10',
      box: 'bg-indigo-600/10 text-indigo-600 dark:bg-orange-500/10 dark:text-orange-500',
      text: 'text-slate-900 dark:text-white',
      watermark: 'text-indigo-600/5 dark:text-orange-500/5',
      trend: 'text-indigo-600 dark:text-orange-400'
    },
    indigo: {
      card: 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100/50 dark:bg-orange-500/5 dark:border-orange-500/10 dark:hover:bg-orange-500/10',
      box: 'bg-indigo-600/10 text-indigo-600 dark:bg-orange-500/10 dark:text-orange-400',
      text: 'text-slate-900 dark:text-white',
      watermark: 'text-indigo-600/5 dark:text-orange-500/5',
      trend: 'text-indigo-600 dark:text-orange-400'
    },
    teal: {
      card: 'bg-teal-50 border-teal-100 hover:bg-teal-100/50 dark:bg-amber-500/5 dark:border-amber-500/10 dark:hover:bg-amber-500/10',
      box: 'bg-teal-600/10 text-teal-600 dark:bg-amber-500/10 dark:text-amber-400',
      text: 'text-slate-900 dark:text-white',
      watermark: 'text-teal-600/5 dark:text-amber-500/5',
      trend: 'text-teal-600 dark:text-amber-400'
    },
    violet: {
      card: 'bg-violet-50 border-violet-100 hover:bg-violet-100/50 dark:bg-orange-500/5 dark:border-orange-500/10 dark:hover:bg-orange-500/10',
      box: 'bg-violet-600/10 text-violet-600 dark:bg-orange-500/10 dark:text-orange-400',
      text: 'text-slate-900 dark:text-white',
      watermark: 'text-violet-600/5 dark:text-orange-500/5',
      trend: 'text-violet-600 dark:text-orange-400'
    },
    emerald: {
      card: 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100/50 dark:bg-amber-500/5 dark:border-amber-500/10 dark:hover:bg-amber-500/10',
      box: 'bg-emerald-600/10 text-emerald-600 dark:bg-amber-500/10 dark:text-amber-400',
      text: 'text-slate-900 dark:text-white',
      watermark: 'text-emerald-600/5 dark:text-amber-500/5',
      trend: 'text-emerald-600 dark:text-amber-400'
    },
    blue: {
      card: 'bg-blue-50 border-blue-100 hover:bg-blue-100/50 dark:bg-orange-500/5 dark:border-orange-500/10 dark:hover:bg-orange-500/10',
      box: 'bg-blue-600/10 text-blue-600 dark:bg-orange-500/10 dark:text-orange-500',
      text: 'text-slate-900 dark:text-white',
      watermark: 'text-blue-600/5 dark:text-orange-500/5',
      trend: 'text-blue-600 dark:text-orange-400'
    },
  };

  const c = configs[color] || configs.indigo_primary;

  return (
    <div className={`group relative overflow-hidden rounded-[32px] border ${c.card} px-6 py-7 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md dark:shadow-none`}>
      {/* Background Watermark */}
      <Icon className={`absolute -right-6 -bottom-6 w-32 h-32 ${c.watermark} -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-0`} />

      <div className="relative z-10 flex items-center gap-4">
        {/* Animated Icon Box */}
        <div className={`p-4 rounded-2xl ${c.box} transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg dark:group-hover:shadow-[0_0_20px_rgba(0,0,0,0.2)]`}>
          <Icon className="w-8 h-8" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">{label}</h4>
          <div className={`text-2xl font-black ${c.text} font-mono tracking-tighter drop-shadow-sm`}>
            {value}
          </div>
          <div className={`flex items-center gap-1.5 mt-2 text-[10px] font-black ${c.trend} uppercase tracking-tight opacity-80 dark:opacity-70`}>
            <TrendingUp className="w-3 h-3" />
            {sub}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [projectStats, setProjectStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [projectItems, setProjectItems] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);
  // AbortController ref: membatalkan komputasi lama saat user berganti proyek
  const statsVersionRef = useRef(0);
  const loadingDataRef = useRef(false);

  useEffect(() => {
    const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
    checkTheme();
    const obs = new MutationObserver(checkTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const [filterType, setFilterType] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [sCurveFreq, setSCurveFreq] = useState('weekly');
  const [sCurveToday, setSCurveToday] = useState(false);
  const [resFreq, setResFreq] = useState('all'); // all (aggregate), daily, weekly, monthly
  const [itemPage, setItemPage] = useState(0);
  const [resPage, setResPage] = useState(0);

  // New states for 3-party collaboration
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [projectMembers, setProjectMembers] = useState({}); // { [projectId]: slot_role }

  const approvalStatus = member?.approval_status || 'pending';
  const isExpired = member?.isExpired;

  const ownedProjectsCount = useMemo(() => projects.filter(p => p.created_by === member?.user_id).length, [projects, member?.user_id]);
  const joinedProjectsCount = useMemo(() => projects.filter(p => p.created_by !== member?.user_id).length, [projects, member?.user_id]);
  const ownedLimitReached = member?.role === 'admin' ? false : (member?.role === 'advance' ? ownedProjectsCount >= 5 : (member?.role === 'pro' ? ownedProjectsCount >= 3 : ownedProjectsCount >= 1));
  const joinedLimitReached = joinedProjectsCount >= 7;

  const loadData = useCallback(async () => {
    if (loadingDataRef.current) return;
    loadingDataRef.current = true;

    try {
      const { data: { session }, error } = await safeGetSession();
      if (error || !session?.user) { router.replace('/login'); return; }
      const user = session.user;

      // 1. Ambil data member saat ini
      const { data: row } = await supabase.from('members')
        .select('user_id, full_name, role, expired_at, approval_status, is_paid').eq('user_id', user.id).maybeSingle();

      // [SAFETY NET: AKTIVASI OTOMATIS DI DASHBOARD]
      let finalRow = row;
      
      // Ambil sinyal pembayaran dari URL
      const hasPaymentSignal = searchParams.get('payment') === 'success' || !!searchParams.get('order_id');

      // Aktifkan atau beri trial jika: 1. Data belum ada, 2. Masih pending, ATAU 3. Masa aktif kosong (null)
      // TAPI: JANGAN lakukan ini jika ada sinyal pembayaran sukses di URL untuk menghindari tabrakan data (Race Condition).
      if ((!row || row.approval_status === 'pending' || !row.expired_at) && !hasPaymentSignal) {
        try {
          const res = await fetch('/api/auth/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              email: user.email,
              fullName: row?.full_name || user.user_metadata?.full_name,
              currentRole: row?.role
            })
          });
          const result = await res.json();
          if (result.success && result.member) {
            finalRow = result.member;
            console.log('Safety Net Active:', finalRow);
          }
        } catch (err) {
          console.error('Safety Net Activation failed via API:', err);
        }
      } else if (hasPaymentSignal) {
        console.log('[DASHBOARD] Payment signal detected. Skipping safety net activation to prevent race condition.');
      }

      let isExp = false;
      let role = finalRow?.role ?? 'normal';
      if (finalRow?.expired_at && new Date(finalRow.expired_at) < new Date()) { isExp = true; role = 'normal'; }

      setMember(finalRow ? { ...finalRow, role, isExpired: isExp, approval_status: 'active' } : { user_id: user.id, full_name: null, role: 'normal', isExpired: false, approval_status: 'active' });

      // Fetch user's projects via project_members to get their slot_role
      const { data: userProjMembers } = await supabase
        .from('project_members')
        .select('project_id, slot_role')
        .eq('user_id', user.id);

      const memberMap = {};
      const projIds = (userProjMembers || []).map(m => {
        memberMap[m.project_id] = m.slot_role;
        return m.project_id;
      });
      setProjectMembers(memberMap);

      // Fetch projects where user is creator OR member
      const { data: proj } = await supabase
        .from('projects')
        .select('*')
        .or(`created_by.eq.${user.id},id.in.(${projIds.length > 0 ? projIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
        .order('updated_at', { ascending: false });

      setProjects(proj || []);
      if (proj?.length > 0) setSelectedId(proj[0].id);
      setLoading(false);
    } finally {
      loadingDataRef.current = false;
    }
  }, [router, searchParams]);

  useEffect(() => { loadData(); }, [loadData]);
  
  // Pemicu sinkronisasi ulang jika ada parameter pembayaran sukses
  const paymentStatus = searchParams.get('payment');
  const orderId = searchParams.get('order_id');
  
  useEffect(() => {
    let isMounted = true;
    
    async function handlePaymentSuccess() {
      // Deteksi keberhasilan dari parameter URL (Midtrans redirect)
      const isActuallySuccess = paymentStatus === 'success' || 
                                 (orderId && searchParams.get('transaction_status') === 'settlement') ||
                                 (orderId && orderId.includes('-') && pathname.includes('dashboard'));

      if (isActuallySuccess && orderId && member?.user_id) {
        console.log('[PAYMENT] Success detected in URL, triggering proactive verification for:', orderId);
        
        try {
          // Tembak API verify secara manual untuk memastikan DB terupdate detik ini juga
          const res = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              order_id: orderId, 
              userId: member.user_id,
              userEmail: member.email, // KRUSIAL untuk sinkronisasi cadangan
              plan: searchParams.get('plan') || 'normal' 
            })
          });
          
          const result = await res.json();
          if (result.success) {
            console.log('[PAYMENT] Proactive verification successful! Cleaning up URL...');
            // Bersihkan parameter URL agar tidak terjadi loop refresh
            router.replace('/dashboard');
          }
        } catch (e) {
          console.error("[PAYMENT] Proactive verification failed:", e);
        }
      }
    }
    
    handlePaymentSuccess();
    
    return () => { isMounted = false; };
  }, [paymentStatus, orderId, member, router, searchParams]); // Tambahkan 'member' agar re-run saat data user siap

  // Real-time Glow Sync based on role in active project
  const activeProjectSlot = useMemo(() => {
    const slot = projectMembers[selectedId];
    if (slot) return slot;
    const p = projects.find(x => x.id === selectedId);
    if (p && p.created_by === member?.user_id) return 'kontraktor';
    return 'Member';
  }, [projectMembers, selectedId, projects, member?.user_id]);

  async function handleJoinProject(e) {
    if (e) e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    const { data, error } = await supabase.rpc('join_project_by_code', {
      p_code: joinCode.trim().toUpperCase()
    });
    setJoining(false);
    if (error) {
      toast.error(error.message || 'Gagal bergabung ke proyek');
    } else if (data?.error) {
      toast.error(data.error);
    } else {
      setJoinCode('');
      setShowJoinModal(false);
      toast.success('Berhasil bergabung ke proyek!');
      loadData();
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    loadProjectStats(selectedId);
  }, [selectedId]); // eslint-disable-line

  async function loadProjectStats(projectId) {
    // ── Stale-request guard: cancel previous computation ──
    const myVersion = ++statsVersionRef.current;
    setStatsLoading(true);
    setChartData([]);
    setProjectItems([]);

    try {
      // ── Phase 1: Parallel fetch semua data sekaligus ──
      const [
        { data: proj },
        { data: itemsRaw },
        { data: progress },
        { data: resources },
      ] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('ahsp_lines').select('*').eq('project_id', projectId),
        supabase.from('project_progress_daily').select('*').eq('project_id', projectId),
        supabase.from('view_project_resource_summary').select('*').eq('project_id', projectId),
      ]);

      // Stale check setelah fetch selesai
      if (myVersion !== statsVersionRef.current) return;

      const startDate = proj?.start_date;
      const laborSettings = proj?.labor_settings || {};
      const items = itemsRaw || [];

      // ── Phase 2: Catalog fetch (conditional) ──
      const masterIds = [...new Set(items.map(l => l.master_ahsp_id).filter(Boolean))];
      let catalogMap = {};
      if (masterIds.length > 0) {
        const { data: catData } = await supabase
          .from('view_katalog_ahsp_lengkap')
          .select('master_ahsp_id, details')
          .in('master_ahsp_id', masterIds);
        catData?.forEach(c => { catalogMap[c.master_ahsp_id] = c.details; });
      }

      if (myVersion !== statsVersionRef.current) return;

      // ── Phase 3: Compute stats & Global Ratios (CPU-light) ──
      const totalRab = items.reduce((s, r) => s + Number(r.jumlah || 0), 0) || 0;
      const totalItems = items.length || 0;

      let totB = 0, totT = 0;
      resources?.forEach(r => { totB += (Number(r.kontribusi_nilai) || 0); totT += (Number(r.nilai_tkdn) || 0); });
      const tkdnPct = totB > 0 ? (totT / totB) * 100 : 0;

      const totalUpah = resources?.filter(r => { const j = (r.jenis_komponen || '').toLowerCase(); return j === 'upah' || j === 'tenaga' || j === 'worker' || (r.key_item || '').startsWith('L'); }).reduce((s, r) => s + (Number(r.kontribusi_nilai) || 0), 0) || 0;
      const totalBahan = resources?.filter(r => { const j = (r.jenis_komponen || '').toLowerCase(); return j === 'bahan' || j === 'material' || j === 'barang' || (r.key_item || '').startsWith('B') || (r.key_item || '').startsWith('M'); }).reduce((s, r) => s + (Number(r.kontribusi_nilai) || 0), 0) || 0;
      const totalAlat = resources?.filter(r => { const j = (r.jenis_komponen || '').toLowerCase(); return j === 'alat' || j === 'peralatan' || j === 'mesin' || (r.key_item || '').startsWith('A') || (r.key_item || '').startsWith('E'); }).reduce((s, r) => s + (Number(r.kontribusi_nilai) || 0), 0) || 0;

      // Project-wide ratios for items without specific breakdown (Fallback)
      const resSum = totalUpah + totalBahan + totalAlat || 1;
      const fallbackRatios = {
        upah: totalUpah / resSum,
        bahan: totalBahan / resSum,
        alat: totalAlat / resSum
      };

      const manpowerItems = computeManpower(items, catalogMap, laborSettings);
      const laborOnlyItems = manpowerItems.filter(it => it.has_labor);
      const sequencedSchedule = getSequencedSchedule(laborOnlyItems, startDate);

      const itemDetailedProgress = sequencedSchedule.map(it => {
        const totalProgressVal = progress?.filter(p => p.entity_id === it.id && p.entity_type === 'ahsp_item').reduce((sum, p) => sum + Number(p.val || 0), 0) || 0;
        const progressRupiah = Number(it.volume || 0) > 0 ? (totalProgressVal / Number(it.volume)) * Number(it.jumlah || 0) : 0;
        return { ...it, progressRupiah, totalRupiah: Number(it.jumlah || 0) };
      });

      setProjectStats({ totalItems, totalRab, tkdnPct, resources, totalUpah, totalBahan, totalAlat });
      setProjectItems(itemDetailedProgress);

      // ── Phase 4: Chunked Kurva-S computation (anti-freeze) ──
      const lastFinishDay = (sequencedSchedule || []).reduce((max, it) => {
        if (!it.seq_end) return max;
        const d = Math.ceil((new Date(it.seq_end) - new Date(startDate)) / 86400000) + 1;
        return d > max ? d : max;
      }, 0);
      const progMaxDay = (progress || []).reduce((max, p) => Number(p.day_number) > max ? Number(p.day_number) : max, 0);
      const maxDay = Math.max(lastFinishDay || 30, progMaxDay);
      const nonLaborSum = items.filter(it => !laborOnlyItems.some(l => l.id === it.id)).reduce((s, r) => s + Number(r.jumlah || 0), 0);
      const denominatorRab = totalRab > 0 ? totalRab : 1;

      // Pre-build category ratios and breakdowns for all items
      const itemBreakdowns = items.map(it => {
        let details = catalogMap[it.master_ahsp_id] || it.analisa_custom || [];
        const baseTotal = details.reduce((s, d) => s + Number(d.jumlah_harga_snapshot || d.jumlah_harga || 0), 0) || 0;

        const isU = d => { const k = (d.kode_item || d.kode || '').trim().toUpperCase(); const j = (d.jenis || d.jenis_komponen || '').toLowerCase(); return k.startsWith('L') || j === 'upah' || j === 'tenaga'; };
        const isB = d => { const k = (d.kode_item || d.kode || '').trim().toUpperCase(); const j = (d.jenis || d.jenis_komponen || '').toLowerCase(); return k.startsWith('B') || k.startsWith('M') || j === 'bahan' || j === 'material'; };
        const isA = d => { const k = (d.kode_item || d.kode || '').trim().toUpperCase(); const j = (d.jenis || d.jenis_komponen || '').toLowerCase(); return k.startsWith('A') || k.startsWith('E') || j === 'alat' || j === 'peralatan'; };

        let uRatio = 0, bRatio = 0, aRatio = 0;

        if (baseTotal > 0) {
          uRatio = details.filter(isU).reduce((s, d) => s + Number(d.jumlah_harga_snapshot || d.jumlah_harga || 0), 0) / baseTotal;
          bRatio = details.filter(isB).reduce((s, d) => s + Number(d.jumlah_harga_snapshot || d.jumlah_harga || 0), 0) / baseTotal;
          aRatio = details.filter(isA).reduce((s, d) => s + Number(d.jumlah_harga_snapshot || d.jumlah_harga || 0), 0) / baseTotal;
        } else {
          // Fallback to project-wide ratios if item has no valid breakdown
          uRatio = fallbackRatios.upah;
          bRatio = fallbackRatios.bahan;
          aRatio = fallbackRatios.alat;
        }

        const total = Number(it.jumlah || 0);
        return { id: it.id, upah: total * uRatio, bahan: total * bRatio, alat: total * aRatio, total };
      });

      // Split breakdowns into Labor-based (scheduled) and Non-Labor (linear)
      const scheduledBreakdowns = itemBreakdowns.filter(b => laborOnlyItems.some(l => l.id === b.id));
      const linearBreakdowns = itemBreakdowns.filter(b => !laborOnlyItems.some(l => l.id === b.id));
      const totalLinearUpah = linearBreakdowns.reduce((s, b) => s + b.upah, 0);
      const totalLinearBahan = linearBreakdowns.reduce((s, b) => s + b.bahan, 0);
      const totalLinearAlat = linearBreakdowns.reduce((s, b) => s + b.alat, 0);

      // Pre-build progress lookup map for O(1) access
      const progressByDay = new Map();
      (progress || []).forEach(p => {
        const d = Number(p.day_number);
        if (!progressByDay.has(d)) progressByDay.set(d, []);
        progressByDay.get(d).push(p);
      });

      const CHUNK = 100; // hari per chunk
      let day = 1;
      let actualCostToDate = 0, actualUpahToDate = 0, actualBahanToDate = 0, actualAlatToDate = 0;
      const chartPoints = [{ day: 0, name: 'H-0', rencana: 0, realisasi: 0, rencanaRp: 0, realisasiRp: 0, realisasiUpah: 0, realisasiBahan: 0, realisasiAlat: 0 }];

      const processChunk = () => {
        if (myVersion !== statsVersionRef.current) return; // stale: hentikan
        const end = Math.min(day + CHUNK - 1, maxDay);

        for (; day <= end; day++) {
          // 1. Calculate Periodic Plan (For Bars)
          let planUpahToday = totalLinearUpah / maxDay;
          let planBahanToday = totalLinearBahan / maxDay;
          let planAlatToday = totalLinearAlat / maxDay;

          sequencedSchedule.forEach(it => {
            if (!it.seq_start || !it.seq_end) return;
            const itStartDay = Math.floor((new Date(it.seq_start) - new Date(startDate)) / 86400000) + 1;
            const itEndDay = Math.floor((new Date(it.seq_end) - new Date(startDate)) / 86400000) + 1;
            const itDur = Math.max(Number(it.durasi_hari || 1), 1);
            if (day >= itStartDay && day <= itEndDay) {
              const b = scheduledBreakdowns.find(x => x.id === it.id);
              if (b) {
                planUpahToday += b.upah / itDur;
                planBahanToday += b.bahan / itDur;
                planAlatToday += b.alat / itDur;
              }
            }
          });

          // 2. Calculate Cumulative Plan & Realization (For Lines)
          let planWeightAccum = (nonLaborSum / maxDay) * day;
          sequencedSchedule.forEach(it => {
            if (!it.seq_start || !it.seq_end) return;
            const itStartDay = Math.floor((new Date(it.seq_start) - new Date(startDate)) / 86400000) + 1;
            const itEndDay = Math.floor((new Date(it.seq_end) - new Date(startDate)) / 86400000) + 1;
            const itDur = Math.max(Number(it.durasi_hari || 1), 1);
            if (day >= itStartDay) {
              const completedDays = Math.min(day, itEndDay) - itStartDay + 1;
              planWeightAccum += (Number(it.jumlah || 0) / itDur) * Math.max(0, completedDays);
            }
          });

          let progToday = 0;
          (progressByDay.get(day) || []).forEach(p => {
            const it = items.find(x => x.id === p.entity_id);
            if (!it || !it.volume) return;
            progToday += (Number(p.val) / Number(it.volume)) * Number(it.jumlah);
          });

          actualCostToDate += progToday;

          // Note: actualUpahToDate etc. are not strictly needed for bars anymore as bars use planUpahToday
          // but we keep the points structure consistent
          chartPoints.push({
            day,
            name: `H-${day}`,
            rencana: (planWeightAccum / denominatorRab) * 100,
            realisasi: (actualCostToDate / denominatorRab) * 100,
            rencanaRp: planWeightAccum,
            realisasiRp: actualCostToDate,
            // Bars now use Planned Nominal
            dailyUpah: planUpahToday,
            dailyBahan: planBahanToday,
            dailyAlat: planAlatToday,
          });
        }

        if (day <= maxDay) {
          // Lanjutkan chunk berikutnya pada frame idle
          setTimeout(processChunk, 0);
        } else {
          if (myVersion === statsVersionRef.current) {
            setChartData([...chartPoints]);
            setStatsLoading(false);
          }
        }
      };

      processChunk();
      return; // setStatsLoading akan dipanggil di dalam processChunk
    } catch (e) {
      if (myVersion === statsVersionRef.current) {
        console.error('Error loadProjectStats:', e);
        setStatsLoading(false);
      }
    }
  }

  const selProject = projects.find(p => p.id === selectedId);
  const selName = selProject?.name || selProject?.activity_name || selProject?.work_name || '—';

  const processedChartData = useMemo(() => {
    if (!chartData.length) return [];
    if (sCurveFreq === 'daily') return chartData;

    const interval = sCurveFreq === 'weekly' ? 7 : 30;
    const prefix = sCurveFreq === 'weekly' ? 'M' : 'B';
    const grouped = [];

    // Always start with Point 0 (Start 0%)
    grouped.push({ ...chartData[0], name: '0' });

    // Group the rest (from H-1 onwards)
    const dataToGroup = chartData.slice(1);
    for (let i = 0; i < dataToGroup.length; i += interval) {
      const chunk = dataToGroup.slice(i, i + interval);
      const last = chunk[chunk.length - 1];
      const sumUpah = chunk.reduce((s, c) => s + (c.dailyUpah || 0), 0);
      const sumBahan = chunk.reduce((s, c) => s + (c.dailyBahan || 0), 0);
      const sumAlat = chunk.reduce((s, c) => s + (c.dailyAlat || 0), 0);

      grouped.push({
        ...last,
        name: `${prefix}-${Math.floor(i / interval) + 1}`,
        dailyUpah: sumUpah,
        dailyBahan: sumBahan,
        dailyAlat: sumAlat
      });
    }

    // Ensure the absolute last point is represented (Finish 100%)
    const lastPoint = chartData[chartData.length - 1];
    const lastGrouped = grouped[grouped.length - 1];
    if (lastPoint && lastGrouped && lastGrouped.day !== lastPoint.day) {
      grouped.push({ ...lastPoint, name: 'Selesai' });
    }

    return grouped;
  }, [chartData, sCurveFreq]);

  const todayPointName = useMemo(() => {
    if (!selProject?.start_date) return null;
    const start = new Date(selProject.start_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    const day = Math.floor((today - start) / 86400000);
    if (day < 0) return null;
    
    if (sCurveFreq === 'daily') return `H-${day}`;
    if (day === 0) return '0';
    
    const interval = sCurveFreq === 'weekly' ? 7 : 30;
    const prefix = sCurveFreq === 'weekly' ? 'M' : 'B';
    return `${prefix}-${Math.floor((day - 1) / interval) + 1}`;
  }, [selProject?.start_date, sCurveFreq]);

  const processedItemData = useMemo(() => {
    let raw = projectItems.filter(it => !filterSearch || it.uraian?.toLowerCase().includes(filterSearch.toLowerCase()));
    const babMap = {};
    const sortedBabs = [...new Set(projectItems.map(it => it.bab_pekerjaan))].filter(Boolean);
    sortedBabs.forEach((b, i) => { babMap[b] = romanize(i + 1); });
    const counter = {};
    const indexed = raw.map(it => {
      const b = it.bab_pekerjaan || 'X';
      const bCode = babMap[b] || '?';
      counter[b] = (counter[b] || 0) + 1;
      return { ...it, displayName: `${bCode}.${counter[b]}`, fullName: it.uraian_custom || it.uraian };
    });
    const PAGE_SIZE = 10;
    return {
      visible: indexed.slice(itemPage * PAGE_SIZE, (itemPage + 1) * PAGE_SIZE),
      total: indexed.length,
      hasMore: (itemPage + 1) * PAGE_SIZE < indexed.length,
      hasPrev: itemPage > 0
    };
  }, [projectItems, filterSearch, itemPage]);

  const processedResourceData = useMemo(() => {
    if (resFreq === 'all') {
      let raw = projectStats?.resources?.filter(r => {
        const matchesSearch = !filterSearch || r.uraian?.toLowerCase().includes(filterSearch.toLowerCase());
        const kode = (r.kode_item || '').trim().toUpperCase();
        const jenis = (r.jenis_komponen || '').toLowerCase();
        let matchesT = true;
        if (filterType === 'bahan') matchesT = kode.startsWith('A') || kode.startsWith('B') || jenis === 'bahan';
        else if (filterType === 'alat') matchesT = kode.startsWith('M') || jenis === 'alat';
        else if (filterType === 'upah') matchesT = kode.startsWith('L') || jenis === 'upah' || jenis === 'tenaga';
        return matchesT && matchesSearch;
      }) || [];
      const PAGE_SIZE = 10;
      return {
        type: 'bar',
        visible: raw.slice(resPage * PAGE_SIZE, (resPage + 1) * PAGE_SIZE),
        total: raw.length,
        hasMore: (resPage + 1) * PAGE_SIZE < raw.length,
        hasPrev: resPage > 0
      };
    }
    const interval = resFreq === 'weekly' ? 7 : resFreq === 'monthly' ? 30 : 1;
    const prefix = resFreq === 'weekly' ? 'M' : resFreq === 'monthly' ? 'B' : 'H';
    const grouped = [];
    for (let i = 0; i < chartData.length; i += interval) {
      const chunk = chartData.slice(i, i + interval);
      const last = chunk[chunk.length - 1];
      const index = Math.floor(i / interval) + 1;
      let cost = last.realisasiRp;
      if (filterType === 'bahan') cost = last.realisasiBahan;
      else if (filterType === 'alat') cost = last.realisasiAlat;
      else if (filterType === 'upah') cost = last.realisasiUpah;
      grouped.push({ name: `${prefix}-${index}`, cost });
    }
    const PAGE_SIZE = 12;
    return {
      type: 'area',
      visible: grouped.slice(resPage * PAGE_SIZE, (resPage + 1) * PAGE_SIZE),
      total: grouped.length,
      hasMore: (resPage + 1) * PAGE_SIZE < grouped.length,
      hasPrev: resPage > 0
    };
  }, [projectStats?.resources, chartData, resFreq, filterType, filterSearch, resPage]);

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0f172a]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-800 border-t-indigo-600 dark:border-t-orange-500" />
    </div>
  );

  if (approvalStatus !== 'active') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#020617] flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white dark:bg-[#1e293b] rounded-[32px] p-10 border border-slate-100 dark:border-slate-800 shadow-2xl">
          <div className="w-20 h-20 bg-blue-50 dark:bg-amber-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-blue-600 dark:text-amber-400" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">Akun Menunggu Aktivasi</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
            Terima kasih telah bergabung. Akun Anda sedang dalam tahap peninjauan oleh Admin. Silakan hubungi koordinator Anda atau tunggu hingga Admin mengaktifkan akun Anda untuk mengakses dashboard.
          </p>
          <button onClick={() => supabase.auth.signOut().then(() => router.replace('/'))} className="w-full py-4 bg-indigo-600 dark:bg-slate-800 hover:bg-indigo-700 dark:hover:bg-slate-700 text-white dark:text-slate-300 font-black rounded-2xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-indigo-500/20">
            Keluar Akun
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-[#0f172a] pb-24 role-${activeProjectSlot}`}>
      <div className="bg-slate-50/80 backdrop-blur-md dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <LogoMark className="h-10 w-auto" />
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Monitoring Proyek</h1>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-3">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 role-accent-dot role-glow-sm shrink-0" />
                Status Progres & Realisasi Lapangan
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full role-badge text-[9px] font-black uppercase tracking-tighter">
                  Slot: {activeProjectSlot}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => !joinedLimitReached && setShowJoinModal(true)}
              disabled={joinedLimitReached}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${joinedLimitReached
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 border border-slate-200 dark:border-slate-700'
                }`}
            >
              <Users className="w-4 h-4" /> Gabung Proyek
            </button>
            <Link
              href={ownedLimitReached ? '#' : "/dashboard/rekap-proyek?action=new"}
              style={{ pointerEvents: ownedLimitReached ? 'none' : 'auto' }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg ${ownedLimitReached
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 dark:bg-orange-600 text-white hover:bg-indigo-700 dark:hover:bg-orange-700'
                }`}
            >
              <Plus className="w-4 h-4" /> Proyek Baru
            </Link>
          </div>
        </div>
        {ownedLimitReached && (
          <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-xl text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">
            <AlertCircle className="w-3.5 h-3.5" /> Batas {member?.role === 'advance' ? 5 : (member?.role === 'pro' ? 3 : 1)} proyek buatan sendiri tercapai.
          </div>
        )}
        {joinedLimitReached && (
          <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-xl text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">
            <AlertCircle className="w-3.5 h-3.5" /> Batas 7 proyek kolaborasi tercapai.
          </div>
        )}
      </div>

      <div className="px-8 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-9 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard icon={Wallet} label="Total RAB" value={formatIdr(projectStats?.totalRab)} sub="Budget Terencana" color="indigo" />
            <StatCard icon={ClipboardList} label="Item Pekerjaan" value={`${projectStats?.totalItems || 0} AHSP`} sub="Lingkup Kerja" color="violet" />
            <StatCard icon={Factory} label="Capaian TKDN" value={`${Number(projectStats?.tkdnPct || 0).toFixed(1)}%`} sub="Aset Lokal" color="blue" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard icon={HardHat} label="Upah" value={formatIdr(projectStats?.totalUpah)} sub="Tenaga Kerja" color="indigo" />
            <StatCard icon={Construction} label="Bahan" value={formatIdr(projectStats?.totalBahan)} sub="Material Konstruksi" color="blue" />
            <StatCard icon={Hammer} label="Alat" value={formatIdr(projectStats?.totalAlat)} sub="Peralatan & Mesin" color="violet" />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight">Kurva-S Progres Proyek</h3>
                <p className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-widest">Biaya Pekerjaan (Rp)</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={sCurveFreq} onChange={(e) => setSCurveFreq(e.target.value)} className="text-[10px] font-black bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-3 py-2 cursor-pointer focus:ring-2 ring-indigo-500 dark:ring-orange-500 uppercase tracking-widest text-slate-500">
                  <option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option>
                </select>
                <button onClick={() => setSCurveToday(!sCurveToday)} className={`text-[10px] font-black px-4 py-2 rounded-xl border-none uppercase tracking-widest transition-all ${sCurveToday ? 'bg-indigo-600 dark:bg-orange-600 text-white shadow-lg' : 'bg-slate-50 dark:bg-slate-800 text-slate-500'}`}>
                  Per Hari Ini
                </button>
                <div className="w-px h-6 bg-slate-100 dark:bg-slate-800 mx-2 hidden sm:block" />
                <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-2xl">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-500 dark:bg-orange-500" /><span className="text-[10px] font-bold text-slate-500">Realisasi</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-300" /><span className="text-[10px] font-bold text-slate-500">Rencana</span></div>
                </div>
              </div>
            </div>
            {/* S-CURVE CHART CONTAINER with Guard */}
            <div className="h-[450px] min-h-[400px] bg-slate-50/30 dark:bg-slate-800/20 rounded-[32px] p-6 relative">
              {chartData.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 opacity-40">
                  <Activity className="w-12 h-12 text-slate-300 animate-pulse" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Menunggu Data Grafik S-Curve...</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" debounce={1}>
                  <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                    <defs>
                      <linearGradient id="colorRealisasi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-realis-glow)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--chart-realis-glow)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={isDark ? '#1e293b' : '#e2e8f0'}
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fontWeight: 700, fill: isDark ? '#94a3b8' : '#64748b' }}
                      interval={sCurveFreq === 'daily' ? 'preserveStartEnd' : 0}
                    />
                    {/* Left Axis: Percentage (%) */}
                    <YAxis
                      yAxisId="left"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 700, fill: isDark ? '#94a3b8' : '#475569' }}
                      tickFormatter={(v) => `${v}%`}
                      domain={[0, 100]}
                      ticks={[0, 20, 40, 60, 80, 100]}
                    />
                    {/* Right Axis: Nominal (Rp) */}
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fontWeight: 700, fill: isDark ? '#94a3b8' : '#64748b' }}
                      tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v.toLocaleString()}
                    />

                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        border: 'none',
                        borderRadius: '16px',
                        fontSize: '11px',
                        color: isDark ? '#fff' : '#0f172a',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        zIndex: 50
                      }}
                      itemStyle={{ padding: '2px 0' }}
                      labelStyle={{ color: isDark ? '#94a3b8' : '#64748b', fontWeight: 800, marginBottom: '8px' }}
                      labelFormatter={(label, entries) => {
                        const day = entries[0]?.payload?.day;
                        if (!day || !selProject?.start_date) return label;
                        const dt = new Date(selProject.start_date); dt.setDate(dt.getDate() + day - 1);
                        return dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                      }}
                      formatter={(v, name, props) => {
                        if (name === 'realisasi') return [`${v.toFixed(2)}% (Rp ${formatIdrFull(props.payload.realisasiRp)})`, '📈 Realisasi (Kumulatif)'];
                        if (name === 'rencana') return [`${v.toFixed(2)}% (Rp ${formatIdrFull(props.payload.rencanaRp)})`, '📉 Rencana (Kumulatif)'];
                        return [formatIdrFull(v), name === 'dailyUpah' ? '👷 Upah (Terencana)' : name === 'dailyBahan' ? '🧱 Bahan (Terencana)' : '⚙️ Alat (Terencana)'];
                      }}
                    />

                    {/* Periodic Bars (Grouped) */}
                    <Bar yAxisId="right" dataKey="dailyUpah" fill={isDark ? '#312e81' : '#818cf8'} radius={[4, 4, 0, 0]} opacity={0.6} barSize={sCurveFreq === 'daily' ? 4 : 12} />
                    <Bar yAxisId="right" dataKey="dailyBahan" fill={isDark ? '#92400e' : '#fbbf24'} radius={[4, 4, 0, 0]} opacity={0.6} barSize={sCurveFreq === 'daily' ? 4 : 12} />
                    <Bar yAxisId="right" dataKey="dailyAlat" fill={isDark ? '#065f46' : '#34d399'} radius={[4, 4, 0, 0]} opacity={0.6} barSize={sCurveFreq === 'daily' ? 4 : 12} />

                    {/* Cumulative Lines (% on Left Axis) */}
                    <Area yAxisId="left" type="monotone" dataKey="realisasi" stroke="var(--chart-realisasi)" strokeWidth={4} fillOpacity={1} fill="url(#colorRealisasi)" />
                    <Area yAxisId="left" type="monotone" dataKey="rencana" stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth={3} strokeDasharray="5 5" fill="none" />

                    {sCurveToday && todayPointName && (
                      <ReferenceLine
                        yAxisId="left"
                        x={todayPointName}
                        stroke="#f97316"
                        strokeWidth={2}
                        strokeDasharray="10 5"
                      >
                        <Label
                          value="HARI INI"
                          position="top"
                          fill="#f97316"
                          fontSize={9}
                          fontWeight={900}
                          offset={10}
                          className="tracking-widest"
                        />
                      </ReferenceLine>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 shadow-sm border border-slate-100 dark:border-slate-800 space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-6 border-b border-slate-100 dark:border-slate-800 pb-6">
              <div><h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight">Analisis Detail Pekerjaan</h3></div>
              <div className="flex flex-wrap items-center gap-3">
                <input type="text" placeholder="Cari..." className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold w-48 focus:ring-2 ring-indigo-500" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                <select className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold focus:ring-2 ring-indigo-500" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="all">Semua Tipe</option><option value="bahan">🧱 Material</option><option value="alat">⚙️ Peralatan</option><option value="upah">👷 Tenaga</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between"><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Biaya Per Item (Rp)</h3></div>
                <div className="h-80 min-h-[300px] bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl p-4 relative">
                  {!processedItemData.visible || processedItemData.visible.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-30">
                      <BarChart2 className="w-8 h-8 text-slate-400" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pekerjaan Kosong</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" debounce={1}>
                      <BarChart data={processedItemData.visible} margin={{ bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#1e293b' : '#e2e8f0'} />
                        <XAxis dataKey="displayName" tick={{ fontSize: 9, fontWeight: 700, fill: isDark ? '#94a3b8' : '#475569' }} />
                        <YAxis width={80} tick={{ fontSize: 9, fontWeight: 700, fill: isDark ? '#94a3b8' : '#475569' }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v.toLocaleString()} />
                        <Tooltip
                          contentStyle={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                          itemStyle={{ color: isDark ? '#f1f5f9' : '#1e293b' }}
                          formatter={(v) => formatIdrFull(v)}
                        />
                        <Bar dataKey="progressRupiah" fill={isDark ? '#f97316' : '#4f46e5'} radius={[6, 6, 0, 0]} />
                        <Bar dataKey="totalRupiah" fill={isDark ? '#334155' : '#cbd5e1'} radius={[6, 6, 0, 0]} opacity={0.3} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between"><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Biaya Sumber Daya (Rp)</h3></div>
                <div className="h-80 min-h-[300px] bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl p-4 relative">
                  {!processedResourceData.visible || processedResourceData.visible.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-30">
                      <Zap className="w-8 h-8 text-slate-400" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Sumber Daya Kosong</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" debounce={1}>
                      <BarChart data={processedResourceData.visible} margin={{ bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#1e293b' : '#e2e8f0'} />
                        <XAxis dataKey="uraian" tick={{ fontSize: 8, fill: isDark ? '#94a3b8' : '#475569' }} />
                        <YAxis width={80} tick={{ fontSize: 9, fill: isDark ? '#94a3b8' : '#475569' }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v.toLocaleString()} />
                        <Tooltip
                          contentStyle={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                          itemStyle={{ color: isDark ? '#f1f5f9' : '#1e293b' }}
                          formatter={(v) => formatIdrFull(v)}
                        />
                        <Bar dataKey="kontribusi_nilai" radius={[6, 6, 0, 0]} fill={isDark ? '#f97316' : '#4f46e5'} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-8">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 dark:from-orange-600 dark:to-orange-800 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden">
            <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-6 font-mono">{selProject?.code || 'TANPA-KODE'}</h4>
            <div className="text-xl font-black mb-6">{selName}</div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-white/10 p-3 rounded-2xl"><Calendar className="w-4 h-4" /> <span className="text-xs font-bold">{selProject?.fiscal_year || '—'}</span></div>
              <div className="flex items-center gap-3 bg-white/10 p-3 rounded-2xl"><MapPin className="w-4 h-4" /> <span className="text-xs font-bold truncate">{selProject?.location || '—'}</span></div>
            </div>
            <Link href={`/dashboard/rekap-proyek?id=${selectedId}`} className="mt-8 w-full bg-white/20 hover:bg-white/30 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
              Detail Pekerjaan <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-[32px] p-6 shadow-sm border border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Pilih Proyek Aktif</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-hide">
              {projects.map(p => (
                <button key={p.id} onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${selectedId === p.id ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-orange-500/10 dark:text-orange-400' : 'bg-transparent border-slate-100 dark:border-slate-800 text-slate-500 hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-bold truncate">{p.name || 'Proyek Tanpa Nama'}</div>
                    <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-tighter shrink-0 ${p.created_by === member?.user_id
                      ? 'bg-indigo-600 text-white dark:bg-orange-600'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                      {p.created_by === member?.user_id ? 'Owner' : (projectMembers[p.id] || 'Member')}
                    </span>
                  </div>
                  <div className="text-[9px] font-mono opacity-60 mt-0.5 tracking-wider">{p.code || 'TANPA KODE'}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 shadow-sm border border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8">Status Pekerjaan</h3>
            {(() => {
              const lastDot = chartData[chartData.length - 1] || { realisasi: 0, rencana: 0 };
              const deviasi = lastDot.realisasi - lastDot.rencana;
              const isBehind = deviasi < 0;

              return (
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Deviasi Jadwal</div>
                      <div className={`text-lg font-black font-mono mt-1 ${isBehind ? 'text-amber-600 dark:text-orange-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {deviasi > 0 ? '+' : ''}{deviasi.toFixed(2)}%
                      </div>
                    </div>
                    <div className={`p-2 rounded-xl ${isBehind ? 'bg-amber-100 dark:bg-orange-500/10 text-amber-600 dark:text-orange-500' : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                      {isBehind ? <TrendingUp className="w-5 h-5 rotate-180" /> : <TrendingUp className="w-5 h-5" />}
                    </div>
                  </div>

                  <div className="text-center pt-2">
                    <div className="text-4xl font-black font-mono text-indigo-600 dark:text-orange-500">{lastDot.realisasi.toFixed(1)}%</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Capaian Realisasi</div>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${lastDot.realisasi}%` }} />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {showJoinModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-md p-8 border border-slate-100 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Gabung Proyek</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Masukkan kode unik proyek</p>
              </div>
              <button onClick={() => setShowJoinModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <Plus className="w-5 h-5 rotate-45 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleJoinProject} className="space-y-6">
              <input
                type="text"
                placeholder="KODE PROYEK"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-lg font-black tracking-widest outline-none uppercase text-center"
              />

              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center leading-relaxed">
                  Setelah bergabung, pemilik proyek akan menentukan peran Anda sebagai Kontraktor, Konsultan, atau Instansi.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-2xl text-xs uppercase"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={joining || !joinCode}
                  className="flex-[2] py-4 bg-indigo-600 dark:bg-orange-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-xs disabled:opacity-50"
                >
                  {joining ? 'Memproses...' : 'Bergabung Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0f172a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-800 border-t-indigo-600 dark:border-t-orange-500" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
