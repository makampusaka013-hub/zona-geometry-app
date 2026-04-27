import React from 'react';
import Spinner from '../Spinner';
import Empty from '../Empty';
import { Factory, Info } from 'lucide-react';

export default function TkdnTab({ activeTab, tabLoading, tabData, formatIdr }) {
  if (activeTab !== 'tkdn') return null;

  if (tabLoading) return <Spinner />;

  if (!tabData?.tkdn) {
    return <Empty 
      icon={<Factory />} 
      title="Belum ada data kalkulasi TKDN." 
      description="Silakan isi data RAB dan harga satuan terlebih dahulu agar sistem dapat menghitung bobot TKDN secara otomatis."
    />;
  }

  const items = tabData?.harga || [];

  return (
    <div className="flex flex-col gap-0 w-full h-full">
      {/* 1. KARTU RINGKASAN UTAMA */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="col-span-1 md:col-span-2 rounded-[32px] bg-gradient-to-br from-indigo-600 to-blue-800 dark:from-[#EF8519] dark:to-[#C06A14] p-8 text-white shadow-2xl relative overflow-hidden group">
           <Factory className="absolute -bottom-8 -right-8 w-64 h-64 opacity-10 rotate-12 transition-transform duration-700 group-hover:scale-110" />
           <div className="relative z-10">
            <div className="text-[10px] font-black opacity-70 uppercase tracking-[0.2em] mb-2">Capaian TKDN Gabungan Proyek</div>
            <div className="flex items-baseline gap-2">
              <span className="text-7xl font-black font-mono tracking-tighter">{Number(tabData.tkdn.total_tkdn_pct||0).toFixed(2)}</span>
              <span className="text-3xl font-bold opacity-50">%</span>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <div className={`flex items-center gap-2 px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest ${tabData.tkdn.total_tkdn_pct >= 40 ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20' : 'bg-red-500 text-white shadow-xl shadow-red-500/20'}`}>
                {tabData.tkdn.total_tkdn_pct >= 40 ? '✅ Lulus Threshold PUPR (Min. 40%)' : '⚠️ Masih Dibawah Ambang Batas PUPR'}
              </div>
            </div>
           </div>
        </div>
        <div className="rounded-[32px] bg-slate-50/80 backdrop-blur-md dark:bg-slate-900/80 p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-center">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Realisasi TKDN (RP)</div>
          <div className="text-xl md:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 break-all leading-tight">
            {formatIdr(tabData.tkdn.total_tkdn_nilai)}
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-3 flex items-start gap-1.5 opacity-60 leading-tight">
            <Info className="w-3.5 h-3.5 shrink-0" /> Nilai ekonomi lokal yang terserap ke dalam proyek.
          </p>
        </div>
        <div className="rounded-[32px] bg-slate-50/80 backdrop-blur-md dark:bg-slate-900/80 p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-center">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Basis Perhitungan (Total)</div>
          <div className="text-xl md:text-2xl font-black font-mono text-slate-800 dark:text-slate-100 break-all leading-tight">
            {formatIdr(tabData.tkdn.total_nilai)}
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-3 flex items-start gap-1.5 opacity-60 leading-tight">
            <Info className="w-3.5 h-3.5 shrink-0" /> Dihitung dari seluruh komponen Tenaga, Bahan, dan Alat.
          </p>
        </div>
      </div>

      {/* 2. ANALISIS PER KATEGORI */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="h-4 w-1.5 bg-indigo-500 dark:bg-orange-500 rounded-full" />
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analisis Kontribusi TKDN per Kategori</h3>
        </div>
        <div className="rounded-[32px] border border-slate-100 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-[109px] z-30 bg-white dark:bg-[#020617]">
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-[9px] uppercase font-black text-slate-400 tracking-widest">
                <th className="px-8 py-4 text-left border-b border-slate-100 dark:border-slate-800">GOLONGAN</th>
                <th className="px-8 py-4 text-right border-b border-slate-100 dark:border-slate-800">NILAI NOMINAL</th>
                <th className="px-8 py-4 text-right border-b border-slate-100 dark:border-slate-800">SKOR TKDN</th>
                <th className="px-8 py-4 text-right border-b border-slate-100 dark:border-slate-800">REALISASI TKDN (RP)</th>
                <th className="px-8 py-4 text-left border-b border-slate-100 dark:border-slate-800 pl-12">DISTRIBUSI BOBOT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800 font-bold">
              {Object.entries(tabData.tkdn.byJenis).map(([jenis, val]) => {
                const pct = val.nilai > 0 ? (val.tkdn / val.nilai) * 100 : 0;
                const kontrib = tabData.tkdn.total_nilai > 0 ? (val.nilai / tabData.tkdn.total_nilai) * 100 : 0;
                return (
                  <tr key={jenis} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-8 py-5 text-slate-800 dark:text-slate-200 uppercase text-[10px] font-black">
                      {jenis === 'tenaga' && '👷 Tenaga Kerja'}
                      {jenis === 'bahan' && '🧱 Material & Bahan'}
                      {jenis === 'alat' && '⚙️ Peralatan'}
                    </td>
                    <td className="px-8 py-5 text-right font-mono text-xs text-slate-400">{formatIdr(val.nilai)}</td>
                    <td className="px-8 py-5 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">{Number(pct).toFixed(2)}%</td>
                    <td className="px-8 py-5 text-right font-mono text-xs text-emerald-700 dark:text-emerald-500 font-black">{formatIdr(val.tkdn)}</td>
                    <td className="px-8 py-5 pl-12">
                      <div className="flex items-center gap-4">
                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 min-w-[150px] overflow-hidden">
                        <div className="h-full bg-indigo-500 dark:bg-orange-500 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.5)] dark:shadow-[0_0_8px_rgba(239,133,25,0.5)]" style={{ width: `${kontrib}%` }} />
                      </div>
                        <span className="text-[10px] font-black text-slate-400 w-10 text-right">{kontrib.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. RINCIAN PER KOMPONEN (NEW) */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="h-4 w-1.5 bg-emerald-500 rounded-full" />
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rincian Capaian TKDN per Komponen</h3>
        </div>
        <div className="rounded-[32px] border border-slate-100 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 relative">
            <table className="w-full text-[11px] border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-white dark:bg-[#020617]">
                <tr className="bg-indigo-50 dark:bg-orange-600 text-indigo-700 dark:text-white text-[9px] uppercase font-black tracking-widest">
                  <th className="px-8 py-5 text-left border-b border-indigo-100 dark:border-orange-500/30 bg-indigo-50 dark:bg-orange-600">KATALOG KOMPONEN</th>
                  <th className="px-6 py-5 text-center border-b border-indigo-100 dark:border-orange-500/30 bg-indigo-50 dark:bg-orange-600">JENIS</th>
                  <th className="px-6 py-5 text-right border-b border-indigo-100 dark:border-orange-500/30 bg-indigo-50 dark:bg-orange-600">% TKDN</th>
                  <th className="px-6 py-5 text-right border-b border-indigo-100 dark:border-orange-500/30 bg-indigo-50 dark:bg-orange-600">NILAI NOMINAL</th>
                  <th className="px-8 py-5 text-right border-b border-indigo-100 dark:border-orange-500/30 bg-indigo-50 dark:bg-orange-600">KONTRIBUSI TKDN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item, i) => {
                  const rawJ = (item.jenis_komponen || item.jenis || '').toLowerCase();
                  const code = (item.kode_item || '').trim().toUpperCase();
                  
                  // Heuristic: Using strict prefix rules (A/B=Bahan, L=Tenaga, M=Alat)
                  let j = rawJ;
                  const unit = (item.satuan || '').toUpperCase();
                  const name = (item.uraian || '').toLowerCase();

                  if (!j || j === 'bahan_upah_alat' || j === 'upah') {
                    if (code.startsWith('A') || code.startsWith('B')) {
                      j = 'bahan';
                    } else if (code.startsWith('L')) {
                      j = 'tenaga';
                    } else if (code.startsWith('M')) {
                      j = 'alat';
                    } else if (unit === 'OH' || unit === 'ORG' || /\bpekerja\b/.test(name) || name.includes('tukang') || name.includes('mandor')) {
                      // fallback for NO-REF items
                      j = 'tenaga';
                    } else if (unit === 'JAM' || unit === 'SEWA' || name.includes('alat berat')) {
                      j = 'alat';
                    } else {
                      j = 'bahan';
                    }
                  }

                  const jBadge = {
                    tenaga: 'bg-indigo-100 text-indigo-700 dark:bg-orange-900/40 dark:text-orange-400 border border-indigo-200 dark:border-orange-500/20',
                    bahan: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20',
                    alat: 'bg-blue-100 text-blue-700 dark:bg-amber-900/30 dark:text-amber-400 border border-blue-200 dark:border-amber-500/20',
                  }[j] || 'bg-slate-100 text-slate-500 border border-slate-200';

                  return (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-8 py-4">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{item.uraian}</div>
                        <div className="text-[10px] font-mono text-slate-400 mt-1 uppercase font-bold">{item.kode_item || 'NO-REF'} · {item.satuan}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-[8px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider ${jBadge}`}>
                          {j === 'tenaga' ? '👷 Tenaga' : j === 'bahan' ? '🧱 Bahan' : '⚙️ Alat'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs font-black text-indigo-600 dark:text-orange-400">
                          {Number(item.tkdn || 0).toFixed(2)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-xs font-bold text-slate-500">
                        {formatIdr(item.total_nilai)}
                      </td>
                      <td className="px-8 py-4 text-right">
                        <div className="font-mono text-xs font-black text-slate-900 dark:text-white">
                          {formatIdr(item.total_tkdn_nilai)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
