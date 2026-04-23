import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Upload, Download, FileText, Calendar, Users, ChevronRight, MapPin, TrendingUp, Wallet, ClipboardList, Check, LayoutGrid, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import Spinner from '../Spinner';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { exportReportToExcel, romanize } from '@/lib/reporting';
import * as ProReport from '@/lib/reporting_pro';
import { generateProjectReport } from '@/lib/excel_engine';

export default function ExportImportTab({ tabLoading, ahspLines, project, isModeNormal = false, userMember, subTab = 'export' }) {
  const [loadingReport, setLoadingReport] = useState(false);
  const [exportMode, setExportMode] = useState('project'); // 'project' | 'catalog'
  const [selectedSheets, setSelectedSheets] = useState(['RAB', 'HSP', 'AHSP', 'HARGA SATUAN', 'SCHEDULE']);
  const [reportType, setReportType] = useState('harian');
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [loadingPro, setLoadingPro] = useState(null); // 'catalog' | 'ahsp' | 'scurve' | 'rab' | 'used_res' | 'used_ahsp'

  if (tabLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  function parseNum(val) {
    if (!val) return 0;
    const parsed = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : Number(val);
    return isNaN(parsed) ? 0 : parsed;
  }

  async function handleExportReport() {
    if (!project || !ahspLines || ahspLines.length === 0) {
      toast.warning('Data RAB kosong.');
      return;
    }

    setLoadingReport(true);
    try {
      const { data: progressData, error } = await supabase
        .from('project_progress_daily')
        .select('*')
        .eq('project_id', project.id);

      if (error) throw error;

      const dailyMap = {};
      progressData.forEach(row => {
        if (!dailyMap[row.line_id]) dailyMap[row.line_id] = {};
        dailyMap[row.line_id][row.day_number] = row.value;
      });

      exportReportToExcel({
        type: reportType,
        project,
        items: ahspLines,
        dailyProgress: dailyMap,
        startDate: dateRange.start,
        endDate: dateRange.end
      });

      toast.success(`Laporan ${reportType} berhasil diunduh.`);
    } catch (err) {
      toast.error('Gagal mengambil data progres: ' + err.message);
    } finally {
      setLoadingReport(false);
    }
  }

  function handleExportExcel() {
    if (!project || !ahspLines || ahspLines.length === 0) {
      toast.warning('Data RAB kosong. Tidak ada yang bisa diekspor.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const ppnPercent = parseFloat(project.ppn_percent) || 0;

    const sectionsObj = {};
    ahspLines.forEach(line => {
      const bab = line.bab_pekerjaan || 'Lain-lain';
      if (!sectionsObj[bab]) sectionsObj[bab] = { namaBab: bab, lines: [], subtotal: 0 };
      sectionsObj[bab].lines.push(line);
      sectionsObj[bab].subtotal += (line.jumlah || 0);
    });

    const sections = Object.values(sectionsObj).sort((a, b) => a.lines[0]?.sort_order - b.lines[0]?.sort_order);

    const grandSubtotal = sections.reduce((s, sec) => s + sec.subtotal, 0);
    const ppnAmount = grandSubtotal * (ppnPercent / 100);
    const grandTotal = grandSubtotal + ppnAmount;
    const roundedGrandTotal = Math.round(grandTotal / 1000) * 1000;

    const rabData = [];
    rabData.push(['RENCANA ANGGARAN BIAYA (RAB)']);
    rabData.push([]);
    rabData.push(['Program', project.program_name || '-']);
    rabData.push(['Kegiatan', project.activity_name || '-']);
    rabData.push(['Pekerjaan', project.work_name || '-']);
    rabData.push(['Lokasi', project.location || '-']);
    rabData.push(['Tahun Anggaran', project.fiscal_year || '-']);
    rabData.push(['Pembuat', project.created_by_name || '-']);
    rabData.push([]);
    
    rabData.push(['NO', 'URAIAN PEKERJAAN', 'KODE AHSP', 'SATUAN', 'VOLUME', 'HARGA SATUAN (Rp)', 'JUMLAH HARGA (Rp)']);
    
    sections.forEach((sec, sIdx) => {
      rabData.push([romanize(sIdx + 1), sec.namaBab.toUpperCase(), '', '', '', '']);
      
      sec.lines.forEach((r, idx) => {
        rabData.push([ 
          (idx + 1).toString(), 
          r.uraian, 
          r.master_ahsp?.kode_ahsp || '', 
          r.satuan, 
          parseNum(r.volume), 
          parseNum(r.harga_satuan), 
          parseNum(r.jumlah) 
        ]);
      });
      
      rabData.push(['', `SUBTOTAL BAB ${romanize(sIdx + 1)}`, '', '', '', '', sec.subtotal]);
      rabData.push([]);
    });

    rabData.push([]);
    rabData.push(['', 'A. TOTAL HARGA', '', '', '', '', grandSubtotal]);
    rabData.push(['', `B. PPN ${ppnPercent}%`, '', '', '', '', ppnAmount]);
    rabData.push(['', 'C. TOTAL KESELURUHAN (A + B)', '', '', '', '', grandTotal]);
    rabData.push(['', 'DIBULATKAN', '', '', '', '', roundedGrandTotal]);

    const rabWs = XLSX.utils.aoa_to_sheet(rabData);
    XLSX.utils.book_append_sheet(wb, rabWs, "Detil RAB");

    const rekapData = [];
    rekapData.push(['REKAPITULASI RENCANA ANGGARAN BIAYA']);
    rekapData.push([]);
    rekapData.push(['NO', 'URAIAN PEKERJAAN', 'TOTAL HARGA (Rp)']);
    sections.forEach((sec, i) => {
       rekapData.push([romanize(i+1), sec.namaBab.toUpperCase(), sec.subtotal]);
    });
    rekapData.push([]);
    rekapData.push(['', 'A. TOTAL BIAYA', grandSubtotal]);
    rekapData.push(['', `B. PAJAK PERTAMBAHAN NILAI (PPN) ${ppnPercent}%`, ppnAmount]);
    rekapData.push(['', 'C. TOTAL KESELURUHAN (A + B)', grandTotal]);
    rekapData.push(['', 'DIBULATKAN', roundedGrandTotal]);

    const rekapWs = XLSX.utils.aoa_to_sheet(rekapData);
    XLSX.utils.book_append_sheet(wb, rekapWs, "Rekapitulasi");

    ProReport.exportProRabSummary(project, ahspLines);
  }

  function handleSetCurrentPeriod() {
    const now = new Date();
    let start, end;

    if (reportType === 'harian') {
      start = now;
      end = now;
    } else if (reportType === 'mingguan') {
      const day = now.getDay();
      const diffStart = now.getDate() - day + (day === 0 ? -6 : 1); 
      start = new Date(now.setDate(diffStart));
      end = new Date(now.setDate(start.getDate() + 6));
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    });

    toast.info(`Periode ${reportType} telah disesuaikan.`);
  }

  async function handleExportRegionalCatalog() {
    if (!project?.location_id || !project?.location) {
      toast.warning('Lokasi proyek belum ditentukan.');
      return;
    }
    setLoadingPro('catalog');
    try {
      const { data, error } = await supabase
        .from('master_harga_dasar')
        .select('*, master_items(*)')
        .eq('location_id', project.location_id);
      
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.warning(`Tidak ada data katalog untuk wilayah ${project.location}`);
        return;
      }

      ProReport.exportProRegionalCatalog(project.location, data);
    } catch (err) {
      toast.error('Gagal mengambil katalog: ' + err.message);
    } finally {
      setLoadingPro(null);
    }
  }

  async function handleExportMasterAhsp() {
    setLoadingPro('ahsp');
    try {
      const { data, error } = await supabase
        .from('view_katalog_ahsp_lengkap')
        .select('*');
      
      if (error) throw error;
      ProReport.exportProMasterAhsp(data || []);
    } catch (err) {
      toast.error('Gagal mengambil master AHSP: ' + err.message);
    } finally {
      setLoadingPro(null);
    }
  }

  async function handleExportScurve() {
    if (!ahspLines || ahspLines.length === 0) {
      toast.warning('Data proyek kosong.');
      return;
    }
    setLoadingPro('scurve');
    try {
      const { data: catalogData } = await supabase
        .from('view_katalog_ahsp_lengkap')
        .select('master_ahsp_id, details');
      
      const catMap = {};
      (catalogData || []).forEach(c => { catMap[c.master_ahsp_id] = c.details; });

      const { computeManpower, getSequencedSchedule } = await import('@/lib/manpower');
      const manpower = computeManpower(ahspLines, catMap, project.labor_settings || {});
      const sequenced = getSequencedSchedule(manpower, project.start_date);

      ProReport.exportProScurveGantt(project, sequenced);
    } catch (err) {
      toast.error('Gagal memproses Kurva-S: ' + err.message);
    } finally {
      setLoadingPro(null);
    }
  }

  function handleExportUsedResources() {
    if (!ahspLines || ahspLines.length === 0) {
      toast.warning('Data proyek kosong.');
      return;
    }
    ProReport.exportProUsedResources(project, ahspLines);
  }

  async function handleExportUsedAhsp() {
    if (!ahspLines || ahspLines.length === 0) {
      toast.warning('Data proyek kosong.');
      return;
    }
    ProReport.exportProUsedAhsp(project, ahspLines);
  }

  async function handleConfirmCustomExport() {
    if (selectedSheets.length === 0) {
       toast.warning('Pilih minimal satu sheet untuk diekspor.');
       return;
    }
    setLoadingPro('custom');
    try {
      if (exportMode === 'catalog') {
        const { data: catAhsp } = await supabase.from('view_katalog_ahsp_lengkap').select('*');
        const { data: catPrice } = await supabase.from('master_harga_dasar').select('*, master_items(*)').eq('location_id', project.location_id);
        await generateProjectReport(project, userMember, ahspLines, selectedSheets, { isCatalog: true, catAhsp, catPrice });
      } else {
        await generateProjectReport(project, userMember, ahspLines, selectedSheets);
      }
      toast.success('Laporan kustom berhasil diunduh.');
    } catch (err) {
      console.error(err);
      toast.error('Gagal membuat laporan: ' + err.message);
    } finally {
      setLoadingPro(null);
    }
  }

  const toggleSheet = (id) => {
    setSelectedSheets(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-10 max-w-5xl mx-auto pt-4 pb-20">
      {/* ── Header ── */}
      <div className={`bg-gradient-to-br rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden border border-white/10 ${
        subTab === 'export' 
          ? 'from-slate-900 to-indigo-950 dark:from-orange-600 dark:to-amber-900' 
          : 'from-slate-800 to-emerald-950 dark:from-emerald-700 dark:to-emerald-900'
      }`}>
        {subTab === 'export' ? (
          <FileSpreadsheet className="absolute -right-12 -bottom-12 w-80 h-80 opacity-5 rotate-12" />
        ) : (
          <Upload className="absolute -right-12 -bottom-12 w-80 h-80 opacity-5 rotate-12" />
        )}
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/10 backdrop-blur-md">
              <div className={`w-2 h-2 rounded-full animate-pulse ${subTab === 'export' ? 'bg-emerald-400' : 'bg-indigo-400'}`} />
              <span className={`text-[10px] font-black uppercase tracking-widest ${subTab === 'export' ? 'text-emerald-300' : 'text-indigo-300'}`}>
                {subTab === 'export' ? 'Reporting Engine Active' : 'Import Engine Ready'}
              </span>
            </div>
            <h2 className="text-4xl font-black tracking-tighter leading-none">
              {subTab === 'export' ? (
                <>Pusat Kendali <br /> <span className="text-indigo-400 dark:text-orange-200">Pelaporan Proyek</span></>
              ) : (
                <>Pusat Kendali <br /> <span className="text-emerald-400 dark:text-emerald-200">Import Data Proyek</span></>
              )}
            </h2>
            <p className="text-slate-400 text-sm max-w-md leading-relaxed">
              {subTab === 'export' 
                ? 'Generate dokumen formal sesuai standar teknis secara instan. Integrasi otomatis antara data RAB, progres harian, dan tanda tangan stakeholder.'
                : 'Migrasi data RAB Anda dari format eksternal (Excel) langsung ke sistem BuildCalc. Mempercepat persiapan proyek tanpa input manual satu per satu.'}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-sm">
             <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {subTab === 'export' ? 'Format Ekspor' : 'Format Impor'}
             </div>
             <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border mb-1 ${subTab === 'export' ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-indigo-500/20 border-indigo-500/30'}`}>
                    {subTab === 'export' ? <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> : <FileSpreadsheet className="w-5 h-5 text-indigo-400" />}
                  </div>
                  <span className="text-[9px] font-bold text-slate-400">XLSX</span>
                </div>
                {subTab === 'export' && (
                  <div className="flex flex-col items-center opacity-40">
                    <div className="w-10 h-10 bg-slate-500/20 rounded-xl flex items-center justify-center border border-slate-500/30 mb-1"><FileText className="w-5 h-5 text-slate-400" /></div>
                    <span className="text-[9px] font-bold text-slate-400">PDF</span>
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>

      {subTab === 'export' ? (
        <>
          {isModeNormal ? (
            <div className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="group bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all h-full flex flex-col justify-between overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-6 opacity-5 rotate-12">
                    <FileSpreadsheet className="w-24 h-24" />
                  </div>
                  <div className="relative z-10">
                    <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/10 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <Download className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">Ekspor Detail RAB</h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-4">Format: XLSX (.xlsx)</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                      Unduh data rencana anggaran biaya secara mendalam, lengkap dengan uraian pekerjaan, volume, dan harga satuan per item.
                    </p>
                  </div>
                  <button onClick={handleExportExcel} className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:translate-y-[-2px] transition-all flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" /> DOWNLOAD DETAIL
                  </button>
                </div>

                <div className="group bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all h-full flex flex-col justify-between overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-6 opacity-5 -rotate-12">
                    <FileText className="w-24 h-24" />
                  </div>
                  <div className="relative z-10">
                    <div className="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <TrendingUp className="w-8 h-8 text-rose-600 dark:text-rose-400" />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">Rekapitulasi RAB</h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-4">Format: XLSX (.xlsx)</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                      Unduh ringkasan biaya per kelompok pekerjaan (Bab) saja. Ideal untuk lampiran dokumen kontrak atau pengajuan cepat.
                    </p>
                  </div>
                  <button onClick={() => ProReport.exportProRabSummary(project, ahspLines)} className="w-full py-4 bg-rose-600 dark:bg-rose-500/10 dark:text-rose-400 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:translate-y-[-2px] transition-all flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" /> DOWNLOAD REKAP
                  </button>
                </div>

                <div className="group bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-xl opacity-60 transition-all h-full flex flex-col justify-between overflow-hidden relative grayscale">
                  <div className="absolute top-0 right-0 p-6 opacity-5">
                    <Upload className="w-24 h-24" />
                  </div>
                  <div className="relative z-10">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-6">
                      <Upload className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">Laporan PDF (Locked)</h3>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 font-black uppercase tracking-widest mb-4">Segera Hadir</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                      Pilihan ekspor ke format PDF profesional dengan tata letak baku dinas PU. Tersedia untuk pengguna Advanced/Pro.
                    </p>
                  </div>
                  <button disabled className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] cursor-not-allowed">
                    FITUR TERKUNCI
                  </button>
                </div>
              </div>
              
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-3xl p-6 flex items-start gap-4">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black text-amber-700 dark:text-amber-500 uppercase tracking-widest mb-1">Informasi Hak Akses</p>
                  <p className="text-xs text-amber-900/70 dark:text-amber-500/70 leading-relaxed">
                    Anda saat ini menggunakan akun <b>Normal (Trial)</b>. Fitur pelaporan lanjutan seperti Laporan Progres Fisik harian/mingguan, Kurva-S, dan otomasi template profesional hanya tersedia untuk akun <b>Pro</b> atau <b>Admin</b>.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                   <div className="group bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all h-full flex flex-col justify-between">
                      <div>
                        <div className="w-16 h-16 bg-indigo-50 dark:bg-orange-500/10 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                          <Download className="w-8 h-8 text-indigo-600 dark:text-orange-400" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">Ekspor RAB</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                          Unduh ringkasan dan detail Rencana Anggaran Biaya dalam format Excel lengkap dengan pengelompokan Bab dan PPN.
                        </p>
                      </div>
                      <button onClick={handleExportExcel} className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:translate-y-[-2px] transition-all flex items-center justify-center gap-2">
                        <Download className="w-4 h-4" /> Download RAB (.xlsx)
                      </button>
                   </div>
                </div>
              <Upload className="w-8 h-8 text-slate-400" />
            </div>
            <div className="flex-1 space-y-2 text-center md:text-left">
              <div className="flex items-center gap-3 justify-center md:justify-start">
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">Import Master RAB</h3>
                <span className="text-[8px] px-2 py-1 rounded-full bg-slate-900 text-white font-black tracking-widest uppercase">Development</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xl">
                  Fasilitas migrasi data otomatis. Terjemahkan berkas Excel vendor luar menjadi entitas cerdas di BuildCalc. Fitur ini masih dalam tahap pengujian performa.
              </p>
            </div>
            <button disabled className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-not-allowed">
              Segera Hadir
            </button>
          </div>
        </>
      )}
    </div>
  );
}
