'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

function parseNum(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function formatIdr(n, showFourDecimals = false) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: showFourDecimals ? 4 : 0,
    maximumFractionDigits: showFourDecimals ? 4 : 2,
  }).format(parseNum(n));
}

function formatKoef(n) {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(parseNum(n));
}

export default function UraianDebugPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [showFourDecimals, setShowFourDecimals] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('view_debug_analisa')
        .select('*')
        .order('kode_ahsp', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        setRows([]);
      } else {
        setRows(data ?? []);
      }

      setLoading(false);
    })();
  }, []);

  const grouped = useMemo(() => {
    const m = new Map();

    rows.forEach((row) => {
      const kodeAhsp = row.kode_ahsp ?? '-';
      const namaPekerjaan = row.nama_pekerjaan ?? '-';
      const groupKey = `${kodeAhsp}||${namaPekerjaan}`;

      const koef = parseNum(row.koefisien);
      const faktor = parseNum(row.faktor_konversi);
      const faktorSafe = faktor === 0 ? 1 : faktor;
      const hargaToko = parseNum(row.harga_toko ?? row.harga_satuan);
      const hargaDasar =
        parseNum(row.harga_dasar) ||
        (hargaToko && faktorSafe ? hargaToko / faktorSafe : 0);
      const subtotalItem = parseNum(
        row.subtotal_item ?? row.subtotal ?? koef * hargaDasar
      );
      const profitPercent = parseNum(row.overhead_profit ?? row.profit_percent ?? 0);

      if (!m.has(groupKey)) {
        m.set(groupKey, {
          groupKey,
          kodeAhsp,
          namaPekerjaan,
          profitPercent,
          items: [],
          subtotalBeforeProfit: 0,
        });
      }

      const g = m.get(groupKey);
      g.profitPercent = Math.max(g.profitPercent, profitPercent);
      g.items.push({
        komponenNama: row.nama_komponen ?? row.nama_item ?? '-',
        komponenKode: row.kode_komponen ?? row.kode_item ?? '-',
        koef,
        satuanUraian: row.satuan_uraian ?? '',
        faktor: faktorSafe,
        hargaToko,
        hargaDasar,
        subtotalItem,
      });
      g.subtotalBeforeProfit += subtotalItem;
    });

    return Array.from(m.values()).map((g) => {
      const totalAkhir =
        g.subtotalBeforeProfit + g.subtotalBeforeProfit * (g.profitPercent / 100);
      return { ...g, totalAkhir };
    });
  }, [rows]);

  const colCount = 9;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
            >
              ← Kembali ke Dashboard
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Debug Perhitungan AHS</h1>
            <p className="mt-1 text-sm text-slate-600">
              Sumber data: <code>view_debug_analisa</code>. Harga dasar uraian = Harga Toko ÷ Faktor
              Konversi; subtotal = Harga Dasar × Koefisien.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showFourDecimals}
              onChange={(e) => setShowFourDecimals(e.target.checked)}
            />
            Tampilkan 4 angka desimal (Rp)
          </label>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-500">
            Memuat data...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Gagal memuat <code>view_debug_analisa</code>: {error}
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-500">
            Belum ada data analisa.
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <section key={g.groupKey} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
                  <div className="text-sm text-slate-700">
                    <span className="font-semibold">{g.kodeAhsp}</span> - {g.namaPekerjaan}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                        <th className="border border-slate-200 px-3 py-2">Kode AHSP & Nama Pekerjaan</th>
                        <th className="border border-slate-200 px-3 py-2">Komponen (Nama & Kode)</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">Koefisien</th>
                        <th className="border border-slate-200 px-3 py-2">Satuan Pakai</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">Faktor Konversi</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">Harga Toko</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">Harga Dasar (Toko÷Faktor)</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">Subtotal Item</th>
                        <th className="border border-slate-200 px-3 py-2">Perhitungan Mentah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((item, idx) => (
                        <tr key={`${g.groupKey}-${idx}`} className="hover:bg-slate-50/80">
                          <td className="border border-slate-200 px-3 py-2">
                            <span className="font-medium text-slate-900">{g.kodeAhsp}</span>
                            <div className="text-slate-600">{g.namaPekerjaan}</div>
                          </td>
                          <td className="border border-slate-200 px-3 py-2">
                            <span className="text-slate-900">{item.komponenNama}</span>
                            <div className="text-xs text-slate-500">{item.komponenKode}</div>
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums">
                            {formatKoef(item.koef)}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-slate-800">
                            {item.satuanUraian || '—'}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums">
                            {formatKoef(item.faktor)}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums">
                            {formatIdr(item.hargaToko, showFourDecimals)}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums">
                            {formatIdr(item.hargaDasar, showFourDecimals)}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums">
                            {formatIdr(item.subtotalItem, showFourDecimals)}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700">
                            ({item.hargaToko} / {item.faktor}) * {item.koef}
                          </td>
                        </tr>
                      ))}

                      <tr className="bg-slate-50">
                        <td
                          colSpan={colCount - 2}
                          className="border border-slate-200 px-3 py-2 text-right font-semibold text-slate-800"
                        >
                          Total Subtotal (sebelum profit)
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-bold text-slate-900">
                          {formatIdr(g.subtotalBeforeProfit, showFourDecimals)}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-xs text-slate-500">-</td>
                      </tr>

                      <tr className="bg-slate-100">
                        <td
                          colSpan={colCount - 2}
                          className="border border-slate-200 px-3 py-2 text-right font-semibold text-slate-900"
                        >
                          Total Akhir (profit {g.profitPercent}%)
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-bold text-slate-900">
                          {formatIdr(g.totalAkhir, showFourDecimals)}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700">
                          ({g.subtotalBeforeProfit} * {g.profitPercent}%)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
