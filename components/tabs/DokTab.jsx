import React from 'react';
import Image from 'next/image';
import Spinner from '../Spinner';
import { Camera, MapPin, Box, FileSpreadsheet, Plus, X, Upload, Trash2, Calendar, CloudSun, Save } from 'lucide-react';
import { generateDokumentasiReport } from '@/lib/dokumentasi_excel';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { loadGoogleScripts, loginToGoogle, getOrCreateFolder, uploadFileToDrive } from '@/lib/google_drive';

export default function DokTab({ 
  activeTab, 
  tabLoading, 
  tabData, 
  projectId, 
  projectStartDate, 
  isOwner, 
  isAdmin, 
  isAdvance, 
  isPro, 
  userSlotRole, 
  onRefresh 
}) {
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    date: new Date().toISOString().split('T')[0],
    weather: '☀️ Cerah',
    notes: '',
    photos: [] // { file, preview, caption }
  });
  const [googleToken, setGoogleToken] = React.useState(null);
  const [isDriveLoading, setIsDriveLoading] = React.useState(false);

  // Load Google Scripts on Mount
  React.useEffect(() => {
    loadGoogleScripts().then(() => {
      console.log('Google Scripts Loaded');
    });
  }, []);

  const handleConnectDrive = async () => {
    try {
      setIsDriveLoading(true);
      const token = await loginToGoogle();
      setGoogleToken(token);
      toast.success('Google Drive terhubung!');
    } catch (err) {
      console.error('Gagal hubung Drive:', err);
      toast.error('Gagal menghubungkan Google Drive.');
    } finally {
      setIsDriveLoading(false);
    }
  };

  const canEdit = isOwner || isAdmin || isAdvance || isPro || userSlotRole === 'pembuat';

  if (activeTab !== 'dok') return null;

  if (tabLoading) return <Spinner />;


  const handlePrintExcel = async () => {
    try {
      const project = tabData.project || {};
      await generateDokumentasiReport(project, tabData.dok, {
        fileName: `Dokumentasi_${project.name || 'Proyek'}.xlsx`
      });
    } catch (e) {
      console.error('Gagal cetak excel:', e);
      toast.error('Gagal mengekspor dokumentasi ke Excel.');
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const newPhotos = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      caption: ''
    }));
    setForm(prev => ({ ...prev, photos: [...prev.photos, ...newPhotos] }));
  };

  const removePhoto = (index) => {
    setForm(prev => {
      const newPhotos = [...prev.photos];
      URL.revokeObjectURL(newPhotos[index].preview);
      newPhotos.splice(index, 1);
      return { ...prev, photos: newPhotos };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId) return;
    setIsSaving(true);

    try {
      // 1. Dapatkan atau Buat Laporan Harian (Daily Report)
      let reportId = null;
      const { data: existingReport } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('project_id', projectId)
        .eq('report_date', form.date)
        .maybeSingle();

      if (existingReport) {
        reportId = existingReport.id;
      } else {
        const { data: newReport, error: reportErr } = await supabase
          .from('daily_reports')
          .insert({
            project_id: projectId,
            report_date: form.date,
            weather_description: form.weather,
            notes: form.notes
          })
          .select()
          .single();
        
        if (reportErr) throw reportErr;
        reportId = newReport.id;
      }

      // 2. Upload Foto
      for (const item of form.photos) {
        let storageType = 'supabase';
        let driveFileId = null;
        let publicUrl = null;

        if (googleToken) {
          try {
            // A. Gunakan Google Drive
            const rootFolderId = await getOrCreateFolder('Zona Geometry Documentation');
            const projectFolderId = await getOrCreateFolder(tabData.project?.name || `Proyek_${projectId}`, rootFolderId);
            driveFileId = await uploadFileToDrive(item.file, projectFolderId);
            storageType = 'drive';
          } catch (driveErr) {
            console.error('Gagal upload ke Drive, mencadangkan ke Supabase...', driveErr);
            // Fallback ke Supabase jika Drive gagal di tengah jalan
          }
        }

        if (storageType === 'supabase') {
          // B. Gunakan Supabase Storage (Hanya jika Drive tidak aktif)
          const fileName = `${Date.now()}_${item.file.name}`;
          const filePath = `${projectId}/${form.date}/${fileName}`;

          const { error: uploadErr } = await supabase.storage
            .from('project-photos')
            .upload(filePath, item.file);

          if (!uploadErr) {
            const { data: { publicUrl: url } } = supabase.storage
              .from('project-photos')
              .getPublicUrl(filePath);
            publicUrl = url;
          }
        }

        // 3. Simpan Referensi ke Database
        const { error: photoErr } = await supabase
          .from('project_photos')
          .insert({
            report_id: reportId,
            photo_url: publicUrl,
            caption: item.caption,
            storage_type: storageType,
            drive_file_id: driveFileId,
            file_name: item.file.name,
            uploaded_at: new Date().toISOString()
          });

        if (photoErr) console.error('Gagal simpan info foto:', photoErr);
      }

      toast.success('Dokumentasi berhasil disimpan!');
      setShowAddForm(false);
      setForm({ date: new Date().toISOString().split('T')[0], weather: '☀️ Cerah', notes: '', photos: [] });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Save documentation error:', err);
      toast.error('Gagal menyimpan dokumentasi: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header Actions */}
      <div className="flex items-center justify-between px-2">
        <div className="flex flex-col">
          <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Dokumentasi Lapangan</h3>
          <p className="text-[9px] text-slate-400 font-medium">Total {tabData.dok?.length || 0} Laporan Dokumentasi</p>
        </div>
        <div className="flex gap-3">
          {canEdit && (
            <button 
              onClick={() => setShowAddForm(!showAddForm)}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg ${
                showAddForm ? 'bg-slate-200 text-slate-600' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
              }`}
            >
              {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showAddForm ? 'Batal' : 'Tambah Dokumentasi'}
            </button>
          )}
            <button
              onClick={handlePrintExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl hover:bg-emerald-600/30 transition-all text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Ekspor Excel</span>
            </button>

            {!googleToken ? (
              <button
                onClick={handleConnectDrive}
                disabled={isDriveLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl hover:bg-blue-600/30 transition-all text-sm font-medium"
              >
                <Image src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="G" width={16} height={16} />
                <span>{isDriveLoading ? 'Menghubungkan...' : 'Hubungkan Drive'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 text-blue-400 border border-blue-500/10 rounded-xl text-sm font-medium opacity-60">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span>Drive Aktif</span>
              </div>
            )}
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-indigo-100 dark:border-slate-700 shadow-2xl p-8 animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" /> Tanggal Laporan
                </label>
                <input 
                  type="date" 
                  required
                  value={form.date}
                  onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <CloudSun className="w-3.5 h-3.5" /> Kondisi Cuaca
                </label>
                <select 
                  value={form.weather}
                  onChange={e => setForm(prev => ({ ...prev, weather: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                >
                  <option>☀️ Cerah</option>
                  <option>⛅ Berawan</option>
                  <option>🌦️ Gerimis</option>
                  <option>🌧️ Hujan</option>
                  <option>⛈️ Badai</option>
                </select>
              </div>
              <div className="md:col-span-3 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Catatan Lapangan</label>
                <textarea 
                  placeholder="Tuliskan catatan kemajuan pekerjaan, kendala, atau instruksi lapangan..."
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all min-h-[100px]"
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Camera className="w-3.5 h-3.5" /> Unggah Foto Lapangan
              </label>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {form.photos.map((item, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                    <img src={item.preview} className="w-full h-full object-cover" alt="Preview" />
                    <button 
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="absolute top-2 right-2 p-1.5 bg-rose-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/50 backdrop-blur-sm">
                      <input 
                        type="text" 
                        placeholder="Keterangan..."
                        value={item.caption}
                        onChange={e => {
                          const newPhotos = [...form.photos];
                          newPhotos[idx].caption = e.target.value;
                          setForm(prev => ({ ...prev, photos: newPhotos }));
                        }}
                        className="w-full bg-transparent border-none p-0 text-[9px] text-white placeholder:text-white/60 focus:ring-0 outline-none font-bold"
                      />
                    </div>
                  </div>
                ))}
                
                <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-orange-500 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:bg-indigo-50 dark:hover:bg-indigo-950/20 group">
                  <Camera className="w-6 h-6 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ambil Foto</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                </label>

                <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-orange-500 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:bg-indigo-50 dark:hover:bg-indigo-950/20 group">
                  <Upload className="w-6 h-6 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Pilih File</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button 
                type="button" 
                onClick={() => setShowAddForm(false)}
                className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold rounded-2xl text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Batal
              </button>
              <button 
                type="submit" 
                disabled={isSaving || form.photos.length === 0}
                className="px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
              >
                {isSaving ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
                {isSaving ? 'Menyimpan...' : 'Simpan Dokumentasi'}
              </button>
            </div>
          </form>
        </div>
      )}
      
      {(!tabData?.dok || tabData.dok.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-40 w-full opacity-40 dark:opacity-20 pointer-events-none select-none">
          <Box className="w-24 h-24 mb-6 text-slate-500 dark:text-slate-400" strokeWidth={1} />
          <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.4em] text-center">
            BELUM ADA DOKUMENTASI FOTO
          </h3>
        </div>
      ) : (
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
                  <Image 
                    src={photo.photo_url} 
                    alt={photo.caption || 'Foto'} 
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110" 
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
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
      )}
    </div>
  );
}
