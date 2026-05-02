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
  const dbWorkMng = workbook.addWorksheet('db_mingguan_work');
  const dbWorkBln = workbook.addWorksheet('db_bulanan_work');
  [dbWork, dbWorkMng, dbWorkBln].forEach(ws => ws.state = 'hidden');

  const workCols = [
    { header: 'KEY', key: 'key' },
    { header: 'NO', key: 'no' },
    { header: 'NAME', key: 'name' },
    { header: 'UNIT', key: 'unit' },
    { header: 'VOL_PLAN', key: 'vol_plan' },
    { header: 'PRICE', key: 'price' },
    { header: 'VOL_LALU', key: 'vol_lalu' },
    { header: 'VOL_INI', key: 'vol_ini' },
    { header: 'VOL_TOTAL', key: 'vol_total' },
    { header: 'WEIGHT_PCT', key: 'weight_pct' }
  ];
  dbWork.columns = workCols;
  dbWorkMng.columns = workCols;
  dbWorkBln.columns = workCols;

  const totalDays = Math.max(Number(project.duration || 30), 40);
  const totalWeeks = Math.ceil(totalDays / 7);
  const totalMonths = Math.ceil(totalDays / 30);
  
  const cumulativeVolumes = {};

  // Populate Daily
  for (let i = 1; i <= totalDays; i++) {
    const day = rawDaily[i] || {};
    const mng = Math.ceil(i / 7);
    
    dbHarian.addRow({
      hari_ke: i, minggu_ke: mng, minggu_teks: numToText(mng),
      hari_nama: day.dayName || '-', tanggal: day.date || '-',
      cv_pt: (project.contractor_name || companyName).toUpperCase(),
      site_engineer: project.site_engineer || '-',
      mandor: day.labor?.mandor || 0, kepala_tukang: day.labor?.kepala_tukang || 0,
      tukang: (day.labor?.tukang || 0) + (day.labor?.tukang_batu || 0) + (day.labor?.tukang_cat || 0),
      pekerja: day.labor?.pekerja || 0, operator: (day.labor?.operator || 0) + (day.labor?.pembantu_operator || 0),
      pimtek: day.labor?.pimtek || 0, tl: project.konsultan_supervisor || '-',
      inspector: project.konsultan_inspector || '-', direksi: project.direksi_dinas || '-',
      weather_idx: day.weather?.index || '-', situasi: day.weather?.situation || '-', weather_cond: day.weather?.condition || '-'
    });

    const mats = day.materials || [];
    const eqs = day.equipment || [];
    for (let j = 1; j <= 11; j++) {
      dbItems.addRow({
        key: `${i}_${j}`,
        mat_name: mats[j-1]?.name || '', mat_vol: mats[j-1]?.volume || '', mat_unit: mats[j-1]?.unit || '',
        eq_name: eqs[j-1]?.name || '', eq_vol_unit: eqs[j-1] ? `${eqs[j-1].volume} ${eqs[j-1].unit}` : ''
      });
    }

    const progMap = day.progressMap || {};
    ahspLines.forEach((line, wIdx) => {
      const volToday = Number(progMap[line.id] || 0);
      const volLalu = cumulativeVolumes[line.id] || 0;
      cumulativeVolumes[line.id] = volLalu + volToday;
      
      dbWork.addRow({
        key: `${i}_${wIdx + 1}`,
        no: line.master_ahsp?.kode_ahsp || line.kode_ahsp || '-',
        name: line.uraian || line.nama_pekerjaan,
        unit: line.satuan || line.satuan_pekerjaan,
        vol_plan: Number(line.volume || 0),
        price: Number(line.harga_satuan || 0),
        vol_lalu: volLalu > 0 ? volLalu : '',
        vol_ini: volToday > 0 ? volToday : '',
        vol_total: cumulativeVolumes[line.id],
        weight_pct: cumulativeVolumes[line.id] / Number(line.volume || 1)
      });
    });
  }

  // Populate Weekly Summary
  const weeklyCumul = {};
  for (let w = 1; w <= totalWeeks; w++) {
    ahspLines.forEach((line, lIdx) => {
      let volIni = 0;
      for (let d = (w-1)*7 + 1; d <= w*7; d++) {
        volIni += Number(rawDaily[d]?.progressMap?.[line.id] || 0);
      }
      const volLalu = weeklyCumul[line.id] || 0;
      weeklyCumul[line.id] = volLalu + volIni;
      
      dbWorkMng.addRow({
        key: `${w}_${lIdx + 1}`,
        no: line.master_ahsp?.kode_ahsp || line.kode_ahsp || '-',
        name: line.uraian || line.nama_pekerjaan,
        unit: line.satuan || line.satuan_pekerjaan,
        vol_plan: Number(line.volume || 0),
        price: Number(line.harga_satuan || 0),
        vol_lalu: volLalu > 0 ? volLalu : '',
        vol_ini: volIni > 0 ? volIni : '',
        vol_total: weeklyCumul[line.id],
        weight_pct: weeklyCumul[line.id] / Number(line.volume || 1)
      });
    });
  }

  // Populate Monthly Summary
  const monthlyCumul = {};
  for (let m = 1; m <= totalMonths; m++) {
    ahspLines.forEach((line, lIdx) => {
      let volIni = 0;
      for (let d = (m-1)*30 + 1; d <= m*30; d++) {
        volIni += Number(rawDaily[d]?.progressMap?.[line.id] || 0);
      }
      const volLalu = monthlyCumul[line.id] || 0;
      monthlyCumul[line.id] = volLalu + volIni;
      
      dbWorkBln.addRow({
        key: `${m}_${lIdx + 1}`,
        no: line.master_ahsp?.kode_ahsp || line.kode_ahsp || '-',
        name: line.uraian || line.nama_pekerjaan,
        unit: line.satuan || line.satuan_pekerjaan,
        vol_plan: Number(line.volume || 0),
        price: Number(line.harga_satuan || 0),
        vol_lalu: volLalu > 0 ? volLalu : '',
        vol_ini: volIni > 0 ? volIni : '',
        vol_total: monthlyCumul[line.id],
        weight_pct: monthlyCumul[line.id] / Number(line.volume || 1)
      });
    });
  }

  // ==========================================
  // 2. Setup Interactive Sheet (LAPORAN HARIAN)
  // ==========================================
  const wsHarian = workbook.getWorksheet('LAPORAN HARIAN') || workbook.getWorksheet('Laporan Harian');
  if (wsHarian) {
    const projectDuration = Number(project.duration || 30);
    const dayNumbers = Array.from({ length: Math.max(projectDuration, 40) }, (_, i) => i + 1).join(',');

    wsHarian.getCell('Q1').dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${dayNumbers}"`],
      showErrorMessage: false // Allow typing manual values
    };
    wsHarian.getCell('Q1').value = 1;
    wsHarian.getCell('Q1').font = { bold: true, color: { argb: 'FFFF0000' }, size: 24 };
    wsHarian.getCell('Q1').alignment = { vertical: 'middle', horizontal: 'center' };

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
      wsHarian.getCell(`B${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_work!A:J, 2, FALSE), "")` };
      wsHarian.getCell(`C${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_work!A:J, 3, FALSE), "")` };
      wsHarian.getCell(`J${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_work!A:J, 4, FALSE), "")` };
      wsHarian.getCell(`K${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_work!A:J, 8, FALSE), "")` };
      const m = wsHarian.getCell(`M${r}`);
      m.value = { formula: `IFERROR(VLOOKUP(${k}, db_harian_work!A:J, 10, FALSE), "")` };
      m.numFmt = '0.00%';
    }

    // Empty State Check (Large Text if no work on Day 1-Item 1)
    wsHarian.getCell('C36').value = { formula: `IF(AND(Q1=1, K26=""), "TIDAK ADA PEKERJAAN", IFERROR(VLOOKUP(Q1 & "_1", db_harian_work!A:J, 3, FALSE), ""))` };

    // Weather & Sign
    wsHarian.getCell('B64').value = { formula: `VLOOKUP(Q1, db_harian_metadata!A:S, 17, FALSE)` };
    wsHarian.getCell('F64').value = { formula: `VLOOKUP(Q1, db_harian_metadata!A:S, 18, FALSE)` };
    wsHarian.getCell('H64').value = { formula: `VLOOKUP(Q1, db_harian_metadata!A:S, 19, FALSE)` };
    wsHarian.getCell('K57').value = { formula: `VLOOKUP(Q1, db_harian_metadata!A:S, 7, FALSE)` };
  }

  // Setup Weekly & Monthly Sheets
  const sheets = [
    { name: 'LAPORAN MINGGUAN', db: 'db_mingguan_work', total: totalWeeks },
    { name: 'LAPORAN BULANAN', db: 'db_bulanan_work', total: totalMonths }
  ];

  sheets.forEach(sh => {
    const ws = workbook.getWorksheet(sh.name) || workbook.getWorksheet(sh.name.toLowerCase());
    if (ws) {
      ws.getCell('Q1').dataValidation = {
        type: 'list', allowBlank: true, 
        formulae: [`"${Array.from({length: sh.total}, (_, i) => i+1).join(',')}"`],
        showErrorMessage: false
      };
      ws.getCell('Q1').value = 1;
      ws.getCell('Q1').font = { bold: true, color: { argb: 'FFFF0000' }, size: 24 };
      ws.getCell('Q1').alignment = { vertical: 'middle', horizontal: 'center' };

      // Shared Metadata (CV/PT, Project Name, etc.)
      ws.getCell('E5').value = (project.work_name || '').toUpperCase();
      ws.getCell('E6').value = project.contract_number || '-';
      ws.getCell('E7').value = (project.location || '-').toUpperCase();
      ws.getCell('E8').value = project.fiscal_year || '-';

      // Work Items for Weekly/Monthly (Typically columns: Lalu, Ini, Total)
      for (let j = 1; j <= 23; j++) {
        const r = 25 + j;
        const k = `Q1 & "_" & ${j}`;
        ws.getCell(`B${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, ${sh.db}!A:J, 2, FALSE), "")` };
        ws.getCell(`C${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, ${sh.db}!A:J, 3, FALSE), "")` };
        ws.getCell(`J${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, ${sh.db}!A:J, 4, FALSE), "")` };
        
        // Progress Columns
        ws.getCell(`K${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, ${sh.db}!A:J, 7, FALSE), "")` }; // Lalu
        ws.getCell(`L${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, ${sh.db}!A:J, 8, FALSE), "")` }; // Ini
        ws.getCell(`M${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, ${sh.db}!A:J, 9, FALSE), "")` }; // Total
        ws.getCell(`N${r}`).value = { formula: `IFERROR(VLOOKUP(${k}, ${sh.db}!A:J, 10, FALSE), "")` }; // Weight %
        ws.getCell(`N${r}`).numFmt = '0.00%';
      }
    }
  });

  // ==========================================
  // 3. Finalize & Export
  // ==========================================
  const oldDbSheets = ['database pekerja', 'database bahan', 'database alat', 'database harga', 'database volume', 'database tenaga', 'database'];
  
  const worksheets = [...workbook.worksheets];
  worksheets.forEach(ws => {
    const lowName = ws.name.toLowerCase();
    
    // Hapus total database lama jika ada
    if (oldDbSheets.includes(lowName)) {
      workbook.removeWorksheet(ws.id);
      return;
    }

    const isSelected = selectedSheets.some(s => ws.name.toLowerCase().includes(s.toLowerCase()));
    
    // Sembunyikan semua database interaktif
    if (lowName.includes('db_')) {
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
