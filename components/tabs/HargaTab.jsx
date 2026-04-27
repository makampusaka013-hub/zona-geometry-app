import React from 'react';
import Spinner from '../Spinner';
import { Package } from 'lucide-react';

export default function HargaTab({ activeTab, tabLoading, tabData, formatIdr }) {
  if (activeTab !== 'harga') return null;

  if (tabLoading) return <Spinner />;

  if (!tabData?.harga || tabData.harga.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-30">
        <Package className="w-16 h-16 mb-4" />
        <p className="text-sm font-bold uppercase tracking-widest">Belum ada data harga satuan</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['tenaga','bahan','alat'].map(j => {
          const rows = tabData.harga.filter(r => r.jenis === j);
          const total = rows.reduce((s,r) => s + (r.total_nilai||0), 0);
          const icons = { tenaga:'👷', bahan:'🧱', alat:'⚙️' };
          const cls = { 
            tenaga: 'bg-indigo-600 dark:bg-orange-600', 
            bahan: 'bg-blue-600 dark:bg-amber-600', 
            alat: 'bg-slate-700 dark:bg-slate-800' 
          };
          return (
            <div key={j} className="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg shadow-black/5">
              <div className={`absolute inset-0 opacity-80 ${cls[j]}`} />
              <div className="relative z-10">
                <div className="text-2xl mb-1">{icons[j]}</div>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1.5">{j}</div>
                <div className="text-xl font-black font-mono leading-none">{formatIdr(total)}</div>
                <div className="text-[10px] font-medium opacity-60 mt-2">{rows.length} komponen unik dalam RAB</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl bg-white dark:bg-[#1e293b]">
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Daftar Komponen — Harga Satuan Terpakai</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#020617] text-white text-[9px] uppercase font-black tracking-widest">
                <th className="px-6 py-4 text-left border-b border-slate-800 sticky top-0 bg-[#020617]">KATALOG KOMPONEN</th>
                <th className="px-6 py-4 text-center border-b border-slate-800 sticky top-0 bg-[#020617]">JENIS</th>
                <th className="px-6 py-4 text-right border-b border-slate-800 sticky top-0 bg-[#020617]">TOTAL VOL.</th>
                <th className="px-6 py-4 text-right border-b border-slate-800 sticky top-0 bg-[#020617]">HARGA</th>
                <th className="px-6 py-4 text-right border-b border-slate-800 sticky top-0 bg-[#020617]">TKDN (%)</th>
                <th className="px-6 py-4 text-right border-b border-slate-800 sticky top-0 bg-[#020617]">TOTAL NILAI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {tabData.harga.map((item, i) => {
                const jBadge = { 
                  tenaga: 'bg-indigo-500/10 text-indigo-500 dark:text-orange-400 dark:bg-orange-400/10', 
                  bahan: 'bg-blue-500/10 text-blue-500 dark:text-amber-400 dark:bg-amber-400/10', 
                  alat: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 dark:bg-slate-400/10' 
                }[item.jenis] || 'bg-slate-100 text-slate-500';
                return (
                  <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors group">
                    <td className="px-6 py-6">
                      <div className="font-bold text-slate-800 dark:text-white text-[13px] tracking-tight">{item.uraian}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-1 uppercase font-bold opacity-60">
                        {item.kode_item || 'NO-REF'} · {item.satuan}
                      </div>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${jBadge}`}>{item.jenis}</span>
                    </td>
                    <td className="px-6 py-6 text-right font-mono text-xs font-bold text-slate-400">
                      {Number(item.total_volume || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-6 py-6 text-right font-mono text-xs font-bold text-slate-500 dark:text-slate-400">{formatIdr(item.harga_satuan)}</td>
                    <td className="px-6 py-6 text-right font-mono text-xs font-bold text-indigo-500 dark:text-orange-400">{Number(item.tkdn||0).toFixed(2)}%</td>
                    <td className="px-6 py-6 text-right font-mono text-xs font-black text-slate-900 dark:text-white group-hover:text-indigo-500 dark:group-hover:text-orange-400 transition-colors uppercaseTracking-tight">{formatIdr(item.total_nilai)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
