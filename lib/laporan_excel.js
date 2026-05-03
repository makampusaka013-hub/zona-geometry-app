import ExcelJS from 'exceljs';
import { 
  romanize, formatIdr, cleanStr, formatTerbilang, 
  clearDataRows, applyBorder, setupPrinter 
} from './excel_utils';

/**
 * generateLaporanReport (Paten Version)
 * - Laporan Harian: ID di Q1, Data mulai Baris 26
 * - Laporan Mingguan/Bulanan: ID di T1, Data mulai Baris 15
 */
const generateLaporanReport = async (project, user, ahspLines, selectedSheets, options = {}) => {
  const companyName = (project.kontraktor_name || project.contractor_name || project.contractor || user?.full_name || 'ZONA GEOMETRY').toUpperCase();
  const paperSize = options.paperSize || 'A4';
  const headerImage = options.headerImage || null;
  const rawDaily = options.dailyProgress || options.progressDataMap || {}; 
  
  const response = await fetch(`/templates/master_template_custom.xlsx?v=${Date.now()}`);
  if (!response.ok) throw new Error('Gagal mendownload template excel.');
  
  const arrayBuffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  let headerImageId = null;
  if (headerImage) {
    try {
      let base64Murni = headerImage.includes(',') ? headerImage.split(',')[1] : headerImage;
      headerImageId = workbook.addImage({ base64: base64Murni, extension: 'png' });
    } catch (e) { console.error('Logo Error:', e); }
  }

  // 1. DATABASE SHEETS (HIDDEN)
  const dbHarian = workbook.addWorksheet('db_harian_metadata');
  const dbItems = workbook.addWorksheet('db_harian_items');
  const dbWork = workbook.addWorksheet('db_harian_work');
  const dbWorkMng = workbook.addWorksheet('db_mingguan_work');
  const dbWorkBln = workbook.addWorksheet('db_bulanan_work');
  
  // NEW: Metadata for Weekly/Monthly
  const dbMngMeta = workbook.addWorksheet('db_mingguan_metadata');
  const dbBlnMeta = workbook.addWorksheet('db_bulanan_metadata');
  const dbValid = workbook.addWorksheet('db_validation');

  [dbHarian, dbItems, dbWork, dbWorkMng, dbWorkBln, dbMngMeta, dbBlnMeta, dbValid].forEach(ws => ws.state = 'hidden');

  // Move definitions up here!
  const totalDays = Math.max(Number(project.duration || 30), 40);
  const totalWeeks = Math.ceil(totalDays / 7);
  const totalMonths = Math.ceil(totalDays / 30);

  // Populate Validation Lists (Numbers 1 to Max)
  for (let v = 1; v <= totalDays; v++) {
    dbValid.getCell(`A${v}`).value = v; // For Days
    if (v <= totalWeeks) dbValid.getCell(`B${v}`).value = v; // For Weeks
    if (v <= totalMonths) dbValid.getCell(`C${v}`).value = v; // For Months
  }
  dbValid.state = 'hidden'; // Ensure it's hidden but accessible

  // Metadata Columns (Simplified for weekly/monthly info)
  const metaCols = [
    { header: 'ID', key: 'id' },
    { header: 'PERIODE', key: 'periode' },
    { header: 'RENCANA', key: 'rencana' },
    { header: 'REALISASI', key: 'realisasi' },
    { header: 'DEVIASI', key: 'deviasi' }
  ];
  dbMngMeta.columns = metaCols;
  dbBlnMeta.columns = metaCols;

  // SMART CALENDAR SYSTEM - Daily Metadata Columns
  dbHarian.columns = [
    { header: 'HARI_KE', key: 'hari_ke' },      // 1
    { header: 'MINGGU_KE', key: 'minggu_ke' },    // 2
    { header: 'MINGGU_TEKS', key: 'minggu_teks' },  // 3
    { header: 'HARI_NAMA', key: 'hari_nama' },    // 4
    { header: 'TANGGAL_FULL', key: 'tanggal_full' },// 5
    { header: 'TGL_ANGKA', key: 'tgl_angka' },    // 6
    { header: 'BLN_ANGKA', key: 'bln_angka' },    // 7
    { header: 'THN_ANGKA', key: 'thn_angka' },    // 8
    { header: 'BLN_NAMA', key: 'bln_nama' },      // 9
    { header: 'CV_PT', key: 'cv_pt' },          // 10
    { header: 'SITE_ENGINEER', key: 'site_engineer' }, // 11
    { header: 'MANDOR', key: 'mandor' },        // 12
    { header: 'KEPALA_TUKANG', key: 'kepala_tukang' }, // 13
    { header: 'TUKANG', key: 'tukang' },        // 14
    { header: 'PEKERJA', key: 'pekerja' },      // 15
    { header: 'OPERATOR', key: 'operator' },    // 16
    { header: 'PIMTEK', key: 'pimtek' },        // 17
    { header: 'TL', key: 'tl' },              // 18
    { header: 'INSPECTOR', key: 'inspector' },  // 19
    { header: 'DIREKSI', key: 'direksi' },      // 20
    { header: 'WEATHER_IDX', key: 'weather_idx' }, // 21
    { header: 'SITUASI', key: 'situasi' },      // 22
    { header: 'WEATHER_COND', key: 'weather_cond' } // 23
  ];

  dbItems.columns = [
    { header: 'KEY', key: 'key' }, { header: 'MAT_NAME', key: 'mat_name' },
    { header: 'MAT_VOL', key: 'mat_vol' }, { header: 'MAT_UNIT', key: 'mat_unit' },
    { header: 'EQ_NAME', key: 'eq_name' }, { header: 'EQ_VOL_UNIT', key: 'eq_vol_unit' }
  ];

  const workCols = [
    { header: 'KEY', key: 'key' }, { header: 'NO', key: 'no' }, { header: 'NAME', key: 'name' },
    { header: 'UNIT', key: 'unit' }, { header: 'VOL_PLAN', key: 'vol_plan' }, { header: 'PRICE', key: 'price' },
    { header: 'VOL_LALU', key: 'vol_lalu' }, { header: 'VOL_INI', key: 'vol_ini' },
    { header: 'VOL_TOTAL', key: 'vol_total' }, { header: 'WEIGHT_PCT', key: 'weight_pct' }
  ];
  [dbWork, dbWorkMng, dbWorkBln].forEach(ws => ws.columns = workCols);

  const cumulativeVolumes = {};

  // PRE-CALCULATE DATES (PATEN)
  const startDate = project.start_date ? new Date(project.start_date) : new Date();
  const dayNames = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
  const monthNames = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
  
  // POPULATE DATA
  for (let i = 1; i <= totalDays; i++) {
    const day = rawDaily[i] || {};
    const mng = Math.ceil(i / 7);
    
    // SMART CALENDAR LOGIC
    const currentFullDate = new Date(startDate);
    currentFullDate.setDate(startDate.getDate() + (i - 1));
    
    dbHarian.addRow({
      hari_ke: i, 
      minggu_ke: mng, 
      minggu_teks: String(mng),
      hari_nama: dayNames[currentFullDate.getDay()], 
      tanggal_full: currentFullDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
      tgl_angka: currentFullDate.getDate(),
      bln_angka: currentFullDate.getMonth() + 1,
      thn_angka: currentFullDate.getFullYear(),
      bln_nama: monthNames[currentFullDate.getMonth()],
      cv_pt: companyName,
      site_engineer: project.site_engineer || '-',
      mandor: day.labor?.mandor || 0, 
      kepala_tukang: day.labor?.kepala_tukang || 0,
      tukang: (day.labor?.tukang || 0) + (day.labor?.tukang_batu || 0),
      pekerja: day.labor?.pekerja || 0, 
      operator: day.labor?.operator || 0,
      pimtek: day.labor?.pimtek || 0, 
      tl: day.labor?.tl || 0,
      inspector: day.labor?.inspector || 0, 
      direksi: day.labor?.direksi || 0,
      weather_idx: day.weather?.index || '-', 
      situasi: day.weather?.situation || '-', 
      weather_cond: day.weather?.condition || '-'
    });

    const mats = day.materials || [];
    const eqs = day.equipment || [];
    for (let j = 1; j <= 11; j++) {
      const m = mats[j-1];
      const e = eqs[j-1];
      dbItems.addRow({
        key: `${i}_${j}`,
        mat_name: m?.volume && parseFloat(m.volume) > 0 ? m.name : '', 
        mat_vol: m?.volume && parseFloat(m.volume) > 0 ? parseFloat(m.volume) : '', 
        mat_unit: m?.volume && parseFloat(m.volume) > 0 ? m.unit : '',
        eq_name: e?.volume && parseFloat(e.volume) > 0 ? e.name : '', 
        eq_vol_unit: e?.volume && parseFloat(e.volume) > 0 ? `${e.volume} ${e.unit || ''}` : ''
      });
    }

    const progMap = day.progressMap || {};
    
    // Group ahspLines by bab_pekerjaan
    const groupedLines = {};
    ahspLines.forEach(line => {
      const bab = line.bab_pekerjaan || 'Lain-lain';
      if (!groupedLines[bab]) groupedLines[bab] = [];
      groupedLines[bab].push(line);
    });

    let globalRowIdx = 1;
    const sortedBabs = Object.keys(groupedLines).sort((a, b) => {
      const aNum = parseInt(a.replace(/\D/g, '')) || 999;
      const bNum = parseInt(b.replace(/\D/g, '')) || 999;
      return aNum - bNum;
    });

    sortedBabs.forEach((babName, babIdx) => {
      const linesInBab = groupedLines[babName];
      const activeLines = linesInBab.filter(line => parseFloat(progMap[line.id] || 0) > 0);
      
      if (activeLines.length > 0) {
        // Calculate Total Bab Weight (Cumulative)
        let totalBabWeight = 0;
        linesInBab.forEach(ln => {
          const vToday = parseFloat(progMap[ln.id] || 0);
          const vLalu = (cumulativeVolumes[ln.id] || 0);
          totalBabWeight += (vLalu + vToday) / Number(ln.volume || 1);
        });

        // 1. Add Bab Header Row
        dbWork.addRow({
          key: `${i}_${globalRowIdx}`,
          no: babName.split('.')[0] || `BAB ${babIdx + 1}`, // e.g., "BAB I" or "A"
          name: babName,
          unit: '',
          vol_plan: '',
          vol_ini: '',
          weight_pct: totalBabWeight, // Cumulative Total per Bab
          is_bab: 'BAB' // Column 11 marker
        });
        globalRowIdx++;

        // 2. Add Work Item Rows
        activeLines.forEach((line, itemIdx) => {
          const volToday = parseFloat(progMap[line.id] || 0);
          const volLalu = (cumulativeVolumes[line.id] || 0);
          
          const kode = line.master_ahsp?.kode_ahsp || line.kode_ahsp || '';
          const name = kode ? `(${kode}) ${line.uraian}` : line.uraian;

          dbWork.addRow({
            key: `${i}_${globalRowIdx}`,
            no: `${itemIdx + 1}`, // Sequential 1, 2, 3...
            name: name,
            unit: line.satuan || '',
            vol_plan: Number(line.volume || 0),
            vol_ini: volToday,
            weight_pct: (volLalu + volToday) / Number(line.volume || 1),
            is_bab: 'ITEM' // Column 11 marker
          });
          globalRowIdx++;
        });
      }

      // Update cumulative volumes for ALL lines (even if not active today)
      linesInBab.forEach(line => {
        const volToday = parseFloat(progMap[line.id] || 0);
        cumulativeVolumes[line.id] = (cumulativeVolumes[line.id] || 0) + volToday;
      });
    });
  }

  // POPULATE WEEKLY/MONTHLY (SUMMARIES)
  for (let w = 1; w <= totalWeeks; w++) {
    let weekWeight = 0;
    ahspLines.forEach((line, lIdx) => {
      let volIni = 0;
      for (let d = (w-1)*7 + 1; d <= w*7; d++) volIni += Number(rawDaily[d]?.progressMap?.[line.id] || 0);
      dbWorkMng.addRow({ key: `${w}_${lIdx+1}`, no: line.kode_ahsp, name: line.uraian, unit: line.satuan, vol_ini: volIni });
      
      // Calculate total weight up to this week for meta
      const volTotal = (cumulativeVolumes[line.id] || 0); 
      weekWeight += (volTotal / Number(line.volume || 1)) * (Number(line.weight_total || 0) / 100);
    });

    const dStart = new Date(startDate); dStart.setDate(startDate.getDate() + (w-1)*7);
    const dEnd = new Date(startDate); dEnd.setDate(startDate.getDate() + w*7 - 1);
    const pStr = `${dStart.getDate()} ${monthNames[dStart.getMonth()]} s/d ${dEnd.getDate()} ${monthNames[dEnd.getMonth()]} ${dEnd.getFullYear()}`;
    
    dbMngMeta.addRow({ 
      id: w, 
      periode: pStr, 
      rencana: '-', 
      realisasi: isNaN(weekWeight) ? 0 : weekWeight, 
      deviasi: '-' 
    });
  }

  for (let m = 1; m <= totalMonths; m++) {
    const dStart = new Date(startDate); dStart.setDate(startDate.getDate() + (m-1)*30);
    const dEnd = new Date(startDate); dEnd.setDate(startDate.getDate() + m*30 - 1);
    const pStr = `${monthNames[dStart.getMonth()]} ${dStart.getFullYear()} s/d ${monthNames[dEnd.getMonth()]} ${dEnd.getFullYear()}`;
    dbBlnMeta.addRow({ id: m, periode: pStr, rencana: '-', realisasi: '-', deviasi: '-' });
  }

      // SETUP INTERACTIVE SHEETS
      const worksheets = [...workbook.worksheets];
      worksheets.forEach(ws => {
        const name = ws.name.toUpperCase();
        const isHarian = name.includes('HARIAN');
        const isMng = name.includes('MINGGUAN');
        const isBln = name.includes('BULANAN');
    
        if ((isHarian || isMng || isBln) && !name.includes('DB_')) {
          const idCell = isHarian ? 'P1' : 'T1'; // Shifted from Q1 to P1
          const startRow = isHarian ? 26 : 15;
          const dbName = isHarian ? 'db_harian_work' : (isMng ? 'db_mingguan_work' : 'db_bulanan_work');
          const metaSheet = isMng ? 'db_mingguan_metadata' : 'db_bulanan_metadata';
    
          ws.getCell(idCell).value = 1;
          ws.getCell(idCell).font = { bold: true, color: { argb: 'FFFF0000' }, size: 24 };
          ws.getCell(idCell).alignment = { vertical: 'middle', horizontal: 'center' };
    
          // DATA VALIDATION (PATEN)
          const validCol = isHarian ? 'A' : (isMng ? 'B' : 'C');
          const validMax = isHarian ? totalDays : (isMng ? totalWeeks : totalMonths);
          ws.getCell(idCell).dataValidation = null;
          ws.getCell(idCell).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`'db_validation'!$${validCol}$1:$${validCol}$${validMax}`],
            showErrorMessage: false
          };

      // METADATA (PATEN)
      ws.getCell('E5').value = (project.work_name || project.name || '').toUpperCase();
      ws.getCell('E6').value = project.contract_number || '-';
      ws.getCell('E7').value = (project.location || '-').toUpperCase();
      ws.getCell('E8').value = project.fiscal_year || '-';

      if (isHarian) {
        ws.getCell('J2').value = companyName; // CV/PT Name in J2
        ws.getCell('K51').value = companyName; // Fixed position: J51 -> K51
        ws.getCell('K7').value = { formula: `=": " & IFERROR(VLOOKUP($P$1, 'db_harian_metadata'!$A:$W, 3, FALSE), "")` };
        ws.getCell('K8').value = { formula: `=": " & IFERROR(VLOOKUP($P$1, 'db_harian_metadata'!$A:$W, 4, FALSE), "")` };
        ws.getCell('K9').value = { formula: `=": " & IFERROR(VLOOKUP($P$1, 'db_harian_metadata'!$A:$W, 5, FALSE), "")` };

        // TENAGA KERJA (JUMLAH di kolom F) - Contractor (12-17), Direksi (18-20)
        const contractorCells = ['F13', 'F14', 'F15', 'F16', 'F17', 'F18'];
        contractorCells.forEach((cell, idx) => {
          const colIdx = 12 + idx;
          const vlookup = `VLOOKUP($P$1, 'db_harian_metadata'!$A:$W, ${colIdx}, FALSE)`;
          ws.getCell(cell).value = { formula: `=IF(IFERROR(${vlookup}, 0) > 0, ${vlookup} & " Org", "- Org")` };
        });
        const direksiCells = ['F20', 'F21', 'F22'];
        direksiCells.forEach((cell, idx) => {
          const colIdx = 18 + idx;
          const vlookup = `VLOOKUP($P$1, 'db_harian_metadata'!$A:$W, ${colIdx}, FALSE)`;
          ws.getCell(cell).value = { formula: `=IF(IFERROR(${vlookup}, 0) > 0, ${vlookup} & " Org", "- Org")` };
        });

        // BAHAN (G: Nama, I: Vol, J: Sat) & ALAT (K: Nama, L: Vol+Sat)
        for (let j = 1; j <= 11; j++) {
          const rowIdx = 12 + j;
          const itemKey = `$P$1 & "_" & ${j}`;
          ws.getCell(`G${rowIdx}`).value = { formula: `=IFERROR(VLOOKUP(${itemKey}, 'db_harian_items'!$A:$F, 2, FALSE), "")` };
          ws.getCell(`G${rowIdx}`).alignment = { vertical: 'middle', horizontal: 'left' };
          
          ws.getCell(`I${rowIdx}`).value = { formula: `=IFERROR(VLOOKUP(${itemKey}, 'db_harian_items'!$A:$F, 3, FALSE), "")` };
          ws.getCell(`I${rowIdx}`).alignment = { vertical: 'middle', horizontal: 'center' };
          
          ws.getCell(`J${rowIdx}`).value = { formula: `=IFERROR(VLOOKUP(${itemKey}, 'db_harian_items'!$A:$F, 4, FALSE), "")` };
          ws.getCell(`J${rowIdx}`).alignment = { vertical: 'middle', horizontal: 'center' };
          
          ws.getCell(`K${rowIdx}`).value = { formula: `=IFERROR(VLOOKUP(${itemKey}, 'db_harian_items'!$A:$F, 5, FALSE), "")` };
          ws.getCell(`L${rowIdx}`).value = { formula: `=IFERROR(VLOOKUP(${itemKey}, 'db_harian_items'!$A:$F, 6, FALSE), "")` };
        }
      } else {
        // MINGGUAN / BULANAN HEADER INFO (K6:K10)
        ws.getCell('I4').value = companyName;
        const label = isMng ? 'MINGGU' : 'BULAN';
        ws.getCell('K6').value = { formula: `": " & "${label} KE " & $T$1` };
        ws.getCell('K7').value = { formula: `": " & IFERROR(VLOOKUP($T$1, '${metaSheet}'!$A:$E, 2, FALSE), "")` };
        ws.getCell('K8').value = { formula: `": " & IFERROR(VLOOKUP($T$1, '${metaSheet}'!$A:$E, 3, FALSE), "")` };
        ws.getCell('K9').value = { formula: `": " & IFERROR(VLOOKUP($T$1, '${metaSheet}'!$A:$E, 4, FALSE), "")` };
        ws.getCell('K10').value = { formula: `": " & IFERROR(VLOOKUP($T$1, '${metaSheet}'!$A:$E, 5, FALSE), "")` };
      }

      // WORK ITEMS LOOP (PATEN)
      const itemRowsCount = Math.min(ahspLines.length, 50);
      const absId = isHarian ? '$P$1' : '$T$1';
      for (let j = 1; j <= itemRowsCount; j++) {
        const r = startRow + j - 1;
        const key = `${absId} & "_" & ${j}`;
        
        // Nomor di B, Uraian di C (Tanpa Styling, biarkan template yang atur)
        ws.getCell(`B${r}`).value = { formula: `=IFERROR(VLOOKUP(${key}, '${dbName}'!$A:$J, 2, FALSE), "")` };
        ws.getCell(`C${r}`).value = { formula: `=IFERROR(VLOOKUP(${key}, '${dbName}'!$A:$J, 3, FALSE), "")` };
        
        if (isHarian) {
          // Satuan di J, Volume di K, Bobot di L (Tanpa Styling)
          ws.getCell(`J${r}`).value = { formula: `=IFERROR(VLOOKUP(${key}, '${dbName}'!$A:$J, 4, FALSE), "")` }; 
          ws.getCell(`K${r}`).value = { formula: `=IFERROR(VLOOKUP(${key}, '${dbName}'!$A:$J, 8, FALSE), "")` }; // Volume Ini
          ws.getCell(`L${r}`).value = { formula: `=IFERROR(VLOOKUP(${key}, '${dbName}'!$A:$J, 10, FALSE), "")` }; // Bobot %
        } else {
          // Mingguan/Bulanan
          ws.getCell(`J${r}`).value = { formula: `=IFERROR(VLOOKUP(${key}, '${dbName}'!$A:$J, 4, FALSE), "")` }; // Satuan
          ws.getCell(`K${r}`).value = { formula: `=IFERROR(VLOOKUP(${key}, '${dbName}'!$A:$J, 7, FALSE), "")` }; // Lalu
          ws.getCell(`L${r}`).value = { formula: `=IFERROR(VLOOKUP(${key}, '${dbName}'!$A:$J, 8, FALSE), "")` }; // Ini
          ws.getCell(`M${r}`).value = { formula: `=IFERROR(VLOOKUP(${key}, '${dbName}'!$A:$J, 9, FALSE), "")` }; // Total
          ws.getCell(`N${r}`).value = { formula: `=IFERROR(VLOOKUP(${key}, '${dbName}'!$A:$J, 10, FALSE), "")` }; // Weight %
          ws.getCell(`N${r}`).numFmt = '0.00%';
        }
      }

      // LOGO PLACEMENT & PRINT AREA (PATEN)
      if (headerImageId) {
        const logoBr = isHarian ? { col: 12, row: 1 } : { col: 16, row: 1 }; // Shifted from 13 to 12
        ws.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: logoBr, editAs: 'twoCell' });
      }

      // Print Area Dinamis
      const lastDataRow = startRow + itemRowsCount + 10; 
      const pArea = isHarian ? '$A$1:$M$72' : `$A$1:$Q$${lastDataRow}`; // Shifted from N to M
      setupPrinter(ws, companyName, pArea, paperSize, isHarian ? 'portrait' : 'landscape');
    }

    // Hide unwanted sheets
    const isSelected = selectedSheets.some(s => ws.name.toLowerCase().includes(s.toLowerCase()));
    if (!isSelected && !name.includes('DB_')) ws.state = 'veryHidden';
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
