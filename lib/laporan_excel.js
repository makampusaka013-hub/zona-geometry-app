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
  const companyName = user?.full_name || 'ZONA GEOMETRY';
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
  
  [dbHarian, dbItems, dbWork, dbWorkMng, dbWorkBln].forEach(ws => ws.state = 'hidden');

  // Configure Columns
  dbHarian.columns = [
    { header: 'HARI_KE', key: 'hari_ke' }, { header: 'MINGGU_KE', key: 'minggu_ke' },
    { header: 'MINGGU_TEKS', key: 'minggu_teks' }, { header: 'HARI_NAMA', key: 'hari_nama' },
    { header: 'TANGGAL', key: 'tanggal' }, { header: 'CV_PT', key: 'cv_pt' },
    { header: 'SITE_ENGINEER', key: 'site_engineer' }, { header: 'MANDOR', key: 'mandor' },
    { header: 'KEPALA_TUKANG', key: 'kepala_tukang' }, { header: 'TUKANG', key: 'tukang' },
    { header: 'PEKERJA', key: 'pekerja' }, { header: 'OPERATOR', key: 'operator' },
    { header: 'PIMTEK', key: 'pimtek' }, { header: 'TL', key: 'tl' },
    { header: 'INSPECTOR', key: 'inspector' }, { header: 'DIREKSI', key: 'direksi' },
    { header: 'WEATHER_IDX', key: 'weather_idx' }, { header: 'SITUASI', key: 'situasi' },
    { header: 'WEATHER_COND', key: 'weather_cond' }
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

  const totalDays = Math.max(Number(project.duration || 30), 40);
  const totalWeeks = Math.ceil(totalDays / 7);
  const totalMonths = Math.ceil(totalDays / 30);
  const cumulativeVolumes = {};

  // POPULATE DATA
  for (let i = 1; i <= totalDays; i++) {
    const day = rawDaily[i] || {};
    const mng = Math.ceil(i / 7);
    
    dbHarian.addRow({
      hari_ke: i, minggu_ke: mng, minggu_teks: String(mng),
      hari_nama: day.dayName || '-', tanggal: day.date || '-',
      cv_pt: (project.contractor_name || companyName).toUpperCase(),
      site_engineer: project.site_engineer || '-',
      mandor: day.labor?.mandor || 0, kepala_tukang: day.labor?.kepala_tukang || 0,
      tukang: (day.labor?.tukang || 0) + (day.labor?.tukang_batu || 0),
      pekerja: day.labor?.pekerja || 0, operator: day.labor?.operator || 0,
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

  // POPULATE WEEKLY/MONTHLY (SUMMARIES)
  for (let w = 1; w <= totalWeeks; w++) {
    ahspLines.forEach((line, lIdx) => {
      let volIni = 0;
      for (let d = (w-1)*7 + 1; d <= w*7; d++) volIni += Number(rawDaily[d]?.progressMap?.[line.id] || 0);
      dbWorkMng.addRow({ key: `${w}_${lIdx+1}`, no: line.kode_ahsp, name: line.uraian, unit: line.satuan, vol_ini: volIni });
    });
  }

  // SETUP INTERACTIVE SHEETS
  const worksheets = [...workbook.worksheets];
  worksheets.forEach(ws => {
    const name = ws.name.toUpperCase();
    const isHarian = name.includes('HARIAN');
    const isMng = name.includes('MINGGUAN');
    const isBln = name.includes('BULANAN');

    if (isHarian || isMng || isBln) {
      const idCell = isHarian ? 'Q1' : 'T1';
      const startRow = isHarian ? 26 : 15;
      const dbName = isHarian ? 'db_harian_work' : (isMng ? 'db_mingguan_work' : 'db_bulanan_work');

      ws.getCell(idCell).value = 1;
      ws.getCell(idCell).font = { bold: true, color: { argb: 'FFFF0000' }, size: 24 };

      // METADATA (PATEN)
      ws.getCell('E5').value = (project.work_name || project.name || '').toUpperCase();
      ws.getCell('E6').value = project.contract_number || '-';
      ws.getCell('E7').value = (project.location || '-').toUpperCase();
      ws.getCell('E8').value = project.fiscal_year || '-';

      if (isHarian) {
        ws.getCell('L7').value = { formula: `"MINGGU KE : " & VLOOKUP($Q$1, db_harian_metadata!$A:$S, 3, FALSE)` };
        ws.getCell('L8').value = { formula: `"HARI : " & VLOOKUP($Q$1, db_harian_metadata!$A:$S, 4, FALSE)` };
        ws.getCell('L9').value = { formula: `"TANGGAL : " & VLOOKUP($Q$1, db_harian_metadata!$A:$S, 5, FALSE)` };
      }

      // WORK ITEMS LOOP (PATEN)
      for (let j = 1; j <= 50; j++) {
        const r = startRow + j - 1;
        const key = `${idCell} & "_" & ${j}`;
        ws.getCell(`B${r}`).value = { formula: `IFERROR(VLOOKUP(${key}, ${dbName}!$A:$J, 2, FALSE), "")` };
        ws.getCell(`C${r}`).value = { formula: `IFERROR(VLOOKUP(${key}, ${dbName}!$A:$J, 3, FALSE), "")` };
        ws.getCell(`J${r}`).value = { formula: `IFERROR(VLOOKUP(${key}, ${dbName}!$A:$J, 4, FALSE), "")` };
        
        const colVal = isHarian ? 8 : 8; // Column Ini
        ws.getCell(`K${r}`).value = { formula: `IFERROR(VLOOKUP(${key}, ${dbName}!$A:$J, ${colVal}, FALSE), "")` };
      }

      if (headerImageId) ws.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
      setupPrinter(ws, companyName, null, paperSize, isHarian ? 'portrait' : 'landscape');
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
