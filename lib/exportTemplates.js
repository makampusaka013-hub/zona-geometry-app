import * as XLSX from 'xlsx';
import { toast } from '@/lib/toast';

/**
 * Utility to format numbers as Indonesian currency/numbers in Excel cells
 */
const currencyFormat = '"Rp"#,##0.00_ ;\\-"Rp"#,##0.00\\ ';
const numberFormat = '#,##0.00_ ;\\-#,##0.00\\ ';

/**
 * Generate Excel buffer from a workbook and trigger download
 */
const downloadExcel = (wb, filename) => {
  try {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Berhasil mengunduh ${filename}`);
  } catch (error) {
    console.error('Export error:', error);
    toast.error(`Gagal mengekspor ${filename}`);
  }
};

/**
 * Export RAB (Rencana Anggaran Biaya) Base
 */
export const exportRab = (project, items) => {
  if (!items || items.length === 0) {
    toast.warning('Data RAB kosong.');
    return;
  }

  const wsData = [
    ['REKAPITULASI RENCANA ANGGARAN BIAYA (RAB)'],
    ['Nama Proyek:', project?.name || ''],
    ['Lokasi:', project?.location || ''],
    ['Tahun Anggaran:', project?.fiscal_year || ''],
    [],
    ['No', 'Uraian Pekerjaan', 'Satuan', 'Volume', 'Harga Satuan (Rp)', 'Jumlah Harga (Rp)']
  ];

  let totalRAB = 0;
  items.forEach((it, index) => {
    const jumlah = (Number(it.volume) || 0) * (Number(it.harga_satuan) || 0);
    totalRAB += jumlah;
    wsData.push([
      index + 1,
      it.uraian_custom || it.uraian,
      it.satuan,
      Number(it.volume) || 0,
      Number(it.harga_satuan) || 0,
      jumlah
    ]);
  });

  wsData.push(['', '', '', '', 'TOTAL', totalRAB]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Basic formatting
  const colWidths = [{ wpx: 40 }, { wpx: 250 }, { wpx: 60 }, { wpx: 80 }, { wpx: 120 }, { wpx: 150 }];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'RAB');

  downloadExcel(wb, `RAB_${project?.name || 'Proyek'}`);
};

/**
 * Export Laporan Harian ProgressBar
 */
export const exportHarian = (project, items, progressData, dateStr) => {
  // Skeleton implemented for Phase 3, you can populate actual progress mapping
  toast.info('Menyiapkan Laporan Harian...');
  // TODO: Map daily progress
};

/**
 * Export Laporan Mingguan
 */
export const exportMingguan = (project, items, progressData, weekNumber) => {
  toast.info('Menyiapkan Laporan Mingguan...');
};

/**
 * Export Laporan Bulanan (Omitted for Normal Role)
 */
export const exportBulanan = (project, items, progressData, monthNumber) => {
  toast.info('Menyiapkan Laporan Bulanan...');
};

/**
 * Export Mutual Check (MC-0, MC-50, MC-100)
 */
export const exportMC = (project, items, mcData, mcType) => {
  if (!items || items.length === 0) {
    toast.warning('Data item kosong.');
    return;
  }

  const wsData = [
    [`LAPORAN MUTUAL CHECK (${mcType})`],
    ['Nama Proyek:', project?.name || ''],
    ['Lokasi:', project?.location || ''],
    [],
    ['No', 'Uraian Pekerjaan', 'Satuan', 'Harga Satuan (Rp)', 'Vol. Kontrak', 'Vol. MC', 'Jumlah Harga MC (Rp)']
  ];

  let totalMC = 0;
  items.forEach((it, index) => {
    // Find matching MC data
    const mcRecord = mcData.find(m => m.line_id === it.id && m.mc_type === mcType);
    const volMc = mcRecord ? Number(mcRecord.volume_mc) : 0;
    const jumlahMc = volMc * (Number(it.harga_satuan) || 0);
    totalMC += jumlahMc;

    wsData.push([
      index + 1,
      it.uraian_custom || it.uraian,
      it.satuan,
      Number(it.harga_satuan) || 0,
      Number(it.volume) || 0,
      volMc,
      jumlahMc
    ]);
  });

  wsData.push(['', '', '', '', '', 'TOTAL', totalMC]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const colWidths = [{ wpx: 40 }, { wpx: 250 }, { wpx: 60 }, { wpx: 120 }, { wpx: 80 }, { wpx: 80 }, { wpx: 150 }];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, mcType);

  downloadExcel(wb, `${mcType}_${project?.name || 'Proyek'}`);
};

/**
 * Export Contract Change Order (CCO)
 */
export const exportCCO = (project, items, ccoData, ccoType) => {
  if (!items || items.length === 0) {
    toast.warning('Data item kosong.');
    return;
  }

  const wsData = [
    [`LAPORAN CONTRACT CHANGE ORDER (${ccoType})`],
    ['Nama Proyek:', project?.name || ''],
    ['Lokasi:', project?.location || ''],
    [],
    ['No', 'Uraian Pekerjaan', 'Satuan', 'Harga Kontrak', 'Vol Kontrak', 'Jumlah Kontrak', 'Harga CCO', 'Vol CCO', 'Jumlah CCO', 'Selisih (+/-)']
  ];

  // TODO: Add complex baseline logic if needed, simplify for now
  toast.info('Fitur Export CCO sedang dalam pengembangan format lanjutan.');
};
