import ExcelJS from 'exceljs';

/**
 * generateDokumentasiReport
 * Generates an Excel report using master_template_custom.xlsx.
 * 
 * @param {Object} project - Project metadata
 * @param {Array} documentationData - List of documentation reports (Daily Reports)
 * @param {Object} options - Configuration options (fileName, etc.)
 */
export const generateDokumentasiReport = async (project, documentationData, options = {}) => {
  const workbook = new ExcelJS.Workbook();
  
  try {
    // 1. Load Template
    const response = await fetch('/templates/master_template_custom.xlsx');
    if (!response.ok) throw new Error('Template file not found');
    const arrayBuffer = await response.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);
    
    // 2. Get Worksheet "dokumentasi" and IMMEDIATELY delete others
    // We do this first to ensure the requirement of "only 1 sheet" is met no matter what.
    const targetName = 'dokumentasi';
    let ws = workbook.getWorksheet(targetName);
    if (!ws) {
      ws = workbook.worksheets[0]; // Fallback
      ws.name = targetName;
    }

    // Aggressively remove all other sheets
    const sheetsToDelete = workbook.worksheets.filter(s => s.name.toLowerCase().trim() !== targetName);
    sheetsToDelete.forEach(s => workbook.removeWorksheet(s.id));

    // 3. Prepare Data
    const allPhotos = [];
    (documentationData || []).forEach(report => {
      if (report.project_photos && report.project_photos.length > 0) {
        report.project_photos.forEach(photo => {
          allPhotos.push({
            ...photo,
            report_date: report.report_date,
            weather: report.weather_description || report.weather
          });
        });
      }
    });

    const photosPerBlock = 3;
    const totalBlocks = Math.max(1, Math.ceil(allPhotos.length / photosPerBlock));

    // 4. Fill Data
    for (let b = 0; b < totalBlocks; b++) {
      const offset = b * 24;
      
      // Copy template structure if more than 1 block
      if (b > 0) {
        copyTemplateBlock(ws, 1, 23, offset + 1);
      }

      // Fill Metadata (D3:D8)
      ws.getCell(`D${offset + 3}`).value = project.program_name || '-';
      ws.getCell(`D${offset + 4}`).value = project.activity_name || '-';
      ws.getCell(`D${offset + 5}`).value = project.sub_activity || '-';
      ws.getCell(`D${offset + 6}`).value = project.work_name || project.name || '-';
      ws.getCell(`D${offset + 7}`).value = project.location || '-';
      ws.getCell(`D${offset + 8}`).value = project.fiscal_year || '-';

      // Fill Photos
      for (let s = 0; s < photosPerBlock; s++) {
        const photoIdx = b * photosPerBlock + s;
        if (photoIdx < allPhotos.length) {
          await fillPhotoSlot(workbook, ws, offset, s, allPhotos[photoIdx]);
        } else {
          clearSlotTitle(ws, offset, s);
        }
      }
    }

    // 5. Page Setup
    const lastRow = totalBlocks * 24;
    ws.pageSetup = {
      printArea: `A1:P${lastRow}`,
      printTitlesRow: '1:9',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
    };

    // 6. Final Export
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = options.fileName || `Dokumentasi_${project.name || 'Proyek'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);

  } catch (err) {
    console.error('Error generating documentation report:', err);
    throw err;
  }
};

/**
 * Fill Project Metadata in D3:D8
 */
function fillMetadata(ws, offset, project) {
  ws.getCell(`D${offset + 3}`).value = project.program_name || '-';
  ws.getCell(`D${offset + 4}`).value = project.activity_name || '-';
  ws.getCell(`D${offset + 5}`).value = '-'; // Sub Kegiatan (not in schema)
  ws.getCell(`D${offset + 6}`).value = project.work_name || project.name || '-';
  ws.getCell(`D${offset + 7}`).value = project.location || '-';
  ws.getCell(`D${offset + 8}`).value = project.fiscal_year || '-';
}

/**
 * Fill a photo slot (Title and Image)
 * Slots: 0 (B), 1 (G), 2 (L)
 */
async function fillPhotoSlot(workbook, ws, offset, slotIdx, photo) {
  const colStart = slotIdx === 0 ? 'B' : (slotIdx === 1 ? 'G' : 'L');
  
  // 1. Set Title (Caption + Date)
  const titleCell = ws.getCell(`${colStart}${offset + 11}`);
  const dateStr = new Date(photo.report_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  titleCell.value = `${photo.caption || 'Foto Lapangan'} (${dateStr})`;

  // 2. Add Image
  if (photo.photo_url || photo.drive_file_id) {
    try {
      let buffer;
      let extension = 'jpg';

      if (photo.storage_type === 'drive' && photo.drive_file_id) {
        // Fetch from Google Drive API
        const token = window.gapi?.auth?.getToken()?.access_token;
        if (!token) {
          throw new Error('Google Drive tidak terhubung. Silakan klik tombol "Hubungkan Drive" di aplikasi.');
        }

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${photo.drive_file_id}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.status === 401) {
          throw new Error('Sesi Google Drive berakhir. Silakan hubungkan ulang.');
        }

        if (!response.ok) {
          throw new Error(`Gagal mengambil foto dari Drive (${response.status})`);
        }
        
        buffer = await response.arrayBuffer();
      } else if (photo.photo_url) {
        // Fetch from Supabase / Public URL
        const response = await fetch(photo.photo_url);
        if (!response.ok) throw new Error('Gagal mengambil foto dari server');
        buffer = await response.arrayBuffer();
        extension = photo.photo_url.split('.').pop().split('?')[0] || 'jpg';
      }

      if (buffer && buffer.byteLength > 0) {
        const imgId = workbook.addImage({
          buffer: buffer,
          extension: extension,
        });

        // Calculate column index (B=2, G=7, L=12)
        const colIdx = slotIdx === 0 ? 1 : (slotIdx === 1 ? 6 : 11);
        
        ws.addImage(imgId, {
          tl: { col: colIdx, row: offset + 12 }, // Row 13 is index 12
          ext: { width: 330, height: 210 }
        });
      }
    } catch (e) {
      console.warn('Gagal memuat foto:', photo.photo_url || photo.drive_file_id, e);
      // Letakkan pesan error di dalam sel agar user tahu kenapa kosong
      const errorCell = ws.getCell(`${colStart}${offset + 13}`);
      errorCell.value = `[ERROR: ${e.message}]`;
      errorCell.font = { color: { argb: 'FFFF0000' }, size: 8 };
    }
  }
}

function clearSlotTitle(ws, offset, slotIdx) {
  const colStart = slotIdx === 0 ? 'B' : (slotIdx === 1 ? 'G' : 'L');
  ws.getCell(`${colStart}${offset + 11}`).value = '';
}

/**
 * Helper to copy a block of rows from source to target
 * Note: ExcelJS doesn't support perfect range copying with merges easily.
 */
function copyTemplateBlock(ws, startRow, endRow, targetStartRow) {
  for (let r = startRow; r <= endRow; r++) {
    const sourceRow = ws.getRow(r);
    const targetRow = ws.getRow(targetStartRow + (r - startRow));
    
    targetRow.height = sourceRow.height;
    
    sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);
      targetCell.value = cell.value;
      targetCell.style = cell.style;
    });
  }

  // Re-apply merges for the new block (Manual based on user spec)
  const offset = targetStartRow - 1;
  
  // Header COP
  safeMerge(ws, `B${offset + 1}:O${offset + 1}`);
  
  // Metadata Labels & Values
  for (let i = 3; i <= 8; i++) {
    safeMerge(ws, `D${offset + i}:O${offset + i}`);
  }

  // Photo Titles
  safeMerge(ws, `B${offset + 11}:E${offset + 11}`);
  safeMerge(ws, `G${offset + 11}:J${offset + 11}`);
  safeMerge(ws, `L${offset + 11}:O${offset + 11}`);

  // Photo Areas
  safeMerge(ws, `B${offset + 13}:E${offset + 23}`);
  safeMerge(ws, `G${offset + 13}:J${offset + 23}`);
  safeMerge(ws, `L${offset + 13}:O${offset + 23}`);
}

function safeMerge(ws, range) {
  try {
    ws.mergeCells(range);
  } catch (e) {
    // Already merged or invalid range
  }
}
