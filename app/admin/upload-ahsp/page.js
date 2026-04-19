'use client';

import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const REQUIRED_COLUMNS = [
  'jenis_pekerjaan',
  'kategori_pekerjaan',
  'kode_ahsp',
  'nama_pekerjaan',
  'kode_item_dasar',
  'koefisien',
  'satuan_pekerjaan',
];

function normalizeString(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Samakan variasi header ke nama field yang dikirim ke RPC. */
function normalizeCsvHeader(h) {
  let n = normalizeString(h).toLowerCase().replace(/\s+/g, '_');
  if (n === 'id_barang') return 'kode_item_dasar';
  if (n === 'faktor_konversi' || n === 'faktor') return 'konversi';
  return n;
}

function normalizeKoefisien(v) {
  const s = normalizeString(v).replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export default function UploadAhspPage() {
  const router = useRouter();
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userRole, setUserRole] = useState(null);

  const [file, setFile] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [rows, setRows] = useState([]);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const canUpload = userRole === 'admin';

  const previewRows = useMemo(() => rows.slice(0, 20), [rows]);

  const previewColumns = useMemo(() => {
    if (!rows[0]) return REQUIRED_COLUMNS;
    const set = new Set([...REQUIRED_COLUMNS, ...Object.keys(rows[0])]);
    return [...set];
  }, [rows]);

  useEffect(() => {
    (async () => {
      setLoadingAuth(true);
      setParseError(null);
      setUploadError(null);
      setUploadResult(null);

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

      setLoadingAuth(false);
    })();
  }, [router]);

  async function handleFileChange(e) {
    const chosen = e.target.files?.[0] ?? null;
    setFile(chosen);
    setRows([]);
    setUploadResult(null);
    setUploadError(null);
    setParseError(null);

    if (!chosen) return;

    try {
      Papa.parse(chosen, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => normalizeCsvHeader(h),
        complete: (results) => {
          const rawRows = results.data || [];
          const errors = results.errors || [];

          if (errors.length > 0) {
            setParseError(errors[0]?.message || 'Gagal membaca CSV.');
            setRows([]);
            return;
          }

          const headerFields = results.meta?.fields || [];

          const missing = REQUIRED_COLUMNS.filter((c) => !headerFields.includes(c));
          if (missing.length > 0) {
            setParseError(
              `Kolom CSV tidak lengkap. Hilang: ${missing.join(', ')}.`
            );
            setRows([]);
            return;
          }

          const mapped = rawRows
            .map((r) => {
              const koef = normalizeKoefisien(r.koefisien);
              if (koef === null) return null;

              const kodeItem = normalizeString(r.kode_item_dasar || r.id_barang || r.kode_item);
              const uraian = normalizeString(r.uraian_ahsp) || kodeItem;
              const satuanUraian = normalizeString(r.satuan_uraian) || '-';
              const konversiVal = normalizeKoefisien(r.konversi ?? r.faktor_konversi ?? r.faktor);

              const mappedRow = {
                jenis_pekerjaan: normalizeString(r.jenis_pekerjaan),
                kategori_pekerjaan: normalizeString(r.kategori_pekerjaan),
                kode_ahsp: normalizeString(r.kode_ahsp),
                nama_pekerjaan: normalizeString(r.nama_pekerjaan),
                kode_item_dasar: kodeItem,
                uraian_ahsp: uraian,
                satuan_uraian: satuanUraian,
                konversi: konversiVal !== null ? konversiVal : 1,
                koefisien: koef,
                satuan_pekerjaan: normalizeString(r.satuan_pekerjaan) || '-',
              };

              // Skip baris kosong total
              const hasAny =
                mappedRow.jenis_pekerjaan ||
                mappedRow.kode_ahsp ||
                mappedRow.kode_item_dasar ||
                mappedRow.nama_pekerjaan;
              if (!hasAny) return null;

              return mappedRow;
            })
            .filter(Boolean);

          setRows(mapped);
        },
        error: (err) => {
          setParseError(err?.message || 'Gagal membaca CSV.');
          setRows([]);
        },
      });
    } catch (err) {
      setParseError(err?.message || 'Gagal membaca CSV.');
      setRows([]);
    }
  }

  async function handleConfirmUpload() {
    setUploadError(null);
    setUploadResult(null);

    if (!rows || rows.length === 0) {
      setUploadError('Belum ada data untuk diupload. Harap pilih dan parse CSV terlebih dahulu.');
      return;
    }

    setUploading(true);
    try {
      const { data, error } = await supabase.rpc('upload_ahsp_csv', {
        p_rows: rows,
      });

      if (error) throw error;

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
        ...data,
        kind: 'ahsp-complete',
        syncWarning,
        linked,
        notifyMessage: `Upload AHSP selesai. Header: ${data?.inserted_headers ?? 0}, detail: ${data?.inserted_details ?? 0}. Sinkron UUID: ${linked} baris.`,
      });
      setRows([]);
      if (file) setFile(null);
    } catch (err) {
      setUploadError(err?.message || 'Gagal upload CSV.');
    } finally {
      setUploading(false);
    }
  }

  if (loadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
            >
              ← Kembali ke Dashboard
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">
              Upload AHSP (CSV)
            </h1>
            <p className="text-sm text-slate-600">
              Wajib: {REQUIRED_COLUMNS.join(', ')}. Opsional: uraian_ahsp, satuan_uraian, konversi (default 1).
            </p>
          </div>
          <div className="text-sm text-slate-500">Role: {userRole}</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Pilih file CSV
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-800 file:font-medium hover:file:bg-slate-200"
              />
              {file ? (
                <div className="mt-2 text-xs text-slate-500">
                  Terpilih: <span className="font-mono">{file.name}</span>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleConfirmUpload}
              disabled={!canUpload || uploading || rows.length === 0}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? 'Mengupload…' : 'Konfirmasi Upload'}
            </button>
          </div>

          {parseError ? (
            <div
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {parseError}
            </div>
          ) : null}

          {uploadError ? (
            <div
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {uploadError}
            </div>
          ) : null}

          {uploadResult ? (
            <div
              className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              role="status"
              aria-live="polite"
            >
              <p className="font-semibold text-emerald-950">Upload selesai</p>
              <p className="mt-1">
                Header masuk: <b>{uploadResult.inserted_headers}</b> • Detail masuk:{' '}
                <b>{uploadResult.inserted_details}</b>
                {uploadResult.linked != null ? (
                  <>
                    {' '}
                    • Sinkron ke harga dasar: <b>{uploadResult.linked}</b> baris
                  </>
                ) : null}
              </p>
              {uploadResult.syncWarning ? (
                <p className="mt-2 text-amber-900 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs">
                  Sinkronisasi UUID: {uploadResult.syncWarning}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Preview Data</h2>
          <p className="mt-1 text-sm text-slate-600">
            Menampilkan maksimal 20 baris pertama dari file yang diparse.
          </p>

          <div className="mt-4 overflow-x-auto">
            {rows.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Belum ada data. Pilih file CSV untuk melihat preview.
              </div>
            ) : (
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {previewColumns.map((c) => (
                      <th key={c} className="border border-slate-200 px-2 py-2">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      {previewColumns.map((c) => (
                        <td key={c} className="border border-slate-200 px-2 py-1">
                          {r[c] !== null && r[c] !== undefined ? String(r[c]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

