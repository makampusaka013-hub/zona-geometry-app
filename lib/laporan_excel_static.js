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
      // Menghapus Print_Area dan Named Ranges untuk sheet yang disembunyikan guna mencegah korupsi XML
      try {
        workbook.definedNames.forEach((dn) => {
          if (dn && dn.ranges && Array.isArray(dn.ranges)) {
            const belongsToWs = dn.ranges.some(r => typeof r === 'string' && r.includes(ws.name));
            if (belongsToWs) {
              workbook.definedNames.remove(dn.name, dn.localSheetId);
            }
          }
        });
      } catch (e) { 
        console.warn('Gagal membersihkan metadata:', e); 
      }
      ws.state = 'veryHidden';
    } else {
      // --- POPULASI DATA KE SHEET LAPORAN ---
      // Kita asumsikan baris 15 adalah baris template yang memiliki formula VLOOKUP ke sheet database
      const startRow = 15;
      const templateRow = ws.getRow(startRow);

      enrichedLines.forEach((line, idx) => {
        const rowNum = startRow + idx;
        const targetRow = ws.getRow(rowNum);

        if (idx > 0) {
          // Salin style dan formula dari baris 15 ke baris di bawahnya
          targetRow.height = templateRow.height;
          templateRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const targetCell = targetRow.getCell(colNumber);
            targetCell.style = cell.style;
            if (cell.formula) {
              // ExcelJS akan menyesuaikan referensi formula jika memungkinkan
              targetCell.formula = cell.formula;
            }
          });
        }

        // Isi Kolom B (No/ID) sebagai kunci VLOOKUP
        // User menyebut B12 adalah NO, baris 15 adalah data.
        targetRow.getCell(2).value = line.id || line.master_ahsp_id;
      });

      // --- ISI HEADER METADATA (COP) ---
      // Berdasarkan screenshot: Program (B5), Kegiatan (B6), Lokasi (B9), Tahun (B10)
      // Kita coba isi range yang umum digunakan di template user
      const metaMap = {
        'B5': project.program_name || '',
        'B6': project.activity_name || '',
        'B7': project.sub_activity_name || '',
        'B8': project.work_name || project.name || '',
        'B9': project.location || '',
        'B10': project.fiscal_year || '',
        'M5': project.contractor_name || '',
        'M6': options.periodLabel || '', // Misal: "Minggu ke-1"
        'M7': options.dateRangeLabel || '', // Misal: "01 Jan - 07 Jan"
      };

      Object.entries(metaMap).forEach(([cellAddr, val]) => {
        const cell = ws.getCell(cellAddr);
        if (cell.value === null || cell.value === '' || String(cell.value).includes(':')) {
          // Jika cell ada labelnya (misal "Lokasi :"), kita coba append atau biarkan
          if (typeof cell.value === 'string' && cell.value.includes(':')) {
            cell.value = `${cell.value.split(':')[0]}: ${val}`;
          } else {
            cell.value = val;
          }
        }
      });

      // Tambahkan logo jika ada
      if (headerImageId) {
        ws.addImage(headerImageId, {
          tl: { col: 1, row: 0 },
          br: { col: 8, row: 1 },
          editAs: 'twoCell'
        });
      }
      setupPrinter(ws, companyName, null, paperSize, 'landscape');
    }
  });

  // --- PROTEKSI ANTI-CORRUPT: Pastikan ada minimal 1 sheet ---
  if (workbook.worksheets.length === 0) {
    const fallbackSheet = workbook.addWorksheet('Data Kosong');
    fallbackSheet.getCell('A1').value = 'Data Laporan kosong atau filter sheet menghapus semua data.';
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
