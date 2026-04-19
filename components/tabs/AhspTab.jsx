import React from 'react';
import Spinner from '../Spinner';
import Empty from '../Empty';
import { ClipboardList, Save, CheckCircle2, ShieldAlert, XCircle, RotateCcw } from 'lucide-react';

export default function AhspTab({ activeTab, tabLoading, tabData, formatIdr, canVerify, canApproveFinal, onUpdateStatus }) {
  if (activeTab !== 'ahsp') return null;

  if (tabLoading) return <Spinner />;

  if (!tabData?.ahsp || tabData.ahsp.length === 0) {
    return <Empty icon={<ClipboardList className="w-10 h-10" />} msg="Tidak ada rincian AHSP di RAB ini." />;
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'final':
        return <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-2 py-1 rounded-md uppercase flex items-center gap-1 shadow-sm"><CheckCircle2 className="w-3 h-3" /> FINAL (Disetujui Pengecek)</span>;
      case 'verified':
        return <span className="text-[8px] font-black bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 px-2 py-1 rounded-md uppercase flex items-center gap-1 shadow-sm"><Save className="w-3 h-3" /> VERIFIED (Reviewer)</span>;
      default:
        return <span className="text-[8px] font-black bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 px-2 py-1 rounded-md uppercase flex items-center gap-1 shadow-sm">DRAFT (Pembuat)</span>;
    }
  };

  return (
    <div className="border-t-0 bg-white dark:bg-[#020617] overflow-hidden">
      <div className="overflow-x-auto max-h-[700px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 relative">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-indigo-50 dark:bg-orange-600 text-indigo-700 dark:text-white text-[9px] uppercase font-black tracking-widest">
              <th className="px-6 py-5 text-left border-b border-indigo-100 dark:border-orange-500/30 sticky top-0 bg-indigo-50 dark:bg-orange-600">URAIAN PEKERJAAN & STATUS</th>
              <th className="px-4 py-5 text-center border-b border-indigo-100 dark:border-orange-500/30 sticky top-0 bg-indigo-50 dark:bg-orange-600">SATUAN</th>
              <th className="px-6 py-5 text-right border-b border-indigo-100 dark:border-orange-500/30 sticky top-0 bg-indigo-50 dark:bg-orange-600">VOLUME</th>
              <th className="px-6 py-5 text-right border-b border-indigo-100 dark:border-orange-500/30 sticky top-0 bg-indigo-50 dark:bg-orange-600">TOTAL JUMLAH</th>
              <th className="px-6 py-5 text-right border-b border-indigo-100 dark:border-orange-500/30 sticky top-0 bg-indigo-50 dark:bg-orange-600">AKSI KOLABORASI</th>
            </tr>
          </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {tabData.ahsp.map((item, i) => (
            <tr key={item.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors group">
              <td className="px-6 py-6 border-r border-slate-100 dark:border-slate-800/50 w-[45%]">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <div className="text-[8px] text-indigo-600 dark:text-orange-400 font-black uppercase tracking-widest px-2 py-0.5 bg-indigo-50 dark:bg-orange-900/20 rounded border border-indigo-100 dark:border-orange-900/10">
                    {item.bab_pekerjaan || 'Tanpa Kategori'}
                  </div>
                  {getStatusBadge(item.status_approval)}
                </div>
                <div className="font-bold text-slate-800 dark:text-white text-[14px] tracking-tight">{item.uraian_custom || item.uraian}</div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono uppercase font-bold opacity-60">
                   {item.master_ahsp?.kode_ahsp || `AHSP-REF-${i+1}`}
                </div>
              </td>
              <td className="px-6 py-6 text-center text-slate-500 font-bold text-[11px]">{item.satuan || '-'}</td>
              <td className="px-6 py-6 text-right font-mono text-xs font-bold text-slate-400">{Number(item.volume || 0).toLocaleString('id-ID')}</td>
              <td className="px-6 py-6 text-right font-mono text-xs font-black text-slate-900 dark:text-white group-hover:text-orange-500 transition-colors">{formatIdr(item.jumlah)}</td>
              <td className="px-6 py-6 text-right w-[20%]">
                 <div className="flex flex-wrap items-center justify-end gap-2">
                    {/* Konsultan Actions */}
                    {canVerify && item.status_approval === 'draft' && (
                      <button 
                         onClick={() => onUpdateStatus(item.id, 'verified')}
                         className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase rounded-lg shadow-md transition-all flex items-center gap-1.5"
                      >
                         <ShieldAlert className="w-3 h-3" /> Verifikasi
                      </button>
                    )}

                    {canVerify && item.status_approval === 'verified' && (
                      <button 
                         onClick={() => onUpdateStatus(item.id, 'draft')}
                         className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-[10px] font-black uppercase rounded-lg transition-all flex items-center gap-1.5"
                      >
                         <RotateCcw className="w-3 h-3" /> Reject ke Draft
                      </button>
                    )}

                    {/* Instansi Actions */}
                    {canApproveFinal && item.status_approval === 'verified' && (
                      <button 
                         onClick={() => onUpdateStatus(item.id, 'final')}
                         className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-lg shadow-md transition-all flex items-center gap-1.5"
                      >
                         <CheckCircle2 className="w-3 h-3" /> Approve Final
                      </button>
                    )}

                    {item.status_approval === 'final' && (
                       <span className="text-[10px] text-slate-400 font-black uppercase tracking-tighter flex items-center gap-1 opacity-50">
                          <XCircle className="w-3 h-3 text-emerald-500" /> Terkunci Permanen
                       </span>
                    )}

                    {!canVerify && !canApproveFinal && item.status_approval !== 'final' && (
                      <span className="text-[10px] text-slate-400 font-medium italic opacity-60">Menunggu Review...</span>
                    )}
                 </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-indigo-50 dark:bg-orange-500 text-indigo-700 dark:text-white font-black border-t border-indigo-100 dark:border-orange-400/30">
          <tr>
            <td colSpan={3} className="px-8 py-6 text-right font-black text-[11px] uppercase tracking-widest opacity-70">Total Sesuai RAB (incl. profit)</td>
            <td colSpan={2} className="px-8 py-6 text-right font-mono text-xl font-black shadow-[0_-10px_30px_rgba(0,0,0,0.1)]">
              {formatIdr(tabData.ahsp.reduce((s, r) => s + (r.jumlah || 0), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  );
}
