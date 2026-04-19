const fs = require('fs');
const path = require('path');

const katalogPath = path.join(__dirname, 'app/dashboard/katalog-ahsp/page.js');
const dashboardPath = path.join(__dirname, 'app/dashboard/page.js');

// 1. Generate `katalog-ahsp/page.js`
const katalogCode = `'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ThemeToggle } from '@/components/ThemeToggle';

function formatIdr(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n || 0);
}

export default function KatalogAhspPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [memberRole, setMemberRole] = useState('view');
  
  // Data
  const [data, setData] = useState([]);
  const [completeCount, setCompleteCount] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState(0);
  
  // UI State
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [errorMsg, setErrorMsg] = useState('');

  // Filters
  const [filterDivisi, setFilterDivisi] = useState('');
  const [filterJenis, setFilterJenis] = useState('');
  const [filterKategori, setFilterKategori] = useState('');

  const canViewStats = memberRole === 'admin' || memberRole === 'pro';

  const checkAuth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    const { data: m } = await supabase.from('members').select('role').eq('user_id', user.id).maybeSingle();
    setMemberRole(m?.role || 'view');
  }, [router]);

  const loadStats = useCallback(async () => {
    const { count: cCount } = await supabase.from('view_katalog_ahsp_lengkap').select('*', { count: 'exact', head: true }).gt('total_subtotal', 0);
    const { count: iCount } = await supabase.from('view_katalog_ahsp_lengkap').select('*', { count: 'exact', head: true }).eq('total_subtotal', 0);
    setCompleteCount(cCount || 0);
    setIncompleteCount(iCount || 0);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('view_katalog_ahsp_lengkap').select('*');

    if (query) {
      q = q.or(\`nama_pekerjaan.ilike.%\${query}%,kode_ahsp.ilike.%\${query}%\`);
    }
    if (filterDivisi) q = q.ilike('divisi', \`%\${filterDivisi}%\`);
    if (filterJenis) q = q.ilike('jenis_pekerjaan', \`%\${filterJenis}%\`);
    if (filterKategori) q = q.ilike('kategori_pekerjaan', \`%\${filterKategori}%\`);

    if (!showIncomplete) {
      q = q.gt('total_subtotal', 0);
    }

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    q = q.range(from, to).order('kode_ahsp', { ascending: true });

    const { data: rows, error } = await q;
    
    if (error) {
      if (error.code === 'PGRST205') {
         setErrorMsg("View Database belum dibuat. Minta Admin menjalankan SQL Migration 20260405190000_add_tkdn.sql");
      } else {
         setErrorMsg(error.message);
      }
      setData([]);
    } else {
      setErrorMsg('');
      setData(rows || []);
    }
    setLoading(false);
  }, [page, limit, query, filterDivisi, filterJenis, filterKategori, showIncomplete]);

  useEffect(() => {
    checkAuth().then(() => {
      loadStats();
      loadData();
    });
  }, [checkAuth, loadStats, loadData]);

  const toggleRow = (id) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a]">
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e293b] sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Link href="/dashboard" className="text-sm font-medium text-indigo-600 dark:text-amber-500 hover:text-indigo-700 dark:hover:text-amber-400 flex items-center gap-1">
              <span>←</span> Dashboard
            </Link>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* HEADER KHUSUS AHSP CIPTA KARYA */}
      <div className="text-center py-6 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
         <h1 className="text-[16px] uppercase font-bold text-slate-900 dark:text-slate-100 tracking-wide">ANALISA HARGA SATUAN</h1>
         <p className="text-[8px] text-slate-600 dark:text-slate-400 mt-1 uppercase tracking-wider">AHSP CIPTA KARYA SE BINA KONSTRUKSI NO 182 TAHUN 2025</p>
      </div>

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        {errorMsg && (
          <div className="mb-4 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-700 dark:text-red-400 text-sm">
            {errorMsg}
          </div>
        )}

        {/* TOLLS BAR & STATS */}
        <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {canViewStats && (
            <div className="flex gap-4 p-3 bg-white dark:bg-[#1e293b] rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm text-sm">
              <div className="font-semibold text-green-700 dark:text-green-500">Lengkap: {completeCount}</div>
              <div className="font-semibold text-rose-700 dark:text-rose-500">Belum Lengkap: {incompleteCount}</div>
              <label className="flex items-center gap-2 cursor-pointer ml-4 border-l border-slate-200 dark:border-slate-700 pl-4">
                <input type="checkbox" checked={showIncomplete} onChange={e => setShowIncomplete(e.target.checked)} className="rounded" />
                <span className="text-slate-700 dark:text-slate-300 text-xs font-semibold">Tampilkan Semua (Termasuk Belum Lengkap)</span>
              </label>
            </div>
          )}

          <div className="flex gap-2 flex-wrap items-center ml-auto">
            <select value={limit} onChange={e => {setLimit(Number(e.target.value)); setPage(1);}} className="text-sm border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-200 py-2">
              <option value={10}>10 Baris</option>
              <option value={20}>20 Baris</option>
              <option value={50}>50 Baris</option>
            </select>
          </div>
        </div>

        {/* FILTERS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 p-4 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 shadow-sm">
           <input placeholder="Cari Kode / Nama Pekerjaan..." value={query} onChange={e => setQuery(e.target.value)} className="w-full rounded border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm p-2" />
           <input placeholder="Filter Divisi..." value={filterDivisi} onChange={e => setFilterDivisi(e.target.value)} className="w-full rounded border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm p-2" />
           <input placeholder="Filter Jenis Pekerjaan..." value={filterJenis} onChange={e => setFilterJenis(e.target.value)} className="w-full rounded border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm p-2" />
           <input placeholder="Filter Kategori..." value={filterKategori} onChange={e => setFilterKategori(e.target.value)} className="w-full rounded border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm p-2" />
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-[#1e293b]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-indigo-600 dark:bg-amber-600 text-white">
              <tr>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider">KODE</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider">NAMA PEKERJAAN</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center">SAT.</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right">TOTAL UPAH</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right">TOTAL BAHAN</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right">TOTAL ALAT</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right">TOTAL HARGA</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center">TKDN</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center">PROFIT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr><td colSpan="9" className="text-center py-10 text-slate-500">Memuat data...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan="9" className="text-center py-10 text-slate-500">Tidak ada AHSP ditemukan.</td></tr>
              ) : (
                data.map((row) => {
                  const isExpanded = expandedRows.has(row.master_ahsp_id);
                  const isIncomplete = row.total_subtotal === 0;
                  return (
                    <React.Fragment key={row.master_ahsp_id}>
                      {/* MAIN ROW */}
                      <tr 
                        onClick={() => toggleRow(row.master_ahsp_id)}
                        className={\`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 \${isIncomplete ? 'bg-rose-50/50 dark:bg-rose-900/10' : ''}\`}
                      >
                        <td className="px-3 py-3 font-mono text-xs font-semibold text-indigo-700 dark:text-amber-400">
                          {isIncomplete && <span className="mr-1 text-rose-500 text-[10px]" title="Belum Lengkap">⚠️</span>}
                          {row.kode_ahsp}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100 whitespace-normal min-w-[200px]">
                           {row.nama_pekerjaan}
                        </td>
                        <td className="px-3 py-3 text-center text-slate-600 dark:text-slate-400 font-mono text-xs">{row.satuan_pekerjaan}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{formatIdr(row.total_upah)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{formatIdr(row.total_bahan)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{formatIdr(row.total_alat)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{formatIdr(row.total_subtotal)}</td>
                        <td className="px-3 py-3 text-center font-mono text-xs text-green-700 dark:text-green-400">{Number(row.total_tkdn_percent || 0).toFixed(2)}%</td>
                        <td className="px-3 py-3 text-center font-mono text-xs text-slate-500">{row.overhead_profit}%</td>
                      </tr>

                      {/* DETAIL ROWS (EXPANDED) */}
                      {isExpanded && row.details && row.details.map((det, idx) => (
                        <tr key={idx} className="bg-slate-50 dark:bg-slate-800/50 border-b border-dashed border-slate-200 dark:border-slate-700 last:border-b-0">
                          <td className="px-3 py-2 text-right">
                             <span className="text-[10px] text-slate-400 font-mono">{det.kode_item}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 pl-6 border-l-2 border-indigo-200 dark:border-slate-600 whitespace-normal">
                             ↳ {det.uraian} <span className="text-[10px] text-slate-400 ml-1">(Koef: {det.koefisien} × {formatIdr(det.harga_konversi)})</span>
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-slate-500">{det.satuan}</td>
                          <td className="px-3 py-2 text-right text-xs font-mono text-slate-500 bg-slate-100/50 dark:bg-slate-800">
                             {det.jenis_komponen === 'upah' ? formatIdr(det.subtotal) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-mono text-slate-500 bg-slate-100/50 dark:bg-slate-800">
                             {det.jenis_komponen === 'bahan' ? formatIdr(det.subtotal) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-mono text-slate-500 bg-slate-100/50 dark:bg-slate-800">
                             {det.jenis_komponen === 'alat' ? formatIdr(det.subtotal) : '-'}
                          </td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2 text-center text-xs font-mono text-slate-500">{Number(det.tkdn || 0).toFixed(2)}%</td>
                          <td className="px-3 py-2"></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS */}
        <div className="mt-4 flex items-center justify-between">
           <button 
             disabled={page === 1} 
             onClick={() => setPage(p => p - 1)}
             className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-[#1e293b] text-sm text-slate-700 dark:text-slate-200 disabled:opacity-50"
           >
             Sebelumnya
           </button>
           <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Halaman {page}</span>
           <button 
             disabled={data.length < limit}
             onClick={() => setPage(p => p + 1)}
             className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-[#1e293b] text-sm text-slate-700 dark:text-slate-200 disabled:opacity-50"
           >
             Selanjutnya
           </button>
        </div>
      </main>
    </div>
  );
}
`;

fs.mkdirSync(path.dirname(katalogPath), { recursive: true });
fs.writeFileSync(katalogPath, katalogCode);

// 2. Add button to Dashboard
let dashCode = fs.readFileSync(dashboardPath, 'utf-8');
const btnCode = `
              <Link
                href="/dashboard/katalog-ahsp"
                className="hidden md:inline-flex items-center gap-2 rounded-lg border border-indigo-200 dark:border-amber-700/50 bg-indigo-50 dark:bg-amber-900/20 px-3 py-2 text-sm font-medium text-indigo-700 dark:text-amber-400 shadow-sm transition hover:bg-indigo-100 dark:hover:bg-amber-900/40"
              >
                Katalog AHSP Lengkap
              </Link>`;

if (!dashCode.includes('Katalog AHSP Lengkap')) {
   dashCode = dashCode.replace(
     'Update Data Master\n            </Link>',
     'Update Data Master\n            </Link>' + btnCode
   );
   fs.writeFileSync(dashboardPath, dashCode);
}

console.log("Generated Katalog AHSP and updated Dashboard UI.");
