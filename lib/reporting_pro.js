import { generateProjectReport } from './excel_engine';
import { toast } from '@/lib/toast';

/**
 * Helper to sanitize filenames
 */
const sanitizeFileName = (name) => {
  return (name || 'Export').replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
};

/**
 * 1. Export Regional Price Catalog
 */
export async function exportProRegionalCatalog(locationName, data) {
  try {
    const safeName = sanitizeFileName(`Katalog_Harga_${locationName}`);
    await generateProjectReport(
      { name: locationName, location: locationName },
      {},
      [],
      ['HARGA SATUAN'],
      {
        isCatalog: true,
        catPrice: data,
        fileName: `${safeName}.xlsx`
      }
    );
    toast.success(`Katalog wilayah ${locationName} berhasil diunduh.`);
  } catch (err) {
    console.error('Export Error:', err);
    toast.error('Gagal mengekspor katalog: ' + err.message);
  }
}

/**
 * 2. Export Master AHSP with Details
 */
export async function exportProMasterAhsp(data) {
  try {
    const safeName = sanitizeFileName('Katalog_AHSP_Master');
    await generateProjectReport(
      { name: 'Katalog AHSP' },
      {},
      [],
      ['AHSP'],
      {
        isCatalog: true,
        catAhsp: data,
        fileName: `${safeName}.xlsx`
      }
    );
    toast.success('Katalog AHSP berhasil diunduh.');
  } catch (err) {
    console.error('Export Error:', err);
    toast.error('Gagal mengekspor AHSP: ' + err.message);
  }
}

/**
 * 3. Export S-Curve & Gantt Chart
 */
export async function exportProScurveGantt(project, scheduleData) {
  try {
    const safeName = sanitizeFileName(`S-Curve_${project?.name || 'Project'}`);
    await generateProjectReport(
      project,
      {},
      [],
      ['schedule'],
      {
        scheduleData: scheduleData,
        fileName: `${safeName}.xlsx`
      }
    );
    toast.success('Kurva-S & Jadwal berhasil diunduh.');
  } catch (err) {
    console.error('Export Error:', err);
    toast.error('Gagal mengekspor Kurva-S: ' + err.message);
  }
}

/**
 * 4. Export RAB Summary (Rekapitulasi)
 */
export async function exportProRabSummary(project, items) {
  try {
    const safeName = sanitizeFileName(`Laporan_RAB_${project?.name || 'Project'}`);
    await generateProjectReport(
      project,
      {},
      items,
      ['REKAP'],
      {
        fileName: `${safeName}.xlsx`
      }
    );
    toast.success('Rekapitulasi RAB berhasil diunduh.');
  } catch (err) {
    console.error('Export Error:', err);
    toast.error('Gagal mengekspor Rekap RAB: ' + err.message);
  }
}

/**
 * 5. Export Used Resource Prices (Harga Satuan Terpakai)
 */
export async function exportProUsedResources(project, items) {
  try {
    const safeName = sanitizeFileName(`Harga_Terpakai_${project?.name || 'Project'}`);
    await generateProjectReport(
      project,
      {},
      items,
      ['HARGA SATUAN TERPAKAI'],
      {
        fileName: `${safeName}.xlsx`
      }
    );
    toast.success('Daftar harga terpakai berhasil diunduh.');
  } catch (err) {
    console.error('Export Error:', err);
    toast.error('Gagal mengekspor harga terpakai: ' + err.message);
  }
}

/**
 * 6. Export Used AHSP (AHSP Terpakai)
 */
export async function exportProUsedAhsp(project, items) {
  try {
    const safeName = sanitizeFileName(`AHSP_Terpakai_${project?.name || 'Project'}`);
    await generateProjectReport(
      project,
      {},
      items,
      ['AHSP'],
      {
        fileName: `${safeName}.xlsx`
      }
    );
    toast.success('Detail AHSP terpakai berhasil diunduh.');
  } catch (err) {
    console.error('Export Error:', err);
    toast.error('Gagal mengekspor AHSP terpakai: ' + err.message);
  }
}
