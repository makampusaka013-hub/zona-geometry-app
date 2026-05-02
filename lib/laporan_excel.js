const ExcelJS = require('exceljs');
const { 
  romanize, formatIdr, cleanStr, formatTerbilang, 
  clearDataRows, applyBorder, setupPrinter 
} = require('./excel_utils');

/**
 * generateLaporanReport (Interactive VLOOKUP Version)
 * Now implemented in laporan_excel.js as requested.
 */
const generateLaporanReport = async (project, user, ahspLines, selectedSheets, options = {}) => {
  const companyName = user?.full_name || 'ZONA GEOMETRY';
  const paperSize = options.paperSize || 'A4';
  const headerImage = options.headerImage || null;
  const rawDaily = options.dailyProgress || options.progressDataMap || {}; // Map of dayNum -> data
  
  const response = await fetch(`/templates/master_template_custom.xlsx?v=${Date.now()}`);
  if (!response.ok) {
    throw new Error('Gagal mendownload template excel dari server.');
  }
  const arrayBuffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  let headerImageId = null;
  if (headerImage) {
    try {
      let base64Murni = headerImage.includes(',') ? headerImage.split(',')[1] : headerImage;
      headerImageId = workbook.addImage({ base64: base64Murni, extension: 'png' });
    } catch (e) { console.error('Gagal muat gambar:', e); }
  }

  // ==========================================
  // 1. Create Hidden Database Sheets
  // ==========================================
  
  // 1a. Metadata & Labor DB
  const dbHarian = workbook.addWorksheet('db_harian_metadata');
  dbHarian.state = 'hidden';
  dbHarian.columns = [
    { header: 'HARI_KE', key: 'hari_ke' },
    { header: 'MINGGU_KE', key: 'minggu_ke' },
    { header: 'MINGGU_TEKS', key: 'minggu_teks' },
    { header: 'HARI_NAMA', key: 'hari_nama' },
    { header: 'TANGGAL', key: 'tanggal' },
    { header: 'CV_PT', key: 'cv_pt' },
    { header: 'SITE_ENGINEER', key: 'site_engineer' },
    { header: 'MANDOR', key: 'mandor' },
    { header: 'KEPALA_TUKANG', key: 'kepala_tukang' },
    { header: 'TUKANG', key: 'tukang' },
    { header: 'PEKERJA', key: 'pekerja' },
    { header: 'OPERATOR', key: 'operator' },
    { header: 'PIMTEK', key: 'pimtek' },
    { header: 'TL', key: 'tl' },
    { header: 'INSPECTOR', key: 'inspector' },
    { header: 'DIREKSI', key: 'direksi' },
    { header: 'WEATHER_IDX', key: 'weather_idx' },
    { header: 'SITUASI', key: 'situasi' },
    { header: 'WEATHER_COND', key: 'weather_cond' }
  ];

  const numToText = (n) => {
    const list = ["", "SATU", "DUA", "TIGA", "EMPAT", "LIMA", "ENAM", "TUJUH", "DELAPAN", "SEMBILAN", "SEPULUH"];
    if (n <= 10) return list[n];
    return String(n);
  };

  // 1b. Material & Equipment DB
  const dbItems = workbook.addWorksheet('db_harian_items');
  dbItems.state = 'hidden';
  dbItems.columns = [
    { header: 'KEY', key: 'key' },
    { header: 'MAT_NAME', key: 'mat_name' },
    { header: 'MAT_VOL', key: 'mat_vol' },
    { header: 'MAT_UNIT', key: 'mat_unit' },
    { header: 'EQ_NAME', key: 'eq_name' },
    { header: 'EQ_VOL_UNIT', key: 'eq_vol_unit' }
  ];

  // 1c. Work Description DB (Cumulative Logic)
  const dbWork = workbook.addWorksheet('db_harian_work');
  dbWork.state = 'hidden';
  dbWork.columns = [
    { header: 'KEY', key: 'key' },
    { header: 'NO', key: 'no' },
    { header: 'NAME', key: 'name' },
    { header: 'UNIT', key: 'unit' },
    { header: 'VOL_REAL', key: 'vol_real' },
    { header: 'WEIGHT_PCT', key: 'weight_pct' }
  ];

  const totalDays = 40; // Prepare for 40 days
  const cumulativeVolumes = {};

  for (let i = 1; i <= totalDays; i++) {
    const day = rawDaily[i] || {};
    const mng = Math.ceil(i / 7);
    
    // Fill Metadata
    dbHarian.addRow({
      hari_ke: i,
      minggu_ke: mng,
      minggu_teks: numToText(mng),
      hari_nama: day.dayName || '-',
      tanggal: day.date || '-',
      cv_pt: (project.contractor_name || companyName).toUpperCase(),
      site_engineer: project.site_engineer || '-',
      mandor: day.labor?.mandor || 0,
      kepala_tukang: day.labor?.kepala_tukang || 0,
      tukang: (day.labor?.tukang || 0) + (day.labor?.tukang_batu || 0) + (day.labor?.tukang_cat || 0),
      pekerja: day.labor?.pekerja || 0,
      operator: (day.labor?.operator || 0) + (day.labor?.pembantu_operator || 0),
      pimtek: day.labor?.pimtek || 0,
      tl: project.konsultan_supervisor || '-',
      inspector: project.konsultan_inspector || '-',
      direksi: project.direksi_dinas || '-',
      weather_idx: day.weather?.index || '-',
      situasi: day.weather?.situation || '-',
      weather_cond: day.weather?.condition || '-'
    });

    // Fill Materials (12-22)
    const mats = day.materials || [];
    const eqs = day.equipment || [];
    for (let j = 1; j <= 11; j++) {
      dbItems.addRow({
        key: `${i}_${j}`,
        mat_name: mats[j-1]?.name || '',
        mat_vol: mats[j-1]?.volume || '',
        mat_unit: mats[j-1]?.unit || '',
        eq_name: eqs[j-1]?.name || '',
        eq_vol_unit: eqs[j-1] ? `${eqs[j-1].volume} ${eqs[j-1].unit}` : ''
      });
    }

    // Fill Work Description (Cumulative)
    const progMap = day.progressMap || {};
    let wIdx = 1;
    ahspLines.forEach(line => {
      const volToday = Number(progMap[line.id] || 0);
      if (!cumulativeVolumes[line.id]) cumulativeVolumes[line.id] = 0;
      cumulativeVolumes[line.id] += volToday;
      
      const totalPlan = Number(line.volume || 1);
      const weight = cumulativeVolumes[line.id] / totalPlan;

      dbWork.addRow({
        key: `${i}_${wIdx}`,
        no: line.master_ahsp?.kode_ahsp || line.kode_ahsp || '-',
        name: line.uraian || line.nama_pekerjaan,
        unit: line.satuan || line.satuan_pekerjaan,
        vol_real: volToday > 0 ? volToday : '',
        weight_pct: weight > 0 ? weight : ''
      });
      wIdx++;
    });
  }

  // ==========================================
  // 2. Setup Interactive Sheet (LAPORAN HARIAN)
  // ==========================================
  const wsHarian = workbook.getWorksheet('LAPORAN HARIAN') || workbook.getWorksheet('Laporan Harian');
  if (wsHarian) {
    wsHarian.getCell('Q1').dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40"`]
    };
    wsHarian.getCell('Q1').value = 1;
    wsHarian.getCell('Q1').font = { bold: true, color: { argb: 'FFFF0000' }, size: 14 };

    // Set Formulas
    wsHarian.getCell('J2').value = { formula: `VLOOKUP(Q1, db_harian_metadata!A:S, 6, FALSE)` };
    wsHarian.getCell('K51').value = { formula: `J2` };
    wsHarian.getCell('E5').value = (project.work_name || project.name || '').toUpperCase();
    wsHarian.getCell('E6').value = project.contract_number || '-';
    wsHarian.getCell('E7').value = (project.location || '-').toUpperCase();
    wsHarian.getCell('E8').value = project.fiscal_year || '-';
    
    wsHarian.getCell('L7').value = { formula: `"MINGGU KE : " & VLOOKUP(Q1, db_harian_metadata!A:S, 3, FALSE)` };
    wsHarian.getCell('L8').value = { formula: `"HARI : " & VLOOKUP(Q1, db_harian_metadata!A:S, 4, FALSE)` };
    wsHarian.getCell('L9').value = { formula: `"TANGGAL : " & VLOOKUP(Q1, db_harian_metadata!A:S, 5, FALSE)` };

    // Labor & Supervision
    const fields = ['F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F20', 'F21', 'F22'];
    fields.forEach((f, idx) => {
      wsHarian.getCell(f).value = { formula: `VLOOKUP(Q1, db_harian_metadata!A:S, ${8 + idx}, FALSE)` };
    });

    // Materials (12-22)
    for (let j = 1; j <= 11; j++) {
      const r = 11 + j;
      const k = `Q1 & "_" & ${j}`;
      wsHarian.getCell(`G${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_items!A:F, 2, FALSE), "")` };
      wsHarian.getCell(`I${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_items!A:F, 3, FALSE), "")` };
      wsHarian.getCell(`J${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_items!A:F, 4, FALSE), "")` };
      wsHarian.getCell(`K${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_items!A:F, 5, FALSE), "")` };
      wsHarian.getCell(`M${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_items!A:F, 6, FALSE), "")` };
    }

    // Work Description (26-48)
    for (let j = 1; j <= 23; j++) {
      const r = 25 + j;
      const k = `Q1 & "_" & ${j}`;
      wsHarian.getCell(`B${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_work!A:F, 2, FALSE), "")` };
      wsHarian.getCell(`C${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_work!A:F, 3, FALSE), "")` };
      wsHarian.getCell(`J${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_work!A:F, 4, FALSE), "")` };
      wsHarian.getCell(`K${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_work!A:F, 5, FALSE), "")` };
      const m = wsHarian.getCell(`M${r}`);
      m.value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_work!A:F, 6, FALSE), "")` };
      m.numFmt = '0.00%';
    }

    // Empty State Merge
    wsHarian.getCell('C36').value = { formula: `IF(AND(Q1=1, K26=""), "TIDAK ADA PEKERJAAN", IFERROR(VLOOKUP(Q1 & "_1", db_harian_work!A:F, 3, FALSE), ""))` };

    // Weather & Sign
    wsHarian.getCell('B64').value = { formula: `VLOOKUP(Q1, db_harian_metadata!A:S, 17, FALSE)` };
    wsHarian.getCell('F64').value = { formula: `VLOOKUP(Q1, db_harian_metadata!A:S, 18, FALSE)` };
    wsHarian.getCell('H64').value = { formula: `VLOOKUP(Q1, db_harian_metadata!A:S, 19, FALSE)` };
    wsHarian.getCell('K57').value = { formula: `VLOOKUP(Q1, db_harian_metadata!A:S, 7, FALSE)` };
  }

  // ==========================================
  // 3. Finalize & Export
  // ==========================================
  const worksheets = [...workbook.worksheets];
  worksheets.forEach(ws => {
    const lowName = ws.name.toLowerCase();
    const isSelected = selectedSheets.some(s => ws.name.toLowerCase().includes(s.toLowerCase()));
    
    if (lowName.includes('db_') || lowName.includes('database')) {
      ws.state = 'hidden'; 
      return;
    }

    if (!isSelected) {
      ws.state = 'veryHidden';
    } else {
      if (headerImageId) ws.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
      const isPortrait = lowName.includes('harian');
      setupPrinter(ws, companyName, isPortrait ? 'A1:N71' : null, paperSize, isPortrait ? 'portrait' : 'landscape');
    }
  });

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.fileName || `Laporan_${project.name}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { window.URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
};

export { generateLaporanReport };
