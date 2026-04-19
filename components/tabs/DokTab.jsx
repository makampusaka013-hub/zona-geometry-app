import React from 'react';
import Spinner from '../Spinner';
import Empty from '../Empty';
import { Camera, MapPin } from 'lucide-react';

export default function DokTab({ activeTab, tabLoading, tabData }) {
  if (activeTab !== 'dok') return null;

  if (tabLoading) return <Spinner />;

  if (!tabData?.dok || tabData.dok.length === 0) {
    return <Empty icon={<Camera className="w-10 h-10" />} msg="Belum ada laporan harian dengan dokumentasi foto." />;
  }

  return (
    <div className="grid grid-cols-1 gap-8">
      {tabData.dok.map((rep) => (
        <div key={rep.id} className="bg-white dark:bg-[#1e293b] rounded-3xl overflow-hidden shadow-xl border border-slate-100 dark:border-slate-700">
          <div className="px-6 py-4 bg-slate-50/80 dark:bg-[#020617]/50 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 dark:bg-orange-600 rounded-2xl flex items-center justify-center text-white font-bold">
                {new Date(rep.report_date).getDate()}
              </div>
              <div>
                <div className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter">
                  Laporan {new Date(rep.report_date).toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                  <span>☁️ {rep.weather || '—'}</span>
                  <span className="opacity-30">|</span>
                  <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> GPS Verified</span>
                </div>
              </div>
            </div>
            {rep.latitude && (
              <a href={`https://www.google.com/maps?q=${rep.latitude},${rep.longitude}`} target="_blank" rel="noopener noreferrer"
                 className="text-[10px] font-black bg-indigo-50 text-indigo-700 dark:bg-orange-500/10 dark:text-orange-400 px-4 py-2 rounded-xl border border-indigo-100 dark:border-orange-500/20 hover:bg-white dark:hover:bg-slate-700 transition-all flex items-center gap-1.5 uppercase tracking-widest">
                <MapPin className="w-3 h-3" /> Lokasi Google Maps
              </a>
            )}
          </div>
          <div className="p-6">
            <div className="mb-6">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Catatan Lapangan</h4>
              <div className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#020617]/40 p-4 rounded-xl italic border-l-4 border-orange-400">
                &quot;{rep.notes || 'Tidak ada catatan.'}&quot;
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {rep.project_photos?.map((photo) => (
                <div key={photo.id} className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-700">
                  <img src={photo.photo_url} alt={photo.caption || 'Foto'} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  {photo.caption && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-white text-[9px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                      {photo.caption}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
