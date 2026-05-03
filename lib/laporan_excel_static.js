const ExcelJS = require('exceljs');
const {
  romanize, formatIdr, cleanStr, formatTerbilang,
  clearDataRows, applyBorder, setupPrinter
} = require('./excel_utils');

/**
 * generateLaporanReport
 * Menangani ekspor Laporan Harian, Mingguan, dan Bulanan.
 * Mengisi sheet 'database' untuk mendukung VLOOKUP di template.
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
  // 1. Isi Sheet Database
  // ==========================================
  const wsDb = workbook.getWorksheet('database') || workbook.getWorksheet('DATABASE') || workbook.getWorksheet('Database');
  if (wsDb) {
    // Reset sheet database
    wsDb.eachRow((row) => { row.eachCell((cell) => { cell.value = null; cell.border = {}; cell.fill = {}; }); });

    // Header Master Items
    const masterHeaders = [
      'ID_ITEM', 'BAB', 'KODE', 'URAIAN', 'SATUAN',
      'VOL_KONTRAK', 'HARGA_SATUAN', 'TOTAL_KONTRAK', 'BOBOT_KONTRAK',
      'VOL_LALU', 'BOBOT_LALU',
      'VOL_INI', 'BOBOT_INI',
      'VOL_TOTAL', 'BOBOT_TOTAL', 'BOBOT_TERTIMBANG'
    ];
    wsDb.getRow(1).values = masterHeaders;
    wsDb.getRow(1).font = { bold: true };
    wsDb.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'CBD5E1' } };

    // Group progress by item and period
    const startD = options.startDate ? new Date(options.startDate) : null;
    const endD = options.endDate ? new Date(options.endDate) : null;

    const progSummary = {};
    if (Array.isArray(options.progressData)) {
      options.progressData.forEach(p => {
        const id = p.line_id || p.entity_id || p.ahsp_id;
        if (!progSummary[id]) progSummary[id] = { lalu: 0, ini: 0, total: 0 };
        const pDate = new Date(p.date || p.created_at);
        const val = Number(p.value || p.val || p.volume || 0);

        if (startD && pDate < startD) {
          progSummary[id].lalu += val;
        } else if (startD && endD && pDate >= startD && pDate <= endD) {
          progSummary[id].ini += val;
        } else if (!startD) {
          progSummary[id].ini += val;
        }
        progSummary[id].total += val;
      });
    }

    let totalProjectPrice = 0;
    enrichedLines.forEach(l => { totalProjectPrice += (Number(l.volume || 0) * Number(l.harga_satuan || l.total_subtotal || 0)); });

    let dbRow = 2;
    enrichedLines.forEach(l => {
      const id = l.id || l.master_ahsp_id;
      const itemPrice = Number(l.harga_satuan || l.total_subtotal || 0);
      const totalKontrak = Number(l.volume || 0) * itemPrice;
      const bobotKontrak = totalProjectPrice > 0 ? (totalKontrak / totalProjectPrice) : 0;

      const ps = progSummary[id] || { lalu: 0, ini: 0, total: 0 };
      const bobotLalu = totalProjectPrice > 0 ? (ps.lalu * itemPrice / totalProjectPrice) : 0;
      const bobotIni = totalProjectPrice > 0 ? (ps.ini * itemPrice / totalProjectPrice) : 0;
      const bobotTotal = totalProjectPrice > 0 ? (ps.total * itemPrice / totalProjectPrice) : 0;
      const bobotTertimbang = bobotTotal; // Sesuai permintaan: P12 bobot tertimbang

      wsDb.getRow(dbRow).values = [
        id,
        (l.bab_pekerjaan || '').toUpperCase(),
        l.kode_ahsp || l.master_ahsp?.kode_ahsp || '',
        l.uraian || l.nama_pekerjaan || '',
        l.satuan || l.satuan_pekerjaan || '',
        Number(l.volume || 0),
        itemPrice,
        totalKontrak,
        bobotKontrak,
        ps.lalu,
        bobotLalu,
        ps.ini,
        bobotIni,
        ps.total,
        bobotTotal,
        bobotTertimbang
      ];

      // Format bobot ke persen
      ['I', 'K', 'M', 'O', 'P'].forEach(col => {
        wsDb.getCell(`${col}${dbRow}`).numFmt = '0.00%';
      });
      dbRow++;
    });

    // Metadata Proyek (Kolom R ke kanan) untuk COP
    wsDb.getCell('R1').value = 'METADATA_KEY';
    wsDb.getCell('S1').value = 'METADATA_VALUE';
    const meta = [
      ['NAMA_PROYEK', project.work_name || project.name || ''],
      ['LOKASI', project.location || ''],
      ['TAHUN_ANGGARAN', project.fiscal_year || ''],
      ['TANGGAL_MULAI', options.startDate || ''],
      ['TANGGAL_SELESAI', options.endDate || ''],
      ['KONTRAKTOR', project.contractor_name || ''],
      ['KONSULTAN', project.konsultan_name || ''],
      ['DIREKTUR_KONTRAKTOR', project.kontraktor_director || ''],
      ['PENGAWAS_KONSULTAN', project.konsultan_supervisor || ''],
      ['NIP_DIREKTUR', project.kontraktor_director_nip || ''],
      ['NIP_PENGAWAS', project.konsultan_supervisor_nip || ''],
      ['JUDUL_LAPORAN', `LAPORAN ${selectedSheets[0]?.toUpperCase() || 'PROYEK'}`]
    ];
    meta.forEach((m, idx) => {
      wsDb.getCell(`R${idx + 2}`).value = m[0];
      wsDb.getCell(`S${idx + 2}`).value = m[1];
    });

    // Sembunyikan sheet database
    wsDb.state = 'veryHidden';
  }

  // ==========================================
  // 2. Filter Worksheets
  // ==========================================
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
    const isSelected = (selectedSheetNames || []).some(name => name && lowName === name.toLowerCase());

    // Proteksi database
    if (lowName === 'database') return;

    if (!isSelected) {
      ws.state = 'veryHidden';
    } else {
      const type = ws.name.toLowerCase();
      
      // --- ISI HEADER METADATA (COP) ---
      const metaMap = {
        'B5': project.program_name || '',
        'B6': project.activity_name || '',
        'B7': project.sub_activity_name || '',
        'B8': project.work_name || project.name || '',
        'B9': project.location || '',
        'B10': project.fiscal_year || '',
        'M4': project.contractor_name || '',
        'M5': project.kontraktor_director || '',
        'M6': options.startDate || '',
        'M7': options.endDate || '',
      };

      Object.entries(metaMap).forEach(([addr, val]) => {
        const cell = ws.getCell(addr);
        if (cell.value && String(cell.value).includes(':')) {
          cell.value = `${cell.value.split(':')[0]}: ${val}`;
        } else {
          cell.value = val;
        }
      });

      if (type.includes('harian')) {
        // ==========================================
        // LAPORAN HARIAN (FIXED GRID A1:N71)
        // ==========================================
        const targetDay = options.startDate;
        
        // 1. Weather Data (Row 63)
        const dayReport = (options.dailyReports || []).find(r => r.report_date === targetDay);
        if (dayReport) {
          const weatherLabels = { 1: 'Cerah', 2: 'Berawan', 3: 'Gerimis', 4: 'Hujan', 5: 'Badai' };
          ws.getCell('B63').value = `Index Cuaca: ${weatherLabels[dayReport.weather_index] || 'Cerah'}`;
          ws.getCell('F63').value = `Keterangan: ${dayReport.weather_description || '-'}`;
        }

        // 2. Resources (Tenaga, Bahan, Alat)
        // Map types to specific rows/columns based on template inspection
        const progDaily = (options.progressData || []).filter(p => p.day_number === Math.round((new Date(targetDay) - new Date(project.start_date)) / (1000*60*60*24)) + 1);
        
        // Tenaga (Rows 13-18, Col F)
        const tenagaMap = { 'mandor': 13, 'kepala tukang': 14, 'tukang': 15, 'pekerja': 16, 'operator': 17, 'pimtek': 18 };
        progDaily.forEach(p => {
          if (p.entity_type === 'resource' || p.entity_type === 'custom_labor') {
            const name = (p.entity_name || '').toLowerCase();
            const row = tenagaMap[Object.keys(tenagaMap).find(k => name.includes(k))];
            if (row) ws.getCell(`F${row}`).value = (ws.getCell(`F${row}`).value || 0) + Number(p.val);
          }
        });

        // Bahan (G13-J22) & Alat (K13-M22)
        let bahanRow = 13;
        let alatRow = 13;
        progDaily.forEach(p => {
          if (p.entity_type === 'resource' && p.val > 0) {
            const res = (options.resources || []).find(r => (r.kode_item || r.uraian) === p.entity_key);
            if (res?.jenis === 'bahan' && bahanRow <= 22) {
              ws.getCell(`G${bahanRow}`).value = res.uraian;
              ws.getCell(`I${bahanRow}`).value = p.val;
              ws.getCell(`J${bahanRow}`).value = res.satuan;
              bahanRow++;
            } else if (res?.jenis === 'alat' && alatRow <= 22) {
              ws.getCell(`K${alatRow}`).value = res.uraian;
              ws.getCell(`M${alatRow}`).value = p.val;
              alatRow++;
            }
          }
        });

        // 3. Work Items (Row 26 onwards)
        let workRow = 26;
        const totalProjectPrice = ahspLines.reduce((acc, l) => acc + (Number(l.volume || 0) * Number(l.harga_satuan || 0)), 0);
        
        enrichedLines.forEach((line, idx) => {
          const p = progDaily.find(pd => pd.entity_id === line.id);
          if (p && p.val > 0 && workRow <= 48) {
            ws.getCell(`B${workRow}`).value = idx + 1;
            ws.getCell(`C${workRow}`).value = line.uraian;
            ws.getCell(`J${workRow}`).value = line.satuan;
            ws.getCell(`K${workRow}`).value = p.val;
            
            const bobot = totalProjectPrice > 0 ? (p.val * Number(line.harga_satuan) / totalProjectPrice) : 0;
            ws.getCell(`M${workRow}`).value = bobot;
            ws.getCell(`M${workRow}`).numFmt = '0.00%';
            workRow++;
          }
        });

        // 4. Dibuat Oleh (Row 49, Col K)
        ws.getCell('K49').value = companyName;

        setupPrinter(ws, companyName, 'A1:N71', paperSize, 'portrait');
      } 
      else if (type.includes('mingguan') || type.includes('bulanan')) {
        // ==========================================
        // LAPORAN MINGGUAN / BULANAN
        // ==========================================
        const startRow = 15;
        const totalProjectPrice = ahspLines.reduce((acc, l) => acc + (Number(l.volume || 0) * Number(l.harga_satuan || 0)), 0);
        
        const summaryProgress = {}; 
        const sD = new Date(options.startDate);
        const eD = new Date(options.endDate);

        (options.progressData || []).forEach(p => {
          const id = p.entity_id;
          if (!id) return;
          if (!summaryProgress[id]) summaryProgress[id] = { lalu: 0, ini: 0, total: 0 };
          
          const d = new Date(project.start_date);
          d.setDate(d.getDate() + (p.day_number - 1));
          
          const val = Number(p.val || 0);
          if (d < sD) summaryProgress[id].lalu += val;
          else if (d >= sD && d <= eD) summaryProgress[id].ini += val;
          summaryProgress[id].total += val;
        });

        enrichedLines.forEach((line, idx) => {
          const rowNum = startRow + idx;
          const sp = summaryProgress[line.id] || { lalu: 0, ini: 0, total: 0 };
          const itemPrice = Number(line.harga_satuan || 0);

          ws.getCell(`B${rowNum}`).value = idx + 1;
          ws.getCell(`C${rowNum}`).value = line.uraian;
          ws.getCell(`F${rowNum}`).value = itemPrice;
          ws.getCell(`G${rowNum}`).value = Number(line.volume);
          ws.getCell(`H${rowNum}`).value = Number(line.volume) * itemPrice;
          
          const bobotKontrak = totalProjectPrice > 0 ? (Number(line.volume) * itemPrice / totalProjectPrice) : 0;
          ws.getCell(`I${rowNum}`).value = bobotKontrak;

          ws.getCell(`J${rowNum}`).value = sp.lalu;
          ws.getCell(`K${rowNum}`).value = totalProjectPrice > 0 ? (sp.lalu * itemPrice / totalProjectPrice) : 0;
          
          ws.getCell(`L${rowNum}`).value = sp.ini;
          ws.getCell(`M${rowNum}`).value = totalProjectPrice > 0 ? (sp.ini * itemPrice / totalProjectPrice) : 0;
          
          ws.getCell(`N${rowNum}`).value = sp.total;

          // Formats
          ['F', 'H'].forEach(c => ws.getCell(`${c}${rowNum}`).numFmt = '#,##0.00');
          ['I', 'K', 'M'].forEach(c => ws.getCell(`${c}${rowNum}`).numFmt = '0.00%');
        });

        setupPrinter(ws, companyName, null, paperSize, 'landscape');
      }

      if (headerImageId) {
        ws.addImage(headerImageId, { tl: { col: 1, row: 0 }, br: { col: 8, row: 1 }, editAs: 'twoCell' });
      }
    }
  });

  // --- PROTEKSI ANTI-CORRUPT: Pastikan ada minimal 1 sheet ---
  if (workbook.worksheets.length === 0) {
    const fallbackSheet = workbook.addWorksheet('Data Kosong');
    fallbackSheet.getCell('A1').value = 'Data Laporan kosong atau filter sheet menghapus semua data.';
  }
  // --- FIX CORRUPT EXCELJS: Bersihkan Named Ranges & Print Area yang tertinggal ---
  if (workbook.definedNames && workbook.definedNames.model) {
    workbook.definedNames.model = workbook.definedNames.model.filter(def => {
      // Buang semua Print_Area dan Print_Titles bawaan template/sheet lama yang nyangkut
      if (def.name === '_xlnm.Print_Area' || def.name === '_xlnm.Print_Titles') {
        return false;
      }
      // Buang juga range yang sudah rusak/hilang (biasanya mengandung #REF! setelah sheet dihapus)
      if (def.ranges && def.ranges.some(r => r.includes('#REF!'))) {
        return false;
      }
      return true;
    });
  }

  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  // --- SANITASI NAMA FILE ---
  const rawFileName = options.fileName || `Laporan_${project.name || 'Export'}`;
  const safeName = rawFileName
    .replace('.xlsx', '')
    .replace(/[^a-zA-Z0-9 \-_]/g, '')
    .trim();
  a.download = `${safeName}.xlsx`;

  document.body.appendChild(a);
  a.click();
  
  // --- FIX: Jeda agar browser sempat membaca metadata ---
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
};

export { generateLaporanReport };
