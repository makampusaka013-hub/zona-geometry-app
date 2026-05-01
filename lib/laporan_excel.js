const ExcelJS = require('exceljs');
const { 
  romanize, formatIdr, cleanStr, formatTerbilang, 
  clearDataRows, applyBorder, setupPrinter 
} = require('./excel_utils');

/**
 * generateLaporanReport
 * Versi Dynamic (Mirip Static tapi untuk konsistensi penamaan)
 */
const generateLaporanReport = async (project, user, ahspLines, selectedSheets, options = {}) => {
  const companyName = user?.full_name || 'ZONA GEOMETRY';
  const paperSize = options.paperSize || 'A4';
  const headerImage = options.headerImage || null;
  
  const response = await fetch(`/templates/master_template_custom.xlsx?v=${Date.now()}`);
  if (!response.ok) {
    throw new Error('Gagal mendownload template excel dari server. Pastikan file tersedia di public/templates/');
  }
  const arrayBuffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  let headerImageId = null;
  if (headerImage) {
    try {
      let base64Murni = '';
      if (headerImage.startsWith('http')) {
        const imgRes = await fetch(headerImage);
        const imgBlob = await imgRes.blob();
        const buffer = await imgBlob.arrayBuffer();
        headerImageId = workbook.addImage({ buffer, extension: 'png' });
      } else {
        base64Murni = headerImage.includes(',') ? headerImage.split(',')[1] : headerImage;
        headerImageId = workbook.addImage({ base64: base64Murni, extension: 'png' });
      }
    } catch (e) { console.error('Gagal memuat gambar header:', e); }
  }

  const enrichedLines = ahspLines.map(line => ({
    ...line,
    rounded_harga: Math.round(Number(line.harga_satuan || line.total_subtotal || 0))
  }));

  // ==========================================
  // 1. Process Database
  // ==========================================
  const wsDb = workbook.getWorksheet('database') || workbook.getWorksheet('DATABASE') || workbook.getWorksheet('Database');
  if (wsDb) {
    wsDb.eachRow((row) => { row.eachCell((cell) => { cell.value = null; cell.border = {}; cell.fill = {}; }); });
    const masterHeaders = ['ID_ITEM', 'BAB', 'KODE', 'URAIAN', 'SATUAN', 'VOL_KONTRAK', 'HARGA_SATUAN', 'TOTAL_KONTRAK', 'BOBOT (%)'];
    wsDb.getRow(1).values = masterHeaders;
    wsDb.getRow(1).font = { bold: true };
    wsDb.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'CBD5E1' } };

    let totalProjectPrice = 0;
    enrichedLines.forEach(l => { totalProjectPrice += (Number(l.volume || 0) * Number(l.harga_satuan || l.total_subtotal || 0)); });

    let dbRow = 2;
    enrichedLines.forEach(l => {
      const itemPrice = Number(l.harga_satuan || l.total_subtotal || 0);
      const totalPrice = Number(l.volume || 0) * itemPrice;
      const bobot = totalProjectPrice > 0 ? (totalPrice / totalProjectPrice) : 0;
      wsDb.getRow(dbRow).values = [l.id || l.master_ahsp_id || '', (l.bab_pekerjaan || '').toUpperCase(), l.kode_ahsp || l.master_ahsp?.kode_ahsp || '', l.uraian || l.nama_pekerjaan || '', l.satuan || l.satuan_pekerjaan || '', Number(l.volume || 0), itemPrice, totalPrice, bobot];
      wsDb.getCell(`I${dbRow}`).numFmt = '0.00%';
      dbRow++;
    });

    if (Array.isArray(options.progressData)) {
      wsDb.getCell('K1').value = 'ID_ITEM';
      wsDb.getCell('L1').value = 'TANGGAL';
      wsDb.getCell('M1').value = 'VOL_HARIAN';
      wsDb.getCell('N1').value = 'HARI_KE';
      options.progressData.forEach((p, idx) => {
        const r = idx + 2;
        wsDb.getCell(`K${r}`).value = p.entity_id || p.ahsp_id || '';
        wsDb.getCell(`L${r}`).value = p.date || '';
        wsDb.getCell(`M${r}`).value = Number(p.val || p.volume || 0);
        wsDb.getCell(`N${r}`).value = Number(p.day_number || 0);
      });
    }
    wsDb.state = 'hidden'; 
  }

  // Cleanup & Save
  const sheetMap = {
    'harian': ['harian', 'HARIAN', 'Laporan Harian'],
    'mingguan': ['mingguan', 'MINGGUAN', 'Laporan Mingguan'],
    'bulanan': ['bulanan', 'BULANAN', 'Laporan Bulanan'],
    'schedule': ['schedule', 'Kurva-S', 'Schedule'],
    'database': ['database', 'DATABASE']
  };

  const selectedSheetNames = selectedSheets.flatMap(s => sheetMap[s.toLowerCase()] || [s]);
  const worksheets = [...workbook.worksheets];
  worksheets.forEach(ws => {
    const lowName = ws.name.toLowerCase();
    const isSelected = selectedSheetNames.some(name => lowName === name.toLowerCase());
    if (lowName === 'database') return;
    if (!isSelected) {
      ws.state = 'veryHidden';
    } else {
      // ISI DATABASE SHEET (KUNCI UNTUK VLOOKUP)
      if (wsDb) {
        // 1. Metadata Proyek (Range R1:S20)
        const meta = [
          ['NAMA_PROYEK', project.work_name || project.name || ''],
          ['LOKASI', project.location || ''],
          ['TAHUN_ANGGARAN', project.fiscal_year || ''],
          ['KONTRAKTOR', project.contractor_name || ''],
          ['DIREKTUR', project.kontraktor_director || ''],
          ['TANGGAL_AWAL', options.startDate || ''],
          ['TANGGAL_AKHIR', options.endDate || ''],
          ['DIBUAT_OLEH', companyName]
        ];
        meta.forEach((m, i) => {
          wsDb.getCell(`R${i + 1}`).value = m[0];
          wsDb.getCell(`S${i + 1}`).value = m[1];
        });

        // 2. Weather Data (Range U1:V10)
        const targetDay = options.startDate;
        const dayReport = (options.dailyReports || []).find(r => r.report_date === targetDay);
        if (dayReport) {
          const weatherLabels = { 1: 'Cerah', 2: 'Berawan', 3: 'Gerimis', 4: 'Hujan', 5: 'Badai' };
          wsDb.getCell('U1').value = 'INDEX_CUACA';
          wsDb.getCell('V1').value = weatherLabels[dayReport.weather_index] || 'Cerah';
          wsDb.getCell('U2').value = 'KET_CUACA';
          wsDb.getCell('V2').value = dayReport.weather_description || '-';
        }

        // 3. Resource Usage (Range X1:Z50) - Tenaga, Bahan, Alat
        const progDaily = (options.progressData || []).filter(p => {
           const d = new Date(project.start_date);
           d.setDate(d.getDate() + (p.day_number - 1));
           return d.toISOString().split('T')[0] === targetDay;
        });
        
        wsDb.getCell('X1').value = 'KEY_RESOURCE';
        wsDb.getCell('Y1').value = 'VALUE';
        wsDb.getCell('Z1').value = 'UNIT';
        
        let resRow = 2;
        progDaily.forEach(p => {
          if (p.entity_type === 'resource' || p.entity_type === 'custom_labor') {
            wsDb.getCell(`X${resRow}`).value = p.entity_name || p.entity_key;
            wsDb.getCell(`Y${resRow}`).value = p.val;
            wsDb.getCell(`Z${resRow}`).value = (options.resources || []).find(r => (r.kode_item || r.uraian) === p.entity_key)?.satuan || '';
            resRow++;
          }
        });
      }

      if (headerImageId) ws.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
      
      const isPortrait = ws.name.toLowerCase().includes('harian');
      setupPrinter(ws, companyName, isPortrait ? 'A1:N71' : null, paperSize, isPortrait ? 'portrait' : 'landscape');
    }
  });

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.fileName || `Laporan_Proyek_${project.name || 'Export'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  
  // --- FIX: Jeda agar browser sempat membaca metadata ---
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
};

export { generateLaporanReport };
