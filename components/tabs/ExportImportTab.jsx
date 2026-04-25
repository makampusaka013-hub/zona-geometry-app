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
  const [selectedSheets, setSelectedSheets] = useState(['RAB', 'REKAP', 'HSP', 'AHSP', 'HARGA SATUAN', 'HARGA SATUAN TERPAKAI', 'schedule']);
  const [reportType, setReportType] = useState('harian');
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [paperSize, setPaperSize] = useState('A4'); // 'A4' | 'F4'
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [pendingExportFn, setPendingExportFn] = useState(null);
  const [loadingPro, setLoadingPro] = useState(null);
  const [headerImage, setHeaderImage] = useState(null);

  const handleHeaderImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setHeaderImage(event.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSetCurrentPeriod = () => {
    const today = new Date().toISOString().split('T')[0];
    setDateRange({ start: today, end: today });
  };

  if (tabLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col h-64 items-center justify-center space-y-4 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-xl">
        <Info className="w-12 h-12 text-slate-300" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Pilih Proyek Terlebih Dahulu</p>
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

  async function handleExportExcel() {
    handleStartExport(async (hImg) => {
      if (!project || !ahspLines || ahspLines.length === 0) {
        toast.warning('Data RAB kosong. Tidak ada yang bisa diekspor.');
        return;
      }
      setLoadingPro('rab');
      try {
        const enrichedLines = [...ahspLines];
        const missingDetailIds = enrichedLines.filter(l => l.master_ahsp_id && !l.master_ahsp?.details && (!l.analisa_custom || l.analisa_custom.length === 0)).map(l => l.master_ahsp_id);
        if (missingDetailIds.length > 0) {
          const { data: detailsData } = await supabase.from('view_katalog_ahsp_lengkap').select('master_ahsp_id, details').in('master_ahsp_id', missingDetailIds);
          if (detailsData) {
            const detailMap = Object.fromEntries(detailsData.map(d => [d.master_ahsp_id, d.details]));
            enrichedLines.forEach(l => { if (l.master_ahsp_id && detailMap[l.master_ahsp_id]) { if (!l.master_ahsp) l.master_ahsp = {}; l.master_ahsp.details = detailMap[l.master_ahsp_id]; } });
          }
        }
        const [projectRes, catalogRes] = await Promise.all([
          supabase.from('view_project_resource_summary').select('kode_item:key_item, harga_satuan:harga_snapshot').eq('project_id', project.id),
          supabase.from('master_harga_dasar').select('kode_item, harga_satuan').eq('location_id', project.location_id)
        ]);
        const mergedMap = {};
        (catalogRes.data || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
        (projectRes.data || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
        const projectPrices = Object.entries(mergedMap).map(([kode_item, harga_satuan]) => ({ kode_item, harga_satuan }));

        await generateProjectReport(project, userMember, enrichedLines, ['RAB', 'REKAP'], { 
          projectPrices, 
          headerImage: hImg, 
          paperSize, 
          isStandalone: true,
          fileName: `RAB ${project.name || ''}`
        });
        toast.success('RAB Berhasil diunduh.');
      } catch (err) {
        toast.error('Gagal mengekspor RAB: ' + err.message);
      } finally {
        setLoadingPro(null);
      }
    });
  }

  async function handleExportUsedAhsp() {
    handleStartExport(async (hImg) => {
      if (!project || !ahspLines || ahspLines.length === 0) return;
      setLoadingPro('used_ahsp');
      try {
        const enrichedLines = [...ahspLines];
        const missingDetailIds = enrichedLines.filter(l => l.master_ahsp_id && !l.master_ahsp?.details && (!l.analisa_custom || l.analisa_custom.length === 0)).map(l => l.master_ahsp_id);
        if (missingDetailIds.length > 0) {
          const { data: detailsData } = await supabase.from('view_katalog_ahsp_lengkap').select('master_ahsp_id, details').in('master_ahsp_id', missingDetailIds);
          if (detailsData) {
            const detailMap = Object.fromEntries(detailsData.map(d => [d.master_ahsp_id, d.details]));
            enrichedLines.forEach(l => { if (l.master_ahsp_id && detailMap[l.master_ahsp_id]) { if (!l.master_ahsp) l.master_ahsp = {}; l.master_ahsp.details = detailMap[l.master_ahsp_id]; } });
          }
        }
        
        // Tambahkan Peta Harga Proyek agar kalkulasi profit & TKDN di Excel Engine tidak kosong
        const [projectRes, catalogRes] = await Promise.all([
          supabase.from('view_project_resource_summary').select('kode_item:key_item, harga_satuan:harga_snapshot').eq('project_id', project.id),
          supabase.from('master_harga_dasar').select('kode_item, harga_satuan').eq('location_id', project.location_id)
        ]);
        const mergedMap = {};
        (catalogRes.data || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
        (projectRes.data || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
        const projectPrices = Object.entries(mergedMap).map(([kode_item, harga_satuan]) => ({ kode_item, harga_satuan }));

        await generateProjectReport(project, userMember, enrichedLines, ['AHSP'], { 
          projectPrices, 
          headerImage: hImg, 
          paperSize, 
          isStandalone: true,
          fileName: `AHSP & Harga Satuan Terpakai ${project.name || ''}`
        });
        toast.success('Analisa AHSP Terpakai berhasil diunduh.');
      } catch (err) {
        toast.error('Gagal mengekspor AHSP: ' + err.message);
      } finally {
        setLoadingPro(null);
      }
    });
  }

  async function handleExportUsedResources() {
    handleStartExport(async (hImg) => {
      if (!project || !ahspLines || ahspLines.length === 0) return;
      setLoadingPro('used_res');
      try {
        const [projectRes, catalogRes] = await Promise.all([
          supabase.from('view_project_resource_summary').select('kode_item:key_item, harga_satuan:harga_snapshot').eq('project_id', project.id),
          supabase.from('master_harga_dasar').select('kode_item, harga_satuan').eq('location_id', project.location_id)
        ]);
        const mergedMap = {};
        (catalogRes.data || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
        (projectRes.data || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
        const projectPrices = Object.entries(mergedMap).map(([kode_item, harga_satuan]) => ({ kode_item, harga_satuan }));
        await generateProjectReport(project, userMember, ahspLines, ['HARGA SATUAN TERPAKAI'], { 
          projectPrices, 
          headerImage: hImg, 
          paperSize, 
          isStandalone: true,
          fileName: "AHSP & HSP"
        });
        toast.success('Komponen Harga berhasil diunduh.');
      } catch (err) {
        toast.error('Gagal mengekspor Komponen Harga: ' + err.message);
      } finally {
        setLoadingPro(null);
      }
    });
  }

  async function handleExportRegionalCatalog() {
    handleStartExport(async (hImg) => {
      if (!project?.location_id || !project?.location) {
        toast.warning('Lokasi proyek belum ditentukan.');
        return;
      }
      setLoadingPro('catalog');
      try {
        const { data: catPrice } = await supabase.from('master_harga_dasar').select('*, master_items(*)').eq('location_id', project.location_id);
        if (!catPrice || catPrice.length === 0) {
          toast.warning(`Tidak ada data katalog untuk wilayah ${project.location}`);
          return;
        }
        await generateProjectReport(project, userMember, [], ['HARGA SATUAN'], { 
          isCatalog: true, 
          catPrice, 
          headerImage: hImg, 
          paperSize,
          fileName: `Harga Satuan ${project.location || ''}`
        });
        toast.success('Katalog Wilayah berhasil diunduh.');
      } catch (err) {
        toast.error('Gagal mengambil katalog: ' + err.message);
      } finally {
        setLoadingPro(null);
      }
    });
  }

  async function handleExportMasterAhsp() {
    handleStartExport(async (hImg) => {
      setLoadingPro('ahsp');
      try {
        const { data: catAhsp } = await supabase.from('view_katalog_ahsp_lengkap').select('*');
        await generateProjectReport(project, userMember, [], ['AHSP'], { isCatalog: true, catAhsp, headerImage: hImg, paperSize });
        toast.success('Master AHSP berhasil diunduh.');
      } catch (err) {
        toast.error('Gagal mengambil master AHSP: ' + err.message);
      } finally {
        setLoadingPro(null);
      }
    });
  }

  async function handleExportScurve() {
    handleStartExport(async (hImg) => {
      if (!ahspLines || ahspLines.length === 0) {
        toast.warning('Data proyek kosong.');
        return;
      }
      setLoadingPro('scurve');
      try {
        const ahspIds = [...new Set(ahspLines.map(l => l.master_ahsp_id).filter(Boolean))];
        const { data: catalogData } = ahspIds.length > 0 
          ? await supabase.from('view_katalog_ahsp_lengkap').select('master_ahsp_id, details').in('master_ahsp_id', ahspIds)
          : { data: [] };
        
        const catMap = {};
        (catalogData || []).forEach(c => { catMap[c.master_ahsp_id] = c.details; });
        const { computeManpower, getSequencedSchedule } = await import('@/lib/manpower');
        const manpower = computeManpower(ahspLines, catMap, project.labor_settings || {});
        const sequenced = getSequencedSchedule(manpower, project.start_date);
        const { data: progData } = await supabase.from('project_progress_daily').select('*').eq('project_id', project.id);
        const [projectRes, catalogRes] = await Promise.all([
          supabase.from('view_project_resource_summary').select('kode_item:key_item, harga_satuan:harga_snapshot').eq('project_id', project.id),
          supabase.from('master_harga_dasar').select('kode_item, harga_satuan').eq('location_id', project.location_id)
        ]);
        const mergedMap = {};
        (catalogRes.data || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
        (projectRes.data || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
        const projectPrices = Object.entries(mergedMap).map(([kode_item, harga_satuan]) => ({ kode_item, harga_satuan }));

        await generateProjectReport(project, userMember, ahspLines, ['schedule'], { 
          scheduleData: sequenced, 
          progressData: progData, 
          projectPrices, 
          paperSize: paperSize || 'A4', 
          headerImage: hImg, 
          isStandalone: true,
          fileName: `Kurva-S ${project.name || ''}`
        });
      } catch (err) {
        toast.error('Gagal memproses Kurva-S: ' + err.message);
      } finally {
        setLoadingPro(null);
      }
    });
  }

  async function handleConfirmCustomExport() {
    handleStartExport(async (hImg) => {
      if (selectedSheets.length === 0) {
         toast.warning('Pilih minimal satu sheet untuk diekspor.');
         return;
      }
      setLoadingPro('custom');
      try {
        const enrichedLines = [...ahspLines];
        const missingDetailIds = enrichedLines.filter(l => l.master_ahsp_id && !l.master_ahsp?.details && (!l.analisa_custom || l.analisa_custom.length === 0)).map(l => l.master_ahsp_id);
        if (missingDetailIds.length > 0) {
          const { data: detailsData } = await supabase.from('view_katalog_ahsp_lengkap').select('master_ahsp_id, details').in('master_ahsp_id', missingDetailIds);
          if (detailsData) {
            const detailMap = Object.fromEntries(detailsData.map(d => [d.master_ahsp_id, d.details]));
            enrichedLines.forEach(l => { if (l.master_ahsp_id && detailMap[l.master_ahsp_id]) { if (!l.master_ahsp) l.master_ahsp = {}; l.master_ahsp.details = detailMap[l.master_ahsp_id]; } });
          }
        }
        let scheduleData = [];
        if (selectedSheets.some(s => s.toLowerCase() === 'schedule')) {
          const ahspIds = [...new Set(enrichedLines.map(l => l.master_ahsp_id).filter(Boolean))];
          const { data: catalogData } = await supabase.from('view_katalog_ahsp_lengkap').select('master_ahsp_id, details').in('master_ahsp_id', ahspIds);
          const catMap = {};
          (catalogData || []).forEach(c => { catMap[c.master_ahsp_id] = c.details; });
          const { computeManpower, getSequencedSchedule } = await import('@/lib/manpower');
          const manpower = computeManpower(enrichedLines, catMap, project.labor_settings || {});
          scheduleData = getSequencedSchedule(manpower, project.start_date);
        }
        const { data: progData } = await supabase.from('project_progress_daily').select('*').eq('project_id', project.id);
        if (exportMode === 'catalog') {
          const { data: catAhsp } = await supabase.from('view_katalog_ahsp_lengkap').select('*');
          const { data: catPrice } = await supabase.from('master_harga_dasar').select('*, master_items(*)').eq('location_id', project.location_id);
          await generateProjectReport(project, userMember, enrichedLines, selectedSheets, { isCatalog: true, catAhsp, catPrice, headerImage: hImg, paperSize, scheduleData, progressData: progData });
        } else {
          const [projectRes, catalogRes] = await Promise.all([
            supabase.from('view_project_resource_summary').select('kode_item:key_item, harga_satuan:harga_snapshot').eq('project_id', project.id),
            supabase.from('master_harga_dasar').select('kode_item, harga_satuan').eq('location_id', project.location_id)
          ]);
          const mergedMap = {};
          (catalogRes.data || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
          (projectRes.data || []).forEach(p => { if (p.harga_satuan > 0) mergedMap[p.kode_item] = p.harga_satuan; });
          const projectPrices = Object.entries(mergedMap).map(([kode_item, harga_satuan]) => ({ kode_item, harga_satuan }));
          await generateProjectReport(project, userMember, enrichedLines, selectedSheets, { 
            projectPrices, 
            globalOverhead: project.ppn_percent || 12, 
            headerImage: hImg, 
            paperSize, 
            scheduleData, 
            progressData: progData,
            fileName: `Proyek ${project.name || ''}`
          });
        }
        toast.success('Laporan kustom berhasil diunduh.');
      } catch (err) {
        toast.error('Gagal membuat laporan: ' + err.message);
      } finally {
        setLoadingPro(null);
      }
    });
  }

  function handleStartExport(fn) {
    setPendingExportFn(() => fn);
    setIsExportModalOpen(true);
  }

  function handleExecutePendingExport(withLogo = true) {
    const finalImage = withLogo ? headerImage : null;
    setIsExportModalOpen(false);
    if (pendingExportFn) {
      pendingExportFn(finalImage);
    }
  }

  const toggleSheet = (id) => {
    setSelectedSheets(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-10 max-w-5xl mx-auto pt-4 pb-20">
      {/* Header */}
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
            <div className="space-y-12">
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

                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800 shadow-xl">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">Laporan Progres Fisik</h3>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Advanced Reporting Engine</p>
                      </div>
                    </div>
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                      {['harian', 'mingguan', 'bulanan'].map(t => (
                        <button
                          key={t}
                          onClick={() => setReportType(t)}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${reportType === t ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-orange-400 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tanggal Mulai</label>
                      <div className="relative group">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                        <input
                          type="date"
                          value={dateRange.start}
                          onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                          className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tanggal Selesai</label>
                      <div className="relative group">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                        <input
                          type="date"
                          value={dateRange.end}
                          onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                          className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={handleSetCurrentPeriod}
                      className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                    >
                      Set Periode Berjalan
                    </button>
                    <button
                      onClick={handleExportReport}
                      disabled={loadingReport}
                      className="flex-[2] py-4 bg-indigo-600 dark:bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:translate-y-[-2px] active:translate-y-0 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {loadingReport ? <Spinner className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                      Generate Laporan {reportType}
                    </button>
                  </div>
                </div>
              </div>

              {/* Additional Tools */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { id: 'scurve', label: 'Kurva-S', icon: TrendingUp, action: handleExportScurve, color: 'emerald' },
                  { id: 'used_ahsp', label: 'AHSP & Harga Terpakai', icon: ClipboardList, action: handleExportUsedAhsp, color: 'sky' },
                  { id: 'used_res', label: 'AHSP & HSP', icon: Wallet, action: handleExportUsedResources, color: 'amber' },
                  { id: 'catalog', label: 'Katalog Wilayah', icon: MapPin, action: handleExportRegionalCatalog, color: 'indigo' }
                ].map(tool => (
                  <button
                    key={tool.id}
                    onClick={tool.action}
                    disabled={loadingPro === tool.id}
                    className="group bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-lg hover:shadow-xl hover:translate-y-[-4px] transition-all text-center flex flex-col items-center gap-4 disabled:opacity-50"
                  >
                    <div className={`w-14 h-14 bg-${tool.color}-50 dark:bg-${tool.color}-500/10 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110`}>
                      <tool.icon className={`w-7 h-7 text-${tool.color}-600 dark:text-${tool.color}-400`} />
                    </div>
                    <span className="text-[10px] font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest leading-tight">{tool.label}</span>
                  </button>
                ))}
              </div>

              {/* Custom Template Section */}
              <div className="bg-slate-900 dark:bg-slate-800 rounded-[2.5rem] p-10 text-white relative overflow-hidden border border-white/5">
                <FileSpreadsheet className="absolute -right-20 -bottom-20 w-80 h-80 opacity-5 -rotate-12" />
                <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-white/10 rounded-[1.5rem] flex items-center justify-center backdrop-blur-xl border border-white/10">
                        <LayoutGrid className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black tracking-tight">Ekspor Kustom</h3>
                        <p className="text-[10px] text-indigo-300 font-black uppercase tracking-widest">Master Template Engine v2.0</p>
                      </div>
                    </div>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      Gunakan mesin pelaporan kustom untuk memilih sheet spesifik yang akan dimasukkan ke dalam dokumen Excel Anda. Mendukung format formal untuk audit dan pengajuan termin.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['RAB', 'REKAP', 'HSP', 'AHSP', 'HARGA SATUAN', 'HARGA SATUAN TERPAKAI', 'schedule'].map(sheet => (
                        <button
                          key={sheet}
                          onClick={() => toggleSheet(sheet)}
                          className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${selectedSheets.includes(sheet) ? 'bg-white text-slate-900 border-white' : 'bg-transparent text-white/40 border-white/10 hover:border-white/30'}`}
                        >
                          {sheet}
                        </button>
                      ))}
                    </div>
                    
                  </div>
                  <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 backdrop-blur-sm space-y-6 flex flex-col justify-center">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <span>Status Mesin</span>
                        <span className="text-emerald-400">Siap</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-full" />
                      </div>
                    </div>
                    <button
                      onClick={handleConfirmCustomExport}
                      disabled={loadingPro === 'custom'}
                      className="w-full py-5 bg-white text-slate-900 rounded-2xl text-xs font-black uppercase tracking-[0.3em] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {loadingPro === 'custom' ? <Spinner className="w-5 h-5 border-slate-900" /> : <Download className="w-5 h-5" />}
                      Export Custom .xlsx
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-12">
          {/* Import Wizard UI */}
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-12 border border-slate-200 dark:border-slate-800 shadow-2xl relative overflow-hidden">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                <div className="space-y-8">
                   <div className="space-y-4">
                      <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-500/10 rounded-3xl flex items-center justify-center">
                         <Upload className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Import Wizard Pro</h3>
                      <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-sm">
                         Unggah berkas Excel Anda untuk melakukan migrasi data secara massal. Sistem akan secara cerdas memetakan kolom Excel Anda ke dalam database BuildCalc.
                      </p>
                   </div>
                   
                   <div className="space-y-4">
                      {[
                        { step: 1, text: "Unduh Template Standar BuildCalc" },
                        { step: 2, text: "Isi data RAB sesuai format kolom" },
                        { step: 3, text: "Tarik berkas ke area drop zone" }
                      ].map(s => (
                        <div key={s.step} className="flex items-center gap-4 group">
                           <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                              {s.step}
                           </div>
                           <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{s.text}</span>
                        </div>
                      ))}
                   </div>

                   <div className="pt-4 flex gap-4">
                      <button className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-slate-200 dark:border-slate-700 hover:bg-white transition-all flex items-center gap-2">
                         <Download className="w-4 h-4" /> Template .xlsx
                      </button>
                   </div>
                </div>

                <div className="relative">
                   <div className="aspect-square bg-slate-50 dark:bg-slate-800/50 rounded-[2.5rem] border-4 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-10 text-center group hover:border-emerald-500/50 transition-all cursor-pointer">
                      <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-3xl shadow-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                         <Upload className="w-10 h-10 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                      </div>
                      <p className="text-sm font-black text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">Drag & Drop File Here</p>
                      <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">Support: .xlsx, .xls (Max 10MB)</p>
                   </div>
                   
                   {/* Floating Tags */}
                   <div className="absolute -top-4 -right-4 bg-slate-900 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-xl border border-white/10">Beta Version</div>
                </div>
             </div>
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-500/20 rounded-[2rem] p-8 flex items-center gap-6">
             <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Info className="w-6 h-6 text-white" />
             </div>
             <div className="flex-1">
                <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-400 uppercase tracking-widest mb-1">Butuh Bantuan Migrasi?</h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-500/70 leading-relaxed">
                   Jika format Excel Anda sangat kompleks atau berasal dari software ERP lain, tim kami dapat membantu proses import secara kustom. Hubungi dukungan teknis melalui WhatsApp.
                </p>
             </div>
             <button disabled className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-not-allowed">
               Segera Hadir
             </button>
          </div>
        </div>
      )}
      {/* MODAL PENGATURAN EKSPOR */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setIsExportModalOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-xl rounded-[3rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in duration-300">
            {/* Header Modal */}
            <div className="p-8 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black tracking-tighter">Pengaturan Ekspor</h3>
                <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-1">Logo & Format Dokumen</p>
              </div>
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                <FileSpreadsheet className="w-7 h-7 text-white" />
              </div>
            </div>

            <div className="p-10 space-y-8">
              {/* Logo Upload Section */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">KOP Proyek / Logo Perusahaan</label>
                <div className="flex flex-col items-center gap-6 p-8 bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-700 relative group transition-all">
                  {headerImage ? (
                    <div className="relative w-full aspect-[4/1] bg-white rounded-xl overflow-hidden shadow-lg border border-slate-200">
                      <img src={headerImage} alt="KOP Logo" className="w-full h-full object-contain p-2" />
                      <button 
                        onClick={() => setHeaderImage(null)}
                        className="absolute top-2 right-2 w-8 h-8 bg-rose-500 text-white rounded-lg flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                      >
                        <Check className="w-4 h-4 rotate-45" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-slate-100 dark:border-slate-700 group-hover:scale-110 transition-transform">
                        <Upload className="w-8 h-8 text-indigo-500" />
                      </div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Upload KOP / Logo</p>
                      <p className="text-[9px] text-slate-500">Format PNG/JPG, rekomendasi 800x200px</p>
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleHeaderImageUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>

              {/* Paper Size Section */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ukuran Kertas</label>
                <div className="grid grid-cols-2 gap-4">
                  {['A4', 'F4'].map(size => (
                    <button
                      key={size}
                      onClick={() => setPaperSize(size)}
                      className={`py-4 rounded-2xl border-2 font-black transition-all ${
                        paperSize === size 
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl translate-y-[-2px]' 
                          : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-4">
                <button 
                  onClick={() => handleExecutePendingExport(true)}
                  className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[1.5rem] text-xs font-black uppercase tracking-[0.2em] shadow-xl hover:translate-y-[-2px] transition-all flex items-center justify-center gap-3"
                >
                  <Download className="w-5 h-5" /> LANJUTKAN EKSPOR
                </button>
                <div className="flex gap-3">
                  <button 
                    onClick={() => handleExecutePendingExport(false)}
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors"
                  >
                    TANPA KOP
                  </button>
                  <button 
                    onClick={() => setIsExportModalOpen(false)}
                    className="px-8 py-4 bg-white dark:bg-slate-900 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-slate-200 dark:border-slate-800 hover:text-rose-500 transition-colors"
                  >
                    BATAL
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
