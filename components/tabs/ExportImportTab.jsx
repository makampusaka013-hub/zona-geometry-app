import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Upload, Download, FileText, Calendar, Users, ChevronRight, MapPin, TrendingUp, Wallet, ClipboardList, Check, LayoutGrid, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import Spinner from '../Spinner';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { exportReportToExcel, romanize } from '@/lib/reporting';
import * as ProReport from '@/lib/reporting_pro';
import { generateProjectReport } from '@/lib/excel_engine';

export default function ExportImportTab({ tabLoading, ahspLines, project, isModeNormal = false, userMember }) {
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
      // 1. Fetch Daily Progress Data for this project
      const { data: progressData, error } = await supabase
        .from('project_progress_daily')
        .select('*')
        .eq('project_id', project.id);

      if (error) throw error;

      // 2. Transform to expected format for reporting util
      // { [line_id]: { [day_number]: value } }
      const dailyMap = {};
      progressData.forEach(row => {
        if (!dailyMap[row.line_id]) dailyMap[row.line_id] = {};
        dailyMap[row.line_id][row.day_number] = row.value;
      });

      // 3. Export
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

    // Grouping by bab_pekerjaan
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

    // 1. RAB Sheet
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

    // 2. Rekap Sheet
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

    // Export Trigger
    ProReport.exportProRabSummary(project, ahspLines);
  }

  function handleSetCurrentPeriod() {
    const now = new Date();
    let start, end;

    if (reportType === 'harian') {
      start = now;
      end = now;
    } else if (reportType === 'mingguan') {
      // Set to current week (Monday to Sunday)
      const day = now.getDay(); // 0 (Sun) to 6 (Sat)
      const diffStart = now.getDate() - day + (day === 0 ? -6 : 1); 
      start = new Date(now.setDate(diffStart));
      end = new Date(now.setDate(start.getDate() + 6));
    } else {
      // bulanan
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
      // We need sequenced items. Since they aren't passed, we recalculate briefly
      // or fetch them. For simplicity, we'll fetch exactly what's needed.
      const { data: catalogData } = await supabase
        .from('view_katalog_ahsp_lengkap')
        .select('master_ahsp_id, details');
      
      const catMap = {};
      (catalogData || []).forEach(c => { catMap[c.master_ahsp_id] = c.details; });

      // Using same logic as manpower.js
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

  function handleExportRabPro() {
    if (!ahspLines || ahspLines.length === 0) {
      toast.warning('Data proyek kosong.');
      return;
    }
    ProReport.exportProRabSummary(project, ahspLines);
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
      let dataToExport = ahspLines;
      
      if (exportMode === 'catalog') {
        // Fetch all master data for the catalog mode
        const { data: catAhsp } = await supabase.from('view_katalog_ahsp_lengkap').select('*');
        const { data: catPrice } = await supabase.from('master_harga_dasar').select('*, master_items(*)').eq('location_id', project.location_id);
        
        // Wrap in a structure the engine can understand or call differently
        // For now, we'll keep it simple and reuse generateProjectReport with specialized data
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
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 dark:from-orange-600 dark:to-amber-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden border border-white/10">
        <FileSpreadsheet className="absolute -right-12 -bottom-12 w-80 h-80 opacity-5 rotate-12" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/10 backdrop-blur-md">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Reporting Engine Active</span>
            </div>
            <h2 className="text-4xl font-black tracking-tighter leading-none">
              Pusat Kendali <br /> <span className="text-indigo-400 dark:text-orange-200">Pelaporan Proyek</span>
            </h2>
            <p className="text-slate-400 text-sm max-w-md leading-relaxed">
              Generate dokumen formal sesuai standar teknis secara instan. Integrasi otomatis antara data RAB, progres harian, dan tanda tangan stakeholder.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-sm">
             <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Format Ekspor</div>
             <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30 mb-1"><FileSpreadsheet className="w-5 h-5 text-emerald-400" /></div>
                  <span className="text-[9px] font-bold text-slate-400">XLSX</span>
                </div>
                <div className="flex flex-col items-center opacity-40">
                  <div className="w-10 h-10 bg-slate-500/20 rounded-xl flex items-center justify-center border border-slate-500/30 mb-1"><FileText className="w-5 h-5 text-slate-400" /></div>
                  <span className="text-[9px] font-bold text-slate-400">PDF</span>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* ── Role-Based Layout Selection ── */}
      {isModeNormal ? (
        <div className="space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* 1. Ekspor Detail RAB */}
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
              <button 
                onClick={handleExportExcel}
                className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:translate-y-[-2px] transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> DOWNLOAD DETAIL
              </button>
            </div>

            {/* 2. Ekspor Rekapitulasi RAB */}
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
              <button 
                onClick={() => ProReport.exportProRabSummary(project, ahspLines)}
                className="w-full py-4 bg-rose-600 dark:bg-rose-500/10 dark:text-rose-400 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:translate-y-[-2px] transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> DOWNLOAD REKAP
              </button>
            </div>

            {/* 3. Impor RAB (Placeholder) */}
            <div className="group bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-xl opacity-60 transition-all h-full flex flex-col justify-between overflow-hidden relative grayscale">
              <div className="absolute top-0 right-0 p-6 opacity-5">
                <Upload className="w-24 h-24" />
              </div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-6">
                  <Upload className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">Impor Data RAB</h3>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 font-black uppercase tracking-widest mb-4">Segera Hadir</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                  Fitur untuk mengunggah file Excel Anda langsung ke sistem BuildCalc. Mempermudah migrasi data dari format eksternal.
                </p>
              </div>
              <button 
                disabled
                className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] cursor-not-allowed"
              >
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
            {/* ── Left Column: Standard Export ── */}
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
                  <button 
                    onClick={handleExportExcel}
                    className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:translate-y-[-2px] transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download RAB (.xlsx)
                  </button>
               </div>
            </div>

            {/* ── Middle/Right Column: Advanced Reporting (PRO ONLY) ── */}
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Users className="w-40 h-40 text-slate-400" />
                  </div>
                  
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                        <FileText className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">Laporan Progres Fisik</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Dokumen Penagihan & Monitoring</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ">Jenis Laporan</label>
                          <button 
                            onClick={handleSetCurrentPeriod}
                            className="text-[9px] font-black text-indigo-600 dark:text-orange-400 flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                          >
                            <Calendar className="w-3 h-3" />
                            SET {reportType === 'harian' ? 'HARI' : reportType === 'mingguan' ? 'MINGGU' : 'BULAN'} INI
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {['harian', 'mingguan', 'bulanan'].map(t => (
                            <button 
                              key={t}
                              onClick={() => setReportType(t)}
                              className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                                reportType === t 
                                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Rentang Periode</label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input 
                              type="date" 
                              value={dateRange.start}
                              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                              className="w-full pl-9 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-[10px] font-bold text-slate-700 dark:text-white outline-none focus:ring-2 ring-emerald-500/20" 
                            />
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300" />
                          <div className="relative flex-1">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input 
                              type="date" 
                              value={dateRange.end}
                              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                              className="w-full pl-9 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-[10px] font-bold text-slate-700 dark:text-white outline-none focus:ring-2 ring-emerald-500/20" 
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-dashed border-slate-200 dark:border-slate-700 mb-8">
                      <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm border border-slate-100 dark:border-slate-700"><Users className="w-5 h-5" /></div>
                          <div className="space-y-1">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Stakeholder Metadata</div>
                            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-200">
                              {project?.ppk_name ? `${project.ppk_name} (PPK)` : 'Data stakeholder belum lengkap'}
                            </div>
                          </div>
                          <button 
                            onClick={() => window.location.hash = 'edit-identity'} // Hint to user
                            className="ml-auto text-[9px] font-black text-indigo-600 uppercase tracking-widest px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-100 dark:border-indigo-900/50"
                          >
                            Lengkapi Data
                          </button>
                      </div>
                    </div>

                    <button 
                      onClick={handleExportReport}
                      disabled={loadingReport}
                      className="w-full py-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-[1.25rem] text-[11px] font-black uppercase tracking-[0.3em] shadow-xl shadow-emerald-600/20 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {loadingReport ? (
                        <Spinner className="w-5 h-5" />
                      ) : (
                        <>
                          <FileText className="w-5 h-5" /> GENERATE LAPORAN {reportType.toUpperCase()}
                        </>
                      )}
                    </button>
                  </div>
              </div>
            </div>
          </div>

          {/* ── Custom Template-Based Export Wizard (PRO ONLY) ── */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-indigo-500/10 transition-colors" />
             <div className="relative z-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                   <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                         <FileSpreadsheet className="w-8 h-8" />
                      </div>
                      <div>
                         <h3 className="text-2xl font-black text-slate-900 dark:text-white">Professional Report Wizard</h3>
                         <div className="flex gap-2 mt-1">
                            <button 
                              onClick={() => { setExportMode('project'); setSelectedSheets(['RAB', 'HSP', 'AHSP', 'HARGA SATUAN', 'SCHEDULE']); }}
                              className={`text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-widest transition-all ${exportMode === 'project' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
                            >
                              Laporan Proyek
                            </button>
                            <button 
                              onClick={() => { setExportMode('catalog'); setSelectedSheets(['AHSP', 'HSP', 'HARGA SATUAN']); }}
                              className={`text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-widest transition-all ${exportMode === 'catalog' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
                            >
                              Katalog Master
                            </button>
                         </div>
                      </div>
                   </div>
                   <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 rounded-full border border-indigo-100 dark:border-indigo-900/50">
                      <Check className="w-4 h-4 text-indigo-500" />
                      <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">A4 Optimized & Custom Kop</span>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                   <div className="md:col-span-2 space-y-8">
                      <div className="space-y-4">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <LayoutGrid className="w-3 h-3" /> Pilih Lembar Laporan (Sheets)
                         </label>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(exportMode === 'project' ? [
                              { id: 'RAB', label: 'RAB & Rekapitulasi', desc: 'Detail volume & harga per bab' },
                              { id: 'AHSP', label: 'Analisa AHSP Proyek', desc: 'Rincian koefisien Tenaga/Bahan/Alat' },
                              { id: 'HSP', label: 'HSP Proyek (Summary)', desc: 'Harga satuan pekerjaan tanpa rincian' },
                              { id: 'HARGA SATUAN', label: 'Harga Satuan Terpakai', desc: 'Daftar komplit material & Tenaga' },
                              { id: 'SCHEDULE', label: 'Schedule & Gantt', desc: 'Visual bar & Kurva-S mingguan' },
                            ] : [
                              { id: 'AHSP', label: 'AHSP Master (Full)', desc: 'Database seluruh analisa SNI' },
                              { id: 'HSP', label: 'HSP Master (Rekap)', desc: 'Ringkasan harga seluruh item master' },
                              { id: 'HARGA SATUAN', label: 'Katalog Harga Wilayah', desc: 'Daftar harga sesuai lokasi terpilih' },
                            ]).map(sheet => (
                              <button 
                                key={sheet.id}
                                onClick={() => toggleSheet(sheet.id)}
                                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                  selectedSheets.includes(sheet.id)
                                    ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-500/50 shadow-md'
                                    : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 opacity-60'
                                }`}
                              >
                                 <div className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                                      selectedSheets.includes(sheet.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'
                                    }`}>
                                      {selectedSheets.includes(sheet.id) && <Check className="w-3.5 h-3.5" />}
                                    </div>
                                    <div>
                                      <div className="text-xs font-black text-slate-800 dark:text-white">{sheet.label}</div>
                                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{sheet.desc}</div>
                                    </div>
                                 </div>
                              </button>
                            ))}
                         </div>
                      </div>
                   </div>

                   <div className="bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] p-8 space-y-6 border border-slate-100 dark:border-slate-800">
                      <div className="text-center space-y-2">
                         <h4 className="text-sm font-black text-slate-900 dark:text-white">Ready for Export</h4>
                         <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                            Sistem akan mengisi template master secara otomatis sesuai data proyek dan preferensi cetak Anda.
                         </p>
                      </div>
                      
                      <div className="space-y-3">
                         <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase px-2">
                            <span>Lembar terpilih</span>
                            <span className="text-indigo-600">{selectedSheets.length} Sheets</span>
                         </div>
                         <div className="h-px bg-slate-200 dark:bg-slate-700" />
                         <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase px-2">
                            <span>PPN Proyek</span>
                            <span className="text-emerald-600">{project?.ppn_percent ?? 12}%</span>
                         </div>
                      </div>

                      <button 
                        onClick={handleConfirmCustomExport}
                        disabled={loadingPro === 'custom'}
                        className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:translate-y-[-2px] active:translate-y-0 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                      >
                        {loadingPro === 'custom' ? (
                          <Spinner className="w-4 h-4" />
                        ) : (
                          <>
                            <Download className="w-4 h-4" /> UNDUH MASTER PRO (.XLSX)
                          </>
                        )}
                      </button>
                   </div>
                </div>
             </div>
          </div>

          {/* ── Professional Toolbox (PRO ONLY) ── */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 px-4">
               <div className="w-1.5 h-6 bg-amber-500 rounded-full" />
               <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Toolbox Ekspor Profesional</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
               {/* Catalog Region */}
               <button 
                 onClick={handleExportRegionalCatalog}
                 disabled={loadingPro === 'catalog'}
                 className="group p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-lg hover:shadow-xl hover:border-amber-500/50 transition-all text-left"
               >
                  <div className="w-12 h-12 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <MapPin className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white mb-1">Katalog Wilayah</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">{project?.location || 'Pilih Wilayah'}</p>
                  <div className="text-[10px] font-black text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    {loadingPro === 'catalog' ? 'MENGAMBIL DATA...' : 'UNDUH KATALOG (.XLSX)'}
                    <ChevronRight className="w-3 h-3" />
                  </div>
               </button>

               {/* Catalog AHSP */}
               <button 
                 onClick={handleExportMasterAhsp}
                 disabled={loadingPro === 'ahsp'}
                 className="group p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-lg hover:shadow-xl hover:border-indigo-500/50 transition-all text-left"
               >
                  <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <FileSpreadsheet className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white mb-1">Katalog AHSP Master</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">Standard Nasional (SNI)</p>
                  <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                     {loadingPro === 'ahsp' ? 'MEMPROSES...' : 'UNDUH MASTER (.XLSX)'}
                     <ChevronRight className="w-3 h-3" />
                  </div>
               </button>

               {/* S-Curve */}
               <button 
                 onClick={handleExportScurve}
                 disabled={loadingPro === 'scurve'}
                 className="group p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-lg hover:shadow-xl hover:border-emerald-500/50 transition-all text-left"
               >
                  <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white mb-1">Kurva-S & Jadwal</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">Baseline Proyek Aktif</p>
                  <div className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                     {loadingPro === 'scurve' ? 'MENGKALKULASI...' : 'UNDUH JADWAL (.XLSX)'}
                     <ChevronRight className="w-3 h-3" />
                  </div>
               </button>

               {/* Formal RAB */}
               <button 
                 onClick={() => ProReport.exportProRabSummary(project, ahspLines)}
                 className="group p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-lg hover:shadow-xl hover:border-rose-500/50 transition-all text-left"
               >
                  <div className="w-12 h-12 bg-rose-50 dark:bg-rose-500/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                  </div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white mb-1">Rekap RAB Formal</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">Lengkap dengan TTD</p>
                  <div className="text-[10px] font-black text-rose-600 dark:text-rose-400 flex items-center gap-2">
                     UNDUH REKAP (.XLSX)
                     <ChevronRight className="w-3 h-3" />
                  </div>
               </button>

               {/* Harga Terpakai */}
               <button 
                 onClick={handleExportUsedResources}
                 className="group p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-lg hover:shadow-xl hover:border-cyan-500/50 transition-all text-left"
               >
                  <div className="w-12 h-12 bg-cyan-50 dark:bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Wallet className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white mb-1">Harga Satuan Terpakai</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">Material/Tenaga di Proyek</p>
                  <div className="text-[10px] font-black text-cyan-600 dark:text-cyan-400 flex items-center gap-2">
                     UNDUH HARGA (.XLSX)
                     <ChevronRight className="w-3 h-3" />
                  </div>
               </button>

               {/* AHSP Terpakai */}
               <button 
                 onClick={handleExportUsedAhsp}
                 className="group p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-lg hover:shadow-xl hover:border-violet-500/50 transition-all text-left"
               >
                  <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <ClipboardList className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                  </div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white mb-1">Analisa AHSP Terpakai</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">Detail Analisa RAB Aktif</p>
                  <div className="text-[10px] font-black text-violet-600 dark:text-violet-400 flex items-center gap-2">
                     UNDUH ANALISA (.XLSX)
                     <ChevronRight className="w-3 h-3" />
                  </div>
               </button>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-[#020617] p-8 shadow-xl flex flex-col md:flex-row items-center gap-8 opacity-60 grayscale hover:grayscale-0 transition-all">
            <div className="w-20 h-20 rounded-[2rem] bg-slate-50 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-inner">
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
