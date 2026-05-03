import ExcelJS from 'exceljs';
import { applyBorder, setupPrinter } from './excel_utils';

/**
 * generateDokumentasiReport
 * Generates an Excel report containing project documentation photos and notes.
 * 
 * @param {Object} project - Project metadata
 * @param {Array} documentationData - List of documentation reports
 * @param {Object} options - Configuration options (fileName, etc.)
 */
export const generateDokumentasiReport = async (project, documentationData, options = {}) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('DOKUMENTASI LAPANGAN');
  
  // Set Columns
  ws.columns = [
    { width: 5 },  // A
    { width: 30 }, // B
    { width: 30 }, // C
    { width: 30 }, // D
    { width: 5 }   // E
  ];

  // --- 1. HEADER ---
  ws.mergeCells('B2:D2');
  const titleCell = ws.getCell('B2');
  titleCell.value = 'LAPORAN DOKUMENTASI PROYEK';
  titleCell.font = { name: 'Arial', size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center' };

  ws.mergeCells('B3:D3');
  const projectCell = ws.getCell('B3');
  projectCell.value = (project.name || project.work_name || 'DOKUMENTASI').toUpperCase();
  projectCell.font = { name: 'Arial', size: 12, bold: true };
  projectCell.alignment = { horizontal: 'center' };

  ws.mergeCells('B4:D4');
  const contractCell = ws.getCell('B4');
  contractCell.value = `No. Kontrak: ${project.contract_number || '-'}`;
  contractCell.alignment = { horizontal: 'center' };

  let currentRow = 6;

  // --- 2. CONTENT ---
  for (const report of documentationData) {
    // Report Header (Date & Weather)
    ws.mergeCells(`B${currentRow}:D${currentRow}`);
    const dateCell = ws.getCell(`B${currentRow}`);
    const reportDate = new Date(report.report_date).toLocaleDateString('id-ID', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    dateCell.value = `TANGGAL: ${reportDate.toUpperCase()}`;
    dateCell.font = { bold: true };
    dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    applyBorder(ws, `B${currentRow}:D${currentRow}`);
    currentRow++;

    ws.mergeCells(`B${currentRow}:D${currentRow}`);
    ws.getCell(`B${currentRow}`).value = `Cuaca: ${report.weather_description || report.weather || '-'}`;
    applyBorder(ws, `B${currentRow}:D${currentRow}`);
    currentRow++;

    // Notes
    ws.mergeCells(`B${currentRow}:D${currentRow}`);
    const noteCell = ws.getCell(`B${currentRow}`);
    noteCell.value = `Catatan: ${report.notes || '-'}`;
    noteCell.alignment = { wrapText: true };
    applyBorder(ws, `B${currentRow}:D${currentRow}`);
    currentRow += 2; // Gap

    // Photos
    const photos = report.project_photos || [];
    for (let i = 0; i < photos.length; i += 2) {
      const photo1 = photos[i];
      const photo2 = photos[i + 1];

      // Row height for photos (approx 150px)
      ws.getRow(currentRow).height = 160;

      // Photo 1
      if (photo1?.photo_url) {
        try {
          const imgId = await addImageToWorkbook(workbook, photo1.photo_url);
          ws.addImage(imgId, {
            tl: { col: 1, row: currentRow - 1 },
            ext: { width: 220, height: 200 }
          });
          ws.getCell(`B${currentRow + 1}`).value = photo1.caption || 'Foto 1';
          ws.getCell(`B${currentRow + 1}`).font = { italic: true, size: 9 };
        } catch (e) {
          ws.getCell(`B${currentRow}`).value = '[Gagal memuat gambar]';
        }
      }

      // Photo 2
      if (photo2?.photo_url) {
        try {
          const imgId = await addImageToWorkbook(workbook, photo2.photo_url);
          ws.addImage(imgId, {
            tl: { col: 2, row: currentRow - 1 },
            ext: { width: 220, height: 200 }
          });
          ws.getCell(`C${currentRow + 1}`).value = photo2.caption || 'Foto 2';
          ws.getCell(`C${currentRow + 1}`).font = { italic: true, size: 9 };
        } catch (e) {
          ws.getCell(`C${currentRow}`).value = '[Gagal memuat gambar]';
        }
      }

      currentRow += 3; // Move past photos and captions
    }

    currentRow += 2; // Space between reports
  }

  // Final Setup
  setupPrinter(ws, 'ZONA GEOMETRY', null, 'A4', 'portrait');

  // Export
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.fileName || `Dokumentasi_${project.name || 'Proyek'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
};

/**
 * Helper to add image from URL to workbook
 */
async function addImageToWorkbook(workbook, url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const extension = url.split('.').pop().split('?')[0] || 'jpg';
  return workbook.addImage({
    buffer: buffer,
    extension: extension,
  });
}
