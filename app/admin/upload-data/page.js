'use client';

import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const REQUIRED_AHSP_COLUMNS = [
  'jenis_pekerjaan',
  'kategori_pekerjaan',
  'divisi',
  'kode_ahsp',
  'nama_pekerjaan',
  'uraian_ahsp',
  'kode_item_dasar',
  'koefisien',
  'satuan_pekerjaan',
  'satuan_uraian',
  'konversi'
];

const REQUIRED_HARGA_KOLOM = [
  'kode_item',
  'harga_satuan',
];

function normalizeString(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Normalisasi header CSV universal, auto convert 'id_barang' jadi 'kode_item_dasar' */
function normalizeUniversalCsvHeader(h) {
  let n = normalizeString(h).toLowerCase().replace(/\s+/g, '_');
  if (n === 'id_barang') return 'kode_item_dasar';
  if (n === 'faktor_konversi' || n === 'faktor') return 'konversi';
  if (n === 'tkdn' || n === 'tkdn_percent' || n === 'tkdn_persen') return 'tkdn_percent';
  return n;
}

function normalizeNumber(v) {
  if (!v) return null;
  const s = normalizeString(v).replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export default function UploadDataMasterPage() {
  const router = useRouter();
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userRole, setUserRole] = useState(null);

  const [activeTab, setActiveTab] = useState('ahsp'); // 'harga' | 'ahsp'

  const [file, setFile] = useState(null);
  const [fileEncoding, setFileEncoding] = useState('UTF-8'); // Default UTF-8
  const [parseError, setParseError] = useState(null);
  const [rows, setRows] = useState([]);
  const [detectedType, setDetectedType] = useState(null); // 'ahsp' atau 'harga'

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  
  const [needsSync, setNeedsSync] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [globalProfit, setGlobalProfit] = useState(10);
  const [updatingProfit, setUpdatingProfit] = useState(false);
  const [profitUpdateResult, setProfitUpdateResult] = useState(null);

  const canUpload = userRole === 'admin';

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);

  useEffect(() => {
    (async () => {
      setLoadingAuth(true);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace('/login');
        return;
      }

      const { data: memberRow } = await supabase
        .from('members')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      const role = memberRow?.role ?? 'view';
      setUserRole(role);

      if (role !== 'admin') {
        router.replace('/dashboard');
        return;
      }

      // Fetch current global profit from setting
      const { data: profitVal } = await supabase.rpc('get_global_profit');
      if (profitVal) setGlobalProfit(profitVal);

      setLoadingAuth(false);
    })();
  }, [router]);

  // Tab tidak lagi clear file secara paksa agar user bebas lihat instruksi.
  // Hanya reset saat murni ganti tab jika belum ada file.
  useEffect(() => {
    if (!file) {
      setParseError(null);
      setRows([]);
      setUploadResult(null);
      setUploadError(null);
      setNeedsSync(false);
      setDetectedType(null);
    }
  }, [activeTab, file]);

  // Re-parse when encoding changes
  useEffect(() => {
    if (file) {
      parseFile(file, fileEncoding);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileEncoding]);

  async function handleFileChange(e) {
    const chosen = e.target.files?.[0] ?? null;
    setFile(chosen);
    if (chosen) {
       parseFile(chosen, fileEncoding);
    } else {
       setRows([]);
       setUploadResult(null);
       setUploadError(null);
       setParseError(null);
       setDetectedType(null);
    }
  }

  function parseFile(targetFile, enc) {
    setRows([]);
    setUploadResult(null);
    setUploadError(null);
    setParseError(null);
    
    try {
      Papa.parse(targetFile, {
        header: true,
        skipEmptyLines: true,
        encoding: enc, 
        transformHeader: normalizeUniversalCsvHeader,
        complete: (results) => {
          const rawRows = results.data || [];
          const errors = results.errors || [];

          if (errors.length > 0) {
            setParseError(errors[0]?.message || 'Gagal membaca CSV.');
            return;
          }

          const headerFields = results.meta?.fields || [];
          
          // DETEKSI LOGIKA OTOMATIS: Jangan terpaku pada activeTab
          let isAhsp = headerFields.includes('kode_ahsp') || headerFields.includes('uraian_ahsp') || headerFields.includes('koefisien');
          
          if (isAhsp) {
            setDetectedType('ahsp');
            setActiveTab('ahsp'); // Auto switch UI untuk kecocokan keterangan

            const missing = REQUIRED_AHSP_COLUMNS.filter((c) => !headerFields.includes(c));
            if (missing.length > 0) {
              setParseError(`Kolom CSV untuk AHSP tidak lengkap. Hilang kolom: [${missing.join(', ')}]. Pastikan file Anda adalah file AHSP.`);
              return;
            }

            let lastHeader = {
              jenis_pekerjaan: '',
              kategori_pekerjaan: '',
              divisi: '',
              kode_ahsp: '',
              nama_pekerjaan: '',
              satuan_pekerjaan: ''
            };

            const mapped = rawRows.map((r) => {
              const koef = normalizeNumber(r.koefisien);
              if (koef === null) return null;

              if (normalizeString(r.kode_ahsp)) lastHeader.kode_ahsp = normalizeString(r.kode_ahsp);
              if (normalizeString(r.nama_pekerjaan)) lastHeader.nama_pekerjaan = normalizeString(r.nama_pekerjaan);
              if (normalizeString(r.jenis_pekerjaan)) lastHeader.jenis_pekerjaan = normalizeString(r.jenis_pekerjaan);
              if (normalizeString(r.kategori_pekerjaan)) lastHeader.kategori_pekerjaan = normalizeString(r.kategori_pekerjaan);
              if (normalizeString(r.divisi)) lastHeader.divisi = normalizeString(r.divisi);
              if (normalizeString(r.satuan_pekerjaan)) lastHeader.satuan_pekerjaan = normalizeString(r.satuan_pekerjaan);

              return {
                jenis_pekerjaan: lastHeader.jenis_pekerjaan || '-',
                kategori_pekerjaan: lastHeader.kategori_pekerjaan || '-',
                divisi: lastHeader.divisi,
                kode_ahsp: lastHeader.kode_ahsp,
                nama_pekerjaan: lastHeader.nama_pekerjaan || '-',
                uraian_ahsp: normalizeString(r.uraian_ahsp),
                kode_item_dasar: normalizeString(r.kode_item_dasar || r.kode_item || r.id_barang),
                koefisien: koef,
                satuan_pekerjaan: lastHeader.satuan_pekerjaan || '-',
                satuan_uraian: normalizeString(r.satuan_uraian) || '-',
                konversi:
                  normalizeNumber(r.konversi ?? r.faktor_konversi ?? r.faktor) !== null
                    ? normalizeNumber(r.konversi ?? r.faktor_konversi ?? r.faktor)
                    : 1
              };
            }).filter(Boolean);

            setRows(mapped);
          } else {
             // Jika bukan AHSP, asumsikan Harga Bahan
             setDetectedType('harga');
             setActiveTab('harga');

             const missingHarga = REQUIRED_HARGA_KOLOM.filter((c) => !headerFields.includes(c));
             if (missingHarga.length > 0) {
               setParseError(`File ini terdeteksi berbeda. Kolom CSV untuk Harga Satuan tidak lengkap. Wajib ada: ${missingHarga.join(', ')}. (Kolom Anda: ${headerFields.join(', ')})`);
               return;
             }

             const mapped = rawRows.map(r => {
                const hrg = normalizeNumber(r.harga_satuan);
                if (hrg === null || hrg === undefined) return null;

                return {
                  no_urut: normalizeNumber(r.no_urut),
                  nama_item: normalizeString(r.nama_item),
                  kode_item: normalizeString(r.kode_item),
                  satuan: normalizeString(r.satuan),
                  harga_satuan: hrg,
                  keterangan: normalizeString(r.keterangan),
                  tkdn_percent: normalizeNumber(r.tkdn_percent),
                  status: normalizeString(r.status) || 'active'
                };
             }).filter(r => r !== null && r.kode_item);

             setRows(mapped);
          }
        },
        error: (err) => {
          setParseError(err?.message || 'Gagal membaca CSV.');
        },
      });
    } catch (err) {
      setParseError(err?.message || 'Gagal membaca CSV.');
    }
  }

  async function handleConfirmUpload() {
    setUploadError(null);
    setUploadResult(null);

    if (!rows || rows.length === 0) {
      setUploadError('Belum ada data valid untuk diupload. Periksa file CSV Anda.');
      return;
    }

    setUploading(true);
    try {
      if (detectedType === 'ahsp') {
        let totalInsertedHeaders = 0;
        let totalInsertedDetails = 0;
        const CHUNK_SIZE = 100;
        
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          const { data, error } = await supabase.rpc('upload_ahsp_csv', { p_rows: chunk });
          if (error) throw error;
          if (data) {
            totalInsertedHeaders += (data.inserted_headers || 0);
            totalInsertedDetails += (data.inserted_details || 0);
          }
        }
        
        let linked = 0;
        let syncWarning = null;
        try {
          const { data: syncData, error: syncErr } = await supabase.rpc('sync_master_konversi');
          if (syncErr) throw syncErr;
          linked = syncData?.inserted ?? 0;
        } catch (e) {
          syncWarning = e?.message || String(e);
        }

        setUploadResult({
          message: `Upload AHSP selesai. Header baru: ${totalInsertedHeaders}, detail: ${totalInsertedDetails}. Sinkron kode → harga dasar: ${linked} baris.${
            syncWarning ? ` Perhatian: ${syncWarning}` : ''
          }`,
          kind: 'ahsp-complete',
          syncWarning: syncWarning || null,
        });

      } else {
        const { data, error } = await supabase.rpc('upload_harga_dasar_csv', { p_rows: rows });
        if (error) throw error;
        setUploadResult({
          message: `Berhasil upload Harga Dasar. Berhasil Insert: ${data?.inserted_rows || 0}, Update: ${data?.updated_rows || 0}`
        });
      }
      
      setRows([]);
      if (file) setFile(null);
    } catch (err) {
      setUploadError(err?.message || 'Terdapat error saat menyimpan ke database.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSyncKonversi() {
    setUploadError(null);
    setSyncing(true);
    try {
       const { data, error } = await supabase.rpc('sync_master_konversi');
       if (error) throw error;
       setUploadResult({
         message: `Sinkronisasi berhasil! ${data?.inserted || 0} Konversi baru ditambahkan.`
       });
       setNeedsSync(false);
    } catch (err) {
       setUploadError('Gagal melakukan sinkronisasi: ' + err.message);
    } finally {
       setSyncing(false);
    }
  }

  async function handleUpdateGlobalProfit() {
    setProfitUpdateResult(null);
    setUpdatingProfit(true);
    try {
      if (globalProfit < 0 || globalProfit > 100) {
         throw new Error("Profit harus antara 0 dan 100");
      }
      let err;
      const res = await supabase.rpc('update_global_profit', { p_profit: Number(globalProfit) });
      if (res.error && (res.error.code === 'PGRST202' || res.error.message?.includes('schema cache') || res.error.message?.includes('function update_global_profit does not exist'))) {
          // Fallback if RPC hasn't been created yet
          const upd = await supabase.from('master_ahsp').update({ overhead_profit: Number(globalProfit) }).neq('id', '00000000-0000-0000-0000-000000000000');
          err = upd.error;
      } else {
          err = res.error;
      }
      
      if (err) throw err;
      setProfitUpdateResult({ kind: 'success', message: `Berhasil mengubah profit default menjadi ${globalProfit}%.` });
    } catch (err) {
      setProfitUpdateResult({ kind: 'error', message: err?.message || 'Gagal mengubah profit. Pastikan Anda memiliki akses admin.'});
    } finally {
      setUpdatingProfit(false);
    }
  }

  if (loadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0f172a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-slate-900 dark:border-t-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a]">
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-slate-600 dark:text-slate-400 underline-offset-2 hover:text-slate-900 dark:hover:text-slate-200 hover:underline"
            >
              ← Kembali ke Dashboard
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              Upload Data Master
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Halaman khusus untuk admin untuk mengimpor data Harga Dasar atau AHSP secara batch.
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-2">
            <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 text-sm font-medium text-slate-800 dark:text-slate-200">
              Role: {userRole}
            </span>
            {userRole === 'admin' && (
              <Link
                href="/admin/konversi"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-600 hover:text-slate-900 dark:hover:text-white"
              >
                <span>Pengaturan Konversi</span>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* TAB Navigation */}
        <div className="mb-6 flex space-x-1 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('harga')}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'harga'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Upload Harga Satuan
          </button>
          <button
            onClick={() => setActiveTab('ahsp')}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'ahsp'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Upload AHSP
          </button>
        </div>

        {/* SETTING PROFIT GLOBAL */}
        {userRole === 'admin' && (
          <section className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Pengaturan Profit (Overhead)</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Ubah persentase profit default untuk seluruh master data AHSP (Pajak & Keuntungan).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={globalProfit}
                    onChange={(e) => setGlobalProfit(e.target.value)}
                    className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-right pr-8 focus:border-indigo-500 dark:focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-orange-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                  <span className="absolute right-3 top-2 text-slate-500 dark:text-slate-400 font-medium">%</span>
                </div>
                <button
                  onClick={handleUpdateGlobalProfit}
                  disabled={updatingProfit}
                  className="inline-flex items-center justify-center rounded-lg bg-indigo-600 dark:bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-orange-700 disabled:opacity-50 transition-colors"
                >
                  {updatingProfit ? (
                    <span className="flex items-center gap-2">
                       <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                       Menyimpan...
                    </span>
                  ) : 'Terapkan ke Semua'}
                </button>
              </div>
            </div>
            {profitUpdateResult && (
              <div className={`mt-4 rounded-lg px-4 py-3 text-sm flex gap-3 items-start ${profitUpdateResult.kind === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {profitUpdateResult.kind === 'success' ? (
                   <svg className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                ) : (
                   <svg className="h-5 w-5 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg>
                )}
                <div>{profitUpdateResult.message}</div>
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <div className="mb-6 border-b border-slate-100 dark:border-slate-700 pb-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {activeTab === 'harga' ? 'Upload Master Harga Bahan/Tenaga/Alat' : 'Upload Data AHSP'}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {activeTab === 'harga' 
                 ? `Struktur CSV minimal wajib memiliki header: ${REQUIRED_HARGA_KOLOM.join(', ')}.`
                 : `Struktur CSV minimal wajib memiliki header: ${REQUIRED_AHSP_COLUMNS.join(', ')}.`
              }
            </p>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 w-full relative">
              <div className="flex justify-between items-end mb-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Pilih file CSV
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 dark:text-slate-400">Format Teks:</label>
                  <select 
                    value={fileEncoding}
                    onChange={(e) => setFileEncoding(e.target.value)}
                    className="text-xs border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-orange-500"
                  >
                    <option value="UTF-8">UTF-8 (Standar Web)</option>
                    <option value="ISO-8859-1">ANSI (Excel Lama)</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 dark:border-slate-600 border-dashed rounded-xl cursor-pointer bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg className="w-8 h-8 mb-3 text-slate-400 dark:text-slate-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                    </svg>
                    <p className="mb-1 text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold">Klik untuk memilih</span> {file ? 'file lain' : 'file CSV'}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">MAX 10MB (.csv)</p>
                  </div>
                  <input type="file" className="hidden" accept=".csv,text/csv" onChange={handleFileChange} />
                </label>
              </div>
              
              {file && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-indigo-50 dark:bg-orange-950/20 px-4 py-3 border border-indigo-100 dark:border-orange-900/30">
                  <div className="flex items-center gap-3">
                    <svg className="h-6 w-6 text-indigo-500 dark:text-orange-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"></path></svg>
                    <span className="text-sm font-medium text-indigo-900 dark:text-orange-200 truncate max-w-[200px] sm:max-w-xs">{file.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-indigo-700 dark:text-orange-400 bg-indigo-100 dark:bg-orange-900/40 px-2 py-1 rounded-full">{rows.length} Baris Valid</span>
                </div>
              )}
            </div>

            <div className="sm:mt-8 shrink-0">
               <button
                type="button"
                onClick={handleConfirmUpload}
                disabled={!canUpload || uploading || rows.length === 0}
                className="group relative inline-flex w-full items-center justify-center rounded-xl bg-slate-900 dark:bg-orange-600 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 dark:hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto overflow-hidden shadow-lg hover:shadow-xl"
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Menyimpan...
                  </span>
                ) : (
                   <span className="flex items-center gap-2">
                     Upload ke Database
                     <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                   </span>
                )}
              </button>
            </div>
          </div>

          {/* Messages */}
          {parseError && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3 items-start">
               <svg className="h-5 w-5 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg>
               <div>
                  <h3 className="text-sm font-semibold text-red-800">Error Parsing CSV</h3>
                  <p className="mt-1 text-sm text-red-700">{parseError}</p>
               </div>
            </div>
          )}

          {uploadError && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3 items-start">
               <svg className="h-5 w-5 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
               <div>
                  <h3 className="text-sm font-semibold text-red-800">Gagal Upload</h3>
                  <p className="mt-1 text-sm text-red-700">{uploadError}</p>
               </div>
            </div>
          )}

          {uploadResult && (
            <div
              className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex gap-3 items-start"
              role="status"
              aria-live="polite"
            >
                <svg className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
               <div className="w-full">
                  <h3 className="text-sm font-semibold text-emerald-800">
                    {uploadResult.kind === 'ahsp-complete' ? 'Upload selesai' : 'Sukses'}
                  </h3>
                  <p className="mt-1 text-sm text-emerald-700">{uploadResult.message}</p>
                  {uploadResult.syncWarning ? (
                    <p className="mt-2 text-sm text-amber-800 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      Sinkronisasi UUID tidak sempurna: {uploadResult.syncWarning}
                    </p>
                  ) : null}
                  
                  {needsSync && (
                    <div className="mt-4">
                      <button
                        onClick={handleSyncKonversi}
                        disabled={syncing}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 dark:bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-orange-700 disabled:opacity-60 transition-colors"
                      >
                        {syncing ? (
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : null}
                        {syncing ? 'Mensinkronkan...' : 'Sinkronisasi Konversi Sekarang'}
                      </button>
                    </div>
                  )}
               </div>
            </div>
          )}
        </section>

        {rows.length > 0 && (
          <section className="mt-8 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Preview Data (Menampilkan 10 teratas)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-900/80 text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    {Object.keys(rows[0]).map((col) => (
                      <th key={col} className="px-6 py-3 font-semibold whitespace-nowrap">{col.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {previewRows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      {Object.keys(rows[0]).map((col) => (
                        <td key={col} className="px-6 py-3 whitespace-nowrap">
                          {r[col] !== null && r[col] !== undefined ? String(r[col]) : <span className="text-slate-300 dark:text-slate-600">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
