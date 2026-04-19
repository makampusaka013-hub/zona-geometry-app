'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 30;

function SearchableSelect({ value, onChange, initialLabel, initialSatuan }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);

  // Default option array to hold the initially selected item if we don't have it fetched yet
  const selectedOpt = options.find(o => o.id === value) || (value && initialLabel ? { id: value, nama_item: initialLabel, satuan: initialSatuan } : null);

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
        className="w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm shadow-sm cursor-pointer flex justify-between items-center focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 hover:border-slate-400 transition-colors"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && options.length === 0) setSearchTerm(''); // Reset search on open to trigger initial fetch
        }}
      >
        <span className="truncate pr-4 text-slate-700 font-medium select-none">
          {selectedOpt ? `${selectedOpt.nama_item} (${selectedOpt.satuan || '-'})` : '-- Cari & Pilih Item Dasar --'}
        </span>
        <svg className={`shrink-0 w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl max-h-80 flex flex-col">
          <div className="p-3 border-b border-slate-100 bg-slate-50/80 rounded-t-lg">
            <div className="relative">
              <svg className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                className="w-full text-sm py-2 pl-9 pr-3 border border-indigo-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
                placeholder="Ketik nama atau kode item (Server Search)..."
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
                  className="px-3 py-2.5 hover:bg-indigo-50 rounded-md cursor-pointer mb-0.5 last:mb-0 transition-colors"
                  onClick={() => {
                    onChange(o.id, o);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                >
                  <div className="text-sm font-semibold text-slate-800">{o.nama_item} <span className="text-xs font-normal text-slate-400 ml-1">({o.kode_item})</span></div>
                  <div className="text-[11px] text-slate-500 flex justify-between mt-1.5 items-center">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-medium">Satuan: {o.satuan}</span>
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
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

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [inputPage, setInputPage] = useState('1');
  
  // Search state
  const [searchAhsp, setSearchAhsp] = useState('');
  const [appliedSearch, setAppliedSearch] = useState(''); 

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

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
  }, [searchAhsp, appliedSearch]);

  // fetchHargaDasar() dihapus karena SearchableSelect melakukan fetch secara server-side

  async function fetchKonversiPage(pageIndex, overrideSearch = appliedSearch) {
    setLoadingData(true);
    setAppliedSearch(overrideSearch);
    try {
      const from = (pageIndex - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('master_konversi')
        .select(`
          id,
          uraian_ahsp,
          satuan_ahsp,
          faktor_konversi,
          item_dasar_id,
          master_harga_dasar (
            nama_item,
            satuan,
            harga_satuan
          )
        `, { count: 'exact' });

      if (overrideSearch.trim() !== '') {
        query = query.ilike('uraian_ahsp', `%${overrideSearch.trim()}%`);
      }

      const { data: konvData, error: konvErr, count } = await query
        .order('item_dasar_id', { ascending: true, nullsFirst: true })
        .order('uraian_ahsp', { ascending: true })
        .range(from, to);

      if (konvErr) throw konvErr;

      setTotalRows(count || 0);
      setKonversiList((konvData || []).map(item => ({
        ...item,
        _editHargaId: item.item_dasar_id || '',
        _editFaktor: item.faktor_konversi || 1,
        _editSatuan: item.satuan_ahsp || '',
      })));
      setCurrentPage(pageIndex);
    } catch (err) {
      console.error('Error fetching data:', err);
      alert('Gagal mengambil data: ' + err.message);
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

      alert('Berhasil menyimpan konversi.');
      await fetchKonversiPage(currentPage, appliedSearch);
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan: ' + err.message);
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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm text-slate-600">
        Menampilkan halaman <strong className="text-slate-900">{currentPage}</strong> dari <strong className="text-slate-900">{totalPages}</strong> 
        <span className="mx-2 text-slate-300">|</span>
        Total: <strong className="text-slate-900">{totalRows}</strong> item
      </div>
      
      <div className="flex items-center gap-3">
        <button
          onClick={handlePrev}
          disabled={currentPage === 1 || loadingData}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        
        <form onSubmit={handleJumpPage} className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Buka hal:</span>
          <input 
            type="number" 
            min="1" 
            max={totalPages}
            value={inputPage || ''}
            onChange={(e) => setInputPage(e.target.value)}
            className="w-16 rounded-md border border-slate-300 py-1.5 px-2 text-sm text-center shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button 
            type="submit"
            disabled={loadingData}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            Go
          </button>
        </form>

        <button
          onClick={handleNext}
          disabled={currentPage === totalPages || loadingData}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <Link
            href="/admin/upload-data"
            className="text-sm font-medium text-indigo-600 underline-offset-2 hover:text-indigo-800 hover:underline mb-2 inline-block"
          >
            ← Kembali ke Upload Data
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Mapping Harga & Konversi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Cocokkan nama komponen AHSP dengan master harga bahan dasar agar RAB dapat terhitung dengan benar.
          </p>
        </header>

        {/* Kotak Filter / Pencarian AHSP */}
        <div className="mb-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 max-w-md relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
            </div>
            <input
              type="text"
              placeholder="Cari item AHSP..."
              value={searchAhsp}
              onChange={(e) => setSearchAhsp(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
            />
          </div>
          {appliedSearch && (
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-medium border border-indigo-100">
              Mencari: &quot;{appliedSearch}&quot;
              <button onClick={() => setSearchAhsp('')} className="text-indigo-500 hover:text-indigo-700 p-0.5 rounded-full hover:bg-indigo-100 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
          )}
        </div>

        <div className="mb-4">
          <PaginationControls />
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm min-h-[500px]">
          {loadingData ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                <span>Memuat data...</span>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-visible pb-32">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    <th className="border-b border-slate-200 px-4 py-3 w-1/3">AHSP Item</th>
                    <th className="border-b border-slate-200 px-4 py-3 w-1/3">Link ke Harga Dasar</th>
                    <th className="border-b border-slate-200 px-4 py-3 w-1/6 text-center">Satuan Konversi</th>
                    <th className="border-b border-slate-200 px-4 py-3 w-1/6 text-center">Faktor Konversi</th>
                    <th className="border-b border-slate-200 px-4 py-3 w-1/12 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {konversiList.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-4 align-top">
                        <div className="font-medium text-slate-900 leading-tight">{row.uraian_ahsp}</div>
                        <div className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5">
                           Satuan: <span className="bg-slate-100 text-slate-700 px-1.5 rounded">{row.satuan_ahsp || '-'}</span>
                        </div>
                        {!row.item_dasar_id && (
                          <div className="mt-2.5 inline-block rounded-md bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 shadow-sm">
                             Belum di-mapping
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top">
                        {/* CUSTOM SEARCHABLE SELECT SERVER-SIDE */}
                        <SearchableSelect 
                          value={row._editHargaId} 
                          initialLabel={row.master_harga_dasar?.nama_item}
                          initialSatuan={row.master_harga_dasar?.satuan}
                          onChange={(newId, selectedObj) => {
                            setKonversiList(prev => prev.map(p => {
                              if (p.id === row.id) {
                                return { 
                                  ...p, 
                                  _editHargaId: newId, 
                                  master_harga_dasar: selectedObj ? {
                                    nama_item: selectedObj.nama_item,
                                    satuan: selectedObj.satuan,
                                    harga_satuan: selectedObj.harga_satuan
                                  } : p.master_harga_dasar
                                };
                              }
                              return p;
                            }));
                          }}
                        />

                        {/* INFO BOX BAWAH */}
                        <div className="text-xs text-slate-500 mt-3 p-3 rounded-lg border border-slate-100 bg-slate-50/80 group-hover:bg-white group-hover:border-slate-200 transition-colors shadow-sm">
                          <div className="flex items-center gap-1.5 mb-2">
                             <span className="font-semibold text-slate-700">Tersimpan di sistem:</span>
                          </div>
                          
                          {row.master_harga_dasar ? (
                            <>
                              <div className="font-medium text-slate-800 mb-2 truncate" title={row.master_harga_dasar.nama_item}>
                                {row.master_harga_dasar.nama_item}
                              </div>
                              <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500">Harga Satuan Dasar:</span>
                                  <span className="font-medium text-slate-700">
                                    Rp {Number(row.master_harga_dasar.harga_satuan).toLocaleString('id-ID')}
                                    <span className="text-[10px] text-slate-400 ml-1">/{row.master_harga_dasar.satuan}</span>
                                  </span>
                                </div>
                                <div className="flex justify-between items-center bg-indigo-50/70 -mx-1 px-1.5 py-1 rounded">
                                  <span className="text-indigo-700 font-medium">Harga Terkonversi:</span>
                                  <span className="font-bold text-indigo-700">
                                    Rp {Number((row.master_harga_dasar.harga_satuan || 0) / (parseFloat(row._editFaktor) || 1)).toLocaleString('id-ID')}
                                    <span className="text-[10px] text-indigo-400 ml-1">/{row._editSatuan || 'sat'}</span>
                                  </span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="py-1.5 px-2 bg-slate-100 rounded text-slate-500 text-center border border-slate-200 border-dashed">
                              Belum terhubung ke Master Harga
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-center">
                        <input
                          type="text"
                          placeholder="sat"
                          className="w-20 rounded-lg border border-slate-300 py-2 px-3 text-sm text-center shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mx-auto block hover:border-slate-400 transition-colors"
                          value={row._editSatuan || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setKonversiList(prev => prev.map(p => p.id === row.id ? { ...p, _editSatuan: val } : p));
                          }}
                        />
                      </td>
                      <td className="px-4 py-4 align-top text-center">
                        <input
                          type="number"
                          step="0.01"
                          className="w-24 rounded-lg border border-slate-300 py-2 px-3 text-sm text-center shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mx-auto block hover:border-slate-400 transition-colors"
                          value={row._editFaktor ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setKonversiList(prev => prev.map(p => p.id === row.id ? { ...p, _editFaktor: val } : p));
                          }}
                        />
                      </td>
                      <td className="px-4 py-4 align-top text-right">
                        <button
                          type="button"
                          onClick={() => handleSaveRow(row, row._editHargaId, row._editFaktor, row._editSatuan)}
                          disabled={savingRow === row.id}
                          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
                        >
                          {savingRow === row.id ? (
                             <span className="flex items-center gap-1.5">
                               <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                               Menyimpan
                             </span>
                          ) : 'Simpan'}
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
      </div>
    </div>
  );
}
