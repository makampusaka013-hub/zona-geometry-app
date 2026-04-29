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
      workbook.removeWorksheet(ws.id);
    } else {
      if (headerImageId) ws.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
      setupPrinter(ws, companyName, null, paperSize, 'landscape');
    }
  });

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.fileName || `Laporan_Proyek_${project.name || 'Export'}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
};

module.exports = { generateLaporanReport };
