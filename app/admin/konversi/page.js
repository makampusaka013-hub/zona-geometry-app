'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Save,
  CheckCircle2,
  RefreshCw,
  Database
} from 'lucide-react';
import { toast } from '@/lib/toast';

const PAGE_SIZE = 30;

function SearchableSelect({ value, onChange, initialLabel, initialSatuan, initialKode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);

  // Default option array to hold the initially selected item if we don't have it fetched yet
  const selectedOpt = options.find(o => o.id === value) || (value && initialLabel ? { id: value, nama_item: initialLabel, satuan: initialSatuan, kode_item: initialKode } : null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    // Server-side debounced search
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('master_harga_dasar')
          .select('id, nama_item, satuan, kode_item, harga_satuan')
          .order('nama_item', { ascending: true })
          .limit(50); // Batasi respon untuk kecepatan, user harus lebih spesifik mengetik

        if (searchTerm.trim() !== '') {
          // Cari di nama_item ATAU kode_item
          query = query.or(`nama_item.ilike.%${searchTerm.trim()}%,kode_item.ilike.%${searchTerm.trim()}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        setOptions(data || []);
      } catch (err) {
        console.error('Error fetching harga dasar search:', err);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchTerm, isOpen]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div
        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-3 px-4 text-sm shadow-sm cursor-pointer flex justify-between items-center focus-within:ring-2 focus-within:ring-indigo-500 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all group"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && options.length === 0) setSearchTerm('');
        }}
      >
        <div className="flex flex-col gap-0.5 truncate pr-4">
          <span className="truncate text-slate-700 dark:text-slate-200 font-semibold select-none">
            {selectedOpt ? selectedOpt.nama_item : '-- Cari & Pilih Item Dasar --'}
          </span>
          {selectedOpt && (
            <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-mono font-bold">
              {selectedOpt.kode_item} • {selectedOpt.satuan || '-'}
            </span>
          )}
        </div>
        <svg className={`shrink-0 w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-h-[400px] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                className="w-full text-sm py-2.5 pl-10 pr-4 border border-indigo-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Ketik nama atau kode item..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <ul className="overflow-y-auto flex-1 p-1">
            {loading ? (
              <li className="px-4 py-6 text-sm text-slate-500 text-center flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Mencari data...
              </li>
            ) : options.length === 0 ? (
              <li className="px-4 py-6 text-sm text-slate-500 italic text-center">Data tidak ditemukan. Cobalah kata kunci lain.</li>
            ) : (
              options.map(o => (
                <li
                  key={o.id}
                  className="px-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl cursor-pointer mb-1 transition-all"
                  onClick={() => {
                    onChange(o.id, o);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{o.nama_item}</div>
                    <div className="text-[10px] font-mono bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">{o.kode_item}</div>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex justify-between mt-2 items-center">
                    <span className="flex items-center gap-1">
                      <Database className="w-3 h-3 opacity-50" />
                      Satuan: {o.satuan}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-800">
                      Rp {Number(o.harga_satuan).toLocaleString('id-ID')}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function KonversiPage() {
  const router = useRouter();
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [konversiList, setKonversiList] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [savingRow, setSavingRow] = useState(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [autoMapping, setAutoMapping] = useState(false);
  const [activeFilter, setActiveFilter] = useState('terpakai');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [inputPage, setInputPage] = useState('1');

  // Search state
  const [searchAhsp, setSearchAhsp] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [notification, setNotification] = useState(null);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    (async () => {
      setLoadingAuth(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        router.replace('/login');
        return;
      }

      const { data: memberRow } = await supabase
        .from('members')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberRow?.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }

      setLoadingAuth(false);
      fetchKonversiPage(1, '');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    setInputPage(String(currentPage));
  }, [currentPage]);

  // Debounced search for AHSP
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchAhsp !== appliedSearch) {
        fetchKonversiPage(1, searchAhsp);
      }
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchAhsp, activeFilter]);

  async function handleSyncAllCatalog() {
    setSyncingAll(true);
    try {
      const { data, error } = await supabase.rpc('sync_all_catalog_to_konversi');
      if (error) throw error;

      toast.success(`Berhasil menyinkronkan ${data?.synced_count || 0} item baru dari AHSP!`);
      fetchKonversiPage(1);
    } catch (err) {
      console.error('Sync failed:', err);
      toast.error('Gagal sinkronisasi: ' + err.message);
    } finally {
      setSyncingAll(false);
    }
  }

  async function handleAutoMapSameItems() {
    setAutoMapping(true);
    try {
      const { data, error } = await supabase.rpc('auto_map_same_items');
      if (error) throw error;

      showToast(`Berhasil memasangkan ${data?.affected_count || 0} item yang sama persis!`);
      fetchKonversiPage(currentPage);
    } catch (err) {
      console.error('Auto-map failed:', err);
      showToast('Gagal auto-map: ' + err.message, 'error');
    } finally {
      setAutoMapping(false);
    }
  }

  async function fetchKonversiPage(pageIndex, overrideSearch = appliedSearch) {
    setLoadingData(true);
    setAppliedSearch(overrideSearch);
    try {
      const from = (pageIndex - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('view_konversi_lengkap')
        .select('*', { count: 'exact' });

      if (activeFilter === 'terpakai') {
        query = query.eq('is_terpakai_ahsp', true);
      } else if (activeFilter === 'belum_konversi') {
        query = query.eq('is_mapped', false);
      } else if (activeFilter === 'sudah_konversi') {
        query = query.eq('is_mapped', true);
      }

      // Pencarian Super Fleksibel: Ganti spasi dengan % agar kebal Enter/Newline
      if (overrideSearch.trim() !== '') {
        const flexibleSearch = `%${overrideSearch.trim().replace(/\s+/g, '%')}%`;
        query = query.ilike('uraian_ahsp', flexibleSearch);
      }

      const { data: konvData, error: konvErr, count } = await query
        .order('is_terpakai_ahsp', { ascending: false })
        .order('is_mapped', { ascending: true })
        .order('uraian_ahsp', { ascending: true })
        .range(from, to);

      if (konvErr) throw konvErr;

      setTotalRows(count || 0);
      setKonversiList((konvData || []).map(item => ({
        ...item,
        master_harga_dasar: item.is_mapped ? {
          nama_item: item.master_nama_item,
          satuan: item.master_satuan,
          harga_satuan: item.master_harga_satuan,
          kode_item: item.master_kode_item
        } : null,
        _editHargaId: item.item_dasar_id || '',
        _editFaktor: item.faktor_konversi || 1,
        _editSatuan: item.satuan_ahsp || '',
      })));
      setCurrentPage(pageIndex);
    } catch (err) {
      console.error('Error fetching data:', err);
      showToast('Gagal mengambil data: ' + err.message, 'error');
    } finally {
      setLoadingData(false);
    }
  }

  async function handleSaveRow(row, newHargaId, newFaktor, newSatuan) {
    setSavingRow(row.id);
    try {
      const hargaUuid =
        newHargaId !== undefined && newHargaId !== null && String(newHargaId).trim() !== ''
          ? String(newHargaId).trim()
          : null;

      const payload = {
        item_dasar_id: hargaUuid,
        faktor_konversi: parseFloat(newFaktor) || 1,
        satuan_ahsp: newSatuan || null
      };

      const { error } = await supabase
        .from('master_konversi')
        .update(payload)
        .eq('id', row.id);

      if (error) throw error;

      showToast('Berhasil menyimpan konversi.');
      await fetchKonversiPage(currentPage, appliedSearch);
    } catch (err) {
      console.error(err);
      showToast('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSavingRow(null);
    }
  }

  function handlePrev() {
    if (currentPage > 1) fetchKonversiPage(currentPage - 1, appliedSearch);
  }

  function handleNext() {
    if (currentPage < totalPages) fetchKonversiPage(currentPage + 1, appliedSearch);
  }

  function handleJumpPage(e) {
    e.preventDefault();
    const p = parseInt(inputPage, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      fetchKonversiPage(p, appliedSearch);
    } else {
      setInputPage(String(currentPage));
    }
  }

  if (loadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </div>
    );
  }

  // Komponen Pagination
  const PaginationControls = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
      <div className="text-sm text-slate-500 dark:text-slate-400">
        Menampilkan halaman <strong className="text-slate-900 dark:text-slate-100">{currentPage}</strong> dari <strong className="text-slate-900 dark:text-slate-100">{totalPages}</strong>
        <span className="mx-3 opacity-30">|</span>
        Total: <strong className="text-indigo-600 dark:text-indigo-400">{totalRows}</strong> item
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handlePrev}
          disabled={currentPage === 1 || loadingData}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <form onSubmit={handleJumpPage} className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max={totalPages}
            value={inputPage || ''}
            onChange={(e) => setInputPage(e.target.value)}
            className="w-14 rounded-xl border border-slate-200 dark:border-slate-700 py-2 text-sm text-center font-bold dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            type="submit"
            disabled={loadingData}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            Go
          </button>
        </form>

        <button
          onClick={handleNext}
          disabled={currentPage === totalPages || loadingData}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-8 sm:py-12 transition-colors duration-300">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">

          <Link href="/admin/upload-data" className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold hover:gap-3 transition-all mb-4">
            <ChevronRight className="w-4 h-4 rotate-180" />
            Kembali ke Pusat Upload
          </Link>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Sentralisasi Harga Satuan AHSP</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 font-medium">
            Hubungkan seluruh item material proyek ke Katalog Harga Pasar untuk mendapatkan perhitungan RAB yang presisi.
          </p>
        </header>

        {/* Kotak Filter / Pencarian AHSP */}
        <div className="mb-6 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col md:flex-row gap-4 items-end sm:items-center">
            <button
              onClick={handleSyncAllCatalog}
              disabled={syncingAll}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${syncingAll
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20'
                }`}
            >
              <RefreshCw className={`w-4 h-4 ${syncingAll ? 'animate-spin' : ''}`} />
              {syncingAll ? 'Sinkronisasi...' : 'Sinkronkan Item dari AHSP'}
            </button>
            <button
              onClick={handleAutoMapSameItems}
              disabled={autoMapping || syncingAll}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${autoMapping
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20'
                }`}
            >
              <Database className={`w-4 h-4 ${autoMapping ? 'animate-bounce' : ''}`} />
              {autoMapping ? 'Memasangkan...' : 'Auto-Map Item Sama'}
            </button>

            <div className="flex-1 max-w-xl relative w-full">
              <Search className="absolute inset-y-0 left-4 my-auto h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari uraian pekerjaan AHSP atau Barang..."
                value={searchAhsp}
                onChange={(e) => setSearchAhsp(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-0 rounded-2xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {[
              { id: 'terpakai', label: 'AHSP Terpakai', icon: <RefreshCw className="w-4 h-4" /> },
              { id: 'belum_konversi', label: 'Belum Terkonversi', icon: <AlertCircle className="w-4 h-4 text-rose-500" /> },
              { id: 'sudah_konversi', label: 'Sudah Terkonversi', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeFilter === f.id
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
              >
                {f.icon}
                {f.label}
              </button>
            ))}
          </div>

          {appliedSearch && (
            <div className="inline-flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-2xl text-sm font-bold border border-indigo-100 dark:border-indigo-800/50">
              Mencari: &quot;{appliedSearch}&quot;
              <button onClick={() => setSearchAhsp('')} className="p-1 hover:bg-white dark:hover:bg-indigo-800 rounded-full transition-colors">
                <ChevronRight className="w-4 h-4 rotate-45" />
              </button>
            </div>
          )}
        </div>

        <div className="mb-4">
          <PaginationControls />
        </div>

        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden min-h-[600px]">
          {loadingData ? (
            <div className="flex h-96 items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-100 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400" />
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest animate-pulse">Sinkronisasi Data...</span>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-visible pb-40">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-left text-[11px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                    <th className="border-b border-slate-100 dark:border-slate-700 px-6 py-5 w-1/3">Material dari Proyek (AHSP)</th>
                    <th className="border-b border-slate-100 dark:border-slate-700 px-6 py-5 w-1/3">Sumber Harga Pasar</th>
                    <th className="border-b border-slate-100 dark:border-slate-700 px-6 py-5 w-1/8 text-center">Satuan Target</th>
                    <th className="border-b border-slate-100 dark:border-slate-700 px-6 py-5 w-1/8 text-center">Faktor Bagi (÷)</th>
                    <th className="border-b border-slate-100 dark:border-slate-700 px-6 py-5 w-1/4 text-right">Konversi ke Harga AHSP</th>
                    <th className="border-b border-slate-100 dark:border-slate-700 px-6 py-5 w-1/12 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {konversiList.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                      <td className="px-6 py-6 align-top">
                        <div className={`font-bold leading-tight mb-2 text-lg ${row.is_terpakai_ahsp ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-slate-100'}`}>
                          {row.uraian_ahsp}
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm">
                            SATUAN: <span className="text-slate-900 dark:text-slate-100 uppercase">{row.satuan_ahsp || '-'}</span>
                          </span>
                          {row.is_terpakai_ahsp ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest shadow-sm">
                              Real AHSP
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[9px] font-black uppercase tracking-widest border border-slate-300 dark:border-slate-600 shadow-sm">
                              Hanya Katalog
                            </span>
                          )}
                          {row.is_terpakai_ahsp && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 shadow-sm">
                              Terpakai di AHSP
                            </span>
                          )}
                          {row.has_unit_mismatch && (
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${row.is_beda_satuan_urgent
                                ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/50 animate-pulse'
                                : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800/50'
                              }`}>
                              <AlertCircle className="w-3 h-3 mr-1" />
                              {row.is_beda_satuan_urgent ? 'Beda Satuan (Default 1)' : 'Beda Satuan'}
                            </span>
                          )}
                        </div>
                        {!row.item_dasar_id && (
                          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-rose-50 dark:bg-rose-900/20 px-3 py-1 text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest border border-rose-100 dark:border-rose-900/50 shadow-sm animate-pulse">
                            <AlertCircle className="w-3 h-3" />
                            Belum Terhubung
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-6 align-top">
                        {/* CUSTOM SEARCHABLE SELECT SERVER-SIDE */}
                        <SearchableSelect
                          value={row._editHargaId}
                          initialLabel={row.master_harga_dasar?.nama_item}
                          initialSatuan={row.master_harga_dasar?.satuan}
                          initialKode={row.master_harga_dasar?.kode_item}
                          onChange={(newId, selectedObj) => {
                            setKonversiList(prev => prev.map(p => {
                              if (p.id === row.id) {
                                return {
                                  ...p,
                                  _editHargaId: newId,
                                  master_harga_dasar: selectedObj ? {
                                    nama_item: selectedObj.nama_item,
                                    satuan: selectedObj.satuan,
                                    harga_satuan: selectedObj.harga_satuan,
                                    kode_item: selectedObj.kode_item
                                  } : p.master_harga_dasar
                                };
                              }
                              return p;
                            }));
                          }}
                        />

                        {/* INFO BOX BAWAH */}
                        <div className="text-xs text-slate-500 mt-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 group-hover:bg-white dark:group-hover:bg-slate-800 transition-all shadow-sm">
                          {row.master_harga_dasar ? (
                            <div className="space-y-3">
                              <div className="flex justify-between items-start gap-4">
                                <div className="font-bold text-slate-800 dark:text-slate-200 flex-1 leading-tight">
                                  {row.master_harga_dasar.nama_item}
                                </div>
                                <div className="text-[9px] font-black bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded uppercase tracking-tighter shrink-0">
                                  {row.master_harga_dasar.kode_item}
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 border-t border-slate-200/50 dark:border-slate-700/50 pt-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Harga Dasar:</span>
                                  <span className="font-mono font-black text-slate-700 dark:text-slate-300">
                                    Rp {Number(row.master_harga_dasar.harga_satuan).toLocaleString('id-ID')}
                                    <span className="text-[9px] text-slate-400 ml-1 font-normal">/{row.master_harga_dasar.satuan}</span>
                                  </span>
                                </div>
                                <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 -mx-2 px-3 py-2 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
                                  <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Harga Terkonversi:</span>
                                  <span className="font-mono font-black text-emerald-700 dark:text-emerald-400 text-sm">
                                    Rp {Number((row.master_harga_dasar.harga_satuan || 0) / (parseFloat(row._editFaktor) || 1)).toLocaleString('id-ID')}
                                    <span className="text-[9px] text-emerald-500/60 ml-1 font-normal">/{row._editSatuan || 'sat'}</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="py-4 text-center">
                              <Database className="w-6 h-6 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">
                                Belum terhubung ke Master Harga
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-6 align-top text-center">
                        <input
                          type="text"
                          placeholder="sat"
                          className="w-24 rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 px-3 text-sm text-center font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-slate-800 dark:text-white mx-auto block hover:border-indigo-400 transition-all"
                          value={row._editSatuan || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setKonversiList(prev => prev.map(p => p.id === row.id ? { ...p, _editSatuan: val } : p));
                          }}
                        />
                      </td>
                      <td className="px-6 py-6 align-top text-center">
                        <input
                          type="number"
                          step="0.01"
                          className="w-28 rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 px-3 text-sm text-center font-mono font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-slate-800 dark:text-white mx-auto block hover:border-indigo-400 transition-all"
                          value={row._editFaktor ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setKonversiList(prev => prev.map(p => p.id === row.id ? { ...p, _editFaktor: val } : p));
                          }}
                        />
                      </td>

                      <td className="px-6 py-6 align-top text-right">
                        {row.master_harga_dasar ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga Konversi</div>
                            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none">
                              Rp {(row.master_harga_dasar.harga_satuan / (row._editFaktor || 1)).toLocaleString('id-ID')}
                              <span className="ml-1 text-[10px] font-bold text-slate-400">/{row.satuan_ahsp}</span>
                            </div>
                            <div className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md mt-1">
                              Dari: Rp {row.master_harga_dasar.harga_satuan.toLocaleString('id-ID')}/{row.master_harga_dasar.satuan}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] font-bold text-slate-300 dark:text-slate-700 italic">
                            Pilih referensi harga...
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-6 align-top text-right">
                        <button
                          type="button"
                          onClick={() => handleSaveRow(row, row._editHargaId, row._editFaktor, row._editSatuan)}
                          disabled={savingRow === row.id}
                          className="group relative inline-flex items-center justify-center rounded-xl bg-slate-900 dark:bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-xl hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all disabled:opacity-50 overflow-hidden"
                        >
                          {savingRow === row.id ? (
                            <span className="flex items-center gap-2">
                              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                              ...
                            </span>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Simpan
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}

                  {konversiList.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-16 text-center text-sm text-slate-500 bg-slate-50 rounded-b-xl border-t border-slate-100">
                        {appliedSearch ? (
                          <div>Tidak ada item AHSP yang sesuai dengan kata kunci &quot;{appliedSearch}&quot;.</div>
                        ) : (
                          <div>Belum ada item Konversi AHSP. Silakan upload file terlebih dahulu.</div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Pagination Controls Bottom */}
        {totalRows > 0 && (
          <div className="mt-4">
            <PaginationControls />
          </div>
        )}
        {/* Toast Notification Modern */}
        {notification && (
          <div
            className="fixed bottom-8 right-8 z-[9999] animate-slide-up"
            id="custom-toast"
          >
          <div className={`
            flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md border
            ${notification.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-200'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'}
          `}>
            <div className={`
              w-7 h-7 rounded-lg flex items-center justify-center text-sm
              ${notification.type === 'error' ? 'bg-red-500/20' : 'bg-emerald-500/20'}
            `}>
              {notification.type === 'error' ? '✕' : '✓'}
            </div>
            <div className="flex flex-col max-w-[280px]">
              <p className="text-[13px] font-bold leading-tight">{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="ml-2 opacity-30 hover:opacity-100 transition-opacity"
            >
              <span className="text-xs">✕</span>
            </button>
          </div>
          </div>
        )}

        <style jsx global>{`
        @keyframes slide-up {
          from { transform: translateY(100%) scale(0.9); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      </div>
    </div>
  );
}
